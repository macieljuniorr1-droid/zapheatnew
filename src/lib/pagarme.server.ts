// Server-only Pagar.me API v5 client.
// Never import from client code. Reads process.env inside functions, never at module scope.
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE_URL = "https://api.pagar.me/core/v5";

function auth() {
  const key = process.env.PAGARME_API_KEY;
  if (!key) throw new Error("PAGARME_API_KEY não configurada");
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

export type Address = {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string; // UF
  zip_code: string; // CEP
  country?: string; // BR default
};

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  let country_code = "55";
  let rest = digits;
  if (digits.length >= 12 && digits.startsWith("55")) {
    rest = digits.slice(2);
  } else if (digits.length >= 12 && digits.length <= 13) {
    country_code = digits.slice(0, digits.length - 11);
    rest = digits.slice(-11);
  }
  return {
    country_code,
    area_code: rest.slice(0, 2),
    number: rest.slice(2),
  };
}

export function normalizeAddress(a: Address) {
  return {
    line_1: `${a.number}, ${a.street}, ${a.neighborhood}`,
    line_2: a.complement ?? "",
    zip_code: a.zip_code.replace(/\D/g, ""),
    city: a.city,
    state: a.state.toUpperCase().slice(0, 2),
    country: (a.country ?? "BR").toUpperCase(),
  };
}

export const pagarme = {
  createCustomer: (payload: {
    name: string;
    email: string;
    document: string;
    code: string;
    phone: string;
    address?: Address;
    type?: "individual" | "company";
  }) => {
    const p = normalizePhone(payload.phone);
    return pmFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        type: payload.type ?? "individual",
        document: payload.document.replace(/\D/g, ""),
        document_type: "cpf",
        code: payload.code,
        phones: { mobile_phone: p },
        ...(payload.address ? { address: normalizeAddress(payload.address) } : {}),
      }),
    });
  },

  updateCustomer: (
    customer_id: string,
    payload: {
      name: string;
      email: string;
      document: string;
      phone: string;
      address?: Address;
    },
  ) => {
    const p = normalizePhone(payload.phone);
    return pmFetch(`/customers/${encodeURIComponent(customer_id)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        document: payload.document.replace(/\D/g, ""),
        document_type: "cpf",
        type: "individual",
        phones: { mobile_phone: p },
        ...(payload.address ? { address: normalizeAddress(payload.address) } : {}),
      }),
    });
  },

  /**
   * Cria uma order Pagar.me v5.
   * - method="pix": PIX com QR code
   * - method="credit_card_native": cobrança direta de cartão via card_token (checkout interno)
   * - method="credit_card_checkout": checkout hospedado (fallback)
   */
  createOrder: (payload: {
    code: string;
    customer_id: string;
    amount_cents: number;
    description: string;
    method: "pix" | "credit_card_native" | "credit_card_checkout" | "credit_card_stored";
    metadata?: Record<string, string>;
    success_url?: string;
    card_token?: string; // requerido para credit_card_native
    card_id?: string; // requerido para credit_card_stored (renovação)
    installments?: number; // default 1
    billing_address?: Address; // requerido para cartão novo
  }) => {
    const item = {
      amount: payload.amount_cents,
      description: payload.description,
      quantity: 1,
      code: payload.code,
    };

    let payments: any[];
    if (payload.method === "pix") {
      payments = [
        {
          payment_method: "pix",
          pix: {
            expires_in: 3600,
            additional_information: [{ name: "Servico", value: "ZapHeat" }],
          },
        },
      ];
    } else if (payload.method === "credit_card_native") {
      if (!payload.card_token) throw new Error("card_token requerido para cartão");
      if (!payload.billing_address) throw new Error("billing_address requerido para cartão");
      payments = [
        {
          payment_method: "credit_card",
          credit_card: {
            installments: payload.installments ?? 1,
            statement_descriptor: "ZAPHEAT",
            card_token: payload.card_token,
            card: {
              billing_address: normalizeAddress(payload.billing_address),
            },
          },
        },
      ];
    } else {
      payments = [
        {
          payment_method: "checkout",
          checkout: {
            expires_in: 3600,
            billing_address_editable: false,
            customer_editable: true,
            accepted_payment_methods: ["credit_card"],
            success_url:
              payload.success_url ?? "https://zapheatnew.lovable.app/app?tab=plan",
            credit_card: {
              installments: [{ number: 1, total: payload.amount_cents }],
              statement_descriptor: "ZAPHEAT",
            },
          },
        },
      ];
    }

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
