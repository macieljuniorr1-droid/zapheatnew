import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { claimLeads, getAvailability } from "@/lib/leads.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Download, Phone } from "lucide-react";

export function SellerPanel() {
  const qc = useQueryClient();
  const fetchAvail = useServerFn(getAvailability);
  const claim = useServerFn(claimLeads);

  const [ddd, setDdd] = useState("");
  const [quantity, setQuantity] = useState<number>(50);

  const avail = useQuery({
    queryKey: ["availability"],
    queryFn: () => fetchAvail(),
  });

  const mutation = useMutation({
    mutationFn: (input: { ddd: string; quantity: number }) => claim({ data: input }),
    onSuccess: (res) => {
      if (res.count === 0) {
        toast.error("Nenhum lead disponível para esse DDD.");
        return;
      }
      const blob = new Blob([res.txt], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `leads-ddd${ddd}-${res.count}-${stamp}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${res.count} lead(s) baixados.`);
      qc.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{2}$/.test(ddd)) return toast.error("Informe um DDD com 2 dígitos.");
    if (!quantity || quantity < 1) return toast.error("Quantidade inválida.");
    mutation.mutate({ ddd, quantity });
  }

  const availableForDdd = (avail.data ?? []).find((a) => a.ddd === ddd)?.available ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" /> Baixar leads
          </CardTitle>
          <CardDescription>
            Digite o DDD e a quantidade de contatos. Os leads baixados são marcados como usados e
            não aparecem para outros vendedores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label>DDD</Label>
              <Input
                inputMode="numeric"
                maxLength={2}
                placeholder="Ex: 11"
                value={ddd}
                onChange={(e) => setDdd(e.target.value.replace(/\D/g, "").slice(0, 2))}
                required
              />
              {ddd.length === 2 && (
                <p className="text-xs text-muted-foreground">
                  {availableForDdd.toLocaleString("pt-BR")} disponível(is)
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Baixar .txt
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" /> Disponibilidade por DDD
          </CardTitle>
          <CardDescription>Quantos leads ainda estão livres em cada DDD.</CardDescription>
        </CardHeader>
        <CardContent>
          {avail.isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline" />
            </div>
          ) : (avail.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lead disponível no momento.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DDD</TableHead>
                    <TableHead className="text-right">Disponíveis</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(avail.data ?? []).map((row) => (
                    <TableRow key={row.ddd}>
                      <TableCell className="font-medium">{row.ddd}</TableCell>
                      <TableCell className="text-right">
                        {Number(row.available).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDdd(row.ddd)}
                          disabled={!/^\d{2}$/.test(row.ddd)}
                        >
                          Usar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
