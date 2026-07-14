import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
} from "@/lib/warmup.functions";
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
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [{ title: "Painel — WarmUp Pro" }],
  }),
  component: AppPage,
});

function AppPage() {
  const navigate = useNavigate();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });

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
            <div className="relative h-8 w-8 rounded-lg gradient-ember-bg grid place-items-center glow-ember">
              <Flame className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display font-semibold tracking-tight">WarmUp Pro</span>
            <Badge variant="secondary" className="ml-2 font-mono text-[10px] uppercase tracking-wider">{planName}</Badge>
            {isAdmin && <Badge className="ml-1 gradient-ember-bg text-primary-foreground border-0 font-mono text-[10px] uppercase tracking-wider">Admin</Badge>}
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </header>
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="dashboard"><Flame className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="instances"><Smartphone className="h-4 w-4 mr-1" />Números</TabsTrigger>
            <TabsTrigger value="groups"><Users2 className="h-4 w-4 mr-1" />Grupos</TabsTrigger>
            <TabsTrigger value="templates"><MessageSquare className="h-4 w-4 mr-1" />Mensagens</TabsTrigger>
            <TabsTrigger value="logs"><ScrollText className="h-4 w-4 mr-1" />Logs</TabsTrigger>
            <TabsTrigger value="plan"><CreditCard className="h-4 w-4 mr-1" />Plano</TabsTrigger>
            {isAdmin && <TabsTrigger value="admin"><Settings className="h-4 w-4 mr-1" />Admin</TabsTrigger>}
          </TabsList>
          <TabsContent value="dashboard"><Dashboard /></TabsContent>
          <TabsContent value="instances"><InstancesTab /></TabsContent>
          <TabsContent value="groups"><GroupsTab /></TabsContent>
          <TabsContent value="templates"><TemplatesTab /></TabsContent>
          <TabsContent value="logs"><LogsTab /></TabsContent>
          <TabsContent value="plan"><PlanTab /></TabsContent>
          {isAdmin && <TabsContent value="admin"><AdminTab /></TabsContent>}
        </Tabs>
      </main>
    </div>
  );
}

function Dashboard() {
  const fn = useServerFn(getStats);
  const q = useQuery({ queryKey: ["stats"], queryFn: () => fn(), refetchInterval: 15000 });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
      <StatCard label="Números conectados" value={q.data?.instances ?? 0} icon={<Smartphone />} />
      <StatCard label="Grupos ativos" value={q.data?.activeGroups ?? 0} icon={<Users2 />} />
      <StatCard label="Mensagens hoje" value={q.data?.sentToday ?? 0} icon={<Flame />} />
    </div>
  );
}
function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
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

