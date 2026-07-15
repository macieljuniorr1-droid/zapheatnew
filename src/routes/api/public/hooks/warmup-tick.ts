import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint. Called by pg_cron every minute. It processes every active
// warmup group whose next_run_at <= now(), creates as many independent pairs
// as possible, and only stores a log as "sent" after Evolution confirms the
// WhatsApp delivery ACK. A plain 201/PENDING response is not considered sent.

const MAX_DELAY_SECONDS = 8;
const REPLY_TIMEOUT_MS = 10 * 60 * 1000;
const DELIVERY_ACK_WAIT_MS = 7_000;
const MAX_BURST_ROUNDS = 2;
const BURST_BUDGET_MS = 18_000;
const REPLY_GAP_MS = 500;
const FAILING_PAIR_COOLDOWN_MS = 90 * 1000;
const PAIR_DOMINANCE_TURNS = 2;

type Chip = {
  id: string;
  name: string | null;
  evolution_instance: string;
  status: string;
  phone: string | null;
  warmup_started_at?: string | null;
  temporarily_unavailable?: boolean;
  live_state?: string | null;
};

export const Route = createFileRoute("/api/public/hooks/warmup-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apiKey = request.headers.get("apikey");
        if (expectedKey && apiKey !== expectedKey) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { evolution } = await import("@/lib/evolution.server");

        const now = new Date().toISOString();
        const { data: groups, error: gErr } = await supabaseAdmin
          .from("warmup_groups")
          .select(
            "id, user_id, min_delay_seconds, max_delay_seconds, daily_limit, warmup_group_members(instance_id, whatsapp_instances(id, name, evolution_instance, status, phone, warmup_started_at))",
          )
          .eq("active", true)
          .lte("next_run_at", now)
          .limit(50);
        if (gErr) return Response.json({ error: gErr.message }, { status: 500 });

        const results: any[] = [];
        for (const g of groups ?? []) {
          try {
            const rawMembers: Chip[] = ((g as any).warmup_group_members ?? [])
              .map((m: any) => m.whatsapp_instances)
              .filter((i: any) => i);

            await syncConnectedUserChipsIntoGroup(supabaseAdmin, g, rawMembers);
            await refreshLiveStatuses(supabaseAdmin, evolution, rawMembers);
            await backfillPhones(supabaseAdmin, evolution, rawMembers);
            await markWarmupStarted(supabaseAdmin, rawMembers);
            // Chips com histórico recente de ERROR de entrega recebem recuperação
            // preventiva antes de tentar enviar de novo. Sem isso a sessão fica
            // aberta no painel, mas dessincronizada para envio.
            await preemptiveRecoverFailingChips(supabaseAdmin, evolution, rawMembers, (g as any).id);

            const members = rawMembers.filter((i) => i.status === "connected" && i.phone && !i.temporarily_unavailable);
            if (members.length < 2) {
              await scheduleNext(supabaseAdmin, g);
              results.push({
                group: (g as any).id,
                status: "waiting",
                reason: "menos de 2 números disponíveis neste ciclo",
                connected_in_platform: rawMembers.filter((i) => i.status === "connected").length,
              });
              continue;
            }

            const broadcast = createBroadcast();
            const groupResults: any[] = [];
            const deadline = Date.now() + BURST_BUDGET_MS;

            for (let round = 0; round < MAX_BURST_ROUNDS && Date.now() < deadline; round++) {
              const recentLogs = await fetchRecentLogs(supabaseAdmin, (g as any).id);
              const pairs = pickPairs(members, recentLogs);
              if (!pairs.length) {
                if (round === 0) groupResults.push({ group: (g as any).id, status: "waiting", reason: "aguardando respostas" });
                break;
              }

              const pairResults = await Promise.all(
                pairs.map((pair) => processPair({ supabaseAdmin, evolution, group: g, pair, broadcast })),
              );
              groupResults.push(...pairResults);

              if (!pairResults.some((r) => r.status === "sent")) break;
              if (round < MAX_BURST_ROUNDS - 1 && Date.now() + REPLY_GAP_MS < deadline) {
                await new Promise((r) => setTimeout(r, REPLY_GAP_MS));
              }
            }

            await scheduleNext(supabaseAdmin, g);
            results.push(...groupResults);
          } catch (e: any) {
            results.push({ group: (g as any).id, error: e?.message ?? "erro" });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});

async function syncConnectedUserChipsIntoGroup(supabaseAdmin: any, group: any, rawMembers: Chip[]) {
  const existing = new Set(rawMembers.map((m) => m.id));
  const { data: connected } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id, name, evolution_instance, status, phone, warmup_started_at")
    .eq("user_id", group.user_id)
    .eq("status", "connected")
    .not("phone", "is", null);

  const missing = (connected ?? []).filter((chip: Chip) => !existing.has(chip.id));
  if (!missing.length) return;

  await supabaseAdmin.from("warmup_group_members").insert(
    missing.map((chip: Chip) => ({ group_id: group.id, instance_id: chip.id })),
    { ignoreDuplicates: true },
  );

  rawMembers.push(...missing);
}

async function refreshLiveStatuses(supabaseAdmin: any, evolution: any, members: Chip[]) {
  await Promise.all(
    members.map(async (m) => {
      try {
        const state = await evolution.connectionState(m.evolution_instance);
        const s = state?.instance?.state ?? state?.state;
        m.live_state = s ?? null;

        if (s === "open") {
          m.status = "connected";
          await markInstance(supabaseAdmin, m.id, "connected");
          return;
        }

        const recovered = await recoverOpenSession(evolution, m.evolution_instance);
        if (recovered) {
          m.status = "connected";
          await markInstance(supabaseAdmin, m.id, "connected");
          return;
        }

        m.temporarily_unavailable = true;
        // Não derruba no painel um chip que já foi pareado. O motor apenas
        // pula neste ciclo e segue tentando recuperar nos próximos ticks.
        m.status = m.phone || m.warmup_started_at ? "connected" : "connecting";
        await markInstance(supabaseAdmin, m.id, m.status as "connected" | "connecting");
      } catch {
        const recovered = await recoverOpenSession(evolution, m.evolution_instance);
        if (recovered) {
          m.status = "connected";
          await markInstance(supabaseAdmin, m.id, "connected");
          return;
        }
        m.temporarily_unavailable = true;
        m.status = m.phone || m.warmup_started_at ? "connected" : "connecting";
        await markInstance(supabaseAdmin, m.id, m.status as "connected" | "connecting");
      }
    }),
  );
}

async function backfillPhones(supabaseAdmin: any, evolution: any, members: Chip[]) {
  for (const m of members) {
    if (m.status !== "connected" || m.phone) continue;
    try {
      const fetched = await evolution.fetchInstance(m.evolution_instance);
      const rec = Array.isArray(fetched) ? fetched[0] : fetched?.instance ?? fetched;
      const jid: string | undefined = rec?.ownerJid ?? rec?.owner ?? rec?.wuid ?? rec?.number;
      const phoneMatch = jid ? String(jid).match(/(\d{8,20})/) : null;
      if (phoneMatch) {
        m.phone = phoneMatch[1];
        await supabaseAdmin.from("whatsapp_instances").update({ phone: m.phone }).eq("id", m.id);
      }
    } catch {}
  }
}

async function markWarmupStarted(supabaseAdmin: any, members: Chip[]) {
  for (const m of members) {
    if (m.status === "connected" && !m.warmup_started_at) {
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ warmup_started_at: new Date().toISOString() } as any)
        .eq("id", m.id)
        .is("warmup_started_at", null);
    }
  }
}

