import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart, Printer } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  supabase,
  useBrasaoUrl,
  useDrivers,
  useOrganization,
  useProfile,
  useUnits,
  useVehicles,
} from "@/lib/frotagov";
import { formatMoney, formatLiters } from "@/lib/format";
import { logEvent } from "@/lib/platform";
import { exportReportCsv, exportXlsx, printReport, type ReportMeta } from "@/lib/reports";


export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios avançados — FrotaGov" },
      {
        name: "description",
        content:
          "Relatórios gerenciais de frota, abastecimento, manutenção, utilização, contratos e custos por veículo, com exportação em CSV, Excel e PDF.",
      },
      { property: "og:title", content: "Relatórios avançados — FrotaGov" },
      { property: "og:description", content: "Consolide custos, consumo e utilização da frota e exporte os resultados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Relatorios,
});

const REPORTS = [
  { value: "frota", label: "Frota — situação dos veículos" },
  { value: "abastecimento", label: "Abastecimentos por veículo" },
  { value: "manutencao", label: "Manutenções e custos" },
  { value: "utilizacao", label: "Utilização de veículos" },
  { value: "custo_veiculo", label: "Custo total por veículo" },
  { value: "contratos", label: "Contratos, empenhos e saldos" },
  { value: "legal", label: "Multas, sinistros e obrigações" },
  { value: "patrimonio", label: "Movimentação patrimonial" },
] as const;

type ReportKey = (typeof REPORTS)[number]["value"];

/**
 * Filtros suportados por relatório. Um filtro só é habilitado quando a origem
 * de dados possui a coluna correspondente — nunca exibimos filtro que não filtra.
 */
const CAPS: Record<ReportKey, { date: boolean; unit: boolean; vehicle: boolean; driver: boolean }> = {
  frota: { date: false, unit: true, vehicle: true, driver: false },
  abastecimento: { date: true, unit: true, vehicle: true, driver: true },
  manutencao: { date: true, unit: true, vehicle: true, driver: false },
  utilizacao: { date: true, unit: true, vehicle: true, driver: true },
  custo_veiculo: { date: true, unit: true, vehicle: true, driver: false },
  contratos: { date: true, unit: false, vehicle: false, driver: false },
  legal: { date: true, unit: true, vehicle: true, driver: true },
  patrimonio: { date: true, unit: true, vehicle: true, driver: false },
};


const LABELS: Record<string, string> = {
  data: "Data",
  veiculo: "Veículo",
  unidade: "Unidade",
  litros: "Litros",
  valor: "Valor (R$)",
  situacao: "Situação",
  codigo: "Código",
  tipo: "Tipo",
  fornecedor: "Fornecedor",
  entrada: "Entrada",
  saida: "Saída",
  retorno: "Retorno",
  condutor: "Condutor",
  km: "KM percorrido",
  combustivel: "Combustível (R$)",
  manutencao: "Manutenção (R$)",
  total: "Total (R$)",
  placa: "Placa",
  patrimonio: "Patrimônio",
  marca: "Marca",
  modelo: "Modelo",
  ano: "Ano",
  hodometro: "Hodômetro",
  numero: "Número",
  objeto: "Objeto",
  vigencia: "Vigência",
  contratado: "Contratado",
  empenhado: "Empenhado (R$)",
  saldo: "Saldo (R$)",
  registro: "Registro",
  vencimento: "Vencimento",
  responsavel: "Responsável",
  origem: "Origem",
  destino: "Destino",
  movimento: "Movimento",
};

const label = (k: string) => LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ");

const firstDayOfYear = () => `${new Date().getFullYear()}-01-01`;
const today = () => new Date().toISOString().slice(0, 10);
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const PAGE_SIZE = 50;

