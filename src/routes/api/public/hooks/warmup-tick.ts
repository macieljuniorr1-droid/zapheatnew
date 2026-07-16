import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint. Called by pg_cron every minute. It processes every active
// warmup group whose next_run_at <= now(), creates as many independent pairs
// as possible, and stores a log as "sent" when Evolution accepts the send.
// Some Baileys/Evolution builds do not persist DELIVERY_ACK reliably for every
// private chat; treating missing ACK as failure was taking healthy chips out of
// the rotation.

const FALLBACK_MAX_DELAY_SECONDS = 300;
const REPLY_TIMEOUT_MS = 10 * 60 * 1000;
const DELIVERY_ACK_WAIT_MS = 3_500;
const MAX_BURST_ROUNDS = 1;
const BURST_BUDGET_MS = 6_000;
const REPLY_GAP_MS = 150;
const FAILING_PAIR_COOLDOWN_MS = 8 * 1000;
const SENDER_REPAIR_WINDOW_MS = 20 * 60 * 1000;
const PAIR_STREAK_WINDOW_MS = 8 * 60 * 1000;
const PAIR_STREAK_LIMIT = 4;
const MAX_SEND_ATTEMPTS_PER_PAIR = 1;
const SESSION_SETTLE_MS = 250;
const AI_GENERATION_TIMEOUT_MS = 900;

type Chip = {
  id: string;
  name: string | null;
  evolution_instance: string;
  status: string;
  phone: string | null;
  last_qr?: string | null;
  warmup_started_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  temporarily_unavailable?: boolean;
  live_state?: string | null;
};

type DeliveryAck = {
  delivered: boolean;
  explicitError: boolean;
  ack?: string | null;
  error?: string | null;
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
            "id, user_id, min_delay_seconds, max_delay_seconds, daily_limit, ai_model, warmup_group_members(instance_id, whatsapp_instances(id, name, evolution_instance, status, phone, last_qr, warmup_started_at, created_at, updated_at))",
          )
          .eq("active", true)
          .lte("next_run_at", now)
          .limit(50);
        if (gErr) return Response.json({ error: gErr.message }, { status: 500 });

        const dueGroups = pickOneDueGroupPerUser(groups ?? []);
        const settled = await Promise.all(dueGroups.map(async (g: any) => {
          try {
            const claimed = await claimGroupForThisTick(supabaseAdmin, g, now);
            if (!claimed) return [];

            let rawMembers: Chip[] = ((g as any).warmup_group_members ?? [])
              .map((m: any) => m.whatsapp_instances)
              .filter((i: any) => i);

            await syncConnectedUserChipsIntoGroup(supabaseAdmin, g, rawMembers);
            await refreshLiveStatuses(supabaseAdmin, evolution, rawMembers);
            await refreshConnectedPhones(supabaseAdmin, evolution, rawMembers);
            await deactivateOlderDuplicatePhones(supabaseAdmin, evolution, rawMembers);
            rawMembers = await pruneDuplicateGroupMembers(supabaseAdmin, g, rawMembers);
            await markWarmupStarted(supabaseAdmin, rawMembers);
            // A recuperação pesada acontece apenas quando o remetente falha no
            // envio. Fazer restart preventivo em todos os chips a cada tick
            // deixava o motor "pensando" por muito tempo e misturava atrasos de
            // um usuário no motor do outro.

            // Enquanto a instância estiver marcada como conectada e pareada no
            // painel, ela entra no rodízio. A checagem definitiva de sessão
            // aberta acontece em ensureOpenSession() logo antes do envio — se
            // por acaso o socket cair, o motor faz connect+restart e segue.
            const members = uniqueSendableMembers(rawMembers.filter((i) => i.status === "connected" && i.phone));
            if (members.length < 2) {
              await scheduleNext(supabaseAdmin, g);
              return [{
                group: (g as any).id,
                status: "waiting",
                reason: "menos de 2 números disponíveis neste ciclo",
                connected_in_platform: rawMembers.filter((i) => i.status === "connected").length,
              }];
            }

            const broadcast = createBroadcast((g as any).user_id);
            const groupResults: any[] = [];
            const deadline = Date.now() + BURST_BUDGET_MS;

            for (let round = 0; round < MAX_BURST_ROUNDS && Date.now() < deadline; round++) {
              const recentLogs = await fetchRecentLogs(supabaseAdmin, (g as any).id);
              const pairs = pickPairs(members, recentLogs);
          if (!pairs.length) {
            if (round === 0) groupResults.push({ group: (g as any).id, status: "waiting", reason: "sem pares seguros disponíveis agora" });
                break;
              }

              const pairResults = await Promise.all(
                pairs.map((pair) => processPair({ supabaseAdmin, evolution, group: g, pair, broadcast })),
              );
              groupResults.push(...pairResults);

              const activeEnough = pairResults.some((r) => r.status === "sent" || (r.status === "failed" && !isRepairableSessionFailure(r.error)));
              if (!activeEnough && round >= MAX_BURST_ROUNDS - 1) break;
              if (round < MAX_BURST_ROUNDS - 1 && Date.now() + REPLY_GAP_MS < deadline) {
                await new Promise((r) => setTimeout(r, REPLY_GAP_MS));
              }
            }

            await scheduleNext(supabaseAdmin, g);
            return groupResults;
          } catch (e: any) {
            return [{ group: (g as any).id, user: (g as any).user_id, error: e?.message ?? "erro" }];
          }
        }));

        const results = settled.flat();

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});

