import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uploadLeads, getLeadStats } from "@/lib/leads.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Upload, Database, CheckCircle2 } from "lucide-react";

export function AdminPanel() {
  const qc = useQueryClient();
  const fetchStats = useServerFn(getLeadStats);
  const upload = useServerFn(uploadLeads);
  const [file, setFile] = useState<File | null>(null);

  const stats = useQuery({
    queryKey: ["lead-stats"],
    queryFn: () => fetchStats(),
  });

  const mutation = useMutation({
    mutationFn: async (content: string) => upload({ data: { content } }),
    onSuccess: (res) => {
      toast.success(
        `${res.inserted} lead(s) importados. ${res.withoutPhone} sem telefone detectado.`,
      );
      setFile(null);
      qc.invalidateQueries({ queryKey: ["lead-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleUpload() {
    if (!file) return toast.error("Selecione um arquivo TXT.");
    const content = await file.text();
    mutation.mutate(content);
  }

  const totals = (stats.data ?? []).reduce(
    (acc, s) => ({
      available: acc.available + Number(s.available),
      used: acc.used + Number(s.used),
      total: acc.total + Number(s.total),
    }),
    { available: 0, used: 0, total: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={<Database />} label="Total de leads" value={totals.total} />
        <StatCard icon={<Database />} label="Disponíveis" value={totals.available} highlight />
        <StatCard icon={<CheckCircle2 />} label="Já distribuídos" value={totals.used} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Enviar novo TXT de leads
          </CardTitle>
          <CardDescription>
            Faça o upload do arquivo. Cada linha é um lead — extraímos telefone e DDD
            automaticamente. Formatos aceitos: qualquer coluna, desde que haja um telefone brasileiro
            na linha (com ou sem DDD 55, parênteses, hífens etc).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Arquivo .txt</Label>
            <Input
              type="file"
              accept=".txt,text/plain,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} — {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
          <Button onClick={handleUpload} disabled={!file || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar leads
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estatísticas por DDD</CardTitle>
          <CardDescription>Quantos leads disponíveis / usados em cada DDD.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline" />
            </div>
          ) : (stats.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lead cadastrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DDD</TableHead>
                    <TableHead className="text-right">Disponíveis</TableHead>
                    <TableHead className="text-right">Usados</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stats.data ?? []).map((row) => (
                    <TableRow key={row.ddd}>
                      <TableCell className="font-medium">{row.ddd}</TableCell>
                      <TableCell className="text-right">{row.available}</TableCell>
                      <TableCell className="text-right">{row.used}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
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

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-md ${
              highlight ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {icon}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold">{value.toLocaleString("pt-BR")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
