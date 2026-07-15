import { createFileRoute } from "@tanstack/react-router";
import { verifyPagarmeSignature } from "@/lib/pagarme.server";

/**
 * Webhook receiver do Pagar.me.
 *
 * Configurar no dashboard Pagar.me:
 *   URL: https://zapheatnew.lovable.app/api/public/hooks/pagarme-webhook
 *   Segredo: mesmo valor guardado em PAGARME_WEBHOOK_SECRET
 *   Eventos:
 *     - order.paid
 *     - charge.paid
 *     - charge.payment_failed
 *     - charge.refunded
 *     - charge.chargedback
 */
export const Route = createFileRoute("/api/public/hooks/pagarme-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-hub-signature");

        if (!verifyPagarmeSignature(rawBody, signature)) {
          return new Response("invalid signature", { status: 401 });
        }

        let event: any;
        try {
          event = JSON.parse(rawBody);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const eventId: string = event?.id ?? crypto.randomUUID();
        const eventType: string = event?.type ?? "unknown";
        const data = event?.data ?? {};

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotência
        const { data: existing } = await supabaseAdmin
          .from("billing_events")
          .select("id")
          .eq("pagarme_event_id", eventId)
          .maybeSingle();
        if (existing) return new Response("ok (dup)");

        // Descobre a number_subscription pelo metadata, subscription_id ou code
        const metadata = data?.metadata ?? data?.order?.metadata ?? data?.subscription?.metadata ?? {};
        const pagarmeSubId: string | null =
          data?.subscription?.id ?? data?.subscription_id ?? null;

        let nsId: string | null =
          metadata.number_subscription_id ??
          extractNsIdFromCode(data?.code) ??
          extractNsIdFromCode(data?.order?.code) ??
          extractNsIdFromCode(data?.subscription?.code) ??
          null;

        let userId: string | null = metadata.user_id ?? null;
        let amount: number | null =
          data?.amount ?? data?.order?.amount ?? data?.paid_amount ?? null;

        let ns: any = null;
        // Tenta por id direto
        if (nsId) {
          const { data: row } = await supabaseAdmin
            .from("number_subscriptions")
            .select("*")
            .eq("id", nsId)
            .maybeSingle();
          ns = row;
        }
        // Fallback: casa pelo pagarme_subscription_id
        if (!ns && pagarmeSubId) {
          const { data: row } = await supabaseAdmin
            .from("number_subscriptions")
            .select("*")
            .eq("pagarme_subscription_id", pagarmeSubId)
            .maybeSingle();
          ns = row;
        }
        if (ns) {
          nsId = ns.id;
          if (!userId && ns.user_id) userId = ns.user_id;
        }

        // Processa por tipo de evento
        const now = new Date();

        if (eventType === "order.paid" || eventType === "charge.paid") {
          if (ns) {
            // Estende current_period_end em 30 dias a partir do fim atual (se ainda no futuro)
            // ou a partir de agora (se já vencido). Assim o usuário nunca perde dias.
            const cur = ns.current_period_end ? new Date(ns.current_period_end) : now;
            const base = cur.getTime() > now.getTime() ? cur : now;
            const nextEnd = new Date(base.getTime() + 30 * 86400_000).toISOString();

            // Salva card_id da transação para renovação recorrente futura
            const charges = data?.charges ?? data?.order?.charges ?? [];
            const cardId: string | null =
              charges?.[0]?.last_transaction?.card?.id ??
              data?.last_transaction?.card?.id ??
              null;

            const patch: any = {
              status: "active",
              current_period_end: nextEnd,
              renewal_order_id: null,
              last_pix_qr_code: null,
              last_charge_url: null,
              last_order_id:
                data?.id ?? data?.order?.id ?? charges?.[0]?.order_id ?? ns.last_order_id ?? null,
            };
            if (cardId && !ns.pagarme_card_id) patch.pagarme_card_id = cardId;

            await supabaseAdmin.from("number_subscriptions").update(patch).eq("id", ns.id);
          }
        } else if (
          eventType === "charge.payment_failed" ||
          eventType === "order.payment_failed"
        ) {
          if (ns) {
            await supabaseAdmin
              .from("number_subscriptions")
              .update({ status: "past_due" })
              .eq("id", ns.id);
          }
        } else if (
          eventType === "charge.refunded" ||
          eventType === "charge.chargedback" ||
          eventType === "order.canceled"
        ) {
          if (ns) {
            await supabaseAdmin
              .from("number_subscriptions")
              .update({ status: "canceled", canceled_at: now.toISOString() })
              .eq("id", ns.id);
          }
        }

        // Log de auditoria
        await supabaseAdmin.from("billing_events").insert({
          pagarme_event_id: eventId,
          event_type: eventType,
          user_id: userId,
          number_subscription_id: nsId,
          amount_cents: typeof amount === "number" ? amount : null,
          payload: event,
        });

        return new Response("ok");
      },
    },
  },
});

function extractNsIdFromCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const m = code.match(/^zh_ns_([0-9a-f-]{36})$/i);
  return m ? m[1] : null;
}
