import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRICE_CENTS = 2500; // R$ 25,00

// ---------------- Cliente: visão do próprio billing ----------------

export const getMyBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("free_number_bonus, suspended, suspended_reason, pagarme_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: numbers } = await supabase
      .from("number_subscriptions")
      .select("id, status, payment_method, price_cents, current_period_end, canceled_at, last_pix_qr_code, last_charge_url, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const { data: quotaRow } = await supabase.rpc("user_number_quota", { _user_id: userId });
    const quota = typeof quotaRow === "number" ? quotaRow : 2;

    const { count: usedCount } = await supabase
      .from("whatsapp_instances")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    return {
      free_included: 2,
      free_bonus: sub?.free_number_bonus ?? 0,
      quota,
      used: usedCount ?? 0,
      suspended: sub?.suspended ?? false,
      suspended_reason: sub?.suspended_reason ?? null,
      has_customer: !!sub?.pagarme_customer_id,
      price_cents: PRICE_CENTS,
      numbers: numbers ?? [],
    };
  });

// ---------------- Cliente: compra 1 número extra ----------------

const addressSchema = z.object({
  street: z.string().min(2).max(120),
  number: z.string().min(1).max(20),
  complement: z.string().max(80).optional(),
  neighborhood: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(2),
  zip_code: z.string().min(8).max(9),
});

export const getPagarmePublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env.PAGARME_PUBLIC_KEY;
    if (!key) throw new Error("PAGARME_PUBLIC_KEY não configurada");
    return { public_key: key };
  });

export const purchaseNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        full_name: z.string().min(3).max(120),
        document: z.string().min(11).max(14), // CPF
        phone: z.string().min(10).max(15),
        address: addressSchema,
        payment_method: z.enum(["pix", "credit_card"]),
        card_token: z.string().optional(), // requerido para credit_card
        installments: z.number().int().min(1).max(12).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { pagarme } = await import("@/lib/pagarme.server");

    if (data.payment_method === "credit_card" && !data.card_token) {
      throw new Error("Token do cartão ausente. Preencha os dados do cartão.");
    }

    // 1. Pega/cria/atualiza customer no Pagar.me (com telefone + endereço)
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("pagarme_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    const email = (claims as any)?.email as string;
    if (!email) throw new Error("Sessão sem email");

    let customer_id = sub?.pagarme_customer_id ?? null;
    if (!customer_id) {
      const customer = await pagarme.createCustomer({
        name: data.full_name,
        email,
        document: data.document,
        phone: data.phone,
        address: data.address,
        code: `zh_user_${userId}`,
      });
      customer_id = customer.id;
      await supabase
        .from("subscriptions")
        .update({ pagarme_customer_id: customer_id })
        .eq("user_id", userId);
    } else {
      await pagarme.updateCustomer(customer_id, {
        name: data.full_name,
        email,
        document: data.document,
        phone: data.phone,
        address: data.address,
      });
    }

    // 2. Cria linha de number_subscription pendente
    const { data: nsRow, error: nsErr } = await supabase
      .from("number_subscriptions")
      .insert({
        user_id: userId,
        payment_method: data.payment_method,
        status: "pending",
        price_cents: PRICE_CENTS,
      })
      .select()
      .single();
    if (nsErr) throw new Error(nsErr.message);

    // 3. Cria order no Pagar.me
    const order = await pagarme.createOrder({
      code: `zh_ns_${nsRow.id}`,
      customer_id: customer_id!,
      amount_cents: PRICE_CENTS,
      description: "Número WhatsApp extra ZapHeat (30 dias)",
      method: data.payment_method === "pix" ? "pix" : "credit_card_native",
      card_token: data.card_token,
      installments: data.installments,
      billing_address: data.address,
      metadata: {
        number_subscription_id: nsRow.id,
        user_id: userId,
      },
    });

    const chargeFailed = order?.charges?.[0];
    const gwErr =
      chargeFailed?.last_transaction?.gateway_response?.errors?.[0]?.message ??
      chargeFailed?.last_transaction?.acquirer_message;
    if (order?.status === "failed" || chargeFailed?.status === "failed") {
      await supabase
        .from("number_subscriptions")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("id", nsRow.id);
      throw new Error(gwErr ?? "Pagar.me recusou a cobrança. Verifique seus dados.");
    }

    // Cartão aprovado direto → já ativa a assinatura
    if (data.payment_method === "credit_card" && chargeFailed?.status === "paid") {
      const in30d = new Date(Date.now() + 30 * 86400_000).toISOString();
      await supabase
        .from("number_subscriptions")
        .update({ status: "active", current_period_end: in30d })
        .eq("id", nsRow.id);
    }





    // 4. Extrai QR PIX (texto EMV + imagem) ou URL de checkout do cartão
    const charge = order?.charges?.[0];
    const lt = charge?.last_transaction ?? {};
    const pix_qr_code: string | null =
      lt.qr_code ?? charge?.qr_code ?? order?.qr_code ?? null;
    const pix_qr_code_url: string | null =
      lt.qr_code_url ?? charge?.qr_code_url ?? null;
    const payment_url: string | null =
      lt.url ??
      lt.payment_url ??
      charge?.payment_url ??
      (Array.isArray(charge?.checkout) ? charge.checkout[0]?.payment_url : null) ??
      charge?.checkout?.payment_url ??
      null;

    if (!pix_qr_code && !pix_qr_code_url && !payment_url) {
      // Nada retornado → devolve o payload para o cliente saber que falhou
      console.error("Pagar.me sem dados de checkout:", JSON.stringify(order));
    }

    await supabase
      .from("number_subscriptions")
      .update({
        last_pix_qr_code: pix_qr_code,
        last_charge_url: payment_url ?? pix_qr_code_url,
      })
      .eq("id", nsRow.id);

    return {
      number_subscription_id: nsRow.id,
      order_id: order.id,
      pix_qr_code,
      pix_qr_code_url,
      payment_url,
    };
  });

