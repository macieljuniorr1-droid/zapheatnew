import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  Send,
  Shuffle,
  Target,
  Instagram,
  Twitter,
  Youtube,
} from "lucide-react";

import zapheatLogo from "@/assets/zapheat-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZapHeat — Aquecimento inteligente de WhatsApp com IA" },
      { name: "description", content: "Aqueça seus chips de WhatsApp com IA que gera conversas naturais entre seus próprios números 24/7. Reduza banimentos, aumente a reputação." },
      { property: "og:title", content: "ZapHeat — Aquecimento inteligente de WhatsApp com IA" },
      { property: "og:description", content: "Aqueça seus chips de WhatsApp com IA que gera conversas naturais entre seus próprios números 24/7. Reduza banimentos, aumente a reputação." },
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
            <a href="#dispatch" className="hover:text-foreground transition">Disparo em massa</a>
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
            <span className="font-mono uppercase tracking-widest">IA Generativa · Gemini 3</span>
          </div>
          <h1 className="mt-6 font-display text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.02]">
            Aqueça seus WhatsApps<br />
            <span className="gradient-ember-text">com conversas de verdade.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Uma IA gera diálogos naturais entre seus próprios chips — bate-papo do dia a dia, gírias, tempo de resposta humano. Seus números aquecem 24/7 sem parecer robôs.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gradient-ember-bg glow-ember h-12 px-8 text-base">
                Começar grátis · 2 números
              </Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="ghost" className="h-12 px-8 text-base">
                Ver demonstração
              </Button>
            </a>
          </div>
          <div className="mt-6 text-xs text-muted-foreground font-mono">
            sem cartão · configuração em 5 minutos
          </div>

          {/* Console preview */}
          <div id="how" className="mt-20 panel rounded-2xl p-6 text-left mx-auto max-w-3xl relative">
            <div className="absolute -top-3 left-6 px-2 py-0.5 rounded-md bg-background border border-ember/30 text-[10px] font-mono uppercase tracking-widest text-ember">
              ao vivo
            </div>
            <div className="flex items-center gap-2 pb-4 border-b border-border/50">
              <span className="h-2.5 w-2.5 rounded-full bg-ember animate-ember" />
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
                console · warmup live
              </span>
              <Activity className="h-3.5 w-3.5 text-ember/70 ml-auto" />
            </div>
            <div className="mt-4 space-y-3 font-mono text-sm">
              <ConsoleLine time="10:42" from="Chip 01" to="Chip 02" text="oi tudo bem?" />
              <ConsoleLine time="10:44" from="Chip 02" to="Chip 01" text="tudo tranquilo e vc?" />
              <ConsoleLine time="10:47" from="Chip 03" to="Chip 01" text="bora almoçar amanhã?" />
              <ConsoleLine time="10:49" from="Chip 01" to="Chip 03" text="bora sim, que horas" fresh />
            </div>
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

        {/* NETWORK — 8 chips conversando */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">rede viva</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Seus chips conversando entre si, 24 horas por dia
            </h2>
            <p className="mt-3 text-muted-foreground">
              A IA orquestra pares aleatórios: enquanto um par troca mensagens, os outros aguardam sua vez — igual a um grupo de amigos no zap.
            </p>
          </div>
          <NetworkGraph />
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

        {/* MASS DISPATCH */}
        <MassDispatchSection />

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
            exemplo: 10 chips = R$ 250/mês · 30 chips = R$ 750/mês · <a className="text-ember underline decoration-dotted" href="https://wa.me/212786573855" target="_blank" rel="noopener noreferrer">fale com o suporte no WhatsApp</a>
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

        <SiteFooter />


        {/* Floating WhatsApp support */}
        <a
          href="https://wa.me/212786573855"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 right-5 z-30 gradient-ember-bg glow-ember rounded-full h-14 w-14 grid place-items-center text-primary-foreground shadow-lg hover:scale-105 transition"
          aria-label="Falar com suporte no WhatsApp"
          title="Suporte no WhatsApp"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
            <path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.5 0 .18 5.32.18 11.87c0 2.09.55 4.13 1.6 5.93L0 24l6.34-1.66a11.86 11.86 0 0 0 5.7 1.45h.01c6.55 0 11.87-5.32 11.87-11.87 0-3.17-1.23-6.15-3.4-8.44Zm-8.47 18.28h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.76.99 1-3.67-.23-.38a9.86 9.86 0 0 1-1.5-5.24c0-5.45 4.43-9.88 9.9-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.9 6.99c0 5.45-4.44 9.88-9.9 9.88Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.08 1.76-.72 2-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z"/>
          </svg>
        </a>
      </main>
    </div>
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

const CHIPS = [
  { name: "Chip 01", phone: "+55 11 9•••• 4821" },
  { name: "Chip 02", phone: "+55 21 9•••• 7392" },
  { name: "Chip 03", phone: "+55 31 9•••• 2154" },
  { name: "Chip 04", phone: "+55 41 9•••• 8867" },
  { name: "Chip 05", phone: "+55 51 9•••• 3319" },
  { name: "Chip 06", phone: "+55 61 9•••• 5502" },
  { name: "Chip 07", phone: "+55 71 9•••• 6238" },
  { name: "Chip 08", phone: "+55 85 9•••• 1147" },
];

const CONVO_SCRIPT: Array<{ from: number; to: number; text: string }> = [
  { from: 0, to: 1, text: "oi tudo bem?" },
  { from: 1, to: 0, text: "tudo tranquilo e vc?" },
  { from: 2, to: 4, text: "bora almoçar amanhã?" },
  { from: 4, to: 2, text: "bora sim, que horas" },
  { from: 3, to: 5, text: "vc viu o jogo ontem?" },
  { from: 5, to: 3, text: "kkkkk foi lindo" },
  { from: 6, to: 7, text: "chegou aquela encomenda?" },
  { from: 7, to: 6, text: "chegou sim, obg!" },
  { from: 0, to: 3, text: "hoje tem reunião ne" },
  { from: 3, to: 0, text: "tem sim, 15h" },
];

function NetworkGraph() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % CONVO_SCRIPT.length), 2200);
    return () => clearInterval(id);
  }, []);

  const active = CONVO_SCRIPT[step];
  const cx = 210;
  const cy = 210;
  const r = 160;
  const positions = CHIPS.map((_, i) => {
    const angle = (i / CHIPS.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });

  return (
    <div className="panel rounded-2xl p-6 md:p-8 relative overflow-hidden">
      <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-ember z-10">
        <span className="h-1.5 w-1.5 rounded-full bg-ember animate-ember" />
        rede · 8 chips ativos
      </div>
      <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 items-center">
        <div className="relative aspect-square max-w-[420px] mx-auto w-full text-ember">
          <svg viewBox="0 0 420 420" className="w-full h-full">
            {/* mesh lines */}
            {positions.map((p1, i) =>
              positions.slice(i + 1).map((p2, j) => (
                <line
                  key={`${i}-${j}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="currentColor"
                  strokeOpacity="0.12"
                  strokeWidth="1"
                />
              )),
            )}
            {/* active line */}
            <line
              x1={positions[active.from].x}
              y1={positions[active.from].y}
              x2={positions[active.to].x}
              y2={positions[active.to].y}
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="6 6"
              className="animate-pulse"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="1s" repeatCount="indefinite" />
            </line>
            {/* nodes */}
            {positions.map((p, i) => {
              const isActive = i === active.from || i === active.to;
              return (
                <g key={i} className="transition-all duration-500">
                  {isActive && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={28}
                      fill="currentColor"
                      opacity="0.15"
                      className="animate-pulse"
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isActive ? 22 : 16}
                    fill="hsl(20 14% 8%)"
                    stroke="currentColor"
                    strokeWidth={isActive ? 2.5 : 1.5}
                    opacity={isActive ? 1 : 0.55}
                  />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fill="currentColor"
                    fontFamily="monospace"
                    opacity={isActive ? 1 : 0.75}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
            conversas ao vivo
          </div>
          {CONVO_SCRIPT.slice(0, 5).map((c, i) => {
            const isNow = i === step % 5;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 text-sm font-mono transition-all duration-500 ${
                  isNow ? "bg-ember/5 border border-ember/30" : "border border-transparent opacity-60"
                } rounded-lg px-3 py-2`}
              >
                <span className="text-gold shrink-0">{CHIPS[c.from].name}</span>
                <span className="text-muted-foreground/40 shrink-0">→</span>
                <span className="text-ember shrink-0">{CHIPS[c.to].name}</span>
                <span className="text-foreground/80 truncate min-w-0">{c.text}</span>
                {isNow && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ember animate-ember shrink-0" />}
              </div>
            );
          })}
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 pt-2">
            só um par conversa por vez · IA aguarda resposta antes do próximo
          </div>
        </div>
      </div>
    </div>
  );
}
