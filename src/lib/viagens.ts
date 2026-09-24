/**
 * FrotaGov — inteligência de viagens (estimativa antes da saída).
 *
 * A partir da rota planejada (distância) e do consumo do próprio veículo,
 * estima litros e custo da viagem. Nada aqui inventa número: se não houver
 * histórico de abastecimento suficiente nem parâmetro cadastrado, o consumo
 * fica em branco e a tela informa isso ao usuário.
 */
import { useMemo } from "react";

import {
  aggregateConsumption,
  matchParameter,
  useConsumptionParameters,
  useConsumptionSegments,
} from "@/lib/inteligencia";

export type ConsumptionEstimate = {
  /** km/l usado na estimativa. */
  kmpl: number | null;
  source: "historico" | "parametro" | null;
  /** Explicação curta mostrada ao usuário. */
  note: string;
};

const HISTORY_MONTHS = 12;

function isoMonthsAgo(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * Consumo médio do veículo: primeiro o histórico real de abastecimentos dos
 * últimos 12 meses; na falta dele, o parâmetro de referência cadastrado.
 */
export function useVehicleConsumption(
  vehicleId: string | null | undefined,
  hints?: {
    assetClass?: string | null;
    category?: string | null;
    brand?: string | null;
    model?: string | null;
  },
): ConsumptionEstimate {
  const enabled = Boolean(vehicleId);
  const { data: segments = [] } = useConsumptionSegments(
    {
      from: isoMonthsAgo(HISTORY_MONTHS),
      to: new Date().toISOString().slice(0, 10),
      vehicleId: vehicleId ?? null,
    },
    enabled,
  );
  const { data: params = [] } = useConsumptionParameters();

  return useMemo(() => {
    if (!vehicleId) {
      return { kmpl: null, source: null, note: "Selecione o veículo para estimar o consumo." };
    }

    const agg = aggregateConsumption(segments, "ativo");
    const mine = agg.find((a) => a.vehicleId === vehicleId) ?? agg[0];
    if (mine && mine.km > 0 && mine.kmL && mine.kmL > 0) {
      return {
        kmpl: Number(mine.kmL.toFixed(2)),
        source: "historico",
        note: "Média real de km/l apurada nos abastecimentos dos últimos 12 meses.",
      };
    }

    const p = matchParameter(
      params,
      {
        vehicleId,
        assetClass: hints?.assetClass ?? null,
        category: hints?.category ?? null,
        brand: hints?.brand ?? null,
        model: hints?.model ?? null,
      },
      "km_l",
    );
    if (p && Number(p.expected_value) > 0) {
      return {
        kmpl: Number(Number(p.expected_value).toFixed(2)),
        source: "parametro",
        note: "Ainda sem histórico suficiente; usando o parâmetro de consumo cadastrado.",
      };
    }

    return {
      kmpl: null,
      source: null,
      note: "Sem histórico de abastecimento nem parâmetro de consumo para este veículo.",
    };
  }, [vehicleId, segments, params, hints?.assetClass, hints?.category, hints?.brand, hints?.model]);
}

export type TripEstimate = {
  /** Distância considerada, já com ida e volta quando marcado. */
  totalKm: number | null;
  liters: number | null;
  cost: number | null;
};

/** Cálculo da viagem: distância × ida e volta, litros e custo quando há preço. */
export function estimateTrip(input: {
  distanceKm: number | null | undefined;
  roundTrip: boolean;
  kmpl: number | null | undefined;
  fuelPrice?: number | null;
}): TripEstimate {
  const one = Number(input.distanceKm ?? 0);
  if (!one || one <= 0) return { totalKm: null, liters: null, cost: null };

  const totalKm = Number((input.roundTrip ? one * 2 : one).toFixed(2));
  const kmpl = Number(input.kmpl ?? 0);
  if (!kmpl || kmpl <= 0) return { totalKm, liters: null, cost: null };

  const liters = Number((totalKm / kmpl).toFixed(2));
  const price = Number(input.fuelPrice ?? 0);
  const cost = price > 0 ? Number((liters * price).toFixed(2)) : null;
  return { totalKm, liters, cost };
}

/** Duração legível a partir de minutos estimados. */
export function durationLabel(minutes: number | null | undefined) {
  const m = Number(minutes ?? 0);
  if (!m || m <= 0) return "—";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h > 0 ? `${h}h${String(rest).padStart(2, "0")}` : `${rest} min`;
}

export const DISTANCE_SOURCE_LABEL: Record<string, string> = {
  nao_calculada: "Distância não calculada",
  rota: "Distância calculada pela rota planejada",
  manual: "Distância informada manualmente",
};

export const CONSUMPTION_SOURCE_LABEL: Record<string, string> = {
  historico: "Consumo médio real do veículo",
  parametro: "Parâmetro de consumo cadastrado",
  manual: "Consumo informado manualmente",
};
