/**
 * Fase 10 — Bloco 2: Inteligência de Consumo e Custos.
 *
 * Fonte única dos indicadores: as funções de banco
 * `fleet_consumption_segments`, `fleet_cost_rows` e `fleet_downtime`
 * (SECURITY DEFINER, sempre restritas ao órgão em contexto por
 * `current_org_id()`). Aqui só há agregação e classificação — nenhum
 * cálculo de consumo é refeito com regra diferente da do banco.
 *
 * Convenções adotadas:
 * - Trecho (segmento) = intervalo entre dois abastecimentos do mesmo ativo.
 *   Os litros do abastecimento atual são atribuídos à distância/horas
 *   percorridas desde o abastecimento anterior (tanque a tanque).
 * - Lubrificantes, fluidos e aditivos (fuel_types.category <> 'combustivel')
 *   nunca entram nos litros nem nos indicadores de eficiência.
 * - Trechos com troca/correção de medidor, medidor regredido ou variação
 *   implausível são marcados como inválidos e ficam fora das médias.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/frotagov";
import type { Database } from "@/integrations/supabase/types";

/* ------------------------------ tipos ---------------------------------- */

export type ConsumptionSegment =
  Database["public"]["Functions"]["fleet_consumption_segments"]["Returns"][number];
export type CostRow = Database["public"]["Functions"]["fleet_cost_rows"]["Returns"][number];
export type DowntimeRow = Database["public"]["Functions"]["fleet_downtime"]["Returns"][number];
export type ConsumptionParameter =
  Database["public"]["Tables"]["consumption_parameters"]["Row"];
export type IntelligenceSettings =
  Database["public"]["Tables"]["intelligence_settings"]["Row"];
export type MeterCorrection = Database["public"]["Tables"]["meter_corrections"]["Row"];

export type IntelFilters = {
  from: string;
  to: string;
  unitId?: string | null;
  costCenterId?: string | null;
  vehicleId?: string | null;
  assetClass?: string | null;
  driverId?: string | null;
  fuelTypeId?: string | null;
};

export const DEFAULT_SETTINGS = {
  default_tolerance_pct: 10,
  critical_pct: 25,
  max_km_segment: 3000,
  max_hours_segment: 500,
  min_minutes_between_fuelings: 60,
  efficiency_drop_pct: 20,
  maintenance_cost_alert: 10000,
  cost_deviation_pct: 80,
  min_segments_for_alert: 3,
  alerts_enabled: true,
};

/* ------------------------------- hooks --------------------------------- */

const nn = (v?: string | null) => (v && v !== "todos" && v !== "todas" ? v : undefined);

export function useConsumptionSegments(f: IntelFilters, enabled = true) {
  return useQuery({
    queryKey: ["intel-segments", f],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fleet_consumption_segments", {
        _from: f.from,
        _to: f.to,
        _unit: nn(f.unitId),
        _cost_center: nn(f.costCenterId),
        _vehicle: nn(f.vehicleId),
        _asset_class: nn(f.assetClass),
        _driver: nn(f.driverId),
        _fuel: nn(f.fuelTypeId),
      });
      if (error) throw error;
      return (data ?? []) as ConsumptionSegment[];
    },
  });
}

export function useCostRows(f: IntelFilters, enabled = true) {
  return useQuery({
    queryKey: ["intel-costs", f.from, f.to, f.unitId, f.costCenterId, f.vehicleId, f.assetClass],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fleet_cost_rows", {
        _from: f.from,
        _to: f.to,
        _unit: nn(f.unitId),
        _cost_center: nn(f.costCenterId),
        _vehicle: nn(f.vehicleId),
        _asset_class: nn(f.assetClass),
      });
      if (error) throw error;
      return (data ?? []) as CostRow[];
    },
  });
}

export function useDowntime(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["intel-downtime", from, to],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fleet_downtime", { _from: from, _to: to });
      if (error) throw error;
      return (data ?? []) as DowntimeRow[];
    },
  });
}

