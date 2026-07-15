import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron de limpeza / policiamento de assinaturas de número.
 *
 * O Pagar.me faz a cobrança recorrente sozinho (subscription com automatic_pix
 * ou credit_card), então este endpoint NÃO gera QR/cobrança manualmente.
 * Ele apenas:
 *  - move para past_due assinaturas com period_end vencido há > 3 dias
 *  - cancela assinaturas past_due há > 10 dias
 *
 * Chamar 1x por dia via pg_cron.
 */
export const Route = createFileRoute("/api/public/hooks/billing-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const now = new Date();
        const nowIso = now.toISOString();
        const grace3d = new Date(now.getTime() - 3 * 86400_000).toISOString();
        const grace10d = new Date(now.getTime() - 10 * 86400_000).toISOString();

        const { count: pastDue } = await supabaseAdmin
          .from("number_subscriptions")
          .update({ status: "past_due" }, { count: "exact" })
          .eq("status", "active")
          .lt("current_period_end", grace3d);

        const { count: canceled } = await supabaseAdmin
          .from("number_subscriptions")
          .update(
            { status: "canceled", canceled_at: nowIso },
            { count: "exact" },
          )
          .eq("status", "past_due")
          .lt("current_period_end", grace10d);

        return Response.json({ ok: true, past_due: pastDue ?? 0, canceled: canceled ?? 0 });
      },
    },
  },
});
