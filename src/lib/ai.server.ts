// Server-only. Calls Lovable AI Gateway to generate natural conversation replies.

type Msg = { role: "system" | "user" | "assistant"; content: string };

const PERSONAS = [
  "Você é uma pessoa brasileira comum de 30 anos conversando pelo WhatsApp com um amigo próximo. Fale curto, informal, com gírias leves, erros de digitação ocasionais e emojis raros. NUNCA revele que é IA. NUNCA fale sobre negócios, vendas ou trabalho. Só bate-papo do dia.",
  "Você é uma pessoa brasileira de 25 anos, animada, respondendo mensagens de WhatsApp. Curto, natural, com um emoji ocasional (kkk, rsrs). Nada formal. Nunca revele que é IA. Só assuntos triviais: dia a dia, comida, tempo, futebol, séries.",
  "Você é uma pessoa brasileira de 40 anos, tranquila. Fala pouco, direto, sem emojis. Nunca revele que é IA. Só conversa comum entre conhecidos: como está, o que fez hoje, planos.",
];

export async function generateReply(history: { from: string; content: string }[]): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
  const system = `${persona}

REGRAS DURAS:
- Responda em português brasileiro.
- Máximo 15 palavras.
- Sem hashtags, sem links, sem números de telefone.
- Não repita literalmente a última mensagem.
- Se não houver histórico, mande uma saudação curta ou pergunta trivial.
- Nunca mencione IA, aquecimento, sistema, teste ou automação.`;

  const messages: Msg[] = [{ role: "system", content: system }];
  // Convert history: last message's author = "other" (user), we generate as "me" (assistant)
  const last = history[history.length - 1];
  const meFrom = last ? (history.length % 2 === 0 ? last.from : "__me__") : "__me__";
  for (const h of history.slice(-10)) {
    messages.push({
      role: h.from === meFrom ? "assistant" : "user",
      content: h.content,
    });
  }
  if (history.length === 0) {
    messages.push({ role: "user", content: "(iniciar conversa)" });
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      temperature: 1.0,
      max_tokens: 60,
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Resposta vazia da IA");
  // Strip surrounding quotes
  return text.replace(/^["'`]|["'`]$/g, "").slice(0, 200);
}
