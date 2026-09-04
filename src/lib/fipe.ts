/**
 * Rodada 2 — Etapa 3: apoio de tela para a Tabela FIPE.
 *
 * Nomenclatura obrigatória em todas as telas:
 * "Consulta à Tabela FIPE via provedor configurado".
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/frotagov";
import type { Database } from "@/integrations/supabase/types";

export type MarketValueRow = Database["public"]["Tables"]["asset_market_values"]["Row"];

export const FIPE_DISCLAIMER =
  "Consulta à Tabela FIPE via provedor configurado pelo órgão. O FrotaGov não é a FIPE e não emite valores oficiais.";

export const FIPE_KINDS = [
  { value: "carros", label: "Carros e utilitários leves" },
  { value: "motos", label: "Motocicletas" },
  { value: "caminhoes", label: "Caminhões e ônibus" },
] as const;

export const FIPE_STATUS_LABEL: Record<string, string> = {
  ok: "Consulta concluída",
  sem_retorno: "Sem retorno do provedor",
  manual: "Valor informado manualmente",
};

/** Histórico mensal de valor de mercado de um veículo. */
export function useMarketHistory(vehicleId?: string) {
  return useQuery({
    queryKey: ["asset_market_values", vehicleId],
    enabled: Boolean(vehicleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_market_values")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("reference_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketValueRow[];
    },
  });
}

/** Veículos com situação do vínculo FIPE, para a central de integrações. */
export function useFipeFleet() {
  return useQuery({
    queryKey: ["vehicles", "fipe"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id, plate, asset_code, brand, model, year_model, asset_class, fipe_kind, fipe_code, fipe_brand_code, fipe_brand_name, fipe_model_code, fipe_model_name, fipe_year_code, fipe_value, fipe_reference_label, fipe_reference_date, fipe_last_query_at, fipe_last_status, acquisition_value",
        )
        .order("plate", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Depreciação acumulada em relação ao valor de aquisição. */
export function depreciation(acquisition?: number | null, market?: number | null) {
  if (!acquisition || !market) return null;
  return (acquisition - market) / acquisition;
}
