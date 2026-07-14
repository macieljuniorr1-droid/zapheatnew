import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Flame, Smartphone, Shield, Zap, Sparkles, Activity } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WarmUp Pro — Aquecimento inteligente de WhatsApp com IA" },
      { name: "description", content: "Conecte seus chips via QR Code. Nossa IA conversa naturalmente entre seus números 24/7 e reduz drasticamente banimentos." },
      { property: "og:title", content: "WarmUp Pro — Aquecimento inteligente de WhatsApp com IA" },
      { property: "og:description", content: "Conversas orgânicas geradas por IA entre seus chips, 24 horas por dia." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Halo de brasa atrás */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] forge-halo" aria-hidden />

      <header className="relative z-10 border-b border-border/40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display font-semibold tracking-tight text-lg">WarmUp Pro</span>
          </div>
          <Link to="/auth">
            <Button size="sm" className="gradient-ember-bg glow-ember hover:opacity-90">
              Entrar
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10">
        <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
            <Sparkles className="h-3 w-3 text-ember" />
            <span className="font-mono">v1 · powered by IA generativa</span>
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
                Começar grátis
              </Button>
            </Link>
            <a href="#how" >
              <Button size="lg" variant="ghost" className="h-12 px-8 text-base">
                Como funciona
              </Button>
            </a>
          </div>

          {/* Preview do console */}
          <div id="how" className="mt-20 panel rounded-2xl p-6 text-left mx-auto max-w-3xl">
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

        <section className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Feature icon={<Smartphone />} title="Conecte via QR Code" desc="Escaneie e pronto. Cada plano libera um número de slots." />
            <Feature icon={<Zap />} title="Conversas por IA" desc="Cada mensagem é gerada por IA lendo o histórico anterior. Nada de textos repetidos." />
            <Feature icon={<Shield />} title="Ritmo humano" desc="Intervalos randômicos, mensagens curtas, gírias. Reduz drasticamente detecção." />
          </div>
        </section>

        <footer className="border-t border-border/40 mt-8">
          <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>© WarmUp Pro</span>
            <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-ember" /> forjando reputação</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <div className="relative h-8 w-8 rounded-lg gradient-ember-bg grid place-items-center glow-ember">
      <Flame className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
    </div>
  );
}

function ConsoleLine({ time, from, to, text, fresh }: { time: string; from: string; to: string; text: string; fresh?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground/60">{time}</span>
      <span className="text-gold">{from}</span>
      <span className="text-muted-foreground/40">→</span>
      <span className="text-ember">{to}</span>
      <span className={`text-foreground/90 ${fresh ? "border-b border-dashed border-ember/40" : ""}`}>{text}</span>
      {fresh && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ember animate-ember" />}
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="panel rounded-xl p-6 transition hover:border-ember/40">
      <div className="w-10 h-10 rounded-lg bg-ember/10 text-ember grid place-items-center mb-4 border border-ember/20">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{desc}</p>
    </div>
  );
}
