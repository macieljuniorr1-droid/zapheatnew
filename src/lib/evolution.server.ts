// Server-only Evolution API HTTP client. Never import from client code.
export type EvolutionConfig = { api_url: string; api_key: string };

async function getConfig(): Promise<EvolutionConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("evolution_config")
    .select("api_url, api_key")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`Evolution config error: ${error.message}`);
  if (!data?.api_url || !data?.api_key) {
    throw new Error(
      "Evolution API não configurada. Peça ao admin para preencher URL e API Key na aba Admin.",
    );
  }
  return { api_url: data.api_url.replace(/\/+$/, ""), api_key: data.api_key };
}

async function evoFetch(path: string, init: RequestInit = {}, timeoutMs = 5_000) {
  const cfg = await getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${cfg.api_url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.api_key,
        ...(init.headers || {}),
      },
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`Evolution timeout em ${path}`);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Evolution ${res.status}: ${msg}`);
  }
  return body as any;
}

export const evolution = {
  createInstance: (instanceName: string) =>
    evoFetch("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      }),
    }, 20_000),
  connect: (instanceName: string) =>
    evoFetch(`/instance/connect/${encodeURIComponent(instanceName)}`, { method: "GET" }, 5_000),
  connectionState: (instanceName: string) =>
    evoFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`, { method: "GET" }, 1_500),
  fetchInstance: (instanceName: string) =>
    evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, { method: "GET" }, 2_000),
  restart: (instanceName: string) =>
    evoFetch(`/instance/restart/${encodeURIComponent(instanceName)}`, { method: "POST", body: JSON.stringify({}) }, 5_000),
  deleteInstance: (instanceName: string) =>
    evoFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" }),
  logout: (instanceName: string) =>
    evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" }),
  sendPresence: (instanceName: string, number: string, presence: "composing" | "recording" | "paused", delayMs = 1200) =>
    evoFetch(`/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, presence, delay: delayMs }),
    }).catch(() => null), // presença é cosmética; não deixa a mensagem quebrar
  sendText: async (instanceName: string, number: string, text: string, delayMs = 0) => {
    const path = `/message/sendText/${encodeURIComponent(instanceName)}`;
    const cleanNumber = String(number ?? "").trim();
    const cleanText = String(text ?? "").trim();

    if (!cleanNumber) throw new Error("Destinatário sem número válido");
    if (!cleanText) throw new Error("Mensagem vazia: Evolution exige o campo text");

    // Mantém compatibilidade entre versões da Evolution. A variante principal
    // usa `text` no topo (exigida no erro reportado), mas preservamos fallbacks
    // seguros para builds que ainda aceitam/esperam `textMessage`.
    const payloads = [
      { number: cleanNumber, text: cleanText, delay: delayMs, linkPreview: false },
      { number: cleanNumber, text: cleanText, options: { delay: delayMs, linkPreview: false } },
      { number: cleanNumber, text: cleanText, textMessage: { text: cleanText }, delay: delayMs, linkPreview: false },
      { number: cleanNumber, text: cleanText, textMessage: { text: cleanText }, delay: delayMs, options: { delay: delayMs, linkPreview: false } },
    ];

    const errors: any[] = [];
    for (const payload of payloads) {
      try {
        return await evoFetch(path, {
          method: "POST",
          body: JSON.stringify(payload),
        }, 4_000);
      } catch (e: any) {
        errors.push(e);
        const msg = String(e?.message ?? "");
        // Problemas de sessão/JID não são resolvidos mudando o formato do
        // payload. Parar aqui preserva a causa real em vez de mascarar com
        // "instance requires property text" de uma tentativa posterior.
        if (/remetente n[aã]o abriu sess[aã]o|sender has not opened session|connection closed|no sessions|sessionerror|stream errored|timed out|1006|cannot read properties of undefined|reading 'id'|reading "id"/i.test(msg)) {
          throw e;
        }
      }
    }

    const meaningful = errors.find((e) => !/requires property ["']?text|property \"text\"|mensagem vazia/i.test(String(e?.message ?? "")));
    throw meaningful ?? errors[0];
  },
  whatsappNumbers: (instanceName: string, numbers: string[]) =>
    evoFetch(`/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ numbers }),
    }).catch(() => null),

  findMessages: (instanceName: string, remoteJid: string) =>
    evoFetch(`/chat/findMessages/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ where: { key: { remoteJid } } }),
    }, 1_500),
  findStatusMessage: (instanceName: string, where: { id?: string; remoteJid?: string; fromMe?: boolean }, limit = 20) =>
    evoFetch(`/chat/findStatusMessage/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ where, limit, offset: limit, page: 1 }),
    }, 1_500),
  findChats: (instanceName: string) =>
    evoFetch(`/chat/findChats/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  findContacts: (instanceName: string) =>
    evoFetch(`/chat/findContacts/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }).catch(() => null),
  markMessageAsRead: (instanceName: string, readMessages: Array<{ remoteJid: string; fromMe: boolean; id: string }>) =>
    evoFetch(`/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ readMessages }),
    }).catch(() => null),
  sendMedia: (
    instanceName: string,
    number: string,
    opts: { mediatype: "image" | "video" | "document"; media: string; caption?: string; fileName?: string },
  ) =>
    evoFetch(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({
        number,
        mediatype: opts.mediatype,
        media: opts.media,
        caption: opts.caption ?? "",
        fileName: opts.fileName ?? `arquivo.${opts.mediatype === "image" ? "jpg" : opts.mediatype === "video" ? "mp4" : "pdf"}`,
      }),
    }),
};
