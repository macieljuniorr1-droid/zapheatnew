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

async function evoFetch(path: string, init: RequestInit = {}) {
  const cfg = await getConfig();
  const res = await fetch(`${cfg.api_url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.api_key,
      ...(init.headers || {}),
    },
  });
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
    }),
  connect: (instanceName: string) =>
    evoFetch(`/instance/connect/${encodeURIComponent(instanceName)}`, { method: "GET" }),
  connectionState: (instanceName: string) =>
    evoFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`, { method: "GET" }),
  fetchInstance: (instanceName: string) =>
    evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, { method: "GET" }),
  restart: (instanceName: string) =>
    evoFetch(`/instance/restart/${encodeURIComponent(instanceName)}`, { method: "POST", body: JSON.stringify({}) }),
  deleteInstance: (instanceName: string) =>
    evoFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" }),
  logout: (instanceName: string) =>
    evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" }),
  sendPresence: (instanceName: string, number: string, presence: "composing" | "recording" | "paused", delayMs = 1200) =>
    evoFetch(`/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, presence, delay: delayMs }),
    }).catch(() => null), // presença é cosmética; não deixa a mensagem quebrar
  sendText: (instanceName: string, number: string, text: string, delayMs = 0) =>
    evoFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, text, delay: delayMs }),
    }),
  whatsappNumbers: (instanceName: string, numbers: string[]) =>
    evoFetch(`/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ numbers }),
    }).catch(() => null),

  findMessages: (instanceName: string, remoteJid: string) =>
    evoFetch(`/chat/findMessages/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ where: { key: { remoteJid } } }),
    }),
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
