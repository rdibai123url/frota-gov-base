/**
 * Manutenção avançada — regras, tabelas de apoio e consultas.
 *
 * Origem: editais de Cachoeiro de Itapemirim/ES, CRMV-PR, DNIT/Sede e Imperatriz/MA.
 * Aqui ficam as tabelas de regras do órgão (alçadas, tempos padrão, prazos de devolução,
 * limites de lavagem), a origem da peça e os cálculos de prazo em dias úteis.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type ApprovalLimit = Tables["approval_limits"]["Row"];
export type LaborTimeStandard = Tables["labor_time_standards"]["Row"];
export type MaintenanceDeadline = Tables["maintenance_deadlines"]["Row"];
export type CleaningRule = Tables["cleaning_rules"]["Row"];
export type MaintenanceSettingsRow = Tables["maintenance_settings"]["Row"];

/* ------------------------------ origem da peça ----------------------------- */

export const PART_ORIGINS = [
  { value: "genuina", label: "Genuína (da montadora)" },
  { value: "original", label: "Original (do fabricante)" },
  { value: "paralela", label: "Paralela (1ª linha) — exige aprovação" },
  { value: "recondicionada", label: "Recondicionada — só em caráter excepcional" },
] as const;

export type PartOrigin = (typeof PART_ORIGINS)[number]["value"];

export const partOriginLabel = (v: string | null | undefined) =>
  PART_ORIGINS.find((o) => o.value === v)?.label ?? v ?? "—";

/** Paralela e recondicionada só podem ser usadas com justificativa aprovada. */
export const originNeedsNote = (v: string | null | undefined) =>
  v === "paralela" || v === "recondicionada";

export const PART_DESTINATIONS = [
  { value: "nao_aplicavel", label: "Não se aplica" },
  { value: "entregue_servidor", label: "Entregue ao servidor" },
  { value: "descartada", label: "Descartada corretamente" },
] as const;

export const partDestinationLabel = (v: string | null | undefined) =>
  PART_DESTINATIONS.find((o) => o.value === v)?.label ?? v ?? "—";

export const TIME_SOURCES = ["Audatex", "Molicar", "Fabricante", "Interna"] as const;

export const APPROVAL_ROLES: { value: Database["public"]["Enums"]["app_role"]; label: string }[] = [
  { value: "fleet_manager", label: "Gestor de frota" },
  { value: "unit_manager", label: "Responsável de unidade" },
  { value: "operator", label: "Operador" },
  { value: "auditor", label: "Controlador / auditoria" },
];

export const approvalRoleLabel = (v: string) =>
  APPROVAL_ROLES.find((r) => r.value === v)?.label ?? v;

/* --------------------------------- prazos --------------------------------- */

/** Soma dias úteis (segunda a sexta) a uma data. Feriados não são considerados. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d;
}

/** Dias úteis entre duas datas (a primeira não conta). */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  const d = new Date(from);
  let n = 0;
  while (d < to) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && d <= to) n += 1;
  }
  return n;
}

/**
 * Prazo de devolução aplicável, do mais específico para o mais geral:
 * tipo de veículo + natureza, só tipo, só natureza, regra geral.
 */
export function resolveDeadlineDays(
  rules: MaintenanceDeadline[],
  vehicleType: string | null | undefined,
  kind: string | null | undefined,
): number | null {
  const active = rules.filter((r) => r.active);
  const pick = (t: string | null, k: string | null) =>
    active.find((r) => (r.vehicle_type ?? null) === t && (r.kind ?? null) === k);
  const rule =
    (vehicleType && kind ? pick(vehicleType, kind) : undefined) ??
    (vehicleType ? pick(vehicleType, null) : undefined) ??
    (kind ? pick(null, kind) : undefined) ??
    pick(null, null);
  return rule ? Number(rule.business_days) : null;
}

/* ------------------------------ tempos padrão ------------------------------ */

/** Procura o tempo padrão de um serviço pelo nome (sem acentos, por trecho). */
export function findStandardHours(
  standards: LaborTimeStandard[],
  serviceText: string,
  vehicleType?: string | null,
): LaborTimeStandard | null {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const text = fold(serviceText);
  if (!text.trim()) return null;
  const matches = standards.filter((s) => s.active && text.includes(fold(s.service_name)));
  if (matches.length === 0) return null;
  return (
    matches.find((s) => s.vehicle_type && s.vehicle_type === vehicleType) ??
    matches.find((s) => !s.vehicle_type) ??
    matches[0] ??
    null
  );
}

