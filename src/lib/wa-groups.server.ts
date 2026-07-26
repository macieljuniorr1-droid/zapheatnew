// Server-only helpers dos grupos reais de WhatsApp (participantes + figurinhas).
// Nunca importe este arquivo de código de cliente.

export function jidToPhone(jid: string): string | null {
  const digits = String(jid ?? "").split("@")[0]?.replace(/\D/g, "");
  return digits && digits.length >= 8 ? digits : null;
}

type AnyClient = any;

/**
 * Lê os participantes atuais do grupo na Evolution e reconcilia com a tabela
 * wa_group_participants: quem entrou, quem continua e quem saiu.
 */
export async function syncGroupParticipants(
  db: AnyClient,
  group: { id: string; user_id: string; group_jid: string; evolution_instance: string },
) {
  const { evolution } = await import("@/lib/evolution.server");
  const { participants } = await evolution.groupParticipants(
    group.evolution_instance,
    group.group_jid,
  );
  if (!participants.length) return { synced: 0, joined: 0, left: 0 };

  const { data: mine } = await db
    .from("whatsapp_instances")
    .select("phone")
    .eq("user_id", group.user_id);
  const minePhones = new Set(
    (mine ?? [])
      .map((m: any) => String(m.phone ?? "").replace(/\D/g, ""))
      .filter(Boolean),
  );

  const now = new Date().toISOString();
  const seen: string[] = [];
  let joined = 0;

  const { data: existing } = await db
    .from("wa_group_participants")
    .select("jid, present")
    .eq("group_id", group.id);
  const existingJids = new Set((existing ?? []).map((e: any) => e.jid));

  for (const p of participants) {
    const jid: string = String(p?.id ?? p?.jid ?? p?.user ?? "");
    if (!jid) continue;
    const phone = jidToPhone(jid);
    const isAdmin = !!(p?.admin || p?.isAdmin || p?.isSuperAdmin);
    seen.push(jid);
    if (!existingJids.has(jid)) joined += 1;
    await db.from("wa_group_participants").upsert(
      {
        user_id: group.user_id,
        group_id: group.id,
        jid,
        phone,
        name: p?.name ?? p?.notify ?? p?.pushName ?? null,
        is_admin: isAdmin,
        is_mine: phone ? minePhones.has(phone) : false,
        present: true,
        last_seen_at: now,
        left_at: null,
      },
      { onConflict: "group_id,jid" },
    );
  }

  // Quem não apareceu na leitura atual saiu do grupo.
  const { data: gone } = await db
    .from("wa_group_participants")
    .update({ present: false, left_at: now })
    .eq("group_id", group.id)
    .eq("present", true)
    .not("jid", "in", `(${seen.map((j) => `"${j}"`).join(",")})`)
    .select("jid");

  await db
    .from("wa_groups")
    .update({ participant_count: seen.length, participants_synced_at: now })
    .eq("id", group.id);

  return { synced: seen.length, joined, left: (gone ?? []).length };
}

/** Sorteia uma figurinha da biblioteca do usuário. */
export async function pickSticker(db: AnyClient, userId: string): Promise<string | null> {
  const { data } = await db.from("wa_stickers").select("url").eq("user_id", userId).limit(200);
  const list = (data ?? []).map((s: any) => s.url).filter(Boolean);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}
