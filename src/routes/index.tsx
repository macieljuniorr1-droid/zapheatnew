import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Flame, Smartphone, Shield, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WarmUp Pro — Aquecimento automático de números WhatsApp" },
      { name: "description", content: "Conecte seus chips via QR Code e deixe eles trocarem mensagens automaticamente. Evite banimentos e aqueça números de forma natural." },
      { property: "og:title", content: "WarmUp Pro — Aquecimento automático de WhatsApp" },
      { property: "og:description", content: "Conecte seus chips via QR Code e deixe o sistema aquecer os números 24/7." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            <span className="font-semibold">WarmUp Pro</span>
          </div>
          <Link to="/auth"><Button size="sm">Entrar</Button></Link>
        </div>
      </header>
      <main className="flex-1 flex items-center">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Aqueça seus WhatsApps automaticamente. Sem banimento.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Conecte seus chips via QR Code, forme grupos de aquecimento, e deixe seus números trocarem mensagens entre si em intervalos naturais 24 horas por dia.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth"><Button size="lg">Começar grátis</Button></Link>
          </div>
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <Feature icon={<Smartphone />} title="Conecte vários chips" desc="Cadastre seus números via QR Code. Cada plano libera mais slots." />
            <Feature icon={<Zap />} title="Aquecimento 24/7" desc="Grupos trocam mensagens automaticamente com intervalos aleatórios." />
            <Feature icon={<Shield />} title="Modo humano" desc="Delays randomizados e mensagens curtas naturais reduzem detecção." />
          </div>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="p-6 rounded-lg border bg-card">
      <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-3">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{desc}</p>
    </div>
  );
}