/* --------------------------------- consultas -------------------------------- */

function useOrgTable<T>(key: string, table: keyof Tables, order: string) {
  return useQuery({
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as "approval_limits")
        .select("*")
        .order(order);
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });
}

export const useApprovalLimits = () =>
  useOrgTable<ApprovalLimit>("approval-limits", "approval_limits", "role");
export const useLaborTimeStandards = () =>
  useOrgTable<LaborTimeStandard>("labor-time-standards", "labor_time_standards", "service_name");
export const useMaintenanceDeadlines = () =>
  useOrgTable<MaintenanceDeadline>(
    "maintenance-deadlines",
    "maintenance_deadlines",
    "business_days",
  );
export const useCleaningRules = () =>
  useOrgTable<CleaningRule>("cleaning-rules", "cleaning_rules", "created_at");

export function useMaintenanceSettingsFull() {
  return useQuery({
    queryKey: ["maintenance-settings-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_settings").select("*").maybeSingle();
      if (error) throw error;
      return (data ?? null) as MaintenanceSettingsRow | null;
    },
  });
}

/** Garantias de peças e serviços ainda vigentes (ou vencendo em breve). */
export type WarrantyRow = {
  kind: "peca" | "servico";
  id: string;
  vehicleId: string;
  plate: string | null;
  description: string;
  supplierName: string | null;
  recordCode: string | null;
  until: string;
  daysLeft: number;
};

export function useWarranties() {
  return useQuery({
    queryKey: ["warranties"],
    queryFn: async (): Promise<WarrantyRow[]> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const since = new Date(today);
      since.setDate(since.getDate() - 30);
      const sinceStr = since.toISOString().slice(0, 10);
      const [recs, parts] = await Promise.all([
        supabase
          .from("maintenance_records")
          .select(
            "id, code, services, warranty_until, vehicle_id, status, vehicle:vehicles(plate), supplier:suppliers(trade_name, legal_name)",
          )
          .gte("warranty_until", sinceStr)
          .neq("status", "cancelada"),
        supabase
          .from("maintenance_parts")
          .select(
            "id, description, warranty_until, vehicle_id, maintenance_record:maintenance_records(code, supplier:suppliers(trade_name, legal_name)), vehicle:vehicles(plate)",
          )
          .gte("warranty_until", sinceStr),
      ]);
      if (recs.error) throw recs.error;
      if (parts.error) throw parts.error;
      const daysLeft = (d: string) =>
        Math.round((new Date(`${d}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
      const rows: WarrantyRow[] = [];
      for (const r of (recs.data ?? []) as unknown as Array<{
        id: string;
        code: string | null;
        services: string;
        warranty_until: string | null;
        vehicle_id: string;
        vehicle: { plate: string | null } | null;
        supplier: { trade_name: string | null; legal_name: string | null } | null;
      }>) {
        if (!r.warranty_until) continue;
        rows.push({
          kind: "servico",
          id: r.id,
          vehicleId: r.vehicle_id,
          plate: r.vehicle?.plate ?? null,
          description: r.services,
          supplierName: r.supplier?.trade_name || r.supplier?.legal_name || null,
          recordCode: r.code,
          until: r.warranty_until,
          daysLeft: daysLeft(r.warranty_until),
        });
      }
      for (const p of (parts.data ?? []) as unknown as Array<{
        id: string;
        description: string;
        warranty_until: string | null;
        vehicle_id: string;
        vehicle: { plate: string | null } | null;
        maintenance_record: {
          code: string | null;
          supplier: { trade_name: string | null; legal_name: string | null } | null;
        } | null;
      }>) {
        if (!p.warranty_until) continue;
        const s = p.maintenance_record?.supplier;
        rows.push({
          kind: "peca",
          id: p.id,
          vehicleId: p.vehicle_id,
          plate: p.vehicle?.plate ?? null,
          description: p.description,
          supplierName: s?.trade_name || s?.legal_name || null,
          recordCode: p.maintenance_record?.code ?? null,
          until: p.warranty_until,
          daysLeft: daysLeft(p.warranty_until),
        });
      }
      return rows.sort((a, b) => a.daysLeft - b.daysLeft);
    },
  });
}