export function useConsumptionParameters() {
  return useQuery({
    queryKey: ["consumption-parameters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consumption_parameters")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConsumptionParameter[];
    },
  });
}

export function useIntelligenceSettings() {
  return useQuery({
    queryKey: ["intelligence-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("intelligence_settings").select("*").maybeSingle();
      if (error) throw error;
      return (data ?? null) as IntelligenceSettings | null;
    },
  });
}

export function useMeterCorrections(vehicleId?: string | null) {
  return useQuery({
    queryKey: ["meter-corrections", vehicleId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("meter_corrections")
        .select("*, vehicle:vehicles(id, plate, asset_code)")
        .order("occurred_at", { ascending: false });
      if (vehicleId) q = q.eq("vehicle_id", vehicleId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as (MeterCorrection & {
        vehicle: { id: string; plate: string | null; asset_code: string | null } | null;
      })[];
    },
  });
}

/* --------------------------- agregação de consumo ----------------------- */

export type ConsumptionAgg = {
  key: string;
  label: string;
  assetClass: string;
  meterKind: string;
  liters: number;
  km: number;
  hours: number;
  value: number;
  segments: number;
  invalidSegments: number;
  /** km/L — só quando há distância apurada em trechos válidos. */
  kmL: number | null;
  /** L/h — só quando há horas apuradas em trechos válidos. */
  lH: number | null;
  costPerKm: number | null;
  costPerHour: number | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  vehicleId: string | null;
};

export type Dimension =
  | "ativo"
  | "marca_modelo"
  | "categoria"
  | "unidade"
  | "centro_custo"
  | "condutor"
  | "combustivel";

export const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "ativo", label: "Ativo (veículo / equipamento)" },
  { value: "marca_modelo", label: "Marca e modelo" },
  { value: "categoria", label: "Tipo de ativo" },
  { value: "unidade", label: "Secretaria / unidade" },
  { value: "centro_custo", label: "Centro de custo" },
  { value: "condutor", label: "Condutor / operador" },
  { value: "combustivel", label: "Combustível" },
];

function dimKey(s: ConsumptionSegment, d: Dimension): [string, string] {
  switch (d) {
    case "marca_modelo":
      return [`${s.brand ?? ""}|${s.model ?? ""}`, [s.brand, s.model].filter(Boolean).join(" ") || "Sem marca/modelo"];
    case "categoria":
      return [s.category ?? "—", s.category ?? "Sem tipo"];
    case "unidade":
      return [s.unit_id ?? "—", s.unit_name ?? "Sem unidade"];
    case "centro_custo":
      return [s.cost_center_id ?? "—", s.cost_center_name ?? "Sem centro de custo"];
    case "condutor":
      return [s.driver_id ?? "—", s.driver_name ?? "Sem condutor informado"];
    case "combustivel":
      return [s.fuel_type_id ?? "—", s.fuel_name ?? "Sem combustível"];
    default:
      return [s.vehicle_id, s.asset_label];
  }
}

