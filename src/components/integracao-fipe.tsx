/**
 * Rodada 2 — Etapa 3: painel da Tabela FIPE dentro da Central de Integrações.
 * Nomenclatura obrigatória: "Consulta à Tabela FIPE via provedor configurado".
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Link2, Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

import { formatBRL, formatPercent } from "@/lib/format";
import { exportReportCsv } from "@/lib/reports";
import { useInvalidate, usePerms } from "@/lib/frotagov";
import {
  FIPE_DISCLAIMER,
  FIPE_KINDS,
  FIPE_STATUS_LABEL,
  depreciation,
  useFipeFleet,
} from "@/lib/fipe";
import {
  fipeBrands,
  fipeModels,
  fipeQuoteVehicle,
  fipeRefreshAll,
  fipeYears,
  type FipeItem,
  type FipeKind,
} from "@/lib/fipe.functions";

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

export function FipePanel() {
  const { canManageFleet } = usePerms();
  const invalidate = useInvalidate();
  const { data: fleet = [], isLoading } = useFipeFleet();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<(typeof fleet)[number] | null>(null);

  const refreshAll = useServerFn(fipeRefreshAll);

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return fleet;
    return fleet.filter((v) =>
      [v.plate, v.asset_code, v.brand, v.model, v.fipe_code].some((x) =>
        String(x ?? "")
          .toLowerCase()
          .includes(t),
      ),
    );
  }, [fleet, search]);

  const linked = fleet.filter((v) => v.fipe_year_code).length;
  const totalValue = fleet.reduce((s, v) => s + Number(v.fipe_value ?? 0), 0);

  async function handleRefreshAll() {
    setBusy(true);
    try {
      const r = await refreshAll({ data: { limit: 60 } });
      toast.success(`Atualização concluída: ${r.ok} bem(ns) atualizado(s), ${r.err} sem retorno.`);
      invalidate(["vehicles", "asset_market_values", "integration_logs"]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Valor de mercado dos bens</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{FIPE_DISCLAIMER}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                exportReportCsv(
                  "valores_fipe",
                  [
                    { key: "identificacao", label: "Identificação" },
                    { key: "marca", label: "Marca" },
                    { key: "modelo", label: "Modelo" },
                    { key: "ano", label: "Ano" },
                    { key: "codigo_fipe", label: "Código FIPE" },
                    { key: "referencia", label: "Mês de referência" },
                    { key: "valor", label: "Valor de mercado" },
                    { key: "valor_aquisicao", label: "Valor de aquisição" },
                    { key: "ultima_consulta", label: "Última consulta" },
                  ],
                  rows.map((v) => ({
                    identificacao: v.plate ?? v.asset_code ?? "",
                    marca: v.brand ?? "",
                    modelo: v.model ?? "",
                    ano: v.year_model ?? "",
                    codigo_fipe: v.fipe_code ?? "",
                    referencia: v.fipe_reference_label ?? "",
                    valor: v.fipe_value ?? "",
                    valor_aquisicao: v.acquisition_value ?? "",
                    ultima_consulta: v.fipe_last_query_at ?? "",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
            {canManageFleet && (
              <Button onClick={handleRefreshAll} disabled={busy || linked === 0}>
                <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                Atualizar valores
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Bens vinculados" value={`${linked} de ${fleet.length}`} />
            <Stat label="Valor de mercado somado" value={formatBRL(totalValue)} />
            <Stat
              label="Sem vínculo"
              value={String(fleet.length - linked)}
              hint="Podem ser vinculados manualmente a qualquer momento."
            />
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por placa, patrimônio, marca ou modelo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identificação</TableHead>
                  <TableHead>Vínculo na tabela</TableHead>
                  <TableHead className="text-right">Valor de mercado</TableHead>
                  <TableHead className="text-right">Depreciação</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6}>Carregando…</TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Nenhum bem encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((v) => {
                  const dep = depreciation(v.acquisition_value, v.fipe_value);
                  return (
                    <TableRow key={v.id}>
                      <TableCell>
                        <div className="font-medium">
                          {v.plate ?? v.asset_code ?? "Sem identificação"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[v.brand, v.model, v.year_model].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {v.fipe_year_code ? (
                          <>
                            <div>{v.fipe_model_name ?? v.fipe_model_code}</div>
                            <div className="text-xs text-muted-foreground">
                              Código {v.fipe_code ?? "—"} ·{" "}
                              {v.fipe_reference_label ?? "sem referência"}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sem vínculo</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {v.fipe_value ? formatBRL(v.fipe_value) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {dep === null ? "—" : formatPercent(dep * 100)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={v.fipe_last_status === "ok" ? "default" : "secondary"}>
                          {FIPE_STATUS_LABEL[v.fipe_last_status ?? ""] ?? "Nunca consultado"}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {dt(v.fipe_last_query_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManageFleet && (
                          <Button size="sm" variant="outline" onClick={() => setTarget(v)}>
                            <Link2 className="mr-2 h-4 w-4" />
                            {v.fipe_year_code ? "Rever vínculo" : "Vincular"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {target && <LinkDialog vehicle={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

type Vehicle = {
  id: string;
  plate: string | null;
  asset_code: string | null;
  fipe_kind: string | null;
  fipe_brand_code: string | null;
  fipe_model_code: string | null;
  fipe_year_code: string | null;
};

export function LinkDialog({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const invalidate = useInvalidate();
  const getBrands = useServerFn(fipeBrands);
  const getModels = useServerFn(fipeModels);
  const getYears = useServerFn(fipeYears);
  const doQuote = useServerFn(fipeQuoteVehicle);

  const [kind, setKind] = useState<FipeKind>((vehicle.fipe_kind as FipeKind) || "carros");
  const [brands, setBrands] = useState<FipeItem[]>([]);
  const [models, setModels] = useState<FipeItem[]>([]);
  const [years, setYears] = useState<FipeItem[]>([]);
  const [brand, setBrand] = useState(vehicle.fipe_brand_code ?? "");
  const [model, setModel] = useState(vehicle.fipe_model_code ?? "");
  const [year, setYear] = useState(vehicle.fipe_year_code ?? "");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadBrands(k: FipeKind) {
    setLoading("marcas");
    setError("");
    const r = await getBrands({ data: { kind: k } });
    setBrands(r.items);
    if (!r.ok) setError(r.message);
    setLoading(null);
  }

  async function loadModels(b: string) {
    setLoading("modelos");
    const r = await getModels({ data: { kind, brand: b } });
    setModels(r.items);
    if (!r.ok) setError(r.message);
    setLoading(null);
  }

  async function loadYears(m: string) {
    setLoading("anos");
    const r = await getYears({ data: { kind, brand, model: m } });
    setYears(r.items);
    if (!r.ok) setError(r.message);
    setLoading(null);
  }

  async function confirm() {
    if (!brand || !model || !year) {
      toast.error("Escolha marca, modelo e ano.");
      return;
    }
    setLoading("consulta");
    try {
      const r = await doQuote({
        data: {
          vehicleId: vehicle.id,
          kind,
          brand,
          brandName: brands.find((b) => b.codigo === brand)?.nome ?? "",
          model,
          modelName: models.find((m) => m.codigo === model)?.nome ?? "",
          year,
        },
      });
      if (!r.ok) {
        setError(r.message);
        toast.error(r.message);
      } else {
        toast.success(
          `Valor registrado: ${formatBRL(r.value ?? 0)} (${r.referenceLabel ?? "referência atual"}).`,
        );
        invalidate(["vehicles", "asset_market_values"]);
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na consulta.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular à Tabela FIPE</DialogTitle>
          <DialogDescription>
            {vehicle.plate ?? vehicle.asset_code ?? "Bem sem identificação"} — {FIPE_DISCLAIMER}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Tipo de bem</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as FipeKind);
                setBrand("");
                setModel("");
                setYear("");
                setModels([]);
                setYears([]);
                void loadBrands(v as FipeKind);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIPE_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Marca</Label>
            {brands.length === 0 ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void loadBrands(kind)}
                disabled={loading === "marcas"}
              >
                {loading === "marcas" ? "Buscando marcas…" : "Buscar marcas"}
              </Button>
            ) : (
              <Select
                value={brand}
                onValueChange={(v) => {
                  setBrand(v);
                  setModel("");
                  setYear("");
                  setYears([]);
                  void loadModels(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a marca" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {brands.map((b) => (
                    <SelectItem key={b.codigo} value={b.codigo}>
                      {b.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1">
            <Label>Modelo</Label>
            <Select
              value={model}
              disabled={models.length === 0}
              onValueChange={(v) => {
                setModel(v);
                setYear("");
                void loadYears(v);
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={loading === "modelos" ? "Buscando modelos…" : "Selecione o modelo"}
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {models.map((m) => (
                  <SelectItem key={m.codigo} value={m.codigo}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Ano e combustível</Label>
            <Select value={year} disabled={years.length === 0} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue
                  placeholder={loading === "anos" ? "Buscando anos…" : "Selecione o ano"}
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {years.map((y) => (
                  <SelectItem key={y.codigo} value={y.codigo}>
                    {y.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Sem correspondência na tabela, o cadastro do bem continua normal e o vínculo pode ser
            feito depois.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={confirm} disabled={loading === "consulta"}>
            {loading === "consulta" ? "Consultando…" : "Consultar e salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
