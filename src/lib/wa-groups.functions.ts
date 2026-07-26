import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Grupos REAIS de WhatsApp (@g.us): criação, participantes e automação 24h.

export function normalizePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("55")) return digits;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

const automationSchema = z.object({
  theme: z.string().max(300).optional().nullable(),
  ai_model: z.string().max(120).optional().nullable(),
  min_interval_seconds: z.number().int().min(30).max(86400).optional(),
  max_interval_seconds: z.number().int().min(60).max(86400).optional(),
  active_hour_start: z.number().int().min(0).max(23).optional(),
  active_hour_end: z.number().int().min(1).max(24).optional(),
  daily_limit: z.number().int().min(1).max(2000).optional(),
});

export const listWaGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: groups, error } = await supabase
      .from("wa_groups")
      .select("*, wa_group_senders(instance_id)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (groups ?? []).map((g: any) => g.id);
    const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const counts = new Map<string, { today: number; total: number; last?: any }>();
    if (ids.length) {
      const { data: logs } = await supabase
        .from("wa_group_logs")
        .select("group_id, status, content, error, created_at")
        .in("group_id", ids)
        .order("created_at", { ascending: false })
        .limit(2000);
      for (const l of logs ?? []) {
        const c = counts.get(l.group_id) ?? { today: 0, total: 0 };
        if (!c.last) c.last = l;
        if (l.status === "sent") {
          c.total += 1;
          if (l.created_at >= todayIso) c.today += 1;
        }
        counts.set(l.group_id, c);
      }
    }

    return (groups ?? []).map((g: any) => {
      const c = counts.get(g.id) ?? { today: 0, total: 0, last: null };
      return {
        ...g,
        sender_instance_ids: (g.wa_group_senders ?? []).map((s: any) => s.instance_id),
        msgs_today: c.today,
        msgs_total: c.total,
        last_log: c.last ?? null,
      };
    });
  });

export const listWaGroupLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId?: string | null } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("wa_group_logs")
      .select("*, wa_groups(subject), whatsapp_instances(name, phone)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.groupId) q = q.eq("group_id", data.groupId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createWaGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ownerInstanceId: z.string().uuid(),
        subject: z.string().min(1).max(80),
        description: z.string().max(500).optional().nullable(),
        participants: z.array(z.string()).max(300).default([]),
        senderInstanceIds: z.array(z.string().uuid()).default([]),
        theme: z.string().max(300).optional().nullable(),
        ai_model: z.string().max(120).optional().nullable(),
        min_interval_seconds: z.number().int().min(30).max(86400).default(300),
        max_interval_seconds: z.number().int().min(60).max(86400).default(1800),
        active_hour_start: z.number().int().min(0).max(23).default(0),
        active_hour_end: z.number().int().min(1).max(24).default(24),
        daily_limit: z.number().int().min(1).max(2000).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { evolution } = await import("@/lib/evolution.server");

    const { data: owner } = await supabase
      .from("whatsapp_instances")
      .select("id, evolution_instance, status, phone")
      .eq("id", data.ownerInstanceId)
      .maybeSingle();
    if (!owner) throw new Error("Número não encontrado");
    if (owner.status !== "connected") throw new Error("O número criador precisa estar conectado");

    // Números da própria conta que vão revezar o envio também entram no grupo.
    const senderIds = Array.from(new Set([...data.senderInstanceIds, owner.id]));
    const { data: senders } = await supabase
      .from("whatsapp_instances")
      .select("id, phone, status")
      .in("id", senderIds);

    const phones = new Set<string>();
    for (const p of data.participants) {
      const n = normalizePhone(p);
      if (n) phones.add(n);
    }
    for (const s of senders ?? []) {
      if (s.id === owner.id) continue;
      const n = s.phone ? normalizePhone(s.phone) : null;
      if (n) phones.add(n);
    }
    if (phones.size === 0) throw new Error("Adicione ao menos 1 participante (além do criador)");

    const res: any = await evolution.createGroup(owner.evolution_instance, {
      subject: data.subject,
      description: data.description ?? "",
      participants: Array.from(phones),
    });
    const jid: string | undefined =
      res?.id ?? res?.groupJid ?? res?.key?.remoteJid ?? res?.group?.id ?? res?.data?.id;
    if (!jid || !String(jid).includes("@g.us")) {
      throw new Error(`WhatsApp não retornou o ID do grupo: ${JSON.stringify(res).slice(0, 300)}`);
    }

    const { data: row, error } = await supabase
      .from("wa_groups")
      .insert({
        user_id: userId,
        owner_instance_id: owner.id,
        group_jid: String(jid),
        subject: data.subject,
        description: data.description ?? null,
        participant_count: phones.size + 1,
        theme: data.theme ?? null,
        ai_model: data.ai_model ?? null,
        min_interval_seconds: data.min_interval_seconds,
        max_interval_seconds: Math.max(data.max_interval_seconds, data.min_interval_seconds),
        active_hour_start: data.active_hour_start,
        active_hour_end: data.active_hour_end,
        daily_limit: data.daily_limit,
        active: false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const senderRows = senderIds.map((id) => ({ group_id: row.id, instance_id: id }));
    if (senderRows.length) await supabase.from("wa_group_senders").insert(senderRows);

    return row;
  });

export const importWaGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ instanceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { evolution } = await import("@/lib/evolution.server");
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("id, evolution_instance, status")
      .eq("id", data.instanceId)
      .maybeSingle();
    if (!inst) throw new Error("Número não encontrado");
    if (inst.status !== "connected") throw new Error("Número não está conectado");

    const res: any = await evolution.fetchAllGroups(inst.evolution_instance, false);
    const list: any[] = Array.isArray(res) ? res : (res?.groups ?? res?.data ?? []);
    let imported = 0;
    for (const g of list) {
      const jid = g?.id ?? g?.groupJid;
      if (!jid || !String(jid).includes("@g.us")) continue;
      const { error } = await supabase.from("wa_groups").upsert(
        {
          user_id: userId,
          owner_instance_id: inst.id,
          group_jid: String(jid),
          subject: g?.subject ?? "Grupo",
          description: g?.desc ?? null,
          participant_count: Number(g?.size ?? g?.participants?.length ?? 0),
        },
        { onConflict: "user_id,group_jid" },
      );
      if (!error) imported += 1;
    }

    // garante que o número usado na importação seja remetente dos grupos dele
    const { data: mine } = await supabase
      .from("wa_groups")
      .select("id")
      .eq("user_id", userId)
      .eq("owner_instance_id", inst.id);
    for (const g of mine ?? []) {
      await supabase
        .from("wa_group_senders")
        .upsert({ group_id: g.id, instance_id: inst.id }, { onConflict: "group_id,instance_id" });
    }

    return { imported };
  });

