import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint. Called by pg_cron every minute.
// Iterates active warmup groups whose next_run_at <= now(), picks a random
// pair of connected members and sends one message via Evolution API.

export const Route = createFileRoute("/api/public/hooks/warmup-tick")({
  server: {
    handlers: {
      POST: async () => {
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
            const members = ((g as any).warmup_group_members ?? [])
              .map((m: any) => m.whatsapp_instances)
              .filter((i: any) => i && i.status === "connected" && i.phone);

            // Marca warmup_started_at para números já conectados que ainda não têm data
            for (const m of members) {
              if (!(m as any).warmup_started_at) {
                await supabaseAdmin
                  .from("whatsapp_instances")
                  .update({ warmup_started_at: new Date().toISOString() } as any)
                  .eq("id", m.id)
                  .is("warmup_started_at", null);
              }
            }

            if (members.length < 2) {
              await scheduleNext(supabaseAdmin, g);
              continue;
            }

            // Determine each member's conversational state within this group.
            // Rule: a number can only be in ONE active conversation at a time.
            // If A sent to B and B hasn't replied yet, A is "waiting" and B "owes reply to A".
            // Only "idle" numbers can start a new conversation. "Owes reply" numbers MUST reply first.
            const { data: recentLogs } = await supabaseAdmin
              .from("warmup_logs")
              .select("from_instance_id, to_instance_id, status, created_at")
              .eq("group_id", (g as any).id)
              .eq("status", "sent")
              .order("created_at", { ascending: false })
              .limit(200);

            // For each instance, find the most recent log it participated in.
            const lastByInstance = new Map<string, any>();
            for (const log of recentLogs ?? []) {
              if (log.from_instance_id && !lastByInstance.has(log.from_instance_id)) lastByInstance.set(log.from_instance_id, log);
              if (log.to_instance_id && !lastByInstance.has(log.to_instance_id)) lastByInstance.set(log.to_instance_id, log);
            }

            // Timeout: if waiting > 30 min, free the number to start a new conversation.
            const REPLY_TIMEOUT_MS = 30 * 60 * 1000;
            const nowMs = Date.now();

            type State = { kind: "idle" } | { kind: "waiting"; peerId: string } | { kind: "owes"; peerId: string };
            const stateOf = (id: string): State => {
              const last = lastByInstance.get(id);
              if (!last) return { kind: "idle" };
              const age = nowMs - new Date(last.created_at).getTime();
              if (age > REPLY_TIMEOUT_MS) return { kind: "idle" };
              if (last.from_instance_id === id) return { kind: "waiting", peerId: last.to_instance_id };
              return { kind: "owes", peerId: last.from_instance_id };
            };

            // Hard invariant: a number can only participate in ONE active
            // conversation at a time. `busy` = waiting for a reply OR owes a reply.
            const busy = new Set<string>();
            for (const m of members) {
              const s = stateOf(m.id);
              if (s.kind !== "idle") busy.add(m.id);
            }

            // First priority: whoever owes a reply MUST reply before anything else.
            // Peer is guaranteed to be their exclusive counterpart (both busy with each other).
            let from: any = null;
            let to: any = null;
            const shuffled = [...members].sort(() => Math.random() - 0.5);
            for (const m of shuffled) {
              const s = stateOf(m.id);
              if (s.kind === "owes") {
                const peer = members.find((x: any) => x.id === s.peerId);
                if (peer) {
                  from = m;
                  to = peer;
                  break;
                }
              }
            }

            // Second: start a new conversation between TWO idle instances.
            // Rotate: pick the idle pair with the FEWEST prior exchanges so, over time,
            // every chip talks with every other chip (N-1 peers each) evenly.
            if (!from) {
              const idle = shuffled.filter((m: any) => !busy.has(m.id));
              if (idle.length >= 2) {
                // Count historical exchanges per pair from the fetched logs.
                const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
                const pairCount = new Map<string, number>();
                for (const log of recentLogs ?? []) {
                  if (!log.from_instance_id || !log.to_instance_id) continue;
                  const k = pairKey(log.from_instance_id, log.to_instance_id);
                  pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
                }
                let best: { a: any; b: any; count: number } | null = null;
                for (let i = 0; i < idle.length; i++) {
                  for (let j = i + 1; j < idle.length; j++) {
                    const a = idle[i];
                    const b = idle[j];
                    const c = pairCount.get(pairKey(a.id, b.id)) ?? 0;
                    if (!best || c < best.count) best = { a, b, count: c };
                  }
                }
                if (best) {
                  from = best.a;
                  to = best.b;
                }
              }
            }

            if (!from || !to) {
              await scheduleNext(supabaseAdmin, g);
              continue;
            }

            // Final safety check: neither side may be engaged with a third party.
            const fromState = stateOf(from.id);
            const toState = stateOf(to.id);
            const fromOk = fromState.kind === "idle" || (fromState.kind === "owes" && fromState.peerId === to.id);
            const toOk = toState.kind === "idle" || (toState.kind === "waiting" && toState.peerId === from.id);
            if (!fromOk || !toOk) {
              await scheduleNext(supabaseAdmin, g);
              continue;
            }


            // Fetch recent conversation history between this pair (both directions)
            const { data: recent } = await supabaseAdmin
              .from("warmup_logs")
              .select("from_instance_id, to_instance_id, content, created_at")
              .eq("group_id", (g as any).id)
              .or(
                `and(from_instance_id.eq.${from.id},to_instance_id.eq.${to.id}),and(from_instance_id.eq.${to.id},to_instance_id.eq.${from.id})`,
              )
              .eq("status", "sent")
              .order("created_at", { ascending: true })
              .limit(10);

            const history = (recent ?? []).map((r: any) => ({
              from: r.from_instance_id === from.id ? "__me__" : "__other__",
              content: r.content as string,
            }));

            // Broadcast "typing" event so the UI shows a real typing indicator BEFORE we generate/send.
            const broadcast = async (event: string, payload: any) => {
              try {
                await fetch(`${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
                    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                  },
                  body: JSON.stringify({
                    messages: [{ topic: "ai-engine-live", event, payload }],
                  }),
                });
              } catch {}
            };
            await broadcast("typing_start", {
              group_id: (g as any).id,
              from_id: from.id,
              to_id: to.id,
              from_name: from.name ?? "Chip",
              to_name: to.name ?? "Chip",
            });

            // Generate reply via AI, fallback to template pool if AI fails
            let messageContent = "";
            try {
              const { generateReply } = await import("@/lib/ai.server");
              const pairSeed = [from.id, to.id].sort().join(":");
              messageContent = await generateReply(history, { pairSeed });
            } catch (aiErr: any) {
              const { data: templates } = await supabaseAdmin
                .from("message_templates")
                .select("content")
                .or(`is_global.eq.true,user_id.eq.${(g as any).user_id}`)
                .limit(200);
              if (templates?.length) {
                messageContent = templates[Math.floor(Math.random() * templates.length)].content;
              } else {
                messageContent = "oi";
              }
            }

            // Tempo realista de digitação: ~55ms por caractere, entre 1.4s e 9s.
            const typingMs = Math.min(9000, Math.max(1400, messageContent.length * 55));

            const toNumber = String(to.phone).replace(/\D/g, "");
            let status = "sent";
            let errMsg: string | null = null;
            try {
              // Mostra "digitando..." no WhatsApp do destinatário (cosmético, real)
              await evolution.sendPresence(from.evolution_instance, toNumber, "composing", typingMs);
              // Aguarda o tempo de digitação antes de enviar de fato
              await new Promise((r) => setTimeout(r, typingMs));
              await evolution.sendText(from.evolution_instance, toNumber, messageContent);
            } catch (e: any) {
              status = "failed";
              errMsg = e?.message ?? "erro";
            } finally {
              await broadcast("typing_end", { group_id: (g as any).id, from_id: from.id, to_id: to.id });
            }

            await supabaseAdmin.from("warmup_logs").insert({
              user_id: (g as any).user_id,
              group_id: (g as any).id,
              from_instance_id: from.id,
              to_instance_id: to.id,
              content: messageContent,
              status,
              error: errMsg,
            });

            await scheduleNext(supabaseAdmin, g);
            results.push({ group: (g as any).id, from: from.id, to: to.id, status });
          } catch (e: any) {
            results.push({ group: (g as any).id, error: e?.message });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});

async function scheduleNext(supabaseAdmin: any, g: any) {
  const min = g.min_delay_seconds ?? 60;
  const max = Math.max(g.max_delay_seconds ?? 300, min);
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  const next = new Date(Date.now() + delay * 1000).toISOString();
  await supabaseAdmin.from("warmup_groups").update({ next_run_at: next }).eq("id", g.id);
}