// Polling do status da assinatura de número (para o modal de checkout)
export const getNumberSubscriptionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("number_subscriptions")
      .select("id, status, current_period_end")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    return { status: row?.status ?? "unknown", current_period_end: row?.current_period_end ?? null };
  });

export const cancelNumberSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("number_subscriptions")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Admin ----------------

async function requireAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export const adminFinancialSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.rpc("admin_financial_summary");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      mrr_cents: Number(row?.mrr_cents ?? 0),
      active_paid_numbers: Number(row?.active_paid_numbers ?? 0),
      past_due_numbers: Number(row?.past_due_numbers ?? 0),
      canceled_last_30d: Number(row?.canceled_last_30d ?? 0),
      active_users: Number(row?.active_users ?? 0),
      suspended_users: Number(row?.suspended_users ?? 0),
    };
  });

export const adminAddFreeNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        user_id: z.string().uuid(),
        delta: z.number().int().min(-50).max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cur } = await supabaseAdmin
      .from("subscriptions")
      .select("free_number_bonus")
      .eq("user_id", data.user_id)
      .maybeSingle();
    const next = Math.max(0, (cur?.free_number_bonus ?? 0) + data.delta);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ free_number_bonus: next })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true, free_number_bonus: next };
  });

export const adminSetUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        user_id: z.string().uuid(),
        suspended: z.boolean(),
        reason: z.string().max(300).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        suspended: data.suspended,
        suspended_reason: data.suspended ? data.reason ?? null : null,
        suspended_at: data.suspended ? new Date().toISOString() : null,
      })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminForceRemoveNumberSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("number_subscriptions")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListBillingUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, free_number_bonus, suspended, suspended_reason, pagarme_customer_id");
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email, full_name");
    const { data: ns } = await supabaseAdmin
      .from("number_subscriptions")
      .select("user_id, status, price_cents");

    const nsByUser = new Map<string, { active: number; past_due: number; mrr_cents: number }>();
    for (const r of ns ?? []) {
      const agg = nsByUser.get(r.user_id) ?? { active: 0, past_due: 0, mrr_cents: 0 };
      if (r.status === "active") {
        agg.active++;
        agg.mrr_cents += r.price_cents;
      } else if (r.status === "past_due") {
        agg.past_due++;
      }
      nsByUser.set(r.user_id, agg);
    }
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (subs ?? []).map((s: any) => {
      const agg = nsByUser.get(s.user_id) ?? { active: 0, past_due: 0, mrr_cents: 0 };
      const p = pmap.get(s.user_id);
      return {
        user_id: s.user_id,
        email: p?.email ?? "",
        full_name: p?.full_name ?? "",
        free_bonus: s.free_number_bonus,
        suspended: s.suspended,
        paid_active: agg.active,
        past_due: agg.past_due,
        mrr_cents: agg.mrr_cents,
      };
    });
  });
