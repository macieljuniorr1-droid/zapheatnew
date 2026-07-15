// Server-only. Calls Lovable AI Gateway to generate natural, human-like
// WhatsApp conversation replies for chip warmup. The goal: keep two chips
// chatting indefinitely, sounding like real Brazilians, drifting through
// topics organically, so nothing looks automated.

type Msg = { role: "system" | "user" | "assistant"; content: string };

// A rich pool of personas — each conversation "slot" picks one and sticks
// with it for coherence, but different pairs feel like different people.
const PERSONAS = [
  "Homem, 32 anos, mecânico de São Paulo. Fala rápido, informal, gosta de futebol (Corinthians), churrasco, moto e piadas.",
  "Mulher, 27 anos, cabeleireira do Rio. Extrovertida, usa kkkk, fala de novela, praia, família, treino, comida.",
  "Homem, 45 anos, motorista de app de Belo Horizonte. Calmo, direto, curto. Fala de trânsito, filhos, futebol, política leve.",
  "Mulher, 22 anos, universitária de Curitiba. Descolada, usa gírias atuais (mano, tipo, sério), fala de faculdade, série, música, rolê.",
  "Homem, 38 anos, comerciante do interior de Minas. Simpático, usa 'trem', 'uai', fala de família, roça, festa, comida caseira.",
  "Mulher, 34 anos, professora de Salvador. Doce, animada, fala de escola, filhos, novela, praia, receita.",
  "Homem, 29 anos, vendedor de Porto Alegre. Bem-humorado, usa 'bah', 'tchê', fala de churrasco, Grêmio/Inter, mate, viagem.",
  "Mulher, 41 anos, dona de casa de Recife. Acolhedora, fala de família, novela, receita, igreja, vizinhança.",
  "Homem, 24 anos, entregador de Fortaleza. Descontraído, gosta de forró, praia, moto, jogo online.",
  "Mulher, 30 anos, enfermeira de Brasília. Cansada mas simpática, fala de plantão, filhos, série, comida, academia.",
];

// Sementes de assunto para começar do zero — evita "oi" repetido eternamente.
const TOPIC_SEEDS = [
  "puxa assunto sobre o tempo/clima de hoje",
  "conta rapidinho o que tá fazendo agora",
  "pergunta se a pessoa almoçou/jantou e o quê",
  "comenta o jogo/novela/série que passou",
  "reclama do trânsito ou do calor",
  "manda uma piada boba do dia",
  "pergunta como foi o fim de semana",
  "conta uma zoeira que aconteceu no trabalho",
  "pergunta sobre a família/filhos/pai/mãe",
  "sugere um lugar pra ir/comer",
  "comenta preço absurdo de alguma coisa",
  "fala de um sonho estranho que teve",
  "pergunta se a pessoa viu uma notícia",
  "manda um bom dia/boa tarde/boa noite natural",
  "pergunta se tá indo na festa/aniversário/churrasco",
  "reclama de sono ou cansaço",
  "conta que começou uma série nova",
  "fala de comida que tá com vontade",
  "pergunta se comprou algo que tava vendo",
  "manda um áudio mental (descreve rapidinho algo do dia)",
];

// Escolha determinística por par (from,to) para manter persona estável na conversa.
function pickByHash<T>(arr: T[], seed: string): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return arr[h % arr.length];
}

export async function generateReply(
  history: { from: string; content: string }[],
  opts?: { pairSeed?: string },
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const seed = opts?.pairSeed ?? String(Math.random());
  const persona = pickByHash(PERSONAS, seed);
  const isStart = history.length === 0;
  const topicHint = isStart ? pickByHash(TOPIC_SEEDS, seed + Date.now()) : null;

  // Frequência de troca de assunto: a cada ~8 mensagens, sugere drift natural.
  const shouldDrift = !isStart && history.length >= 6 && Math.random() < 0.25;

  const system = `Você é essa pessoa: ${persona}

Você está em uma conversa REAL de WhatsApp com um(a) amigo(a) próximo(a). NUNCA quebre o personagem.

REGRAS ABSOLUTAS (nunca viole):
- Português brasileiro, coloquial, do jeito que essa pessoa realmente fala.
- Frases curtas (1 a 20 palavras). Mensagens de WhatsApp são curtas.
- SEM pontuação formal excessiva. Use vírgula solta, ponto opcional, minúscula.
- Use gírias e vícios de linguagem naturais da persona (kkk, rs, né, mano, tipo, ai, poxa, aff, nossa, tá, tô, cê, pra).
- Emojis: RARO, no máximo 1 e só quando faz sentido. Muitos WhatsApps não usam.
- Erros de digitação leves ocasionais são bem-vindos (naum → não, tbm, vc, td, pq, msm) — no máximo 1 por mensagem.
- NUNCA se apresente como IA, assistente, bot, sistema, teste, aquecimento, automação.
- NUNCA fale de vendas, marketing, negócios, promoção, produto, link, telefone, código, senha.
- NUNCA repita literalmente a última mensagem nem responda igual as anteriores.
- NUNCA use hashtags, URLs, @mentions, números longos.
- Responda de forma que CONTINUE a conversa: faça pergunta, comente, reaja, provoque leve — mantenha o pingue-pongue vivo.
- Se a última mensagem for uma pergunta, responda ela E devolva algo (pergunta ou comentário) pra pessoa ter o que responder.
- Varie: às vezes só reage curtinho ("kkkk sério?"), às vezes conta algo, às vezes pergunta.

${isStart ? `INÍCIO DE CONVERSA: ${topicHint}. Manda uma mensagem natural, curta, como se tivesse acabado de lembrar dessa pessoa.` : ""}
${shouldDrift ? "DICA: a conversa tá longa no mesmo assunto — puxe um gancho pra outro tema do dia a dia de forma natural (\"mudando de assunto\", \"ah esqueci de te falar\", \"e aí, viu que...\")." : ""}

Devolva SOMENTE o texto da mensagem, sem aspas, sem prefixo, sem nome.`;

  const messages: Msg[] = [{ role: "system", content: system }];
  // Últimas 20 mensagens pra IA ter contexto forte da conversa.
  const trimmed = history.slice(-20);
  for (const h of trimmed) {
    messages.push({
      role: h.from === "__me__" ? "assistant" : "user",
      content: h.content,
    });
  }
  if (isStart) {
    messages.push({ role: "user", content: "(você inicia a conversa agora, mande a primeira mensagem)" });
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      temperature: 1.1,
      top_p: 0.95,
      frequency_penalty: 0.6,
      presence_penalty: 0.6,
      max_tokens: 120,
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let text: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Resposta vazia da IA");

  // Sanitização: remove aspas envolventes, prefixos tipo "Eu:" ou nome, corta demais.
  text = text
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .replace(/^(eu|me|mim|amigo[a]?|resposta|mensagem)\s*[:\-–]\s*/i, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/#\w+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Limite defensivo (mensagens curtas parecem mais humanas).
  if (text.length > 240) text = text.slice(0, 240).replace(/\s+\S*$/, "");
  return text || "oi";
}
