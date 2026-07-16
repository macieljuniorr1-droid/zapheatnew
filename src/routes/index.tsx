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
  Thermometer,
  Gauge,
  BarChart3,
  MessageCircle,
  CheckCircle2,
  LineChart as LineChartIcon,
  Signal,
  AlertTriangle,
} from "lucide-react";

import zapheatLogo from "@/assets/zapheat-logo.png.asset.json";

const SEO_TITLE = "Aquecimento de WhatsApp com IA e Disparo em Massa | ZapHeat";
const SEO_DESCRIPTION = "Plataforma de aquecimento de chip de WhatsApp com IA e disparo em massa. Compatível com WhatsApp API oficial e Evolution API. Reduza banimentos, aumente entregabilidade e conquiste clientes.";
const SEO_KEYWORDS = "aquecimento de whatsapp, aquecer chip whatsapp, whatsapp api oficial, api whatsapp business, disparo em massa whatsapp, aquecedor de chip, evolution api, chip aquecido, marketing no whatsapp, automação whatsapp, chatbot whatsapp, envio em massa whatsapp";
const SITE_URL = "https://zapheatnew.lovable.app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: SEO_TITLE },
      { name: "description", content: SEO_DESCRIPTION },
      { name: "keywords", content: SEO_KEYWORDS },
      { name: "author", content: "ZapHeat" },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" },
      { name: "googlebot", content: "index, follow" },
      { httpEquiv: "content-language", content: "pt-BR" },
      { name: "geo.region", content: "BR" },
      { property: "og:title", content: SEO_TITLE },
      { property: "og:description", content: SEO_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: "ZapHeat" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SEO_TITLE },
      { name: "twitter:description", content: SEO_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SITE_URL}#org`,
              name: "ZapHeat",
              url: SITE_URL,
              logo: `${SITE_URL}/__l5e/assets-v1/2f9c442e-0889-4ebb-a2ed-b703580cfa09/zapheat-logo.png`,
              sameAs: [] as string[],
              contactPoint: [{
                "@type": "ContactPoint",
                contactType: "customer support",
                availableLanguage: ["Portuguese", "pt-BR"],
                url: "https://wa.me/212786573855",
              }],
            },
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}#site`,
              url: SITE_URL,
              name: "ZapHeat",
              inLanguage: "pt-BR",
              publisher: { "@id": `${SITE_URL}#org` },
            },
            {
              "@type": "SoftwareApplication",
              name: "ZapHeat — Aquecedor de WhatsApp com IA",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web, Cloud",
              description: SEO_DESCRIPTION,
              inLanguage: "pt-BR",
              offers: [
                { "@type": "Offer", name: "Free", price: "0", priceCurrency: "BRL" },
                { "@type": "Offer", name: "Pro", price: "25", priceCurrency: "BRL", description: "R$ 25 por número/mês" },
              ],
              featureList: [
                "Aquecimento de chip WhatsApp com IA",
                "Compatível com WhatsApp API oficial e Evolution API",
                "Disparo em massa com ritmo humano",
                "Conversas geradas por IA (Gemini 3)",
                "Chat ao vivo entre números",
                "Delays configuráveis para reduzir banimento",
              ],
              aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", reviewCount: "128" },
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "O que é aquecimento de chip de WhatsApp?",
                  acceptedAnswer: { "@type": "Answer", text: "É o processo de simular conversas reais entre seus próprios números de WhatsApp para construir reputação junto ao WhatsApp e reduzir o risco de banimento antes de iniciar disparos ou usar a WhatsApp API oficial." },
                },
                {
                  "@type": "Question",
                  name: "O ZapHeat funciona com a API oficial do WhatsApp?",
                  acceptedAnswer: { "@type": "Answer", text: "Sim. O ZapHeat pode aquecer números que serão usados na WhatsApp Business API oficial e também integra com Evolution API para operações não-oficiais." },
                },
                {
                  "@type": "Question",
                  name: "Posso fazer disparo em massa no WhatsApp?",
                  acceptedAnswer: { "@type": "Answer", text: "Sim. Após aquecer os chips, você pode disparar campanhas em massa com ritmo humano configurável, reduzindo o risco de banimento e aumentando a entregabilidade." },
                },
                {
                  "@type": "Question",
                  name: "Meu chip pode ser banido?",
                  acceptedAnswer: { "@type": "Answer", text: "O ZapHeat reduz drasticamente o risco com delays humanos, ritmo variado e mensagens naturais geradas por IA, mas nenhum sistema garante 100%. Comece com limites baixos e aumente aos poucos." },
                },
                {
                  "@type": "Question",
                  name: "Preciso pagar para testar?",
                  acceptedAnswer: { "@type": "Answer", text: "Não. O plano Free permite aquecer 2 números sem cartão de crédito." },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[700px] forge-halo" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_60%,var(--background)_100%)]" aria-hidden />

      <header className="fixed z-30 top-4 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[min(1120px,calc(100%-2rem))]">
        <div className="rounded-2xl border border-border/60 bg-background/70 backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] px-4 md:px-6 py-2.5 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center shrink-0">
            <img src={zapheatLogo.url} alt="ZapHeat" className="h-8 md:h-9 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#how" className="hover:text-foreground transition">Como funciona</a>
            <a href="#dispatch" className="hover:text-foreground transition">Disparo em massa</a>
            <a href="#numbers" className="hover:text-foreground transition">Nº virtuais</a>
            <a href="#plans" className="hover:text-foreground transition">Planos</a>
            <a href="#faq" className="hover:text-foreground transition">FAQ</a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
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
      <div aria-hidden className="h-20" />


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
            Uma IA gera diálogos naturais entre seus próprios whatsapps — bate-papo do dia a dia, gírias, tempo de resposta humano. Seus números aquecem 24/7 sem parecer robôs.
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
              <ConsoleLine time="10:42" from="WhatsApp 01" to="WhatsApp 02" text="oi tudo bem?" />
              <ConsoleLine time="10:44" from="WhatsApp 02" to="WhatsApp 01" text="tudo tranquilo e vc?" />
              <ConsoleLine time="10:47" from="WhatsApp 03" to="WhatsApp 01" text="bora almoçar amanhã?" />
              <ConsoleLine time="10:49" from="WhatsApp 01" to="WhatsApp 03" text="bora sim, que horas" fresh />
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

        {/* NETWORK — 8 whatsapps conversando */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">rede viva</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Seus whatsapps conversando entre si, 24 horas por dia
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
              Enquanto outros mandam listas de mensagens repetitivas, o ZapHeat gera cada conversa em tempo real com IA que lê o histórico.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Feature icon={<Bot />} title="IA em cada mensagem" desc="Gemini 3 gera cada resposta lendo as últimas 10 mensagens da conversa. Nada de textos pré-prontos." />
            <Feature icon={<Users2 />} title="Múltiplos whatsapps, um grupo" desc="Coloque 3, 5 ou 30 números. Pares aleatórios conversam entre si, criando fluxos orgânicos e cruzados." />
            <Feature icon={<Shield />} title="Ritmo humano" desc="Delays randômicos, mensagens curtas, gírias, emojis raros. Reduz drasticamente a chance de banimento." />
            <Feature icon={<Smartphone />} title="Conexão via QR Code" desc="Escaneia com o WhatsApp e pronto. Sem apps extras, sem gambiarra." />
            <Feature icon={<Zap />} title="Chat ao vivo" desc="Acompanhe cada conversa em tempo real no painel, como se fosse um WhatsApp Web centralizado." />
            <Feature icon={<Clock />} title="Zero manutenção" desc="Roda no servidor, sem depender do seu computador ou celular ligado o dia todo." />
          </div>
        </section>

        {/* TEMPERATURE — live number status */}
        <TemperatureSection />

        {/* DASHBOARD PREVIEW */}
        <DashboardPreviewSection />

        {/* WARMUP JOURNEY — day-by-day evolution */}
        <WarmupJourneySection />

        {/* MASS DISPATCH */}
        <MassDispatchSection />

        {/* VIRTUAL NUMBERS */}
        <VirtualNumbersSection />


        {/* PLANS */}

        <section id="plans" className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">planos</div>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Preço simples: pague por número
            </h2>
            <p className="mt-3 text-muted-foreground">
              Teste grátis com 2 números. Quando escalar, é só <b className="text-foreground">R$ 25 por número/mês</b> — sem limite de quantos whatsapps você conecta. Inclui IA generativa, chat ao vivo e delays humanos configuráveis (do segundo ao dia inteiro).
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
            exemplo: 10 whatsapps = R$ 250/mês · 30 whatsapps = R$ 750/mês · <a className="text-ember underline decoration-dotted" href="https://wa.me/212786573855" target="_blank" rel="noopener noreferrer">fale com o suporte no WhatsApp</a>
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
            <Faq q="Meu chip pode ser banido?" a="O ZapHeat reduz drasticamente o risco com delays humanos, ritmo variado e mensagens naturais — mas nenhum sistema garante 100%. Comece com limites baixos e aumente aos poucos." />
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

const WHATSAPPS = [
  { name: "WhatsApp 01", phone: "+55 11 9•••• 4821" },
  { name: "WhatsApp 02", phone: "+55 21 9•••• 7392" },
  { name: "WhatsApp 03", phone: "+55 31 9•••• 2154" },
  { name: "WhatsApp 04", phone: "+55 41 9•••• 8867" },
  { name: "WhatsApp 05", phone: "+55 51 9•••• 3319" },
  { name: "WhatsApp 06", phone: "+55 61 9•••• 5502" },
  { name: "WhatsApp 07", phone: "+55 71 9•••• 6238" },
  { name: "WhatsApp 08", phone: "+55 85 9•••• 1147" },
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
  const positions = WHATSAPPS.map((_, i) => {
    const angle = (i / WHATSAPPS.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });

  return (
    <div className="panel rounded-2xl p-6 md:p-8 relative overflow-hidden">
      <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-ember z-10">
        <span className="h-1.5 w-1.5 rounded-full bg-ember animate-ember" />
        rede · 8 whatsapps ativos
      </div>
      <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 items-center min-w-0">
        <div className="relative aspect-square max-w-[420px] mx-auto w-full text-ember">
          <svg viewBox="0 0 420 420" className="w-full h-full" style={{ overflow: "visible" }}>
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
        <div className="space-y-2 min-w-0 w-full">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
            conversas ao vivo
          </div>
          {CONVO_SCRIPT.slice(0, 5).map((c, i) => {
            const isNow = i === step % 5;
            return (
              <div
                key={i}
                className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm font-mono transition-all duration-500 ${
                  isNow ? "bg-ember/5 border border-ember/30" : "border border-transparent opacity-60"
                } rounded-lg px-3 py-2`}
              >
                <div className="flex items-center gap-2 text-xs sm:text-sm shrink-0">
                  <span className="text-gold shrink-0">{WHATSAPPS[c.from].name}</span>
                  <span className="text-muted-foreground/40 shrink-0">→</span>
                  <span className="text-ember shrink-0">{WHATSAPPS[c.to].name}</span>
                </div>
                <span className="text-foreground/80 truncate min-w-0 flex-1">{c.text}</span>
                {isNow && <span className="hidden sm:inline-block h-1.5 w-1.5 rounded-full bg-ember animate-ember shrink-0" />}
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

function MassDispatchSection() {
  const numbers = [
    { id: "01", phone: "+55 11 9•••• 4821", status: "sending", label: "Enviando agora", progress: 76, sent: 428 },
    { id: "02", phone: "+55 21 9•••• 7392", status: "queued", label: "Aguardando rodízio", progress: 0, sent: 312 },
    { id: "03", phone: "+55 31 9•••• 2154", status: "resting", label: "Descansando · cooldown", progress: 0, sent: 189 },
    { id: "04", phone: "+55 41 9•••• 8867", status: "queued", label: "Na fila", progress: 0, sent: 91 },
  ];
  return (
    <section id="dispatch" className="max-w-6xl mx-auto px-6 py-24">
      <div className="grid lg:grid-cols-2 gap-14 items-center">
        {/* Left copy */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/5 px-3 py-1 text-xs text-ember">
            <Shuffle className="h-3 w-3" />
            <span className="font-mono uppercase tracking-widest">Disparo em massa</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
            Disparo em massa com<br />
            <span className="gradient-ember-text">rotação inteligente de números.</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
            Depois que seus whatsapps estão aquecidos, a mesma plataforma dispara em escala — só que sem colocar todos os ovos na mesma cesta. Cada mensagem sai de um número diferente, com delays humanos e variação de texto.
          </p>
          <ul className="space-y-4 pt-2">
            <DispatchBullet
              icon={<Shuffle className="h-4 w-4" />}
              title="Variação automática de números"
              desc="A cada envio o sistema alterna entre os whatsapps ativos — 3, 10 ou 50 números disparando como uma equipe."
            />
            <DispatchBullet
              icon={<Sparkles className="h-4 w-4" />}
              title="Spintax + variação de texto"
              desc="Duas mensagens iguais nunca saem — o motor troca sinônimos, ordem de frases e emojis para eliminar footprint."
            />
            <DispatchBullet
              icon={<Clock className="h-4 w-4" />}
              title="Delays humanos configuráveis"
              desc="Intervalos randômicos entre disparos e presença digitando antes de enviar. WhatsApp lê como pessoa, não robô."
            />
            <DispatchBullet
              icon={<Target className="h-4 w-4" />}
              title="Segmentação por lista"
              desc="Importe CSV, valide números na Evolution, exclua duplicados e dispare para milhares em uma campanha só."
            />
          </ul>
          <div className="pt-4 flex flex-wrap gap-3">
            <Link to="/auth">
              <Button size="lg" className="gradient-ember-bg glow-ember h-12 px-8 text-base">
                <Send className="h-4 w-4 mr-2" />Criar minha campanha
              </Button>
            </Link>
            <a href="#plans">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base border-ember/40">
                Ver planos
              </Button>
            </a>
          </div>
        </div>

        {/* Right — Rotor visual */}
        <div className="relative">
          <div className="pointer-events-none absolute -inset-8 forge-halo opacity-70" aria-hidden />
          <div className="relative panel rounded-2xl p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-ember animate-ember" />
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  campanha · rotor ativo
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-ember px-2 py-0.5 rounded border border-ember/30 bg-ember/5">
                em execução
              </span>
            </div>

            <div className="space-y-3">
              {numbers.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                    n.status === "sending"
                      ? "border-ember/50 bg-ember/5 glow-ember"
                      : n.status === "queued"
                        ? "border-border/60 bg-background/40 opacity-80"
                        : "border-border/40 bg-background/20 opacity-50"
                  }`}
                >
                  <div
                    className={`h-10 w-10 shrink-0 rounded-full grid place-items-center font-mono text-xs font-bold ${
                      n.status === "sending"
                        ? "gradient-ember-bg text-primary-foreground"
                        : "bg-muted text-muted-foreground border border-border/60"
                    }`}
                  >
                    #{n.id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{n.phone}</div>
                    <div
                      className={`text-[10px] font-mono uppercase tracking-widest mt-0.5 ${
                        n.status === "sending" ? "text-ember" : "text-muted-foreground"
                      }`}
                    >
                      {n.label}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{n.sent}</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">enviados</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                <div className="text-[10px] font-mono uppercase text-muted-foreground">total hoje</div>
                <div className="font-display text-lg font-bold gradient-ember-text">12.482</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                <div className="text-[10px] font-mono uppercase text-muted-foreground">whatsapps em rotação</div>
                <div className="font-display text-lg font-bold">12</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                <div className="text-[10px] font-mono uppercase text-muted-foreground">taxa entrega</div>
                <div className="font-display text-lg font-bold text-ember">98%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DispatchBullet({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-ember/10 border border-ember/20 text-ember grid place-items-center">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-foreground">{title}</div>
        <div className="text-sm text-muted-foreground leading-relaxed">{desc}</div>
      </div>
    </li>
  );
}

function VirtualNumbersSection() {
  return (
    <section id="numbers" className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">números descartáveis</div>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
          Números virtuais para verificar WhatsApp
        </h2>
        <p className="mt-3 text-muted-foreground">
          Precisa de um número novo só para receber o SMS de verificação do WhatsApp? Compre um número descartável direto no painel, receba o código em até <b className="text-foreground">2 minutos</b> e pronto. Se o código não chegar, o saldo volta automaticamente para sua carteira.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Feature
          icon={<Smartphone />}
          title="Número brasileiro (DDD 73)"
          desc="Chip nacional exclusivo para WhatsApp por R$ 14,90. Ideal para abrir contas comerciais brasileiras."
        />
        <Feature
          icon={<Zap />}
          title="Código em até 2 minutos"
          desc="Compra em 1 clique, número na tela, você usa no WhatsApp e o código do SMS aparece automaticamente no painel."
        />
        <Feature
          icon={<Shield />}
          title="Reembolso automático"
          desc="Se o SMS não chegar em 2 minutos, o pedido é cancelado e o valor é devolvido para a sua carteira ZapHeat sem burocracia."
        />
      </div>

      <div className="panel rounded-2xl p-6 md:p-8 max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-ember mb-2">como funciona</div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li><span className="text-foreground font-medium">1.</span> Adicione saldo na carteira via Pix</li>
              <li><span className="text-foreground font-medium">2.</span> Escolha o país e clique em comprar</li>
              <li><span className="text-foreground font-medium">3.</span> Use o número no WhatsApp e receba o código no painel</li>
            </ol>
          </div>
          <div className="text-center shrink-0">
            <div className="font-display text-4xl font-bold gradient-ember-text tabular-nums">R$ 14,90</div>
            <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">número BR · WhatsApp</div>
            <Link to="/auth" className="inline-block mt-4">
              <Button className="gradient-ember-bg glow-ember">
                Comprar número
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}



function SiteFooter() {
  return (
    <footer className="relative border-t border-border/40 mt-12 bg-background/40 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-14">
          <div className="col-span-2">
            <Link to="/" className="inline-flex items-center gap-2 mb-5">
              <img src={zapheatLogo.url} alt="ZapHeat" className="h-9 w-auto" />
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              A plataforma brasileira para aquecer whatsapps com IA generativa e disparar em massa com rotação inteligente entre números.
            </p>
            <a
              href="https://wa.me/212786573855"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm text-foreground/80 hover:text-ember transition"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-ember animate-ember" />
              <span className="font-mono">suporte · +212 786-573855</span>
            </a>
            <div className="flex gap-3 mt-6">
              <SocialLink href="https://instagram.com" label="Instagram"><Instagram className="h-4 w-4" /></SocialLink>
              <SocialLink href="https://twitter.com" label="Twitter"><Twitter className="h-4 w-4" /></SocialLink>
              <SocialLink href="https://youtube.com" label="YouTube"><Youtube className="h-4 w-4" /></SocialLink>
            </div>
          </div>

          <FooterCol title="Produto" links={[
            { label: "Aquecimento IA", href: "#how" },
            { label: "Disparo em massa", href: "#dispatch" },
            { label: "Planos", href: "#plans" },
            { label: "FAQ", href: "#faq" },
          ]} />
          <FooterCol title="Empresa" links={[
            { label: "Sobre", href: "#" },
            { label: "Blog", href: "#" },
            { label: "Suporte", href: "https://wa.me/212786573855", external: true },
            { label: "Contato", href: "https://wa.me/212786573855", external: true },
          ]} />
          <FooterCol title="Legal" links={[
            { label: "Termos de uso", href: "#" },
            { label: "Privacidade", href: "#" },
            { label: "Política anti-spam", href: "#" },
          ]} />
        </div>

        <div className="pt-6 border-t border-border/40 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground font-mono">
            © {new Date().getFullYear()} ZapHeat · forjando reputação
          </p>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-ember animate-ember" />
            todos os sistemas operacionais
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<{ label: string; href: string; external?: boolean }> }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-4">{title}</h4>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="text-sm text-muted-foreground hover:text-ember transition"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="h-9 w-9 grid place-items-center rounded-lg border border-border/60 bg-background/40 text-muted-foreground hover:text-ember hover:border-ember/40 transition"
    >
      {children}
    </a>
  );
}

// ─────────────────────────────────────────────────────────────
// LIVE TEMPERATURE — mostra a "temperatura" de cada chip subindo em tempo real
// ─────────────────────────────────────────────────────────────
function TemperatureSection() {
  const chips = [
    { name: "WhatsApp 01", phone: "+55 11 9•••• 4821", days: 12, target: 92 },
    { name: "WhatsApp 02", phone: "+55 21 9•••• 7734", days: 8, target: 78 },
    { name: "WhatsApp 03", phone: "+55 31 9•••• 1902", days: 5, target: 54 },
    { name: "WhatsApp 04", phone: "+55 41 9•••• 6650", days: 2, target: 28 },
  ];
  const [temps, setTemps] = useState(chips.map(() => 0));
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      setTemps(chips.map((c) => Math.round(c.target * (t * t * (3 - 2 * t)))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">termômetro ao vivo</div>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
          Veja a temperatura de cada número em tempo real
        </h2>
        <p className="mt-3 text-muted-foreground">
          O ZapHeat calcula um score de saúde para cada chip cruzando dias em operação, volume de mensagens, taxa de resposta e sinais de risco. Você sabe exatamente quando um número está pronto para disparar — ou precisa esfriar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {chips.map((c, i) => (
          <ChipTempCard key={c.name} name={c.name} phone={c.phone} days={c.days} temp={temps[i]} />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <TempLegend color="bg-red-500" label="0–30 · frio" desc="Ainda aquecendo, evite disparo" />
        <TempLegend color="bg-amber-400" label="30–60 · morno" desc="Volume leve permitido" />
        <TempLegend color="bg-lime-400" label="60–85 · quente" desc="Pronto para campanhas" />
        <TempLegend color="bg-ember" label="85–100 · brasa" desc="Máxima reputação e entregabilidade" />
      </div>
    </section>
  );
}

function ChipTempCard({ name, phone, days, temp }: { name: string; phone: string; days: number; temp: number }) {
  const status =
    temp >= 85 ? { label: "brasa", cls: "text-ember", bar: "from-ember to-gold" }
    : temp >= 60 ? { label: "quente", cls: "text-lime-400", bar: "from-lime-400 to-ember" }
    : temp >= 30 ? { label: "morno", cls: "text-amber-400", bar: "from-amber-400 to-lime-400" }
    : { label: "frio", cls: "text-red-400", bar: "from-red-500 to-amber-400" };

  const msgs = 40 + temp * 3;
  const reply = 55 + Math.round(temp * 0.4);
  return (
    <div className="panel rounded-2xl p-6 relative overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-ember animate-ember" />
            <span className="font-display text-lg font-semibold">{name}</span>
          </div>
          <div className="text-xs font-mono text-muted-foreground mt-1">{phone}</div>
        </div>
        <div className="text-right">
          <div className={`font-display text-3xl font-bold ${status.cls}`}>
            {temp}°
            <span className="text-sm text-muted-foreground font-mono ml-1">/100</span>
          </div>
          <div className={`text-[10px] font-mono uppercase tracking-widest ${status.cls}`}>{status.label}</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="h-2 rounded-full bg-background/60 border border-border/50 overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${status.bar} transition-all duration-500`}
            style={{ width: `${temp}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <MicroStat icon={<Clock className="h-3 w-3" />} value={`${days}d`} label="aquecendo" />
        <MicroStat icon={<MessageCircle className="h-3 w-3" />} value={String(msgs)} label="msgs/dia" />
        <MicroStat icon={<Signal className="h-3 w-3" />} value={`${reply}%`} label="resposta" />
      </div>
    </div>
  );
}

function MicroStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 py-2">
      <div className="flex items-center justify-center gap-1 text-ember">
        {icon}
        <span className="font-display text-sm font-semibold text-foreground">{value}</span>
      </div>
      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  );
}

function TempLegend({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="panel rounded-lg p-3 flex items-start gap-3">
      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${color} shrink-0`} />
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD PREVIEW — mockup do painel de controle
// ─────────────────────────────────────────────────────────────
function DashboardPreviewSection() {
  const bars = [22, 34, 41, 38, 55, 62, 70, 68, 82, 89, 94, 91];
  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">dashboard completo</div>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
          Tudo o que acontece com seus números, em um só painel
        </h2>
        <p className="mt-3 text-muted-foreground">
          Visão geral da rede, saúde individual de cada chip, gráfico de aquecimento ao longo do tempo e alertas automáticos quando algo foge do padrão.
        </p>
      </div>

      <div className="panel rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 forge-halo opacity-40" aria-hidden />

        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={<Smartphone className="h-4 w-4" />} value="14" label="números ativos" trend="+3 esta semana" />
          <KpiCard icon={<MessageCircle className="h-4 w-4" />} value="8.472" label="msgs 30d" trend="+124% vs mês passado" />
          <KpiCard icon={<Thermometer className="h-4 w-4" />} value="76°" label="temp média" trend="rede quente" ember />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} value="99,2%" label="entrega" trend="sem falhas 24h" />
        </div>

        <div className="relative mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart */}
          <div className="lg:col-span-2 panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-ember" />
                <span className="font-display text-sm font-semibold">Evolução da temperatura da rede</span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">últimos 12 dias</span>
            </div>
            <div className="flex items-end gap-1.5 h-40">
              {bars.map((b, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-ember/40 via-ember to-gold transition-all"
                    style={{ height: `${b}%` }}
                    title={`${b}°`}
                  />
                  <span className="text-[9px] text-muted-foreground/60 font-mono">d{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts */}
          <div className="panel rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-ember" />
              <span className="font-display text-sm font-semibold">Alertas inteligentes</span>
            </div>
            <div className="space-y-2.5">
              <AlertRow icon={<CheckCircle2 className="h-3.5 w-3.5 text-lime-400" />} text="WhatsApp 01 atingiu 92° — liberado para disparos" />
              <AlertRow icon={<TrendingUp className="h-3.5 w-3.5 text-ember" />} text="Rede subiu 18° nos últimos 7 dias" />
              <AlertRow icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />} text="WhatsApp 04 está frio — reduzir volume" />
              <AlertRow icon={<Gauge className="h-3.5 w-3.5 text-ember" />} text="Nova sugestão de par: 02 ↔ 05" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiCard({ icon, value, label, trend, ember }: { icon: React.ReactNode; value: string; label: string; trend: string; ember?: boolean }) {
  return (
    <div className={`panel rounded-xl p-4 ${ember ? "border-ember/50 glow-ember" : ""}`}>
      <div className="flex items-center gap-2 text-ember">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <div className={`mt-2 font-display text-2xl font-bold ${ember ? "gradient-ember-text" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{trend}</div>
    </div>
  );
}

function AlertRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="leading-snug">{text}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WARMUP JOURNEY — cronograma dia a dia do aquecimento
// ─────────────────────────────────────────────────────────────
function WarmupJourneySection() {
  const stages = [
    {
      range: "Dia 1–3",
      temp: 15,
      label: "Ignição",
      msgs: "10–20 msgs/dia",
      desc: "Chip recém-conectado. IA inicia conversas curtas em intervalos longos para simular o comportamento de um número novo.",
      status: "frio",
    },
    {
      range: "Dia 4–7",
      temp: 40,
      label: "Aquecendo",
      msgs: "30–60 msgs/dia",
      desc: "Volume sobe gradualmente. IA introduz mais interlocutores e diversifica assuntos. Delays continuam humanos (2–5 min).",
      status: "morno",
    },
    {
      range: "Dia 8–14",
      temp: 72,
      label: "Quente",
      msgs: "80–150 msgs/dia",
      desc: "Chip com reputação sólida. Conversas cruzadas entre múltiplos pares. Já é possível iniciar campanhas leves com o número.",
      status: "quente",
    },
    {
      range: "Dia 15+",
      temp: 92,
      label: "Brasa",
      msgs: "150+ msgs/dia",
      desc: "Reputação máxima. Chip totalmente pronto para disparos em massa com alta entregabilidade e baixíssimo risco de banimento.",
      status: "brasa",
    },
  ];
  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <div className="text-xs font-mono uppercase tracking-widest text-ember mb-3">jornada do aquecimento</div>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
          Do chip zerado à brasa em ~15 dias
        </h2>
        <p className="mt-3 text-muted-foreground">
          Cada número passa por 4 estágios controlados pela IA. Volume, delays e diversidade de conversas escalam sozinhos, sem você precisar configurar nada.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stages.map((s) => {
          const color =
            s.status === "brasa" ? { ring: "border-ember/60 glow-ember", text: "text-ember", bar: "from-ember to-gold" }
            : s.status === "quente" ? { ring: "border-lime-400/40", text: "text-lime-400", bar: "from-lime-400 to-ember" }
            : s.status === "morno" ? { ring: "border-amber-400/40", text: "text-amber-400", bar: "from-amber-400 to-lime-400" }
            : { ring: "border-red-500/30", text: "text-red-400", bar: "from-red-500 to-amber-400" };
          return (
            <div key={s.range} className={`panel rounded-2xl p-5 flex flex-col ${color.ring}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{s.range}</span>
                <Thermometer className={`h-4 w-4 ${color.text}`} />
              </div>
              <div className={`mt-2 font-display text-2xl font-bold ${color.text}`}>{s.label}</div>
              <div className="mt-3 h-1.5 rounded-full bg-background/60 border border-border/50 overflow-hidden">
                <div className={`h-full bg-gradient-to-r ${color.bar}`} style={{ width: `${s.temp}%` }} />
              </div>
              <div className={`mt-1 text-[10px] font-mono ${color.text}`}>{s.temp}°</div>
              <div className="text-xs font-mono text-ember mt-3 flex items-center gap-1.5">
                <MessageCircle className="h-3 w-3" />
                {s.msgs}
              </div>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{s.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-10 panel rounded-2xl p-6 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <BenefitRow icon={<Shield className="h-5 w-5" />} title="Menos banimentos" desc="Crescimento gradual controlado pela IA mantém o padrão de um usuário real, reduzindo drasticamente o risco." />
          <BenefitRow icon={<TrendingUp className="h-5 w-5" />} title="Mais entrega" desc="Chips quentes têm entregabilidade acima de 95% — suas mensagens chegam, não ficam presas no limbo." />
          <BenefitRow icon={<Gauge className="h-5 w-5" />} title="Escala sem esforço" desc="Adicione 5, 20 ou 100 números. A IA orquestra a rede inteira sem você precisar mexer em nada." />
        </div>
      </div>
    </section>
  );
}

function BenefitRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-10 w-10 rounded-lg bg-ember/10 text-ember border border-ember/20 grid place-items-center shrink-0">
        {icon}
      </div>
      <div>
        <div className="font-display font-semibold">{title}</div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}


