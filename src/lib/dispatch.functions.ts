import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Contact Lists ----------

export const listContactLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contact_lists")
      .select("id, name, created_at, contacts(count)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((l: any) => ({
      ...l,
      contact_count: l.contacts?.[0]?.count ?? 0,
    }));
  });

export const createContactList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().min(1).max(80),
        contacts: z
          .array(z.object({ phone: z.string().min(6).max(30), name: z.string().max(120).optional() }))
          .max(50000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: list, error } = await supabase
      .from("contact_lists")
      .insert({ user_id: userId, name: data.name })
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (data.contacts.length > 0) {
      const rows = data.contacts.map((c) => ({
        list_id: list.id,
        user_id: userId,
        phone: c.phone.replace(/\D/g, ""),
        name: c.name ?? null,
      }));
      // insert in chunks of 500
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error: e } = await supabase.from("contacts").insert(chunk);
        if (e) throw new Error(e.message);
      }
    }
    return list;
  });

export const deleteContactList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contact_lists").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Campaigns ----------

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns")
      .select(
        "*, list:contact_lists(name), campaign_instances(instance_id, whatsapp_instances(id, name, status))",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const camps = data ?? [];
    // Aggregate progress
    const ids = camps.map((c: any) => c.id);
    let progress: Record<string, { total: number; sent: number; failed: number; pending: number }> = {};
    if (ids.length) {
      const { data: rows } = await context.supabase
        .from("campaign_targets")
        .select("campaign_id, status")
        .in("campaign_id", ids);
      for (const r of rows ?? []) {
        const p = progress[r.campaign_id] ??= { total: 0, sent: 0, failed: 0, pending: 0 };
        p.total++;
        if (r.status === "sent") p.sent++;
        else if (r.status === "failed") p.failed++;
        else p.pending++;
      }
    }
    return camps.map((c: any) => ({ ...c, progress: progress[c.id] ?? { total: 0, sent: 0, failed: 0, pending: 0 } }));
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().min(1).max(100),
        message: z.string().min(1).max(4000),
        list_id: z.string().uuid(),
        instance_ids: z.array(z.string().uuid()).min(1),
        min_delay_seconds: z.number().int().min(10).max(3600).default(30),
        max_delay_seconds: z.number().int().min(15).max(7200).default(90),
        per_instance_daily_limit: z.number().int().min(1).max(1000).default(100),
        active_hour_start: z.number().int().min(0).max(23).default(8),
        active_hour_end: z.number().int().min(1).max(24).default(20),
        media_url: z.string().url().max(2000).optional().nullable(),
        media_type: z.enum(["image", "video", "document"]).optional().nullable(),
        media_filename: z.string().max(200).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.max_delay_seconds < data.min_delay_seconds)
      throw new Error("Intervalo máximo deve ser >= mínimo");
    if (data.active_hour_end <= data.active_hour_start)
      throw new Error("Hora final deve ser maior que a inicial");
    if (data.media_url && !data.media_type)
      throw new Error("Selecione o tipo da mídia (imagem, vídeo ou documento)");

    // Regra: só dispara com números que já completaram 3 dias de aquecimento
    const WARMUP_DAYS_REQUIRED = 3;
    const { data: chosen } = await supabase
      .from("whatsapp_instances")
      .select("id, name, status, warmup_started_at")
      .in("id", data.instance_ids);
    const now = Date.now();
    const notReady = (chosen ?? []).filter((c: any) => {
      if (c.status !== "connected") return true;
      if (!c.warmup_started_at) return true;
      const days = (now - new Date(c.warmup_started_at).getTime()) / 86400000;
      return days < WARMUP_DAYS_REQUIRED;
    });
    if (notReady.length > 0) {
      const names = notReady.map((n: any) => n.name).join(", ");
      throw new Error(
        `Estes números ainda não completaram 3 dias de aquecimento e não podem disparar: ${names}`,
      );
    }

    const { data: list } = await supabase
      .from("contact_lists")
      .select("id")
      .eq("id", data.list_id)
      .maybeSingle();
    if (!list) throw new Error("Lista não encontrada");

    const { data: camp, error } = await supabase
      .from("campaigns")
      .insert({
        user_id: userId,
        name: data.name,
        message: data.message,
        list_id: data.list_id,
        min_delay_seconds: data.min_delay_seconds,
        max_delay_seconds: data.max_delay_seconds,
        per_instance_daily_limit: data.per_instance_daily_limit,
        active_hour_start: data.active_hour_start,
        active_hour_end: data.active_hour_end,
        status: "draft",
        media_url: data.media_url ?? null,
        media_type: data.media_type ?? null,
        media_filename: data.media_filename ?? null,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const ciRows = data.instance_ids.map((iid) => ({ campaign_id: camp.id, instance_id: iid, user_id: userId }));
    const { error: ciErr } = await supabase.from("campaign_instances").insert(ciRows);
    if (ciErr) throw new Error(ciErr.message);

    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, phone, name")
      .eq("list_id", data.list_id);
    const targets = (contacts ?? []).map((c: any) => ({
      campaign_id: camp.id,
      user_id: userId,
      contact_id: c.id,
      phone: c.phone,
      name: c.name,
    }));
    for (let i = 0; i < targets.length; i += 500) {
      const chunk = targets.slice(i, i + 500);
      const { error: tErr } = await supabase.from("campaign_targets").insert(chunk);
      if (tErr) throw new Error(tErr.message);
    }
    return camp;
  });

export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "running", "paused", "done"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("campaigns")
      .update({ status: data.status, next_run_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
