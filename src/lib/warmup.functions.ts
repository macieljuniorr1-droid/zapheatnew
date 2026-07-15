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

export const WARMUP_DAYS_REQUIRED = 3;

// Normaliza o QR retornado pela Evolution para uma data URL PNG que o <img>
// consegue renderizar. A API v2 devolve o base64 em campos variados
// (qrcode.base64, base64, qrcode.code) e frequentemente SEM o prefixo
// "data:image/png;base64,". Sem o prefixo o celular tenta decodificar como
// texto e mostra "não foi possível conectar".
function normalizeQr(payload: any): string | null {
  const raw: string | undefined =
    payload?.base64 ??
    payload?.qrcode?.base64 ??
    payload?.qrcode ??
    payload?.qr ??
    undefined;
  if (!raw || typeof raw !== "string") return null;
  if (raw.startsWith("data:")) return raw;
  // Se veio um EMV/pairing code puro (não é base64 de imagem), descarta.
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw) || raw.length < 200) return null;
  return `data:image/png;base64,${raw.replace(/\s+/g, "")}`;
}

// Normaliza JID/owner do Evolution ("5511...@s.whatsapp.net") em número puro.
function extractPhone(...candidates: any[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c);
    const m = s.match(/(\d{8,20})/);
    if (m) return m[1];
  }
  return null;
}

export const listInstances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_instances")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const now = Date.now();
    return (data ?? []).map((i: any) => {
      const started = i.warmup_started_at ? new Date(i.warmup_started_at).getTime() : null;
      const days_warming = started ? Math.floor((now - started) / (1000 * 60 * 60 * 24)) : 0;
      const days_remaining = started ? Math.max(0, WARMUP_DAYS_REQUIRED - days_warming) : WARMUP_DAYS_REQUIRED;
      const is_ready = started !== null && days_warming >= WARMUP_DAYS_REQUIRED && i.status === "connected";
      return { ...i, days_warming, days_remaining, is_ready };
    });
  });

export const createInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ name: z.string().min(1).max(60) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Bloqueia conta suspensa
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("suspended, suspended_reason")
      .eq("user_id", userId)
      .maybeSingle();
    if ((sub as any)?.suspended) {
      throw new Error(
        `Sua conta está suspensa${(sub as any).suspended_reason ? `: ${(sub as any).suspended_reason}` : ""}. Fale com o suporte.`,
      );
    }

    // Quota: 2 grátis + bônus de cortesia + números pagos ativos
    const { data: quotaData } = await supabase.rpc("user_number_quota", { _user_id: userId });
    const max = typeof quotaData === "number" ? quotaData : 2;
    const { count } = await supabase
      .from("whatsapp_instances")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= max) {
      throw new Error(
        `Você já usa seus ${max} número(s) disponíveis. Compre mais na aba Plano (R$ 25/mês por número).`,
      );
    }


    const slug = data.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "chip";
    const evolutionInstance = `${userId.slice(0, 8)}_${slug}_${Date.now().toString(36)}`;

    const { evolution } = await import("@/lib/evolution.server");
    const resp = await evolution.createInstance(evolutionInstance);
    // Evolution v2 pode devolver o QR em campos diferentes e sem o prefixo data:.
    // Usamos o QR devolvido pelo create quando ele já veio pronto; só chamamos
    // /instance/connect quando o create não entregou um QR utilizável — porque
    // um connect após um create com QR válido invalida o primeiro código e é a
    // causa do "não foi possível conectar" no celular a partir do 2º número.
    let qr: string | null = normalizeQr(resp);
    if (!qr) {
      try {
        const conn = await evolution.connect(evolutionInstance);
        qr = normalizeQr(conn);
      } catch {
        // mantém null; usuário pode clicar em Atualizar
      }
    }

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
        qr = normalizeQr(conn);
        if (qr) status = "qr";
      } catch {}
    }

    const { data: updated, error } = await context.supabase
      .from("whatsapp_instances")
      .update({
        status,
        last_qr: qr,
        phone,
        updated_at: new Date().toISOString(),
        // Marca início do aquecimento na primeira vez que conecta
        ...(status === "connected" && !(inst as any).warmup_started_at
          ? { warmup_started_at: new Date().toISOString() }
          : {}),
      } as any)
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
        daily_limit: z.number().int().min(0).max(1000).default(0),
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
    const { data: profs, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, phone, company, use_case, source, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (profs ?? []).map((p: any) => p.id);
    const { data: subs } = ids.length
      ? await supabaseAdmin
          .from("subscriptions")
          .select("user_id, status, plan:plans(name, price_cents, max_instances, max_messages_per_day)")
          .in("user_id", ids)
      : { data: [] as any[] };
    const subByUser = new Map<string, any>();
    for (const s of subs ?? []) subByUser.set((s as any).user_id, s);
    return (profs ?? []).map((p: any) => ({
      ...p,
      subscriptions: subByUser.has(p.id) ? [subByUser.get(p.id)] : [],
    }));
  });

