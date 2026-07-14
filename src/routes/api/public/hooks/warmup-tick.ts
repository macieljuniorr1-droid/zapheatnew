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

            // check daily limit + plan limit
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const { count: sentToday } = await supabaseAdmin
              .from("warmup_logs")
              .select("id", { count: "exact", head: true })
              .eq("user_id", (g as any).user_id)
              .eq("status", "sent")
              .gte("created_at", today.toISOString());

            const { data: sub } = await supabaseAdmin
              .from("subscriptions")
              .select("plans(max_messages_per_day)")
              .eq("user_id", (g as any).user_id)
              .maybeSingle();
            const planLimit = (sub as any)?.plans?.max_messages_per_day ?? 20;
            const limit = Math.min((g as any).daily_limit, planLimit);
            if ((sentToday ?? 0) >= limit) {
              await scheduleNext(supabaseAdmin, g);
              continue;
            }

            const shuffled = members.sort(() => Math.random() - 0.5);
            const from = shuffled[0];
            const to = shuffled[1];

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
