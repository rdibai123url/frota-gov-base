/**
 * Análise dos pneus: com que frequência cada veículo troca de pneu, quantos km cada pneu rodou
 * e quais pneus estão perto do fim da vida útil.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { InfoTip } from "@/components/info-tip";
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
import { useTires, useVehicles } from "@/lib/frotagov";

const HELP: Record<string, DashHelp> = {
  trocas: {
    what: "Quantas vezes pneus foram retirados dos veículos nos últimos 12 meses.",
    calc: "Conta os movimentos de retirada (pneu que estava instalado e saiu do veículo).",
    action: "Veículo com muitas trocas pode ter problema de alinhamento, carga ou rota.",
  },
  km: {
    what: "Média de quilômetros que os pneus já retirados rodaram antes de sair.",
    calc: "Média do quilômetro acumulado dos pneus que foram retirados nos últimos 12 meses.",
    action: "Compare com a vida útil esperada do pneu. Muito abaixo indica desgaste precoce.",
  },
  intervalo: {
    what: "Tempo médio, em dias, entre uma troca e a seguinte no mesmo veículo.",
    calc: "Diferença entre as datas de retirada de cada veículo, com média entre eles.",
  },
  fim: {
    what: "Pneus instalados que já usaram 85% ou mais da vida útil esperada.",
    calc: "Quilômetro acumulado mais o rodado desde a instalação, dividido pela vida útil informada no cadastro.",
    action: "Programe a troca ou a recapagem antes de chegar a 100%.",
  },
};

type Move = {
  tire_id: string;
  vehicle_id: string | null;
  from_status: string | null;
  to_status: string;
  created_at: string;
};

function useRemovals() {
  return useQuery({
    queryKey: ["tire-removals-12m"],
    queryFn: async (): Promise<Move[]> => {
      const since = new Date();
      since.setFullYear(since.getFullYear() - 1);
      const { data, error } = await supabase
        .from("tire_movements")
        .select("tire_id, vehicle_id, from_status, to_status, created_at")
        .eq("from_status", "instalado")
        .neq("to_status", "instalado")
        .gte("created_at", since.toISOString())
        .limit(5000);
      if (error) throw error;
      return data as Move[];
    },
  });
}

function Box({ title, value, help }: { title: string; value: string; help: DashHelp }) {
  return (
    <div className="relative rounded-lg border bg-card p-4 shadow-card">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <InfoTip help={help} className="absolute bottom-2 right-2" />
    </div>
  );
}

export function PneusAnalise() {
  const { data: removals = [] } = useRemovals();
  const { data: tires = [] } = useTires();
  const { data: vehicles = [] } = useVehicles();

  const view = useMemo(() => {
    const tireById = new Map(tires.map((t) => [t.id, t]));
    const byVehicle = new Map<string, Move[]>();
    for (const r of removals) {
      if (!r.vehicle_id) continue;
      byVehicle.set(r.vehicle_id, [...(byVehicle.get(r.vehicle_id) ?? []), r]);
    }
    const rows = [...byVehicle.entries()].map(([vehicleId, list]) => {
      const dates = list.map((r) => new Date(r.created_at).getTime()).sort((a, b) => a - b);
      const gaps = dates.slice(1).map((d, i) => (d - dates[i]!) / 86400000);
      const kms = list
        .map((r) => Number(tireById.get(r.tire_id)?.accumulated_km ?? 0))
        .filter((k) => k > 0);
      const lives = list
        .map((r) => Number(tireById.get(r.tire_id)?.expected_life_km ?? 0))
        .filter((k) => k > 0);
      const v = vehicles.find((x) => x.id === vehicleId);
      const avgKm = kms.length ? kms.reduce((s, k) => s + k, 0) / kms.length : null;
      const avgLife = lives.length ? lives.reduce((s, k) => s + k, 0) / lives.length : null;
      return {
        vehicleId,
        plate: v?.plate ?? v?.asset_code ?? "—",
        trocas: list.length,
        avgKm,
        intervalo: gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null,
        vidaPct: avgKm !== null && avgLife ? (avgKm / avgLife) * 100 : null,
      };
    });
    rows.sort((a, b) => b.trocas - a.trocas);

    const allKms = removals
      .map((r) => Number(tireById.get(r.tire_id)?.accumulated_km ?? 0))
      .filter((k) => k > 0);
    const allGaps = rows.filter((r) => r.intervalo !== null).map((r) => r.intervalo as number);

    const nearEnd = tires
      .filter((t) => t.status === "instalado" && Number(t.expected_life_km ?? 0) > 0)
      .map((t) => {
        const used =
          Number(t.accumulated_km ?? 0) +
          (t.install_km && t.vehicle?.current_km
            ? Math.max(0, Number(t.vehicle.current_km) - Number(t.install_km))
            : 0);
        return { t, pct: (used / Number(t.expected_life_km)) * 100, used };
      })
      .filter((x) => x.pct >= 85)
      .sort((a, b) => b.pct - a.pct);

    return {
      rows,
      totalTrocas: removals.length,
      avgKm: allKms.length ? allKms.reduce((s, k) => s + k, 0) / allKms.length : null,
      avgGap: allGaps.length ? allGaps.reduce((s, g) => s + g, 0) / allGaps.length : null,
      nearEnd,
    };
  }, [removals, tires, vehicles]);

  return (
    <div className="mb-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Box
          title="Trocas nos últimos 12 meses"
          value={String(view.totalTrocas)}
          help={HELP["trocas"]!}
        />
        <Box
          title="KM médio por pneu retirado"
          value={view.avgKm === null ? "—" : `${formatNumberBR(view.avgKm, 0)} km`}
          help={HELP["km"]!}
        />
        <Box
          title="Dias entre trocas (média)"
          value={view.avgGap === null ? "—" : `${formatNumberBR(view.avgGap, 0)} dias`}
          help={HELP["intervalo"]!}
        />
        <Box
          title="Pneus perto do fim da vida"
          value={String(view.nearEnd.length)}
          help={HELP["fim"]!}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border bg-card p-4 shadow-card">
          <h3 className="mb-2 text-sm font-semibold">Frequência de troca por veículo (12 meses)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Veículo</TableHead>
                <TableHead className="text-right">Trocas</TableHead>
                <TableHead className="text-right">KM médio</TableHead>
                <TableHead className="text-right">Dias entre trocas</TableHead>
                <TableHead className="text-right">Vida útil usada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhuma troca de pneu registrada nos últimos 12 meses.
                  </TableCell>
                </TableRow>
              )}
              {view.rows.map((r) => (
                <TableRow key={r.vehicleId}>
                  <TableCell className="font-medium">{r.plate}</TableCell>
                  <TableCell className="text-right">{r.trocas}</TableCell>
                  <TableCell className="text-right">
                    {r.avgKm === null ? "—" : formatNumberBR(r.avgKm, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.intervalo === null ? "—" : formatNumberBR(r.intervalo, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.vidaPct === null ? "—" : `${formatNumberBR(r.vidaPct, 0)}%`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-card p-4 shadow-card">
          <h3 className="mb-2 text-sm font-semibold">Pneus instalados perto do fim da vida útil</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pneu</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead className="text-right">KM rodado</TableHead>
                <TableHead className="text-right">Vida usada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.nearEnd.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    Nenhum pneu perto do limite.
                  </TableCell>
                </TableRow>
              )}
              {view.nearEnd.map(({ t, pct, used }) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.code}</TableCell>
                  <TableCell>{t.vehicle?.plate ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatNumberBR(used, 0)}</TableCell>
                  <TableCell className="text-right">{formatNumberBR(pct, 0)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