// ---------------- Instances ----------------
function InstancesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInstances);
  const createFn = useServerFn(createInstance);
  const refreshFn = useServerFn(refreshInstance);
  const deleteFn = useServerFn(deleteInstance);
  const q = useQuery({ queryKey: ["instances"], queryFn: () => listFn(), refetchInterval: 10000 });
  const [name, setName] = useState("");
  const [qrOpen, setQrOpen] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (n: string) => createFn({ data: { name: n } }),
    onSuccess: (row: any) => {
      toast.success("Instância criada. Escaneie o QR Code.");
      setName("");
      setQrOpen(row.id);
      qc.invalidateQueries({ queryKey: ["instances"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const refresh = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instances"] }),
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["instances"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const current = q.data?.find((i: any) => i.id === qrOpen);

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>Conectar novo número</CardTitle><CardDescription>Após criar, escaneie o QR Code com o WhatsApp do celular.</CardDescription></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input placeholder="Nome do chip (ex: Chip 1)" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button onClick={() => name && create.mutate(name)} disabled={create.isPending || !name}>
            {create.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}Criar
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {q.data?.map((i: any) => (
          <Card key={i.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{i.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{i.phone ?? "—"}</div>
                </div>
                <StatusBadge status={i.status} />
              </div>
              <div className="flex gap-1 mt-3">
                <Button size="sm" variant="secondary" onClick={() => { refresh.mutate(i.id); setQrOpen(i.id); }}>
                  <RefreshCw className="h-3 w-3 mr-1" />QR / Status
                </Button>
                <Button size="sm" variant="ghost" onClick={() => del.mutate(i.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
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
    </div>
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
function GroupsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGroups);
  const listInst = useServerFn(listInstances);
  const createFn = useServerFn(createGroup);
  const toggleFn = useServerFn(toggleGroup);
  const delFn = useServerFn(deleteGroup);
  const addMember = useServerFn(addGroupMember);
  const rmMember = useServerFn(removeGroupMember);

  const groups = useQuery({ queryKey: ["groups"], queryFn: () => listFn(), refetchInterval: 15000 });
  const insts = useQuery({ queryKey: ["instances"], queryFn: () => listInst() });

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
        <CardHeader><CardTitle>Novo grupo de aquecimento</CardTitle><CardDescription>Números do grupo conversam entre si em intervalos aleatórios.</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Intervalo mín (s)</Label><Input type="number" value={minD} onChange={(e) => setMinD(+e.target.value)} /></div>
          <div><Label>Intervalo máx (s)</Label><Input type="number" value={maxD} onChange={(e) => setMaxD(+e.target.value)} /></div>
          <div><Label>Limite/dia</Label><Input type="number" value={dl} onChange={(e) => setDl(+e.target.value)} /></div>
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
                    {g.min_delay_seconds}s–{g.max_delay_seconds}s · até {g.daily_limit} msgs/dia
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
                />
              </div>
            </CardContent>
          </Card>
        ))}
        {groups.data?.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">Nenhum grupo criado.</div>}
      </div>
    </div>
  );
}

function AddMemberSelect({ groupId, used, instances, onAdd }: { groupId: string; used: Set<string>; instances: any[]; onAdd: (id: string) => void }) {
  const available = instances.filter((i) => !used.has(i.id));
  if (!available.length) return null;
  return (
    <Select onValueChange={(v) => onAdd(v)}>
      <SelectTrigger className="w-auto h-7 text-xs"><SelectValue placeholder="+ Adicionar número" /></SelectTrigger>
      <SelectContent>
        {available.map((i) => (<SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>))}
      </SelectContent>
    </Select>
  );
}

// ---------------- Templates ----------------
function TemplatesTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const addFn = useServerFn(addTemplate);
  const delFn = useServerFn(deleteTemplate);
  const q = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: () => addFn({ data: { content: text } }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["templates"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>Mensagens do aquecimento</CardTitle><CardDescription>Mensagens curtas e naturais funcionam melhor. Emojis são incentivados.</CardDescription></CardHeader>
        <CardContent className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex: Oi, tudo bem?" />
          <Button onClick={() => text && add.mutate()} disabled={!text}><Plus className="h-4 w-4" /></Button>
        </CardContent>
      </Card>
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
    </div>
  );
}

// ---------------- Logs ----------------
function LogsTab() {
  const fn = useServerFn(listLogs);
  const q = useQuery({ queryKey: ["logs"], queryFn: () => fn(), refetchInterval: 10000 });
  return (
    <div className="mt-4">
      <Card>
        <CardContent className="p-0">
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {q.data?.map((l: any) => (
              <div key={l.id} className="p-3 text-sm flex items-center justify-between">
                <div>
                  <div><span className="font-medium">{l.from_instance?.name ?? "?"}</span> → <span className="font-medium">{l.to_instance?.name ?? "?"}</span>: <span className="text-muted-foreground">{l.content}</span></div>
                  <div className="text-xs text-muted-foreground mt-0.5">{new Date(l.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <Badge variant={l.status === "sent" ? "secondary" : "destructive"} className="text-xs">{l.status}</Badge>
              </div>
            ))}
            {q.data?.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma mensagem enviada ainda.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Plan ----------------
function PlanTab() {
  const fn = useServerFn(listPlans);
  const meFn = useServerFn(getMe);
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => fn() });
  const me = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const currentId = (me.data?.subscription as any)?.plan?.id;
  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {plans.data?.map((p: any) => (
        <Card key={p.id} className={currentId === p.id ? "border-primary" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">{p.name}{currentId === p.id && <Badge>Atual</Badge>}</CardTitle>
            <CardDescription>{p.price_cents === 0 ? "Grátis" : `R$ ${(p.price_cents / 100).toFixed(2)}/mês`}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>✓ {p.max_instances} número(s)</div>
            <div>✓ {p.max_messages_per_day} mensagens/dia</div>
            <Button className="w-full mt-3" disabled variant={currentId === p.id ? "secondary" : "default"}>
              {currentId === p.id ? "Plano atual" : "Em breve"}
            </Button>
          </CardContent>
        </Card>
      ))}
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

  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => usersFn() });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => plansFn() });
  const cfg = useQuery({ queryKey: ["evo-cfg"], queryFn: () => getCfgFn() });

  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const saveCfg = useMutation({
    mutationFn: () => setCfgFn({ data: { api_url: url, api_key: key } }),
    onSuccess: () => { toast.success("Config salva"); qc.invalidateQueries({ queryKey: ["evo-cfg"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mt-4 space-y-6">
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
        <CardHeader><CardTitle>Clientes</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y">
            {users.data?.map((u: any) => {
              const currentPlanName = u.subscriptions?.[0]?.plan?.name ?? "—";
              return (
                <div key={u.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{u.email}</div>
                    <div className="text-xs text-muted-foreground">Plano: {currentPlanName}</div>
                  </div>
                  <Select onValueChange={(v) => updatePlanFn({ data: { user_id: u.id, plan_id: v } }).then(() => { toast.success("Plano atualizado"); qc.invalidateQueries({ queryKey: ["admin-users"] }); })}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Alterar plano" /></SelectTrigger>
                    <SelectContent>{plans.data?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
