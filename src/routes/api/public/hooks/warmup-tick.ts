import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint. Called by pg_cron every minute. It processes every active
// warmup group whose next_run_at <= now(), creates as many independent pairs
// as possible, and only stores a log as "sent" after Evolution confirms the
// WhatsApp delivery ACK. A plain 201/PENDING response is not considered sent.

const MAX_DELAY_SECONDS = 30;
const REPLY_TIMEOUT_MS = 30 * 1000;
const DELIVERY_ACK_WAIT_MS = 18_000;

type Chip = {
  id: string;
  name: string | null;
  evolution_instance: string;
  status: string;
  phone: string | null;
  warmup_started_at?: string | null;
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
              .filter((i: any) => i && i.status === "connected");

            await refreshLiveStatuses(supabaseAdmin, evolution, rawMembers);
            await backfillPhones(supabaseAdmin, evolution, rawMembers);
            await markWarmupStarted(supabaseAdmin, rawMembers);

            const members = rawMembers.filter((i) => i.status === "connected" && i.phone);
            if (members.length < 2) {
              await scheduleNext(supabaseAdmin, g);
              results.push({ group: (g as any).id, status: "paused", reason: "menos de 2 números conectados" });
              continue;
            }

            const recentLogs = await fetchRecentLogs(supabaseAdmin, (g as any).id);
            const pairs = pickPairs(members, recentLogs);
            if (!pairs.length) {
              await scheduleNext(supabaseAdmin, g);
              results.push({ group: (g as any).id, status: "waiting", reason: "aguardando respostas" });
              continue;
            }

            const broadcast = createBroadcast();
            const pairResults = await Promise.all(
              pairs.map((pair) => processPair({ supabaseAdmin, evolution, group: g, pair, broadcast })),
            );

            await scheduleNext(supabaseAdmin, g);
            results.push(...pairResults);
          } catch (e: any) {
            results.push({ group: (g as any).id, error: e?.message ?? "erro" });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});

