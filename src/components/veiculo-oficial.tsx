/**
 * Rodada 2 — Etapas 3 e 4 na ficha do bem:
 * - Tabela FIPE (via provedor configurado) com histórico mensal.
 * - Consulta oficial SERPRO/SENATRAN, sem sobrescrever o cadastro sozinha.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Link2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { supabase, useInvalidate, usePerms } from "@/lib/frotagov";
import { formatBRL, formatPercent } from "@/lib/format";
import { FIPE_DISCLAIMER, FIPE_STATUS_LABEL, depreciation, useMarketHistory } from "@/lib/fipe";
import { fipeQuoteVehicle } from "@/lib/fipe.functions";
import { LinkDialog } from "@/components/integracao-fipe";
import { aplicarDadosOficiais, consultarSerpro } from "@/lib/serpro.functions";

const brDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

function useVehicleFipe(vehicleId: string) {
  return useQuery({
    queryKey: ["vehicles", "fipe", vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id, plate, asset_code, acquisition_value, fipe_kind, fipe_code, fipe_brand_code, fipe_brand_name, fipe_model_code, fipe_model_name, fipe_year_code, fipe_value, fipe_reference_label, fipe_reference_date, fipe_last_query_at, fipe_last_status",
        )
        .eq("id", vehicleId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function VeiculoFipe({ vehicleId }: { vehicleId: string }) {
  const { canManageFleet } = usePerms();
  const invalidate = useInvalidate();
  const { data: v } = useVehicleFipe(vehicleId);
  const { data: history = [] } = useMarketHistory(vehicleId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const quote = useServerFn(fipeQuoteVehicle);

  async function refresh() {
    if (!v?.fipe_year_code) return;
    setBusy(true);
    try {
      const r = await quote({
        data: {
          vehicleId,
          kind: (v.fipe_kind as "carros" | "motos" | "caminhoes") || "carros",
          brand: v.fipe_brand_code!,
          model: v.fipe_model_code!,
          year: v.fipe_year_code,
        },
      });
      (r.ok ? toast.success : toast.error)(
        r.ok
          ? `Valor atualizado: ${formatBRL(r.value ?? 0)} (${r.referenceLabel ?? "referência atual"}).`
          : r.message,
      );
      invalidate(["vehicles", "asset_market_values"]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na consulta.");
    } finally {
      setBusy(false);
    }
  }

  const dep = depreciation(v?.acquisition_value ?? null, v?.fipe_value ?? null);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Tabela FIPE</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{FIPE_DISCLAIMER}</p>
        </div>
        {canManageFleet && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Link2 className="mr-2 h-4 w-4" />
              {v?.fipe_year_code ? "Rever vínculo" : "Vincular"}
            </Button>
            <Button onClick={() => void refresh()} disabled={busy || !v?.fipe_year_code}>
              <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Atualizar valor
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!v?.fipe_year_code ? (
          <p className="text-sm text-muted-foreground">
            Este bem ainda não está vinculado à tabela. O cadastro segue normal e o vínculo pode ser
            feito a qualquer momento.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-4">
            <Info label="Modelo na tabela" value={v.fipe_model_name ?? v.fipe_model_code ?? "—"} />
            <Info label="Código" value={v.fipe_code ?? "—"} />
            <Info
              label="Valor de mercado"
              value={v.fipe_value ? formatBRL(v.fipe_value) : "—"}
              hint={v.fipe_reference_label ?? undefined}
            />
            <Info
              label="Depreciação"
              value={dep === null ? "—" : formatPercent(dep * 100)}
              hint="Sobre o valor de aquisição"
            />
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={v?.fipe_last_status === "ok" ? "default" : "secondary"}>
            {FIPE_STATUS_LABEL[v?.fipe_last_status ?? ""] ?? "Nunca consultado"}
          </Badge>
          {dt(v?.fipe_last_query_at)}
        </div>

        {history.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês de referência</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.slice(0, 12).map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{h.reference_label ?? brDate(h.reference_date)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{h.source}</TableCell>
                  <TableCell className="text-right">{formatBRL(h.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {open && v && (
        <LinkDialog
          vehicle={{
            id: v.id,
            plate: v.plate,
            asset_code: v.asset_code,
            fipe_kind: v.fipe_kind,
            fipe_brand_code: v.fipe_brand_code,
            fipe_model_code: v.fipe_model_code,
            fipe_year_code: v.fipe_year_code,
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </Card>
  );
}

function Info({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/* ------------------------- SERPRO / SENATRAN ---------------------------- */

type Divergence = { field: string; label: string; current: string | null; official: string | null };

export function VeiculoDadosOficiais({ vehicleId }: { vehicleId: string }) {
  const { canManageFleet } = usePerms();
  const invalidate = useInvalidate();
  const consultar = useServerFn(consultarSerpro);
  const aplicar = useServerFn(aplicarDadosOficiais);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    available: boolean;
    message: string;
    divergences: Divergence[];
  } | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  async function run() {
    setBusy(true);
    try {
      const r = await consultar({ data: { vehicleId } });
      setResult(r);
      setChecked({});
      (r.ok ? toast.success : toast.error)(r.message);
      invalidate(["detran_snapshots", "integration_logs"]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na consulta oficial.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const fields: Record<string, string> = {};
    for (const d of result?.divergences ?? []) {
      if (checked[d.field] && d.official) fields[d.field] = d.official;
    }
    if (!Object.keys(fields).length) {
      toast.error("Marque ao menos um dado para atualizar.");
      return;
    }
    try {
      await aplicar({ data: { vehicleId, fields } });
      toast.success("Cadastro atualizado com os dados oficiais escolhidos.");
      setResult(null);
      invalidate(["vehicles"]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Dados oficiais (SERPRO / SENATRAN)</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulta à base nacional pela placa, apenas com credenciais próprias do órgão. Nada é
            obtido de fontes não autorizadas e nenhum dado é alterado sem a sua confirmação.
          </p>
        </div>
        {canManageFleet && (
          <Button onClick={() => void run()} disabled={busy}>
            <ShieldCheck className={`mr-2 h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
            Consultar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!result && (
          <p className="text-sm text-muted-foreground">Nenhuma consulta realizada nesta sessão.</p>
        )}
        {result && !result.available && (
          <p className="text-sm text-muted-foreground">{result.message}</p>
        )}
        {result?.ok && result.divergences.length === 0 && (
          <p className="text-sm">O cadastro do bem confere com a base nacional.</p>
        )}
        {result?.ok && result.divergences.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Dado</TableHead>
                  <TableHead>No FrotaGov</TableHead>
                  <TableHead>Na base nacional</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.divergences.map((d) => (
                  <TableRow key={d.field}>
                    <TableCell>
                      <Checkbox
                        checked={Boolean(checked[d.field])}
                        onCheckedChange={(v) =>
                          setChecked((c) => ({ ...c, [d.field]: Boolean(v) }))
                        }
                      />
                    </TableCell>
                    <TableCell>{d.label}</TableCell>
                    <TableCell className="text-muted-foreground">{d.current ?? "—"}</TableCell>
                    <TableCell className="font-medium">{d.official ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {canManageFleet && (
              <Button onClick={() => void apply()}>Atualizar dados marcados</Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
