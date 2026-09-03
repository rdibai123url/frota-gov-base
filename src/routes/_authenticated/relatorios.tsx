import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase, useUnits, useVehicles } from "@/lib/frotagov";
import { formatMoney, formatLiters } from "@/lib/format";
import { exportCsv, exportExcel, logEvent } from "@/lib/platform";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios avançados — FrotaGov" },
      {
        name: "description",
        content:
          "Relatórios gerenciais de abastecimento, manutenção, utilização e custos por veículo e unidade, com exportação em CSV e Excel.",
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
  { value: "abastecimento", label: "Abastecimentos por veículo" },
  { value: "manutencao", label: "Manutenções e custos" },
  { value: "utilizacao", label: "Utilização de veículos" },
  { value: "custo_veiculo", label: "Custo total por veículo" },
] as const;

type ReportKey = (typeof REPORTS)[number]["value"];

const firstDayOfYear = () => `${new Date().getFullYear()}-01-01`;
const today = () => new Date().toISOString().slice(0, 10);

function Relatorios() {
  const [report, setReport] = useState<ReportKey>("abastecimento");
  const [from, setFrom] = useState(firstDayOfYear());
  const [to, setTo] = useState(today());
  const [unitId, setUnitId] = useState("todas");
  const [vehicleId, setVehicleId] = useState("todos");

  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();

  const { data, isLoading } = useQuery({
    queryKey: ["report", report, from, to, unitId, vehicleId],
    queryFn: async () => {
      const unit = unitId === "todas" ? null : unitId;
      const vehicle = vehicleId === "todos" ? null : vehicleId;

      if (report === "abastecimento" || report === "custo_veiculo") {
        let q = supabase
          .from("fuelings")
          .select("id, fueled_at, quantity, total_value, status, vehicle:vehicles(id, plate, asset_code), unit:units(name)")
          .gte("fueled_at", `${from}T00:00:00`)
          .lte("fueled_at", `${to}T23:59:59`)
          .order("fueled_at", { ascending: false });
        if (unit) q = q.eq("unit_id", unit);
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        const { data: fuelings, error } = await q;
        if (error) throw error;

        if (report === "abastecimento") {
          return (fuelings ?? []).map((f) => ({
            data: new Date(f.fueled_at).toLocaleDateString("pt-BR"),
            veiculo: f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—",
            unidade: f.unit?.name ?? "—",
            litros: formatLiters(f.quantity),
            valor: formatMoney(f.total_value),
            situacao: f.status,
          }));
        }

        let mq = supabase
          .from("maintenance_records")
          .select("id, total_value, vehicle:vehicles(id, plate, asset_code), entry_at")
          .gte("entry_at", `${from}T00:00:00`)
          .lte("entry_at", `${to}T23:59:59`);
        if (vehicle) mq = mq.eq("vehicle_id", vehicle);
        const { data: maints } = await mq;

        const acc = new Map<string, { veiculo: string; litros: number; combustivel: number; manutencao: number }>();
        for (const f of fuelings ?? []) {
          if (f.status === "cancelado") continue;
          const key = f.vehicle?.id ?? "—";
          const row = acc.get(key) ?? {
            veiculo: f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—",
            litros: 0,
            combustivel: 0,
            manutencao: 0,
          };
          row.litros += Number(f.quantity ?? 0);
          row.combustivel += Number(f.total_value ?? 0);
          acc.set(key, row);
        }
        for (const m of maints ?? []) {
          const key = m.vehicle?.id ?? "—";
          const row = acc.get(key) ?? {
            veiculo: m.vehicle?.plate ?? m.vehicle?.asset_code ?? "—",
            litros: 0,
            combustivel: 0,
            manutencao: 0,
          };
          row.manutencao += Number(m.total_value ?? 0);
          acc.set(key, row);
        }
        return Array.from(acc.values()).map((r) => ({
          veiculo: r.veiculo,
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
          .gte("entry_at", `${from}T00:00:00`)
          .lte("entry_at", `${to}T23:59:59`)
          .order("entry_at", { ascending: false });
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((m) => ({
          codigo: m.code ?? "—",
          veiculo: m.vehicle?.plate ?? m.vehicle?.asset_code ?? "—",
          tipo: m.kind,
          fornecedor: m.supplier?.trade_name ?? m.supplier?.legal_name ?? "—",
          entrada: new Date(m.entry_at).toLocaleDateString("pt-BR"),
          saida: m.exit_at ? new Date(m.exit_at).toLocaleDateString("pt-BR") : "—",
          valor: formatMoney(m.total_value),
          situacao: m.status,
        }));
      }

      let q = supabase
        .from("vehicle_usages")
        .select("id, code, status, planned_departure, actual_departure, actual_return, start_km, end_km, purpose, vehicle:vehicles(plate, asset_code), driver:drivers(full_name), unit:units(name)")
        .gte("planned_departure", `${from}T00:00:00`)
        .lte("planned_departure", `${to}T23:59:59`)
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

  const rows = data ?? [];
  const columns = useMemo(() => {
    const first = rows[0];
    if (!first) return [] as { key: string; label: string }[];
    return Object.keys(first).map((k) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1) }));
  }, [rows]);

  async function handleExport(kind: "csv" | "xls") {
    const name = `relatorio-${report}-${from}-a-${to}`;
    if (kind === "csv") exportCsv(name, columns, rows as Record<string, unknown>[]);
    else exportExcel(name, columns, rows as Record<string, unknown>[]);
    await logEvent({
      eventType: "exportacao",
      area: "Relatórios",
      screen: "Relatórios avançados",
      route: "/relatorios",
      action: kind.toUpperCase(),
      summary: `Exportação do relatório "${report}" (${rows.length} linhas)`,
    });
  }

  return (
    <>
      <PageHeader
        title="Relatórios avançados"
        description="Consolidação gerencial por período, unidade e veículo, com exportação em CSV e Excel."
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
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => handleExport("csv")}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => handleExport("xls")}>
            <Download className="size-4" /> Excel
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
            {rows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className="text-sm">
                    {String((r as Record<string, unknown>)[c.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
