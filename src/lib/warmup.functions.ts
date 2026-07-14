import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------- Role / me ----------------

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = !!roles?.some((r: any) => r.role === "admin");
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, status, plan:plans(id, name, max_instances, max_messages_per_day)")
      .eq("user_id", userId)
      .maybeSingle();
    return { userId, isAdmin, subscription: sub };
  });

// ---------------- Instances ----------------

export const listInstances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_instances")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ name: z.string().min(1).max(60) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // enforce plan limit
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan:plans(max_instances)")
      .eq("user_id", userId)
      .maybeSingle();
    const max = (sub as any)?.plan?.max_instances ?? 1;
    const { count } = await supabase
      .from("whatsapp_instances")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= max) {
      throw new Error(`Seu plano permite no máximo ${max} número(s). Faça upgrade para adicionar mais.`);
    }

    const slug = data.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "chip";
    const evolutionInstance = `${userId.slice(0, 8)}_${slug}_${Date.now().toString(36)}`;

    const { evolution } = await import("@/lib/evolution.server");
    const resp = await evolution.createInstance(evolutionInstance);
    const qr = resp?.qrcode?.base64 ?? resp?.qrcode?.code ?? null;

    const { data: row, error } = await supabase
      .from("whatsapp_instances")
      .insert({
        user_id: userId,
        name: data.name,
        evolution_instance: evolutionInstance,
        status: "qr",
        last_qr: qr,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const refreshInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!inst) throw new Error("Instância não encontrada");

    const { evolution } = await import("@/lib/evolution.server");
    let status = "disconnected";
    let qr: string | null = null;
    let phone: string | null = (inst as any).phone ?? null;
    try {
      const state = await evolution.connectionState(inst.evolution_instance);
      const s = state?.instance?.state ?? state?.state;
      if (s === "open") status = "connected";
      else if (s === "connecting") status = "connecting";
      else status = "disconnected";
      phone = state?.instance?.owner ?? phone;
    } catch {
      status = "disconnected";
    }

    if (status !== "connected") {
      try {
        const conn = await evolution.connect(inst.evolution_instance);
        qr = conn?.base64 ?? conn?.qrcode?.base64 ?? conn?.code ?? null;
        if (qr) status = "qr";
      } catch {}
    }

    const { data: updated, error } = await supabase
      .from("whatsapp_instances")
      .update({ status, last_qr: qr, phone, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("evolution_instance")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (inst?.evolution_instance) {
      try {
        const { evolution } = await import("@/lib/evolution.server");
        await evolution.deleteInstance(inst.evolution_instance);
      } catch {}
    }
    const { error } = await supabase.from("whatsapp_instances").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Groups ----------------

export const listGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("warmup_groups")
      .select("*, warmup_group_members(id, instance_id, whatsapp_instances(id, name, status, phone))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().min(1).max(80),
        min_delay_seconds: z.number().int().min(20).max(3600).default(60),
        max_delay_seconds: z.number().int().min(30).max(7200).default(300),
        daily_limit: z.number().int().min(1).max(1000).default(40),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.max_delay_seconds < data.min_delay_seconds) {
      throw new Error("Intervalo máximo deve ser >= mínimo");
    }
    const { data: row, error } = await supabase
      .from("warmup_groups")
      .insert({ ...data, user_id: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("warmup_groups")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("warmup_groups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ group_id: z.string().uuid(), instance_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("warmup_group_members").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("warmup_group_members").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Logs ----------------

export const listLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("warmup_logs")
      .select("*, from_instance:whatsapp_instances!warmup_logs_from_instance_id_fkey(name), to_instance:whatsapp_instances!warmup_logs_to_instance_id_fkey(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [{ count: instances }, { count: groups }, { count: sentToday }] = await Promise.all([
      supabase.from("whatsapp_instances").select("id", { count: "exact", head: true }),
      supabase.from("warmup_groups").select("id", { count: "exact", head: true }).eq("active", true),
      supabase
        .from("warmup_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "sent")
        .gte("created_at", today.toISOString()),
    ]);
    return { instances: instances ?? 0, activeGroups: groups ?? 0, sentToday: sentToday ?? 0 };
  });

// ---------------- Plans ----------------

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("price_cents", { ascending: true });
    return data ?? [];
  });

// ---------------- Templates ----------------

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("message_templates")
      .select("*")
      .order("is_global", { ascending: false });
    return data ?? [];
  });

export const addTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ content: z.string().min(1).max(500) }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_templates")
      .insert({ content: data.content, user_id: context.userId, is_global: false });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("message_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Admin ----------------

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, created_at, subscriptions(plan:plans(name, max_instances, max_messages_per_day))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpdateUserPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user_id: z.string().uuid(), plan_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .upsert({ user_id: data.user_id, plan_id: data.plan_id, status: "active" }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetEvolutionConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("evolution_config")
      .select("api_url, api_key")
      .eq("id", 1)
      .maybeSingle();
    return data ?? { api_url: "", api_key: "" };
  });

export const adminUpdateEvolutionConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ api_url: z.string().url(), api_key: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("evolution_config")
      .upsert({ id: 1, api_url: data.api_url, api_key: data.api_key, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
