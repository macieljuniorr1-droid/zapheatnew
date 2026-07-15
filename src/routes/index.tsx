import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Flame,
  Smartphone,
  Shield,
  Zap,
  Sparkles,
  Activity,
  Check,
  Bot,
  Clock,
  TrendingUp,
  Users2,
} from "lucide-react";
import zapheatLogo from "@/assets/zapheat-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZapHeat — Aquecimento inteligente de WhatsApp com IA" },
      { name: "description", content: "Aqueça seus chips de WhatsApp com IA que gera conversas naturais entre seus próprios números 24/7. Reduza banimentos, aumente a reputação." },
      { property: "og:title", content: "ZapHeat — Aquecimento inteligente de WhatsApp com IA" },
      { property: "og:description", content: "Conversas orgânicas geradas por IA entre seus chips, 24 horas por dia." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[700px] forge-halo" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_60%,var(--background)_100%)]" aria-hidden />

      <header className="relative z-20 border-b border-border/40 backdrop-blur-md bg-background/40 sticky top-0">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center">
            <img src={zapheatLogo.url} alt="ZapHeat" className="h-9 md:h-10 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#how" className="hover:text-foreground transition">Como funciona</a>
            <a href="#plans" className="hover:text-foreground transition">Planos</a>
            <a href="#faq" className="hover:text-foreground transition">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button size="sm" variant="ghost" className="hidden sm:inline-flex">
                Entrar
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="gradient-ember-bg glow-ember hover:opacity-90">
                Cadastrar
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* HERO */}
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/5 px-3 py-1 text-xs text-ember backdrop-blur-sm">
            <Sparkles className="h-3 w-3" />
            <span className="font-mono uppercase tracking-widest">IA · 24h por dia · Sem limites</span>
          </div>
          <h1 className="mt-6 font-display text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.02]">
            A IA aquece seus chips<br />
            <span className="gradient-ember-text">conversando entre si 24h/dia.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Seus próprios números trocam mensagens naturais uns com os outros, sem parar, com <b className="text-foreground">mensagens ilimitadas</b> e diálogos gerados por IA. Cada chip aguarda a resposta antes de iniciar outra conversa — igual a um humano.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gradient-ember-bg glow-ember h-12 px-8 text-base">
                Começar grátis · 2 números
              </Button>
            </Link>
            <a href="#live">
              <Button size="lg" variant="ghost" className="h-12 px-8 text-base">
                Ver ao vivo
              </Button>
            </a>
          </div>
          <div className="mt-6 text-xs text-muted-foreground font-mono">
            sem cartão · 24h ativo · turnos 1-a-1
          </div>
        </section>

        {/* LIVE ANIMATED SIMULATION */}
        <LiveSimulation />

        {/* STATS */}
        <section id="how" className="max-w-5xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat value="24/7" label="operação automática" />
            <Stat value="∞" label="mensagens por dia" />
            <Stat value="1-a-1" label="turnos naturais" />
            <Stat value="< 5min" label="para configurar" />
          </div>
        </section>


        {/* STATS */}
        <section className="max-w-5xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat value="24/7" label="operação automática" />
            <Stat value="< 5min" label="para configurar" />
            <Stat value="10 msg" label="de contexto na IA" />
            <Stat value="60–300s" label="delay humano" />
          </div>
        </section>

        {/* FEATURES */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">tecnologia</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Diferente de qualquer aquecedor que você já viu
            </h2>
            <p className="mt-3 text-muted-foreground">
              Enquanto outros mandam listas de mensagens repetitivas, o WarmUp Pro gera cada conversa em tempo real com IA que lê o histórico.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Feature icon={<Bot />} title="IA em cada mensagem" desc="Gemini 3 gera cada resposta lendo as últimas 10 mensagens da conversa. Nada de textos pré-prontos." />
            <Feature icon={<Users2 />} title="Múltiplos chips, um grupo" desc="Coloque 3, 5 ou 30 números. Pares aleatórios conversam entre si, criando fluxos orgânicos e cruzados." />
            <Feature icon={<Shield />} title="Ritmo humano" desc="Delays randômicos, mensagens curtas, gírias, emojis raros. Reduz drasticamente a chance de banimento." />
            <Feature icon={<Smartphone />} title="Conexão via QR Code" desc="Escaneia com o WhatsApp e pronto. Sem apps extras, sem gambiarra." />
            <Feature icon={<Zap />} title="Chat ao vivo" desc="Acompanhe cada conversa em tempo real no painel, como se fosse um WhatsApp Web centralizado." />
            <Feature icon={<Clock />} title="Zero manutenção" desc="Roda no servidor, sem depender do seu computador ou celular ligado o dia todo." />
          </div>
        </section>

        {/* PLANS */}
        <section id="plans" className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">planos</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Preço simples: pague por número
            </h2>
            <p className="mt-3 text-muted-foreground">
              Teste grátis com 2 números. Quando escalar, é só <b className="text-foreground">R$ 25 por número/mês</b> — sem limite de quantos chips você conecta. Inclui IA generativa, chat ao vivo e delays humanos configuráveis (do segundo ao dia inteiro).
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <PlanCard
              name="Free"
              price="R$ 0"
              period="para sempre"
              instances="2 números"
              messages="30 msgs/dia"
              features={["IA generativa", "Chat ao vivo", "Delays configuráveis", "Suporte comunidade"]}
              cta="Começar grátis"
            />
            <PlanCard
              name="Pro"
              price="R$ 25"
              period="/número/mês"
              instances="Números ilimitados"
              messages="Msgs/dia por número"
              features={["Ativação única R$ 197", "IA generativa", "Chat ao vivo", "Delays personalizados 24/7", "Múltiplos grupos", "Suporte prioritário"]}
              cta="Assinar Pro"
              highlight
            />
          </div>
          <p className="text-center text-xs text-muted-foreground font-mono mt-8">
            exemplo: 10 chips = R$ 250/mês · 30 chips = R$ 750/mês · <a className="text-ember underline decoration-dotted" href="mailto:contato@warmuppro.app">fale com a gente</a>
          </p>
        </section>

        {/* FAQ */}
        <section id="faq" className="max-w-3xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">perguntas frequentes</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Dúvidas rápidas
            </h2>
          </div>
          <div className="space-y-3">
            <Faq q="Posso testar sem pagar?" a="Sim. O plano Free libera 2 números conversando entre si, para sempre. Você vê a plataforma inteira funcionando antes de decidir." />
            <Faq q="Preciso de VPS ou serviço externo?" a="Sim, você precisa da Evolution API (grátis, open-source) rodando em uma VPS ou em um serviço pronto. No painel Admin você cola URL e API Key e pronto." />
            <Faq q="A IA repete mensagens?" a="Não. Cada mensagem é gerada em tempo real pela Gemini 3 lendo o histórico da conversa. É diferente sempre." />
            <Faq q="Meu chip pode ser banido?" a="O WarmUp Pro reduz drasticamente o risco com delays humanos, ritmo variado e mensagens naturais — mas nenhum sistema garante 100%. Comece com limites baixos e aumente aos poucos." />
            <Faq q="Funciona em segundo plano?" a="Sim. Roda no servidor 24/7. Você não precisa manter computador ou navegador aberto." />
          </div>
        </section>

        {/* CTA final */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <div className="panel rounded-3xl p-10 md:p-14 text-center relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 forge-halo opacity-60" aria-hidden />
            <div className="relative">
              <TrendingUp className="h-10 w-10 text-ember mx-auto mb-4" />
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                Comece a forjar reputação hoje
              </h2>
              <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
                Grátis, sem cartão, 2 números aquecendo entre si em minutos.
              </p>
              <Link to="/auth" className="inline-block mt-8">
                <Button size="lg" className="gradient-ember-bg glow-ember h-12 px-10 text-base">
                  Criar minha conta grátis
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-border/40 mt-8">
          <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-muted-foreground font-mono">
            <div className="flex items-center gap-2">
              <Logo small />
              <span>© WarmUp Pro</span>
            </div>
            <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-ember" /> forjando reputação</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

// ---------- Live animated simulation ----------
const CHIPS = [
  { id: 1, label: "Chip 01", phone: "+55 11 9•••• 4821" },
  { id: 2, label: "Chip 02", phone: "+55 21 9•••• 7733" },
  { id: 3, label: "Chip 03", phone: "+55 31 9•••• 2109" },
  { id: 4, label: "Chip 04", phone: "+55 47 9•••• 5588" },
];

const CONVO_SCRIPT: Array<{ from: number; to: number; text: string }> = [
  { from: 1, to: 2, text: "oi, bom dia 👋" },
  { from: 3, to: 4, text: "e aí, como foi ontem?" },
  { from: 2, to: 1, text: "opa, bom dia! tudo tranquilo" },
  { from: 4, to: 3, text: "foi bom demais kkk" },
  { from: 1, to: 2, text: "beleza demais 🙌" },
  { from: 3, to: 4, text: "bora marcar de novo" },
  { from: 2, to: 1, text: "combinado, depois te chamo" },
  { from: 4, to: 3, text: "bora sim, sexta?" },
];

function useLiveConvo() {
  const [messages, setMessages] = useState<Array<{ id: number; from: number; to: number; text: string; time: string }>>([]);
  const [typing, setTyping] = useState<Set<number>>(new Set());

  useEffect(() => {
    let idx = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const step = CONVO_SCRIPT[idx % CONVO_SCRIPT.length];
      idx++;
      // typing indicator
      setTyping((prev) => new Set(prev).add(step.from));
      const typingTimeout = setTimeout(() => {
        if (!alive) return;
        setTyping((prev) => {
          const n = new Set(prev);
          n.delete(step.from);
          return n;
        });
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        setMessages((prev) => [
          ...prev.slice(-7),
          { id: Date.now() + Math.random(), from: step.from, to: step.to, text: step.text, time },
        ]);
      }, 900);
      const nextTimeout = setTimeout(tick, 2200 + Math.random() * 1200);
      return () => {
        clearTimeout(typingTimeout);
        clearTimeout(nextTimeout);
      };
    };
    const timer = setTimeout(tick, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return { messages, typing };
}

function LiveSimulation() {
  const { messages, typing } = useLiveConvo();

  return (
    <section id="live" className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">ao vivo · simulação</div>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
          Veja seus chips conversando entre si
        </h2>
        <p className="mt-3 text-muted-foreground">
          Vários números trocam mensagens simultaneamente. Cada um aguarda a resposta antes de iniciar outra conversa — humano, natural, 24h por dia.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {CHIPS.map((c) => {
          const isTyping = typing.has(c.id);
          return (
            <div
              key={c.id}
              className={`panel rounded-xl p-4 transition-all duration-300 ${
                isTyping ? "border-ember/60 glow-ember scale-[1.02]" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="h-8 w-8 rounded-full gradient-ember-bg grid place-items-center text-primary-foreground text-xs font-bold">
                    {c.id}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                      isTyping ? "bg-ember animate-ember" : "bg-emerald-500"
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{c.label}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">{c.phone}</div>
                </div>
              </div>
              <div className="mt-3 text-[11px] font-mono h-4">
                {isTyping ? (
                  <span className="text-ember inline-flex items-center gap-1">
                    <TypingDots /> digitando…
                  </span>
                ) : (
                  <span className="text-muted-foreground">online</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -top-3 left-6 px-2 py-0.5 rounded-md bg-background border border-ember/30 text-[10px] font-mono uppercase tracking-widest text-ember">
          fluxo ao vivo
        </div>
        <div className="flex items-center gap-2 pb-4 border-b border-border/50">
          <span className="h-2.5 w-2.5 rounded-full bg-ember animate-ember" />
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
            conversas simultâneas · sem limite diário
          </span>
          <Activity className="h-3.5 w-3.5 text-ember/70 ml-auto" />
        </div>
        <div className="mt-4 space-y-2 font-mono text-sm min-h-[240px]">
          {messages.length === 0 && (
            <div className="text-muted-foreground text-center py-8">iniciando conversas…</div>
          )}
          {messages.map((m, idx) => {
            const from = CHIPS.find((c) => c.id === m.from)!;
            const to = CHIPS.find((c) => c.id === m.to)!;
            const isLast = idx === messages.length - 1;
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 flex-wrap sm:flex-nowrap animate-fade-in"
              >
                <span className="text-muted-foreground/60 shrink-0 text-xs">{m.time}</span>
                <span className="text-gold shrink-0">{from.label}</span>
                <span className="text-muted-foreground/40 shrink-0">→</span>
                <span className="text-ember shrink-0">{to.label}</span>
                <span
                  className={`text-foreground/90 min-w-0 ${
                    isLast ? "border-b border-dashed border-ember/40" : ""
                  }`}
                >
                  {m.text}
                </span>
                {isLast && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ember animate-ember shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="h-1 w-1 rounded-full bg-ember animate-bounce [animation-delay:-0.3s]" />
      <span className="h-1 w-1 rounded-full bg-ember animate-bounce [animation-delay:-0.15s]" />
      <span className="h-1 w-1 rounded-full bg-ember animate-bounce" />
    </span>
  );
}



function Logo({ small }: { small?: boolean }) {
  const size = small ? "h-6 w-6" : "h-8 w-8";
  const icon = small ? "h-3 w-3" : "h-4 w-4";
  return (
    <div className={`relative ${size} rounded-lg gradient-ember-bg grid place-items-center glow-ember`}>
      <Flame className={`${icon} text-primary-foreground`} strokeWidth={2.5} />
      <span className="absolute inset-0 rounded-lg border border-ember/40" />
    </div>
  );
}

function ConsoleLine({ time, from, to, text, fresh }: { time: string; from: string; to: string; text: string; fresh?: boolean }) {
  return (
    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
      <span className="text-muted-foreground/60 shrink-0">{time}</span>
      <span className="text-gold shrink-0">{from}</span>
      <span className="text-muted-foreground/40 shrink-0">→</span>
      <span className="text-ember shrink-0">{to}</span>
      <span className={`text-foreground/90 min-w-0 ${fresh ? "border-b border-dashed border-ember/40" : ""}`}>{text}</span>
      {fresh && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ember animate-ember shrink-0" />}
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="panel rounded-xl p-6 transition hover:border-ember/40 hover:-translate-y-0.5 duration-300">
      <div className="w-10 h-10 rounded-lg bg-ember/10 text-ember grid place-items-center mb-4 border border-ember/20">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{desc}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="panel rounded-xl p-5 text-center">
      <div className="font-display text-2xl md:text-3xl font-bold gradient-ember-text">{value}</div>
      <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  period,
  instances,
  messages,
  features,
  cta,
  highlight,
}: {
  name: string;
  price: string;
  period: string;
  instances: string;
  messages: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative panel rounded-2xl p-6 flex flex-col ${
        highlight ? "border-ember/60 glow-ember" : ""
      }`}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full gradient-ember-bg text-primary-foreground text-[10px] font-mono uppercase tracking-widest">
          Mais popular
        </div>
      )}
      <div className="font-display text-xl font-semibold">{name}</div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-4xl font-bold">{price}</span>
        <span className="text-muted-foreground text-sm">{period}</span>
      </div>
      <div className="mt-4 pt-4 border-t border-border/60 space-y-1.5">
        <div className="text-sm flex items-center gap-2">
          <Smartphone className="h-3.5 w-3.5 text-ember" />
          <span className="font-medium">{instances}</span>
        </div>
        <div className="text-sm flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-ember" />
          <span className="font-medium">{messages}</span>
        </div>
      </div>
      <ul className="mt-4 space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="text-sm flex items-start gap-2 text-muted-foreground">
            <Check className="h-4 w-4 text-ember shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link to="/auth" className="mt-6 block">
        <Button
          className={`w-full ${highlight ? "gradient-ember-bg glow-ember" : ""}`}
          variant={highlight ? "default" : "outline"}
        >
          {cta}
        </Button>
      </Link>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="panel rounded-xl p-5 group">
      <summary className="cursor-pointer font-medium flex items-center justify-between list-none">
        <span>{q}</span>
        <span className="text-ember font-mono text-xl group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{a}</p>
    </details>
  );
}
