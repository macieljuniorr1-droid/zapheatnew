import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRICE_CENTS = 2500;

// -------- Master: lista funcionários --------
export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: members, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, member_role, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    if (!members || members.length === 0) return { members: [] };

    const ids = members.map((m) => m.id);

    const [{ data: presence }, { data: instances }, { data: logs }] = await Promise.all([
      supabase.from("user_presence").select("user_id, last_seen_at").in("user_id", ids),
      supabase
        .from("whatsapp_instances")
        .select("id, name, status, user_id, assigned_to")
        .or(`user_id.in.(${ids.join(",")}),assigned_to.in.(${ids.join(",")})`),
      supabase
        .from("warmup_logs")
        .select("user_id, status, created_at")
        .in("user_id", ids)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
    ]);

    const presMap = new Map((presence ?? []).map((p) => [p.user_id, p.last_seen_at]));
    return {
      members: members.map((m) => {
        const memberInsts = (instances ?? []).filter(
          (i) => i.assigned_to === m.id || i.user_id === m.id,
        );
        const memberLogs = (logs ?? []).filter((l) => l.user_id === m.id);
        const sent = memberLogs.filter((l) => l.status === "sent").length;
        const failed = memberLogs.filter((l) => l.status === "failed").length;
        const lastSeen = presMap.get(m.id) ?? null;
        const isOnline = lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
        return {
          ...m,
          last_seen_at: lastSeen,
          is_online: !!isOnline,
          instances: memberInsts,
          instance_count: memberInsts.length,
          msgs_7d: sent,
          msgs_7d_failed: failed,
        };
      }),
    };
  });

// -------- Master: cria funcionário + provisiona N números --------
export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        email: z.string().email().max(255),
        full_name: z.string().min(2).max(120),
        password: z.string().min(8).max(72),
        member_role: z.enum(["operator", "manager"]).default("operator"),
        number_count: z.number().int().min(0).max(50).default(0),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // apenas master (owner_id nulo) pode criar
    const { data: me } = await supabase
      .from("profiles")
      .select("owner_id")
      .eq("id", userId)
      .maybeSingle();
    if (me?.owner_id) throw new Error("Apenas o usuário master pode adicionar funcionários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // cria usuário auth
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Falha ao criar usuário");
    const newId = created.user.id;

    // upsert profile como membro
    await supabaseAdmin
      .from("profiles")
      .upsert({
        id: newId,
        email: data.email,
        full_name: data.full_name,
        owner_id: userId,
        member_role: data.member_role,
      });

    // provisiona N number_subscriptions ligados ao master → cobradas na próxima fatura
    if (data.number_count > 0) {
      const now = new Date();
      const nextPeriod = new Date(now);
      nextPeriod.setMonth(nextPeriod.getMonth() + 1);
      const rows = Array.from({ length: data.number_count }).map(() => ({
        user_id: userId,
        payment_method: "next_invoice",
        status: "active",
        price_cents: PRICE_CENTS,
        current_period_end: nextPeriod.toISOString(),
      }));
      const { error: nsErr } = await supabaseAdmin.from("number_subscriptions").insert(rows);
      if (nsErr) throw new Error("Falha ao provisionar números: " + nsErr.message);
    }

    // audit
    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "team.member_created",
      entity_type: "profile",
      entity_id: newId,
      metadata: { email: data.email, numbers: data.number_count, role: data.member_role },
    });

    return { ok: true, member_id: newId };
  });

// -------- Master: remove funcionário --------
export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ member_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("owner_id")
      .eq("id", data.member_id)
      .maybeSingle();
    if (!prof || prof.owner_id !== userId) throw new Error("Funcionário não pertence a você.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.deleteUser(data.member_id);

    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "team.member_removed",
      entity_type: "profile",
      entity_id: data.member_id,
      metadata: {},
    });
    return { ok: true };
  });

// -------- Master: atualizar papel/atribuições --------
export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        member_id: z.string().uuid(),
        member_role: z.enum(["operator", "manager"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("owner_id")
      .eq("id", data.member_id)
      .maybeSingle();
    if (!prof || prof.owner_id !== userId) throw new Error("Sem permissão");

    if (data.member_role) {
      await supabase.from("profiles").update({ member_role: data.member_role }).eq("id", data.member_id);
    }
    return { ok: true };
  });

// -------- Master: redefinir senha de um funcionário --------
export const resetTeamMemberPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        member_id: z.string().uuid(),
        new_password: z.string().min(8).max(72),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // confirma que o alvo é membro deste master
    const { data: prof } = await supabase
      .from("profiles")
      .select("owner_id, email")
      .eq("id", data.member_id)
      .maybeSingle();
    if (!prof || prof.owner_id !== userId) {
      throw new Error("Funcionário não pertence a você.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.member_id, {
      password: data.new_password,
    });
    if (error) throw new Error(error.message);

    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "team.member_password_reset",
      entity_type: "profile",
      entity_id: data.member_id,
      metadata: { email: prof.email },
    });
    return { ok: true };
  });

// -------- Master: atribuir número a um membro --------
export const assignInstanceToMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        instance_id: z.string().uuid(),
        member_id: z.string().uuid().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // instance deve pertencer ao master
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("id, user_id")
      .eq("id", data.instance_id)
      .maybeSingle();
    if (!inst || inst.user_id !== userId) throw new Error("Número não pertence a você.");

    if (data.member_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("owner_id")
        .eq("id", data.member_id)
        .maybeSingle();
      if (!prof || prof.owner_id !== userId) throw new Error("Funcionário inválido");
    }

    await supabase
      .from("whatsapp_instances")
      .update({ assigned_to: data.member_id })
      .eq("id", data.instance_id);

    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "team.instance_assigned",
      entity_type: "whatsapp_instance",
      entity_id: data.instance_id,
      metadata: { member_id: data.member_id },
    });
    return { ok: true };
  });

// -------- Master: feed de atividade da equipe --------
export const getTeamActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(i ?? { limit: 50 }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: members } = await supabase.from("profiles").select("id, full_name, email").eq("owner_id", userId);
    const ids = [userId, ...(members ?? []).map((m) => m.id)];

    const { data: logs } = await supabase
      .from("activity_logs")
      .select("*")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    const nameMap = new Map((members ?? []).map((m) => [m.id, m.full_name || m.email]));
    return {
      logs: (logs ?? []).map((l) => ({
        ...l,
        user_label: l.user_id === userId ? "Você (master)" : nameMap.get(l.user_id) || "Desconhecido",
      })),
    };
  });

// -------- Heartbeat de presença --------
export const heartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("user_presence")
      .upsert({ user_id: userId, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return { ok: true };
  });

// -------- Contexto do usuário logado (é master? é membro?) --------
export const getMyTeamContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("id, email, full_name, owner_id, member_role")
      .eq("id", userId)
      .maybeSingle();

    let master: { id: string; email: string | null; full_name: string | null } | null = null;
    if (me?.owner_id) {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", me.owner_id)
        .maybeSingle();
      master = data ?? null;
    }
    return {
      is_master: !me?.owner_id,
      member_role: me?.member_role ?? "master",
      profile: me,
      master,
    };
  });
