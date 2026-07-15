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
            "id, user_id, min_delay_seconds, max_delay_seconds, daily_limit, warmup_group_members(instance_id, whatsapp_instances(id, evolution_instance, status, phone))",
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

            // First priority: any instance that owes a reply and its peer is expecting one.
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

            // Second: pick two idle instances to start a fresh conversation.
            if (!from) {
              const idle = shuffled.filter((m: any) => stateOf(m.id).kind === "idle");
              if (idle.length >= 2) {
                from = idle[0];
                to = idle[1];
              }
            }

            if (!from || !to) {
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

            // Generate reply via AI, fallback to template pool if AI fails
            let messageContent = "";
            try {
              const { generateReply } = await import("@/lib/ai.server");
              messageContent = await generateReply(history);
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

            const toNumber = String(to.phone).replace(/\D/g, "");
            let status = "sent";
            let errMsg: string | null = null;
            try {
              await evolution.sendText(from.evolution_instance, toNumber, messageContent);
            } catch (e: any) {
              status = "failed";
              errMsg = e?.message ?? "erro";
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
