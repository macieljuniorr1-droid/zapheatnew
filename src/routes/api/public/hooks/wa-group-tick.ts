import { createFileRoute } from "@tanstack/react-router";

// Cron: motor de grupos REAIS do WhatsApp. Roda a cada minuto e, para cada
// grupo com automação ligada e vencida, escolhe um número remetente do
// rodízio, gera uma mensagem natural com IA e envia no grupo (@g.us).

function nowHourBRT() {
  const h = new Date().getUTCHours() - 3;
  return (h + 24) % 24;
}

function randomBetween(min: number, max: number) {
  return Math.floor(min + Math.random() * Math.max(1, max - min));
}

export const Route = createFileRoute("/api/public/hooks/wa-group-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { evolution } = await import("@/lib/evolution.server");
        const { generateGroupMessage } = await import("@/lib/ai.server");
        const { syncGroupParticipants, pickSticker } = await import("@/lib/wa-groups.server");

        const nowIso = new Date().toISOString();
        const { data: groups, error } = await supabaseAdmin
          .from("wa_groups")
          .select(
            "id, user_id, subject, theme, ai_model, group_jid, min_interval_seconds, max_interval_seconds, active_hour_start, active_hour_end, daily_limit, sticker_chance, participants_synced_at, owner_instance_id, whatsapp_instances:owner_instance_id(evolution_instance, status), wa_group_senders(instance_id, whatsapp_instances(id, name, phone, status, evolution_instance))",
          )
          .eq("active", true)
          .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
          .limit(100);
        if (error) return Response.json({ error: error.message }, { status: 500 });


        const reschedule = async (g: any, seconds: number) => {
          await supabaseAdmin
            .from("wa_groups")
            .update({ next_run_at: new Date(Date.now() + seconds * 1000).toISOString() })
            .eq("id", g.id);
        };

        const results = await Promise.all(
          (groups ?? []).map(async (g: any) => {
            try {
              // Monitoramento: relê a lista de participantes a cada 30 min.
              const owner: any = g.whatsapp_instances;
              const staleMs = Date.now() - new Date(g.participants_synced_at ?? 0).getTime();
              if (owner?.evolution_instance && owner.status === "connected" && staleMs > 30 * 60_000) {
                try {
                  await syncGroupParticipants(supabaseAdmin, {
                    id: g.id,
                    user_id: g.user_id,
                    group_jid: g.group_jid,
                    evolution_instance: owner.evolution_instance,
                  });
                } catch {
                  // monitoramento é best-effort; não bloqueia o envio
                }
              }

              const h = nowHourBRT();
              if (h < g.active_hour_start || h >= g.active_hour_end) {
                await reschedule(g, 600);
                return { group: g.id, skipped: "fora do horário" };
              }



              const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
              const { count } = await supabaseAdmin
                .from("wa_group_logs")
                .select("id", { count: "exact", head: true })
                .eq("group_id", g.id)
                .eq("status", "sent")
                .gte("created_at", todayIso);
              if ((count ?? 0) >= (g.daily_limit ?? 200)) {
                await reschedule(g, 1800);
                return { group: g.id, skipped: "limite diário" };
              }

              const senders = (g.wa_group_senders ?? [])
                .map((s: any) => s.whatsapp_instances)
                .filter((i: any) => i && i.status === "connected");
              if (!senders.length) {
                await reschedule(g, 600);
                return { group: g.id, skipped: "nenhum número conectado" };
              }

              const { data: history } = await supabaseAdmin
                .from("wa_group_logs")
                .select("instance_id, content, status, created_at")
                .eq("group_id", g.id)
                .eq("status", "sent")
                .order("created_at", { ascending: false })
                .limit(20);
              const recent = (history ?? []).slice().reverse();

              // Rodízio: prioriza quem ficou mais tempo sem falar no grupo.
              const lastSpokeAt = new Map<string, number>();
              for (const r of recent) {
                if (r.instance_id) lastSpokeAt.set(r.instance_id, new Date(r.created_at).getTime());
              }
              const sender = senders
                .slice()
                .sort((a: any, b: any) => (lastSpokeAt.get(a.id) ?? 0) - (lastSpokeAt.get(b.id) ?? 0))[0];

              // Às vezes o motor manda uma figurinha em vez de texto.
              const stickerChance = Math.max(0, Math.min(100, g.sticker_chance ?? 0));
              const stickerUrl =
                Math.random() * 100 < stickerChance ? await pickSticker(supabaseAdmin, g.user_id) : null;

              const text = stickerUrl
                ? ""
                : await generateGroupMessage(
                    recent.map((r: any) => ({
                      from: r.instance_id === sender.id ? "__me__" : String(r.instance_id ?? "outro"),
                      content: String(r.content ?? ""),
                    })),
                    {
                      seed: `${g.id}:${sender.id}`,
                      senderName: sender.name,
                      subject: g.subject,
                      theme: g.theme,
                      model: g.ai_model,
                    },
                  );

              await evolution.sendPresence(
                sender.evolution_instance,
                g.group_jid,
                "composing",
                stickerUrl ? 1200 : Math.min(4000, 300 + text.length * 60),
              );

              try {
                if (stickerUrl) {
                  await evolution.sendSticker(sender.evolution_instance, g.group_jid, stickerUrl, 0);
                } else {
                  await evolution.sendText(sender.evolution_instance, g.group_jid, text, 0);
                }
                await supabaseAdmin.from("wa_group_logs").insert({
                  user_id: g.user_id,
                  group_id: g.id,
                  instance_id: sender.id,
                  content: stickerUrl ? "[figurinha]" : text,
                  kind: stickerUrl ? "sticker" : "text",
                  status: "sent",
                });
                await reschedule(g, randomBetween(g.min_interval_seconds, g.max_interval_seconds));
                return { group: g.id, sent: true, from: sender.name, kind: stickerUrl ? "sticker" : "text" };

              } catch (e: any) {
                const raw = String(e?.message ?? e);
                const friendly = /not-authorized|forbidden|403/i.test(raw)
                  ? "Este número não tem permissão para enviar no grupo (talvez só admins possam falar)."
                  : /not found|404|item-not-found/i.test(raw)
                    ? "Grupo não encontrado no WhatsApp — pode ter sido excluído ou o número saiu dele."
                    : /connection closed|no sessions|timed out|1006/i.test(raw)
                      ? "Sessão do número instável. Tente Recriar sessão na aba Números."
                      : raw.slice(0, 300);
                await supabaseAdmin.from("wa_group_logs").insert({
                  user_id: g.user_id,
                  group_id: g.id,
                  instance_id: sender.id,
                  content: stickerUrl ? "[figurinha]" : text,
                  kind: stickerUrl ? "sticker" : "text",
                  status: "failed",
                  error: friendly,
                });
                await reschedule(g, Math.max(120, g.min_interval_seconds));
                return { group: g.id, sent: false, error: friendly };
              }
            } catch (e: any) {
              await reschedule(g, 300);
              return { group: g.id, error: String(e?.message ?? e).slice(0, 300) };
            }
          }),
        );

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
