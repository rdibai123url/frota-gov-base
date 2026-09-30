/**
 * Sustentabilidade por veículo: emissões estimadas, consumo e comparação com a média da frota,
 * para acompanhar um veículo específico e apontar os que mais emitem.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { InfoTip } from "@/components/info-tip";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";
import type { DashHelp } from "@/lib/ajuda-dashboard";
import { formatNumberBR } from "@/lib/format";
import { useVehicles } from "@/lib/frotagov";
import { computeEsg, fuelKeyOf, type EmissionFactor } from "@/lib/integracoes";

type Row = {
  vehicle_id: string;
  fueled_at: string;
  quantity: number;
  odometer_km: number | null;
  fuel_types: { name: string; category: string } | null;
};

const H: Record<string, DashHelp> = {
  co2: {
    what: "Quanto de gás de efeito estufa (CO2 equivalente) o veículo emitiu, de forma estimada.",
    calc: "Litros abastecidos de cada combustível vezes o fator de emissão cadastrado na aba “Fatores de emissão”.",
    action: "Não é uma medição do escapamento; é uma estimativa para comparar veículos.",
  },
  km: {
    what: "Quilômetros rodados no período.",
    calc: "Diferença entre o maior e o menor hodômetro informado nos abastecimentos do período.",
    action: "Se estiver vazio, registre o hodômetro nos abastecimentos.",
  },
  kml: {
    what: "Quantos quilômetros o veículo faz com um litro.",
    calc: "Quilômetros rodados dividido pelos litros abastecidos.",
  },
  por100: {
    what: "Emissão estimada a cada 100 km rodados. Serve para comparar veículos diferentes.",
    calc: "CO2e total dividido pelos quilômetros, vezes 100.",
    action: "Veículo acima da média da frota merece atenção (regulagem, uso ou troca).",
  },
  ranking: {
    what: "Os 10 veículos que mais emitiram no período.",
    calc: "Soma das emissões estimadas de cada veículo.",
  },
};

function useVehicleFuelings(from: string, to: string) {
  return useQuery({
    queryKey: ["esg-vehicle", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuelings")
        .select("vehicle_id, fueled_at, quantity, odometer_km, fuel_types(name, category)")
        .eq("status", "valido")
        .gte("fueled_at", `${from}T00:00:00`)
        .lte("fueled_at", `${to}T23:59:59`)
        .order("fueled_at")
        .limit(20000);
      if (error) throw error;
      return ((data ?? []) as unknown as Row[]).filter(
        (r) => (r.fuel_types?.category ?? "combustivel") === "combustivel",
      );
    },
  });
}

function Kpi({ title, value, help }: { title: string; value: string; help: DashHelp }) {
  return (
    <div className="relative rounded-lg border bg-card p-4 shadow-card">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <InfoTip help={help} className="absolute bottom-2 right-2" />
    </div>
  );
}

function stats(rows: Row[], factors: EmissionFactor[]) {
  const esg = computeEsg(
    rows.map((r) => ({
      fueledAt: r.fueled_at,
      fuelKey: fuelKeyOf(r.fuel_types?.name),
      quantity: Number(r.quantity ?? 0),
    })),
    factors,
  );
  const odo = rows.map((r) => Number(r.odometer_km ?? 0)).filter((k) => k > 0);
  const km = odo.length > 1 ? Math.max(...odo) - Math.min(...odo) : 0;
  return { esg, km, liters: esg.totalLiters, co2e: esg.totalCo2e };
}

export function SustentabilidadeVeiculo({
  from,
  to,
  factors,
}: {
  from: string;
  to: string;
  factors: EmissionFactor[];
}) {
  const { data: vehicles = [] } = useVehicles();
  const { data: rows = [], isLoading } = useVehicleFuelings(from, to);
  const [vehicleId, setVehicleId] = useState("");

  const view = useMemo(() => {
    const byVehicle = new Map<string, Row[]>();
    for (const r of rows) byVehicle.set(r.vehicle_id, [...(byVehicle.get(r.vehicle_id) ?? []), r]);
    const perVehicle = [...byVehicle.entries()].map(([id, list]) => ({
      id,
      plate:
        vehicles.find((v) => v.id === id)?.plate ??
        vehicles.find((v) => v.id === id)?.asset_code ??
        "—",
      ...stats(list, factors),
    }));
    const withKm = perVehicle.filter((v) => v.km > 0 && v.co2e > 0);
    const fleetPer100 = withKm.length
      ? withKm.reduce((s, v) => s + (v.co2e / v.km) * 100, 0) / withKm.length
      : null;
    const ranking = [...perVehicle].sort((a, b) => b.co2e - a.co2e).slice(0, 10);
    const mine = vehicleId ? stats(byVehicle.get(vehicleId) ?? [], factors) : null;
    return { fleetPer100, ranking, mine };
  }, [rows, vehicles, factors, vehicleId]);

  const mine = view.mine;
  const per100 = mine && mine.km > 0 ? (mine.co2e / mine.km) * 100 : null;
  const kml = mine && mine.km > 0 && mine.liters > 0 ? mine.km / mine.liters : null;
  const monthly = mine ? mine.esg.byMonth : [];

  return (
    <div className="space-y-4">
      <div className="w-72 space-y-1.5">
        <Label>Veículo</Label>
        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um veículo" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.plate ?? v.asset_code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {mine && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              title="CO2e estimado"
              value={`${formatNumberBR(mine.co2e, 1)} kg`}
              help={H["co2"]!}
            />
            <Kpi
              title="Km rodados"
              value={mine.km ? `${formatNumberBR(mine.km, 0)} km` : "—"}
              help={H["km"]!}
            />
            <Kpi
              title="Consumo"
              value={kml ? `${formatNumberBR(kml, 2)} km/L` : "—"}
              help={H["kml"]!}
            />
            <Kpi
              title="Emissão a cada 100 km"
              value={per100 === null ? "—" : `${formatNumberBR(per100, 1)} kg`}
              help={H["por100"]!}
            />
          </div>
          {per100 !== null && view.fleetPer100 !== null && (
            <p className="text-sm">
              A média da frota é <strong>{formatNumberBR(view.fleetPer100, 1)} kg</strong> por 100
              km.{" "}
              {per100 > view.fleetPer100 * 1.1 ? (
                <span className="text-destructive">Este veículo emite mais que a média.</span>
              ) : per100 < view.fleetPer100 * 0.9 ? (
                <span className="text-emerald-700">Este veículo emite menos que a média.</span>
              ) : (
                <span>Este veículo está na média.</span>
              )}
            </p>
          )}
          {monthly.length > 0 && (
            <div className="rounded-lg border bg-card p-4 shadow-card">
              <h3 className="mb-2 text-sm font-semibold">Emissão estimada por mês (kg CO2e)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v) => `${formatNumberBR(Number(v), 1)} kg`} />
                  <Bar dataKey="co2e" name="CO2e" fill="var(--chart-1)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
      {!mine && !isLoading && (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
          Escolha um veículo para acompanhar as emissões, o consumo e a comparação com a frota.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card p-4 shadow-card">
        <div className="mb-2 flex items-start justify-between">
          <h3 className="text-sm font-semibold">Veículos que mais emitiram (top 10)</h3>
          <InfoTip help={H["ranking"]} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Veículo</TableHead>
              <TableHead className="text-right">Litros</TableHead>
              <TableHead className="text-right">CO2e (kg)</TableHead>
              <TableHead className="text-right">Km rodados</TableHead>
              <TableHead className="text-right">kg a cada 100 km</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.ranking.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Sem abastecimentos no período.
                </TableCell>
              </TableRow>
            )}
            {view.ranking.map((v) => (
              <TableRow key={v.id} className="cursor-pointer" onClick={() => setVehicleId(v.id)}>
                <TableCell className="font-medium">{v.plate}</TableCell>
                <TableCell className="text-right">{formatNumberBR(v.liters, 1)}</TableCell>
                <TableCell className="text-right">{formatNumberBR(v.co2e, 1)}</TableCell>
                <TableCell className="text-right">{v.km ? formatNumberBR(v.km, 0) : "—"}</TableCell>
                <TableCell className="text-right">
                  {v.km && v.co2e ? formatNumberBR((v.co2e / v.km) * 100, 1) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
