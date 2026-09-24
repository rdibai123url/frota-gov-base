/**
 * Fase 10 — Bloco 5: valor de mercado / FIPE do ativo.
 *
 * Enquanto não houver API contratada, o valor é informado manualmente ou
 * importado. Nunca simulamos consulta externa: sem conector configurado a
 * tela exibe "Integração não configurada".
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { supabase, useInvalidate, usePerms } from "@/lib/frotagov";
import { formatBRL, formatNumberBR, parseBRNumber } from "@/lib/format";
import { useConnectors, useMarketValues } from "@/lib/integracoes";

const SOURCES = [
  { value: "fipe", label: "Tabela FIPE" },
  { value: "avaliacao", label: "Avaliação / laudo" },
  { value: "nota_fiscal", label: "Nota fiscal de aquisição" },
  { value: "leilao", label: "Referência de leilão" },
  { value: "seguradora", label: "Seguradora" },
  { value: "outro", label: "Outra referência" },
];

const brDate = (v: string) => new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export function ValorDeMercado({
  vehicleId,
  assetClass,
  maintenanceCost12m,
  maintenanceCost24m,
}: {
  vehicleId: string;
  assetClass: string;
  maintenanceCost12m?: number;
  maintenanceCost24m?: number;
}) {
  const { canManageFleet, orgId, userId } = usePerms();
  const { data: values = [], isLoading } = useMarketValues(vehicleId);
  const { data: connectors = [] } = useConnectors();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(assetClass === "equipamento" ? "avaliacao" : "fipe");
  const [busy, setBusy] = useState(false);

  const fipe = connectors.find((c) => c.kind === "fipe");
  const fipeReady = fipe && fipe.status !== "nao_configurado";

  const current = values[0];
  const previous = values[1];
  const variation = useMemo(() => {
    if (!current || !previous || Number(previous.value) === 0) return null;
    return ((Number(current.value) - Number(previous.value)) / Number(previous.value)) * 100;
  }, [current, previous]);

  const ratio12 =
    current && maintenanceCost12m && Number(current.value) > 0
      ? (maintenanceCost12m / Number(current.value)) * 100
      : null;
  const ratio24 =
    current && maintenanceCost24m && Number(current.value) > 0
      ? (maintenanceCost24m / Number(current.value)) * 100
      : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = parseBRNumber(String(form.get("value") ?? ""));
    if (!value || value <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("asset_market_values").insert({
      organization_id: orgId!,
      vehicle_id: vehicleId,
      value,
      reference_date: String(form.get("reference_date") ?? "").slice(0, 10),
      source,
      origin: "manual",
      fipe_code: String(form.get("fipe_code") ?? "").trim() || null,
      source_reference: String(form.get("source_reference") ?? "").trim() || null,
      notes: String(form.get("notes") ?? "").trim() || null,
      created_by: userId,
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível registrar o valor.");
      return;
    }
    toast.success("Valor de mercado registrado.");
    invalidate(["market-values"]);
    invalidate(["market-values-latest"]);
    setOpen(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">
            {assetClass === "equipamento"
              ? "Valor de mercado / avaliação"
              : "Valor de mercado (FIPE)"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {fipeReady
              ? "Conector FIPE configurado. Também é possível registrar valores manualmente ou por importação."
              : "Integração não configurada — registre o valor manualmente ou por importação de dados."}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!canManageFleet}>
          <Plus className="size-4" /> Registrar valor
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Info label="Valor atual" value={current ? formatBRL(current.value) : "—"} />
          <Info
            label="Última atualização"
            value={current ? `${brDate(current.reference_date)} (${current.origin})` : "—"}
          />
          <Info
            label="Variação"
            value={
              variation === null
                ? "—"
                : `${variation >= 0 ? "+" : ""}${formatNumberBR(variation, 1)}%`
            }
            icon={variation === null ? undefined : variation >= 0 ? "up" : "down"}
          />
          <Info
            label="Manutenção 12m / 24m sobre o valor"
            value={
              ratio12 === null && ratio24 === null
                ? "—"
                : `${ratio12 === null ? "—" : `${formatNumberBR(ratio12, 1)}%`} / ${ratio24 === null ? "—" : `${formatNumberBR(ratio24, 1)}%`}`
            }
          />
        </div>

        {(maintenanceCost12m ?? 0) > 0 && current && (
          <p className="rounded-md border bg-muted/40 p-3 text-sm">
            Custo de manutenção dos últimos 12 meses:{" "}
            <strong>{formatBRL(maintenanceCost12m ?? 0)}</strong> — 24 meses:{" "}
            <strong>{formatBRL(maintenanceCost24m ?? 0)}</strong>. Valor de mercado atual:{" "}
            <strong>{formatBRL(current.value)}</strong>.
            {ratio24 !== null && ratio24 >= 50
              ? " O gasto acumulado já representa metade ou mais do valor do bem — avaliar substituição/alienação."
              : ""}
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data de referência</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Referência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && values.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhum valor de mercado registrado para este ativo.
                  </TableCell>
                </TableRow>
              )}
              {values.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{brDate(v.reference_date)}</TableCell>
                  <TableCell className="font-medium">{formatBRL(v.value)}</TableCell>
                  <TableCell>
                    {SOURCES.find((s) => s.value === v.source)?.label ?? v.source}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{v.origin}</Badge>
                  </TableCell>
                  <TableCell className="max-w-64 truncate">
                    {v.fipe_code || v.source_reference || v.notes || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar valor de mercado</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="value">Valor (R$) *</Label>
                <Input id="value" name="value" placeholder="0,00" required />
              </div>
              <div>
                <Label htmlFor="reference_date">Data de referência *</Label>
                <Input
                  id="reference_date"
                  name="reference_date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
              <div>
                <Label>Fonte *</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="fipe_code">Código FIPE</Label>
                <Input id="fipe_code" name="fipe_code" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="source_reference">Referência da fonte</Label>
                <Input
                  id="source_reference"
                  name="source_reference"
                  placeholder="Tabela, laudo ou documento"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Info({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: "up" | "down" | undefined;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1 text-lg font-semibold">
        {icon === "up" && <TrendingUp className="size-4 text-emerald-600" />}
        {icon === "down" && <TrendingDown className="size-4 text-destructive" />}
        {value}
      </p>
    </div>
  );
}
