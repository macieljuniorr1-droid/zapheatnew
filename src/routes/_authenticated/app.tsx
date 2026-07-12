import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyRole } from "@/lib/leads.functions";
import { AdminPanel } from "@/components/admin-panel";
import { SellerPanel } from "@/components/seller-panel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Users, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Painel — LeadsPro" },
      { name: "description", content: "Distribua e baixe leads por DDD em poucos cliques." },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const navigate = useNavigate();
  const fetchRole = useServerFn(getMyRole);
  const roleQuery = useQuery({
    queryKey: ["my-role"],
    queryFn: () => fetchRole(),
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <span className="font-semibold">LeadsPro</span>
            {roleQuery.data?.isAdmin && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                ADMIN
              </span>
            )}
            {!roleQuery.data?.isAdmin && roleQuery.data?.isSeller && (
              <span className="ml-2 text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                VENDEDOR
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {roleQuery.isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {roleQuery.data?.isAdmin && <AdminPanel />}
        {roleQuery.data && !roleQuery.data.isAdmin && <SellerPanel />}
      </main>
    </div>
  );
}
