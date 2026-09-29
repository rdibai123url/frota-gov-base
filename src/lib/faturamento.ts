/**
 * Faturamento, gestão do contrato e indicadores de nível de serviço (IMR).
 *
 * Origem: editais do CRMV-PR, DNIT/Sede, UFOB, Cachoeiro de Itapemirim/ES,
 * Imperatriz/MA e Vilhena/RO. Os totais da fatura (taxa de administração,
 * glosa, retenções e valor líquido) são calculados pelo banco.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type Invoice = Tables["billing_invoices"]["Row"];
export type InvoiceItem = Tables["billing_invoice_items"]["Row"];
export type ContractOccurrence = Tables["contract_occurrences"]["Row"];
export type ServiceLevelIndicator = Tables["service_level_indicators"]["Row"];
export type ServiceLevelResult = Tables["service_level_results"]["Row"];

export type InvoiceRow = Invoice & {
  supplier: { id: string; legal_name: string; trade_name: string | null } | null;
  contract: { id: string; number: string } | null;
};

/* --------------------------------- rótulos --------------------------------- */

export const INVOICE_STATUS: Record<string, string> = {
  aberta: "Aberta",
  conferida: "Conferida",
  paga: "Paga",
  cancelada: "Cancelada",
};

export const SOURCE_LABEL: Record<string, string> = {
  abastecimento: "Abastecimento",
  manutencao: "Manutenção",
  lavagem: "Lavagem",
  outro: "Outro",
};

export const OCCURRENCE_KINDS: { value: string; label: string }[] = [
  { value: "ocorrencia", label: "Ocorrência" },
  { value: "notificacao", label: "Notificação à contratada" },
  { value: "advertencia", label: "Advertência" },
  { value: "glosa", label: "Glosa" },
  { value: "atesto", label: "Atesto de execução" },
  { value: "prorrogacao", label: "Prorrogação / aditivo" },
  { value: "reuniao", label: "Reunião" },
];

export const AUTHOR_ROLES: { value: string; label: string }[] = [
  { value: "fiscal_tecnico", label: "Fiscal técnico" },
  { value: "fiscal_administrativo", label: "Fiscal administrativo" },
  { value: "gestor", label: "Gestor do contrato" },
];

export const OCCURRENCE_STATUS: Record<string, string> = {
  aberta: "Aberta",
  atendida: "Atendida",
  encerrada: "Encerrada",
};

export const kindLabel = (v: string) => OCCURRENCE_KINDS.find((k) => k.value === v)?.label ?? v;
export const roleLabel = (v: string) => AUTHOR_ROLES.find((k) => k.value === v)?.label ?? v;

export const IMR_BLOCKS: { value: string; label: string }[] = [
  { value: "abastecimento", label: "Abastecimento" },
  { value: "manutencao", label: "Manutenção" },
  { value: "lavagem", label: "Lavagem" },
  { value: "transversal", label: "Integridade do sistema" },
  { value: "outro", label: "Outro" },
];

export const blockLabel = (v: string) => IMR_BLOCKS.find((b) => b.value === v)?.label ?? v;

/** Faixa de desempenho da nota final (0 a 10). */
export function imrBand(grade: number | null | undefined): {
  label: string;
  tone: "ok" | "warn" | "bad";
} {
  if (grade == null) return { label: "Sem apuração", tone: "warn" };
  if (grade >= 9) return { label: "Ótimo", tone: "ok" };
  if (grade >= 7) return { label: "Bom", tone: "ok" };
  if (grade >= 6) return { label: "Regular", tone: "warn" };
  return { label: "Insatisfatório", tone: "bad" };
}

/** Indicadores-modelo, inspirados no IMR do DNIT/Sede (pesos e metas ajustáveis). */
export const IMR_TEMPLATE: Omit<
  Tables["service_level_indicators"]["Insert"],
  "organization_id" | "contract_id"