export const adminGetStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [
      usersAll,
      usersToday,
      usersWeek,
      instancesAll,
      instancesConnected,
      groupsActive,
      msgsToday,
      msgsWeek,
      msgsFailed,
      subs,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
      supabaseAdmin.from("whatsapp_instances").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("whatsapp_instances").select("id", { count: "exact", head: true }).eq("status", "connected"),
      supabaseAdmin.from("warmup_groups").select("id", { count: "exact", head: true }).eq("active", true),
      supabaseAdmin.from("warmup_logs").select("id", { count: "exact", head: true }).eq("status", "sent").gte("created_at", today.toISOString()),
      supabaseAdmin.from("warmup_logs").select("id", { count: "exact", head: true }).eq("status", "sent").gte("created_at", weekAgo.toISOString()),
      supabaseAdmin.from("warmup_logs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekAgo.toISOString()),
      supabaseAdmin.from("subscriptions").select("status, plan:plans(name, price_cents)"),
    ]);

    let mrrCents = 0;
    let activePaying = 0;
    const planBreakdown: Record<string, number> = {};
    for (const s of subs.data ?? []) {
      const price = (s as any).plan?.price_cents ?? 0;
      const name = (s as any).plan?.name ?? "—";
      planBreakdown[name] = (planBreakdown[name] ?? 0) + 1;
      if (s.status === "active" && price > 0) {
        mrrCents += price;
        activePaying++;
      }
    }

    // Recent signups
    const { data: recentSignups } = await supabaseAdmin
      .from("profiles")
      .select("id, email, created_at")
      .gte("created_at", monthAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      users: {
        total: usersAll.count ?? 0,
        today: usersToday.count ?? 0,
        week: usersWeek.count ?? 0,
      },
      instances: {
        total: instancesAll.count ?? 0,
        connected: instancesConnected.count ?? 0,
      },
      groupsActive: groupsActive.count ?? 0,
      messages: {
        today: msgsToday.count ?? 0,
        week: msgsWeek.count ?? 0,
        failedWeek: msgsFailed.count ?? 0,
      },
      revenue: {
        mrrCents,
        activePaying,
        arrCents: mrrCents * 12,
      },
      planBreakdown,
      recentSignups: recentSignups ?? [],
    };
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

// ---------------- Admin: manage all WhatsApp instances ----------------

export const adminListInstances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, user_id, name, evolution_instance, phone, status, created_at, updated_at, profiles:profiles!whatsapp_instances_user_id_fkey(email, full_name)")
      .order("created_at", { ascending: false });
    if (error) {
      // Fallback without join if FK naming differs
      const alt = await supabaseAdmin
        .from("whatsapp_instances")
        .select("id, user_id, name, evolution_instance, phone, status, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (alt.error) throw new Error(alt.error.message);
      const ids = Array.from(new Set((alt.data ?? []).map((r: any) => r.user_id)));
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, email, full_name").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (alt.data ?? []).map((r: any) => ({ ...r, profiles: map.get(r.user_id) ?? null }));
    }
    return data ?? [];
  });

export const adminRefreshInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inst } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!inst) throw new Error("Instância não encontrada");
    const { evolution } = await import("@/lib/evolution.server");
    let status = "disconnected";
    let qr: string | null = null;
    let phone: string | null = (inst as any).phone ?? null;
    try {
      const state = await evolution.connectionState((inst as any).evolution_instance);
      const s = state?.instance?.state ?? state?.state;
      if (s === "open") status = "connected";
      else if (s === "connecting") status = "connecting";
      phone = state?.instance?.owner ?? phone;
    } catch {}
    if (status !== "connected") {
      try {
        const conn = await evolution.connect((inst as any).evolution_instance);
        qr = normalizeQr(conn);
        if (qr) status = "qr";
      } catch {}
    }
    const { error } = await supabaseAdmin
      .from("whatsapp_instances")
      .update({ status, last_qr: qr, phone, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, status, phone };
  });

