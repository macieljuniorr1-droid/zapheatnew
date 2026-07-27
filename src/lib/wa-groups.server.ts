// Server-only helpers dos grupos reais de WhatsApp (participantes + figurinhas).
// Nunca importe este arquivo de código de cliente.

export function jidToPhone(jid: string): string | null {
  const digits = String(jid ?? "").split("@")[0]?.replace(/\D/g, "");
  return digits && digits.length >= 8 ? digits : null;
}

type AnyClient = any;

type SenderToJoin =
  | string
  | {
      evolution_instance?: string | null;
      phone?: string | null;
    };

function onlyDigits(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

function extractInviteCode(res: any): string | null {
  const raw =
    res?.inviteCode ??
    res?.code ??
    res?.data?.inviteCode ??
    res?.data?.code ??
    res?.inviteUrl ??
    res?.data?.inviteUrl ??
    null;
  if (!raw) return null;
  return String(raw)
    .replace(/^https?:\/\/chat\.whatsapp\.com\//i, "")
    .replace(/[?#].*$/, "")
    .trim();
}

function senderName(sender: SenderToJoin): string | null {
  return typeof sender === "string" ? sender : (sender.evolution_instance ?? null);
}

function senderPhone(sender: SenderToJoin): string | null {
  return typeof sender === "string" ? null : onlyDigits(sender.phone);
}

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

/**
 * Garante que os números remetentes da conta estejam DENTRO do grupo.
 * O WhatsApp frequentemente ignora números na criação (privacidade), o que faz
 * o envio falhar com "grupo não encontrado" / TypeError do Baileys. Aqui o dono
 * gera o link de convite e cada remetente entra por ele.
 */
export async function ensureSendersJoined(
  ownerInstance: string,
  groupJid: string,
  senders: SenderToJoin[],
): Promise<{ code: string | null; joined: number; invited: number }> {
  const { evolution } = await import("@/lib/evolution.server");
  const res: any = await evolution.groupInviteCode(ownerInstance, groupJid);
  const code = extractInviteCode(res);
  if (!code) return { code: null, joined: 0, invited: 0 };

  // Primeiro tenta adicionar pelo dono/admin do grupo. Em muitas versões da
  // Evolution o updateParticipant aceita JID completo; em outras aceita só o
  // número. Tentamos os dois formatos para contornar diferenças de versão.
  let invited = 0;
  for (const sender of senders) {
    const phone = senderPhone(sender);
    if (!phone) continue;
    try {
      await evolution.updateGroupParticipants(ownerInstance, groupJid, "add", [`${phone}@s.whatsapp.net`]);
      invited += 1;
    } catch {
      try {
        await evolution.updateGroupParticipants(ownerInstance, groupJid, "add", [phone]);
        invited += 1;
      } catch {
        // Privacidade do WhatsApp pode bloquear convite direto; abaixo o próprio
        // número tenta entrar pelo link de convite.
      }
    }
    await new Promise((r) => setTimeout(r, 450));
  }

  let joined = 0;
  for (const sender of senders) {
    const inst = senderName(sender);
    if (!inst || inst === ownerInstance) continue;
    try {
      const r = await evolution.acceptGroupInvite(inst, code);
      if (r) joined += 1;
    } catch {
      // convite pode falhar por número já estar no grupo — segue o baile
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  return { code, joined, invited };
}
