// Motor local ZapHeat — geração de mensagens 100% offline, sem gateway de IA
// e sem consumir créditos. Usa spintax + contexto (última mensagem, hora do
// dia, histórico) para produzir frases naturais em PT-BR que não se repetem.

type Hist = { from: string; content: string }[];

function rnd(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

// Expande spintax: {a|b|c} e aninhado.
function spin(tpl: string, rand: () => number): string {
  let out = tpl;
  let guard = 0;
  while (out.includes("{") && guard++ < 50) {
    out = out.replace(/\{([^{}]*)\}/g, (_m, group: string) => {
      const opts = group.split("|");
      return opts[Math.floor(rand() * opts.length)] ?? "";
    });
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

const GREET = "{oi|opa|eae|e aí|fala}";
const LAUGH = "{kkkk|kkkkk|rsrs|kk}";

// Aberturas de conversa (1:1)
const OPENERS = [
  `${GREET}, {tudo bem|tudo certo|de boa|blz}?`,
  "{bom dia|boa tarde|boa noite}, {tudo certo por aí|como cê tá}?",
  "{cara|mano|gente}, que {calor|frio|tempo doido} hoje viu",
  "{já|cê já} {almoçou|jantou|comeu} {|hoje}?",
  "{to|tô} {morrendo de fome|com um sono|acabado} aqui " + LAUGH,
  "{cê viu|viu} {o jogo|a novela|aquela notícia} ontem?",
  "{como foi|e aí, como foi} {o fim de semana|o teu dia|a semana aí}?",
  "{esse trânsito|o trânsito} {hoje|de hoje} {tava impossível|tava um caos}",
  "{sumiu hein|cadê você} " + LAUGH + " {tudo bem|como cê tá}?",
  "{to|tô} voltando {do serviço|da rua|do mercado} agora",
  "{nossa|cara}, {o preço das coisas|tudo} {subiu demais|tá caríssimo} né",
  "{comecei|to vendo} uma série nova, {tá boa demais|to viciado} " + LAUGH,
  "{vou|vô} {sair|dar uma saída} rapidinho {ainda|} hoje",
  "{tá|cê tá} {trabalhando|em casa|de folga} hoje?",
];

// Respostas contextuais
const REPLY_QUESTION = [
  "{aqui|por aqui} {tudo certo|tudo tranquilo|de boa}, e {aí|você}?",
  "{tô|to} {bem|de boa|na correria}, {e você|e cê}?",
  "{ah|então}, {mais ou menos|tranquilo}, {tá corrido|foi puxado} hoje",
  "{acho que sim|é|pois é}, {mas depois te falo melhor|mas foi de boa}",
  "{nossa|olha}, {nem sei direito|boa pergunta} " + LAUGH,
];

const REPLY_LAUGH = [
  LAUGH + " {sério|verdade|boa essa}",
  LAUGH + " {não aguento|morri|pois é}",
  "{kkkk|rsrs} {é isso aí|verdade viu}",
];

const REPLY_GENERIC = [
  "{verdade|pois é|é isso mesmo}, {penso igual|também acho}",
  "{nossa|caramba}, {sério isso|não acredito}?",
  "{entendi|saquei}, {e depois|e aí, deu certo}?",
  "{aham|sim}, {aqui é a mesma coisa|comigo é igual}",
  "{poxa|ah}, {que chato|que bom} {viu|hein}",
  "{tô|to} {rindo aqui|até agora rindo} " + LAUGH,
  "{depois|mais tarde} {te falo|a gente conversa} melhor",
  "{bora|vamo} marcar {um dia desses|qualquer dia} então",
  "{ó|olha}, {faz sentido|é por aí mesmo}",
  "{cê|você} {tem razão|acertou} nessa",
];

const FOLLOWUP = [
  " {e aí, cê|e cê} {vai fazer o quê|tá fazendo o quê} {hoje|agora}?",
  " {e por aí|e aí}, {tudo tranquilo|novidade}?",
  " {já|cê já} {viu isso|passou por isso}?",
  "",
  "",
];

// Mensagens de grupo
const GROUP_LINES = [
  "{e aí|opa} {galera|pessoal}, {tudo certo|de boa} por aí?",
  "{bom dia|boa tarde|boa noite} {galera|pessoal|gente}",
  "{alguém|alguem} {aí acordado|online} " + LAUGH + "?",
  "{cara|gente}, que {calor|tempo doido|frio} hoje",
  "{to|tô} {morrendo de fome|precisando de um café} aqui",
  "{alguém|alguem} {tem indicação de|indica uma} {série|filme} boa?",
  "{esse trânsito|o trânsito} hoje {tava absurdo|tava impossível}",
  "{vi|acabei de ver} uma {notícia|coisa} {doida|absurda} agora",
  "{o preço|tudo} {subiu de novo|tá caro demais} né {gente|não}",
  "{kkkk|kkkkk} {boa essa|muito bom}",
  "{verdade|pois é}, {penso a mesma coisa|concordo}",
  "{to|tô} {voltando do serviço|chegando} agora",
  "{amanhã|hoje} {prometo|vou} acordar {cedo|mais cedo} " + LAUGH,
  "{e o fim de semana|e o final de semana}, {foi bom|rendeu}?",
  "{alguém|alguem} vai {no rolê|sair} {hoje|no fds}?",
  "{dia|semana} {rendeu|foi puxada} aqui viu",
];

function periodPrefix(rand: () => number) {
  const h = new Date().getUTCHours() - 3;
  const hour = ((h % 24) + 24) % 24;
  if (rand() > 0.25) return "";
  if (hour < 12) return "bom dia ";
  if (hour < 18) return "boa tarde ";
  return "boa noite ";
}

/** Resposta 1:1 sem IA externa. */
export function localReply(history: Hist, seed?: string): string {
  const rand = rnd((seed ?? "") + Date.now() + Math.random());
  const last = history.length ? history[history.length - 1].content ?? "" : "";
  const recent = new Set(history.slice(-8).map((h) => (h.content ?? "").toLowerCase().trim()));

  for (let i = 0; i < 12; i++) {
    let text: string;
    if (!history.length) {
      text = periodPrefix(rand) + spin(OPENERS[Math.floor(rand() * OPENERS.length)], rand);
    } else if (/\?/.test(last)) {
      text = spin(REPLY_QUESTION[Math.floor(rand() * REPLY_QUESTION.length)], rand);
    } else if (/k{3,}|rsrs|haha|😂|kkkk/i.test(last)) {
      text = spin(REPLY_LAUGH[Math.floor(rand() * REPLY_LAUGH.length)], rand);
    } else {
      text =
        spin(REPLY_GENERIC[Math.floor(rand() * REPLY_GENERIC.length)], rand) +
        spin(FOLLOWUP[Math.floor(rand() * FOLLOWUP.length)], rand);
    }
    text = text.replace(/\s{2,}/g, " ").trim();
    if (text && !recent.has(text.toLowerCase())) return text;
  }
  return "opa, tudo certo?";
}

/** Mensagem de grupo sem IA externa. */
export function localGroupMessage(history: Hist, seed?: string): string {
  const rand = rnd((seed ?? "") + Date.now() + Math.random());
  const recent = new Set(history.slice(-10).map((h) => (h.content ?? "").toLowerCase().trim()));
  const last = history.length ? history[history.length - 1].content ?? "" : "";

  for (let i = 0; i < 12; i++) {
    let text: string;
    if (history.length && /\?/.test(last) && rand() < 0.6) {
      text = spin(REPLY_QUESTION[Math.floor(rand() * REPLY_QUESTION.length)], rand);
    } else {
      text = spin(GROUP_LINES[Math.floor(rand() * GROUP_LINES.length)], rand);
    }
    text = text.replace(/\s{2,}/g, " ").trim();
    if (text && !recent.has(text.toLowerCase())) return text;
  }
  return "e aí pessoal";
}