export const adminDeleteInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inst } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("evolution_instance")
      .eq("id", data.id)
      .maybeSingle();
    if ((inst as any)?.evolution_instance) {
      try {
        const { evolution } = await import("@/lib/evolution.server");
        await evolution.deleteInstance((inst as any).evolution_instance);
      } catch {}
    }
    const { error } = await supabaseAdmin.from("whatsapp_instances").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------------- Chip health & temperature ----------------

export const listInstancesWithHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: instances, error } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!instances?.length) return [];

    const now = Date.now();
    const results = await Promise.all(
      instances.map(async (i: any) => {
        const { data: t } = await supabase.rpc("chip_temperature", { _instance_id: i.id });
        const row = Array.isArray(t) ? t[0] : t;
        const started = i.warmup_started_at ? new Date(i.warmup_started_at).getTime() : null;
        const days_warming = started ? Math.floor((now - started) / (1000 * 60 * 60 * 24)) : 0;
        const days_remaining = started ? Math.max(0, WARMUP_DAYS_REQUIRED - days_warming) : WARMUP_DAYS_REQUIRED;
        const is_ready = started !== null && days_warming >= WARMUP_DAYS_REQUIRED && i.status === "connected";
        return {
          ...i,
          temperature: row?.temperature ?? "cold",
          msgs_7d: Number(row?.msgs_7d ?? 0),
          msgs_total: Number(row?.msgs_total ?? 0),
          active_days_7d: Number(row?.active_days_7d ?? 0),
          last_activity: row?.last_activity ?? null,
          days_warming,
          days_remaining,
          is_ready,
        };
      }),
    );
    return results;
  });

export const getChipReport = createServerFn({ method: "GET" })
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
    if (!inst) throw new Error("Chip não encontrado");

    const { data: t } = await supabase.rpc("chip_temperature", { _instance_id: data.id });
    const temp = Array.isArray(t) ? t[0] : t;

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const { data: logs } = await supabase
      .from("warmup_logs")
      .select("from_instance_id, to_instance_id, status, created_at, content")
      .or(`from_instance_id.eq.${data.id},to_instance_id.eq.${data.id}`)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    const dailyMap = new Map<string, number>();
    const hourMap = new Map<number, number>();
    const peerMap = new Map<string, number>();
    let sent = 0;
    let failed = 0;
    for (const l of logs ?? []) {
      const d = new Date(l.created_at);
      const day = d.toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
      hourMap.set(d.getHours(), (hourMap.get(d.getHours()) ?? 0) + 1);
      if (l.status === "sent") sent++;
      else if (l.status === "failed") failed++;
      const peer = l.from_instance_id === data.id ? l.to_instance_id : l.from_instance_id;
      if (peer) peerMap.set(peer, (peerMap.get(peer) ?? 0) + 1);
    }

    const daily: { day: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      daily.push({ day: key, count: dailyMap.get(key) ?? 0 });
    }

    const peerIds = Array.from(peerMap.keys());
    let peers: { id: string; name: string; count: number }[] = [];
    if (peerIds.length) {
      const { data: names } = await supabase
        .from("whatsapp_instances")
        .select("id, name")
        .in("id", peerIds);
      peers = (names ?? [])
        .map((n: any) => ({ id: n.id, name: n.name, count: peerMap.get(n.id) ?? 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }

    const hourly: { hour: number; count: number }[] = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourMap.get(h) ?? 0,
    }));

    const score = Math.min(
      100,
      Math.round(
        Number(temp?.msgs_7d ?? 0) / 3 +
          Number(temp?.active_days_7d ?? 0) * 8 +
          peers.length * 4,
      ),
    );

    return {
      instance: inst,
      temperature: temp?.temperature ?? "cold",
      msgs_7d: Number(temp?.msgs_7d ?? 0),
      msgs_total: Number(temp?.msgs_total ?? 0),
      active_days_7d: Number(temp?.active_days_7d ?? 0),
      last_activity: temp?.last_activity ?? null,
      sent_30d: sent,
      failed_30d: failed,
      score,
      daily,
      hourly,
      peers,
    };
  });