async function refreshLiveStatuses(supabaseAdmin: any, evolution: any, members: Chip[]) {
  await Promise.all(
    members.map(async (m) => {
      try {
        const state = await evolution.connectionState(m.evolution_instance);
        const s = state?.instance?.state ?? state?.state;
        if (s !== "open") {
          m.status = s === "connecting" ? "connecting" : "disconnected";
          await markInstance(supabaseAdmin, m.id, m.status as any);
        }
      } catch {
        m.status = "disconnected";
        await markInstance(supabaseAdmin, m.id, "disconnected");
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

async function fetchRecentLogs(supabaseAdmin: any, groupId: string) {
  const { data } = await supabaseAdmin
    .from("warmup_logs")
    .select("from_instance_id, to_instance_id, status, created_at")
    .eq("group_id", groupId)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

function pickPairs(members: Chip[], recentLogs: any[]) {
  const memberIds = new Set(members.map((i) => i.id));
  const lastByInstance = new Map<string, any>();
  for (const log of recentLogs) {
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
    const age = nowMs - new Date(last.created_at).getTime();
    if (age > REPLY_TIMEOUT_MS) return { kind: "idle" };
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

  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairCount = new Map<string, number>();
  for (const log of recentLogs) {
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
        const count = pairCount.get(pairKey(a.id, b.id)) ?? 0;
        if (!best || count < best.count) best = { a, b, count };
      }
    }
    if (!best) break;
    pairs.push({ from: best.a, to: best.b });
    selected.add(best.a.id);
    selected.add(best.b.id);
    for (let i = idle.length - 1; i >= 0; i--) {
      if (selected.has(idle[i].id)) idle.splice(i, 1);
    }
  }

  return pairs;
}

async function processPair({ supabaseAdmin, evolution, group, pair, broadcast }: any) {
  const { from, to } = pair as { from: Chip; to: Chip };

  const fromOpen = await isOpen(evolution, from.evolution_instance);
  const toOpen = await isOpen(evolution, to.evolution_instance);
  if (!fromOpen) {
    await markInstance(supabaseAdmin, from.id, "disconnected");
    return { group: group.id, from: from.id, to: to.id, status: "failed", error: "Remetente desconectado" };
  }
  if (!toOpen) {
    await markInstance(supabaseAdmin, to.id, "disconnected");
    return { group: group.id, from: from.id, to: to.id, status: "failed", error: "Destinatário desconectado" };
  }

  const history = await getPairHistory(supabaseAdmin, group.id, from.id, to.id);
  const messageContent = await generateMessage(supabaseAdmin, group.user_id, from.id, to.id, history);
  const typingMs = Math.min(3000, Math.max(700, messageContent.length * 25));
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

  try {
    await evolution.sendPresence(from.evolution_instance, toNumber, "composing", typingMs);
    await new Promise((r) => setTimeout(r, typingMs));
    const sendResp = await evolution.sendText(from.evolution_instance, toNumber, messageContent);
    const ack = await waitForDeliveryAck(evolution, from.evolution_instance, remoteJid, sendResp?.key?.id);
    if (!ack.delivered) {
      status = "failed";
      errMsg = ack.error ?? "Mensagem aceita pela Evolution, mas não confirmada como entregue";
    }
  } catch (e: any) {
    const firstError = e?.message ?? "erro";
    if (isClosedSessionError(firstError)) {
      try {
        await evolution.restart(from.evolution_instance);
        await waitForOpen(evolution, from.evolution_instance);
        const sendResp = await evolution.sendText(from.evolution_instance, toNumber, messageContent);
        const ack = await waitForDeliveryAck(evolution, from.evolution_instance, remoteJid, sendResp?.key?.id);
        if (!ack.delivered) {
          status = "failed";
          errMsg = ack.error ?? firstError;
          await markInstance(supabaseAdmin, from.id, "disconnected");
        }
      } catch (retryErr: any) {
        status = "failed";
        errMsg = retryErr?.message ?? firstError;
        await markInstance(supabaseAdmin, from.id, "disconnected");
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
  } else if (isClosedSessionError(errMsg)) {
    await markInstance(supabaseAdmin, from.id, "disconnected");
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
    .order("created_at", { ascending: true })
    .limit(10);

  return (recent ?? []).map((r: any) => ({
    from: r.from_instance_id === fromId ? "__me__" : "__other__",
    content: r.content as string,
  }));
}

async function generateMessage(supabaseAdmin: any, userId: string, fromId: string, toId: string, history: any[]) {
  try {
    const { generateReply } = await import("@/lib/ai.server");
    return await generateReply(history, { pairSeed: [fromId, toId].sort().join(":") });
  } catch {
    const { data: templates } = await supabaseAdmin
      .from("message_templates")
      .select("content")
      .or(`is_global.eq.true,user_id.eq.${userId}`)
      .limit(200);
    return templates?.length ? templates[Math.floor(Math.random() * templates.length)].content : "oi";
  }
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
  for (let i = 0; i < 8; i++) {
    if (await isOpen(evolution, instanceName)) return true;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

async function waitForDeliveryAck(evolution: any, instanceName: string, remoteJid: string, messageId?: string) {
  const deadline = Date.now() + DELIVERY_ACK_WAIT_MS;
  let lastStatus: string | null = null;
  while (Date.now() < deadline) {
    try {
      const found = await evolution.findMessages(instanceName, remoteJid);
      const records = found?.messages?.records ?? found?.records ?? [];
      const rec = messageId ? records.find((r: any) => r?.key?.id === messageId) : records[0];
      const updates = rec?.MessageUpdate ?? rec?.messageUpdate ?? [];
      lastStatus = updates?.[updates.length - 1]?.status ?? rec?.status ?? lastStatus;
      if (["SERVER_ACK", "DELIVERY_ACK", "READ", "PLAYED"].includes(String(lastStatus))) return { delivered: true };
      if (String(lastStatus) === "ERROR") return { delivered: false, error: "Evolution retornou ERROR para a entrega no WhatsApp" };
    } catch (e: any) {
      lastStatus = e?.message ?? lastStatus;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { delivered: false, error: lastStatus ? `Sem confirmação de entrega (${lastStatus})` : "Sem confirmação de entrega" };
}