/** Consolida os trechos por dimensão. Trechos inválidos entram só na contagem. */
export function aggregateConsumption(
  segments: ConsumptionSegment[],
  dimension: Dimension = "ativo",
): ConsumptionAgg[] {
  const map = new Map<string, ConsumptionAgg>();
  for (const s of segments) {
    const [key, lbl] = dimKey(s, dimension);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        label: lbl,
        assetClass: s.asset_class ?? "veiculo",
        meterKind: s.meter_kind ?? "hodometro",
        liters: 0,
        km: 0,
        hours: 0,
        value: 0,
        segments: 0,
        invalidSegments: 0,
        kmL: null,
        lH: null,
        costPerKm: null,
        costPerHour: null,
        brand: s.brand ?? null,
        model: s.model ?? null,
        category: s.category ?? null,
        vehicleId: dimension === "ativo" ? s.vehicle_id : null,
      };
      map.set(key, row);
    }
    row.value += Number(s.value ?? 0);
    if (!s.valid) {
      row.invalidSegments += 1;
      continue;
    }
    row.segments += 1;
    row.liters += Number(s.liters ?? 0);
    row.km += Number(s.distance_km ?? 0);
    row.hours += Number(s.hours ?? 0);
  }
  for (const row of map.values()) {
    row.kmL = row.km > 0 && row.liters > 0 ? row.km / row.liters : null;
    row.lH = row.hours > 0 && row.liters > 0 ? row.liters / row.hours : null;
    row.costPerKm = row.km > 0 ? row.value / row.km : null;
    row.costPerHour = row.hours > 0 ? row.value / row.hours : null;
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/* ------------------------- parâmetros e desvios ------------------------- */

export type DeviationClass = "dentro" | "atencao" | "critico" | "sem_parametro";

export const DEVIATION_LABEL: Record<DeviationClass, string> = {
  dentro: "Dentro da média",
  atencao: "Atenção",
  critico: "Crítico",
  sem_parametro: "Sem parâmetro definido",
};

/** Escolhe o parâmetro mais específico aplicável (ativo > modelo > categoria > órgão). */
export function matchParameter(
  params: ConsumptionParameter[],
  asset: {
    vehicleId?: string | null;
    assetClass?: string | null;
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    fuelTypeId?: string | null;
  },
  metric: "km_l" | "l_h",
): ConsumptionParameter | null {
  const rank: Record<string, number> = { ativo: 1, modelo: 2, categoria: 3, orgao: 4 };
  const applicable = params.filter(
    (p) =>
      p.active &&
      p.metric === metric &&
      (!p.vehicle_id || p.vehicle_id === asset.vehicleId) &&
      (!p.asset_class || p.asset_class === (asset.assetClass ?? "veiculo")) &&
      (!p.category || p.category === asset.category) &&
      (!p.brand || p.brand === asset.brand) &&
      (!p.model || p.model === asset.model) &&
      (!p.fuel_type_id || p.fuel_type_id === asset.fuelTypeId),
  );
  applicable.sort((a, b) => (rank[a.scope] ?? 9) - (rank[b.scope] ?? 9));
  return applicable[0] ?? null;
}

/**
 * Classificação transparente do desvio:
 * - km/L: quanto MENOR que o esperado, pior.
 * - L/h: quanto MAIOR que o esperado, pior.
 */
export function classifyDeviation(
  actual: number | null,
  param: ConsumptionParameter | null,
): { klass: DeviationClass; deviationPct: number | null } {
  if (actual == null || !param) return { klass: "sem_parametro", deviationPct: null };
  const expected = Number(param.expected_value);
  if (!expected) return { klass: "sem_parametro", deviationPct: null };
  const raw = ((actual - expected) / expected) * 100;
  const bad = param.metric === "km_l" ? -raw : raw; // percentual "ruim"
  const tol = Number(param.tolerance_pct);
  const crit = Number(param.critical_pct);
  const klass: DeviationClass = bad > crit ? "critico" : bad > tol ? "atencao" : "dentro";
  return { klass, deviationPct: raw };
}

export type Anomaly = {
  fuelingId: string;
  vehicleId: string;
  asset: string;
  at: string;
  type: string;
  detail: string;
  severity: "atencao" | "critico";
};

/**
 * Anomalias por trecho: salto de consumo, distância incompatível,
 * abastecimentos muito próximos e medidor inconsistente.
 * A regressão de medidor já é bloqueada no registro do abastecimento;
 * aqui ela aparece apenas como trecho descartado da média.
 */
export function detectAnomalies(
  segments: ConsumptionSegment[],
  settings: Pick<IntelligenceSettings, "efficiency_drop_pct"> | null,
): Anomaly[] {
  const drop = Number(settings?.efficiency_drop_pct ?? DEFAULT_SETTINGS.efficiency_drop_pct);
  const byVehicle = new Map<string, ConsumptionSegment[]>();
  for (const s of segments) {
    const list = byVehicle.get(s.vehicle_id) ?? [];
    list.push(s);
    byVehicle.set(s.vehicle_id, list);
  }
  const out: Anomaly[] = [];
  for (const [vehicleId, list] of byVehicle) {
    const valid = list.filter((s) => s.valid);
    const efficiencies = valid
      .map((s) => {
        const km = Number(s.distance_km ?? 0);
        const hours = Number(s.hours ?? 0);
        const liters = Number(s.liters ?? 0);
        if (!liters) return null;
        if (km > 0) return { s, metric: "km_l" as const, v: km / liters };
        if (hours > 0) return { s, metric: "l_h" as const, v: liters / hours };
        return null;
      })
      .filter((x): x is { s: ConsumptionSegment; metric: "km_l" | "l_h"; v: number } => !!x);
    const avg = efficiencies.length
      ? efficiencies.reduce((t, e) => t + e.v, 0) / efficiencies.length
      : 0;

    for (const s of list) {
      if (s.too_close) {
        out.push({
          fuelingId: s.fueling_id,
          vehicleId,
          asset: s.asset_label,
          at: s.fueled_at,
          type: "Abastecimentos muito próximos",
          detail: "Intervalo menor que o mínimo configurado em relação ao abastecimento anterior.",
          severity: "atencao",
        });
      }
      if (!s.valid && s.invalid_reason && s.invalid_reason !== "primeiro abastecimento do ativo") {
        out.push({
          fuelingId: s.fueling_id,
          vehicleId,
          asset: s.asset_label,
          at: s.fueled_at,
          type: "Trecho descartado da média",
          detail: s.invalid_reason,
          severity: s.invalid_reason.includes("implausível") ? "critico" : "atencao",
        });
      }
    }

    if (efficiencies.length >= 3 && avg > 0) {
      for (const e of efficiencies) {
        const bad = e.metric === "km_l" ? ((avg - e.v) / avg) * 100 : ((e.v - avg) / avg) * 100;
        if (bad > drop) {
          out.push({
            fuelingId: e.s.fueling_id,
            vehicleId,
            asset: e.s.asset_label,
            at: e.s.fueled_at,
            type: "Salto de consumo",
            detail: `Eficiência do trecho ${e.v.toFixed(2)} ${
              e.metric === "km_l" ? "km/L" : "L/h"
            } contra média de ${avg.toFixed(2)} do próprio ativo (desvio de ${bad.toFixed(0)}%).`,
            severity: bad > drop * 2 ? "critico" : "atencao",
          });
        }
      }
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/* ------------------------------- custos --------------------------------- */

export const COST_CATEGORIES = [
  { value: "combustivel", label: "Combustível" },
  { value: "manutencao", label: "Manutenção" },
  { value: "pecas", label: "Peças" },
  { value: "pneus", label: "Pneus" },
  { value: "limpeza", label: "Limpeza / higienização" },
  { value: "seguro", label: "Seguros" },
  { value: "multas", label: "Multas" },
  { value: "obrigacoes", label: "Obrigações legais" },
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number]["value"];

export const costCategoryLabel = (v: string) =>
  COST_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export type CostTotals = Record<string, number> & { total: number };

const emptyTotals = (): CostTotals => {
  const base = { total: 0 } as CostTotals;
  for (const c of COST_CATEGORIES) base[c.value] = 0;
  return base;
};

export type AssetCost = {
  vehicleId: string;
  label: string;
  assetClass: string;
  unitName: string | null;
  costCenterName: string | null;
  totals: CostTotals;
};

export function costsByAsset(rows: CostRow[]): AssetCost[] {
  const map = new Map<string, AssetCost>();
  for (const r of rows) {
    let a = map.get(r.vehicle_id);
    if (!a) {
      a = {
        vehicleId: r.vehicle_id,
        label: r.asset_label,
        assetClass: r.asset_class ?? "veiculo",
        unitName: r.unit_name ?? null,
        costCenterName: r.cost_center_name ?? null,
        totals: emptyTotals(),
      };
      map.set(r.vehicle_id, a);
    }
    a.totals[r.category] = (a.totals[r.category] ?? 0) + Number(r.value ?? 0);
    a.totals.total += Number(r.value ?? 0);
  }
  return Array.from(map.values()).sort((a, b) => b.totals.total - a.totals.total);
}

/** Série mensal por categoria: [{ competencia: '2026-01', combustivel: x, ..., total }] */
export function costsByMonth(rows: CostRow[]) {
  const map = new Map<string, CostTotals & { competencia: string }>();
  for (const r of rows) {
    const key = String(r.competence).slice(0, 7);
    let m = map.get(key);
    if (!m) {
      m = { competencia: key, ...emptyTotals() };
      map.set(key, m);
    }
    m[r.category] = (m[r.category] ?? 0) + Number(r.value ?? 0);
    m.total += Number(r.value ?? 0);
  }
  return Array.from(map.values()).sort((a, b) => a.competencia.localeCompare(b.competencia));
}

export function costsByGroup(rows: CostRow[], group: "unidade" | "centro_custo") {
  const map = new Map<string, CostTotals & { label: string }>();
  for (const r of rows) {
    const lbl =
      group === "unidade"
        ? (r.unit_name ?? "Sem unidade")
        : (r.cost_center_name ?? "Sem centro de custo");
    let m = map.get(lbl);
    if (!m) {
      m = { label: lbl, ...emptyTotals() };
      map.set(lbl, m);
    }
    m[r.category] = (m[r.category] ?? 0) + Number(r.value ?? 0);
    m.total += Number(r.value ?? 0);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

/* ------------------------------ economicidade ---------------------------- */

export type EconomicityRow = {
  vehicleId: string;
  label: string;
  assetClass: string;
  ageYears: number | null;
  acquisitionValue: number | null;
  periodCost: number;
  maintenanceCost: number;
  costPerKm: number | null;
  costPerHour: number | null;
  downtimeDays: number;
  deviation: DeviationClass;
  score: number;
  klass: "saudavel" | "atencao" | "custo_elevado";
  reasons: string[];
};

export const ECONOMICITY_LABEL: Record<EconomicityRow["klass"], string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  custo_elevado: "Custo elevado",
};

/**
 * Indicador de economicidade — fórmula transparente e sem decisão automática
 * de alienação ou substituição. Pontuação 0 a 100 (quanto maior, pior):
 *   30 pts — custo por km/hora do ativo frente à mediana dos ativos comparáveis
 *   25 pts — custo acumulado no período frente ao valor de aquisição
 *   20 pts — participação da manutenção no custo total do ativo
 *   15 pts — idade do ativo (referência de 15 anos)
 *   10 pts — indisponibilidade por manutenção no período
 * Classificação: até 40 saudável, 41 a 70 atenção, acima de 70 custo elevado.
 * Valor de mercado (FIPE) ainda não integrado — não compõe a pontuação.
 */
export function economicity(input: {
  costs: AssetCost[];
  consumption: ConsumptionAgg[];
  downtime: DowntimeRow[];
  vehicles: {
    id: string;
    acquisition_value?: number | null;
    acquisition_date?: string | null;
    year_model?: number | null;
    asset_class?: string | null;
  }[];
  deviations?: Map<string, DeviationClass>;
  periodDays: number;
}): EconomicityRow[] {
  const { costs, consumption, downtime, vehicles, deviations, periodDays } = input;
  const consMap = new Map(consumption.filter((c) => c.vehicleId).map((c) => [c.vehicleId!, c]));
  const downMap = new Map(downtime.map((d) => [d.vehicle_id, Number(d.days ?? 0)]));
  const vehMap = new Map(vehicles.map((v) => [v.id, v]));
  const now = new Date();

  const unitCosts: { klass: string; v: number }[] = [];
  for (const c of costs) {
    const cons = consMap.get(c.vehicleId);
    const per = cons?.km ? c.totals.total / cons.km : cons?.hours ? c.totals.total / cons.hours : null;
    if (per != null && per > 0) unitCosts.push({ klass: c.assetClass, v: per });
  }
  const medianFor = (klass: string) => {
    const vals = unitCosts.filter((u) => u.klass === klass).map((u) => u.v).sort((a, b) => a - b);
    if (!vals.length) return null;
    return vals[Math.floor(vals.length / 2)] ?? null;
  };

  return costs
    .map((c) => {
      const cons = consMap.get(c.vehicleId);
      const v = vehMap.get(c.vehicleId);
      const reasons: string[] = [];
      let score = 0;

      const costPerKm = cons?.km ? c.totals.total / cons.km : null;
      const costPerHour = cons?.hours ? c.totals.total / cons.hours : null;
      const unitCost = costPerKm ?? costPerHour;
      const median = medianFor(c.assetClass);
      if (unitCost != null && median) {
        const ratio = unitCost / median;
        const pts = Math.max(0, Math.min(30, (ratio - 1) * 30));
        score += pts;
        if (ratio > 1.2)
          reasons.push(`Custo por ${costPerKm != null ? "km" : "hora"} ${((ratio - 1) * 100).toFixed(0)}% acima da mediana dos ativos comparáveis.`);
      }

      const acq = Number(v?.acquisition_value ?? 0);
      if (acq > 0) {
        const share = c.totals.total / acq;
        const pts = Math.min(25, share * 100);
        score += pts;
        if (share > 0.1)
          reasons.push(`Custos do período equivalem a ${(share * 100).toFixed(1)}% do valor de aquisição.`);
      }

      const maint = (c.totals["manutencao"] ?? 0) + (c.totals["pecas"] ?? 0);
      if (c.totals.total > 0) {
        const share = maint / c.totals.total;
        score += Math.min(20, share * 25);
        if (share > 0.5) reasons.push(`Manutenção e peças representam ${(share * 100).toFixed(0)}% do custo total.`);
      }

      let ageYears: number | null = null;
      if (v?.acquisition_date) {
        ageYears = (now.getTime() - new Date(v.acquisition_date).getTime()) / (365.25 * 86400000);
      } else if (v?.year_model) {
        ageYears = now.getFullYear() - Number(v.year_model);
      }
      if (ageYears != null) {
        score += Math.max(0, Math.min(15, (ageYears / 15) * 15));
        if (ageYears > 10) reasons.push(`Ativo com ${ageYears.toFixed(0)} anos.`);
      }

      const down = downMap.get(c.vehicleId) ?? 0;
      if (periodDays > 0) {
        const share = down / periodDays;
        score += Math.max(0, Math.min(10, share * 40));
        if (share > 0.1) reasons.push(`Indisponível ${down.toFixed(1)} dia(s) por manutenção no período.`);
      }

      const dev = deviations?.get(c.vehicleId) ?? "sem_parametro";
      if (dev === "critico") {
        score += 10;
        reasons.push("Consumo classificado como crítico frente ao parâmetro.");
      } else if (dev === "atencao") {
        score += 5;
        reasons.push("Consumo em faixa de atenção frente ao parâmetro.");
      }

      score = Math.max(0, Math.min(100, score));
      const klass: EconomicityRow["klass"] =
        score > 70 ? "custo_elevado" : score > 40 ? "atencao" : "saudavel";

      return {
        vehicleId: c.vehicleId,
        label: c.label,
        assetClass: c.assetClass,
        ageYears,
        acquisitionValue: acq || null,
        periodCost: c.totals.total,
        maintenanceCost: maint,
        costPerKm,
        costPerHour,
        downtimeDays: down,
        deviation: dev,
        score,
        klass,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/* -------------------------------- utilidades ---------------------------- */

export const monthLabel = (competencia: string) => {
  const [y, m] = competencia.split("-");
  return `${m}/${y}`;
};

/** Período imediatamente anterior, de mesma duração. */
export function previousPeriod(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  const days = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  const prevTo = new Date(a.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(prevFrom), to: iso(prevTo), days };
}

export function periodDays(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
