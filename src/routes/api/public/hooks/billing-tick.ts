import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron de cobrança recorrente.
 * Deve ser chamado periodicamente (ex: a cada 1h via pg_cron).
 *
 *   POST https://zapheatnew.lovable.app/api/public/hooks/billing-tick
 *
 * Regras por number_subscription:
 *  - PIX: 2 dias antes do current_period_end, gera novo QR e salva em
 *    last_pix_qr_code/last_charge_url. renewal_order_id guarda a nova order.
 *    O webhook do Pagar.me confirma o pagamento e estende current_period_end.
 *  - Cartão: no vencimento, tenta cobrar via card_id salvo (recorrência real).
 *  - Vencido sem pagar 3 dias → past_due. 10 dias → canceled.
 */
export const Route = createFileRoute("/api/public/hooks/billing-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pagarme } = await import("@/lib/pagarme.server");

        const now = new Date();
        const nowIso = now.toISOString();
        const in3d = new Date(now.getTime() + 3 * 86400_000).toISOString();
        const grace3d = new Date(now.getTime() - 3 * 86400_000).toISOString();
        const grace10d = new Date(now.getTime() - 10 * 86400_000).toISOString();
        const cooldown = new Date(now.getTime() - 20 * 3600_000).toISOString();

        const results: any[] = [];

        // 1) Move assinaturas expiradas para past_due / canceled
        await supabaseAdmin
          .from("number_subscriptions")
          .update({ status: "past_due" })
          .eq("status", "active")
          .lt("current_period_end", grace3d);

        await supabaseAdmin
          .from("number_subscriptions")
          .update({ status: "canceled", canceled_at: nowIso })
          .eq("status", "past_due")
          .lt("current_period_end", grace10d);

        // 2) Renovações: janela de 3 dias antes do vencimento até 10 dias depois
        const { data: due } = await supabaseAdmin
          .from("number_subscriptions")
          .select(
            "id, user_id, payment_method, price_cents, current_period_end, renewal_attempt_at, pagarme_card_id, status",
          )
          .in("status", ["active", "past_due"])
          .lte("current_period_end", in3d)
          .or(`renewal_attempt_at.is.null,renewal_attempt_at.lt.${cooldown}`)
          .limit(100);

        for (const ns of due ?? []) {
          try {
            const { data: sub } = await supabaseAdmin
              .from("subscriptions")
              .select("pagarme_customer_id")
              .eq("user_id", ns.user_id)
              .maybeSingle();
            if (!sub?.pagarme_customer_id) {
              results.push({ id: ns.id, skipped: "no customer" });
              continue;
            }

            const method: "pix" | "credit_card_stored" =
              ns.payment_method === "credit_card" && ns.pagarme_card_id
                ? "credit_card_stored"
                : "pix"; // fallback: cartão sem card_id salvo cai para PIX

            const order = await pagarme.createOrder({
              code: `zh_ns_${ns.id}_r${Date.now()}`,
              customer_id: sub.pagarme_customer_id,
              amount_cents: ns.price_cents,
              description: "Renovação número WhatsApp ZapHeat (30 dias)",
              method,
              card_id: ns.pagarme_card_id ?? undefined,
              metadata: {
                number_subscription_id: ns.id,
                user_id: ns.user_id,
                renewal: "true",
              },
            });

            const charge = order?.charges?.[0];
            const lt = charge?.last_transaction ?? {};
            const pix_qr_code: string | null = lt.qr_code ?? charge?.qr_code ?? null;
            const pix_qr_code_url: string | null = lt.qr_code_url ?? null;

            const patch: any = {
              renewal_attempt_at: nowIso,
              renewal_order_id: order?.id ?? null,
            };
            if (pix_qr_code || pix_qr_code_url) {
              patch.last_pix_qr_code = pix_qr_code;
              patch.last_charge_url = pix_qr_code_url;
            }
            // Se cartão foi cobrado com sucesso imediato, o webhook estende o período.
            // Aqui só registramos a tentativa.
            await supabaseAdmin
              .from("number_subscriptions")
              .update(patch)
              .eq("id", ns.id);

            results.push({ id: ns.id, method, order_id: order?.id, charge_status: charge?.status });
          } catch (e: any) {
            await supabaseAdmin
              .from("number_subscriptions")
              .update({ renewal_attempt_at: nowIso })
              .eq("id", ns.id);
            results.push({ id: ns.id, error: e?.message ?? "erro" });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
