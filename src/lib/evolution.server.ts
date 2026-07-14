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
  deleteInstance: (instanceName: string) =>
    evoFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" }),
  logout: (instanceName: string) =>
    evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" }),
  sendText: (instanceName: string, number: string, text: string) =>
    evoFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, text }),
    }),
};
