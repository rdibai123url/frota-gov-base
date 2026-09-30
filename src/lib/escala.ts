/**
 * Escala de motoristas por unidade de plantão (ex.: "SAMU — unidade X"), montada mês a mês.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type DutyUnit = Tables["duty_units"]["Row"];
export type DutyShift = Tables["duty_shifts"]["Row"];

export const SHIFT_HOURS = [8, 12, 24] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10" → primeiro e último dia do mês (AAAA-MM-DD). */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(last)}`,
    days: last,
    year: y,
    month: m,
  };
}

export const isoDay = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

/** Horário de término a partir do início e da carga horária. */
export function endTime(start: string, hours: number) {
  const [h = 0, m = 0] = start.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const nextDay = total >= 24 * 60;
  const t = total % (24 * 60);
  return { text: `${pad(Math.floor(t / 60))}:${pad(t % 60)}`, nextDay };
}

export const hhmm = (t: string) => t.slice(0, 5);

export function useDutyUnits() {
  return useQuery({
    queryKey: ["duty-units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("duty_units").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useDutyShifts(unitId: string, month: string) {
  const { from, to } = monthRange(month);
  return useQuery({
    queryKey: ["duty-shifts", unitId, month],
    enabled: Boolean(unitId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("duty_shifts")
        .select("*")
        .eq("duty_unit_id", unitId)
        .gte("shift_date", from)
        .lte("shift_date", to)
        .order("shift_date")
        .limit(5000);
      if (error) throw error;
      return data;
    },
  });
}
