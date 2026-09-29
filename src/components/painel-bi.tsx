/**
 * Gráficos (BI) da aba "Visão geral" do Dashboard: custos da frota por mês, unidade e veículo.
 * Usa apenas dados já registrados (abastecimentos válidos, manutenções e lavagens não canceladas).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  BI_COLORS,
  BI_PIE,
  ChartCard,
  EmptyChart,
  GRID,
  axisMoney,
  humanize,
  money,
  monthKey,
  monthKeys,
  monthLabel,
  topBy,
} from "@/components/bi-common";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { brl, useUnits, useVehicles } from "@/lib/frotagov";

const ALL = "__all__";

type Cost = {
  date: string;
  kind: "combustivel" | "manutencao" | "limpeza";
  value: number;
  vehicleId: string;
  unitId: string | null;
};

function useCosts(months: number) {
  return useQuery({
    queryKey: ["bi-costs", months],
    queryFn: async (): Promise<Cost[]> => {
      const from = new Date();
      from.setDate(1);
      from.setMonth(from.getMonth() - (months - 1));
      const start = from.toISOString().slice(0, 10) + "T00:00:00";
      const [f, m, c] = await Promise.all([
        supabase
          .from("fuelings")
          .select("fueled_at, total_value, vehicle_id, unit_id")
          .eq("status", "valido")
          .gte("fueled_at", start)
          .limit(10000),
        supabase
          .from("maintenance_records")
          .select("entry_at, total_value, vehicle_id, unit_id, status")
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
        });
      for (const r of m.data)
        costs.push({
          date: r.entry_at,
          kind: "manutencao",
          value: Number(r.total_value ?? 0),
          vehicleId: r.vehicle_id,
          unitId: r.unit_id,
        });
      for (const r of c.data)
        costs.push({
          date: r.performed_at,
          kind: "limpeza",
          value: Number(r.total_value ?? 0),
          vehicleId: r.vehicle_id,
          unitId: r.unit_id,
        });
      return costs;
    },
  });
}

export default function PainelBI({ months }: { months: number }) {
  const [unitId, setUnitId] = useState(ALL);
  const { data, isLoading } = useCosts(months);
  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();

  const view = useMemo(() => {
    const costs = (data ?? []).filter((c) => unitId === ALL || c.unitId === unitId);
    const keys = monthKeys(months);
    const monthly = keys.map((k) => {
      const row = { mes: monthLabel(k), combustivel: 0, manutencao: 0, limpeza: 0 };
      for (const c of costs) if (monthKey(c.date) === k) row[c.kind] += c.value;
      return row;
    });
    const total = costs.reduce((s, c) => s + c.value, 0);
    const byKind = (["combustivel", "manutencao", "limpeza"] as const).map((k) => ({
      name: k === "combustivel" ? "Combustível" : k === "manutencao" ? "Manutenção" : "Limpeza",
      value: costs.filter((c) => c.kind === k).reduce((s, c) => s + c.value, 0),
    }));
    const unitName = (id: string | null) => {
      const u = units.find((x) => x.id === id);
      return u ? u.acronym || u.name : "Sem unidade";
    };
    const vehName = (id: string) => {
      const v = vehicles.find((x) => x.id === id);
      return v?.plate ?? v?.asset_code ?? "—";
    };
    return {
      monthly,
      total,
      byKind,
      byUnit: topBy(
        costs,
        (c) => unitName(c.unitId),
        (c) => c.value,
        8,
      ),
      byVehicle: topBy(
        costs,
        (c) => vehName(c.vehicleId),
        (c) => c.value,
        10,
      ),
      vehiclesWithCost: new Set(costs.map((c) => c.vehicleId)).size,
      frota: topBy(
        vehicles,
        (v) => humanize(v.status),
        () => 1,
        8,
      ),
      count: costs.length,
    };
  }, [data, unitId, months, units, vehicles]);

  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Carregando gráficos…</div>;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-end gap-4">
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
        <p className="pb-2 text-sm text-muted-foreground">
          Custo do período: <strong className="text-foreground">{brl(view.total)}</strong>
          {view.vehiclesWithCost > 0 && (
            <> · média por veículo {brl(view.total / view.vehiclesWithCost)}</>
          )}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Custo por mês" helpKey="custoMes">
          {view.count === 0 ? (
            <EmptyChart text="Sem gastos registrados no período." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={view.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={axisMoney} />
                <Tooltip formatter={money} />
                <Legend />
                <Bar dataKey="combustivel" name="Combustível" stackId="a" fill={BI_COLORS.navy} />
                <Bar dataKey="manutencao" name="Manutenção" stackId="a" fill={BI_COLORS.blue} />
                <Bar dataKey="limpeza" name="Limpeza" stackId="a" fill={BI_COLORS.sky} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Composição do custo" helpKey="composicao">
          {view.total === 0 ? (
            <EmptyChart />
          ) : (
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
                    <Cell key={i} fill={BI_PIE[i % BI_PIE.length]!} />
                  ))}
                </Pie>
                <Tooltip formatter={money} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Custo por secretaria / unidade" helpKey="porUnidade">
          {view.byUnit.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={view.byUnit} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis type="number" fontSize={12} tickFormatter={axisMoney} />
                <YAxis type="category" dataKey="name" fontSize={12} width={90} />
                <Tooltip formatter={money} />
                <Bar dataKey="value" name="Custo" fill={BI_COLORS.navy} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Veículos que mais custam (top 10)" helpKey="topVeiculos">
          {view.byVehicle.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={view.byVehicle} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis type="number" fontSize={12} tickFormatter={axisMoney} />
                <YAxis type="category" dataKey="name" fontSize={12} width={80} />
                <Tooltip formatter={money} />
                <Bar dataKey="value" name="Custo" fill={BI_COLORS.blue} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Situação da frota" helpKey="situacaoFrota">
          {view.frota.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={view.frota}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={95}
                  label={(e) => e.name}
                >
                  {view.frota.map((_, i) => (
                    <Cell key={i} fill={BI_PIE[i % BI_PIE.length]!} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
