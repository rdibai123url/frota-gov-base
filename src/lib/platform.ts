/** Fase 8 — hooks da administração da plataforma, logs, relatórios e integrações. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useProfile } from "@/lib/frotagov";

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type ActivityLog = Database["public"]["Tables"]["activity_logs"]["Row"];
export type ApiKey = Database["public"]["Tables"]["org_api_keys"]["Row"];
export type TransparencySettings = Database["public"]["Tables"]["transparency_settings"]["Row"];

export function useIsSuperAdmin() {
  const { data: me, isLoading } = useProfile();
  return { isSuperAdmin: (me?.roles ?? []).includes("super_admin"), isLoading };
}

/** Órgão atualmente em contexto para o Super Admin (null = nenhum). */
export function usePlatformSession() {
  const { isSuperAdmin } = useIsSuperAdmin();
  return useQuery({
    queryKey: ["platform-session", isSuperAdmin],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await supabase
        .from("platform_sessions")
        .select(
          "organization_id, started_at, organization:organizations(id, legal_name, short_name)",
        )
        .eq("user_id", auth.user.id)
        .maybeSingle();
      return data ?? null;
    },
  });
}

export function usePlatformContextActions() {
  const qc = useQueryClient();
  const reset = async () => {
    await qc.cancelQueries();
    qc.clear();
  };
  return {
    async enterOrg(organizationId: string) {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada.");
      const { error } = await supabase.from("platform_sessions").upsert({
        user_id: auth.user.id,
        organization_id: organizationId,
        started_at: new Date().toISOString(),
      });
      if (error) throw error;
      await reset();
    },
    async exitOrg() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { error } = await supabase
        .from("platform_sessions")
        .delete()
        .eq("user_id", auth.user.id);
      if (error) throw error;
      await reset();
    },
  };
}

export function useAllOrganizations() {
  const { isSuperAdmin } = useIsSuperAdmin();
  return useQuery({
    queryKey: ["all-organizations", isSuperAdmin],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("legal_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type LogFilters = {
  q?: string;
  organizationId?: string | null;
  eventType?: string | null;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
};

export function useActivityLogs(filters: LogFilters, enabled = true) {
  return useQuery({
    queryKey: ["activity-logs", filters],
    enabled,
    queryFn: async () => {
      let query = supabase
        .from("activity_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });
      if (filters.organizationId) query = query.eq("organization_id", filters.organizationId);
      if (filters.eventType) query = query.eq("event_type", filters.eventType);
      if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00`);
      if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59`);
      if (filters.q)
        query = query.or(
          `summary.ilike.%${filters.q}%,actor_email.ilike.%${filters.q}%,entity.ilike.%${filters.q}%`,
        );
      const start = filters.page * filters.pageSize;
      const { data, error, count } = await query.range(start, start + filters.pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as ActivityLog[], count: count ?? 0 };
    },
  });
}

export function usePlatformSettings() {
  const { isSuperAdmin } = useIsSuperAdmin();
  return useQuery({
    queryKey: ["platform-settings", isSuperAdmin],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useApiKeys() {
  return useQuery({
    queryKey: ["org-api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_api_keys")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiKey[];
    },
  });
}

export function useTransparencySettings() {
  return useQuery({
    queryKey: ["transparency-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transparency_settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Registra um evento de auditoria funcional (telas e ações do usuário). */
export async function logEvent(input: {
  eventType: string;
  area?: string;
  screen?: string;
  route?: string;
  entity?: string;
  recordId?: string | null;
  action?: string;
  summary?: string;
}) {
  await supabase.rpc("log_event", {
    _event_type: input.eventType,
    _area: input.area ?? null,
    _screen: input.screen ?? null,
    _route: input.route ?? null,
    _entity: input.entity ?? null,
    _record_id: input.recordId ?? null,
    _action: input.action ?? null,
    _summary: input.summary ?? null,
    _old: null,
    _new: null,
  } as never);
}

/* ------------------------------ exportações ----------------------------- */

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Exporta linhas em CSV com separador ";" (compatível com Excel pt-BR). */
export function exportCsv(
  filename: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
) {
  const header = columns.map((c) => csvCell(c.label)).join(";");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Exporta em formato de planilha (XML SpreadsheetML aberto pelo Excel). */
export function exportExcel(
  filename: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
) {
  const esc = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const head = columns
    .map((c) => `<Cell><Data ss:Type="String">${esc(c.label)}</Data></Cell>`)
    .join("");
  const body = rows
    .map(
      (r) =>
        `<Row>${columns
          .map(
            (c) =>
              `<Cell><Data ss:Type="String">${esc(typeof r[c.key] === "object" ? JSON.stringify(r[c.key]) : r[c.key])}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("");
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Dados"><Table><Row>${head}</Row>${body}</Table></Worksheet></Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

export const LOG_EVENT_TYPES = [
  { value: "acesso", label: "Acesso" },
  { value: "seguranca", label: "Segurança" },
  { value: "usuarios", label: "Usuários" },
  { value: "onboarding", label: "Onboarding" },
  { value: "cadastro", label: "Cadastro" },
  { value: "operacao", label: "Operação" },
  { value: "financeiro", label: "Financeiro" },
  { value: "exportacao", label: "Exportação" },
];
