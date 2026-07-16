// Server-only SMS-Activate v2 API client.
// Docs: https://sms-activate.io/en/api2
// Nunca importar do client. process.env lido dentro das funções.

const BASE_URL = "https://api.sms-activate.io/stubs/handler_api.php";

// Conversão de custo do provider (em rublos) para BRL, com markup.
// Configurável via env. Defaults conservadores.
function rubToBRL() {
  const v = Number(process.env.SMS_ACTIVATE_RUB_TO_BRL ?? "0.06");
  return Number.isFinite(v) && v > 0 ? v : 0.06;
}
function markup() {
  const v = Number(process.env.SMS_ACTIVATE_MARKUP ?? "2.5");
  return Number.isFinite(v) && v > 1 ? v : 2.5;
}
function minPriceBRL() {
  const v = Number(process.env.SMS_ACTIVATE_MIN_PRICE_BRL ?? "3");
  return Number.isFinite(v) && v > 0 ? v : 3;
}

function apiKey() {
  const k = process.env.SMS_ACTIVATE_API_KEY;
  if (!k) throw new Error("SMS_ACTIVATE_API_KEY não configurada");
  return k;
}

async function saCall(params: Record<string, string>): Promise<string> {
  const url = new URL(BASE_URL);
  url.searchParams.set("api_key", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method: "GET" });
  const text = (await res.text()).trim();
  if (!res.ok) throw new Error(`SMS-Activate ${res.status}: ${text}`);
  return text;
}

async function saJson<T = any>(params: Record<string, string>): Promise<T> {
  const raw = await saCall({ ...params, action: params.action });
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`SMS-Activate resposta não-JSON: ${raw}`);
  }
}

/** Converte custo em rublos para centavos BRL com markup aplicado. */
export function providerRubToBrlCents(rub: number): number {
  const brl = rub * rubToBRL() * markup();
  const withMin = Math.max(brl, minPriceBRL());
  return Math.ceil(withMin * 100);
}

/** Custo de provider em rublos → centavos BRL SEM markup (auditoria). */
export function providerRubToRawBrlCents(rub: number): number {
  return Math.ceil(rub * rubToBRL() * 100);
}

// Países cujo WhatsApp funciona razoavelmente bem para verificação
// (código = país id do SMS-Activate).
export const SUPPORTED_COUNTRIES: Array<{ code: string; label: string; flag: string }> = [
  { code: "73", label: "Brasil", flag: "🇧🇷" },
  { code: "6",  label: "Indonésia", flag: "🇮🇩" },
  { code: "4",  label: "Filipinas", flag: "🇵🇭" },
  { code: "10", label: "Vietnã", flag: "🇻🇳" },
  { code: "22", label: "Índia", flag: "🇮🇳" },
  { code: "16", label: "Reino Unido", flag: "🇬🇧" },
  { code: "12", label: "EUA (virtual)", flag: "🇺🇸" },
  { code: "43", label: "Alemanha", flag: "🇩🇪" },
  { code: "78", label: "França", flag: "🇫🇷" },
  { code: "40", label: "Ucrânia", flag: "🇺🇦" },
];

export const WHATSAPP_SERVICE = "wa";

/** getPrices → { "73": { "wa": { cost: 15, count: 200 } }, ... } */
export async function getPrices(): Promise<Record<string, Record<string, { cost: number; count: number }>>> {
  return saJson({ action: "getPrices", service: WHATSAPP_SERVICE });
}

/** Preço + disponibilidade nos países suportados. */
export async function listWhatsAppCountries(): Promise<
  Array<{
    code: string;
    label: string;
    flag: string;
    price_cents: number;
    provider_cost_cents: number;
    provider_cost_rub: number;
    available: number;
  }>
> {
  const prices = await getPrices().catch(() => ({} as any));
  return SUPPORTED_COUNTRIES.map((c) => {
    const wa = prices?.[c.code]?.[WHATSAPP_SERVICE];
    const cost = typeof wa?.cost === "number" ? wa.cost : 0;
    const count = typeof wa?.count === "number" ? wa.count : 0;
    return {
      ...c,
      provider_cost_rub: cost,
      provider_cost_cents: providerRubToRawBrlCents(cost),
      price_cents: providerRubToBrlCents(cost),
      available: count,
    };
  });
}

/** getNumber: aluga um número. Retorna "ACCESS_NUMBER:<id>:<phone>" ou erro. */
export async function requestNumber(country: string): Promise<{ activationId: string; phone: string }> {
  const raw = await saCall({ action: "getNumber", service: WHATSAPP_SERVICE, country });
  if (raw.startsWith("ACCESS_NUMBER:")) {
    const [, id, phone] = raw.split(":");
    return { activationId: id, phone };
  }
  throw new Error(mapError(raw));
}

/** getStatus. Estados: STATUS_WAIT_CODE, STATUS_OK:<code>, STATUS_CANCEL. */
export async function getStatus(
  activationId: string,
): Promise<{ state: "waiting" | "received" | "canceled" | "unknown"; code?: string }> {
  const raw = await saCall({ action: "getStatus", id: activationId });
  if (raw === "STATUS_WAIT_CODE" || raw === "STATUS_WAIT_RESEND" || raw === "STATUS_WAIT_RETRY") {
    return { state: "waiting" };
  }
  if (raw.startsWith("STATUS_OK:")) return { state: "received", code: raw.slice("STATUS_OK:".length) };
  if (raw.startsWith("STATUS_WAIT_RETRY:")) return { state: "received", code: raw.slice("STATUS_WAIT_RETRY:".length) };
  if (raw === "STATUS_CANCEL") return { state: "canceled" };
  return { state: "unknown" };
}

/** getFullSms – texto integral do último SMS recebido. */
export async function getFullSms(activationId: string): Promise<string | null> {
  const raw = await saCall({ action: "getFullSms", id: activationId });
  if (raw.startsWith("FULL_SMS:")) return raw.slice("FULL_SMS:".length);
  return null;
}

/**
 * setStatus:
 *  status=1 → informa "SMS enviado" (não usamos)
 *  status=3 → pedir novo SMS (retry)
 *  status=6 → finalizar ativação (código recebido, encerrar)
 *  status=8 → cancelar (dá direito a reembolso se ainda não recebeu)
 */
export async function setStatus(activationId: string, status: 3 | 6 | 8): Promise<string> {
  return saCall({ action: "setStatus", id: activationId, status: String(status) });
}

export async function finishActivation(activationId: string) {
  return setStatus(activationId, 6);
}
export async function cancelActivation(activationId: string) {
  return setStatus(activationId, 8);
}

/** getBalance da conta SMS-Activate (para dashboard admin). */
export async function getProviderBalance(): Promise<number> {
  const raw = await saCall({ action: "getBalance" });
  if (raw.startsWith("ACCESS_BALANCE:")) return Number(raw.slice("ACCESS_BALANCE:".length));
  throw new Error(mapError(raw));
}

function mapError(raw: string): string {
  const map: Record<string, string> = {
    NO_NUMBERS: "Nenhum número disponível neste país agora. Tente outro.",
    NO_BALANCE: "Saldo insuficiente na conta do fornecedor. Contate o suporte.",
    BAD_KEY: "API key do SMS-Activate inválida.",
    ERROR_SQL: "Erro temporário no fornecedor. Tente novamente.",
    BAD_SERVICE: "Serviço não suportado.",
    BAD_ACTION: "Ação inválida.",
    WRONG_MAX_PRICE: "Preço acima do máximo aceito.",
    OPERATION_NOT_AVAILABLE: "Operação indisponível.",
  };
  return map[raw] ?? `SMS-Activate: ${raw}`;
}
