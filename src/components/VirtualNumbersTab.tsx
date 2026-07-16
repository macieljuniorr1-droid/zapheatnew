import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getMyWallet,
  topupWalletPix,
  listVirtualNumberCountries,
  listMyVirtualNumbers,
  purchaseVirtualNumber,
  pollVirtualNumber,
  cancelVirtualNumber,
  finishVirtualNumber,
} from "@/lib/virtual-numbers.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Wallet,
  Plus,
  Loader2,
  Phone,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  QrCode,
  RefreshCw,
  Zap,
} from "lucide-react";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TOPUP_PRESETS = [2000, 5000, 10000, 20000];

export function VirtualNumbersTab() {
  const qc = useQueryClient();
  const fetchWallet = useServerFn(getMyWallet);
  const fetchCountries = useServerFn(listVirtualNumberCountries);
  const fetchOrders = useServerFn(listMyVirtualNumbers);
  const topupFn = useServerFn(topupWalletPix);
  const buyFn = useServerFn(purchaseVirtualNumber);
  const pollFn = useServerFn(pollVirtualNumber);
  const cancelFn = useServerFn(cancelVirtualNumber);
  const finishFn = useServerFn(finishVirtualNumber);

  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => fetchWallet() });
  const countries = useQuery({
    queryKey: ["vn-countries"],
    queryFn: () => fetchCountries(),
    staleTime: 60_000,
  });
  const orders = useQuery({
    queryKey: ["vn-orders"],
    queryFn: () => fetchOrders(),
    refetchInterval: (q) => {
      const list = q.state.data as any[] | undefined;
      const hasWaiting = list?.some((o) => o.status === "waiting");
      return hasWaiting ? 5000 : false;
    },
  });

  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState(5000);
  const [pixData, setPixData] = useState<any>(null);
  const [buyingCountry, setBuyingCountry] = useState<string | null>(null);

  const topupMut = useMutation({
    mutationFn: (amount_cents: number) => topupFn({ data: { amount_cents } }),
    onSuccess: (data) => {
      setPixData(data);
      toast.success("Pix gerado! Escaneie o QR code para adicionar saldo.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar recarga."),
  });

  const buyMut = useMutation({
    mutationFn: (country_code: string) => buyFn({ data: { country_code } }),
    onSuccess: (data) => {
      toast.success(`Número gerado: ${data.phone_number}`);
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["vn-orders"] });
      setBuyingCountry(null);
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Falha ao comprar número.");
      setBuyingCountry(null);
    },
  });

  const cancelMut = useMutation({
    mutationFn: (order_id: string) => cancelFn({ data: { order_id } }),
    onSuccess: () => {
      toast.success("Pedido cancelado. Saldo reembolsado.");
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["vn-orders"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao cancelar."),
  });

  const finishMut = useMutation({
    mutationFn: (order_id: string) => finishFn({ data: { order_id } }),
    onSuccess: () => {
      toast.success("Pedido finalizado.");
      qc.invalidateQueries({ queryKey: ["vn-orders"] });
    },
  });

  // Polling manual quando webhook detecta wallet_topup (Pix pago) — invalida wallet
  useEffect(() => {
    if (!pixData) return;
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["wallet"] });
    }, 5000);
    return () => clearInterval(interval);
  }, [pixData, qc]);

  const balance = wallet.data?.balance_cents ?? 0;

  return (
    <div className="space-y-6">
      {/* ============================= CARTEIRA ============================= */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Carteira ZapHeat
            </CardTitle>
            <CardDescription>Saldo pré-pago para comprar números virtuais.</CardDescription>
          </div>
          <Button onClick={() => setTopupOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar saldo
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold tabular-nums">
            {wallet.isLoading ? <Loader2 className="h-8 w-8 animate-spin" /> : brl(balance)}
          </div>
        </CardContent>
      </Card>

      {/* ============================= COMPRAR ============================= */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" /> Comprar número WhatsApp descartável
          </CardTitle>
          <CardDescription>
            Números para receber SMS de verificação do WhatsApp. Uso único —
            após confirmar a conta, finalize o pedido. Se não receber o código em
            20 minutos, o saldo é reembolsado automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {countries.data?.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm mb-4">
              {countries.data.error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {countries.data?.countries?.map((c) => {
              const disabled = c.available <= 0 || balance < c.price_cents;
              return (
                <div
                  key={c.code}
                  className={`border rounded-lg p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition ${
                    c.code === "73" ? "border-primary/50 bg-primary/5" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2">
                      <span className="text-xl">{c.flag}</span>
                      <span className="truncate">{c.label}</span>
                    </div>
                    {c.code === "73" && (
                      <Badge variant="default" className="mt-1 text-[10px]">
                        Exclusivo WhatsApp
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {c.available > 0 ? (
                        <>Disponível: <span className="text-foreground">{c.available}</span></>
                      ) : (
                        <span className="text-destructive">Esgotado</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{brl(c.price_cents)}</div>
                    <Button
                      size="sm"
                      className="mt-1"
                      disabled={disabled || buyMut.isPending}
                      onClick={() => {
                        setBuyingCountry(c.code);
                        buyMut.mutate(c.code);
                      }}
                    >
                      {buyingCountry === c.code && buyMut.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : balance < c.price_cents ? (
                        "Sem saldo"
                      ) : (
                        <>
                          <Zap className="h-3 w-3 mr-1" /> Comprar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
            {!countries.isLoading && (countries.data?.countries?.length ?? 0) === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-8 text-sm">
                {countries.isLoading ? "Carregando países..." : "Nenhum país disponível no momento."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ============================= MEUS PEDIDOS ============================= */}
      <Card>
        <CardHeader>
          <CardTitle>Meus números</CardTitle>
          <CardDescription>Pedidos recentes. Aguardando código, atualizamos a cada 5s.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (orders.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Nenhum número comprado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {orders.data!.map((o: any) => (
                <VirtualNumberOrderRow
                  key={o.id}
                  order={o}
                  onPoll={() => pollFn({ data: { order_id: o.id } }).then(() => qc.invalidateQueries({ queryKey: ["vn-orders"] }))}
                  onCancel={() => cancelMut.mutate(o.id)}
                  onFinish={() => finishMut.mutate(o.id)}
                  isCanceling={cancelMut.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================= EXTRATO ============================= */}
      <Card>
        <CardHeader>
          <CardTitle>Extrato da carteira</CardTitle>
        </CardHeader>
        <CardContent>
          {(wallet.data?.transactions?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Sem movimentações.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {wallet.data!.transactions.map((tx: any) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between border-b last:border-0 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate">{tx.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-semibold tabular-nums ${
                        tx.amount_cents >= 0 ? "text-green-500" : "text-destructive"
                      }`}
                    >
                      {tx.amount_cents >= 0 ? "+" : ""}
                      {brl(tx.amount_cents)}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {brl(tx.balance_after_cents)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================= DIALOG RECARGA ============================= */}
      <Dialog
        open={topupOpen}
        onOpenChange={(o) => {
          setTopupOpen(o);
          if (!o) setPixData(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar saldo</DialogTitle>
          </DialogHeader>

          {!pixData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {TOPUP_PRESETS.map((v) => (
                  <Button
                    key={v}
                    variant={topupAmount === v ? "default" : "outline"}
                    onClick={() => setTopupAmount(v)}
                  >
                    {brl(v)}
                  </Button>
                ))}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Valor customizado (mínimo R$ 10)</label>
                <Input
                  type="number"
                  min={10}
                  step={5}
                  value={topupAmount / 100}
                  onChange={(e) => setTopupAmount(Math.round(Number(e.target.value) * 100))}
                />
              </div>
              <Button
                className="w-full"
                disabled={topupAmount < 1000 || topupMut.isPending}
                onClick={() => topupMut.mutate(topupAmount)}
              >
                {topupMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <QrCode className="h-4 w-4 mr-2" /> Gerar Pix de {brl(topupAmount)}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <div className="text-sm text-muted-foreground">
                Escaneie ou copie o código Pix. O saldo é creditado assim que confirmarmos o pagamento.
              </div>
              {pixData.qr_code_url && (
                <img
                  src={pixData.qr_code_url}
                  alt="QR Code Pix"
                  className="mx-auto w-56 h-56 bg-white p-2 rounded"
                />
              )}
              {pixData.qr_code && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Pix copia e cola</div>
                  <div className="flex gap-2">
                    <Input readOnly value={pixData.qr_code} className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(pixData.qr_code);
                        toast.success("Copiado!");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Valor: <span className="font-semibold">{brl(pixData.amount_cents)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTopupOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VirtualNumberOrderRow({
  order,
  onPoll,
  onCancel,
  onFinish,
  isCanceling,
}: {
  order: any;
  onPoll: () => void;
  onCancel: () => void;
  onFinish: () => void;
  isCanceling: boolean;
}) {
  const statusMeta: Record<string, { label: string; variant: any; icon: any }> = {
    waiting: { label: "Aguardando SMS", variant: "secondary", icon: Clock },
    received: { label: "Código recebido", variant: "default", icon: CheckCircle2 },
    done: { label: "Finalizado", variant: "outline", icon: CheckCircle2 },
    canceled: { label: "Cancelado", variant: "outline", icon: XCircle },
    refunded: { label: "Reembolsado", variant: "outline", icon: XCircle },
    expired: { label: "Expirado / reembolsado", variant: "outline", icon: XCircle },
    error: { label: "Erro", variant: "destructive", icon: XCircle },
  };
  const meta = statusMeta[order.status] ?? statusMeta.error;
  const Icon = meta.icon;

  return (
    <div className="border rounded-lg p-3 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium flex items-center gap-2">
          <span>{order.country_label}</span>
          <span className="text-muted-foreground font-mono">{order.phone_number ?? "—"}</span>
          {order.phone_number && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                navigator.clipboard.writeText(order.phone_number);
                toast.success("Número copiado");
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
        </div>
        {order.sms_code && (
          <div className="mt-1 text-lg font-mono font-bold text-green-500 flex items-center gap-2">
            {order.sms_code}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                navigator.clipboard.writeText(order.sms_code);
                toast.success("Código copiado");
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        )}
        {order.full_sms && (
          <div className="text-xs text-muted-foreground mt-1 italic">"{order.full_sms}"</div>
        )}
        <div className="text-xs text-muted-foreground mt-1">
          {new Date(order.created_at).toLocaleString("pt-BR")}
        </div>
      </div>
      <div className="text-right space-y-1">
        <Badge variant={meta.variant}>
          <Icon className="h-3 w-3 mr-1" />
          {meta.label}
        </Badge>
        <div className="text-xs text-muted-foreground tabular-nums">{brl(order.price_cents)}</div>
        <div className="flex gap-1 justify-end">
          {order.status === "waiting" && (
            <>
              <Button variant="outline" size="sm" onClick={onPoll}>
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={isCanceling}
              >
                Cancelar
              </Button>
            </>
          )}
          {order.status === "received" && (
            <Button size="sm" onClick={onFinish}>
              Finalizar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
