import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// CARTEIRA (Wallet)
// ============================================================

export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: w } = await supabase
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: txs } = await supabase
      .from("wallet_transactions")
      .select("id, kind, amount_cents, balance_after_cents, description, reference_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return {
      balance_cents: w?.balance_cents ?? 0,
      transactions: txs ?? [],
    };
  });

// Cria order Pix na Pagar.me para recarregar a carteira.
// Recarga é creditada no webhook (order.paid) quando metadata.wallet_topup=true.
export const topupWalletPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ amount_cents: z.number().int().min(1000).max(500_000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { pagarme } = await import("@/lib/pagarme.server");

    // Busca ou cria customer Pagar.me a partir do profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, phone")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.email) throw new Error("Preencha seu perfil (email) antes de recarregar.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("pagarme_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = sub?.pagarme_customer_id ?? null;
    if (!customerId) {
      const cust = await pagarme.createCustomer({
        name: profile.full_name || profile.email,
        email: profile.email,
        document: "00000000000",
        code: `zh_user_${userId}`,
        phone: profile.phone || "+5511999999999",
      });
      customerId = cust.id;
      await supabaseAdmin
        .from("subscriptions")
        .update({ pagarme_customer_id: customerId })
        .eq("user_id", userId);
    }

    const code = `zh_wallet_${crypto.randomUUID()}`;
    const order = await pagarme.createOrder({
      code,
      customer_id: customerId!,
      amount_cents: data.amount_cents,
      description: `ZapHeat • Recarga de carteira`,
      method: "pix",
      metadata: {
        wallet_topup: "true",
        user_id: userId,
        amount_cents: String(data.amount_cents),
      },
    });

    const charge = order?.charges?.[0];
    const pix = charge?.last_transaction;
    return {
      order_id: order?.id,
      qr_code: pix?.qr_code ?? null,
      qr_code_url: pix?.qr_code_url ?? null,
      expires_at: pix?.expires_at ?? null,
      amount_cents: data.amount_cents,
    };
  });

// ============================================================
// NÚMEROS VIRTUAIS
// ============================================================

export const listVirtualNumberCountries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listWhatsAppCountries } = await import("@/lib/sms-activate.server");
    try {
      const countries = await listWhatsAppCountries();
      return { countries, error: null as string | null };
    } catch (e: any) {
      return {
        countries: [],
        error: e?.message ?? "Fornecedor indisponível. Tente novamente em instantes.",
      };
    }
  });

export const listMyVirtualNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("virtual_number_orders")
      .select(
        "id, activation_id, country_code, country_label, phone_number, sms_code, full_sms, price_cents, status, error_message, expires_at, received_at, finished_at, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const purchaseVirtualNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ country_code: z.string().min(1).max(4) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sms = await import("@/lib/sms-activate.server");

    const country = sms.SUPPORTED_COUNTRIES.find((c) => c.code === data.country_code);
    if (!country) throw new Error("País não suportado.");

    // 1) descobre preço atual
    const countries = await sms.listWhatsAppCountries();
    const c = countries.find((x) => x.code === data.country_code);
    if (!c || c.price_cents <= 0) throw new Error("Preço indisponível para este país agora.");
    if (c.available <= 0) throw new Error("Sem números disponíveis neste país agora.");

    const price = c.price_cents;

    // 2) verifica saldo
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", userId)
      .maybeSingle();
    const balance = wallet?.balance_cents ?? 0;
    if (balance < price) {
      throw new Error(
        `Saldo insuficiente. Você tem ${(balance / 100).toFixed(2)} e o número custa ${(price / 100).toFixed(2)}.`,
      );
    }

    // 3) cria pedido no provider
    let activation: { activationId: string; phone: string };
    try {
      activation = await sms.requestNumber(data.country_code);
    } catch (e: any) {
      throw new Error(e?.message ?? "Falha ao alugar número no fornecedor.");
    }

    // 4) debita carteira + cria order (em transações separadas — se debit ok, order sempre é criada)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("virtual_number_orders")
      .insert({
        user_id: userId,
        provider: "sms-activate",
        activation_id: activation.activationId,
        country_code: country.code,
        country_label: country.label,
        service: sms.WHATSAPP_SERVICE,
        phone_number: activation.phone,
        price_cents: price,
        provider_cost_cents: c.provider_cost_cents,
        status: "waiting",
        expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      // Tenta cancelar no provider para não pagar por nada
      try {
        await sms.cancelActivation(activation.activationId);
      } catch {}
      throw new Error("Falha ao registrar pedido. Nada foi cobrado.");
    }

    const { error: walletErr } = await supabaseAdmin.rpc("wallet_apply", {
      _user_id: userId,
      _kind: "purchase",
      _amount_cents: -price,
      _description: `Número virtual WhatsApp • ${country.label}`,
      _reference_id: order.id,
      _metadata: { activation_id: activation.activationId, country: country.code },
    });

    if (walletErr) {
      // Reverte: cancela no provider e marca order como erro
      try {
        await sms.cancelActivation(activation.activationId);
      } catch {}
      await supabaseAdmin
        .from("virtual_number_orders")
        .update({ status: "error", error_message: walletErr.message })
        .eq("id", order.id);
      throw new Error("Falha ao debitar carteira. Pedido cancelado.");
    }

    return {
      order_id: order.id,
      phone_number: activation.phone,
      price_cents: price,
    };
  });