export const getGroupEngineStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: g } = await supabase
      .from("warmup_groups")
      .select("id, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!g || (g as any).user_id !== userId) throw new Error("Grupo não encontrado");

    const { data: s } = await supabase.rpc("group_engine_status", { _group_id: data.id });
    const row = Array.isArray(s) ? s[0] : s;
    return {
      last_activity: row?.last_activity ?? null,
      next_run_at: row?.next_run_at ?? null,
      msgs_today: Number(row?.msgs_today ?? 0),
      msgs_total: Number(row?.msgs_total ?? 0),
      active: !!row?.active,
      connected_members: Number(row?.connected_members ?? 0),
      total_members: Number(row?.total_members ?? 0),
    };
  });

export const getUserDailySeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.rpc("messages_daily_series", { _user_id: userId, _days: 30 });
    return (data ?? []).map((r: any) => ({
      day: r.day,
      sent: Number(r.sent),
      failed: Number(r.failed),
    }));
  });

// ---------------- Admin: platform-wide dashboards ----------------

export const adminPlatformDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: daily } = await supabaseAdmin.rpc("messages_daily_series", {
      _user_id: null as any,
      _days: 30,
    });

    const { data: instances } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, user_id, status");

    const tempResults = await Promise.all(
      (instances ?? []).map(async (i: any) => {
        const { data: t } = await supabaseAdmin.rpc("chip_temperature", { _instance_id: i.id });
        const row = Array.isArray(t) ? t[0] : t;
        return {
          id: i.id,
          user_id: i.user_id,
          status: i.status,
          temperature: (row?.temperature ?? "cold") as string,
          msgs_7d: Number(row?.msgs_7d ?? 0),
        };
      }),
    );

    const tempDist = { hot: 0, warm: 0, cold: 0 };
    for (const t of tempResults) tempDist[t.temperature as "hot" | "warm" | "cold"]++;

    const perUser = new Map<string, { chips: number; msgs_7d: number }>();
    for (const t of tempResults) {
      const cur = perUser.get(t.user_id) ?? { chips: 0, msgs_7d: 0 };
      cur.chips++;
      cur.msgs_7d += t.msgs_7d;
      perUser.set(t.user_id, cur);
    }
    const topIds = Array.from(perUser.entries())
      .sort((a, b) => b[1].msgs_7d - a[1].msgs_7d)
      .slice(0, 10)
      .map(([id]) => id);
    const { data: topProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", topIds.length ? topIds : ["00000000-0000-0000-0000-000000000000"]);
    const topClients = topIds.map((id) => {
      const p = (topProfiles ?? []).find((x: any) => x.id === id);
      const s = perUser.get(id)!;
      return {
        id,
        name: (p as any)?.full_name || (p as any)?.email || id.slice(0, 8),
        email: (p as any)?.email ?? "",
        chips: s.chips,
        msgs_7d: s.msgs_7d,
      };
    });

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [lastLogRes, fail24Res, sent24Res] = await Promise.all([
      supabaseAdmin
        .from("warmup_logs")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("warmup_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", dayAgo),
      supabaseAdmin
        .from("warmup_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", dayAgo),
    ]);
    const fail24 = fail24Res.count ?? 0;
    const sent24 = sent24Res.count ?? 0;

    const [totalRes, week7Res, month30Res] = await Promise.all([
      supabaseAdmin.from("warmup_logs").select("id", { count: "exact", head: true }).eq("status", "sent"),
      supabaseAdmin
        .from("warmup_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
      supabaseAdmin
        .from("warmup_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
    ]);

    return {
      dailySeries: (daily ?? []).map((r: any) => ({
        day: r.day,
        sent: Number(r.sent),
        failed: Number(r.failed),
      })),
      totals: {
        totalChips: (instances ?? []).length,
        connectedChips: (instances ?? []).filter((i: any) => i.status === "connected").length,
        totalMsgs: totalRes.count ?? 0,
        totalMsgs7d: week7Res.count ?? 0,
        totalMsgs30d: month30Res.count ?? 0,
      },
      temperature: tempDist,
      topClients,
      engine: {
        lastLogAt: (lastLogRes.data as any)?.created_at ?? null,
        sent24h: sent24,
        failed24h: fail24,
        successRate:
          sent24 + fail24 > 0 ? Math.round((sent24 / (sent24 + fail24)) * 100) : 100,
      },
    };
  });
