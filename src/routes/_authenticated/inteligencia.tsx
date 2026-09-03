/**
 * Fase 10 — Bloco 2: Inteligência da Frota.
 * Consumo, desvios, rankings, evolução de despesas, TCO e economicidade,
 * para veículos e para máquinas/equipamentos (asset_class).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Brain, Download, Printer, RefreshCw, Plus, Gauge } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  supabase,
  useBrasaoUrl,
  useCostCenters,
  useDrivers,
  useFuelTypes,
  useInvalidate,
  useOrganization,
  usePerms,
  useProfile,
  useUnits,
  useVehicles,
} from "@/lib/frotagov";
import { formatMoney, formatNumberBR, parseBRNumber } from "@/lib/format";
import { logEvent } from "@/lib/platform";
import { exportReportCsv, exportXlsx, printReport, type ReportColumn, type ReportMeta } from "@/lib/reports";
import {
  COST_CATEGORIES,
  DEVIATION_LABEL,
  DIMENSIONS,
  ECONOMICITY_LABEL,
  aggregateConsumption,
  catValue,
  classifyDeviation,
  costCategoryLabel,
  costsByAsset,
  costsByGroup,
  costsByMonth,
  detectAnomalies,
  economicity,
  matchParameter,
  monthLabel,
  periodDays,
  previousPeriod,
  useConsumptionParameters,
  useConsumptionSegments,
  useCostRows,
  useDowntime,
  useIntelligenceSettings,
  useMeterCorrections,
  type DeviationClass,
  type Dimension,
  type IntelFilters,
} from "@/lib/inteligencia";

export const Route = createFileRoute("/_authenticated/inteligencia")({
  head: () => ({
    meta: [
      { title: "Inteligência da Frota — FrotaGov" },
      {
        name: "description",
        content:
          "Médias de consumo km/L e L/h, desvios de parâmetro, rankings, evolução de despesas, custo total de propriedade e economicidade de veículos e equipamentos.",
      },
      { property: "og:title", content: "Inteligência da Frota — FrotaGov" },
      {
        property: "og:description",
        content: "Painéis institucionais de consumo, custos e economicidade da frota pública.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Inteligencia,
});

const ALL = "todos";
const today = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--muted-foreground))",
];

const devVariant = (k: DeviationClass) =>
  k === "critico" ? "destructive" : k === "atencao" ? "secondary" : "outline";

function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Inteligencia() {
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const { data: org } = useOrganization();
  const { data: me } = useProfile();
  const { data: logoUrl } = useBrasaoUrl(org?.logo_url);
  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: fuelTypes = [] } = useFuelTypes();
  const { data: costCenters = [] } = useCostCenters();
  const { data: params = [] } = useConsumptionParameters();
  const { data: settings } = useIntelligenceSettings();

  const [from, setFrom] = useState(monthsAgo(2));
  const [to, setTo] = useState(today());
  const [unitId, setUnitId] = useState(ALL);
  const [costCenterId, setCostCenterId] = useState(ALL);
  const [vehicleId, setVehicleId] = useState(ALL);
  const [assetClass, setAssetClass] = useState(ALL);
  const [driverId, setDriverId] = useState(ALL);
  const [fuelId, setFuelId] = useState(ALL);
  const [dimension, setDimension] = useState<Dimension>("ativo");

  const filters: IntelFilters = {
    from,
    to,
    unitId,
    costCenterId,
    vehicleId,
    assetClass,
    driverId,
    fuelTypeId: fuelId,
  };

  const { data: segments = [], isLoading: loadingSeg } = useConsumptionSegments(filters);
  const { data: costRows = [], isLoading: loadingCost } = useCostRows(filters);
  const { data: downtime = [] } = useDowntime(from, to);
  const prev = previousPeriod(from, to);
  const { data: prevCostRows = [] } = useCostRows({ ...filters, from: prev.from, to: prev.to });

  /* ------------------------------ consumo ------------------------------ */
  const byAsset = useMemo(() => aggregateConsumption(segments, "ativo"), [segments]);
  const byDimension = useMemo(() => aggregateConsumption(segments, dimension), [segments, dimension]);
  const anomalies = useMemo(() => detectAnomalies(segments, settings ?? null), [segments, settings]);

  const deviations = useMemo(() => {
    const map = new Map<string, DeviationClass>();
    const detail = new Map<string, { expected: number | null; pct: number | null }>();
    for (const a of byAsset) {
      const metric = a.km > 0 ? "km_l" : "l_h";
      const actual = metric === "km_l" ? a.kmL : a.lH;
      const p = matchParameter(
        params,
        {
          vehicleId: a.vehicleId,
          assetClass: a.assetClass,
          category: a.category,
          brand: a.brand,
          model: a.model,
        },
        metric,
      );
      const { klass, deviationPct } = classifyDeviation(actual, p);
      map.set(a.key, klass);
      detail.set(a.key, { expected: p ? Number(p.expected_value) : null, pct: deviationPct });
    }
    return { map, detail };
  }, [byAsset, params]);

  /* ------------------------------- custos ------------------------------ */
  const assetCosts = useMemo(() => costsByAsset(costRows), [costRows]);
  const monthly = useMemo(() => costsByMonth(costRows), [costRows]);
  const byUnitCost = useMemo(() => costsByGroup(costRows, "unidade"), [costRows]);
  const byCcCost = useMemo(() => costsByGroup(costRows, "centro_custo"), [costRows]);
  const prevTotal = useMemo(() => prevCostRows.reduce((s, r) => s + Number(r.value ?? 0), 0), [prevCostRows]);
  const totalCost = useMemo(() => costRows.reduce((s, r) => s + Number(r.value ?? 0), 0), [costRows]);

  const econ = useMemo(
    () =>
      economicity({
        costs: assetCosts,
        consumption: byAsset,
        downtime,
        vehicles,
        deviations: deviations.map,
        periodDays: periodDays(from, to),
      }),
    [assetCosts, byAsset, downtime, vehicles, deviations, from, to],
  );

  const totals = useMemo(() => {
    const liters = byAsset.reduce((s, a) => s + a.liters, 0);
    const km = byAsset.reduce((s, a) => s + a.km, 0);
    const hours = byAsset.reduce((s, a) => s + a.hours, 0);
    return { liters, km, hours };
  }, [byAsset]);

  const categoryPie = useMemo(
    () =>
      COST_CATEGORIES.map((c) => ({
        name: c.label,
        value: costRows.filter((r) => r.category === c.value).reduce((s, r) => s + Number(r.value ?? 0), 0),
      })).filter((c) => c.value > 0),
    [costRows],
  );

  const monthChart = useMemo(
    () =>
      monthly.map((m) => {
        const row: Record<string, string | number> = { competencia: monthLabel(m.competencia), total: m.totals.total };
        for (const c of COST_CATEGORIES) row[c.value] = catValue(m.totals, c.value);
        return row;
      }),
    [monthly],
  );

  /* ------------------------------ exportação --------------------------- */
  const unitName = unitId === ALL ? "Todas" : (units.find((u) => u.id === unitId)?.name ?? "Todas");
  const periodText = `${new Date(`${from}T00:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${to}T00:00:00`).toLocaleDateString("pt-BR")}`;
  const issuedBy = me?.profile?.full_name ?? me?.email ?? "—";

  function metaFor(title: string): ReportMeta {
    return {
      title,
      organization: org?.legal_name ?? "FrotaGov",
      logoUrl: logoUrl ?? null,
      subtitle: org?.short_name ?? null,
      unit: unitName,
      period: periodText,
      issuedBy,
      filters: [
        { label: "Tipo de ativo", value: assetClass === ALL ? "Todos" : assetClass },
        {
          label: "Ativo",
          value:
            vehicleId === ALL
              ? "Todos"
              : (vehicles.find((v) => v.id === vehicleId)?.plate ??
                vehicles.find((v) => v.id === vehicleId)?.asset_code ??
                "—"),
        },
        {
          label: "Centro de custo",
          value: costCenterId === ALL ? "Todos" : (costCenters.find((c) => c.id === costCenterId)?.name ?? "—"),
        },
        {
          label: "Condutor",
          value: driverId === ALL ? "Todos" : (drivers.find((d) => d.id === driverId)?.full_name ?? "—"),
        },
        {
          label: "Combustível",
          value: fuelId === ALL ? "Todos" : (fuelTypes.find((f) => f.id === fuelId)?.name ?? "—"),
        },
      ],
    };
  }

  async function exportBlock(
    kind: "csv" | "xlsx" | "pdf",
    title: string,
    columns: ReportColumn[],
    rows: Record<string, unknown>[],
  ) {
    const meta = metaFor(title);
    const name = `inteligencia-${title.toLowerCase().replace(/\s+/g, "-")}-${from}-a-${to}`;
    if (kind === "csv") exportReportCsv(name, columns, rows, meta);
    else if (kind === "xlsx") exportXlsx(name, columns, rows, title.slice(0, 28), meta);
    else printReport(meta, columns, rows);
    await logEvent({
      eventType: "exportacao",
      area: "Inteligência da frota",
      screen: "Inteligência da frota",
      route: "/inteligencia",
      action: kind.toUpperCase(),
      summary: `Exportação "${title}" (${rows.length} linhas) — unidade: ${unitName}, período: ${periodText}`,
    });
  }

  function ExportBar({
    title,
    columns,
    rows,
  }: {
    title: string;
    columns: ReportColumn[];
    rows: Record<string, unknown>[];
  }) {
    return (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{rows.length} linha(s)</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportBlock("csv", title, columns, rows)}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportBlock("xlsx", title, columns, rows)}>
            <Download className="size-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => exportBlock("pdf", title, columns, rows)}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>
    );
  }

  /* --------------------------- linhas exportáveis ---------------------- */
  const consumoCols: ReportColumn[] = [
    { key: "grupo", label: "Agrupamento" },
    { key: "litros", label: "Litros (combustível)" },
    { key: "km", label: "KM percorridos" },
    { key: "horas", label: "Horas trabalhadas" },
    { key: "km_l", label: "Média km/L" },
    { key: "l_h", label: "Média L/h" },
    { key: "gasto", label: "Gasto com combustível (R$)" },
    { key: "trechos", label: "Trechos válidos" },
    { key: "descartados", label: "Trechos descartados" },
  ];
  const consumoRows = byDimension.map((a) => ({
    grupo: a.label,
    litros: formatNumberBR(a.liters, 2),
    km: formatNumberBR(a.km, 0),
    horas: formatNumberBR(a.hours, 1),
    km_l: a.kmL != null ? formatNumberBR(a.kmL, 2) : "—",
    l_h: a.lH != null ? formatNumberBR(a.lH, 2) : "—",
    gasto: formatMoney(a.value),
    trechos: a.segments,
    descartados: a.invalidSegments,
  }));

  const rankingRows = byAsset
    .filter((a) => a.kmL != null || a.lH != null)
    .map((a) => ({
      ativo: a.label,
      tipo: a.assetClass === "equipamento" ? "Equipamento" : "Veículo",
      indicador: a.kmL != null ? "km/L" : "L/h",
      media: formatNumberBR((a.kmL ?? a.lH) ?? 0, 2),
      esperado:
        deviations.detail.get(a.key)?.expected != null
          ? formatNumberBR(deviations.detail.get(a.key)!.expected!, 2)
          : "—",
      classificacao: DEVIATION_LABEL[deviations.map.get(a.key) ?? "sem_parametro"],
      gasto: formatMoney(a.value),
    }));
  const rankingCols: ReportColumn[] = [
    { key: "ativo", label: "Ativo" },
    { key: "tipo", label: "Tipo" },
    { key: "indicador", label: "Indicador" },
    { key: "media", label: "Média apurada" },
    { key: "esperado", label: "Parâmetro esperado" },
    { key: "classificacao", label: "Classificação" },
    { key: "gasto", label: "Gasto com combustível (R$)" },
  ];

  const anomaliaCols: ReportColumn[] = [
    { key: "data", label: "Data" },
    { key: "ativo", label: "Ativo" },
    { key: "tipo", label: "Ocorrência" },
    { key: "detalhe", label: "Detalhamento" },
    { key: "severidade", label: "Severidade" },
  ];
  const anomaliaRows = anomalies.map((a) => ({
    data: new Date(a.at).toLocaleString("pt-BR"),
    ativo: a.asset,
    tipo: a.type,
    detalhe: a.detail,
    severidade: a.severity === "critico" ? "Crítico" : "Atenção",
  }));

  const despesaCols: ReportColumn[] = [
    { key: "competencia", label: "Competência" },
    ...COST_CATEGORIES.map((c) => ({ key: c.value, label: `${c.label} (R$)` })),
    { key: "total", label: "Total (R$)" },
  ];
  const despesaRows = monthly.map((m) => {
    const row: Record<string, unknown> = { competencia: monthLabel(m.competencia) };
    for (const c of COST_CATEGORIES) row[c.value] = formatMoney(catValue(m.totals, c.value));
    row["total"] = formatMoney(m.totals.total);
    return row;
  });

  const tcoCols: ReportColumn[] = [
    { key: "ativo", label: "Ativo" },
    { key: "unidade", label: "Unidade" },
    ...COST_CATEGORIES.map((c) => ({ key: c.value, label: `${c.label} (R$)` })),
    { key: "total", label: "Total no período (R$)" },
    { key: "km", label: "KM no período" },
    { key: "horas", label: "Horas no período" },
    { key: "custo_km", label: "Custo por km (R$)" },
    { key: "custo_hora", label: "Custo por hora (R$)" },
    { key: "part", label: "% do custo da frota" },
  ];
  const tcoRows = assetCosts.map((a) => {
    const cons = byAsset.find((c) => c.vehicleId === a.vehicleId);
    const row: Record<string, unknown> = { ativo: a.label, unidade: a.unitName ?? "—" };
    for (const c of COST_CATEGORIES) row[c.value] = formatMoney(catValue(a.totals, c.value));
    row["total"] = formatMoney(a.totals.total);
    row["km"] = formatNumberBR(cons?.km ?? 0, 0);
    row["horas"] = formatNumberBR(cons?.hours ?? 0, 1);
    row["custo_km"] = cons?.km ? formatMoney(a.totals.total / cons.km) : "—";
    row["custo_hora"] = cons?.hours ? formatMoney(a.totals.total / cons.hours) : "—";
    row["part"] = totalCost ? `${((a.totals.total / totalCost) * 100).toFixed(1)}%` : "—";
    return row;
  });

  const econCols: ReportColumn[] = [
    { key: "ativo", label: "Ativo" },
    { key: "idade", label: "Idade (anos)" },
    { key: "aquisicao", label: "Valor de aquisição (R$)" },
    { key: "custo", label: "Custo no período (R$)" },
    { key: "manutencao", label: "Manutenção + peças (R$)" },
    { key: "custo_unit", label: "Custo por km / hora (R$)" },
    { key: "indisponibilidade", label: "Indisponibilidade (dias)" },
    { key: "consumo", label: "Consumo x parâmetro" },
    { key: "pontuacao", label: "Pontuação (0 a 100)" },
    { key: "classificacao", label: "Classificação" },
    { key: "motivos", label: "Fatores observados" },
  ];
  const econRows = econ.map((e) => ({
    ativo: e.label,
    idade: e.ageYears != null ? formatNumberBR(e.ageYears, 1) : "—",
    aquisicao: e.acquisitionValue ? formatMoney(e.acquisitionValue) : "—",
    custo: formatMoney(e.periodCost),
    manutencao: formatMoney(e.maintenanceCost),
    custo_unit: e.costPerKm != null ? formatMoney(e.costPerKm) : e.costPerHour != null ? formatMoney(e.costPerHour) : "—",
    indisponibilidade: formatNumberBR(e.downtimeDays, 1),
    consumo: DEVIATION_LABEL[e.deviation],
    pontuacao: formatNumberBR(e.score, 0),
    classificacao: ECONOMICITY_LABEL[e.klass],
    motivos: e.reasons.join(" ") || "Sem fatores relevantes.",
  }));

  const bestKmL = [...byAsset.filter((a) => a.kmL != null)].sort((a, b) => (b.kmL ?? 0) - (a.kmL ?? 0));
  const worstKmL = [...bestKmL].reverse();
  const topFuel = [...byAsset].sort((a, b) => b.value - a.value).slice(0, 10);
  const topMaint = [...assetCosts]
    .map((a) => ({ label: a.label, value: catValue(a.totals, "manutencao") + catValue(a.totals, "pecas") }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const topTotal = assetCosts.slice(0, 10).map((a) => ({ label: a.label, value: a.totals.total }));

  async function refreshAlerts() {
    const { data, error } = await supabase.rpc("refresh_intelligence_alerts");
    if (error) {
      toast.error(error.message);
      return;
    }
    await invalidate(["fueling-alerts"]);
    toast.success(`Análise concluída. ${Number(data ?? 0)} alerta(s) de inteligência avaliado(s).`);
  }

  const loading = loadingSeg || loadingCost;

  return (
    <>
      <PageHeader
        title="Inteligência da frota"
        description="Consumo, desvios, rankings, evolução de despesas, custo total e economicidade de veículos, máquinas e equipamentos."
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Secretaria / unidade</Label>
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Centro de custo</Label>
          <Select value={costCenterId} onValueChange={setCostCenterId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {costCenters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de ativo</Label>
          <Select value={assetClass} onValueChange={setAssetClass}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              <SelectItem value="veiculo">Veículos</SelectItem>
              <SelectItem value="equipamento">Máquinas e equipamentos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ativo</Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.plate ?? v.asset_code ?? v.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Condutor / operador</Label>
          <Select value={driverId} onValueChange={setDriverId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Combustível</Label>
          <Select value={fuelId} onValueChange={setFuelId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {fuelTypes.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Litros de combustível"
          value={formatNumberBR(totals.liters, 2)}
          hint="Lubrificantes e fluidos não entram neste total."
        />
        <Card
          title="Média geral"
          value={
            totals.km > 0 && totals.liters > 0
              ? `${formatNumberBR(totals.km / totals.liters, 2)} km/L`
              : totals.hours > 0 && totals.liters > 0
                ? `${formatNumberBR(totals.liters / totals.hours, 2)} L/h`
                : "—"
          }
          hint={`${formatNumberBR(totals.km, 0)} km e ${formatNumberBR(totals.hours, 1)} h apurados`}
        />
        <Card
          title="Custo total no período"
          value={formatMoney(totalCost)}
          hint={
            prevTotal > 0
              ? `Período anterior: ${formatMoney(prevTotal)} (${(((totalCost - prevTotal) / prevTotal) * 100).toFixed(1)}%)`
              : "Sem custo no período anterior"
          }
        />
        <Card
          title="Ocorrências detectadas"
          value={String(anomalies.length)}
          hint={`${byAsset.reduce((s, a) => s + a.invalidSegments, 0)} trecho(s) descartado(s) das médias`}
        />
      </div>

      {loading ? <p className="mb-3 text-sm text-muted-foreground">Carregando indicadores...</p> : null}

      <Tabs defaultValue="consumo">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="consumo">Consumo e eficiência</TabsTrigger>
          <TabsTrigger value="desvios">Desvios e anomalias</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="despesas">Evolução de despesas</TabsTrigger>
          <TabsTrigger value="tco">Custo total (TCO)</TabsTrigger>
          <TabsTrigger value="economicidade">Economicidade</TabsTrigger>
          <TabsTrigger value="parametros">Parâmetros</TabsTrigger>
        </TabsList>

        {/* ------------------------------ consumo --------------------------- */}
        <TabsContent value="consumo" className="pt-5">
          <div className="mb-3 max-w-sm space-y-1.5">
            <Label>Agrupar por</Label>
            <Select value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIMENSIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ExportBar title="Consumo e eficiência" columns={consumoCols} rows={consumoRows} />
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>{consumoCols.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {consumoRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={consumoCols.length} className="py-10 text-center text-muted-foreground">
                      Nenhum abastecimento com medidor apurável no período selecionado.
                    </TableCell>
                  </TableRow>
                )}
                {consumoRows.map((r, i) => (
                  <TableRow key={i}>
                    {consumoCols.map((c) => (
                      <TableCell key={c.key} className="text-sm">{String(r[c.key as keyof typeof r] ?? "—")}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ------------------------------ desvios --------------------------- */}
        <TabsContent value="desvios" className="pt-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshAlerts} disabled={!canManageFleet}>
              <RefreshCw className="size-4" /> Analisar e gerar alertas
            </Button>
            <p className="text-xs text-muted-foreground">
              Os alertas gerados ficam na tela "Alertas e inconsistências", uma vez por ativo e competência.
            </p>
          </div>

          <div className="mb-6 overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Média apurada</TableHead>
                  <TableHead>Esperado</TableHead>
                  <TableHead>Desvio</TableHead>
                  <TableHead>Classificação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byAsset.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Sem dados de consumo no período.
                    </TableCell>
                  </TableRow>
                )}
                {byAsset.map((a) => {
                  const d = deviations.detail.get(a.key);
                  const k = deviations.map.get(a.key) ?? "sem_parametro";
                  return (
                    <TableRow key={a.key}>
                      <TableCell className="font-medium">{a.label}</TableCell>
                      <TableCell>
                        {a.kmL != null
                          ? `${formatNumberBR(a.kmL, 2)} km/L`
                          : a.lH != null
                            ? `${formatNumberBR(a.lH, 2)} L/h`
                            : "—"}
                      </TableCell>
                      <TableCell>{d?.expected != null ? formatNumberBR(d.expected, 2) : "—"}</TableCell>
                      <TableCell>{d?.pct != null ? `${d.pct.toFixed(1)}%` : "—"}</TableCell>
                      <TableCell><Badge variant={devVariant(k)}>{DEVIATION_LABEL[k]}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <h3 className="mb-2 text-sm font-semibold">Ocorrências detectadas</h3>
          <ExportBar title="Desvios e anomalias" columns={anomaliaCols} rows={anomaliaRows} />
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>{anomaliaCols.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {anomaliaRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={anomaliaCols.length} className="py-10 text-center text-muted-foreground">
                      Nenhuma anomalia identificada no período.
                    </TableCell>
                  </TableRow>
                )}
                {anomaliaRows.map((r, i) => (
                  <TableRow key={i}>
                    {anomaliaCols.map((c) => (
                      <TableCell key={c.key} className="text-sm">{String(r[c.key as keyof typeof r] ?? "—")}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ----------------------------- rankings --------------------------- */}
        <TabsContent value="rankings" className="pt-5">
          <ExportBar title="Ranking de consumo" columns={rankingCols} rows={rankingRows} />
          <div className="grid gap-4 lg:grid-cols-2">
            <RankChart title="Maior eficiência (km/L)" data={bestKmL.slice(0, 10).map((a) => ({ label: a.label, value: a.kmL ?? 0 }))} suffix=" km/L" />
            <RankChart title="Menor eficiência (km/L)" data={worstKmL.slice(0, 10).map((a) => ({ label: a.label, value: a.kmL ?? 0 }))} suffix=" km/L" />
            <RankChart title="Maior gasto com combustível" data={topFuel.map((a) => ({ label: a.label, value: a.value }))} money />
            <RankChart title="Maior custo de manutenção e peças" data={topMaint} money />
            <RankChart title="Maior custo total" data={topTotal} money />
            <RankChart
              title="Consumo por hora (L/h) — equipamentos"
              data={byAsset.filter((a) => a.lH != null).sort((a, b) => (b.lH ?? 0) - (a.lH ?? 0)).slice(0, 10).map((a) => ({ label: a.label, value: a.lH ?? 0 }))}
              suffix=" L/h"
            />
          </div>
        </TabsContent>

        {/* ----------------------------- despesas --------------------------- */}
        <TabsContent value="despesas" className="pt-5">
          <ExportBar title="Evolução de despesas" columns={despesaCols} rows={despesaRows} />
          <div className="mb-4 rounded-lg border bg-card p-4 shadow-card">
            <p className="mb-2 text-sm font-semibold">Despesas por competência</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="competencia" fontSize={12} />
                  <YAxis fontSize={12} />
                  <ReTooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend />
                  {COST_CATEGORIES.map((c, i) => (
                    <Line key={c.value} type="monotone" dataKey={c.value} name={c.label} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} />
                  ))}
                  <Line type="monotone" dataKey="total" name="Total" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mb-4 overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>{despesaCols.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {despesaRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={despesaCols.length} className="py-10 text-center text-muted-foreground">
                      Nenhuma despesa lançada no período.
                    </TableCell>
                  </TableRow>
                )}
                {despesaRows.map((r, i) => (
                  <TableRow key={i}>
                    {despesaCols.map((c) => (
                      <TableCell key={c.key} className="text-sm">{String(r[c.key] ?? "—")}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GroupTable title="Despesas por secretaria / unidade" rows={byUnitCost} />
            <GroupTable title="Despesas por centro de custo" rows={byCcCost} />
          </div>
        </TabsContent>

        {/* -------------------------------- TCO ----------------------------- */}
        <TabsContent value="tco" className="pt-5">
          <ExportBar title="Custo total por ativo (TCO)" columns={tcoCols} rows={tcoRows} />
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-card p-4 shadow-card">
              <p className="mb-2 text-sm font-semibold">Composição do custo da frota</p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryPie} dataKey="value" nameKey="name" outerRadius={95} label>
                      {categoryPie.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <RankChart title="Custo total por ativo" data={topTotal} money />
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>{tcoCols.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {tcoRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={tcoCols.length} className="py-10 text-center text-muted-foreground">
                      Nenhum custo apurado no período.
                    </TableCell>
                  </TableRow>
                )}
                {tcoRows.map((r, i) => (
                  <TableRow key={i}>
                    {tcoCols.map((c) => (
                      <TableCell key={c.key} className="text-sm">{String(r[c.key] ?? "—")}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* --------------------------- economicidade ------------------------ */}
        <TabsContent value="economicidade" className="pt-5">
          <div className="mb-3 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            Indicador de apoio à gestão, sem decisão automática de alienação ou substituição. Pontuação de 0 a 100
            (quanto maior, maior o custo relativo): 30 pontos para custo por km/hora frente à mediana de ativos
            comparáveis, 25 para custo acumulado frente ao valor de aquisição, 20 para participação da manutenção,
            15 para idade do ativo, 10 para indisponibilidade e até 10 pontos adicionais pelo desvio de consumo.
            Valor de mercado (FIPE) ainda não integrado.
          </div>
          <ExportBar title="Economicidade do ativo" columns={econCols} rows={econRows} />
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>{econCols.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {econRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={econCols.length} className="py-10 text-center text-muted-foreground">
                      Sem custos apurados para avaliar economicidade no período.
                    </TableCell>
                  </TableRow>
                )}
                {econ.map((e) => (
                  <TableRow key={e.vehicleId}>
                    <TableCell className="font-medium">{e.label}</TableCell>
                    <TableCell>{e.ageYears != null ? formatNumberBR(e.ageYears, 1) : "—"}</TableCell>
                    <TableCell>{e.acquisitionValue ? formatMoney(e.acquisitionValue) : "—"}</TableCell>
                    <TableCell>{formatMoney(e.periodCost)}</TableCell>
                    <TableCell>{formatMoney(e.maintenanceCost)}</TableCell>
                    <TableCell>
                      {e.costPerKm != null ? formatMoney(e.costPerKm) : e.costPerHour != null ? formatMoney(e.costPerHour) : "—"}
                    </TableCell>
                    <TableCell>{formatNumberBR(e.downtimeDays, 1)}</TableCell>
                    <TableCell>{DEVIATION_LABEL[e.deviation]}</TableCell>
                    <TableCell>{formatNumberBR(e.score, 0)}</TableCell>
                    <TableCell>
                      <Badge variant={e.klass === "custo_elevado" ? "destructive" : e.klass === "atencao" ? "secondary" : "outline"}>
                        {ECONOMICITY_LABEL[e.klass]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-sm text-xs text-muted-foreground">
                      {e.reasons.join(" ") || "Sem fatores relevantes."}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ----------------------------- parâmetros ------------------------- */}
        <TabsContent value="parametros" className="pt-5">
          <ParametersTab canManage={canManageFleet} orgId={orgId} userId={userId} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------ componentes ------------------------------ */

function RankChart({
  title,
  data,
  money,
  suffix = "",
}: {
  title: string;
  data: { label: string; value: number }[];
  money?: boolean;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" fontSize={12} />
              <YAxis type="category" dataKey="label" width={110} fontSize={12} />
              <ReTooltip formatter={(v: number) => (money ? formatMoney(v) : `${formatNumberBR(v, 2)}${suffix}`)} />
              <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: { label: string; totals: { total: number; values: Record<string, number> } }[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card p-4 shadow-card">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Grupo</TableHead>
            {COST_CATEGORIES.map((c) => <TableHead key={c.value}>{c.label}</TableHead>)}
            <TableHead>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={COST_CATEGORIES.length + 2} className="py-8 text-center text-muted-foreground">
                Sem despesas no período.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="font-medium">{r.label}</TableCell>
              {COST_CATEGORIES.map((c) => (
                <TableCell key={c.value} className="text-sm">{formatMoney(r.totals.values[c.value] ?? 0)}</TableCell>
              ))}
              <TableCell className="text-sm font-semibold">{formatMoney(r.totals.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ------------------------- parâmetros e configurações -------------------- */

function ParametersTab({
  canManage,
  orgId,
  userId,
}: {
  canManage: boolean;
  orgId: string | null;
  userId: string | null;
}) {
  const invalidate = useInvalidate();
  const { data: params = [] } = useConsumptionParameters();
  const { data: settings } = useIntelligenceSettings();
  const { data: vehicles = [] } = useVehicles();
  const { data: fuelTypes = [] } = useFuelTypes();
  const { data: corrections = [] } = useMeterCorrections();

  const [open, setOpen] = useState(false);
  const [meterOpen, setMeterOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    scope: "orgao",
    asset_class: "veiculo",
    category: "",
    brand: "",
    model: "",
    vehicle_id: "",
    fuel_type_id: "",
    metric: "km_l",
    expected_value: "",
    tolerance_pct: "10",
    critical_pct: "25",
    notes: "",
  });
  const [meter, setMeter] = useState({
    vehicle_id: "",
    meter: "hodometro",
    occurred_at: new Date().toISOString().slice(0, 16),
    previous_value: "",
    new_value: "",
    reason: "",
  });
  const [cfg, setCfg] = useState<Record<string, string | boolean>>({});

  const cfgValue = (key: string, fallback: number | boolean) => {
    if (key in cfg) return cfg[key];
    const current = settings ? (settings as unknown as Record<string, unknown>)[key] : undefined;
    return current !== undefined && current !== null ? String(current) : String(fallback);
  };

  async function saveParameter() {
    if (!orgId) return;
    const expected = parseBRNumber(form.expected_value);
    if (!expected || expected <= 0) {
      toast.error("Informe o consumo esperado.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("consumption_parameters").insert({
      organization_id: orgId,
      scope: form.scope,
      asset_class: form.asset_class || null,
      category: form.scope === "categoria" ? form.category || null : null,
      brand: form.scope === "modelo" ? form.brand || null : null,
      model: form.scope === "modelo" ? form.model || null : null,
      vehicle_id: form.scope === "ativo" ? form.vehicle_id || null : null,
      fuel_type_id: form.fuel_type_id || null,
      metric: form.metric,
      expected_value: expected,
      tolerance_pct: parseBRNumber(form.tolerance_pct) ?? 10,
      critical_pct: parseBRNumber(form.critical_pct) ?? 25,
      notes: form.notes || null,
      created_by: userId,
      updated_by: userId,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Parâmetro cadastrado.");
    setOpen(false);
    await invalidate(["consumption-parameters"]);
  }

  async function toggleParameter(id: string, active: boolean) {
    const { error } = await supabase
      .from("consumption_parameters")
      .update({ active, updated_by: userId })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await invalidate(["consumption-parameters"]);
  }

  async function saveSettings() {
    if (!orgId) return;
    const numeric = [
      "default_tolerance_pct",
      "critical_pct",
      "max_km_segment",
      "max_hours_segment",
      "min_minutes_between_fuelings",
      "efficiency_drop_pct",
      "maintenance_cost_alert",
      "cost_deviation_pct",
      "min_segments_for_alert",
    ];
    const payload: Record<string, unknown> = { organization_id: orgId, updated_by: userId, created_by: userId };
    for (const key of numeric) payload[key] = parseBRNumber(String(cfgValue(key, 0))) ?? 0;
    payload["alerts_enabled"] = String(cfgValue("alerts_enabled", true)) !== "false";
    const { error } = settings
      ? await supabase.from("intelligence_settings").update(payload as never).eq("id", settings.id)
      : await supabase.from("intelligence_settings").insert(payload as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Configurações atualizadas.");
    await invalidate(["intelligence-settings"]);
  }

  async function saveMeterCorrection() {
    if (!orgId || !meter.vehicle_id || !meter.reason.trim()) {
      toast.error("Informe o ativo e a justificativa.");
      return;
    }
    const { error } = await supabase.from("meter_corrections").insert({
      organization_id: orgId,
      vehicle_id: meter.vehicle_id,
      meter: meter.meter,
      occurred_at: new Date(meter.occurred_at).toISOString(),
      previous_value: parseBRNumber(meter.previous_value),
      new_value: parseBRNumber(meter.new_value) ?? 0,
      reason: meter.reason,
      created_by: userId,
      updated_by: userId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Correção de medidor registrada. Os trechos afetados saem das médias.");
    setMeterOpen(false);
    await invalidate(["meter-corrections", "intel-segments"]);
  }

  const numericFields: { key: string; label: string; hint: string; fallback: number }[] = [
    { key: "default_tolerance_pct", label: "Tolerância padrão (%)", hint: "Faixa de atenção quando não há tolerância no parâmetro.", fallback: 10 },
    { key: "critical_pct", label: "Faixa crítica (%)", hint: "Desvio a partir do qual o consumo é crítico.", fallback: 25 },
    { key: "max_km_segment", label: "Variação máxima de hodômetro (km)", hint: "Acima disso o trecho é descartado das médias.", fallback: 3000 },
    { key: "max_hours_segment", label: "Variação máxima de horímetro (h)", hint: "Acima disso o trecho é descartado das médias.", fallback: 500 },
    { key: "min_minutes_between_fuelings", label: "Intervalo mínimo entre abastecimentos (min)", hint: "Abaixo disso gera ocorrência de abastecimentos próximos.", fallback: 60 },
    { key: "efficiency_drop_pct", label: "Queda de eficiência relevante (%)", hint: "Desvio do trecho contra a média do próprio ativo.", fallback: 20 },
    { key: "maintenance_cost_alert", label: "Custo de manutenção que gera alerta (R$/mês)", hint: "Soma de manutenção e peças por ativo no mês.", fallback: 10000 },
    { key: "cost_deviation_pct", label: "Desvio de custo relevante (%)", hint: "Referência de custo anormal frente a ativos comparáveis.", fallback: 80 },
    { key: "min_segments_for_alert", label: "Mínimo de trechos para alertar", hint: "Evita falso positivo com poucos abastecimentos.", fallback: 3 },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Parâmetros de consumo esperado</p>
            <p className="text-xs text-muted-foreground">
              O parâmetro mais específico prevalece: ativo, depois modelo, depois categoria e por último o órgão.
            </p>
          </div>
          <Button size="sm" disabled={!canManage} onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Novo parâmetro
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Abrangência</TableHead>
                <TableHead>Aplicação</TableHead>
                <TableHead>Indicador</TableHead>
                <TableHead>Esperado</TableHead>
                <TableHead>Tolerância / crítico</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {params.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum parâmetro cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {params.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="capitalize">{p.scope}</TableCell>
                  <TableCell className="text-sm">
                    {[
                      p.vehicle_id
                        ? (vehicles.find((v) => v.id === p.vehicle_id)?.plate ??
                          vehicles.find((v) => v.id === p.vehicle_id)?.asset_code ??
                          "ativo")
                        : null,
                      p.brand,
                      p.model,
                      p.category,
                      p.asset_class === "equipamento" ? "Equipamentos" : "Veículos",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </TableCell>
                  <TableCell>{p.metric === "km_l" ? "km/L" : "L/h"}</TableCell>
                  <TableCell>{formatNumberBR(Number(p.expected_value), 2)}</TableCell>
                  <TableCell>
                    {formatNumberBR(Number(p.tolerance_pct), 0)}% / {formatNumberBR(Number(p.critical_pct), 0)}%
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.active}
                        disabled={!canManage}
                        onCheckedChange={(v) => toggleParameter(p.id, v)}
                      />
                      <span className="text-xs text-muted-foreground">{p.active ? "Ativo" : "Inativo"}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold">Configurações de detecção do órgão</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Toda alteração é registrada na auditoria do sistema.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {numericFields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                value={String(cfgValue(f.key, f.fallback))}
                disabled={!canManage}
                onChange={(e) => setCfg((c) => ({ ...c, [f.key]: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-6">
            <Switch
              checked={String(cfgValue("alerts_enabled", true)) !== "false"}
              disabled={!canManage}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, alerts_enabled: String(v) }))}
            />
            <span className="text-sm">Gerar alertas de inteligência</span>
          </div>
        </div>
        <Button className="mt-4" size="sm" disabled={!canManage} onClick={saveSettings}>
          Salvar configurações
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Trocas e correções de medidor</p>
            <p className="text-xs text-muted-foreground">
              Os trechos que cruzam uma correção saem das médias, preservando a série histórica.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={!canManage} onClick={() => setMeterOpen(true)}>
            <Gauge className="size-4" /> Registrar correção
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Medidor</TableHead>
                <TableHead>Anterior</TableHead>
                <TableHead>Novo</TableHead>
                <TableHead>Justificativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {corrections.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhuma correção registrada.
                  </TableCell>
                </TableRow>
              )}
              {corrections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{new Date(c.occurred_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{c.vehicle?.plate ?? c.vehicle?.asset_code ?? "—"}</TableCell>
                  <TableCell className="capitalize">{c.meter}</TableCell>
                  <TableCell>{c.previous_value != null ? formatNumberBR(Number(c.previous_value), 0) : "—"}</TableCell>
                  <TableCell>{formatNumberBR(Number(c.new_value), 0)}</TableCell>
                  <TableCell className="max-w-sm text-xs text-muted-foreground">{c.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo parâmetro de consumo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Abrangência</Label>
              <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="orgao">Órgão (padrão geral)</SelectItem>
                  <SelectItem value="categoria">Categoria / tipo de ativo</SelectItem>
                  <SelectItem value="modelo">Marca e modelo</SelectItem>
                  <SelectItem value="ativo">Ativo específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Classe do ativo</Label>
              <Select value={form.asset_class} onValueChange={(v) => setForm((f) => ({ ...f, asset_class: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="veiculo">Veículos</SelectItem>
                  <SelectItem value="equipamento">Máquinas e equipamentos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.scope === "categoria" && (
              <div className="space-y-1.5">
                <Label>Categoria / tipo</Label>
                <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
              </div>
            )}
            {form.scope === "modelo" && (
              <>
                <div className="space-y-1.5">
                  <Label>Marca</Label>
                  <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Modelo</Label>
                  <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
                </div>
              </>
            )}
            {form.scope === "ativo" && (
              <div className="space-y-1.5">
                <Label>Ativo</Label>
                <Select value={form.vehicle_id} onValueChange={(v) => setForm((f) => ({ ...f, vehicle_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.plate ?? v.asset_code ?? v.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Indicador</Label>
              <Select value={form.metric} onValueChange={(v) => setForm((f) => ({ ...f, metric: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="km_l">km/L (hodômetro)</SelectItem>
                  <SelectItem value="l_h">L/h (horímetro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Consumo esperado</Label>
              <Input value={form.expected_value} onChange={(e) => setForm((f) => ({ ...f, expected_value: e.target.value }))} placeholder="Ex.: 9,5" />
            </div>
            <div className="space-y-1.5">
              <Label>Tolerância de atenção (%)</Label>
              <Input value={form.tolerance_pct} onChange={(e) => setForm((f) => ({ ...f, tolerance_pct: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Faixa crítica (%)</Label>
              <Input value={form.critical_pct} onChange={(e) => setForm((f) => ({ ...f, critical_pct: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Combustível (opcional)</Label>
              <Select value={form.fuel_type_id || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, fuel_type_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Qualquer combustível</SelectItem>
                  {fuelTypes.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={saveParameter} disabled={saving}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={meterOpen} onOpenChange={setMeterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar troca ou correção de medidor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Ativo</Label>
              <Select value={meter.vehicle_id} onValueChange={(v) => setMeter((m) => ({ ...m, vehicle_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.plate ?? v.asset_code ?? v.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Medidor</Label>
              <Select value={meter.meter} onValueChange={(v) => setMeter((m) => ({ ...m, meter: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hodometro">Hodômetro</SelectItem>
                  <SelectItem value="horimetro">Horímetro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data e hora</Label>
              <Input type="datetime-local" value={meter.occurred_at} onChange={(e) => setMeter((m) => ({ ...m, occurred_at: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Valor anterior</Label>
                <Input value={meter.previous_value} onChange={(e) => setMeter((m) => ({ ...m, previous_value: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Novo valor</Label>
                <Input value={meter.new_value} onChange={(e) => setMeter((m) => ({ ...m, new_value: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Justificativa</Label>
              <Textarea value={meter.reason} onChange={(e) => setMeter((m) => ({ ...m, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeterOpen(false)}>Cancelar</Button>
            <Button onClick={saveMeterCorrection}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