function Relatorios() {
  const [report, setReport] = useState<ReportKey>("frota");
  const [from, setFrom] = useState(firstDayOfYear());
  const [to, setTo] = useState(today());
  const [unitId, setUnitId] = useState("todas");
  const [vehicleId, setVehicleId] = useState("todos");
  const [driverId, setDriverId] = useState("todos");
  const [page, setPage] = useState(1);

  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: org } = useOrganization();
  const { data: me } = useProfile();
  const { data: logoUrl } = useBrasaoUrl(org?.logo_url);

  const caps = CAPS[report];

  const { data, isLoading } = useQuery({
    queryKey: ["report", report, from, to, unitId, vehicleId, driverId],
    queryFn: async (): Promise<Record<string, unknown>[]> => {
      const unit = caps.unit && unitId !== "todas" ? unitId : null;
      const vehicle = caps.vehicle && vehicleId !== "todos" ? vehicleId : null;
      const driver = caps.driver && driverId !== "todos" ? driverId : null;
      const start = `${from}T00:00:00`;

      const end = `${to}T23:59:59`;

      if (report === "frota") {
        let q = supabase
          .from("vehicles")
          .select("id, plate, asset_code, brand, model, year_model, status, current_km, unit:units(name)")
          .order("asset_code");
        if (unit) q = q.eq("unit_id", unit);
        if (vehicle) q = q.eq("id", vehicle);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((v) => ({
          placa: v.plate ?? "—",
          patrimonio: v.asset_code ?? "—",
          marca: v.brand ?? "—",
          modelo: v.model ?? "—",
          ano: v.year_model ?? "—",
          unidade: v.unit?.name ?? "—",
          hodometro: v.current_km ?? "—",
          situacao: v.status,
        }));
      }

      if (report === "abastecimento" || report === "custo_veiculo") {
        let q = supabase
          .from("fuelings")
          .select(
            "id, fueled_at, quantity, unit_price, total_value, status, odometer_km, vehicle:vehicles(id, plate, asset_code), unit:units(name), driver:drivers(full_name), fuel_type:fuel_types(name), supplier:suppliers(trade_name, legal_name)",
          )
          .gte("fueled_at", start)
          .lte("fueled_at", end)
          .order("fueled_at", { ascending: false });
        if (unit) q = q.eq("unit_id", unit);
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        if (driver) q = q.eq("driver_id", driver);
        const { data: fuelings, error } = await q;
        if (error) throw error;

        if (report === "abastecimento") {
          return (fuelings ?? []).map((f) => ({
            data: new Date(f.fueled_at).toLocaleDateString("pt-BR"),
            veiculo: f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—",
            unidade: f.unit?.name ?? "—",
            condutor: f.driver?.full_name ?? "—",
            combustivel_tipo: f.fuel_type?.name ?? "—",
            fornecedor: f.supplier?.trade_name ?? f.supplier?.legal_name ?? "—",
            hodometro: f.odometer_km ?? "—",
            litros: formatLiters(f.quantity),
            preco_litro: formatMoney(f.unit_price),
            valor: formatMoney(f.total_value),
            situacao: f.status,
          }));
        }

        let mq = supabase
          .from("maintenance_records")
          .select("id, total_value, vehicle:vehicles(id, plate, asset_code), unit:units(name), entry_at")
          .gte("entry_at", start)
          .lte("entry_at", end);
        if (unit) mq = mq.eq("unit_id", unit);
        if (vehicle) mq = mq.eq("vehicle_id", vehicle);
        const { data: maints } = await mq;

        type Acc = { veiculo: string; unidade: string; litros: number; combustivel: number; manutencao: number };
        const acc = new Map<string, Acc>();
        const blank = (veiculo: string, unidade: string): Acc => ({
          veiculo,
          unidade,
          litros: 0,
          combustivel: 0,
          manutencao: 0,
        });
        for (const f of fuelings ?? []) {
          if (f.status === "cancelado") continue;
          const key = f.vehicle?.id ?? "—";
          const row =
            acc.get(key) ?? blank(f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—", f.unit?.name ?? "—");
          row.litros += Number(f.quantity ?? 0);
          row.combustivel += Number(f.total_value ?? 0);
          acc.set(key, row);
        }
        for (const m of maints ?? []) {
          const key = m.vehicle?.id ?? "—";
          const row =
            acc.get(key) ?? blank(m.vehicle?.plate ?? m.vehicle?.asset_code ?? "—", m.unit?.name ?? "—");
          row.manutencao += Number(m.total_value ?? 0);
          acc.set(key, row);
        }
        return Array.from(acc.values())
          .sort((a, b) => b.combustivel + b.manutencao - (a.combustivel + a.manutencao))
          .map((r) => ({
            veiculo: r.veiculo,
            unidade: r.unidade,
            litros: formatLiters(r.litros),
            combustivel: formatMoney(r.combustivel),
            manutencao: formatMoney(r.manutencao),
            total: formatMoney(r.combustivel + r.manutencao),
          }));
      }


      if (report === "manutencao") {
        let q = supabase
          .from("maintenance_records")
          .select("id, code, kind, status, entry_at, exit_at, total_value, vehicle:vehicles(plate, asset_code), supplier:suppliers(trade_name, legal_name)")
          .gte("entry_at", start)
          .lte("entry_at", end)
          .order("entry_at", { ascending: false });
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((m) => ({
          codigo: m.code ?? "—",
          veiculo: m.vehicle?.plate ?? m.vehicle?.asset_code ?? "—",
          tipo: m.kind,
          fornecedor: m.supplier?.trade_name ?? m.supplier?.legal_name ?? "—",
          entrada: day(m.entry_at),
          saida: day(m.exit_at),
          valor: formatMoney(m.total_value),
          situacao: m.status,
        }));
      }

      if (report === "contratos") {
        const { data: contracts, error } = await supabase
          .from("contracts")
          .select("id, number, object, modality, status, valid_from, valid_to, current_value, supplier:suppliers(trade_name, legal_name)")
          .order("valid_from", { ascending: false });
        if (error) throw error;
        const { data: commitments } = await supabase
          .from("commitments")
          .select("contract_id, committed_value, available_value");
        return (contracts ?? []).map((c) => {
          const mine = (commitments ?? []).filter((k) => k.contract_id === c.id);
          const empenhado = mine.reduce((s, k) => s + Number(k.committed_value ?? 0), 0);
          const saldo = mine.reduce((s, k) => s + Number(k.available_value ?? 0), 0);
          return {
            numero: c.number ?? "—",
            objeto: c.object ?? "—",
            contratado: c.supplier?.trade_name ?? c.supplier?.legal_name ?? "—",
            tipo: c.modality ?? "—",
            vigencia: `${day(c.valid_from)} a ${day(c.valid_to)}`,
            valor: formatMoney(c.current_value),
            empenhado: formatMoney(empenhado),
            saldo: formatMoney(saldo),
            situacao: c.status,
          };
        });
      }

      if (report === "legal") {
        const [fines, accidents, obligations] = await Promise.all([
          supabase
            .from("traffic_fines")
            .select("code, occurred_at, status, amount, vehicle:vehicles(plate, asset_code), driver:drivers(full_name)")
            .gte("occurred_at", start)
            .lte("occurred_at", end),
          supabase
            .from("accidents")
            .select("code, occurred_at, status, expenses_value, vehicle:vehicles(plate, asset_code), driver:drivers(full_name)")
            .gte("occurred_at", start)
            .lte("occurred_at", end),
          supabase
            .from("vehicle_obligations")
            .select("obligation_type, due_date, status, amount, vehicle:vehicles(plate, asset_code)")
            .gte("due_date", from)
            .lte("due_date", to),
        ]);
        const rows: Record<string, unknown>[] = [];
        for (const f of fines.data ?? [])
          rows.push({
            registro: "Multa",
            codigo: f.code ?? "—",
            veiculo: f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—",
            responsavel: f.driver?.full_name ?? "—",
            data: day(f.occurred_at),
            valor: formatMoney(f.amount),
            situacao: f.status,
          });
        for (const a of accidents.data ?? [])
          rows.push({
            registro: "Sinistro",
            codigo: a.code ?? "—",
            veiculo: a.vehicle?.plate ?? a.vehicle?.asset_code ?? "—",
            responsavel: a.driver?.full_name ?? "—",
            data: day(a.occurred_at),
            valor: formatMoney(a.expenses_value),
            situacao: a.status,
          });
        for (const o of obligations.data ?? [])
          rows.push({
            registro: "Obrigação legal",
            codigo: o.obligation_type ?? "—",
            veiculo: o.vehicle?.plate ?? o.vehicle?.asset_code ?? "—",
            responsavel: "—",
            data: day(o.due_date),
            valor: formatMoney(o.amount),
            situacao: o.status,
          });
        return rows;
      }

      if (report === "patrimonio") {
        let q = supabase
          .from("asset_movements")
          .select("code, kind, moved_on, from_unit_id, unit_id, to_status, vehicle:vehicles(plate, asset_code)")
          .gte("moved_on", from)
          .lte("moved_on", to)
          .order("moved_on", { ascending: false });
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        const { data: rows, error } = await q;
        if (error) throw error;
        const unitName = (id?: string | null) => units.find((u) => u.id === id)?.name ?? "—";
        return (rows ?? []).map((m) => ({
          codigo: m.code ?? "—",
          veiculo: m.vehicle?.plate ?? m.vehicle?.asset_code ?? "—",
          movimento: m.kind,
          data: day(m.moved_on),
          origem: unitName(m.from_unit_id),
          destino: unitName(m.unit_id),
          situacao: m.to_status ?? "—",
        }));
      }


      let q = supabase
        .from("vehicle_usages")
        .select("id, code, status, planned_departure, actual_departure, actual_return, start_km, end_km, purpose, vehicle:vehicles(plate, asset_code), driver:drivers(full_name), unit:units(name)")
        .gte("planned_departure", start)
        .lte("planned_departure", end)
        .order("planned_departure", { ascending: false });
      if (unit) q = q.eq("unit_id", unit);
      if (vehicle) q = q.eq("vehicle_id", vehicle);
      const { data: rows, error } = await q;
      if (error) throw error;
      return (rows ?? []).map((u) => ({
        codigo: u.code ?? "—",
        veiculo: u.vehicle?.plate ?? u.vehicle?.asset_code ?? "—",
        condutor: u.driver?.full_name ?? "—",
        unidade: u.unit?.name ?? "—",
        saida: new Date(u.actual_departure ?? u.planned_departure).toLocaleString("pt-BR"),
        retorno: u.actual_return ? new Date(u.actual_return).toLocaleString("pt-BR") : "—",
        km: u.start_km != null && u.end_km != null ? String(Number(u.end_km) - Number(u.start_km)) : "—",
        situacao: u.status,
      }));
    },
  });

  const rows = useMemo(() => data ?? [], [data]);
  const columns = useMemo(() => {
    const first = rows[0];
    if (!first) return [] as { key: string; label: string }[];
    return Object.keys(first).map((k) => ({ key: k, label: label(k) }));
  }, [rows]);

  useEffect(() => setPage(1), [report, from, to, unitId, vehicleId]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const reportLabel = REPORTS.find((r) => r.value === report)?.label ?? "Relatório";
  const usesDate = !NO_DATE.includes(report);

  const filters = [
    { label: "Período", value: usesDate ? `${day(from)} a ${day(to)}` : "Posição atual" },
    { label: "Unidade", value: unitId === "todas" ? "Todas" : units.find((u) => u.id === unitId)?.name ?? "" },
    {
      label: "Veículo",
      value:
        vehicleId === "todos"
          ? "Todos"
          : vehicles.find((v) => v.id === vehicleId)?.plate ?? vehicles.find((v) => v.id === vehicleId)?.asset_code ?? "",
    },
  ];

  async function handleExport(kind: "csv" | "xlsx" | "pdf") {
    const name = `relatorio-${report}-${from}-a-${to}`;
    if (kind === "csv") exportReportCsv(name, columns, rows);
    else if (kind === "xlsx") exportXlsx(name, columns, rows, reportLabel.slice(0, 28));
    else
      printReport(
        { title: reportLabel, organization: org?.legal_name ?? "FrotaGov", subtitle: org?.short_name ?? null, filters },
        columns,
        rows,
      );
    await logEvent({
      eventType: "exportacao",
      area: "Relatórios",
      screen: "Relatórios avançados",
      route: "/relatorios",
      action: kind.toUpperCase(),
      summary: `Exportação do relatório "${reportLabel}" (${rows.length} linhas)`,
    });
  }

  return (
    <>
      <PageHeader
        title="Relatórios avançados"
        description="Consolidação gerencial por período, unidade e veículo, com exportação em CSV, Excel (.xlsx) e impressão/PDF."
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Relatório</Label>
          <Select value={report} onValueChange={(v) => setReport(v as ReportKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORTS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>De</Label>
          <Input type="date" value={from} disabled={!usesDate} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Input type="date" value={to} disabled={!usesDate} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Unidade</Label>
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Veículo</Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.plate ?? v.asset_code ?? v.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileBarChart className="size-4" /> {rows.length} linha(s)
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => handleExport("csv")}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => handleExport("xlsx")}>
            <Download className="size-4" /> Excel (.xlsx)
          </Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => handleExport("pdf")}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              {columns.length === 0 && <TableHead>Resultado</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={Math.max(1, columns.length)} className="py-10 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={Math.max(1, columns.length)} className="py-10 text-center text-muted-foreground">
                  Nenhum dado para os filtros informados.
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className="text-sm">
                    {String(r[c.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {rows.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