function pickOneDueGroupPerUser(groups: any[]) {
  const byUser = new Map<string, any>();
  for (const group of groups) {
    const userId = String(group.user_id ?? "");
    if (!userId) continue;
    const current = byUser.get(userId);
    if (!current || new Date(group.next_run_at ?? 0).getTime() < new Date(current.next_run_at ?? 0).getTime()) {
      byUser.set(userId, group);
    }
  }
  return [...byUser.values()];
}

async function claimGroupForThisTick(supabaseAdmin: any, group: any, nowIso: string) {
  // O cron chama este endpoint a cada ~30s. Um ciclo pode levar alguns segundos
  // esperando ACK real do WhatsApp; sem essa reserva, duas execuções pegam o
  // mesmo grupo ao mesmo tempo e criam envios duplicados/race na Evolution.
  const holdUntil = new Date(Date.now() + 18_000).toISOString();
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
  const { data: connected } = await supabaseAdmin
    .from("whatsapp_instances")
      .select("id, name, evolution_instance, status, phone, last_qr, warmup_started_at, created_at, updated_at")
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

function normalizePhone(phone: string | null | undefined) {
  const raw = String(phone ?? "").trim();
  const jidUser = raw.match(/(\d{8,20})(?::\d+)?@(s\.whatsapp\.net|lid)/i)?.[1];
  return jidUser ?? raw.replace(/\D/g, "");
}

function uniqueSendableMembers(members: Chip[]) {
  const byPhone = new Map<string, Chip>();
  for (const member of members) {
    const phone = normalizePhone(member.phone);
    if (!phone) continue;
    const current = byPhone.get(phone);
    if (!current || preferChip(member, current)) byPhone.set(phone, member);
  }
  return [...byPhone.values()];
}

function preferChip(candidate: Chip, current: Chip) {
  if (candidate.temporarily_unavailable !== current.temporarily_unavailable) {
    return !candidate.temporarily_unavailable;
  }
  const candidateCreated = new Date(candidate.created_at ?? 0).getTime();
  const currentCreated = new Date(current.created_at ?? 0).getTime();
  if (candidateCreated !== currentCreated) return candidateCreated > currentCreated;
  const candidateUpdated = new Date(candidate.updated_at ?? 0).getTime();
  const currentUpdated = new Date(current.updated_at ?? 0).getTime();
  return candidateUpdated > currentUpdated;
}

async function pruneDuplicateGroupMembers(supabaseAdmin: any, group: any, members: Chip[]) {
  // Nunca removemos membros automaticamente do grupo. Mesmo que duas instâncias
  // reportem o mesmo telefone por cache antigo da Evolution, retirar uma delas
  // faz o usuário enxergar chips "conectados" que não participam do aquecimento.
  // A proteção contra autoenvio fica no pickPairs/processPair, que apenas evita
  // formar uma dupla entre telefones iguais.
  void supabaseAdmin;
  void group;
  return members;
}

async function refreshLiveStatuses(supabaseAdmin: any, evolution: any, members: Chip[]) {
  await Promise.all(
    members.map(async (m) => {
      const isPaired = Boolean(m.phone || m.warmup_started_at);
      const awaitingQr = m.status === "qr" && !isPaired;
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

        // Status ao vivo não deve fazer restart/conectar todos os chips a cada
        // ciclo. Isso era o maior gargalo. O envio real tenta recuperar só o
        // remetente que falhar, mantendo cada motor rápido e isolado.
        m.temporarily_unavailable = false;
        if (isPaired) {
          m.status = "connected";
          await markInstance(supabaseAdmin, m.id, "connected");
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
        m.temporarily_unavailable = false;
        if (isPaired) {
          m.status = "connected";
          await markInstance(supabaseAdmin, m.id, "connected");
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
  await Promise.all(members.map(async (m) => {
    if (m.status !== "connected") return;
    try {
      const fetched = await evolution.fetchInstance(m.evolution_instance);
      const records = Array.isArray(fetched) ? fetched : Array.isArray(fetched?.instances) ? fetched.instances : [fetched?.instance ?? fetched];
      const rec = records.find((item: any) => item?.name === m.evolution_instance || item?.instanceName === m.evolution_instance || item?.instance?.instanceName === m.evolution_instance || item?.instance?.name === m.evolution_instance) ?? records[0];
      const values = [
        rec?.ownerJid,
        rec?.instance?.ownerJid,
        rec?.profile?.id,
        rec?.instance?.profile?.id,
        rec?.owner,
        rec?.instance?.owner,
        rec?.wuid,
        rec?.instance?.wuid,
        rec?.number,
        rec?.instance?.number,
        rec?.phone,
        rec?.instance?.phone,
      ];
      const phoneMatch = values.map((v) => normalizePhone(v)).find((v) => v.length >= 10 && v.length <= 15);
      if (phoneMatch && phoneMatch !== normalizePhone(m.phone)) {
        m.phone = phoneMatch;
        await supabaseAdmin.from("whatsapp_instances").update({ phone: m.phone, updated_at: new Date().toISOString() }).eq("id", m.id);
      }
    } catch {}
  }));
}

async function deactivateOlderDuplicatePhones(supabaseAdmin: any, evolution: any, members: Chip[]) {
  const phones = [...new Set(members.map((m) => normalizePhone(m.phone)).filter(Boolean))];
  for (const phone of phones) {
    const { data: duplicates } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, name, evolution_instance, phone, status, created_at, updated_at")
      .eq("phone", phone)
      .order("created_at", { ascending: false });

    const samePhone = (duplicates ?? []) as Chip[];
    const connected = samePhone.filter((item) => item.status === "connected");
    if (connected.length <= 1) continue;

    // O mesmo WhatsApp conectado em duas instâncias deixa uma sessão recebendo,
    // mas sem enviar de forma confiável. Mantemos a conexão mais nova e tiramos
    // as antigas do rodízio, encerrando a sessão duplicada no Evolution.
    const [keeper] = connected.sort((a, b) => {
      const byCreated = new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      if (byCreated !== 0) return byCreated;
      return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
    });
    const stale = connected.filter((item) => item.id !== keeper.id);

    for (const old of stale) {
      if (old.evolution_instance) {
        try { await evolution.logout(old.evolution_instance); } catch {}
        try { await evolution.deleteInstance(old.evolution_instance); } catch {}
      }
      await supabaseAdmin
        .from("whatsapp_instances")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("id", old.id);
      await supabaseAdmin.from("warmup_group_members").delete().eq("instance_id", old.id);

      const local = members.find((m) => m.id === old.id);
      if (local) {
        local.status = "disconnected";
        local.temporarily_unavailable = true;
      }
    }

    const active = members.find((m) => m.id === keeper.id);
    if (active) {
      active.status = "connected";
      active.temporarily_unavailable = false;
    }
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
  // Se um chip acabou de falhar como remetente, não forçamos ele a responder
  // imediatamente em loop. Ele pode receber mensagens enquanto o motor tenta
  // recuperar a sessão; no próximo ciclo volta a ter chance de enviar.
  const coolingSenders = new Set(senderFailures.keys());

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
    if (coolingSenders.has(from.id)) continue;
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
        const count = pairCount.get(pairKey(a.id, b.id)) ?? 0;
        if (!best || count < best.count) best = { a, b, count };
      }
    }
    if (!best) break;
    const aFailures = senderFailures.get(best.a.id) ?? 0;
    const bFailures = senderFailures.get(best.b.id) ?? 0;
    const aCooling = coolingSenders.has(best.a.id);
    const bCooling = coolingSenders.has(best.b.id);
    if (aCooling || bCooling) {
      pairs.push(aCooling ? { from: best.b, to: best.a } : { from: best.a, to: best.b });
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

  const history = await getPairHistory(supabaseAdmin, group.id, from.id, to.id);
  const messageContent = await generateMessageFast(supabaseAdmin, group.user_id, from.id, to.id, history, group.ai_model ?? null);
  const cleanMessage = String(messageContent ?? "").trim();
  if (!cleanMessage) {
    return await logPairResult(supabaseAdmin, group, from, to, "mensagem vazia", "failed", "mensagem vazia: Evolution exige o campo text");
  }

  const typingMs = Math.min(250, Math.max(80, cleanMessage.length * 3));
  const toNumber = normalizePhone(to.phone);
  const sendTargets = await resolveSendTargets(evolution, from.evolution_instance, to);

  let status = "sent";
  let errMsg: string | null = null;
  let lidTargetCache: { number: string; remoteJid: string } | null | undefined;

  await broadcast("typing_start", {
    group_id: group.id,
    from_id: from.id,
    to_id: to.id,
    from_name: from.name ?? "Chip",
    to_name: to.name ?? "Chip",
  });

  const discoverLidTarget = async () => {
    if (lidTargetCache !== undefined) return lidTargetCache;
    const pickJid = (raw: unknown): { number: string; remoteJid: string } | null => {
      const jid = String(raw ?? "").trim();
      const m = jid.match(/(\d+@lid)/i);
      if (!m) return null;
      const clean = m[1];
      return { number: clean, remoteJid: clean };
    };
    const scanRecord = (rec: any): { number: string; remoteJid: string } | null => {
      // Evolution retorna o mapeamento @lid em campos diferentes dependendo da
      // versão: `lid`, `jid`, `id`, `remoteJid`, `owner`. Como fallback, procura
      // qualquer `\d+@lid` no JSON serializado do registro para não perder o
      // destino quando o campo é aninhado.
      const direct =
        pickJid(rec?.lid) ??
        pickJid(rec?.jid) ??
        pickJid(rec?.remoteJid) ??
        pickJid(rec?.id) ??
        pickJid(rec?.number) ??
        pickJid(rec?.owner);
      if (direct) return direct;
      try {
        const blob = JSON.stringify(rec ?? {});
        return pickJid(blob);
      } catch {
        return null;
      }
    };
    try {
      const resolved = await evolution.whatsappNumbers(from.evolution_instance, [toNumber]);
      for (const rec of normalizeEvolutionRecords(resolved)) {
        const t = scanRecord(rec);
        if (t) return (lidTargetCache = t);
      }
    } catch {}
    try {
      const contacts = await evolution.findContacts(from.evolution_instance);
      for (const rec of normalizeEvolutionRecords(contacts)) {
        const blob = (() => { try { return JSON.stringify(rec ?? {}); } catch { return ""; } })();
        if (!blob.includes(toNumber)) continue;
        const t = scanRecord(rec);
        if (t) return (lidTargetCache = t);
      }
    } catch {}
    lidTargetCache = null;
    return null;
  };

  const isRecipientIdError = (message: string | null | undefined) =>
    /cannot read properties of undefined \(reading ['"]id['"]\)|reading ['"]id['"]|exists[^\n]*false[^\n]*@lid|@lid/i.test(String(message ?? ""));

  const attemptSend = async (): Promise<DeliveryAck> => {
    let lastErr: any = null;
    for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS_PER_PAIR; attempt++) {
      const targets = [...sendTargets];
      for (const target of targets) {
        try {
          if (attempt > 0) await ensureOpenSession(evolution, from.evolution_instance, true);
          markLatestIncomingAsRead(evolution, from.evolution_instance, target.remoteJid).catch(() => null);
          primeChatSession(evolution, from.evolution_instance, target.number).catch(() => null);
          evolution.sendPresence(from.evolution_instance, target.number, "composing", typingMs).catch(() => null);
          await new Promise((r) => setTimeout(r, typingMs));
          const sentAtMs = Date.now();
          const sendResp = await evolution.sendText(from.evolution_instance, target.number, cleanMessage);
          const messageId = extractMessageId(sendResp);
          const ackJid = extractRemoteJid(sendResp) ?? target.remoteJid;
          return await waitForDeliveryAck(evolution, from.evolution_instance, ackJid, messageId, cleanMessage, sentAtMs);
        } catch (sendErr: any) {
          lastErr = sendErr;
          // Evolution 400 "reading 'id'" = Baileys não conseguiu resolver o
          // destinatário porque o contato está no cache apenas como @lid.
          // Descobrimos o JID @lid uma única vez e reenviamos.
          if (isRecipientIdError(sendErr?.message) && !targets.some((t) => /@lid$/i.test(t.number))) {
            const lid = await discoverLidTarget();
            if (lid && !targets.some((t) => t.number === lid.number)) {
              targets.push(lid);
              continue;
            }
          }
          if (!isClosedSessionError(sendErr?.message) && !isDeliverySyncFailure(sendErr?.message)) break;
          await repairSenderSession(evolution, from.evolution_instance, target.number);
        }
      }
      if (!isClosedSessionError(lastErr?.message) && !isDeliverySyncFailure(lastErr?.message)) break;
      await new Promise((r) => setTimeout(r, SESSION_SETTLE_MS));
    }
    throw lastErr ?? new Error(`Não foi possível resolver o destinatário ${toNumber}`);
  };

  try {
    let ack = await attemptSend();
    // ERROR explícito indica sessão dessincronizada. Força recuperação e tenta
    // várias vezes antes de registrar falha, porque resposta recebida é prioridade.
    for (let retry = 0; ack.explicitError && retry < 1; retry++) {
      try {
        await repairSenderSession(evolution, from.evolution_instance, toNumber);
        await new Promise((r) => setTimeout(r, SESSION_SETTLE_MS));
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
      await repairSenderSession(evolution, from.evolution_instance, toNumber);
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

  const friendlyErr = friendlyErrorMessage(errMsg);
  await supabaseAdmin.from("warmup_logs").insert({
    user_id: group.user_id,
    group_id: group.id,
    from_instance_id: from.id,
    to_instance_id: to.id,
    content: cleanMessage,
    status,
    error: friendlyErr,
  });
  if (status === "failed") errMsg = friendlyErr;

  if (status === "failed") {
    await quarantineSenderForRepair(supabaseAdmin, evolution, group.id, from, errMsg);
  }

  return { group: group.id, from: from.id, to: to.id, status, error: errMsg ?? undefined };
}

async function quarantineSenderForRepair(supabaseAdmin: any, evolution: any, groupId: string, from: Chip, errMsg: string | null) {
  if (!isRepairableSessionFailure(errMsg)) return;
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
    if (log.status === "failed" && isRepairableSessionFailure(log.error)) consecutiveFailures++;
  }
  if (consecutiveFailures < 2) return;

  // Não derruba pareamento automaticamente. Antes, depois de algumas falhas,
  // o motor fazia logout e colocava o chip em QR; isso tirava números saudáveis
  // do rodízio e parecia que "parou de vez". A recuperação agora é apenas
  // restart/connect, preservando o vínculo do WhatsApp.
  await recoverOpenSession(evolution, from.evolution_instance, true);
  await markInstance(supabaseAdmin, from.id, "connected");
  from.status = "connected";
  from.temporarily_unavailable = false;
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

async function generateMessageFast(supabaseAdmin: any, userId: string, fromId: string, toId: string, history: any[], aiModel: string | null) {
  return await withTimeout(
    generateMessage(supabaseAdmin, userId, fromId, toId, history, aiModel),
    AI_GENERATION_TIMEOUT_MS,
    () => fallbackMessage(history),
  );
}

async function generateMessage(supabaseAdmin: any, userId: string, fromId: string, toId: string, history: any[], aiModel: string | null) {
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
      model: aiModel,
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

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fallbackMessage(history: any[]) {
  const last = String(history?.[history.length - 1]?.content ?? "").toLowerCase();
  const replies = last.includes("?")
    ? ["pior que sim kkk e vc?", "acho que sim viu, e por aí?", "demais kkk como tá aí?", "não sei não hein kkk e tu?"]
    : ["kkkk sério?", "nossa mano kkk", "eita, aí é complicado", "pior que faz sentido", "tô ligado kkk", "aí sim hein"];
  return replies[Math.floor(Math.random() * replies.length)];
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

async function resolveSendTargets(evolution: any, instanceName: string, chip: Chip) {
  const phone = normalizePhone(chip.phone);
  const phoneJid = `${phone}@s.whatsapp.net`;
  const fallback = { number: phone, remoteJid: phoneJid };
  const targets: Array<{ number: string; remoteJid: string }> = [];
  const addTarget = (value: unknown, sendAs?: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;
    const isJid = /@(s\.whatsapp\.net|lid)$/i.test(raw);
    const digits = normalizePhone(raw);
    if (!isJid && digits !== phone) return;
    const remoteJid = isJid ? raw : `${digits}@s.whatsapp.net`;
    const sendRaw = String(sendAs ?? "").trim();
    const sendDigits = normalizePhone(sendRaw);
    const number = sendRaw && /@(s\.whatsapp\.net|lid)$/i.test(sendRaw)
      ? sendRaw
      : sendDigits || (/@lid$/i.test(remoteJid) ? phoneJid : digits);
    if (!number || targets.some((t) => t.number === number || t.remoteJid === remoteJid)) return;
    targets.push({ number, remoteJid });
  };

  // Primeiro tenta sempre o formato real phone@s.whatsapp.net. Este é o JID
  // correto que contorna o bug de algumas versões da Evolution/Baileys que
  // resolvem o contato como @lid e quebram com "reading id".
  addTarget(phoneJid, phoneJid);
  addTarget(phone, phone);

  try {
    const resolved = await evolution.whatsappNumbers(instanceName, [phone]);
    for (const rec of normalizeEvolutionRecords(resolved)) {
      if (rec?.exists === false && !String(rec?.jid ?? rec?.number ?? rec?.remoteJid ?? "").includes("@lid")) {
        throw new Error(`Destinatário ${phone} não está no WhatsApp`);
      }
      const real = extractRealPhoneJid(rec, phone);
      if (real) addTarget(real, real);
      addTarget(rec?.jid);
      addTarget(rec?.remoteJid);
      addTarget(rec?.remoteJidAlt, rec?.remoteJidAlt);
      addTarget(rec?.participantAlt, rec?.participantAlt);
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
      const real = extractRealPhoneJid(rec, phone);
      if (real) addTarget(real, real);
      addTarget(rec?.id);
      addTarget(rec?.jid);
      addTarget(rec?.remoteJid);
      addTarget(rec?.remoteJidAlt, rec?.remoteJidAlt);
      addTarget(rec?.participantAlt, rec?.participantAlt);
      addTarget(rec?.number);
    }
  } catch {}

  addTarget(phoneJid, phoneJid);
  return targets.length ? targets : [fallback];
}

function extractRealPhoneJid(record: any, phone: string) {
  const candidates = [
    record?.remoteJidAlt,
    record?.participantAlt,
    record?.key?.remoteJidAlt,
    record?.key?.participantAlt,
    record?.message?.key?.remoteJidAlt,
    record?.message?.key?.participantAlt,
    record?.data?.key?.remoteJidAlt,
    record?.data?.key?.participantAlt,
    record?.jid,
    record?.remoteJid,
    record?.id,
    record?.number,
  ];
  for (const value of candidates) {
    const raw = String(value ?? "").trim();
    if (/@s\.whatsapp\.net$/i.test(raw) && normalizePhone(raw) === phone) return raw;
    if (normalizePhone(raw) === phone) return `${phone}@s.whatsapp.net`;
  }
  try {
    const blob = JSON.stringify(record ?? {});
    const explicit = blob.match(new RegExp(`(${phone}(?::\\d+)?@s\\.whatsapp\\.net)`, "i"))?.[1];
    if (explicit) return explicit;
    if (blob.includes(phone)) return `${phone}@s.whatsapp.net`;
  } catch {}
  return null;
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

function createBroadcast(userId: string) {
  return async (event: string, payload: any) => {
    try {
      await fetch(`${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({ messages: [{ topic: `ai-engine-live:${userId}`, event, payload: { ...payload, user_id: userId } }] }),
      });
    } catch {}
  };
}

async function scheduleNext(supabaseAdmin: any, g: any) {
  const configuredMin = Math.max(1, Number(g.min_delay_seconds ?? 60));
  const min = Math.min(configuredMin, FALLBACK_MAX_DELAY_SECONDS);
  const configuredMax = Math.max(Number(g.max_delay_seconds ?? MAX_DELAY_SECONDS), configuredMin);
  const max = Math.max(Math.min(configuredMax, FALLBACK_MAX_DELAY_SECONDS), min);
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
  return /remetente n[aã]o abriu sess[aã]o|sender has not opened session|connection closed|no sessions|sessionerror|stream errored|timed out|1006|cannot read properties of undefined|reading 'id'/i.test(String(message ?? ""));
}

function isDeliverySyncFailure(message: string | null | undefined) {
  return /whatsapp retornou error|sem confirma[cç][aã]o|n[aã]o entregue|sess[aã]o pode estar dessincronizada/i.test(String(message ?? ""));
}

function isRepairableSessionFailure(message: string | null | undefined) {
  return isDeliverySyncFailure(message) || /remetente n[aã]o abriu sess[aã]o|destinat[aá]rio n[aã]o confirmou sess[aã]o aberta|sender has not opened session|connection closed|no sessions|sessionerror|stream errored|timed out|1006|cannot read properties of undefined|reading 'id'/i.test(String(message ?? ""));
}

function friendlyErrorMessage(raw: string | null | undefined): string | null {
  const msg = String(raw ?? "").trim();
  if (!msg) return null;
  if (/cannot read properties of undefined \(reading ['"]id['"]\)|reading ['"]id['"]/i.test(msg))
    return "WhatsApp não conseguiu localizar o destinatário (contato @lid). O motor tentou reconciliar automaticamente.";
  if (/whatsapp retornou error/i.test(msg))
    return "WhatsApp recusou a entrega. A sessão do número pode estar dessincronizada — tente Recriar sessão.";
  if (/sem confirma[cç][aã]o|n[aã]o entregue|dessincronizada/i.test(msg))
    return "Mensagem enviada, mas o WhatsApp não confirmou a entrega. Sessão pode estar instável.";
  if (/sender has not opened session|remetente n[aã]o abriu sess[aã]o|no sessions|sessionerror/i.test(msg))
    return "Sessão do WhatsApp fechada no servidor. O motor está tentando reabrir.";
  if (/connection closed|stream errored|1006|timed out/i.test(msg))
    return "Conexão com o WhatsApp caiu. O motor está reconectando.";
  if (/n[aã]o est[aá] no whatsapp/i.test(msg))
    return "Destinatário não está no WhatsApp.";
  if (msg.length > 160) return msg.slice(0, 157) + "…";
  return msg;
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
  for (let i = 0; i < 2; i++) {
    if (await isOpen(evolution, instanceName)) return true;
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

async function ensureOpenSession(evolution: any, instanceName: string, forceRestart = false) {
  // Se o painel já reporta a instância como conectada, o motor deve manter os
  // envios acontecendo. Fazemos múltiplas rodadas de recuperação (connect +
  // restart) antes de considerar a sessão indisponível.
  if (await isOpen(evolution, instanceName)) return true;

  // Rodada 1: connect suave.
  try { await evolution.connect(instanceName); } catch {}
  if (await waitForOpen(evolution, instanceName)) return true;

  // Rodada 2: restart preservando o pareamento (recria o socket Baileys).
  try { await evolution.restart(instanceName); } catch {}
  if (await waitForOpen(evolution, instanceName)) return true;

  // Rodada final (apenas para o remetente): um connect extra depois do restart.
  if (forceRestart) {
    try { await evolution.connect(instanceName); } catch {}
    if (await waitForOpen(evolution, instanceName)) return true;
  }

  return false;
}

async function primeChatSession(evolution: any, instanceName: string, number: string) {
  // Faz uma leitura leve do contato antes do envio. Isso força a Evolution/
  // Baileys a resolver o JID do destinatário e reduz o erro temporário de sessão
  // ainda não aberta no primeiro envio entre dois chips.
  try {
    await evolution.whatsappNumbers(instanceName, [normalizePhone(number)]);
  } catch {}
  try {
    await evolution.sendPresence(instanceName, number, "paused", 300);
  } catch {}
  await new Promise((r) => setTimeout(r, 700));
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

async function repairSenderSession(evolution: any, instanceName: string, peerNumber?: string | null) {
  // Recuperação mais agressiva para o caso "recebe mas não envia". A sessão
  // pode estar aberta para receber push do WhatsApp, porém sem chaves válidas
  // para criptografar o envio; connect/restart + resolução do contato ajuda a
  // reconstruir a sessão antes da próxima tentativa.
  try {
    await evolution.connect(instanceName);
  } catch {}
  await new Promise((r) => setTimeout(r, SESSION_SETTLE_MS));

  try {
    await evolution.restart(instanceName);
  } catch {}
  await new Promise((r) => setTimeout(r, SESSION_SETTLE_MS));

  try {
    await evolution.connect(instanceName);
  } catch {}

  const normalizedPeer = normalizePhone(peerNumber);
  if (normalizedPeer) {
    try {
      await evolution.whatsappNumbers(instanceName, [normalizedPeer]);
    } catch {}
  }

  return await waitForOpen(evolution, instanceName);
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

async function waitForDeliveryAck(evolution: any, instanceName: string, remoteJid: string, messageId?: string, text?: string, sentAtMs?: number): Promise<DeliveryAck> {
  const deadline = Date.now() + DELIVERY_ACK_WAIT_MS;
  let lastStatus: string | null = null;
  let sawRecord = false;
  while (Date.now() < deadline) {
    try {
      const records = await findOutgoingMessageRecords(evolution, instanceName, remoteJid, messageId);
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
      sawRecord = true;
      lastStatus = canonicalDeliveryStatus(extractDeliveryStatus(rec)) ?? lastStatus;
      const s = String(lastStatus ?? "").toUpperCase();
      // Entrega real: dispositivo do destinatário confirmou recebimento.
      if (s === "DELIVERY_ACK" || s === "READ" || s === "PLAYED") {
        return { delivered: true, explicitError: false, ack: lastStatus };
      }
      if (s === "ERROR") {
        return { delivered: false, explicitError: true, error: "WhatsApp retornou ERROR para a entrega" };
      }
      // PENDING/SERVER_ACK: só o servidor do WhatsApp aceitou; o celular do
      // destinatário ainda não recebeu. Continua aguardando dentro da janela.
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    } catch (e: any) {
      lastStatus = e?.message ?? lastStatus;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Ficou preso em SERVER_ACK/PENDING: mensagem saiu do remetente mas o
  // destinatário nunca recebeu. Tratamos como falha para acionar a recuperação
  // de sessão em vez de mentir que foi entregue.
  const s = String(lastStatus ?? "").toUpperCase();
  if (sawRecord && (s === "SERVER_ACK" || s === "PENDING")) {
    return {
      delivered: false,
      explicitError: true,
      error: `mensagem não entregue ao destinatário (${lastStatus}) — sessão pode estar dessincronizada`,
    };
  }
  if (!sawRecord) {
    return {
      delivered: false,
      explicitError: true,
      error: "mensagem aceita pela Evolution, mas sem confirmação real no WhatsApp — sessão pode estar dessincronizada",
    };
  }
  return {
    delivered: false,
    explicitError: true,
    error: `mensagem sem confirmação de entrega (${lastStatus ?? "status desconhecido"}) — sessão pode estar dessincronizada`,
  };
}

async function findOutgoingMessageRecords(evolution: any, instanceName: string, remoteJid: string, messageId?: string) {
  const searches: any[] = [];

  // O findStatusMessage é a fonte correta do Evolution para status/ACK. Usar
  // apenas findMessages fazia alguns envios ficarem como "sent" mesmo presos em
  // PENDING/SERVER_ACK, principalmente quando o WhatsApp alterna @s.whatsapp.net
  // e @lid para o mesmo contato.
  if (messageId) {
    try {
      searches.push(await evolution.findStatusMessage(instanceName, { id: messageId, fromMe: true }, 50));
    } catch {}
  }
  if (remoteJid) {
    try {
      searches.push(await evolution.findStatusMessage(instanceName, { remoteJid, fromMe: true }, 50));
    } catch {}
  }
  try {
    searches.push(await evolution.findMessages(instanceName, remoteJid));
  } catch {}

  const records: any[] = [];
  for (const payload of searches) records.push(...normalizeEvolutionRecords(payload));
  return records;
}

function extractDeliveryStatus(record: any) {
  const updates = [
    ...(Array.isArray(record?.MessageUpdate) ? record.MessageUpdate : []),
    ...(Array.isArray(record?.messageUpdate) ? record.messageUpdate : []),
    ...(Array.isArray(record?.updates) ? record.updates : []),
  ];
  const lastUpdate = updates[updates.length - 1];
  return (
    lastUpdate?.status ??
    record?.status ??
    record?.ack ??
    record?.message?.status ??
    record?.message?.ack ??
    record?.data?.status ??
    null
  );
}

function canonicalDeliveryStatus(raw: any) {
  if (raw == null) return null;
  const value = String(raw).toUpperCase();
  // Baileys/Evolution pode devolver número em vez de texto:
  // 0 ERROR, 1 PENDING, 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ, 5 PLAYED.
  if (value === "0") return "ERROR";
  if (value === "1") return "PENDING";
  if (value === "2") return "SERVER_ACK";
  if (value === "3") return "DELIVERY_ACK";
  if (value === "4") return "READ";
  if (value === "5") return "PLAYED";
  return value;
}