export const pollVirtualNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ order_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sms = await import("@/lib/sms-activate.server");

    const { data: order } = await supabaseAdmin
      .from("virtual_number_orders")
      .select("*")
      .eq("id", data.order_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!order) throw new Error("Pedido não encontrado.");
    if (!order.activation_id) throw new Error("Pedido sem ativação válida.");

    // Estados finais: apenas retorna
    if (["done", "canceled", "refunded", "expired", "error"].includes(order.status)) {
      return order;
    }

    const status = await sms.getStatus(order.activation_id);

    if (status.state === "received" && status.code) {
      const fullSms = await sms.getFullSms(order.activation_id).catch(() => null);
      const { data: updated } = await supabaseAdmin
        .from("virtual_number_orders")
        .update({
          status: "received",
          sms_code: status.code,
          full_sms: fullSms,
          received_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .select("*")
        .single();
      return updated ?? order;
    }

    // Se expirou (>2min sem código), cancela e reembolsa
    if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
      await refundOrder(order, "expired");
      const { data: refunded } = await supabaseAdmin
        .from("virtual_number_orders")
        .select("*")
        .eq("id", order.id)
        .maybeSingle();
      return refunded ?? order;
    }

    return order;
  });

export const cancelVirtualNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ order_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("virtual_number_orders")
      .select("*")
      .eq("id", data.order_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!order) throw new Error("Pedido não encontrado.");
    if (order.status !== "waiting") {
      throw new Error("Só é possível cancelar antes do código chegar.");
    }
    await refundOrder(order, "canceled");
    return { ok: true };
  });

export const finishVirtualNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ order_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sms = await import("@/lib/sms-activate.server");

    const { data: order } = await supabaseAdmin
      .from("virtual_number_orders")
      .select("*")
      .eq("id", data.order_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!order) throw new Error("Pedido não encontrado.");
    if (order.status !== "received") throw new Error("Só é possível finalizar após receber o código.");

    if (order.activation_id) {
      try {
        await sms.finishActivation(order.activation_id);
      } catch {}
    }
    await supabaseAdmin
      .from("virtual_number_orders")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", order.id);
    return { ok: true };
  });

// ============================================================
// Helpers internos
// ============================================================
async function refundOrder(order: any, reason: "canceled" | "expired") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sms = await import("@/lib/sms-activate.server");

  if (order.activation_id) {
    try {
      await sms.cancelActivation(order.activation_id);
    } catch {}
  }

  // Reembolsa carteira
  await supabaseAdmin.rpc("wallet_apply", {
    _user_id: order.user_id,
    _kind: "refund",
    _amount_cents: order.price_cents,
    _description:
      reason === "expired"
        ? `Reembolso • Número expirou sem SMS (${order.country_label})`
        : `Reembolso • Cancelamento (${order.country_label})`,
    _reference_id: order.id,
    _metadata: { activation_id: order.activation_id, reason },
  });

  await supabaseAdmin
    .from("virtual_number_orders")
    .update({
      status: reason === "expired" ? "expired" : "refunded",
      finished_at: new Date().toISOString(),
    })
    .eq("id", order.id);
}
