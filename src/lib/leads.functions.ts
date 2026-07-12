import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parsePhone } from "./phone";

// Admin: upload leads from raw TXT content
export const uploadLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ content: z.string().min(1).max(20_000_000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem subir leads.");

    const lines = data.content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return { inserted: 0, skipped: 0, withoutPhone: 0 };

    const rows = lines.map((raw_line) => {
      const { phone, ddd } = parsePhone(raw_line);
      return { raw_line, phone, ddd, uploaded_by: userId };
    });

    const withoutPhone = rows.filter((r) => !r.phone).length;

    // Insert in chunks to keep payload sane
    const chunkSize = 1000;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error, count } = await supabase.from("leads").insert(chunk, { count: "exact" });
      if (error) throw new Error(error.message);
      inserted += count ?? chunk.length;
    }

    return { inserted, skipped: 0, withoutPhone };
  });

// Seller: claim leads by DDD and quantity. Returns TXT content.
export const claimLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ddd: z.string().regex(/^\d{2}$/, "DDD deve ter 2 dígitos"),
        quantity: z.number().int().min(1).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("claim_leads", {
      _ddd: data.ddd,
      _qty: data.quantity,
    });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as { raw_line: string; phone: string | null }[];
    const txt = list.map((r) => r.raw_line).join("\n");
    return { count: list.length, txt };
  });

// Admin: stats per DDD
export const getLeadStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores.");
    const { data, error } = await supabase.rpc("lead_stats_by_ddd");
    if (error) throw new Error(error.message);
    return (data ?? []) as { ddd: string; available: number; used: number; total: number }[];
  });

// Seller: availability per DDD
export const getAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("available_by_ddd");
    if (error) throw new Error(error.message);
    return (data ?? []) as { ddd: string; available: number }[];
  });

// Current user role
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role);
    return {
      userId,
      isAdmin: roles.includes("admin"),
      isSeller: roles.includes("seller"),
    };
  });