>[] = [
  {
    code: "IND-01",
    name: "Disponibilidade da rede de abastecimento",
    block: "abastecimento",
    block_weight: 45,
    weight_in_block: 100,
    target_value: 99,
    kind: "percent_min",
    auto_metric: "nenhum",
    notes: "Abastecimentos realizados com sucesso ÷ (com sucesso + fracassados).",
  },
  {
    code: "IND-02",
    name: "Cobertura da rede de manutenção",
    block: "manutencao",
    block_weight: 40,
    weight_in_block: 70,
    target_value: 98,
    kind: "percent_min",
    auto_metric: "cobertura_manutencao",
    notes: "Solicitações de manutenção atendidas ÷ total de solicitações do mês.",
  },
  {
    code: "IND-03",
    name: "Cumprimento do prazo de cotação (24 h)",
    block: "manutencao",
    block_weight: 40,
    weight_in_block: 30,
    target_value: 90,
    kind: "percent_min",
    auto_metric: "prazo_cotacao",
    notes: "Cotações com proposta recebida em até 24 h ÷ cotações abertas no mês.",
  },
  {
    code: "IND-04",
    name: "Conformidade da cobrança e qualidade da lavagem",
    block: "lavagem",
    block_weight: 15,
    weight_in_block: 100,
    target_value: 0,
    kind: "ocorrencias_max",
    auto_metric: "nenhum",
    notes:
      "Ocorrências de cobrança não autorizada ou dano: 0 = nota 10; 1 = nota 5; 2 ou mais = nota 0.",
  },
];

/* ---------------------------------- mês ------------------------------------ */

