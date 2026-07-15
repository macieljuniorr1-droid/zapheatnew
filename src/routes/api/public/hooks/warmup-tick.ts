import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint. Called by pg_cron every minute. It processes every active
// warmup group whose next_run_at <= now(), creates as many independent pairs
// as possible, and only stores a log as "sent" after Evolution confirms the
// WhatsApp device delivery ACK. A plain 201/PENDING/SERVER_ACK response is not
// considered sent, because SERVER_ACK only means WhatsApp's server accepted the
// message — not that it reached the recipient's phone.

const MAX_DELAY_SECONDS = 8;
const REPLY_TIMEOUT_MS = 10 * 60 * 1000;
const DELIVERY_ACK_WAIT_MS = 15_000;
const MAX_BURST_ROUNDS = 1;
const BURST_BUDGET_MS = 20_000;
const REPLY_GAP_MS = 500;
const FAILING_PAIR_COOLDOWN_MS = 90 * 1000;
const SENDER_REPAIR_WINDOW_MS = 20 * 60 * 1000;
const PAIR_STREAK_WINDOW_MS = 8 * 60 * 1000;
const PAIR_STREAK_LIMIT = 4;

type Chip = {
  id: string;
  name: string | null;
  evolution_instance: string;
  status: string;
  phone: string | null;
  last_qr?: string | null;
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
            "id, user_id, min_delay_seconds, max_delay_seconds, daily_limit, warmup_group_members(instance_id, whatsapp_instances(id, name, evolution_instance, status, phone, last_qr, warmup_started_at))",
          )
          .eq("active", true)
          .lte("next_run_at", now)
          .limit(50);
        if (gErr) return Response.json({ error: gErr.message }, { status: 500 });

        const results: any[] = [];
        for (const g of groups ?? []) {
          try {
            const claimed = await claimGroupForThisTick(supabaseAdmin, g, now);
            if (!claimed) continue;

            let rawMembers: Chip[] = ((g as any).warmup_group_members ?? [])
              .map((m: any) => m.whatsapp_instances)
              .filter((i: any) => i);

            await syncConnectedUserChipsIntoGroup(supabaseAdmin, g, rawMembers);
            await refreshLiveStatuses(supabaseAdmin, evolution, rawMembers);
            await refreshConnectedPhones(supabaseAdmin, evolution, rawMembers);
            rawMembers = await pruneDuplicateGroupMembers(supabaseAdmin, g, rawMembers);
            await markWarmupStarted(supabaseAdmin, rawMembers);
            // Chips com histórico recente de ERROR de entrega recebem recuperação
            // preventiva antes de tentar enviar de novo. Sem isso a sessão fica
            // aberta no painel, mas dessincronizada para envio.
            await preemptiveRecoverFailingChips(supabaseAdmin, evolution, rawMembers, (g as any).id);

            const members = uniqueSendableMembers(rawMembers.filter((i) => i.status === "connected" && i.phone));
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

async function claimGroupForThisTick(supabaseAdmin: any, group: any, nowIso: string) {
  // O cron chama este endpoint a cada ~30s. Um ciclo pode levar alguns segundos
  // esperando ACK real do WhatsApp; sem essa reserva, duas execuções pegam o
  // mesmo grupo ao mesmo tempo e criam envios duplicados/race na Evolution.
  const holdUntil = new Date(Date.now() + 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("warmup_groups")
    .update({ next_run_at: holdUntil })
    .eq("id", group.id)
    .lte("next_run_at", nowIso)
    .select("id")
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

async function syncConnectedUserChipsIntoGroup(supabaseAdmin: any, group: any, rawMembers: Chip[]) {
  const existing = new Set(rawMembers.map((m) => m.id));
  const existingPhones = new Set(rawMembers.map((m) => normalizePhone(m.phone)).filter(Boolean));
  const { data: connected } = await supabaseAdmin
    .from("whatsapp_instances")
      .select("id, name, evolution_instance, status, phone, last_qr, warmup_started_at")
    .eq("user_id", group.user_id)
    .eq("status", "connected")
    .not("phone", "is", null);

  const missing = (connected ?? []).filter((chip: Chip) => {
    if (existing.has(chip.id)) return false;
    const phone = normalizePhone(chip.phone);
    if (phone && existingPhones.has(phone)) return false;
    if (phone) existingPhones.add(phone);
    return true;
  });
  if (!missing.length) return;

  await supabaseAdmin.from("warmup_group_members").insert(
    missing.map((chip: Chip) => ({ group_id: group.id, instance_id: chip.id })),
    { ignoreDuplicates: true },
  );

  rawMembers.push(...missing);
}

function normalizePhone(phone: string | null | undefined) {
  return String(phone ?? "").replace(/\D/g, "");
}

function uniqueSendableMembers(members: Chip[]) {
  const byPhone = new Map<string, Chip>();
  for (const member of members) {
    const phone = normalizePhone(member.phone);
    if (!phone) continue;
    const current = byPhone.get(phone);
    if (!current) {
      byPhone.set(phone, member);
      continue;
    }
    const currentStarted = current.warmup_started_at ? new Date(current.warmup_started_at).getTime() : 0;
    const memberStarted = member.warmup_started_at ? new Date(member.warmup_started_at).getTime() : 0;
    // Se o mesmo WhatsApp foi conectado em duas instâncias, só uma pode entrar
    // no rodízio. Mantém a conexão mais recente para não gerar conversa consigo
    // mesmo nem quebrar o cache de contatos da Evolution/Baileys.
    if (memberStarted > currentStarted) byPhone.set(phone, member);
  }
  return [...byPhone.values()];
}

async function refreshLiveStatuses(supabaseAdmin: any, evolution: any, members: Chip[]) {
  await Promise.all(
    members.map(async (m) => {
      const awaitingQr = m.status === "qr";
      const isPaired = Boolean(m.phone || m.warmup_started_at) && !awaitingQr;
      try {
        const state = await evolution.connectionState(m.evolution_instance);
        const s = state?.instance?.state ?? state?.state;
        m.live_state = s ?? null;

        if (s === "open") {
          m.status = "connected";
          await markInstance(supabaseAdmin, m.id, "connected");
          return;
        }

        if (awaitingQr) {
          // QR de pareamento deve ficar estável. Gerar outro QR em cada ciclo do
          // robô invalida o código que o usuário está tentando escanear.
          if (!m.last_qr) await refreshRepairQr(supabaseAdmin, evolution, m);
          m.temporarily_unavailable = true;
          m.status = "qr";
          return;
        }

        // Tenta reabrir a sessão em background sem mexer no status do painel.
        // O usuário pareou o número; a plataforma NUNCA deve marcar como
        // desconectado sozinha — só o próprio usuário desconecta manualmente.
        const recovered = await recoverOpenSession(evolution, m.evolution_instance);
        if (recovered) {
          m.status = "connected";
          await markInstance(supabaseAdmin, m.id, "connected");
          return;
        }

        // Sessão não confirmou "open" agora — pulamos apenas este ciclo de
        // envio, mas mantemos o chip como "conectado" no painel se já foi
        // pareado. Chips que nunca foram pareados continuam em "connecting".
        m.temporarily_unavailable = true;
        if (isPaired) {
          m.status = "connected";
          // não sobrescreve o status no banco — mantém "connected" preservado
        } else {
          m.status = "connecting";
          await markInstance(supabaseAdmin, m.id, "connecting");
        }
      } catch {
        if (awaitingQr) {
          if (!m.last_qr) await refreshRepairQr(supabaseAdmin, evolution, m);
          m.temporarily_unavailable = true;
          m.status = "qr";
          return;
        }
        const recovered = await recoverOpenSession(evolution, m.evolution_instance);
        if (recovered) {
          m.status = "connected";
          await markInstance(supabaseAdmin, m.id, "connected");
          return;
        }
        m.temporarily_unavailable = true;
        if (isPaired) {
          m.status = "connected";
        } else {
          m.status = "connecting";
          await markInstance(supabaseAdmin, m.id, "connecting");
        }
      }
    }),
  );
}

async function refreshRepairQr(supabaseAdmin: any, evolution: any, m: Chip) {
  try {
    const conn = await evolution.connect(m.evolution_instance);
    const qr = await normalizeQr(conn);
    if (qr) {
      m.last_qr = qr;
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: "qr", last_qr: qr, updated_at: new Date().toISOString() })
        .eq("id", m.id);
    }
  } catch {}
}


async function refreshConnectedPhones(supabaseAdmin: any, evolution: any, members: Chip[]) {
  for (const m of members) {
    if (m.status !== "connected") continue;
    try {
      const fetched = await evolution.fetchInstance(m.evolution_instance);
      const rec = Array.isArray(fetched) ? fetched[0] : fetched?.instance ?? fetched;
      const values = [rec?.ownerJid, rec?.profile?.id, rec?.owner, rec?.wuid, rec?.number, rec?.phone];
      const phoneMatch = values.map((v) => String(v ?? "").match(/(\d{8,20})/)?.[1]).find(Boolean);
      if (phoneMatch && phoneMatch !== normalizePhone(m.phone)) {
        m.phone = phoneMatch;
        await supabaseAdmin.from("whatsapp_instances").update({ phone: m.phone, updated_at: new Date().toISOString() }).eq("id", m.id);
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
      if (ok) {
        m.temporarily_unavailable = false;
        await markInstance(supabaseAdmin, m.id, "connected");
      } else if (!(m.phone || m.warmup_started_at)) {
        m.temporarily_unavailable = true;
        m.status = "connecting";
        await markInstance(supabaseAdmin, m.id, "connecting");
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
  const nowMs = Date.now();

  const overheatedPairs = new Set<string>();
  const recentPairCounts = new Map<string, number>();
  for (const log of sentLogs) {
    if (!log.from_instance_id || !log.to_instance_id) continue;
    if (nowMs - new Date(log.created_at).getTime() > PAIR_STREAK_WINDOW_MS) continue;
    const key = pairKey(log.from_instance_id, log.to_instance_id);
    const count = (recentPairCounts.get(key) ?? 0) + 1;
    recentPairCounts.set(key, count);
    if (count >= PAIR_STREAK_LIMIT) overheatedPairs.add(key);
  }

  const recentFailedPairs = new Set(
    recentLogs
      .filter((log) => log.status === "failed" && nowMs - new Date(log.created_at).getTime() < FAILING_PAIR_COOLDOWN_MS)
      .map((log) => pairKey(log.from_instance_id, log.to_instance_id)),
  );
  const senderFailures = new Map<string, number>();
  for (const log of recentLogs) {
    if (log.status !== "failed" || !log.from_instance_id) continue;
    if (nowMs - new Date(log.created_at).getTime() >= FAILING_PAIR_COOLDOWN_MS) continue;
    senderFailures.set(log.from_instance_id, (senderFailures.get(log.from_instance_id) ?? 0) + 1);
  }
  const lastOutboundStatus = new Map<string, string>();
  for (const log of recentLogs) {
    if (!log.from_instance_id || lastOutboundStatus.has(log.from_instance_id)) continue;
    lastOutboundStatus.set(log.from_instance_id, log.status);
  }
  // Se o último envio real de um chip falhou, ele não pode continuar recebendo
  // novas mensagens. Ele só entra em novas duplas como remetente até provar que
  // voltou a entregar; assim nenhum número fica acumulando mensagens sem resposta.
  const blockedRecipients = new Set(
    [...lastOutboundStatus.entries()].filter(([, status]) => status === "failed").map(([id]) => id),
  );

  // Última mensagem trocada POR PAR (não por instância). Assim uma dívida de
  // resposta entre A↔B não é apagada porque A depois falou com C.
  const lastByPair = new Map<string, any>();
  for (const log of sentLogs) {
    if (!log.from_instance_id || !log.to_instance_id) continue;
    if (!memberIds.has(log.from_instance_id) || !memberIds.has(log.to_instance_id)) continue;
    const k = pairKey(log.from_instance_id, log.to_instance_id);
    const prev = lastByPair.get(k);
    if (!prev || new Date(log.created_at).getTime() > new Date(prev.created_at).getTime()) {
      lastByPair.set(k, log);
    }
  }

  // Dívidas em aberto: para cada par, se a última msg foi peer→me e ainda está
  // dentro da janela de resposta, "me" deve responder ao peer. Respostas
  // pendentes são obrigatórias: não entram em cooldown por falha nem em bloqueio
  // por dominância, porque isso fazia o chip 003 receber e ficar sem responder.
  type Debt = { instanceId: string; peerId: string; age: number; lastFailedAt: number };
  const debts: Debt[] = [];
  for (const [key, log] of lastByPair.entries()) {
    const age = nowMs - new Date(log.created_at).getTime();
    if (age > REPLY_TIMEOUT_MS) continue;
    if (overheatedPairs.has(key)) continue;
    // Quem deve resposta é o `to` do último log (recebeu por último).
    const lastFailedAt = latestFailedAtForPair(recentLogs, log.to_instance_id, log.from_instance_id);
    debts.push({ instanceId: log.to_instance_id, peerId: log.from_instance_id, age, lastFailedAt });
  }
  // Primeiro tenta dívidas sem falha recente. Se todas falharam, roda pela mais
  // antiga tentativa de falha para não prender o chip no mesmo par para sempre.
  debts.sort((a, b) => {
    const aFailed = a.lastFailedAt > 0;
    const bFailed = b.lastFailedAt > 0;
    if (aFailed !== bFailed) return aFailed ? 1 : -1;
    if (aFailed && bFailed && a.lastFailedAt !== b.lastFailedAt) return a.lastFailedAt - b.lastFailedAt;
    return b.age - a.age;
  });

  const pairs: Array<{ from: Chip; to: Chip }> = [];
  const selected = new Set<string>();
  const chipById = new Map(members.map((m) => [m.id, m]));

  for (const debt of debts) {
    if (selected.has(debt.instanceId) || selected.has(debt.peerId)) continue;
    const from = chipById.get(debt.instanceId);
    const to = chipById.get(debt.peerId);
    if (!from || !to) continue;
    if (from.id === to.id || normalizePhone(from.phone) === normalizePhone(to.phone)) continue;
    if (blockedRecipients.has(to.id)) continue;
    pairs.push({ from, to });
    selected.add(from.id);
    selected.add(to.id);
  }

  // Frequência histórica por par — para começar novas conversas priorizando
  // os pares que menos se falaram (evita monopólio de A↔B).
  const pairCount = new Map<string, number>();
  for (const log of sentLogs) {
    if (!log.from_instance_id || !log.to_instance_id) continue;
    const k = pairKey(log.from_instance_id, log.to_instance_id);
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }

  const idle = [...members]
    .filter((m) => !selected.has(m.id))
    .sort(() => Math.random() - 0.5);

  while (idle.length >= 2) {
    let best: { a: Chip; b: Chip; count: number } | null = null;
    for (let i = 0; i < idle.length; i++) {
      for (let j = i + 1; j < idle.length; j++) {
        const a = idle[i];
        const b = idle[j];
        if (selected.has(a.id) || selected.has(b.id)) continue;
        if (normalizePhone(a.phone) === normalizePhone(b.phone)) continue;
        if (overheatedPairs.has(pairKey(a.id, b.id))) continue;
        if (recentFailedPairs.has(pairKey(a.id, b.id))) continue;
        if (blockedRecipients.has(a.id) && blockedRecipients.has(b.id)) continue;
        const count = pairCount.get(pairKey(a.id, b.id)) ?? 0;
        if (!best || count < best.count) best = { a, b, count };
      }
    }
    if (!best) break;
    const aFailures = senderFailures.get(best.a.id) ?? 0;
    const bFailures = senderFailures.get(best.b.id) ?? 0;
    const aBlocked = blockedRecipients.has(best.a.id);
    const bBlocked = blockedRecipients.has(best.b.id);
    if (aBlocked || bBlocked) {
      pairs.push(aBlocked ? { from: best.a, to: best.b } : { from: best.b, to: best.a });
    } else {
      pairs.push(aFailures > bFailures ? { from: best.b, to: best.a } : { from: best.a, to: best.b });
    }
    selected.add(best.a.id);
    selected.add(best.b.id);
    for (let i = idle.length - 1; i >= 0; i--) {
      if (selected.has(idle[i].id)) idle.splice(i, 1);
    }
  }

  return pairs;
}

function latestFailedAtForPair(recentLogs: any[], a: string, b: string) {
  const key = pairKey(a, b);
  let latest = 0;
  for (const log of recentLogs) {
    if (log.status !== "failed") continue;
    if (pairKey(log.from_instance_id, log.to_instance_id) !== key) continue;
    latest = Math.max(latest, new Date(log.created_at).getTime());
  }
  return latest;
}


function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

async function processPair({ supabaseAdmin, evolution, group, pair, broadcast }: any) {
  const { from, to } = pair as { from: Chip; to: Chip };
  if (from.id === to.id || normalizePhone(from.phone) === normalizePhone(to.phone)) {
    return { group: group.id, from: from.id, to: to.id, status: "skipped", reason: "números duplicados" };
  }

  const fromOpen = await isOpen(evolution, from.evolution_instance);
  const toOpen = await isOpen(evolution, to.evolution_instance);
  if (!fromOpen) {
    const recovered = await recoverOpenSession(evolution, from.evolution_instance, true);
    if (!recovered) {
      await markInstance(supabaseAdmin, from.id, "connected");
      return await logPairResult(supabaseAdmin, group, from, to, "falha temporária: remetente não abriu sessão", "failed");
    }
  }
  if (!toOpen) {
    const recovered = await recoverOpenSession(evolution, to.evolution_instance, true);
    if (!recovered) {
      await markInstance(supabaseAdmin, to.id, "connected");
      // O destinatário offline não deve impedir a tentativa quando há dívida de
      // resposta: o envio via WhatsApp pode ser aceito mesmo sem o aparelho abrir
      // no momento. Apenas seguimos para tentar enviar.
    }
  }

  const history = await getPairHistory(supabaseAdmin, group.id, from.id, to.id);
  const messageContent = await generateMessage(supabaseAdmin, group.user_id, from.id, to.id, history);
  const typingMs = Math.min(900, Math.max(250, messageContent.length * 10));
  const toNumber = normalizePhone(to.phone);
  const sendTargets = await resolveSendTargets(evolution, from.evolution_instance, toNumber);

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
    let lastErr: any = null;
    for (const target of sendTargets) {
      try {
        await markLatestIncomingAsRead(evolution, from.evolution_instance, target.remoteJid);
        await evolution.sendPresence(from.evolution_instance, target.number, "composing", typingMs);
        await new Promise((r) => setTimeout(r, typingMs));
        const sentAtMs = Date.now();
        const sendResp = await evolution.sendText(from.evolution_instance, target.number, messageContent);
        const ackJid = extractRemoteJid(sendResp) ?? target.remoteJid;
        return await waitForDeliveryAck(evolution, from.evolution_instance, ackJid, extractMessageId(sendResp), messageContent, sentAtMs);
      } catch (sendErr: any) {
        lastErr = sendErr;
        if (!isClosedSessionError(sendErr?.message) && !isDeliverySyncFailure(sendErr?.message)) break;
        await recoverOpenSession(evolution, from.evolution_instance, true);
      }
    }
    throw lastErr ?? new Error(`Não foi possível resolver o destinatário ${toNumber}`);
  };

  try {
    let ack = await attemptSend();
    // ERROR explícito indica sessão dessincronizada. Força recuperação e tenta
    // várias vezes antes de registrar falha, porque resposta recebida é prioridade.
    for (let retry = 0; ack.explicitError && retry < 3; retry++) {
      try {
        await recoverOpenSession(evolution, from.evolution_instance, true);
        await new Promise((r) => setTimeout(r, 750));
        ack = await attemptSend();
      } catch (retryErr: any) {
        errMsg = retryErr?.message ?? ack.error ?? null;
      }
    }
    if (ack.explicitError) {
      status = "failed";
      errMsg = ack.error ?? errMsg ?? "WhatsApp retornou erro na entrega";
    }
  } catch (e: any) {
    const firstError = e?.message ?? "erro";
    try {
      await recoverOpenSession(evolution, from.evolution_instance, true);
      const ack = await attemptSend();
      if (ack.explicitError) {
        status = "failed";
        errMsg = ack.error ?? firstError;
      }
    } catch (retryErr: any) {
      status = "failed";
      errMsg = retryErr?.message ?? firstError;
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

  if (status === "failed") {
    await quarantineSenderForRepair(supabaseAdmin, evolution, group.id, from, errMsg);
  }

  return { group: group.id, from: from.id, to: to.id, status, error: errMsg ?? undefined };
}

async function quarantineSenderForRepair(supabaseAdmin: any, evolution: any, groupId: string, from: Chip, errMsg: string | null) {
  if (!isDeliverySyncFailure(errMsg)) return;
  const { data: recent } = await supabaseAdmin
    .from("warmup_logs")
    .select("status, error, created_at")
    .eq("group_id", groupId)
    .eq("from_instance_id", from.id)
    .gte("created_at", new Date(Date.now() - SENDER_REPAIR_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(5);

  let consecutiveFailures = 0;
  for (const log of recent ?? []) {
    if (log.status === "sent") break;
    if (log.status === "failed" && isDeliverySyncFailure(log.error)) consecutiveFailures++;
  }
  if (consecutiveFailures < 2) return;

  // Quando uma sessão recebe mensagens mas não consegue enviar, restart/connect
  // não é suficiente: ela precisa sair do aquecimento e gerar novo QR para
  // sincronizar as credenciais Baileys com o WhatsApp real. Isso impede que um
  // número quebrado continue recebendo mensagens sem responder.
  let qr: string | null = null;
  try {
    await evolution.logout(from.evolution_instance);
  } catch {}
  try {
    qr = await normalizeQr(await evolution.connect(from.evolution_instance));
  } catch {}
  await supabaseAdmin
    .from("whatsapp_instances")
    .update({ status: "qr", last_qr: qr, updated_at: new Date().toISOString() })
    .eq("id", from.id);
  from.status = "qr";
  from.temporarily_unavailable = true;
}

async function logPairResult(supabaseAdmin: any, group: any, from: Chip, to: Chip, content: string, status: "sent" | "failed", error?: string | null) {
  await supabaseAdmin.from("warmup_logs").insert({
    user_id: group.user_id,
    group_id: group.id,
    from_instance_id: from.id,
    to_instance_id: to.id,
    content,
    status,
    error: error ?? content,
  });
  return { group: group.id, from: from.id, to: to.id, status, error: error ?? content };
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

async function resolveSendTargets(evolution: any, instanceName: string, phone: string) {
  const fallback = { number: phone, remoteJid: `${phone}@s.whatsapp.net` };
  const targets: Array<{ number: string; remoteJid: string }> = [];
  const addTarget = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;
    const isJid = /@(s\.whatsapp\.net|lid)$/i.test(raw);
    const digits = normalizePhone(raw);
    if (!isJid && digits !== phone) return;
    const remoteJid = isJid ? raw : `${digits}@s.whatsapp.net`;
    const number = /@lid$/i.test(remoteJid) ? remoteJid : digits;
    if (!number || targets.some((t) => t.number === number || t.remoteJid === remoteJid)) return;
    targets.push({ number, remoteJid });
  };

  try {
    const resolved = await evolution.whatsappNumbers(instanceName, [phone]);
    for (const rec of normalizeEvolutionRecords(resolved)) {
      if (rec?.exists === false && !String(rec?.jid ?? rec?.number ?? "").includes("@lid")) {
        throw new Error(`Destinatário ${phone} não está no WhatsApp`);
      }
      addTarget(rec?.jid);
      addTarget(rec?.number);
      addTarget(rec?.id);
    }
  } catch (e: any) {
    if (String(e?.message ?? "").includes("não está no WhatsApp")) throw e;
  }

  // Em versões recentes do WhatsApp, alguns contatos aparecem como @lid. Buscar
  // contatos locais dá uma segunda chance de achar o JID real antes do envio.
  try {
    const contacts = await evolution.findContacts(instanceName);
    for (const rec of normalizeEvolutionRecords(contacts)) {
      const blob = JSON.stringify(rec ?? {});
      if (!blob.includes(phone)) continue;
      addTarget(rec?.id);
      addTarget(rec?.jid);
      addTarget(rec?.remoteJid);
      addTarget(rec?.number);
    }
  } catch {}

  addTarget(fallback.remoteJid);
  return targets.length ? targets : [fallback];
}

function normalizeEvolutionRecords(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.numbers)) return payload.numbers;
  if (Array.isArray(payload?.contacts)) return payload.contacts;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.response?.message)) return payload.response.message;
  if (Array.isArray(payload?.messages?.records)) return payload.messages.records;
  return [];
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
  // Nunca rebaixa um chip que já foi pareado (phone ou warmup_started_at).
  // A plataforma só pode marcar como desconectado por ação explícita do usuário
  // (deletar/logout), nunca automaticamente por oscilação de rede/celular.
  if (status !== "connected") {
    const { data: current } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("phone, warmup_started_at, status")
      .eq("id", id)
      .maybeSingle();
    const wasPaired = Boolean(current?.phone || current?.warmup_started_at);
    if (wasPaired) {
      // Preserva "connected"; apenas atualiza o updated_at para heartbeat.
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: "connected", updated_at: new Date().toISOString() })
        .eq("id", id);
      return;
    }
  }
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
  return /connection closed|no sessions|sessionerror|stream errored|timed out|1006|cannot read properties of undefined|reading 'id'/i.test(String(message ?? ""));
}

function isDeliverySyncFailure(message: string | null | undefined) {
  return /whatsapp retornou error|sem confirma[cç][aã]o real|sem ack|pending|server_ack/i.test(String(message ?? ""));
}

async function normalizeQr(payload: any): Promise<string | null> {
  const firstString = (...values: any[]) => values.find((v) => typeof v === "string" && v.trim().length > 0)?.trim();
  const asImage = (raw?: string | null) => {
    if (!raw) return null;
    if (raw.startsWith("data:image/")) return raw;
    if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.replace(/\s+/g, "").length > 200) {
      return `data:image/png;base64,${raw.replace(/\s+/g, "")}`;
    }
    return null;
  };

  const image = asImage(firstString(payload?.base64, payload?.qrcode?.base64, payload?.qrBase64));
  if (image) return image;

  const code = firstString(payload?.code, payload?.qrcode?.code, payload?.qrcode, payload?.qr);
  const imageFromCode = asImage(code);
  if (imageFromCode) return imageFromCode;
  if (!code || code.length < 20) return null;

  const QR = await import("qrcode");
  return QR.toDataURL(code, { width: 320, margin: 1, errorCorrectionLevel: "M" });
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

function extractRemoteJid(sendResp: any) {
  return sendResp?.key?.remoteJid ?? sendResp?.message?.key?.remoteJid ?? sendResp?.data?.key?.remoteJid ?? sendResp?.remoteJid;
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
      if (["DELIVERY_ACK", "READ", "PLAYED"].includes(String(lastStatus))) {
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
  // Sem ACK explícito de entrega no aparelho dentro da janela: a sessão Baileys
  // provavelmente está dessincronizada ou o WhatsApp só aceitou no servidor.
  // Nunca marcar como entregue com SERVER_ACK/PENDING — força retry/recover e,
  // se persistir, falha.
  return {
    delivered: false,
    explicitError: true,
    error: `Sem confirmação real de entrega em ${DELIVERY_ACK_WAIT_MS}ms (status=${lastStatus ?? "PENDING"})`,
  };
}