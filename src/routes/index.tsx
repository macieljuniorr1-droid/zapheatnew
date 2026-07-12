import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Upload, Download, Shield, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LeadsPro — Distribua leads por DDD para sua equipe" },
      {
        name: "description",
        content:
          "Suba uma lista de leads em TXT e deixe seus vendedores baixarem contatos por DDD, sem duplicação.",
      },
      { property: "og:title", content: "LeadsPro — Distribuição de leads por DDD" },
      {
        property: "og:description",
        content: "Upload de leads pelo admin, download por DDD pelos vendedores.",
      },
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
            <Users className="h-5 w-5 text-primary" />
            <span className="font-semibold">LeadsPro</span>
          </div>
          <Link to="/auth">
            <Button size="sm">Entrar</Button>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Distribua seus leads por DDD, sem duplicar contatos.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Você sobe o TXT com todos os leads no painel de administrador. Seus vendedores digitam o
            DDD e a quantidade, e recebem um TXT pronto com os contatos — automaticamente marcados
            como usados.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg">Começar agora</Button>
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <Feature
              icon={<Upload />}
              title="Admin sobe o TXT"
              desc="Qualquer formato: extraímos telefone e DDD automaticamente de cada linha."
            />
            <Feature
              icon={<Download />}
              title="Vendedor baixa por DDD"
              desc="Escolhe o DDD, a quantidade, e recebe um TXT com os leads."
            />
            <Feature
              icon={<Shield />}
              title="Sem duplicar"
              desc="Leads distribuídos ficam marcados como usados e somem da fila."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="p-6 rounded-lg border bg-card">
      <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{desc}</p>
    </div>
  );
}