/** Primeiro dia do mês, no formato AAAA-MM-DD. */
export function monthStart(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthEnd(monthStartStr: string): string {
  const [y, m] = monthStartStr.split("-").map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/* --------------------------------- consultas -------------------------------- */

export function useInvoices() {
  return useQuery({
    queryKey: ["billing-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_invoices")
        .select("*, supplier:suppliers(id, legal_name, trade_name), contract:contracts(id, number)")
        .order("reference_month", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceRow[];
    },
  });
}

export type InvoiceItemRow = InvoiceItem & { vehicle: { plate: string | null } | null };

export function useInvoiceItems(invoiceId: string | null) {
  return useQuery({
    queryKey: ["billing-invoice-items", invoiceId],
    enabled: Boolean(invoiceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_invoice_items")
        .select("*, vehicle:vehicles(plate)")
        .eq("invoice_id", invoiceId as string)
        .order("service_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceItemRow[];
    },
  });
}

export function useContractOccurrences(contractId: string | null) {
  return useQuery({
    queryKey: ["contract-occurrences", contractId],
    enabled: Boolean(contractId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_occurrences")
        .select("*")
        .eq("contract_id", contractId as string)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractOccurrence[];
    },
  });
}

export function useServiceLevelIndicators(contractId: string | null) {
  return useQuery({
    queryKey: ["service-level-indicators", contractId],
    enabled: Boolean(contractId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_level_indicators")
        .select("*")
        .eq("contract_id", contractId as string)
        .order("code");
      if (error) throw error;
      return (data ?? []) as ServiceLevelIndicator[];
    },
  });
}

export function useServiceLevelResults(contractId: string | null) {
  return useQuery({
    queryKey: ["service-level-results", contractId],
    enabled: Boolean(contractId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_level_results")
        .select("*")
        .eq("contract_id", contractId as string)
        .order("reference_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ServiceLevelResult[];
    },
  });
}

/* ------------------------- operações a faturar (candidatas) ------------------ */

export type Candidate = {
  sourceType: "abastecimento" | "manutencao" | "lavagem";
  sourceId: string;
  vehicleId: string | null;
  plate: string | null;
  description: string;
  date: string;
  amount: number;
};

/**
 * Operações do fornecedor no período que ainda não estão em nenhuma fatura:
 * abastecimentos válidos, manutenções concluídas e lavagens realizadas.
 */
export async function fetchInvoiceCandidates(
  filter: { supplierId?: string | null; contractId?: string | null },
  start: string,
  end: string,
): Promise<Candidate[]> {
  const startTs = `${start}T00:00:00`;
  const endTs = `${end}T23:59:59`;

  const [fuel, maint, clean] = await Promise.all([
    supabase
      .from("fuelings")
      .select(
        "id, fueled_at, quantity, total_value, vehicle_id, vehicle:vehicles(plate), fuel:fuel_types(name)",
      )
      .eq(
        filter.contractId ? "contract_id" : "supplier_id",
        (filter.contractId ?? filter.supplierId) as string,
      )
      .eq("status", "valido")
      .gte("fueled_at", startTs)
      .lte("fueled_at", endTs),
    supabase
      .from("maintenance_records")
      .select(
        "id, code, services, entry_at, exit_at, total_value, labor_value, parts_value, other_value, vehicle_id, vehicle:vehicles(plate)",
      )
      .eq(
        filter.contractId ? "contract_id" : "supplier_id",
        (filter.contractId ?? filter.supplierId) as string,
      )
      .eq("status", "concluida")
      .gte("entry_at", startTs)
      .lte("entry_at", endTs),
    supabase
      .from("vehicle_cleanings")
      .select(
        "id, code, performed_at, total_value, service_types, vehicle_id, vehicle:vehicles(plate)",
      )
      .eq(
        filter.contractId ? "contract_id" : "supplier_id",
        (filter.contractId ?? filter.supplierId) as string,
      )
      .eq("status", "realizada")
      .gte("performed_at", startTs)
      .lte("performed_at", endTs),
  ]);
  if (fuel.error) throw fuel.error;
  if (maint.error) throw maint.error;
  if (clean.error) throw clean.error;

  const out: Candidate[] = [];
  for (const f of (fuel.data ?? []) as unknown as Array<{
    id: string;
    fueled_at: string;
    quantity: number;
    total_value: number | null;
    vehicle_id: string;
    vehicle: { plate: string | null } | null;
    fuel: { name: string } | null;
  }>) {
    out.push({
      sourceType: "abastecimento",
      sourceId: f.id,
      vehicleId: f.vehicle_id,
      plate: f.vehicle?.plate ?? null,
      description: `${f.fuel?.name ?? "Combustível"} — ${Number(f.quantity).toLocaleString("pt-BR")} L`,
      date: f.fueled_at.slice(0, 10),
      amount: Number(f.total_value ?? 0),
    });
  }
  for (const m of (maint.data ?? []) as unknown as Array<{
    id: string;
    code: string | null;
    services: string;
    entry_at: string;
    total_value: number | null;
    labor_value: number;
    parts_value: number;
    other_value: number;
    vehicle_id: string;
    vehicle: { plate: string | null } | null;
  }>) {
    const total =
      m.total_value != null
        ? Number(m.total_value)
        : Number(m.labor_value) + Number(m.parts_value) + Number(m.other_value);
    out.push({
      sourceType: "manutencao",
      sourceId: m.id,
      vehicleId: m.vehicle_id,
      plate: m.vehicle?.plate ?? null,
      description: `${m.code ?? "Manutenção"} — ${m.services}`.slice(0, 240),
      date: m.entry_at.slice(0, 10),
      amount: total,
    });
  }
  for (const c of (clean.data ?? []) as unknown as Array<{
    id: string;
    code: string | null;
    performed_at: string;
    total_value: number;
    service_types: string[];
    vehicle_id: string;
    vehicle: { plate: string | null } | null;
  }>) {
    out.push({
      sourceType: "lavagem",
      sourceId: c.id,
      vehicleId: c.vehicle_id,
      plate: c.vehicle?.plate ?? null,
      description:
        `${c.code ?? "Lavagem"} — ${(c.service_types ?? []).join(", ") || "lavagem"}`.slice(0, 240),
      date: c.performed_at.slice(0, 10),
      amount: Number(c.total_value),
    });
  }

  if (out.length === 0) return out;
  const ids = out.map((c) => c.sourceId);
  const used = await supabase
    .from("billing_invoice_items")
    .select("source_id")
    .in("source_id", ids);
  if (used.error) throw used.error;
  const usedIds = new Set((used.data ?? []).map((r) => r.source_id));
  return out.filter((c) => !usedIds.has(c.sourceId)).sort((a, b) => a.date.localeCompare(b.date));
}
