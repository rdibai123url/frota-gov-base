/**
 * Bloco B — Fechamento mensal do Portal da Transparência.
 * Competências (mês/ano), checklist obrigatório, publicações versionadas,
 * chamados de reabertura e integração externa configurável por órgão.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useActiveOrgId } from "@/lib/frotagov";

export type TransparencyPeriod = Database["public"]["Tables"]["transparency_periods"]["Row"];
export type TransparencyPublication =
  Database["public"]["Tables"]["transparency_publications"]["Row"];
export type ReopenRequest = Database["public"]["Tables"]["transparency_reopen_requests"]["Row"];
export type DeliveryAttempt = Database["public"]["Tables"]["transparency_delivery_attempts"]["Row"];
export type PeriodStatus = Database["public"]["Enums"]["transparency_period_status"];
export type IntegrationMode = Database["public"]["Enums"]["transparency_integration_mode"];

/** Itens obrigatórios da conferência mensal antes do fechamento. */
export const CHECKLIST_ITEMS = [
  { key: "frota", label: "Frota conferida (veículos, situações e unidades atualizados)" },
  { key: "abastecimento", label: "Abastecimentos do mês conferidos e sem pendências" },
  { key: "manutencao", label: "Manutenções do mês conferidas (preventivas e corretivas)" },
  { key: "orcamento", label: "Contratos, empenhos e saldos conciliados" },
  { key: "legal", label: "Multas, sinistros e obrigações legais conferidos" },
  { key: "patrimonio", label: "Movimentações patrimoniais do mês conferidas" },
  { key: "validacao", label: "Validação final do responsável pelo órgão" },
] as const;

export type ChecklistEntry = {
  status: "ok" | "na" | "pendente";
  justification?: string;
  at?: string;
};
export type Checklist = Record<string, ChecklistEntry>;

export const STATUS_LABELS: Record<PeriodStatus, string> = {
  aberta: "Aberta",
  em_conferencia: "Em conferência",
  fechada: "Fechada / Publicada",
  reabertura_solicitada: "Reabertura solicitada",
  reaberta: "Reaberta",
  erro_integracao: "Erro de integração externa",
};

export const STATUS_TONE: Record<PeriodStatus, string> = {
  aberta: "bg-secondary text-secondary-foreground",
  em_conferencia: "bg-amber-100 text-amber-900",
  fechada: "bg-emerald-100 text-emerald-900",
  reabertura_solicitada: "bg-blue-100 text-blue-900",
  reaberta: "bg-orange-100 text-orange-900",
  erro_integracao: "bg-destructive/15 text-destructive",
};

export const REQUEST_LABELS: Record<Database["public"]["Enums"]["reopen_request_status"], string> =
  {
    aberto: "Aberto",
    em_analise: "Em análise",
    aprovado: "Aprovado",
    rejeitado: "Rejeitado",
    executado: "Executado",
  };

export const MODE_LABELS: Record<IntegrationMode, string> = {
  desativada: "Desativada (publica apenas no Portal FrotaGov)",
  api: "API do portal municipal (requisição autenticada)",
  webhook: "Webhook do portal municipal",
  arquivo: "Exportação de arquivo para o portal municipal",
};

export const competenceLabel = (year: number, month: number) =>
  `${String(month).padStart(2, "0")}/${year}`;

/** Últimas N competências (mais recente primeiro), incluindo o mês corrente. */
export function lastCompetences(count = 24) {
  const out: { year: number; month: number }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

export function usePeriods() {
  const { data: orgId } = useActiveOrgId();
  return useQuery({
    queryKey: ["transparency-periods", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transparency_periods")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return data as TransparencyPeriod[];
    },
  });
}

export function usePublications() {
  const { data: orgId } = useActiveOrgId();
  return useQuery({
    queryKey: ["transparency-publications", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transparency_publications")
        .select("*, period:transparency_periods(year, month, status)")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Chamados de reabertura. `all = true` traz de todos os órgãos (área de suporte). */
export function useReopenRequests(all = false) {
  const { data: orgId } = useActiveOrgId();
  return useQuery({
    queryKey: ["transparency-reopen", all ? "todos" : orgId],
    enabled: all || !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transparency_reopen_requests")
        .select(
          "*, period:transparency_periods(year, month, status), organization:organizations(legal_name, short_name)",
        )
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDeliveryAttempts() {
  const { data: orgId } = useActiveOrgId();
  return useQuery({
    queryKey: ["transparency-attempts", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transparency_delivery_attempts")
        .select("*")
        .order("attempted_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as DeliveryAttempt[];
    },
  });
}

/** Pendências do checklist: item sem "ok" ou "não se aplica" com justificativa. */
export function checklistPending(checklist: Checklist) {
  return CHECKLIST_ITEMS.filter((item) => {
    const entry = checklist[item.key];
    if (!entry || entry.status === "pendente") return true;
    if (entry.status === "na" && !entry.justification?.trim()) return true;
    return false;
  });
}
