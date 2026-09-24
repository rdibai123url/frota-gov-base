/**
 * FrotaGov — fechamento de viagem ("Planejado x Realizado").
 *
 * Regras de honestidade do cálculo:
 * - a quilometragem oficial vem SEMPRE do odômetro (retorno − saída);
 * - litros abastecidos NÃO são litros consumidos: só há consumo efetivo
 *   quando existe abastecimento de tanque cheio no início e no fim do
 *   trecho, ambos com odômetro informado;
 * - quando não houver base válida, o resultado explica o motivo em vez de
 *   apresentar um número inventado.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/frotagov";

export type TripFueling = {
  id: string;
  fueled_at: string;
  quantity: number | null;
  unit_price: number | null;
  total_value: number | null;
  odometer_km: number | null;
  full_tank: boolean | null;
  usage_id: string | null;
  vehicle_id: string;
  status: string | null;
};

export type TripResult = {
  /** KM percorrido pelo odômetro (retorno − saída). */
  realKm: number | null;
  plannedKm: number | null;
  diffKm: number | null;
  diffPct: number | null;
  liters: number | null;
  value: number | null;
  avgPrice: number | null;
  /** km/l efetivo — só quando tecnicamente calculável. */
  effectiveKmpl: number | null;
  /** Motivo curto quando o consumo efetivo não pôde ser apurado. */
  effectiveNote: string | null;
  fuelingCount: number;
};

const round = (n: number, d = 2) => Number(n.toFixed(d));

export function computeTripResult(input: {
  startKm: number | null | undefined;
  endKm: number | null | undefined;
  plannedKm: number | null | undefined;
  fuelings: TripFueling[];
}): TripResult {
  const valid = input.fuelings.filter((f) => f.status !== "cancelado");
  const liters = valid.reduce((s, f) => s + Number(f.quantity ?? 0), 0);
  const value = valid.reduce((s, f) => s + Number(f.total_value ?? 0), 0);

  const start = Number(input.startKm ?? NaN);
  const end = Number(input.endKm ?? NaN);
  const realKm =
    Number.isFinite(start) && Number.isFinite(end) && end >= start ? round(end - start, 1) : null;

  const plannedKm = input.plannedKm != null ? round(Number(input.plannedKm), 1) : null;
  const diffKm = realKm != null && plannedKm != null ? round(realKm - plannedKm, 1) : null;
  const diffPct =
    diffKm != null && plannedKm != null && plannedKm > 0
      ? round((diffKm / plannedKm) * 100, 1)
      : null;

  const avgPrice = liters > 0 && value > 0 ? round(value / liters, 3) : null;

  // Consumo efetivo: exige dois abastecimentos de tanque cheio com odômetro.
  const fullTanks = valid
    .filter((f) => f.full_tank && f.odometer_km != null)
    .sort((a, b) => Number(a.odometer_km) - Number(b.odometer_km));

  let effectiveKmpl: number | null = null;
  let effectiveNote: string | null = null;

  if (fullTanks.length >= 2) {
    const first = fullTanks[0]!;
    const last = fullTanks[fullTanks.length - 1]!;
    const km = Number(last.odometer_km) - Number(first.odometer_km);
    // Consome-se o que foi abastecido DEPOIS do primeiro tanque cheio.
    const usedLiters = fullTanks.slice(1).reduce((s, f) => s + Number(f.quantity ?? 0), 0);
    if (km > 0 && usedLiters > 0) {
      effectiveKmpl = round(km / usedLiters, 2);
    } else {
      effectiveNote =
        "Os abastecimentos de tanque cheio não têm diferença de odômetro ou litros suficiente para o cálculo.";
    }
  } else if (valid.length === 0) {
    effectiveNote = "Nenhum abastecimento vinculado a esta viagem.";
  } else {
    effectiveNote =
      "Consumo efetivo indisponível: é necessário um abastecimento de tanque cheio no início e outro no fim do trecho, ambos com odômetro.";
  }

  return {
    realKm,
    plannedKm,
    diffKm,
    diffPct,
    liters: liters > 0 ? round(liters, 2) : null,
    value: value > 0 ? round(value, 2) : null,
    avgPrice,
    effectiveKmpl,
    effectiveNote,
    fuelingCount: valid.length,
  };
}

const FUELING_COLS =
  "id, fueled_at, quantity, unit_price, total_value, odometer_km, full_tank, usage_id, vehicle_id, status";

/** Abastecimentos já vinculados à utilização. */
export function useUsageFuelings(usageId: string | null | undefined) {
  return useQuery({
    queryKey: ["usage-fuelings", usageId],
    enabled: Boolean(usageId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuelings")
        .select(FUELING_COLS)
        .eq("usage_id", usageId as string)
        .order("fueled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TripFueling[];
    },
  });
}

/**
 * Abastecimentos do mesmo veículo dentro do período da viagem que ainda não
 * estão vinculados a nenhuma utilização. A RLS já restringe ao órgão.
 */
export function useCandidateFuelings(args: {
  vehicleId: string | null | undefined;
  from: string | null | undefined;
  to: string | null | undefined;
  enabled: boolean;
}) {
  const { vehicleId, from, to, enabled } = args;
  return useQuery({
    queryKey: ["usage-fuelings-candidates", vehicleId, from, to],
    enabled: enabled && Boolean(vehicleId && from),
    queryFn: async () => {
      let q = supabase
        .from("fuelings")
        .select(FUELING_COLS)
        .eq("vehicle_id", vehicleId as string)
        .is("usage_id", null)
        .gte("fueled_at", from as string)
        .order("fueled_at", { ascending: true })
        .limit(50);
      if (to) q = q.lte("fueled_at", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TripFueling[];
    },
  });
}
