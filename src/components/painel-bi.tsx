/**
 * Aba "BI" do Dashboard: custos da frota por mês, unidade e veículo, com filtro de período.
 * Usa apenas dados já registrados (abastecimentos válidos, manutenções concluídas e lavagens realizadas).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { brl, useUnits, useVehicles } from "@/lib/frotagov";
import { formatNumberBR } from "@/lib/format";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";
const COLORS = {
  combustivel: "#0b2545",
  manutencao: "#3b82f6",
  limpeza: "#93c5fd",
};
const PIE = ["#0b2545", "#1d4ed8", "#3b82f6", "#93c5fd", "#b7791f", "#64748b"];

type Cost = {
  date: string;
  kind: "combustivel" | "manutencao" | "limpeza";
  value: number;
  vehicleId: string;
  unitId: string | null;
  sub: string;
};

function useCosts(months: number) {
  return useQuery({
    queryKey: ["bi-costs", months],
    queryFn: async (): Promise<{
      costs: Cost[];
      fuel: { date: string; price: number; qty: number }[];
      repairDays: number[];
    }> => {
      const from = new Date();
      from.setDate(1);
      from.setMonth(from.getMonth() - (months - 1));
      const start = from.toISOString().slice(0, 10) + "T00:00:00";
      const [f, m, c] = await Promise.all([
        supabase
          .from("fuelings")
          .select("fueled_at, total_value, quantity, unit_price, vehicle_id, unit_id")
          .eq("status", "valido")
          .gte("fueled_at", start)
          .limit(10000),
        supabase
          .from("maintenance_records")
          .select("entry_at, exit_at, total_value, kind, vehicle_id, unit_id, status")
          .neq("status", "cancelada")
          .gte("entry_at", start)
          .limit(10000),
        supabase
          .from("vehicle_cleanings")
          .select("performed_at, total_value, vehicle_id, unit_id, status")
          .neq("status", "cancelada")
          .gte("performed_at", start)
          .limit(10000),
      ]);
      if (f.error) throw f.error;
      if (m.error) throw m.error;
      if (c.error) throw c.error;
      const costs: Cost[] = [];
      for (const r of f.data)
        costs.push({
          date: r.fueled_at,
          kind: "combustivel",
          value: Number(r.total_value ?? 0),
          vehicleId: r.vehicle_id,
          unitId: r.unit_id,
          sub: "Combustível",
        });
      for (const r of m.data)
        costs.push({
          date: r.entry_at,
          kind: "manutencao",
          value: Number(r.total_value ?? 0),
          vehicleId: r.vehicle_id,
          unitId: r.unit_id,
          sub: String(r.kind ?? "outros"),
        });
      for (const r of c.data)
        costs.push({
          date: r.performed_at,
          kind: "limpeza",
          value: Number(r.total_value ?? 0),
          vehicleId: r.vehicle_id,
          unitId: r.unit_id,
          sub: "Limpeza",
        });
      const fuel = f.data.map((r) => ({
        date: r.fueled_at,
        price: Number(r.unit_price ?? 0),
        qty: Number(r.quantity ?? 0),
      }));
      const repairDays = m.data
        .filter((r) => r.exit_at)
        .map(
          (r) =>
            (new Date(r.exit_at as string).getTime() - new Date(r.entry_at).getTime()) / 86400000,
        )
        .filter((d) => d >= 0);
      return { costs, fuel, repairDays };
    },
  });
}

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
};
const money = (v: unknown) => brl(Number(v));

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export default function PainelBI() {
  const [months, setMonths] = useState("6");
  const [unitId, setUnitId] = useState(ALL);
  const { data, isLoading } = useCosts(Number(months));
  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();

  const view = useMemo(() => {
    const costs = (data?.costs ?? []).filter((c) => unitId === ALL || c.unitId === unitId);

    const keys: string[] = [];
    const base = new Date();
    base.setDate(1);
    for (let i = Number(months) - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const monthly = keys.map((k) => {
      const row = { key: k, mes: monthLabel(k), combustivel: 0, manutencao: 0, limpeza: 0 };
      for (const c of costs) if (monthKey(c.date) === k) row[c.kind] += c.value;
      return row;
    });

    const total = costs.reduce((s, c) => s + c.value, 0);
    const byKind = (["combustivel", "manutencao", "limpeza"] as const).map((k) => ({
      name: k === "combustivel" ? "Combustível" : k === "manutencao" ? "Manutenção" : "Limpeza",
      value: costs.filter((c) => c.kind === k).reduce((s, c) => s + c.value, 0),
    }));

    const perUnit = new Map<string, number>();
    for (const c of costs)
      perUnit.set(c.unitId ?? "—", (perUnit.get(c.unitId ?? "—") ?? 0) + c.value);
    const unitName = (id: string) =>
      units.find((u) => u.id === id)?.acronym ||
      units.find((u) => u.id === id)?.name ||
      "Sem unidade";
    const byUnit = [...perUnit.entries()]
      .map(([id, value]) => ({ name: unitName(id), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const perVeh = new Map<string, number>();
    for (const c of costs) perVeh.set(c.vehicleId, (perVeh.get(c.vehicleId) ?? 0) + c.value);
    const vehName = (id: string) =>
      vehicles.find((v) => v.id === id)?.plate ??
      vehicles.find((v) => v.id === id)?.asset_code ??
      "—";
    const byVehicle = [...perVeh.entries()]
      .map(([id, value]) => ({ name: vehName(id), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const mk = new Map<string, number>();
    for (const c of costs.filter((x) => x.kind === "manutencao"))
      mk.set(c.sub, (mk.get(c.sub) ?? 0) + c.value);
    const maintKinds = [...mk.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const fuelRows = (data?.fuel ?? []).filter((f) => f.price > 0);
    const price = keys.map((k) => {
      const list = fuelRows.filter((f) => monthKey(f.date) === k);
      const qty = list.reduce((s, f) => s + f.qty, 0);
      const avg = qty > 0 ? list.reduce((s, f) => s + f.price * f.qty, 0) / qty : null;
      return { mes: monthLabel(k), preco: avg === null ? null : Number(avg.toFixed(3)) };
    });

    const repair = data?.repairDays ?? [];
    const avgRepair = repair.length ? repair.reduce((s, d) => s + d, 0) / repair.length : null;
    const vehiclesWithCost = perVeh.size;

    return {
      monthly,
      total,
      byKind,
      byUnit,
      byVehicle,
      maintKinds,
      price,
      avgRepair,
      vehiclesWithCost,
      count: costs.length,
    };
  }, [data, unitId, months, units, vehicles]);

  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Carregando indicadores…</div>;

  const empty = view.count === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-44 space-y-1.5">
          <Label>Período</Label>
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Últimos 3 meses</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-64 space-y-1.5">
          <Label>Secretaria / unidade</Label>
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.acronym || u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Custo total da frota"
          value={brl(view.total)}
          hint="Combustível + manutenção + limpeza"
        />
        <Kpi
          label="Custo médio por veículo"
          value={view.vehiclesWithCost ? brl(view.total / view.vehiclesWithCost) : "—"}
          hint={`${view.vehiclesWithCost} veículo(s) com gasto`}
        />
        <Kpi
          label="Combustível"
          value={
            view.total ? `${formatNumberBR((view.byKind[0]!.value / view.total) * 100, 1)}%` : "—"
          }
          hint="Parte do custo total"
        />
        <Kpi
          label="Tempo médio de reparo"
          value={view.avgRepair === null ? "—" : `${formatNumberBR(view.avgRepair, 1)} dias`}
          hint="Entrada até saída da oficina"
        />
      </div>

      {empty ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground shadow-card">
          Sem gastos registrados no período selecionado.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Custo por mês">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={view.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6e0ee" />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => axisMoney(v)} />
                <Tooltip formatter={money} />
                <Legend />
                <Bar
                  dataKey="combustivel"
                  name="Combustível"
                  stackId="a"
                  fill={COLORS.combustivel}
                />
                <Bar dataKey="manutencao" name="Manutenção" stackId="a" fill={COLORS.manutencao} />
                <Bar dataKey="limpeza" name="Limpeza" stackId="a" fill={COLORS.limpeza} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Composição do custo">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={view.byKind.filter((k) => k.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  label={(e) => e.name}
                >
                  {view.byKind.map((_, i) => (
                    <Cell key={i} fill={PIE[i % PIE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={money} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Custo por secretaria / unidade">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={view.byUnit} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6e0ee" />
                <XAxis type="number" fontSize={12} tickFormatter={(v) => axisMoney(v)} />
                <YAxis type="category" dataKey="name" fontSize={12} width={90} />
                <Tooltip formatter={money} />
                <Bar dataKey="value" name="Custo" fill={COLORS.combustivel} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Veículos que mais custam (top 10)">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={view.byVehicle} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6e0ee" />
                <XAxis type="number" fontSize={12} tickFormatter={(v) => axisMoney(v)} />
                <YAxis type="category" dataKey="name" fontSize={12} width={80} />
                <Tooltip formatter={money} />
                <Bar dataKey="value" name="Custo" fill={COLORS.manutencao} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Preço médio do litro (R$)">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={view.price}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d6e0ee" />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis fontSize={12} domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(v) => (v === null ? "—" : `R$ ${formatNumberBR(Number(v), 3)}`)}
                />
                <Line
                  type="monotone"
                  dataKey="preco"
                  name="Preço médio"
                  stroke={COLORS.combustivel}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Manutenção por tipo">
            {view.maintKinds.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sem manutenções no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={view.maintKinds}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6e0ee" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => axisMoney(v)} />
                  <Tooltip formatter={money} />
                  <Bar dataKey="value" name="Custo" fill={COLORS.manutencao} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

const axisMoney = (v: unknown) => {
  const n = Number(v);
  return n >= 1000 ? `${formatNumberBR(n / 1000, 1)} mil` : String(Math.round(n));
};
