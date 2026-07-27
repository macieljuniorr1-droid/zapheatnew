import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listWaGroups,
  createWaGroup,
  importWaGroups,
  addWaGroupParticipants,
  setWaGroupSenders,
  updateWaGroup,
  toggleWaGroup,
  deleteWaGroup,
  getWaGroupInvite,
  listWaGroupLogs,
  listWaGroupParticipants,
  syncWaGroupParticipants,
  removeWaGroupParticipant,
  listWaStickers,
  addWaStickers,
  deleteWaSticker,
} from "@/lib/wa-groups.functions";
import { listInstances, listAiModels } from "@/lib/warmup.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users2, Plus, Loader2, Trash2, Link2, RefreshCw, Bot, Clock, Send, AlertTriangle, UserPlus, Radio,
  Smile, Eye, ShieldCheck, LogOut,
} from "lucide-react";


const fmtInterval = (s: number) => (s >= 3600 ? `${Math.round(s / 360) / 10}h` : s >= 60 ? `${Math.round(s / 60)}min` : `${s}s`);

export function WaGroupsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWaGroups);
  const instFn = useServerFn(listInstances);
  const modelsFn = useServerFn(listAiModels);
  const importFn = useServerFn(importWaGroups);
  const logsFn = useServerFn(listWaGroupLogs);

  const groups = useQuery({ queryKey: ["wa-groups"], queryFn: () => listFn(), refetchInterval: 15000 });
  const insts = useQuery({ queryKey: ["wa-group-instances"], queryFn: () => instFn(), refetchInterval: 20000 });
  const models = useQuery({ queryKey: ["ai-models"], queryFn: () => modelsFn(), staleTime: 60 * 60 * 1000 });
  const logs = useQuery({ queryKey: ["wa-group-logs"], queryFn: () => logsFn({ data: {} }), refetchInterval: 8000 });

  const [importInstance, setImportInstance] = useState<string>("");
  const importMut = useMutation({
    mutationFn: (instanceId: string) => importFn({ data: { instanceId } }),
    onSuccess: (r: any) => {
      toast.success(`${r.imported} grupo(s) importado(s)`);
      qc.invalidateQueries({ queryKey: ["wa-groups"] });
    },
    onError: (e: any) => toast.error(String(e.message ?? e)),
  });

  const list = (groups.data as any[]) ?? [];
  const connected = ((insts.data as any[]) ?? []).filter((i) => i.status === "connected");
  const activeCount = list.filter((g) => g.active).length;
  const todayTotal = list.reduce((a, g) => a + (g.msgs_today ?? 0), 0);
  const participants = list.reduce((a, g) => a + (g.participant_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Users2 className="h-4 w-4" />} label="Grupos" value={String(list.length)} hint={`${activeCount} com automação ligada`} />
        <Kpi icon={<Send className="h-4 w-4" />} label="Mensagens hoje" value={String(todayTotal)} hint="enviadas pelo motor nos grupos" />
        <Kpi icon={<UserPlus className="h-4 w-4" />} label="Participantes" value={String(participants)} hint="somando todos os grupos" />
        <Kpi icon={<Radio className="h-4 w-4" />} label="Números disponíveis" value={String(connected.length)} hint="conectados para revezar envio" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <NewGroupDialog instances={connected} models={(models.data as any[]) ?? []} />
        <div className="flex items-center gap-2">
          <Select value={importInstance} onValueChange={setImportInstance}>
            <SelectTrigger className="w-[210px]"><SelectValue placeholder="Importar grupos de..." /></SelectTrigger>
            <SelectContent>
              {connected.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!importInstance || importMut.isPending} onClick={() => importMut.mutate(importInstance)}>
            {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Importar</span>
          </Button>
        </div>
      </div>

      {groups.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : list.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum grupo ainda. Crie um grupo do WhatsApp com seus contatos e ligue a automação 24h.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((g) => (
            <GroupCard key={g.id} group={g} instances={connected} models={(models.data as any[]) ?? []} />
          ))}
        </div>
      )}

      <StickerLibrary />


      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" />Últimas mensagens do motor nos grupos</CardTitle>
          <CardDescription>Atualiza automaticamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[380px] overflow-auto">
          {((logs.data as any[]) ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
          )}
          {((logs.data as any[]) ?? []).map((l) => (
            <div key={l.id} className={`rounded-lg border p-2 text-sm ${l.status === "failed" ? "border-red-500/50 bg-red-500/5" : "border-border"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{l.wa_groups?.subject ?? "grupo"}</Badge>
                <span>{l.whatsapp_instances?.name ?? "número"}</span>
                <span>{new Date(l.created_at).toLocaleString("pt-BR")}</span>
              </div>
              <p className="mt-1 break-words">{l.content}</p>
              {l.status === "failed" && (
                <p className="mt-1 flex items-start gap-1 text-xs text-red-500">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{l.error}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function NewGroupDialog({ instances, models }: { instances: any[]; models: any[] }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createWaGroup);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [theme, setTheme] = useState("");
  const [owner, setOwner] = useState("");
  const [senders, setSenders] = useState<string[]>([]);
  const [numbers, setNumbers] = useState("");
  const [minI, setMinI] = useState("10");
  const [maxI, setMaxI] = useState("20");
  const [hStart, setHStart] = useState("0");
  const [hEnd, setHEnd] = useState("24");
  const [unlimited, setUnlimited] = useState(true);
  const [limit, setLimit] = useState("500");
  const [model, setModel] = useState<string>("");
  const [stickerChance, setStickerChance] = useState("15");
  const [count, setCount] = useState("1");
  const [activate, setActivate] = useState(true);

  const num = (v: string, fallback: number, min: number, max: number) => {
    const n = Number(String(v).replace(",", "."));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  const minSec = num(minI, 10, 10, 86400);
  const maxSec = Math.max(minSec, num(maxI, 20, 10, 86400));
  const dailyLimit = unlimited ? UNLIMITED_DAILY : num(limit, 500, 1, UNLIMITED_DAILY);
  const groupCount = num(count, 1, 1, 20);

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          ownerInstanceId: owner,
          subject,
          description: description || null,
          theme: theme || null,
          ai_model: model || null,
          participants: numbers.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean),
          senderInstanceIds: senders,
          min_interval_seconds: minSec,
          max_interval_seconds: maxSec,
          active_hour_start: num(hStart, 0, 0, 23),
          active_hour_end: num(hEnd, 24, 1, 24),
          daily_limit: dailyLimit,
          sticker_chance: num(stickerChance, 0, 0, 100),
          count: groupCount,
          activate,
        },
      }),

    onSuccess: (r: any) => {
      toast.success(`${r?.created ?? 1} grupo(s) criado(s) no WhatsApp!`);
      if (r?.errors?.length) toast.error(String(r.errors[0]));
      setOpen(false);
      setSubject(""); setDescription(""); setNumbers(""); setSenders([]); setCount("1");
      qc.invalidateQueries({ queryKey: ["wa-groups"] });
    },
    onError: (e: any) => toast.error(String(e.message ?? e)),
  });


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />Criar grupo no WhatsApp</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Novo grupo de WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Número que cria o grupo (vira admin)</Label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger><SelectValue placeholder="Escolha um número conectado" /></SelectTrigger>
              <SelectContent>
                {instances.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} {i.phone ? `(${i.phone})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Nome do grupo</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex: Turma do churrasco" /></div>
          <div><Label>Descrição (opcional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div>
            <Label>Participantes (um número por linha, com DDD)</Label>
            <Textarea rows={4} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder={"11999999999\n21988888888"} />
          </div>
          <div>
            <Label>Outros números seus que também vão conversar no grupo</Label>
            <div className="mt-1 grid gap-1 max-h-32 overflow-auto rounded-md border p-2">
              {instances.filter((i) => i.id !== owner).map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={senders.includes(i.id)}
                    onChange={(e) => setSenders((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((x) => x !== i.id)))}
                  />
                  {i.name} {i.phone ? `(${i.phone})` : ""}
                </label>
              ))}
              {instances.filter((i) => i.id !== owner).length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum outro número conectado.</p>
              )}
            </div>
          </div>
          <div><Label>Assunto/vibe das mensagens da IA</Label><Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Ex: papo de futebol e zoeira do dia a dia" /></div>
          <div>
            <Label>Modelo de IA</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue placeholder="Padrão" /></SelectTrigger>
              <SelectContent>
                {models.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Intervalo mín. (seg)</Label><Input type="number" value={minI} onChange={(e) => setMinI(e.target.value)} /></div>
            <div><Label>Intervalo máx. (seg)</Label><Input type="number" value={maxI} onChange={(e) => setMaxI(e.target.value)} /></div>
            <div><Label>Hora início</Label><Input type="number" min={0} max={23} value={hStart} onChange={(e) => setHStart(e.target.value)} /></div>
            <div><Label>Hora fim</Label><Input type="number" min={1} max={24} value={hEnd} onChange={(e) => setHEnd(e.target.value)} /></div>
            <div><Label>Limite de mensagens por dia</Label><Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
            <div><Label>Chance de figurinha (%)</Label><Input type="number" min={0} max={100} value={stickerChance} onChange={(e) => setStickerChance(e.target.value)} /></div>
            <div className="col-span-2">
              <Label>Quantos grupos criar agora</Label>
              <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                Ex.: 10 cria "{subject || "Grupo"} 1" até "{subject || "Grupo"} 10", todos com os mesmos participantes e a mesma automação.
              </p>
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
              Já ligar a automação 24h assim que criar
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Deixe 0h → 24h para o grupo rodar 24 horas por dia. Intervalos maiores parecem mais humanos e reduzem risco de bloqueio.
          </p>
        </div>
        <DialogFooter>
          <Button disabled={!owner || !subject || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {groupCount > 1 ? `Criar ${groupCount} grupos` : "Criar grupo"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

function GroupCard({ group, instances, models }: { group: any; instances: any[]; models: any[] }) {
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleWaGroup);
  const updateFn = useServerFn(updateWaGroup);
  const delFn = useServerFn(deleteWaGroup);
  const inviteFn = useServerFn(getWaGroupInvite);
  const addFn = useServerFn(addWaGroupParticipants);
  const sendersFn = useServerFn(setWaGroupSenders);
  const [addOpen, setAddOpen] = useState(false);
  const [newNumbers, setNewNumbers] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wa-groups"] });
  const wrap = (p: Promise<any>, msg: string) =>
    p.then(() => { toast.success(msg); invalidate(); }).catch((e) => toast.error(String(e.message ?? e)));

  const failed = group.last_log?.status === "failed";

  return (
    <Card className={failed ? "border-red-500/60 bg-red-500/5" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{group.subject}</CardTitle>
            <CardDescription className="truncate">{group.participant_count} participantes · {group.msgs_today} msgs hoje · {group.msgs_total} no total</CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{group.active ? "Ativo" : "Pausado"}</span>
            <Switch checked={!!group.active} onCheckedChange={(v) => wrap(toggleFn({ data: { groupId: group.id, active: v } }), v ? "Automação ligada" : "Automação pausada")} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed && (
          <p className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-500">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{group.last_log?.error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{fmtInterval(group.min_interval_seconds)}–{fmtInterval(group.max_interval_seconds)}</Badge>
          <Badge variant="outline">{group.active_hour_start}h–{group.active_hour_end}h</Badge>
          <Badge variant="outline">até {group.daily_limit}/dia</Badge>
          <Badge variant="outline">{group.sender_instance_ids?.length ?? 0} remetentes</Badge>
          <Badge variant="outline"><Smile className="h-3 w-3 mr-1" />{group.sticker_chance ?? 0}% figurinha</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Modelo de IA</Label>
            <Select value={group.ai_model ?? ""} onValueChange={(v) => wrap(updateFn({ data: { groupId: group.id, patch: { ai_model: v } } }), "Modelo atualizado")}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Padrão" /></SelectTrigger>
              <SelectContent>
                {models.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Chance de figurinha (%)</Label>
            <Input
              className="h-8"
              type="number"
              min={0}
              max={100}
              defaultValue={group.sticker_chance ?? 0}
              onBlur={(e) =>
                wrap(
                  updateFn({ data: { groupId: group.id, patch: { sticker_chance: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } } }),
                  "Figurinhas atualizadas",
                )
              }
            />
          </div>
        </div>


        <div>
          <Label className="text-xs">Números que conversam no grupo</Label>
          <div className="mt-1 grid gap-1 max-h-28 overflow-auto rounded-md border p-2">
            {instances.map((i) => {
              const checked = (group.sender_instance_ids ?? []).includes(i.id);
              return (
                <label key={i.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...(group.sender_instance_ids ?? []), i.id]
                        : (group.sender_instance_ids ?? []).filter((x: string) => x !== i.id);
                      wrap(sendersFn({ data: { groupId: group.id, instanceIds: next } }), "Remetentes atualizados");
                    }}
                  />
                  {i.name}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ParticipantsDialog group={group} />

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><UserPlus className="h-4 w-4 mr-1" />Adicionar pessoas</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adicionar participantes</DialogTitle></DialogHeader>
              <Textarea rows={5} value={newNumbers} onChange={(e) => setNewNumbers(e.target.value)} placeholder={"11999999999\n21988888888"} />
              <DialogFooter>
                <Button
                  onClick={() =>
                    wrap(
                      addFn({ data: { groupId: group.id, participants: newNumbers.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) } }),
                      "Participantes adicionados",
                    ).then(() => { setNewNumbers(""); setAddOpen(false); })
                  }
                >Adicionar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button size="sm" variant="outline" onClick={async () => {
            try {
              const r: any = await inviteFn({ data: { groupId: group.id } });
              if (r?.url) { await navigator.clipboard.writeText(r.url); toast.success("Link de convite copiado"); }
              else toast.error("Não foi possível obter o link");
            } catch (e: any) { toast.error(String(e.message ?? e)); }
          }}><Link2 className="h-4 w-4 mr-1" />Link do grupo</Button>

          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => {
            if (confirm("Remover este grupo da plataforma? (o grupo continua no WhatsApp)")) {
              wrap(delFn({ data: { groupId: group.id, leave: false } }), "Grupo removido");
            }
          }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StickerLibrary() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWaStickers);
  const addFn = useServerFn(addWaStickers);
  const delFn = useServerFn(deleteWaSticker);
  const [urls, setUrls] = useState("");

  const stickers = useQuery({ queryKey: ["wa-stickers"], queryFn: () => listFn(), staleTime: 30000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["wa-stickers"] });

  const addMut = useMutation({
    mutationFn: () =>
      addFn({ data: { urls: urls.split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: (r: any) => { toast.success(`${r.added} figurinha(s) adicionada(s)`); setUrls(""); invalidate(); },
    onError: (e: any) => toast.error(String(e.message ?? e)),
  });

  const list = (stickers.data as any[]) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Smile className="h-4 w-4" />Figurinhas do motor</CardTitle>
        <CardDescription>
          Cole os links das figurinhas (.webp, .png ou .jpg). O motor sorteia uma delas de acordo com a
          chance de figurinha configurada em cada grupo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={3}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder={"https://site.com/figurinha1.webp\nhttps://site.com/figurinha2.webp"}
        />
        <Button size="sm" disabled={!urls.trim() || addMut.isPending} onClick={() => addMut.mutate()}>
          {addMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Adicionar figurinhas
        </Button>

        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma figurinha ainda — o motor vai enviar só texto.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {list.map((s: any) => (
              <div key={s.id} className="relative h-16 w-16 rounded-md border bg-muted/30 p-1">
                <img src={s.url} alt={s.label ?? "figurinha"} className="h-full w-full object-contain" />
                <button
                  className="absolute -right-2 -top-2 rounded-full bg-background border p-0.5 text-red-500"
                  onClick={() =>
                    delFn({ data: { id: s.id } })
                      .then(() => { toast.success("Figurinha removida"); invalidate(); })
                      .catch((e: any) => toast.error(String(e.message ?? e)))
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ParticipantsDialog({ group }: { group: any }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWaGroupParticipants);
  const syncFn = useServerFn(syncWaGroupParticipants);
  const removeFn = useServerFn(removeWaGroupParticipant);
  const [open, setOpen] = useState(false);

  const people = useQuery({
    queryKey: ["wa-group-participants", group.id],
    queryFn: () => listFn({ data: { groupId: group.id } }),
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn({ data: { groupId: group.id } }),
    onSuccess: (r: any) => {
      toast.success(`${r.synced} participantes · ${r.joined} novos · ${r.left} saíram`);
      people.refetch();
      qc.invalidateQueries({ queryKey: ["wa-groups"] });
    },
    onError: (e: any) => toast.error(String(e.message ?? e)),
  });

  const list = (people.data as any[]) ?? [];
  const inside = list.filter((p) => p.present);
  const gone = list.filter((p) => !p.present);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Eye className="h-4 w-4 mr-1" />Ver pessoas</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Pessoas em {group.subject}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {inside.length} no grupo · {gone.length} saíram
            {group.participants_synced_at && ` · atualizado ${new Date(group.participants_synced_at).toLocaleString("pt-BR")}`}
          </p>
          <Button size="sm" variant="outline" disabled={syncMut.isPending} onClick={() => syncMut.mutate()}>
            {syncMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Atualizar</span>
          </Button>
        </div>

        {people.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ainda não li os participantes deste grupo. Clique em Atualizar.
          </p>
        ) : (
          <div className="space-y-1">
            {inside.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{p.name ?? p.phone ?? p.jid}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.phone ?? p.jid}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.is_mine && <Badge variant="secondary" className="text-[10px]">meu número</Badge>}
                  {p.is_admin && <Badge variant="outline" className="text-[10px]"><ShieldCheck className="h-3 w-3 mr-1" />admin</Badge>}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-500"
                    onClick={() => {
                      if (!confirm(`Remover ${p.name ?? p.phone} do grupo?`)) return;
                      removeFn({ data: { groupId: group.id, jid: p.jid } })
                        .then(() => { toast.success("Removido do grupo"); people.refetch(); })
                        .catch((e: any) => toast.error(String(e.message ?? e)));
                    }}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {gone.length > 0 && (
              <>
                <p className="pt-2 text-xs font-medium text-muted-foreground">Saíram do grupo</p>
                {gone.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-dashed p-2 text-sm opacity-60">
                    <span className="truncate">{p.name ?? p.phone ?? p.jid}</span>
                    <span className="text-xs shrink-0">{p.left_at ? new Date(p.left_at).toLocaleDateString("pt-BR") : ""}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
