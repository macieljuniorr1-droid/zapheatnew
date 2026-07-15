// Server-only Pagar.me API v5 client.
// Never import from client code. Reads process.env inside functions, never at module scope.
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE_URL = "https://api.pagar.me/core/v5";

function auth() {
  const key = process.env.PAGARME_API_KEY;
  if (!key) throw new Error("PAGARME_API_KEY não configurada");
  // Basic auth: secret_key + ":" (senha vazia)
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

async function pmFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: auth(),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Pagar.me ${res.status}: ${msg}`);
  }
  return body;
}

export const pagarme = {
  /**
   * Cria ou atualiza customer. Idempotente pelo `code`.
   */
  createCustomer: (payload: {
    name: string;
    email: string;
    document: string; // CPF só números
    code: string;
    type?: "individual" | "company";
  }) =>
    pmFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        type: payload.type ?? "individual",
        document: payload.document.replace(/\D/g, ""),
        document_type: "cpf",
        code: payload.code,
      }),
    }),

  /**
   * Cria uma order com pagamento único (PIX ou boleto/cartão via checkout hospedado).
   * Retorna a order com charges[0] contendo o PIX QR code ou o payment_url do checkout.
   */
  createOrder: (payload: {
    code: string;
    customer_id: string;
    amount_cents: number;
    description: string;
    method: "pix" | "credit_card_checkout";
    metadata?: Record<string, string>;
    success_url?: string;
  }) => {
    const item = {
      amount: payload.amount_cents,
      description: payload.description,
      quantity: 1,
      code: payload.code,
    };
    const payments =
      payload.method === "pix"
        ? [
            {
              payment_method: "pix",
              pix: {
                expires_in: 3600,
                additional_information: [{ name: "Servico", value: "ZapHeat" }],
              },
            },
          ]
        : [
            {
              payment_method: "checkout",
              checkout: {
                expires_in: 3600,
                billing_address_editable: false,
                customer_editable: true,
                accepted_payment_methods: ["credit_card"],
                success_url: payload.success_url ?? "https://zapheatnew.lovable.app/app?tab=plan",
                credit_card: {
                  installments: [{ number: 1, total: payload.amount_cents }],
                  statement_descriptor: "ZAPHEAT",
                },
              },
            },
          ];
    return pmFetch("/orders", {
      method: "POST",
      body: JSON.stringify({
        code: payload.code,
        customer_id: payload.customer_id,
        items: [item],
        payments,
        metadata: payload.metadata ?? {},
      }),
    });
  },

  cancelOrder: (order_id: string) =>
    pmFetch(`/orders/${encodeURIComponent(order_id)}/closed`, {
      method: "PATCH",
      body: JSON.stringify({ status: "canceled" }),
    }),
};

/**
 * Verifica assinatura HMAC-SHA256 do webhook.
 * Pagar.me envia o header `x-hub-signature` como `sha256=<hex>`.
 */
export function verifyPagarmeSignature(rawBody: string, header: string | null) {
  const secret = process.env.PAGARME_WEBHOOK_SECRET;
  if (!secret) throw new Error("PAGARME_WEBHOOK_SECRET não configurada");
  if (!header) return false;
  const clean = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(clean, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