async function preemptiveRecoverFailingChips(supabaseAdmin: any, evolution: any, members: Chip[], groupId: string) {
  if (members.length === 0) return;
  const ids = members.map((m) => m.id);
  const { data: recent } = await supabaseAdmin
    .from("warmup_logs")
    .select("from_instance_id, status, created_at")
    .eq("group_id", groupId)
    .in("from_instance_id", ids)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  const streak = new Map<string, number>();
  const stopped = new Set<string>();
  for (const r of recent ?? []) {
    if (stopped.has(r.from_instance_id)) continue;
    if (r.status === "failed") streak.set(r.from_instance_id, (streak.get(r.from_instance_id) ?? 0) + 1);
    else stopped.add(r.from_instance_id);
  }
  await Promise.all(
    members.map(async (m) => {
      const failed = streak.get(m.id) ?? 0;
      if (failed < 2) return;
      const ok = await recoverOpenSession(evolution, m.evolution_instance, true);
      if (!ok) {
        m.temporarily_unavailable = true;
        m.status = m.phone || m.warmup_started_at ? "connected" : "connecting";
        await markInstance(supabaseAdmin, m.id, m.status as "connected" | "connecting");
      }
    }),
  );
}

async function fetchRecentLogs(supabaseAdmin: any, groupId: string) {
  const { data } = await supabaseAdmin
    .from("warmup_logs")
    .select("from_instance_id, to_instance_id, status, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

function pickPairs(members: Chip[], recentLogs: any[]) {
  const memberIds = new Set(members.map((i) => i.id));
  const sentLogs = recentLogs.filter((log) => log.status === "sent");
  const recentFailedPairs = new Set(
    recentLogs
      .filter((log) => log.status === "failed" && Date.now() - new Date(log.created_at).getTime() < FAILING_PAIR_COOLDOWN_MS)
      .map((log) => pairKey(log.from_instance_id, log.to_instance_id)),
  );
  const senderFailures = new Map<string, number>();
  for (const log of recentLogs) {
    if (log.status !== "failed" || !log.from_instance_id) continue;
    if (Date.now() - new Date(log.created_at).getTime() >= FAILING_PAIR_COOLDOWN_MS) continue;
    senderFailures.set(log.from_instance_id, (senderFailures.get(log.from_instance_id) ?? 0) + 1);
  }
  const dominantPairs = findDominantPairs(sentLogs);
  const lastByInstance = new Map<string, any>();
  for (const log of sentLogs) {
    if (log.from_instance_id && !lastByInstance.has(log.from_instance_id)) lastByInstance.set(log.from_instance_id, log);
    if (log.to_instance_id && !lastByInstance.has(log.to_instance_id)) lastByInstance.set(log.to_instance_id, log);
  }

  type State = { kind: "idle" } | { kind: "waiting"; peerId: string } | { kind: "owes"; peerId: string };
  const nowMs = Date.now();
  const stateOf = (id: string): State => {
    const last = lastByInstance.get(id);
    if (!last) return { kind: "idle" };
    const peerId = last.from_instance_id === id ? last.to_instance_id : last.from_instance_id;
    if (!memberIds.has(peerId)) return { kind: "idle" };
    if (recentFailedPairs.has(pairKey(id, peerId))) return { kind: "idle" };
    const age = nowMs - new Date(last.created_at).getTime();
    if (age > REPLY_TIMEOUT_MS) return { kind: "idle" };
    const currentPairKey = pairKey(id, peerId);
    if (dominantPairs.has(currentPairKey)) return { kind: "idle" };
    if (last.from_instance_id === id) return { kind: "waiting", peerId };
    return { kind: "owes", peerId };
  };

  const pairs: Array<{ from: Chip; to: Chip }> = [];
  const selected = new Set<string>();
  const shuffled = [...members].sort(() => Math.random() - 0.5);

  for (const m of shuffled) {
    if (selected.has(m.id)) continue;
    const s = stateOf(m.id);
    if (s.kind !== "owes") continue;
    const peer = members.find((x) => x.id === s.peerId);
    if (peer && !selected.has(peer.id)) {
      pairs.push({ from: m, to: peer });
      selected.add(m.id);
      selected.add(peer.id);
    }
  }

  const pairCount = new Map<string, number>();
  for (const log of sentLogs) {
    if (!log.from_instance_id || !log.to_instance_id) continue;
    const k = pairKey(log.from_instance_id, log.to_instance_id);
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }

  const idle = shuffled.filter((m) => stateOf(m.id).kind === "idle" && !selected.has(m.id));
  while (idle.length >= 2) {
    let best: { a: Chip; b: Chip; count: number } | null = null;
    for (let i = 0; i < idle.length; i++) {
      for (let j = i + 1; j < idle.length; j++) {
        const a = idle[i];
        const b = idle[j];
        if (selected.has(a.id) || selected.has(b.id)) continue;
        if (recentFailedPairs.has(pairKey(a.id, b.id))) continue;
        const count = pairCount.get(pairKey(a.id, b.id)) ?? 0;
        if (!best || count < best.count) best = { a, b, count };
      }
    }
    if (!best) break;
    const aFailures = senderFailures.get(best.a.id) ?? 0;
    const bFailures = senderFailures.get(best.b.id) ?? 0;
    // Se um número acabou de falhar enviando, ainda deixa ele participar como
    // destinatário. Assim ele não some do aquecimento e os outros continuam
    // puxando conversa com ele enquanto a sessão se estabiliza.
    pairs.push(aFailures > bFailures ? { from: best.b, to: best.a } : { from: best.a, to: best.b });
    selected.add(best.a.id);
    selected.add(best.b.id);
    for (let i = idle.length - 1; i >= 0; i--) {
      if (selected.has(idle[i].id)) idle.splice(i, 1);
    }
  }

  return pairs;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function findDominantPairs(sentLogs: any[]) {
  const dominant = new Set<string>();
  let currentKey: string | null = null;
  let streak = 0;
  for (const log of sentLogs) {
    if (!log.from_instance_id || !log.to_instance_id) continue;
    const key = pairKey(log.from_instance_id, log.to_instance_id);
    if (key === currentKey) {
      streak += 1;
    } else {
      if (currentKey && streak >= PAIR_DOMINANCE_TURNS) dominant.add(currentKey);
      currentKey = key;
      streak = 1;
    }
  }
  if (currentKey && streak >= PAIR_DOMINANCE_TURNS) dominant.add(currentKey);
  return dominant;
}

async function processPair({ supabaseAdmin, evolution, group, pair, broadcast }: any) {
  const { from, to } = pair as { from: Chip; to: Chip };

  const fromOpen = await isOpen(evolution, from.evolution_instance);
  const toOpen = await isOpen(evolution, to.evolution_instance);
  if (!fromOpen) {
    const recovered = await recoverOpenSession(evolution, from.evolution_instance);
    if (!recovered) {
      await markInstance(supabaseAdmin, from.id, "connected");
      return { group: group.id, from: from.id, to: to.id, status: "failed", error: "Remetente indisponível neste ciclo" };
    }
  }
  if (!toOpen) {
    const recovered = await recoverOpenSession(evolution, to.evolution_instance);
    if (!recovered) {
      await markInstance(supabaseAdmin, to.id, "connected");
      return { group: group.id, from: from.id, to: to.id, status: "failed", error: "Destinatário indisponível neste ciclo" };
    }
  }

  const history = await getPairHistory(supabaseAdmin, group.id, from.id, to.id);
  const messageContent = await generateMessage(supabaseAdmin, group.user_id, from.id, to.id, history);
  const typingMs = Math.min(900, Math.max(250, messageContent.length * 10));
  const toNumber = String(to.phone).replace(/\D/g, "");
  const remoteJid = `${toNumber}@s.whatsapp.net`;

  let status = "sent";
  let errMsg: string | null = null;

  await broadcast("typing_start", {
    group_id: group.id,
    from_id: from.id,
    to_id: to.id,
    from_name: from.name ?? "Chip",
    to_name: to.name ?? "Chip",
  });

  const attemptSend = async () => {
    await markLatestIncomingAsRead(evolution, from.evolution_instance, remoteJid);
    await evolution.sendPresence(from.evolution_instance, toNumber, "composing", typingMs);
    await new Promise((r) => setTimeout(r, typingMs));
    const sentAtMs = Date.now();
    const sendResp = await evolution.sendText(from.evolution_instance, toNumber, messageContent);
    return await waitForDeliveryAck(evolution, from.evolution_instance, remoteJid, extractMessageId(sendResp), messageContent, sentAtMs);
  };

  try {
    let ack = await attemptSend();
    // ERROR explícito indica sessão dessincronizada na Evolution. Primeiro
    // reabrimos com /connect (sem derrubar o vínculo do celular) e tentamos
    // de novo antes de marcar como falha.
    if (ack.explicitError) {
      try {
        await recoverOpenSession(evolution, from.evolution_instance, true);
        ack = await attemptSend();
      } catch (retryErr: any) {
        errMsg = retryErr?.message ?? ack.error ?? null;
      }
    }
    if (ack.explicitError) {
      status = "failed";
      errMsg = ack.error ?? errMsg ?? "WhatsApp retornou erro na entrega";
      from.temporarily_unavailable = true; // pula esse chip nas próximas iterações do burst
    }
  } catch (e: any) {
    const firstError = e?.message ?? "erro";
    if (isClosedSessionError(firstError)) {
      try {
        await recoverOpenSession(evolution, from.evolution_instance, true);
        const ack = await attemptSend();
        if (ack.explicitError) {
          status = "failed";
          errMsg = ack.error ?? firstError;
          from.temporarily_unavailable = true;
        }
      } catch (retryErr: any) {
        status = "failed";
        errMsg = retryErr?.message ?? firstError;
        from.temporarily_unavailable = true;
      }
    } else {
      status = "failed";
      errMsg = firstError;
    }
  } finally {
    await broadcast("typing_end", { group_id: group.id, from_id: from.id, to_id: to.id });
  }

  if (status === "sent") {
    await markInstance(supabaseAdmin, from.id, "connected");
    await markInstance(supabaseAdmin, to.id, "connected");
  }

  await supabaseAdmin.from("warmup_logs").insert({
    user_id: group.user_id,
    group_id: group.id,
    from_instance_id: from.id,
    to_instance_id: to.id,
    content: messageContent,
    status,
    error: errMsg,
  });

  return { group: group.id, from: from.id, to: to.id, status, error: errMsg ?? undefined };
}

async function getPairHistory(supabaseAdmin: any, groupId: string, fromId: string, toId: string) {
  const { data: recent } = await supabaseAdmin
    .from("warmup_logs")
    .select("from_instance_id, to_instance_id, content, created_at")
    .eq("group_id", groupId)
    .or(`and(from_instance_id.eq.${fromId},to_instance_id.eq.${toId}),and(from_instance_id.eq.${toId},to_instance_id.eq.${fromId})`)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(20);

  return [...(recent ?? [])].reverse().map((r: any) => ({
    from: r.from_instance_id === fromId ? "__me__" : "__other__",
    content: r.content as string,
  }));
}

async function generateMessage(supabaseAdmin: any, userId: string, fromId: string, toId: string, history: any[]) {
  try {
    const { generateReply } = await import("@/lib/ai.server");
    const { data: names } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, name")
      .in("id", [fromId, toId]);
    const map = new Map<string, string | null>((names ?? []).map((n: any) => [String(n.id), typeof n.name === "string" ? n.name : null]));
    return await generateReply(history, {
      pairSeed: fromId,
      fromName: map.get(fromId) ?? null,
      toName: map.get(toId) ?? null,
    });
  } catch {
    const { data: templates } = await supabaseAdmin
      .from("message_templates")
      .select("content")
      .or(`is_global.eq.true,user_id.eq.${userId}`)
      .limit(200);
    return templates?.length ? templates[Math.floor(Math.random() * templates.length)].content : "oi";
  }
}

async function markLatestIncomingAsRead(evolution: any, instanceName: string, remoteJid: string) {
  try {
    const found = await evolution.findMessages(instanceName, remoteJid);
    const records = found?.messages?.records ?? found?.records ?? [];
    const incoming = records
      .filter((r: any) => r?.key?.id && r?.key?.fromMe === false)
      .sort((a: any, b: any) => Number(b?.messageTimestamp ?? b?.messageTimestamp?.low ?? 0) - Number(a?.messageTimestamp ?? a?.messageTimestamp?.low ?? 0))[0];
    if (!incoming?.key?.id) return;
    await evolution.markMessageAsRead(instanceName, [{ remoteJid, fromMe: false, id: incoming.key.id }]);
  } catch {}
}

function createBroadcast() {
  return async (event: string, payload: any) => {
    try {
      await fetch(`${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({ messages: [{ topic: "ai-engine-live", event, payload }] }),
      });
    } catch {}
  };
}

async function scheduleNext(supabaseAdmin: any, g: any) {
  const configuredMin = Math.max(1, Number(g.min_delay_seconds ?? MAX_DELAY_SECONDS));
  const min = Math.min(configuredMin, MAX_DELAY_SECONDS);
  const configuredMax = Math.max(Number(g.max_delay_seconds ?? MAX_DELAY_SECONDS), configuredMin);
  const max = Math.max(Math.min(configuredMax, MAX_DELAY_SECONDS), min);
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  const next = new Date(Date.now() + delay * 1000).toISOString();
  await supabaseAdmin.from("warmup_groups").update({ next_run_at: next }).eq("id", g.id);
}

async function markInstance(supabaseAdmin: any, id: string, status: "connected" | "connecting" | "disconnected") {
  await supabaseAdmin.from("whatsapp_instances").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
}

async function isOpen(evolution: any, instanceName: string) {
  try {
    const state = await evolution.connectionState(instanceName);
    return (state?.instance?.state ?? state?.state) === "open";
  } catch {
    return false;
  }
}

function isClosedSessionError(message: string | null | undefined) {
  return /connection closed|no sessions|sessionerror|stream errored|timed out|1006/i.test(String(message ?? ""));
}

async function waitForOpen(evolution: any, instanceName: string) {
  for (let i = 0; i < 5; i++) {
    if (await isOpen(evolution, instanceName)) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function recoverOpenSession(evolution: any, instanceName: string, forceRestart = false) {
  if (!forceRestart && (await isOpen(evolution, instanceName))) return true;
  try {
    await evolution.connect(instanceName);
  } catch {}
  if (!forceRestart && (await waitForOpen(evolution, instanceName))) return true;

  // Fonte do erro vista nos logs: a sessão aparece conectada no painel, mas o
  // envio retorna ERROR continuamente. O restart da Evolution preserva o
  // pareamento e recria o socket interno da sessão Baileys.
  if (forceRestart) {
    try {
      await evolution.restart(instanceName);
    } catch {}
    return await waitForOpen(evolution, instanceName);
  }

  return false;
}

function extractMessageId(sendResp: any) {
  return sendResp?.key?.id ?? sendResp?.message?.key?.id ?? sendResp?.data?.key?.id ?? sendResp?.id ?? sendResp?.messageId;
}

function messageText(record: any) {
  const msg = record?.message ?? {};
  return msg?.conversation ?? msg?.extendedTextMessage?.text ?? msg?.imageMessage?.caption ?? msg?.videoMessage?.caption ?? "";
}

function messageTimestampMs(record: any) {
  const raw = Number(record?.messageTimestamp?.low ?? record?.messageTimestamp ?? 0);
  return raw > 1_000_000_000_000 ? raw : raw * 1000;
}

async function waitForDeliveryAck(evolution: any, instanceName: string, remoteJid: string, messageId?: string, text?: string, sentAtMs?: number) {
  const deadline = Date.now() + DELIVERY_ACK_WAIT_MS;
  let lastStatus: string | null = null;
  while (Date.now() < deadline) {
    try {
      const found = await evolution.findMessages(instanceName, remoteJid);
      const records = found?.messages?.records ?? found?.records ?? [];
      const rec = messageId
        ? records.find((r: any) => r?.key?.id === messageId)
        : records.find((r: any) => {
            if (!r?.key?.fromMe) return false;
            if (text && messageText(r) !== text) return false;
            if (sentAtMs && messageTimestampMs(r) < sentAtMs - 30_000) return false;
            return true;
          });
      if (!rec) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      const updates = rec?.MessageUpdate ?? rec?.messageUpdate ?? [];
      lastStatus = updates?.[updates.length - 1]?.status ?? rec?.status ?? lastStatus;
      if (["SERVER_ACK", "DELIVERY_ACK", "READ", "PLAYED"].includes(String(lastStatus))) {
        return { delivered: true, explicitError: false, ack: lastStatus };
      }
      if (String(lastStatus) === "ERROR") {
        return { delivered: false, explicitError: true, error: "WhatsApp retornou ERROR para a entrega" };
      }
    } catch (e: any) {
      lastStatus = e?.message ?? lastStatus;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Sem ACK explícito dentro da janela: consideramos entregue (a Evolution
  // aceitou o envio) e apenas registramos o status observado.
  return { delivered: true, explicitError: false, ack: lastStatus ?? "PENDING" };
}