export const addWaGroupParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), participants: z.array(z.string()).min(1).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { evolution } = await import("@/lib/evolution.server");
    const { data: g } = await supabase
      .from("wa_groups")
      .select("id, group_jid, participant_count, whatsapp_instances:owner_instance_id(evolution_instance, status)")
      .eq("id", data.groupId)
      .maybeSingle();
    if (!g) throw new Error("Grupo não encontrado");
    const inst: any = (g as any).whatsapp_instances;
    if (!inst?.evolution_instance) throw new Error("Número criador indisponível");

    const phones = Array.from(
      new Set(data.participants.map(normalizePhone).filter((p): p is string => !!p)),
    );
    if (!phones.length) throw new Error("Nenhum número válido");

    await evolution.updateGroupParticipants(inst.evolution_instance, g.group_jid, "add", phones);
    await supabase
      .from("wa_groups")
      .update({ participant_count: (g.participant_count ?? 0) + phones.length })
      .eq("id", g.id);
    return { added: phones.length };
  });

export const setWaGroupSenders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), instanceIds: z.array(z.string().uuid()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("wa_group_senders").delete().eq("group_id", data.groupId);
    if (data.instanceIds.length) {
      const { error } = await supabase
        .from("wa_group_senders")
        .insert(data.instanceIds.map((id) => ({ group_id: data.groupId, instance_id: id })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateWaGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), patch: automationSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = { ...data.patch };
    if (
      typeof patch.min_interval_seconds === "number" &&
      typeof patch.max_interval_seconds === "number" &&
      patch.max_interval_seconds < patch.min_interval_seconds
    ) {
      patch.max_interval_seconds = patch.min_interval_seconds;
    }
    const { error } = await supabase.from("wa_groups").update(patch).eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleWaGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("wa_groups")
      .update({
        active: data.active,
        next_run_at: data.active ? new Date(Date.now() + 5_000).toISOString() : null,
      })
      .eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWaGroupInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { evolution } = await import("@/lib/evolution.server");
    const { data: g } = await supabase
      .from("wa_groups")
      .select("group_jid, whatsapp_instances:owner_instance_id(evolution_instance)")
      .eq("id", data.groupId)
      .maybeSingle();
    if (!g) throw new Error("Grupo não encontrado");
    const inst: any = (g as any).whatsapp_instances;
    const res: any = await evolution.groupInviteCode(inst?.evolution_instance, g.group_jid);
    const code = res?.inviteCode ?? res?.code ?? null;
    return { code, url: res?.inviteUrl ?? (code ? `https://chat.whatsapp.com/${code}` : null) };
  });

export const deleteWaGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ groupId: z.string().uuid(), leave: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.leave) {
      try {
        const { evolution } = await import("@/lib/evolution.server");
        const { data: g } = await supabase
          .from("wa_groups")
          .select("group_jid, whatsapp_instances:owner_instance_id(evolution_instance)")
          .eq("id", data.groupId)
          .maybeSingle();
        const inst: any = (g as any)?.whatsapp_instances;
        if (g && inst?.evolution_instance) {
          await evolution.leaveGroup(inst.evolution_instance, g.group_jid);
        }
      } catch {
        // sair do grupo é best-effort; a remoção local continua
      }
    }
    const { error } = await supabase.from("wa_groups").delete().eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
