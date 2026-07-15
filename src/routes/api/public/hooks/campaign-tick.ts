import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint. Called by pg_cron every minute.
// For each running campaign, sends the next pending message respecting delay,
// active hours and per-instance daily limit. Round-robins across the campaign's
// selected connected instances so the warm-up keeps running in parallel.

export const Route = createFileRoute("/api/public/hooks/campaign-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { evolution } = await import("@/lib/evolution.server");

        const nowIso = new Date().toISOString();
        const { data: camps, error } = await supabaseAdmin
          .from("campaigns")
          .select(
            "id, user_id, message, media_url, media_type, media_filename, min_delay_seconds, max_delay_seconds, per_instance_daily_limit, active_hour_start, active_hour_end, campaign_instances(instance_id, whatsapp_instances(id, evolution_instance, status, phone, warmup_started_at))",
          )
          .eq("status", "running")
          .lte("next_run_at", nowIso)
          .limit(50);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results: any[] = [];
        for (const c of camps ?? []) {
          try {
            const hour = new Date().getUTCHours() - 3; // BRT approx
            const h = (hour + 24) % 24;
            if (h < (c as any).active_hour_start || h >= (c as any).active_hour_end) {
              await scheduleNext(supabaseAdmin, c);
              continue;
            }

            const WARMUP_MS = 3 * 24 * 60 * 60 * 1000;
            const nowMs = Date.now();
            const instances = ((c as any).campaign_instances ?? [])
              .map((ci: any) => ci.whatsapp_instances)
              .filter((i: any) => {
                if (!i || i.status !== "connected") return false;
                if (!i.warmup_started_at) return false;
                return nowMs - new Date(i.warmup_started_at).getTime() >= WARMUP_MS;
              });
            if (instances.length === 0) {
              await scheduleNext(supabaseAdmin, c);
              continue;
            }

            // Count sent today per instance for this campaign
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const { data: sentRows } = await supabaseAdmin
              .from("campaign_targets")
              .select("instance_id")
              .eq("campaign_id", (c as any).id)
              .eq("status", "sent")
              .gte("sent_at", today.toISOString());
            const perInstance: Record<string, number> = {};
            for (const r of sentRows ?? []) {
              if (r.instance_id) perInstance[r.instance_id] = (perInstance[r.instance_id] ?? 0) + 1;
            }
            const limit = (c as any).per_instance_daily_limit;
            const eligible = instances.filter((i: any) => (perInstance[i.id] ?? 0) < limit);
            if (eligible.length === 0) {
              await scheduleNext(supabaseAdmin, c);
              continue;
            }
            // Pick instance with fewest sends today
            eligible.sort((a: any, b: any) => (perInstance[a.id] ?? 0) - (perInstance[b.id] ?? 0));
            const inst = eligible[0];

            // Pick next pending target
            const { data: target } = await supabaseAdmin
              .from("campaign_targets")
              .select("id, phone, name")
              .eq("campaign_id", (c as any).id)
              .eq("status", "pending")
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (!target) {
              await supabaseAdmin.from("campaigns").update({ status: "done" }).eq("id", (c as any).id);
              continue;
            }

            const msg = String((c as any).message).replace(/\{nome\}/gi, (target as any).name ?? "");
            const toNumber = String((target as any).phone).replace(/\D/g, "");
            let status = "sent";
            let errMsg: string | null = null;
            try {
              await evolution.sendText(inst.evolution_instance, toNumber, msg);
            } catch (e: any) {
              status = "failed";
              errMsg = e?.message ?? "erro";
            }
            await supabaseAdmin
              .from("campaign_targets")
              .update({
                status,
                error: errMsg,
                instance_id: inst.id,
                sent_at: new Date().toISOString(),
              })
              .eq("id", (target as any).id);

            await scheduleNext(supabaseAdmin, c);
            results.push({ campaign: (c as any).id, to: toNumber, from: inst.id, status });
          } catch (e: any) {
            results.push({ campaign: (c as any).id, error: e?.message });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});

async function scheduleNext(supabaseAdmin: any, c: any) {
  const min = c.min_delay_seconds ?? 30;
  const max = Math.max(c.max_delay_seconds ?? 90, min);
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  const next = new Date(Date.now() + delay * 1000).toISOString();
  await supabaseAdmin.from("campaigns").update({ next_run_at: next }).eq("id", c.id);
}
