import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getMe,
  listInstances,
  createInstance,
  refreshInstance,
  deleteInstance,
  listGroups,
  createGroup,
  toggleGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  listLogs,
  getStats,
  listPlans,
  listTemplates,
  addTemplate,
  deleteTemplate,
  adminListUsers,
  adminUpdateUserPlan,
  adminGetEvolutionConfig,
  adminUpdateEvolutionConfig,
  adminGetStats,
  adminListInstances,
  adminRefreshInstance,
  adminDeleteInstance,
  listInstancesWithHealth,
  getChipReport,
  getGroupEngineStatus,
  getUserDailySeries,
  adminPlatformDashboard,
} from "@/lib/warmup.functions";
import {
  listContactLists,
  createContactList,
  deleteContactList,
  listCampaigns,
  createCampaign,
  setCampaignStatus,
  deleteCampaign,
} from "@/lib/dispatch.functions";
import {
  getMyBilling,
  purchaseNumber,
  getNumberSubscriptionStatus,
  getPagarmePublicKey,
  cancelNumberSubscription,
  adminFinancialSummary,
  adminAddFreeNumbers,
  adminSetUserSuspended,
  adminForceRemoveNumberSubscription,
  adminListBillingUsers,
} from "@/lib/billing.functions";
import {
  listTeamMembers,
  createTeamMember,
  removeTeamMember,
  updateTeamMember,
  assignInstanceToMember,
  getTeamActivity,
  heartbeat,
  getMyTeamContext,
} from "@/lib/team.functions";

import zapheatLogo from "@/assets/zapheat-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  LogOut,
  Flame,
  Smartphone,
  Users2,
  ScrollText,
  CreditCard,
  Settings,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  MessageSquare,
  BookOpen,
  CheckCircle2,
  Server,
  QrCode,
  Sparkles,
  Radio,
  TrendingUp,
  Send,
  Upload,
  Play,
  Pause,
  Flame as FlameIcon,
  Snowflake,
  Thermometer,
  Activity,
  BarChart3,
  Zap,
  UsersRound,
  Circle,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: (s: Record<string, unknown>) => ({ tab: (s.tab as string) || undefined }),
  head: () => ({
    meta: [{ title: "Painel — WarmUp Pro" }],
  }),
  component: AppPage,
});

function AppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tab } = Route.useSearch();
  const [activeTab, setActiveTab] = useState(tab || "dashboard");
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const beatFn = useServerFn(heartbeat);
  const lastDeliveryToast = useRef(0);

  useEffect(() => {
    setActiveTab(tab || "dashboard");
  }, [tab]);

  const changeTab = (value: string) => {
    setActiveTab(value);
    navigate({
      to: "/app",
      search: { tab: value === "dashboard" ? undefined : value },
      replace: true,
    });
  };

  useEffect(() => {
    if (!me.data) return;
    beatFn().catch(() => {});
    const iv = setInterval(() => beatFn().catch(() => {}), 60_000);
    return () => clearInterval(iv);
  }, [me.data, beatFn]);

  useEffect(() => {
    if (!me.data) return;
    const invalidateWarmup = () => {
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["daily-series"] });
      queryClient.invalidateQueries({ queryKey: ["logs"] });
      queryClient.invalidateQueries({ queryKey: ["live-logs"] });
      queryClient.invalidateQueries({ queryKey: ["ai-live-logs"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["engine-status"] });
      queryClient.invalidateQueries({ queryKey: ["instances-health"] });
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      queryClient.invalidateQueries({ queryKey: ["group-instances"] });
    };
    const channel = supabase
      .channel("warmup-platform-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "warmup_logs" }, (payload) => {
        invalidateWarmup();
        const row = (payload as any).new;
        if (row?.status === "sent" && Date.now() - lastDeliveryToast.current > 5000) {
          lastDeliveryToast.current = Date.now();
          toast.success("✅ Envio confirmado no WhatsApp", { duration: 1800 });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_instances" }, invalidateWarmup)
      .on("postgres_changes", { event: "*", schema: "public", table: "warmup_groups" }, invalidateWarmup)
      .on("postgres_changes", { event: "*", schema: "public", table: "warmup_group_members" }, invalidateWarmup)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [me.data, queryClient]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (me.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isAdmin = !!me.data?.isAdmin;
  const planName = (me.data?.subscription as any)?.plan?.name ?? "Free";

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] forge-halo" aria-hidden />
      <header className="relative z-10 border-b border-border/40 backdrop-blur-md bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={zapheatLogo.url} alt="ZapHeat" className="h-8 w-auto" />
            <Badge variant="secondary" className="ml-2 font-mono text-[10px] uppercase tracking-wider">{planName}</Badge>
            {isAdmin && <Badge className="ml-1 gradient-ember-bg text-primary-foreground border-0 font-mono text-[10px] uppercase tracking-wider">Admin</Badge>}
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </header>
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={changeTab}>
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="dashboard"><Flame className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="tutorial"><BookOpen className="h-4 w-4 mr-1" />Tutorial</TabsTrigger>
            <TabsTrigger value="instances"><Smartphone className="h-4 w-4 mr-1" />Números</TabsTrigger>
            <TabsTrigger value="groups"><Users2 className="h-4 w-4 mr-1" />Grupos</TabsTrigger>
            <TabsTrigger value="templates"><Sparkles className="h-4 w-4 mr-1" />Motor IA</TabsTrigger>
            <TabsTrigger value="dispatch"><Send className="h-4 w-4 mr-1" />Disparos</TabsTrigger>
            <TabsTrigger value="live"><Radio className="h-4 w-4 mr-1" />Chat ao vivo</TabsTrigger>
            <TabsTrigger value="logs"><ScrollText className="h-4 w-4 mr-1" />Logs</TabsTrigger>
            <TabsTrigger value="plan"><CreditCard className="h-4 w-4 mr-1" />Plano</TabsTrigger>
            <TabsTrigger value="team"><UsersRound className="h-4 w-4 mr-1" />Equipe</TabsTrigger>
            {isAdmin && <TabsTrigger value="admin"><Settings className="h-4 w-4 mr-1" />Admin</TabsTrigger>}
          </TabsList>
          <TabsContent value="dashboard"><Dashboard /></TabsContent>
          <TabsContent value="tutorial"><TutorialTab /></TabsContent>
          <TabsContent value="instances"><InstancesTab /></TabsContent>
          <TabsContent value="groups"><GroupsTab changeTab={changeTab} /></TabsContent>
          <TabsContent value="templates"><TemplatesTab /></TabsContent>
          <TabsContent value="dispatch"><DispatchTab /></TabsContent>
          <TabsContent value="live"><LiveChatTab /></TabsContent>
          <TabsContent value="logs"><LogsTab /></TabsContent>
          <TabsContent value="plan"><PlanTab /></TabsContent>
          <TabsContent value="team"><TeamTab /></TabsContent>
          {isAdmin && <TabsContent value="admin"><AdminTab /></TabsContent>}
        </Tabs>
      </main>

      {/* Floating WhatsApp support */}
      <a
        href="https://wa.me/212786573855"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-5 right-5 z-30 gradient-ember-bg glow-ember rounded-full h-14 w-14 grid place-items-center text-primary-foreground shadow-lg hover:scale-105 transition"
        aria-label="Falar com suporte no WhatsApp"
        title="Suporte · +212 786-573855"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
          <path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.5 0 .18 5.32.18 11.87c0 2.09.55 4.13 1.6 5.93L0 24l6.34-1.66a11.86 11.86 0 0 0 5.7 1.45h.01c6.55 0 11.87-5.32 11.87-11.87 0-3.17-1.23-6.15-3.4-8.44Zm-8.47 18.28h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.76.99 1-3.67-.23-.38a9.86 9.86 0 0 1-1.5-5.24c0-5.45 4.43-9.88 9.9-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.9 6.99c0 5.45-4.44 9.88-9.9 9.88Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.08 1.76-.72 2-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z"/>
        </svg>
      </a>
    </div>
  );
}

function Dashboard() {
  const fn = useServerFn(getStats);
  const seriesFn = useServerFn(getUserDailySeries);
  const q = useQuery({ queryKey: ["stats"], queryFn: () => fn(), refetchInterval: 15000 });
  const series = useQuery({ queryKey: ["daily-series"], queryFn: () => seriesFn(), refetchInterval: 60000 });
  const chartData = (series.data ?? []).map((r: any) => ({
    day: new Date(r.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    enviadas: r.sent,
    falhas: r.failed,
  }));
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Números conectados" value={q.data?.instances ?? 0} icon={<Smartphone />} />
        <StatCard label="Grupos ativos" value={q.data?.activeGroups ?? 0} icon={<Users2 />} />
        <StatCard label="Mensagens hoje" value={q.data?.sentToday ?? 0} icon={<Flame />} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4" />Mensagens nos últimos 30 dias</CardTitle>
          <CardDescription>Volume enviado pela sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="enviadas" stroke="var(--primary)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="falhas" stroke="var(--destructive)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-3xl font-bold mt-1">{value}</div>
        </div>
        <div className="w-10 h-10 rounded-md bg-primary/10 text-primary grid place-items-center">{icon}</div>
      </CardContent>
    </Card>
  );
}

// ---------------- Instances (Números) with health & temperature ----------------
function InstancesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInstancesWithHealth);
  const createFn = useServerFn(createInstance);
  const refreshFn = useServerFn(refreshInstance);
  const deleteFn = useServerFn(deleteInstance);
  const q = useQuery({ queryKey: ["instances-health"], queryFn: () => listFn(), refetchInterval: 15000 });
  const [name, setName] = useState("");
  const [qrOpen, setQrOpen] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (n: string) => createFn({ data: { name: n } }),
    onSuccess: (row: any) => {
      toast.success("Chip criado. Escaneie o QR Code.");
      setName("");
      setQrOpen(row.id);
      qc.invalidateQueries({ queryKey: ["instances-health"] });
      qc.invalidateQueries({ queryKey: ["instances"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const refresh = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instances-health"] });
      qc.invalidateQueries({ queryKey: ["instances"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["instances-health"] });
      qc.invalidateQueries({ queryKey: ["instances"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const current = q.data?.find((i: any) => i.id === qrOpen);
  const counts = { hot: 0, warm: 0, cold: 0, connected: 0 };
  for (const i of q.data ?? []) {
    counts[(i as any).temperature as "hot" | "warm" | "cold"]++;
    if (i.status === "connected") counts.connected++;
  }
  const total = q.data?.length ?? 0;

  // Polling rápido enquanto o modal do QR está aberto: chama Evolution a cada 2s
  // para detectar a conexão imediatamente após o celular escanear.
  useEffect(() => {
    if (!qrOpen) return;
    const iv = setInterval(() => {
      refreshFn({ data: { id: qrOpen } })
        .then(() => qc.invalidateQueries({ queryKey: ["instances-health"] }))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(iv);
  }, [qrOpen, refreshFn, qc]);

  // Fecha o modal e notifica assim que o número aparece como conectado
  const connectedNotified = useRef<string | null>(null);
  useEffect(() => {
    if (!qrOpen || !current) return;
    if (current.status === "connected" && connectedNotified.current !== current.id) {
      connectedNotified.current = current.id;
      toast.success(`✅ ${current.name} conectado com sucesso!`, {
        description: current.phone ? `Número: ${current.phone}` : undefined,
      });
      setTimeout(() => setQrOpen(null), 800);
    }
  }, [current?.status, current?.id, qrOpen]);

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Conectar novo número</CardTitle>
          <CardDescription>Após criar, escaneie o QR Code com o WhatsApp do celular.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input placeholder="Nome do chip (ex: Chip 1)" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button onClick={() => name && create.mutate(name)} disabled={create.isPending || !name}>
            {create.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}Criar
          </Button>
        </CardContent>
      </Card>

      {total > 0 && (
        <Card className="border-primary/20">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold">{total} chips</span>
              <span className="text-muted-foreground">·</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{counts.connected} conectados</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 font-medium">
                <FlameIcon className="h-3 w-3" />{counts.hot} quentes
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 font-medium">
                <Thermometer className="h-3 w-3" />{counts.warm} mornos
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 font-medium">
                <Snowflake className="h-3 w-3" />{counts.cold} frios
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {q.data?.map((i: any) => (
          <ChipCard
            key={i.id}
            chip={i}
            onQR={() => { refresh.mutate(i.id); setQrOpen(i.id); }}
            onReport={() => setReportId(i.id)}
            onDelete={() => { if (confirm(`Remover ${i.name}?`)) del.mutate(i.id); }}
          />
        ))}
        {q.data?.length === 0 && <div className="text-sm text-muted-foreground col-span-full text-center py-8">Nenhum número conectado ainda.</div>}
      </div>

      <Dialog open={!!qrOpen} onOpenChange={(o) => !o && setQrOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conectar WhatsApp — {current?.name}</DialogTitle></DialogHeader>
          {current?.status === "connected" ? (
            <div className="text-center py-8 text-green-600 font-semibold">✅ Conectado ({current.phone})</div>
          ) : current?.last_qr ? (
            <div className="text-center">
              <img
                src={current.last_qr.startsWith("data:") ? current.last_qr : `data:image/png;base64,${current.last_qr}`}
                alt="QR Code"
                className="mx-auto max-w-[280px]"
              />
              <p className="text-sm text-muted-foreground mt-3">Abra o WhatsApp → Aparelhos conectados → Conectar aparelho</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">Gerando QR...</div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => current && refresh.mutate(current.id)} disabled={refresh.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" />Atualizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChipReportDialog id={reportId} onClose={() => setReportId(null)} />
    </div>
  );
}

function ChipCard({ chip, onQR, onReport, onDelete }: { chip: any; onQR: () => void; onReport: () => void; onDelete: () => void }) {
  const temp = chip.temperature as "hot" | "warm" | "cold";
  const tempMeta = {
    hot: { icon: <FlameIcon className="h-3 w-3" />, label: "Quente", cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30" },
    warm: { icon: <Thermometer className="h-3 w-3" />, label: "Morno", cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
    cold: { icon: <Snowflake className="h-3 w-3" />, label: "Frio", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  }[temp];
  const lastSeen = chip.last_activity ? timeAgo(chip.last_activity) : "sem atividade";
  const maskedPhone = chip.phone ? chip.phone.replace(/(\d{4})\d+(\d{4})/, "$1****$2") : "—";

  return (
    <Card className={`overflow-hidden transition-colors ${
      chip.status === "connected"
        ? "border-green-500/60 ring-1 ring-green-500/40 bg-green-500/5"
        : chip.is_ready
          ? "border-emerald-500/60 ring-1 ring-emerald-500/40 bg-emerald-500/5"
          : ""
    }`}>

      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate flex items-center gap-2">
              <span className={`relative flex h-2 w-2 shrink-0 ${chip.status === "connected" ? "" : "opacity-40"}`}>
                {chip.status === "connected" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60" />}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${chip.status === "connected" ? "bg-green-500" : chip.status === "connecting" || chip.status === "qr" ? "bg-yellow-500" : "bg-muted-foreground/40"}`} />
              </span>
              {chip.name}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">{maskedPhone}</div>
          </div>
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${tempMeta.cls}`}>
            {tempMeta.icon}{tempMeta.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {chip.status === "connected" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/40">
              <CheckCircle2 className="h-3 w-3" />CONECTADO
            </span>
          ) : chip.status === "qr" || chip.status === "connecting" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30">
              Aguardando QR
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
              Desconectado
            </span>
          )}
          {chip.is_ready ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              ✓ Pronto para disparo
            </span>
          ) : chip.status === "connected" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              Em aquecimento · {chip.days_remaining ?? 3}d restantes
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center pt-1">
          <div>
            <div className="text-lg font-bold leading-none">{chip.msgs_7d}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">7 dias</div>
          </div>
          <div>
            <div className="text-lg font-bold leading-none">{chip.msgs_total}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">total</div>
          </div>
          <div>
            <div className="text-lg font-bold leading-none">{chip.active_days_7d}/7</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">dias ativos</div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Activity className="h-3 w-3" />última atividade {lastSeen}
        </div>

        <div className="flex gap-1 pt-1">
          <Button size="sm" variant="secondary" className="flex-1" onClick={onQR}>
            <RefreshCw className="h-3 w-3 mr-1" />QR / Status
          </Button>
          <Button size="sm" variant="outline" onClick={onReport} title="Relatório de aquecimento">
            <BarChart3 className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function deliveryBadge(status: string) {
  if (status === "sent") {
    return (
      <Badge className="text-xs bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/40 shadow-sm">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Entregue
      </Badge>
    );
  }
  return <Badge variant="destructive" className="text-xs">Falhou</Badge>;
}

function ChipReportDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const fn = useServerFn(getChipReport);
  const q = useQuery({
    queryKey: ["chip-report", id],
    queryFn: () => fn({ data: { id: id! } }),
    enabled: !!id,
  });
  const r = q.data;
  const tempMeta = r ? {
    hot: { label: "🔥 Chip quente", desc: "Pronto para uso comercial. Continue mantendo o volume.", cls: "text-orange-600 dark:text-orange-400" },
    warm: { label: "🌤️ Morno", desc: "Aquecendo bem. Continue por mais 1-2 semanas antes de usar comercialmente.", cls: "text-yellow-600 dark:text-yellow-400" },
    cold: { label: "❄️ Frio", desc: "Ainda precisa aquecer. Deixe o motor rodando 24/7 por pelo menos 7-14 dias.", cls: "text-sky-600 dark:text-sky-400" },
  }[r.temperature as "hot" | "warm" | "cold"] : null;

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Relatório de aquecimento — {r?.instance?.name ?? "..."}</DialogTitle>
        </DialogHeader>
        {!r && <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>}
        {r && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Score</div>
                <div className="text-2xl font-bold">{r.score}<span className="text-sm text-muted-foreground">/100</span></div>
                <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                  <div className="h-full gradient-ember-bg transition-all" style={{ width: `${r.score}%` }} />
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Enviadas 30d</div>
                <div className="text-2xl font-bold">{r.sent_30d}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{r.failed_30d} falhas</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Semana</div>
                <div className="text-2xl font-bold">{r.msgs_7d}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{r.active_days_7d}/7 dias ativos</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Total</div>
                <div className="text-2xl font-bold">{r.msgs_total}</div>
                <div className="text-[10px] text-muted-foreground mt-1">desde o início</div>
              </div>
            </div>

            {tempMeta && (
              <div className="rounded-lg border p-3">
                <div className={`font-semibold ${tempMeta.cls}`}>{tempMeta.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{tempMeta.desc}</div>
              </div>
            )}

            <div>
              <div className="text-sm font-medium mb-2">Mensagens por dia (últimos 30d)</div>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.daily.map((d: any) => ({ day: new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), qtd: d.count }))}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={2} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <ChartTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="qtd" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium mb-2">Horários mais ativos</div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={r.hourly.map((h: any) => ({ h: `${h.hour}h`, qtd: h.count }))}>
                      <XAxis dataKey="h" tick={{ fontSize: 9 }} interval={2} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <ChartTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="qtd" fill="var(--primary)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Conversa mais com</div>
                <div className="space-y-1.5">
                  {r.peers.length === 0 && <div className="text-xs text-muted-foreground">Ainda sem conversas.</div>}
                  {r.peers.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-sm border rounded px-2.5 py-1.5">
                      <span>{p.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{p.count} msgs</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    connected: { label: "Conectado", className: "bg-green-500/20 text-green-700" },
    qr: { label: "Aguardando QR", className: "bg-yellow-500/20 text-yellow-700" },
    connecting: { label: "Conectando", className: "bg-blue-500/20 text-blue-700" },
    disconnected: { label: "Desconectado", className: "bg-muted text-muted-foreground" },
  };
  const m = map[status] ?? map.disconnected;
  return <span className={`text-xs px-2 py-0.5 rounded ${m.className}`}>{m.label}</span>;
}

// ---------------- Groups ----------------
function GroupsTab({ changeTab }: { changeTab: (value: string) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listGroups);
  const listInst = useServerFn(listInstances);
  const createFn = useServerFn(createGroup);
  const toggleFn = useServerFn(toggleGroup);
  const delFn = useServerFn(deleteGroup);
  const addMember = useServerFn(addGroupMember);
  const rmMember = useServerFn(removeGroupMember);

  const groups = useQuery({ queryKey: ["groups"], queryFn: () => listFn(), refetchInterval: 15000 });
  const insts = useQuery({ queryKey: ["group-instances"], queryFn: () => listInst(), refetchInterval: 15000 });

  const [name, setName] = useState("");
  const [minD, setMinD] = useState(60);
  const [maxD, setMaxD] = useState(300);
  const [dl, setDl] = useState(40);

  const create = useMutation({
    mutationFn: () => createFn({ data: { name, min_delay_seconds: minD, max_delay_seconds: maxD, daily_limit: dl } }),
    onSuccess: () => { setName(""); toast.success("Grupo criado"); qc.invalidateQueries({ queryKey: ["groups"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["groups"] });

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>Novo grupo de aquecimento</CardTitle><CardDescription>Adicione 2 ou mais números. Eles conversam entre si 24h por dia, sem limite de mensagens. Cada número só participa de uma conversa por vez — aguarda a resposta antes de iniciar outra.</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Intervalo mín (s)</Label><Input type="number" value={minD} onChange={(e) => setMinD(+e.target.value)} /></div>
          <div><Label>Intervalo máx (s)</Label><Input type="number" value={maxD} onChange={(e) => setMaxD(+e.target.value)} /></div>
          <div><Label>Limite/dia (0 = ilimitado)</Label><Input type="number" value={dl} onChange={(e) => setDl(+e.target.value)} /></div>
          <div className="col-span-2 md:col-span-4"><Button onClick={() => name && create.mutate()} disabled={!name || create.isPending}><Plus className="h-4 w-4 mr-1" />Criar</Button></div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {groups.data?.map((g: any) => (
          <Card key={g.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.min_delay_seconds}s–{g.max_delay_seconds}s · mensagens ilimitadas · 24h · turnos 1-a-1
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={g.active} onCheckedChange={(v) => toggleFn({ data: { id: g.id, active: v } }).then(invalidate)} />
                  <span className="text-xs">{g.active ? "Ativo" : "Pausado"}</span>
                  <Button size="sm" variant="ghost" onClick={() => delFn({ data: { id: g.id } }).then(invalidate)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {g.warmup_group_members?.map((m: any) => (
                  <Badge key={m.id} variant="secondary" className="flex items-center gap-1">
                    {m.whatsapp_instances?.name}
                    <button className="ml-1 hover:text-destructive" onClick={() => rmMember({ data: { id: m.id } }).then(invalidate)}>×</button>
                  </Badge>
                ))}
                <AddMemberSelect
                  groupId={g.id}
                  used={new Set(g.warmup_group_members?.map((m: any) => m.instance_id))}
                  instances={insts.data ?? []}
                  onAdd={(instance_id) => addMember({ data: { group_id: g.id, instance_id } }).then(invalidate)}
                  onCreateNumber={() => changeTab("instances")}
                />
              </div>
              <GroupEnginePanel groupId={g.id} />
            </CardContent>
          </Card>
        ))}
        {groups.data?.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">Nenhum grupo criado.</div>}
      </div>
    </div>
  );
}

function GroupEnginePanel({ groupId }: { groupId: string }) {
  const fn = useServerFn(getGroupEngineStatus);
  const q = useQuery({
    queryKey: ["engine-status", groupId],
    queryFn: () => fn({ data: { id: groupId } }),
    refetchInterval: 5000,
  });
  const s = q.data;
  if (!s) return null;
  const nextIn = s.next_run_at ? Math.max(0, Math.floor((new Date(s.next_run_at).getTime() - Date.now()) / 1000)) : null;
  const nextLabel = nextIn == null ? "—" : nextIn === 0 ? "agora" : nextIn < 60 ? `${nextIn}s` : `${Math.floor(nextIn / 60)}m ${nextIn % 60}s`;
  const running = s.active && s.connected_members >= 2;
  const activeNow = running && (nextIn === 0 || !!s.last_activity);
  return (
    <div className={`mt-3 rounded-lg border p-3 ${running ? "border-green-500/40 bg-green-500/10" : "bg-muted/30"}`}>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 font-medium">
          <span className={`relative flex h-2 w-2`}>
            {running && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-70" />}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${running ? "bg-green-500" : "bg-muted-foreground/40"}`} />
          </span>
          <Zap className="h-3 w-3" />
          {running ? (activeNow ? "Motor ativo em tempo real" : "Motor pronto") : s.active ? "Aguardando 2 chips conectados" : "Motor pausado"}
        </div>
        <span className="text-muted-foreground">·</span>
        <span><span className="text-muted-foreground">Próximo tick:</span> <span className="font-mono">{nextLabel}</span></span>
        <span className="text-muted-foreground">·</span>
        <span><span className="text-muted-foreground">Hoje:</span> <span className="font-semibold">{s.msgs_today}</span></span>
        <span className="text-muted-foreground">·</span>
        <span><span className="text-muted-foreground">Total:</span> <span className="font-semibold">{s.msgs_total}</span></span>
        <span className="text-muted-foreground">·</span>
        <span><span className="text-muted-foreground">Chips:</span> <span className={running ? "font-semibold text-green-600 dark:text-green-400" : "font-semibold"}>{s.connected_members}/{s.total_members}</span> ativos</span>
        {running && (
          <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Troca funcionando
          </Badge>
        )}
        {s.last_activity && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">última: {timeAgo(s.last_activity)}</span>
          </>
        )}
      </div>
    </div>
  );
}


function AddMemberSelect({ groupId, used, instances, onAdd, onCreateNumber }: { groupId: string; used: Set<string>; instances: any[]; onAdd: (id: string) => void; onCreateNumber: () => void }) {
  const available = instances.filter((i) => !used.has(i.id));
  if (!instances.length) {
    return (
      <Button type="button" size="sm" className="h-8 gap-1" onClick={onCreateNumber}>
        <Plus className="h-3.5 w-3.5" /> Criar número para adicionar
      </Button>
    );
  }
  if (!available.length) {
    return <Button type="button" size="sm" variant="secondary" className="h-8" disabled>Todos os números já estão no grupo</Button>;
  }
  return (
    <Select onValueChange={(v) => onAdd(v)}>
      <SelectTrigger className="h-8 text-xs border-dashed border-primary/70 text-primary hover:bg-primary/10 gap-1 px-3 w-auto min-w-[190px] bg-primary/5">
        <SelectValue placeholder="+ Adicionar número" />
      </SelectTrigger>
      <SelectContent>
        {available.map((i) => (<SelectItem key={i.id} value={i.id}>{i.name} {i.phone ? `(${i.phone})` : ""}</SelectItem>))}
      </SelectContent>
    </Select>
  );
}

// ---------------- Motor IA (antes: Templates) ----------------
function TemplatesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const addFn = useServerFn(addTemplate);
  const delFn = useServerFn(deleteTemplate);
  const logsFn = useServerFn(listLogs);
  const q = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });
  const initialLogs = useQuery({ queryKey: ["ai-live-logs"], queryFn: () => logsFn() });

  const [text, setText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [liveLogs, setLiveLogs] = useState<LiveLog[]>([]);
  const [thinking, setThinking] = useState<{ from: string; to: string } | null>(null);

  const add = useMutation({
    mutationFn: () => addFn({ data: { content: text } }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["templates"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // seed
  useEffect(() => {
    if (initialLogs.data) setLiveLogs((initialLogs.data as LiveLog[]).slice(0, 12));
  }, [initialLogs.data]);

  // realtime: escuta broadcasts do cron ("typing_start" antes de gerar, "typing_end" ao enviar)
  // + insert em warmup_logs pra aparecer a mensagem já enviada
  useEffect(() => {
    const channel = supabase
      .channel("ai-engine-live")
      .on("broadcast", { event: "typing_start" }, ({ payload }) => {
        setThinking({ from: payload?.from_name ?? "Chip", to: payload?.to_name ?? "Chip" });
      })
      .on("broadcast", { event: "typing_end" }, () => {
        setThinking(null);
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "warmup_logs" },
        async (payload) => {
          const row = payload.new as any;
          const { data: names } = await supabase
            .from("whatsapp_instances")
            .select("id, name")
            .in("id", [row.from_instance_id, row.to_instance_id]);
          const map = new Map((names ?? []).map((n: any) => [n.id, n.name]));
          const enriched: LiveLog = {
            ...row,
            from_instance: { name: map.get(row.from_instance_id) ?? "Chip" },
            to_instance: { name: map.get(row.to_instance_id) ?? "Chip" },
          };
          setThinking(null);
          setLiveLogs((prev) => [enriched, ...prev].slice(0, 12));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const totalGenerated = liveLogs.length;
  const lastAt = liveLogs[0]?.created_at ?? null;

  return (
    <div className="mt-4 space-y-4">
      {/* Hero explicativo */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="p-6 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">A IA gera as mensagens automaticamente</h3>
              <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
                <span className="relative flex h-1.5 w-1.5 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                Motor ativo
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Você <b>não precisa digitar nada</b>. A cada ciclo, a IA analisa o histórico entre os chips do
              seu grupo e cria uma resposta em português coloquial, com personalidade aleatória — como se
              fossem pessoas reais conversando. Quanto mais o motor rodar, mais quentes seus números ficam.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Painel ao vivo */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                IA em ação — ao vivo
              </CardTitle>
              <CardDescription>Mostrando as últimas mensagens que a IA gerou para você</CardDescription>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div><b className="text-foreground">{totalGenerated}</b> geradas na sessão</div>
              <div>última: {lastAt ? timeAgo(lastAt) : "aguardando…"}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {thinking && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 animate-in fade-in slide-in-from-top-1">
                <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">
                    IA gerando mensagem: <b className="text-foreground">{thinking.from}</b> → <b className="text-foreground">{thinking.to}</b>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                    <span className="text-xs text-muted-foreground ml-2">pensando…</span>
                  </div>
                </div>
              </div>
            )}

            {liveLogs.length === 0 && !thinking && (
              <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
                <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p>Nenhuma conversa ainda. Ative um grupo com pelo menos 2 chips conectados na aba <b>Grupos</b>.</p>
              </div>
            )}

            {liveLogs.map((l, idx) => (
              <div
                key={l.id}
                className={`p-3 rounded-lg border bg-card ${idx === 0 ? "animate-in fade-in slide-in-from-top-2 border-primary/40" : ""}`}
              >
                <div className="flex items-center gap-2 text-xs mb-1.5">
                  <Badge variant="outline" className="text-[10px]">{l.from_instance?.name ?? "?"}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="text-[10px]">{l.to_instance?.name ?? "?"}</Badge>
                  <span className="text-muted-foreground ml-auto">{timeAgo(l.created_at)}</span>
                  {idx === 0 && (
                    <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
                      <Sparkles className="h-2.5 w-2.5 mr-1" />IA
                    </Badge>
                  )}
                </div>
                <div className="text-sm leading-relaxed">{l.content}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Avançado: fallback templates */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowAdvanced((v) => !v)}>
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Avançado: frases de reserva (opcional)
            </span>
            <span className="text-xs text-muted-foreground">{showAdvanced ? "esconder" : "mostrar"}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Usadas <b>apenas</b> se a IA falhar por algum motivo. Você pode ignorar esta seção.
          </CardDescription>
        </CardHeader>
        {showAdvanced && (
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex: Oi, tudo bem?" />
              <Button onClick={() => text && add.mutate()} disabled={!text}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {q.data?.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between border rounded px-3 py-2 bg-card text-sm">
                  <span>{t.content}</span>
                  <div className="flex items-center gap-1">
                    {t.is_global && <Badge variant="outline" className="text-[10px]">padrão</Badge>}
                    {!t.is_global && <Button size="sm" variant="ghost" onClick={() => delFn({ data: { id: t.id } }).then(() => qc.invalidateQueries({ queryKey: ["templates"] }))}><Trash2 className="h-3 w-3" /></Button>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ---------------- Logs ----------------
function LogsTab() {
  const fn = useServerFn(listLogs);
  const q = useQuery({ queryKey: ["logs"], queryFn: () => fn(), refetchInterval: 3000 });
  return (
    <div className="mt-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-green-500" /> Entregas confirmadas
          </CardTitle>
          <CardDescription>Logs atualizados em tempo real; verde significa que o WhatsApp confirmou o envio.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {q.data?.map((l: any) => (
              <div key={l.id} className={`p-3 text-sm flex items-center justify-between gap-3 ${l.status === "sent" ? "bg-green-500/5" : ""}`}>
                <div>
                  <div><span className="font-medium">{l.from_instance?.name ?? "?"}</span> → <span className="font-medium">{l.to_instance?.name ?? "?"}</span>: <span className="text-muted-foreground">{l.content}</span></div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                    {l.status === "sent" && <span className="text-green-600 dark:text-green-400 font-medium">✓ enviado e recebido</span>}
                    {l.error && <span className="text-destructive">{l.error}</span>}
                  </div>
                </div>
                {deliveryBadge(l.status)}
              </div>
            ))}
            {q.data?.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma mensagem enviada ainda.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Checkout interno (QR PIX + polling) ----------------
function CheckoutView({
  data,
  onClose,
}: {
  data: {
    number_subscription_id: string;
    pix_qr_code: string | null;
    pix_qr_code_url: string | null;
    payment_url: string | null;
    is_automatic_pix?: boolean;
  };
  onClose: () => void;
}) {
  const statusFn = useServerFn(getNumberSubscriptionStatus);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(data.pix_qr_code_url ?? null);

  // Gera imagem do QR a partir do código EMV se o Pagar.me não devolveu URL pronta
  useEffect(() => {
    if (data.pix_qr_code_url) { setQrDataUrl(data.pix_qr_code_url); return; }
    if (!data.pix_qr_code) return;
    let cancelled = false;
    import("qrcode").then((QR) =>
      QR.toDataURL(data.pix_qr_code!, { width: 320, margin: 1 }).then((url) => {
        if (!cancelled) setQrDataUrl(url);
      }),
    );
    return () => { cancelled = true; };
  }, [data.pix_qr_code, data.pix_qr_code_url]);

  // Polling de status a cada 3s
  const status = useQuery({
    queryKey: ["ns-status", data.number_subscription_id],
    queryFn: () => statusFn({ data: { id: data.number_subscription_id } }),
    refetchInterval: 3000,
  });

  const paid = status.data?.status === "active";

  if (paid) {
    return (
      <div className="space-y-3 text-center py-4">
        <div className="text-4xl">✅</div>
        <div className="font-medium">Pagamento confirmado!</div>
        <div className="text-xs text-muted-foreground">Seu novo número já está disponível.</div>
        <Button className="w-full" onClick={onClose}>Fechar</Button>
      </div>
    );
  }

  const isPix = !!(data.pix_qr_code || data.pix_qr_code_url);
  const isCard = !isPix && !!data.payment_url;

  return (
    <div className="space-y-4 text-sm">
      {isPix && (
        <>
          <div className="font-medium">
            {data.is_automatic_pix ? "Autorize o Pix Automático no app do seu banco:" : "Escaneie o QR Code no seu app do banco:"}
          </div>
          {data.is_automatic_pix && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
              🔁 <b>Cobrança recorrente.</b> Você autoriza uma única vez agora — as próximas mensalidades serão debitadas automaticamente pelo seu banco, sem precisar escanear QR de novo.
            </div>
          )}
          {qrDataUrl ? (
            <div className="flex justify-center bg-white p-3 rounded-lg">
              <img src={qrDataUrl} alt="QR Code PIX" className="w-56 h-56" />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-8">Gerando QR Code…</div>
          )}
          {data.pix_qr_code && (
            <>
              <div className="text-xs text-muted-foreground">Ou copie o código PIX (copia e cola):</div>
              <textarea
                readOnly
                className="w-full h-24 text-xs p-2 rounded border bg-muted font-mono"
                value={data.pix_qr_code}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(data.pix_qr_code!);
                  toast.success("Código PIX copiado");
                }}
              >
                Copiar código PIX
              </Button>
            </>
          )}
        </>
      )}

      {isCard && (
        <div className="space-y-2">
          <div className="font-medium">Finalize o pagamento com cartão:</div>
          <a href={data.payment_url!} target="_blank" rel="noreferrer">
            <Button className="w-full">Abrir checkout seguro do cartão</Button>
          </a>
          <div className="text-xs text-muted-foreground">
            O checkout do cartão abre em nova aba. Volte aqui após concluir — a tela atualiza sozinha.
          </div>
        </div>
      )}

      {!isPix && !isCard && (
        <div className="text-sm text-destructive">
          Não foi possível gerar a cobrança. Tente novamente ou fale com o suporte.
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
        <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
        Aguardando confirmação do pagamento…
      </div>
    </div>
  );
}

// ---------------- Plan (novo modelo: 2 grátis + R$25/mês por número extra) ----------------

function PlanTab() {
  const qc = useQueryClient();
  const billingFn = useServerFn(getMyBilling);
  const purchaseFn = useServerFn(purchaseNumber);
  const cancelFn = useServerFn(cancelNumberSubscription);

  const b = useQuery({ queryKey: ["my-billing"], queryFn: () => billingFn(), refetchInterval: 20000 });
  const publicKeyFn = useServerFn(getPagarmePublicKey);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [doc, setDoc] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"pix" | "credit_card">("pix");

  // Endereço
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");

  // Cartão (nunca trafega pelo nosso servidor — só o token)
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExp, setCardExp] = useState(""); // MM/AA
  const [cardCvv, setCardCvv] = useState("");
  const [installments, setInstallments] = useState<number>(1);

  const [checkoutData, setCheckoutData] = useState<null | {
    number_subscription_id: string;
    pix_qr_code: string | null;
    pix_qr_code_url: string | null;
    payment_url: string | null;
  }>(null);

  // Auto-preenche via ViaCEP quando o CEP tem 8 dígitos
  useEffect(() => {
    const clean = zip.replace(/\D/g, "");
    if (clean.length !== 8) return;
    let cancelled = false;
    fetch(`https://viacep.com.br/ws/${clean}/json/`)
      .then((r) => r.json())
      .then((d: any) => {
        if (cancelled || d?.erro) return;
        setStreet(d.logradouro ?? "");
        setNeighborhood(d.bairro ?? "");
        setCity(d.localidade ?? "");
        setUf(d.uf ?? "");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [zip]);

  async function tokenizeCard(publicKey: string) {
    const [mm, yy] = cardExp.split("/").map((s) => s.trim());
    const res = await fetch(
      `https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "card",
          card: {
            number: cardNumber.replace(/\s/g, ""),
            holder_name: cardHolder.toUpperCase(),
            exp_month: Number(mm),
            exp_year: Number(yy?.length === 2 ? `20${yy}` : yy),
            cvv: cardCvv,
          },
        }),
      },
    );
    const json = await res.json();
    if (!res.ok || !json.id) {
      throw new Error(json?.errors?.[0]?.message ?? "Cartão inválido");
    }
    return json.id as string;
  }

  const purchase = useMutation({
    mutationFn: async () => {
      const address = {
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim() || undefined,
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: uf.trim().toUpperCase(),
        zip_code: zip.replace(/\D/g, ""),
      };
      let card_token: string | undefined;
      if (method === "credit_card") {
        const { public_key } = await publicKeyFn();
        card_token = await tokenizeCard(public_key);
      }
      return purchaseFn({
        data: {
          full_name: fullName,
          document: doc,
          phone,
          address,
          payment_method: method,
          card_token,
          installments: method === "credit_card" ? installments : undefined,
        },
      });
    },
    onSuccess: (res: any) => {
      setCheckoutData({
        number_subscription_id: res.number_subscription_id,
        pix_qr_code: res.pix_qr_code,
        pix_qr_code_url: res.pix_qr_code_url,
        payment_url: res.payment_url,
      });
      qc.invalidateQueries({ queryKey: ["my-billing"] });
      toast.success(method === "credit_card" ? "Cartão aprovado!" : "PIX gerado! Escaneie ou copie.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const data = b.data;
  const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

  return (
    <div className="mt-4 space-y-6">
      {data?.suspended && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-sm">
            <b>Conta suspensa</b>
            {data.suspended_reason ? `: ${data.suspended_reason}` : ""}. Fale com o suporte.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Quota</CardTitle><CardDescription>Números disponíveis na sua conta</CardDescription></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{data?.used ?? 0} / {data?.quota ?? 2}</div>
            <div className="text-xs text-muted-foreground mt-2">
              Inclui {data?.free_included ?? 2} grátis
              {data?.free_bonus ? ` + ${data.free_bonus} de cortesia` : ""}
              {data?.numbers?.filter?.((n: any) => n.status === "active").length
                ? ` + ${data.numbers.filter((n: any) => n.status === "active").length} pago(s)`
                : ""}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mensagens</CardTitle><CardDescription>Uso diário</CardDescription></CardHeader>
          <CardContent><div className="text-4xl font-bold">Ilimitado</div><div className="text-xs text-muted-foreground mt-2">Sem restrição de disparos ou aquecimento.</div></CardContent>
        </Card>

        <Card className="border-primary">
          <CardHeader><CardTitle>Adicionar número</CardTitle><CardDescription>R$ 25/mês por número extra</CardDescription></CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => { setOpen(true); setCheckoutData(null); }} disabled={data?.suspended}>
              Comprar 1 número
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seus números pagos</CardTitle>
          <CardDescription>Renovação a cada 30 dias. Você pode cancelar quando quiser.</CardDescription>
        </CardHeader>
        <CardContent>
          {(data?.numbers ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              Nenhum número pago. Você tem {data?.quota ?? 2} disponível(is) grátis.
            </div>
          )}
          <div className="divide-y">
            {(data?.numbers ?? []).map((n: any) => (
              <div key={n.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm">
                    <Badge variant={n.status === "active" ? "default" : n.status === "past_due" ? "destructive" : "secondary"}>
                      {n.status === "active" ? "Ativo" : n.status === "past_due" ? "Vencido" : n.status === "pending" ? "Aguardando pagamento" : "Cancelado"}
                    </Badge>
                    <span className="ml-2 font-medium">{brl(n.price_cents)}/mês</span>
                    <span className="ml-2 text-xs text-muted-foreground uppercase">{n.payment_method === "pix" ? "PIX" : "Cartão"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {n.current_period_end ? `Válido até ${new Date(n.current_period_end).toLocaleDateString("pt-BR")}` : "Aguardando confirmação de pagamento"}
                  </div>
                </div>
                <div className="flex gap-2">
                  {n.status === "pending" && n.last_charge_url && (
                    <a href={n.last_charge_url} target="_blank" rel="noreferrer"><Button size="sm">Pagar</Button></a>
                  )}
                  {(n.status === "active" || n.status === "past_due" || n.status === "pending") && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (!confirm("Cancelar esta assinatura?")) return;
                      cancelFn({ data: { id: n.id } }).then(() => { toast.success("Cancelada"); qc.invalidateQueries({ queryKey: ["my-billing"] }); });
                    }}>Cancelar</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Comprar 1 número extra — R$ 25/mês</DialogTitle></DialogHeader>
          {!checkoutData ? (
            <div className="space-y-4">
              {/* Dados pessoais */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados pessoais</div>
                <div>
                  <Label>Nome completo</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Como está no seu CPF" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>CPF</Label>
                    <Input value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <Label>Celular</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
                  </div>
                </div>
              </div>

              {/* Endereço de cobrança */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço de cobrança</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Label>CEP</Label>
                    <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="00000-000" />
                  </div>
                  <div className="col-span-2">
                    <Label>Rua</Label>
                    <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua / Avenida" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Número</Label>
                    <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123" />
                  </div>
                  <div className="col-span-2">
                    <Label>Complemento (opcional)</Label>
                    <Input value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apto 42" />
                  </div>
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label>Cidade</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div>
                    <Label>UF</Label>
                    <Input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} placeholder="SP" />
                  </div>
                </div>
              </div>

              {/* Método de pagamento */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pagamento</div>
                <div>
                  <Label>Método</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX (QR Code)</SelectItem>
                      <SelectItem value="credit_card">Cartão de crédito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {method === "credit_card" && (
                  <div className="space-y-2 rounded-lg border p-3 bg-muted/40">
                    <div>
                      <Label>Número do cartão</Label>
                      <Input
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value.replace(/[^\d\s]/g, ""))}
                        placeholder="0000 0000 0000 0000"
                        inputMode="numeric"
                        autoComplete="cc-number"
                      />
                    </div>
                    <div>
                      <Label>Nome impresso no cartão</Label>
                      <Input
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                        placeholder="COMO ESTÁ NO CARTÃO"
                        autoComplete="cc-name"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label>Validade</Label>
                        <Input
                          value={cardExp}
                          onChange={(e) => setCardExp(e.target.value)}
                          placeholder="MM/AA"
                          inputMode="numeric"
                          autoComplete="cc-exp"
                        />
                      </div>
                      <div>
                        <Label>CVV</Label>
                        <Input
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ""))}
                          placeholder="123"
                          inputMode="numeric"
                          maxLength={4}
                          autoComplete="cc-csc"
                        />
                      </div>
                      <div>
                        <Label>Parcelas</Label>
                        <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1x sem juros</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      🔒 Os dados do cartão são tokenizados diretamente pelo Pagar.me. Nunca passam pelos nossos servidores.
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  className="w-full"
                  onClick={() => purchase.mutate()}
                  disabled={
                    purchase.isPending ||
                    !fullName ||
                    doc.replace(/\D/g, "").length !== 11 ||
                    phone.replace(/\D/g, "").length < 10 ||
                    zip.replace(/\D/g, "").length !== 8 ||
                    !street || !number || !neighborhood || !city || uf.length !== 2 ||
                    (method === "credit_card" && (
                      cardNumber.replace(/\s/g, "").length < 13 ||
                      !cardHolder ||
                      !/^\d{2}\s*\/\s*\d{2,4}$/.test(cardExp) ||
                      cardCvv.length < 3
                    ))
                  }
                >
                  {purchase.isPending
                    ? "Processando..."
                    : method === "pix"
                      ? "Gerar PIX"
                      : `Pagar R$ 25,00 no cartão`}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <CheckoutView
              data={checkoutData}
              onClose={() => { setOpen(false); setCheckoutData(null); qc.invalidateQueries({ queryKey: ["my-billing"] }); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ---------------- Admin ----------------
function AdminTab() {
  const qc = useQueryClient();
  const usersFn = useServerFn(adminListUsers);
  const plansFn = useServerFn(listPlans);
  const updatePlanFn = useServerFn(adminUpdateUserPlan);
  const getCfgFn = useServerFn(adminGetEvolutionConfig);
  const setCfgFn = useServerFn(adminUpdateEvolutionConfig);
  const statsFn = useServerFn(adminGetStats);

  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => statsFn(), refetchInterval: 30000 });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => usersFn() });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => plansFn() });
  const cfg = useQuery({ queryKey: ["evo-cfg"], queryFn: () => getCfgFn() });

  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const saveCfg = useMutation({
    mutationFn: () => setCfgFn({ data: { api_url: url.trim(), api_key: key.trim() } }),
    onSuccess: () => {
      toast.success("Configuração da Evolution salva");
      setUrl("");
      setKey("");
      qc.invalidateQueries({ queryKey: ["evo-cfg"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar configuração"),
  });

  const s = stats.data;
  const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="mt-4 space-y-6">
      <AdminPlatformDashboard />


      {/* KPIs de faturamento */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="MRR" value={s ? brl(s.revenue.mrrCents) as any : "—"} icon={<CreditCard />} />
        <StatCard label="ARR estimado" value={s ? brl(s.revenue.arrCents) as any : "—"} icon={<TrendingUpIcon />} />
        <StatCard label="Assinantes pagantes" value={s?.revenue.activePaying ?? 0} icon={<Users2 />} />
        <StatCard label="Clientes totais" value={s?.users.total ?? 0} icon={<Users2 />} />
      </div>

      {/* Atividade */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Novos hoje" value={s?.users.today ?? 0} icon={<Sparkles />} />
        <StatCard label="Novos 7d" value={s?.users.week ?? 0} icon={<Sparkles />} />
        <StatCard label="Chips conectados" value={`${s?.instances.connected ?? 0} / ${s?.instances.total ?? 0}` as any} icon={<Smartphone />} />
        <StatCard label="Grupos ativos" value={s?.groupsActive ?? 0} icon={<Users2 />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Mensagens hoje" value={s?.messages.today ?? 0} icon={<MessageSquare />} />
        <StatCard label="Mensagens 7d" value={s?.messages.week ?? 0} icon={<MessageSquare />} />
        <StatCard label="Falhas 7d" value={s?.messages.failedWeek ?? 0} icon={<ScrollText />} />
      </div>

      {/* Distribuição de planos */}
      <Card>
        <CardHeader><CardTitle>Distribuição por plano</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {s && Object.entries(s.planBreakdown).map(([name, count]) => (
              <Badge key={name} variant="secondary" className="text-sm">{name}: {count as number}</Badge>
            ))}
            {!s && <div className="text-sm text-muted-foreground">Carregando…</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Configuração da Evolution API</CardTitle><CardDescription>URL e chave do seu servidor Evolution API self-hosted.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>URL atual</Label><div className="text-xs text-muted-foreground">{cfg.data?.api_url || "(não configurada)"}</div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Nova URL</Label><Input placeholder="https://evo.seudominio.com" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
            <div><Label>API Key</Label><Input type="password" placeholder="********" value={key} onChange={(e) => setKey(e.target.value)} /></div>
          </div>
          <Button onClick={() => saveCfg.mutate()} disabled={!url || !key || saveCfg.isPending}>Salvar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cadastros recentes (30d)</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y max-h-64 overflow-y-auto">
            {s?.recentSignups.map((u: any) => (
              <div key={u.id} className="py-2 flex items-center justify-between text-sm">
                <span>{u.email}</span>
                <span className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString("pt-BR")}</span>
              </div>
            ))}
            {s && s.recentSignups.length === 0 && <div className="py-4 text-sm text-muted-foreground text-center">Nenhum cadastro recente.</div>}
          </div>
        </CardContent>
      </Card>

      <AdminInstancesCard />

      <Card>
        <CardHeader><CardTitle>Clientes</CardTitle><CardDescription>Gerencie planos e visualize dados de cada usuário.</CardDescription></CardHeader>
        <CardContent>
          <div className="divide-y">
            {users.data?.map((u: any) => {
              const sub = u.subscriptions?.[0];
              const currentPlanName = sub?.plan?.name ?? "—";
              const price = sub?.plan?.price_cents ?? 0;
              return (
                <div key={u.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-medium">{u.full_name || u.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.email}{u.phone ? ` · ${u.phone}` : ""}{u.company ? ` · ${u.company}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Plano: {currentPlanName} {price > 0 && `· ${brl(price)}/mês`} · Desde {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <Select onValueChange={(v) => updatePlanFn({ data: { user_id: u.id, plan_id: v } }).then(() => { toast.success("Plano atualizado"); qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); })}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Alterar plano" /></SelectTrigger>
                    <SelectContent>{plans.data?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <AdminBillingSection />
    </div>
  );
}

// ---------------- Admin: Financeiro (Pagar.me) ----------------
function AdminBillingSection() {
  const qc = useQueryClient();
  const summaryFn = useServerFn(adminFinancialSummary);
  const usersFn = useServerFn(adminListBillingUsers);
  const bonusFn = useServerFn(adminAddFreeNumbers);
  const suspendFn = useServerFn(adminSetUserSuspended);
  const removeFn = useServerFn(adminForceRemoveNumberSubscription);

  const summary = useQuery({ queryKey: ["admin-fin-summary"], queryFn: () => summaryFn(), refetchInterval: 30000 });
  const rows = useQuery({ queryKey: ["admin-billing-users"], queryFn: () => usersFn() });
  const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const s = summary.data;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-fin-summary"] });
    qc.invalidateQueries({ queryKey: ["admin-billing-users"] });
  };

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold flex items-center gap-2"><CreditCard className="h-5 w-5" /> Financeiro (Pagar.me)</div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="MRR" value={s ? brl(s.mrr_cents) as any : "—"} icon={<CreditCard />} />
        <StatCard label="Números pagos ativos" value={s?.active_paid_numbers ?? 0} icon={<Smartphone />} />
        <StatCard label="Vencidos (past due)" value={s?.past_due_numbers ?? 0} icon={<ScrollText />} />
        <StatCard label="Cancelados 30d" value={s?.canceled_last_30d ?? 0} icon={<ScrollText />} />
        <StatCard label="Usuários ativos" value={s?.active_users ?? 0} icon={<Users2 />} />
        <StatCard label="Suspensos" value={s?.suspended_users ?? 0} icon={<Users2 />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ações por cliente</CardTitle>
          <CardDescription>Liberar números de cortesia, suspender ou reativar contas.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {(rows.data ?? []).map((r: any) => (
              <div key={r.user_id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.full_name || r.email || r.user_id}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.email}
                    {" · "}Bônus: {r.free_bonus}
                    {" · "}Pagos ativos: {r.paid_active}
                    {r.past_due > 0 && ` · Vencidos: ${r.past_due}`}
                    {r.mrr_cents > 0 && ` · ${brl(r.mrr_cents)}/mês`}
                    {r.suspended && " · SUSPENSO"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => {
                    bonusFn({ data: { user_id: r.user_id, delta: 1 } }).then(() => { toast.success("+1 número de cortesia"); invalidateAll(); }).catch((e: any) => toast.error(e.message));
                  }}>+1 grátis</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    bonusFn({ data: { user_id: r.user_id, delta: -1 } }).then(() => { toast.success("-1 número de cortesia"); invalidateAll(); }).catch((e: any) => toast.error(e.message));
                  }}>-1 grátis</Button>
                  {r.suspended ? (
                    <Button size="sm" onClick={() => {
                      suspendFn({ data: { user_id: r.user_id, suspended: false } }).then(() => { toast.success("Reativado"); invalidateAll(); });
                    }}>Reativar</Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => {
                      const reason = prompt("Motivo da suspensão (opcional):") ?? undefined;
                      suspendFn({ data: { user_id: r.user_id, suspended: true, reason } }).then(() => { toast.success("Suspenso"); invalidateAll(); });
                    }}>Suspender</Button>
                  )}
                </div>
              </div>
            ))}
            {(rows.data ?? []).length === 0 && <div className="py-4 text-sm text-muted-foreground text-center">Nenhum cliente ainda.</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuração do webhook Pagar.me</CardTitle>
          <CardDescription>Configure no dashboard do Pagar.me para receber os eventos de pagamento.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div><b>URL do webhook:</b> <code className="text-xs bg-muted px-2 py-1 rounded">https://zapheatnew.lovable.app/api/public/hooks/pagarme-webhook</code></div>
          <div><b>Eventos:</b> <span className="text-xs text-muted-foreground">order.paid, charge.paid, charge.payment_failed, charge.refunded, charge.chargedback, order.canceled</span></div>
          <div className="text-xs text-muted-foreground">O segredo do webhook está armazenado como <code>PAGARME_WEBHOOK_SECRET</code>. Configure o mesmo valor no dashboard do Pagar.me.</div>
        </CardContent>
      </Card>
    </div>
  );
}


function AdminPlatformDashboard() {
  const fn = useServerFn(adminPlatformDashboard);
  const q = useQuery({
    queryKey: ["admin-platform-dashboard"],
    queryFn: () => fn(),
    refetchInterval: 30000,
  });
  const d = q.data;
  if (!d) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  const chartData = d.dailySeries.map((r: any) => ({
    day: new Date(r.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    enviadas: r.sent,
    falhas: r.failed,
  }));
  const tempData = [
    { name: "Quentes", value: d.temperature.hot, color: "#f97316" },
    { name: "Mornos", value: d.temperature.warm, color: "#eab308" },
    { name: "Frios", value: d.temperature.cold, color: "#0ea5e9" },
  ];
  const engineHealthy = d.engine.successRate >= 90 && d.engine.lastLogAt && Date.now() - new Date(d.engine.lastLogAt).getTime() < 5 * 60 * 1000;
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Visão geral da plataforma</CardTitle>
        <CardDescription>Números somados de todos os clientes (atualiza a cada 30s).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Chips totais" value={`${d.totals.connectedChips}/${d.totals.totalChips}`} icon={<Smartphone />} />
          <StatCard label="Mensagens hoje" value={d.dailySeries[d.dailySeries.length - 1]?.sent ?? 0} icon={<MessageSquare />} />
          <StatCard label="Mensagens 7d" value={d.totals.totalMsgs7d} icon={<TrendingUp />} />
          <StatCard label="Mensagens (total)" value={d.totals.totalMsgs} icon={<Flame />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="text-sm font-medium mb-2">Mensagens por dia (30d, toda a plataforma)</div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="enviadas" stroke="var(--primary)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="falhas" stroke="var(--destructive)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Temperatura dos chips</div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={tempData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4}>
                    {tempData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <ChartTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-3 text-xs mt-1">
              {tempData.map((t) => (
                <span key={t.name} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                  {t.name}: <b>{t.value}</b>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium flex items-center gap-1.5"><Zap className="h-4 w-4" />Saúde do motor (24h)</div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${engineHealthy ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"}`}>
                {engineHealthy ? "Saudável" : "Atenção"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold leading-none">{d.engine.sent24h}</div>
                <div className="text-[10px] text-muted-foreground uppercase mt-1">Enviadas</div>
              </div>
              <div>
                <div className="text-lg font-bold leading-none text-destructive">{d.engine.failed24h}</div>
                <div className="text-[10px] text-muted-foreground uppercase mt-1">Falhas</div>
              </div>
              <div>
                <div className="text-lg font-bold leading-none">{d.engine.successRate}%</div>
                <div className="text-[10px] text-muted-foreground uppercase mt-1">Sucesso</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Última mensagem: {d.engine.lastLogAt ? timeAgo(d.engine.lastLogAt) : "nunca"}
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium mb-2">Top 10 clientes (7d)</div>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {d.topClients.length === 0 && <div className="text-xs text-muted-foreground">Ainda sem atividade.</div>}
              {d.topClients.map((c: any, idx: number) => (
                <div key={c.id} className="flex items-center justify-between text-sm border rounded px-2.5 py-1.5">
                  <span className="truncate">
                    <span className="text-muted-foreground font-mono text-xs mr-2">#{idx + 1}</span>
                    {c.name}
                  </span>
                  <span className="text-xs shrink-0">
                    <Badge variant="secondary" className="mr-1 text-[10px]">{c.chips} chips</Badge>
                    <b>{c.msgs_7d}</b> msgs
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminInstancesCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListInstances);
  const refreshFn = useServerFn(adminRefreshInstance);
  const delFn = useServerFn(adminDeleteInstance);
  const q = useQuery({ queryKey: ["admin-instances"], queryFn: () => listFn(), refetchInterval: 15000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-instances"] });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Números conectados (todos os clientes)</CardTitle>
        <CardDescription>Monitore, reconecte ou remova chips de qualquer usuário.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y max-h-96 overflow-y-auto">
          {q.data?.map((i: any) => (
            <div key={i.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {i.name} {i.phone && <span className="text-muted-foreground font-mono ml-1">· {i.phone}</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {i.profiles?.full_name || i.profiles?.email || i.user_id.slice(0, 8)} · {i.evolution_instance}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={i.status === "connected" ? "default" : "secondary"}>{i.status}</Badge>
                <Button size="sm" variant="ghost" onClick={() => refreshFn({ data: { id: i.id } }).then(() => { toast.success("Atualizado"); invalidate(); }).catch((e: any) => toast.error(e.message))}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Remover ${i.name}?`)) delFn({ data: { id: i.id } }).then(() => { toast.success("Removido"); invalidate(); }); }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          {q.data && q.data.length === 0 && <div className="py-4 text-sm text-muted-foreground text-center">Nenhum número conectado ainda.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendingUpIcon() {
  return <TrendingUp className="h-4 w-4" />;
}

// ---------------- Tutorial ----------------
function TutorialTab() {
  const steps = [
    {
      icon: <Server className="h-5 w-5" />,
      title: "1. Contrate ou instale a Evolution API",
      body: (
        <>
          <p>A Evolution API é a ponte entre o WarmUp Pro e o WhatsApp. Você tem 3 caminhos:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2 text-sm">
            <li><b>Serviço pronto</b> (mais rápido) — sites como <span className="font-mono">evolution-api.com</span> hospedam pra você. Cria conta, paga, recebe URL + API Key.</li>
            <li><b>VPS + Docker</b> — contrata uma VPS (Contabo, Hostinger, DigitalOcean, ~R$30/mês) e roda o Docker Compose do repositório oficial <span className="font-mono">github.com/EvolutionAPI/evolution-api</span>.</li>
            <li><b>Instalação própria</b> — mesmo repositório, você mesmo instala. Ilimitados números.</li>
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">Ao final você terá: uma <b>URL</b> (ex: https://evo.seudominio.com) e uma <b>API Key</b>.</p>
        </>
      ),
    },
    {
      icon: <Settings className="h-5 w-5" />,
      title: "2. Configure no painel (aba Admin)",
      body: (
        <p className="text-sm">
          Entre na aba <b>Admin</b>, cole a URL e a API Key da sua Evolution e salve. Isso é feito apenas <b>uma vez</b>.
        </p>
      ),
    },
    {
      icon: <QrCode className="h-5 w-5" />,
      title: "3. Conecte seus números",
      body: (
        <p className="text-sm">
          Vá em <b>Números → Adicionar</b>. Dê um nome (ex: "chip-01"), clique criar e escaneie o QR Code com o WhatsApp do celular
          (Configurações → Aparelhos conectados → Conectar aparelho). Repita para cada número que quiser aquecer.
          Recomendamos <b>no mínimo 3 números</b> por grupo para conversas mais naturais.
        </p>
      ),
    },
    {
      icon: <Users2 className="h-5 w-5" />,
      title: "4. Crie um grupo de aquecimento",
      body: (
        <>
          <p className="text-sm">
            Em <b>Grupos → Novo grupo</b>, dê um nome e adicione <b>2 ou mais números</b> como membros.
            Quanto mais números, mais orgânico — o sistema sorteia pares aleatórios a cada conversa (A→B, depois C→D, depois B→E...).
          </p>
          <p className="text-sm mt-2">Configure:</p>
          <ul className="list-disc pl-5 space-y-1 mt-1 text-sm">
            <li><b>Delay mín/máx</b> (segundos entre mensagens) — recomendado 60–300s para simular humano</li>
            <li><b>Limite diário</b> — comece baixo (20–40 msgs/dia) e aumente gradualmente</li>
          </ul>
        </>
      ),
    },
    {
      icon: <Sparkles className="h-5 w-5" />,
      title: "5. Ative e deixe a IA trabalhar",
      body: (
        <>
          <p className="text-sm">
            Ligue o switch <b>Ativo</b> no grupo. Pronto — o sistema roda sozinho 24/7:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2 text-sm">
            <li>Sorteia um par de números do grupo</li>
            <li>A IA (Gemini) lê o histórico da conversa e gera resposta natural em português</li>
            <li>Envia via Evolution do número A pro número B</li>
            <li>Agenda o próximo envio com delay aleatório</li>
            <li>Respeita o limite diário do plano</li>
          </ul>
          <p className="text-sm mt-2">Acompanhe tudo em <b>Logs</b>.</p>
        </>
      ),
    },
  ];

  return (
    <div className="mt-4 space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6 flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg gradient-ember-bg grid place-items-center glow-ember shrink-0">
            <BookOpen className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold">Como funciona o WarmUp Pro</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Aquecimento automático de WhatsApp com IA. Configure uma vez e deixe rodando —
              seus números conversam entre si de forma natural, 24 horas por dia.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {steps.map((s, i) => (
          <Card key={i}>
            <CardContent className="p-5 flex gap-4">
              <div className="h-10 w-10 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                {s.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  {s.title}
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground/40" />
                </h3>
                <div className="text-sm">{s.body}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dicas de segurança para não bloquear os chips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>• <b>Números novos:</b> comece com no máximo 20 msgs/dia na primeira semana e aumente 10 por semana.</p>
          <p>• <b>Nunca ative um chip recém-conectado com limite alto</b> — o WhatsApp banimento por comportamento suspeito.</p>
          <p>• <b>Use delays variados</b> (60–300s) — mensagens em intervalos regulares parecem robôs.</p>
          <p>• <b>Mantenha os chips online</b> — celular ligado, WhatsApp Web ativo, ou instância Evolution rodando 24/7.</p>
          <p>• <b>Não misture aquecimento e envio comercial no mesmo chip</b> por pelo menos 15 dias.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perguntas frequentes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <div>
            <p className="font-medium">Posso ter vários números conversando entre si?</p>
            <p className="text-muted-foreground">Sim! Coloque 3, 5, 10 ou mais números no mesmo grupo. A cada tick o sistema sorteia um par aleatório diferente — as conversas se cruzam naturalmente.</p>
          </div>
          <div>
            <p className="font-medium">Preciso ficar com o computador ligado?</p>
            <p className="text-muted-foreground">Não. O aquecimento roda no servidor. Basta a Evolution API estar online (na sua VPS ou serviço) e os celulares com WhatsApp conectados.</p>
          </div>
          <div>
            <p className="font-medium">A IA repete mensagens?</p>
            <p className="text-muted-foreground">Não. A cada mensagem a IA olha as últimas 10 do histórico e gera algo diferente, em português coloquial, com personalidade aleatória.</p>
          </div>
          <div>
            <p className="font-medium">E se um chip desconectar?</p>
            <p className="text-muted-foreground">O sistema pula ele automaticamente e usa os outros do grupo. Você reconecta pelo QR Code e ele volta a participar.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Live Chat ----------------
type LiveLog = {
  id: string;
  group_id: string;
  from_instance_id: string;
  to_instance_id: string;
  content: string;
  status: string;
  created_at: string;
  from_instance?: { name: string } | null;
  to_instance?: { name: string } | null;
};

function pairKey(a: string, b: string) {
  return [a, b].sort().join("::");
}

function LiveChatTab() {
  const fn = useServerFn(listLogs);
  const initial = useQuery({ queryKey: ["live-logs"], queryFn: () => fn() });
  const [logs, setLogs] = useState<LiveLog[]>([]);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // seed with initial data
  useEffect(() => {
    if (initial.data) setLogs(initial.data as LiveLog[]);
  }, [initial.data]);

  // realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("warmup-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "warmup_logs" },
        async (payload) => {
          const row = payload.new as any;
          // fetch instance names for this new row
          const { data: names } = await supabase
            .from("whatsapp_instances")
            .select("id, name")
            .in("id", [row.from_instance_id, row.to_instance_id]);
          const map = new Map((names ?? []).map((n: any) => [n.id, n.name]));
          const enriched: LiveLog = {
            ...row,
            from_instance: { name: map.get(row.from_instance_id) ?? "?" },
            to_instance: { name: map.get(row.to_instance_id) ?? "?" },
          };
          setLogs((prev) => [enriched, ...prev].slice(0, 500));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // group by conversation pair
  const pairs = new Map<string, { key: string; a: string; b: string; nameA: string; nameB: string; last: LiveLog; count: number }>();
  for (const l of logs) {
    const k = pairKey(l.from_instance_id, l.to_instance_id);
    const existing = pairs.get(k);
    if (!existing) {
      pairs.set(k, {
        key: k,
        a: l.from_instance_id,
        b: l.to_instance_id,
        nameA: l.from_instance?.name ?? "?",
        nameB: l.to_instance?.name ?? "?",
        last: l,
        count: 1,
      });
    } else {
      existing.count++;
    }
  }
  const pairList = Array.from(pairs.values()).sort(
    (a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime(),
  );

  const activeKey = selectedPair ?? pairList[0]?.key ?? null;
  const conversation = activeKey
    ? logs
        .filter((l) => pairKey(l.from_instance_id, l.to_instance_id) === activeKey)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : [];

  // auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.length, activeKey]);

  const activePair = pairList.find((p) => p.key === activeKey);

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[70vh]">
      {/* Sidebar with conversations */}
      <Card className="overflow-hidden flex flex-col">
        <CardHeader className="p-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Conversas ao vivo
          </CardTitle>
        </CardHeader>
        <div className="flex-1 overflow-y-auto">
          {initial.isLoading && (
            <div className="p-6 text-xs text-muted-foreground text-center">Carregando…</div>
          )}
          {initial.error && (
            <div className="p-6 text-xs text-destructive text-center">
              Erro ao carregar: {(initial.error as Error).message}
            </div>
          )}
          {!initial.isLoading && !initial.error && pairList.length === 0 && (
            <div className="p-6 text-xs text-muted-foreground text-center space-y-2">
              <p className="font-medium text-foreground">Nenhuma conversa ainda</p>
              <p>Para começar a ver mensagens aqui:</p>
              <ol className="text-left list-decimal pl-4 space-y-1">
                <li>Conecte pelo menos 2 chips na aba <b>Chips</b> (escaneie o QR)</li>
                <li>Crie um grupo na aba <b>Grupos</b> e adicione os chips</li>
                <li>Deixe o grupo ativo — as mensagens aparecem aqui em tempo real</li>
              </ol>
            </div>
          )}
          {pairList.map((p) => (
            <button
              key={p.key}
              onClick={() => setSelectedPair(p.key)}
              className={`w-full text-left px-3 py-2.5 border-b hover:bg-accent/40 transition-colors ${
                activeKey === p.key ? "bg-accent/60" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">
                  {p.nameA} ↔ {p.nameB}
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{p.count}</Badge>
              </div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">{p.last.content}</div>
            </button>
          ))}
        </div>

      </Card>

      {/* Conversation panel */}
      <Card className="overflow-hidden flex flex-col">
        <CardHeader className="p-3 border-b">
          <CardTitle className="text-sm">
            {activePair ? `${activePair.nameA} ↔ ${activePair.nameB}` : "Selecione uma conversa"}
          </CardTitle>
        </CardHeader>
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20"
        >
          {conversation.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              Aguardando mensagens…
            </div>
          )}
          {conversation.map((m) => {
            const isA = activePair && m.from_instance_id === activePair.a;
            const senderName = m.from_instance?.name ?? "?";
            return (
              <div
                key={m.id}
                className={`flex ${isA ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                    isA
                      ? "bg-card border rounded-bl-sm"
                      : "gradient-ember-bg text-primary-foreground rounded-br-sm"
                  }`}
                >
                  <div className={`text-[10px] font-mono uppercase tracking-wider mb-0.5 ${isA ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                    {senderName}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  <div className={`text-[10px] mt-1 ${isA ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {m.status === "failed" && " · falhou"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ---------------- Dispatch (Disparos em massa) ----------------
function DispatchTab() {
  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Disparos em massa</CardTitle>
          <CardDescription>
            Envie mensagens em massa usando seus números conectados enquanto continuam aquecendo.
            O sistema respeita intervalos aleatórios, limite por número/dia e janela de horário.
          </CardDescription>
        </CardHeader>
      </Card>
      <ContactListsSection />
      <CampaignsSection />
    </div>
  );
}

function ContactListsSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listContactLists);
  const createFn = useServerFn(createContactList);
  const delFn = useServerFn(deleteContactList);
  const lists = useQuery({ queryKey: ["contact-lists"], queryFn: () => listFn() });

  const [name, setName] = useState("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);

  function parseContacts(text: string) {
    const rows = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return rows
      .map((line) => {
        const [phone, ...rest] = line.split(/[,;\t]/).map((s) => s.trim());
        const digits = (phone || "").replace(/\D/g, "");
        if (digits.length < 8) return null;
        return { phone: digits, name: rest.join(" ") || undefined };
      })
      .filter((v): v is { phone: string; name: string | undefined } => v !== null);
  }

  const handleFile = async (f: File) => {
    const txt = await f.text();
    setRaw(txt);
  };

  const create = useMutation({
    mutationFn: async () => {
      setBusy(true);
      const contacts = parseContacts(raw);
      if (!contacts.length) throw new Error("Nenhum contato válido encontrado");
      return createFn({ data: { name, contacts } });
    },
    onSuccess: () => {
      toast.success("Lista criada");
      setName("");
      setRaw("");
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
    },
    onError: (e: any) => {
      setBusy(false);
      toast.error(e.message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" />Listas de contatos</CardTitle>
        <CardDescription>Cole números (um por linha) ou envie CSV. Formato: <code>telefone,nome</code>. Ex: <code>5511999999999,João</code></CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <Label>Nome da lista</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Clientes VIP" />
          </div>
          <div className="md:col-span-2">
            <Label>Contatos (CSV ou colar)</Label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={4}
              className="w-full mt-1 rounded-md border bg-background p-2 text-sm font-mono"
              placeholder="5511999999999,João&#10;5511888888888,Maria"
            />
            <div className="flex items-center gap-2 mt-2">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="text-xs"
              />
              <span className="text-xs text-muted-foreground">
                {parseContacts(raw).length} contato(s) válido(s)
              </span>
            </div>
          </div>
        </div>
        <Button
          onClick={() => name && create.mutate()}
          disabled={!name || busy || parseContacts(raw).length === 0}
        >
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
          Criar lista
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
          {lists.data?.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between border rounded px-3 py-2 bg-card text-sm">
              <div>
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">{l.contact_count} contatos</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => delFn({ data: { id: l.id } }).then(() => qc.invalidateQueries({ queryKey: ["contact-lists"] }))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {lists.data?.length === 0 && <div className="text-sm text-muted-foreground col-span-full">Nenhuma lista ainda.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignsSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaigns);
  const createFn = useServerFn(createCampaign);
  const statusFn = useServerFn(setCampaignStatus);
  const delFn = useServerFn(deleteCampaign);
  const listsFn = useServerFn(listContactLists);
  const instFn = useServerFn(listInstances);

  const camps = useQuery({ queryKey: ["campaigns"], queryFn: () => listFn(), refetchInterval: 10000 });
  const lists = useQuery({ queryKey: ["contact-lists"], queryFn: () => listsFn() });
  const insts = useQuery({ queryKey: ["instances"], queryFn: () => instFn() });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [listId, setListId] = useState<string>("");
  const [instanceIds, setInstanceIds] = useState<string[]>([]);
  const [minD, setMinD] = useState(30);
  const [maxD, setMaxD] = useState(90);
  const [limit, setLimit] = useState(100);
  const [h1, setH1] = useState(8);
  const [h2, setH2] = useState(20);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video" | "document" | "">("");
  const [mediaFilename, setMediaFilename] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["campaigns"] });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name,
          message,
          list_id: listId,
          instance_ids: instanceIds,
          min_delay_seconds: minD,
          max_delay_seconds: maxD,
          per_instance_daily_limit: limit,
          active_hour_start: h1,
          active_hour_end: h2,
          media_url: mediaUrl.trim() || null,
          media_type: mediaType || null,
          media_filename: mediaFilename.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Campanha criada. Clique em Iniciar para começar a enviar.");
      setOpen(false);
      setName(""); setMessage(""); setListId(""); setInstanceIds([]);
      setMediaUrl(""); setMediaType(""); setMediaFilename("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" />Campanhas</CardTitle>
          <CardDescription>Rodam em paralelo ao aquecimento, usando os números que você escolher.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Nova campanha</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova campanha de disparo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Mensagem</Label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="w-full mt-1 rounded-md border bg-background p-2 text-sm font-mono"
                  placeholder={"Olá {primeiro_nome}, tudo bem?\n\nDá uma olhada nesse material: https://seusite.com/oferta"}
                />
                <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  Variáveis suportadas: <code className="bg-muted px-1 rounded">{"{nome}"}</code>{" "}
                  <code className="bg-muted px-1 rounded">{"{primeiro_nome}"}</code>{" "}
                  <code className="bg-muted px-1 rounded">{"{telefone}"}</code>. Links são enviados
                  como links clicáveis. Para enviar imagem, vídeo ou documento, cole a URL abaixo — a
                  mensagem vai como legenda.
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 rounded-md border bg-muted/30">
                <div className="md:col-span-2">
                  <Label>URL da mídia (opcional)</Label>
                  <Input
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://.../imagem.jpg"
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={mediaType} onValueChange={(v) => setMediaType(v as any)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">Imagem</SelectItem>
                      <SelectItem value="video">Vídeo</SelectItem>
                      <SelectItem value="document">Documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {mediaType === "document" && (
                  <div className="md:col-span-3">
                    <Label>Nome do arquivo (documento)</Label>
                    <Input
                      value={mediaFilename}
                      onChange={(e) => setMediaFilename(e.target.value)}
                      placeholder="proposta.pdf"
                    />
                  </div>
                )}
              </div>
              <div>
                <Label>Lista de contatos</Label>
                <Select value={listId} onValueChange={setListId}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma lista" /></SelectTrigger>
                  <SelectContent>
                    {lists.data?.map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>{l.name} ({l.contact_count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Números que vão disparar (marque um ou mais)</Label>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Somente números com <b>3+ dias de aquecimento</b> podem disparar.
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {insts.data?.filter((i: any) => i.is_ready).map((i: any) => {
                    const on = instanceIds.includes(i.id);
                    return (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => setInstanceIds((s) => on ? s.filter((x) => x !== i.id) : [...s, i.id])}
                        className={`text-xs px-2 py-1 rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}
                      >
                        {i.name}
                      </button>
                    );
                  })}
                  {insts.data?.filter((i: any) => i.is_ready).length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      Nenhum número pronto. Aguarde completar 3 dias de aquecimento.
                    </div>
                  )}
                </div>
                {insts.data?.some((i: any) => i.status === "connected" && !i.is_ready) && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                    {insts.data.filter((i: any) => i.status === "connected" && !i.is_ready).length} número(s) ainda aquecendo — aparecem aqui após 3 dias.
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div><Label>Delay mín (s)</Label><Input type="number" value={minD} onChange={(e) => setMinD(+e.target.value)} /></div>
                <div><Label>Delay máx (s)</Label><Input type="number" value={maxD} onChange={(e) => setMaxD(+e.target.value)} /></div>
                <div><Label>Limite/número/dia</Label><Input type="number" value={limit} onChange={(e) => setLimit(+e.target.value)} /></div>
                <div className="col-span-2 md:col-span-1">
                  <Label>Horário ativo</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" value={h1} onChange={(e) => setH1(+e.target.value)} min={0} max={23} />
                    <span>–</span>
                    <Input type="number" value={h2} onChange={(e) => setH2(+e.target.value)} min={1} max={24} />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => create.mutate()}
                disabled={!name || !message || !listId || instanceIds.length === 0 || create.isPending}
              >
                {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Criar campanha
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-3">
        {camps.data?.map((c: any) => {
          const p = c.progress;
          const pct = p.total > 0 ? Math.round(((p.sent + p.failed) / p.total) * 100) : 0;
          return (
            <div key={c.id} className="border rounded-lg p-4 bg-card">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {c.name}
                    <Badge variant={c.status === "running" ? "default" : c.status === "done" ? "secondary" : "outline"}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Lista: {c.list?.name ?? "—"} · {c.min_delay_seconds}s–{c.max_delay_seconds}s · até {c.per_instance_daily_limit}/número/dia · {c.active_hour_start}h–{c.active_hour_end}h
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.campaign_instances?.map((ci: any) => (
                      <Badge key={ci.instance_id} variant="secondary" className="text-[10px]">{ci.whatsapp_instances?.name}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {c.status !== "running" && c.status !== "done" && (
                    <Button size="sm" onClick={() => statusFn({ data: { id: c.id, status: "running" } }).then(invalidate)}>
                      <Play className="h-3 w-3 mr-1" />Iniciar
                    </Button>
                  )}
                  {c.status === "running" && (
                    <Button size="sm" variant="secondary" onClick={() => statusFn({ data: { id: c.id, status: "paused" } }).then(invalidate)}>
                      <Pause className="h-3 w-3 mr-1" />Pausar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => delFn({ data: { id: c.id } }).then(invalidate)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                  <span>{p.sent} enviadas · {p.failed} falhas · {p.pending} pendentes</span>
                  <span>{pct}%</span>
                </div>
              </div>
            </div>
          );
        })}
        {camps.data?.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">Nenhuma campanha ainda.</div>}
      </CardContent>
    </Card>
  );
}

// ============================ TEAM TAB ============================

function TeamTab() {
  const qc = useQueryClient();
  const ctxFn = useServerFn(getMyTeamContext);
  const listFn = useServerFn(listTeamMembers);
  const createFn = useServerFn(createTeamMember);
  const removeFn = useServerFn(removeTeamMember);
  const updateFn = useServerFn(updateTeamMember);
  const assignFn = useServerFn(assignInstanceToMember);
  const activityFn = useServerFn(getTeamActivity);
  const instFn = useServerFn(listInstances);

  const ctx = useQuery({ queryKey: ["team-ctx"], queryFn: () => ctxFn() });
  const team = useQuery({
    queryKey: ["team-members"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
    enabled: !!ctx.data?.is_master,
  });
  const activity = useQuery({
    queryKey: ["team-activity"],
    queryFn: () => activityFn({ data: { limit: 50 } }),
    refetchInterval: 30_000,
    enabled: !!ctx.data?.is_master,
  });
  const insts = useQuery({
    queryKey: ["instances"],
    queryFn: () => instFn(),
    enabled: !!ctx.data?.is_master,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    member_role: "operator" as "operator" | "manager",
    number_count: 0,
  });
  const [busy, setBusy] = useState(false);

  if (ctx.isLoading) {
    return (
      <div className="py-10 grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // View de MEMBRO (não master)
  if (!ctx.data?.is_master) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="h-5 w-5" /> Equipe
          </CardTitle>
          <CardDescription>
            Você faz parte da equipe de{" "}
            <b>{ctx.data?.master?.full_name || ctx.data?.master?.email || "seu gestor"}</b>. Todo o
            faturamento e o gerenciamento de números fica com o usuário master.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Seu papel:{" "}
          <Badge variant="secondary" className="ml-1">
            {ctx.data?.member_role === "manager" ? "Gerente" : "Operador"}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  const members = team.data?.members ?? [];
  const unassignedInsts = (insts.data ?? []).filter((i: any) => !i.assigned_to);

  async function submit() {
    if (!form.full_name || !form.email || form.password.length < 8) {
      toast.error("Preencha nome, e-mail e senha (mín. 8 caracteres).");
      return;
    }
    setBusy(true);
    try {
      await createFn({ data: form });
      toast.success(
        form.number_count > 0
          ? `Funcionário criado. ${form.number_count} número(s) serão cobrados na próxima fatura.`
          : "Funcionário criado.",
      );
      setOpen(false);
      setForm({ full_name: "", email: "", password: "", member_role: "operator", number_count: 0 });
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["team-activity"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5" /> Sua equipe
            </CardTitle>
            <CardDescription>
              Adicione funcionários com login próprio. Os números que você provisionar entram na sua
              próxima fatura recorrente (R$ 25,00 cada).
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Adicionar funcionário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo funcionário</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome completo</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>E-mail (login)</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Senha inicial</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="mínimo 8 caracteres"
                  />
                </div>
                <div>
                  <Label>Papel</Label>
                  <Select
                    value={form.member_role}
                    onValueChange={(v) =>
                      setForm({ ...form, member_role: v as "operator" | "manager" })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operator">Operador</SelectItem>
                      <SelectItem value="manager">Gerente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantos números para este funcionário?</Label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={form.number_count}
                    onChange={(e) =>
                      setForm({ ...form, number_count: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.number_count > 0
                      ? `+R$ ${(form.number_count * 25).toFixed(2)}/mês na próxima fatura do master.`
                      : "Nenhum número extra provisionado agora."}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar funcionário
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {team.isLoading ? (
            <div className="py-6 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhum funcionário ainda. Adicione seu primeiro para delegar números e acompanhar a
              atividade.
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((m: any) => (
                <div
                  key={m.id}
                  className="border border-border/40 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Circle
                      className={`h-3 w-3 ${
                        m.is_online ? "fill-green-500 text-green-500" : "fill-muted text-muted"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {m.full_name || m.email}{" "}
                        <Badge variant="secondary" className="ml-1 text-[10px]">
                          {m.member_role === "manager" ? "Gerente" : "Operador"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {m.email} · {m.is_online ? "online agora" : m.last_seen_at ? `visto ${new Date(m.last_seen_at).toLocaleString()}` : "nunca acessou"}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{m.instance_count} número(s)</Badge>
                    <Badge variant="outline">{m.msgs_7d} msgs / 7d</Badge>
                    {m.msgs_7d_failed > 0 && (
                      <Badge variant="destructive">{m.msgs_7d_failed} falhas</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={m.member_role}
                      onValueChange={(v) =>
                        updateFn({
                          data: { member_id: m.id, member_role: v as "operator" | "manager" },
                        }).then(() => {
                          toast.success("Papel atualizado");
                          qc.invalidateQueries({ queryKey: ["team-members"] });
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operator">Operador</SelectItem>
                        <SelectItem value="manager">Gerente</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (!confirm(`Remover ${m.full_name || m.email}? Isso apaga o login dele; os números pagos permanecem no master.`)) return;
                        removeFn({ data: { member_id: m.id } }).then(() => {
                          toast.success("Funcionário removido");
                          qc.invalidateQueries({ queryKey: ["team-members"] });
                        }).catch((e: any) => toast.error(e.message));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atribuição de números */}
      {members.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="h-4 w-4" /> Números não atribuídos
            </CardTitle>
            <CardDescription>
              Envie um número existente para um funcionário operar. Ele passará a aparecer no painel
              dele.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unassignedInsts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Todos os seus números já estão atribuídos ou você ainda não criou nenhum.
              </div>
            ) : (
              <div className="space-y-2">
                {unassignedInsts.map((i: any) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between gap-2 border border-border/40 rounded-md px-3 py-2"
                  >
                    <div className="text-sm truncate">
                      {i.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        · {i.evolution_instance}
                      </span>
                    </div>
                    <Select
                      onValueChange={(v) =>
                        assignFn({ data: { instance_id: i.id, member_id: v } }).then(() => {
                          toast.success("Número atribuído");
                          qc.invalidateQueries({ queryKey: ["instances"] });
                          qc.invalidateQueries({ queryKey: ["team-members"] });
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-[200px] text-xs">
                        <SelectValue placeholder="Atribuir a…" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.full_name || m.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Feed de atividade */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Atividade da equipe
          </CardTitle>
          <CardDescription>
            Ações administrativas dos seus funcionários (últimas 50).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activity.isLoading ? (
            <div className="py-6 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (activity.data?.logs ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              Ainda não há registros.
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {(activity.data?.logs ?? []).map((l: any) => (
                <div
                  key={l.id}
                  className="text-xs flex items-start gap-2 border-b border-border/30 py-2 last:border-0"
                >
                  <Badge variant="outline" className="mt-0.5 shrink-0">
                    {l.user_label}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      <span className="font-mono">{l.action}</span>{" "}
                      {l.entity_type && (
                        <span className="text-muted-foreground">
                          · {l.entity_type}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(l.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
