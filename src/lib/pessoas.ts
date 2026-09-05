/**
 * FrotaGov — cadastros mestres de pessoas.
 *
 * Duas entidades distintas e complementares:
 *  - `employees` (Funcionários): pessoas do próprio órgão, existam ou não com login.
 *    A função institucional (fiscal, gestor, autorizador…) NÃO se confunde com o
 *    papel de acesso do usuário, que continua em `user_roles`.
 *  - `external_entities` (Pessoas e Empresas Externas): PF/PJ de fora do órgão,
 *    classificadas por categorias reutilizáveis. A mesma entidade pode ser, por
 *    exemplo, fornecedor e oficina, sem duplicar cadastro.
 *
 * Todas as consultas passam pelas políticas de RLS por organização.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Employee = Database["public"]["Tables"]["employees"]["Row"];

export type EmployeeRow = Employee & {
  unit: { id: string; name: string; acronym: string | null } | null;
  user: { id: string; full_name: string | null; email: string | null; active: boolean } | null;
};

/** Funções institucionais do funcionário (múltipla seleção). */
export const EMPLOYEE_FUNCTIONS: { value: string; label: string; help?: string }[] = [
  { value: "fiscal_contrato", label: "Fiscal de contrato" },
  { value: "gestor_contrato", label: "Gestor de contrato" },
  { value: "autorizador", label: "Autorizador" },
  { value: "administrativo", label: "Administrativo" },
  { value: "almoxarifado", label: "Almoxarifado" },
  { value: "diretor", label: "Diretor" },
  { value: "gerente", label: "Gerente" },
  { value: "coordenador", label: "Coordenador" },
  { value: "controlador", label: "Controlador / auditoria" },
  { value: "motorista", label: "Motorista / condutor" },
];

export const EMPLOYEE_FUNCTION_LABELS: Record<string, string> = Object.fromEntries(
  EMPLOYEE_FUNCTIONS.map((f) => [f.value, f.label]),
);

export const employeeFunctionLabel = (v: string) => EMPLOYEE_FUNCTION_LABELS[v] ?? v;

/** Categorias reutilizáveis do cadastro mestre de pessoas e empresas externas. */
export const ENTITY_CATEGORIES: { value: string; label: string }[] = [
  { value: "fornecedor", label: "Fornecedor" },
  { value: "posto", label: "Posto de combustível" },
  { value: "oficina", label: "Oficina" },
  { value: "lava_jato", label: "Lava-jato / higienização" },
  { value: "seguradora", label: "Seguradora" },
  { value: "locadora", label: "Locadora" },
  { value: "terceiro_sinistro", label: "Terceiro envolvido em sinistro" },
  { value: "proprietario_cedente", label: "Proprietário / cedente" },
  { value: "prestador_eventual", label: "Prestador eventual" },
  { value: "outro", label: "Outros" },
];

export const ENTITY_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ENTITY_CATEGORIES.map((c) => [c.value, c.label]),
);

export const entityCategoryLabel = (v: string) => ENTITY_CATEGORY_LABELS[v] ?? v;

/** Alterna um valor dentro de uma lista de múltipla seleção. */
export function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const EMPLOYEE_SELECT =
  "*, unit:units(id, name, acronym), user:profiles!employees_user_id_fkey(id, full_name, email, active)";

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select(EMPLOYEE_SELECT).order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as EmployeeRow[];
    },
  });
}

/** Funcionários ativos que exercem determinada função institucional. */
export function employeesByFunction(rows: EmployeeRow[] | Employee[], fn: string) {
  return (rows as Employee[]).filter((e) => e.active && (e.functions ?? []).includes(fn));
}

export type LegalProvision = Database["public"]["Tables"]["legal_provisions"]["Row"];

/** Dispositivos legais (normas) cadastrados pelo órgão, usados nas diárias. */
export function useLegalProvisions() {
  return useQuery({
    queryKey: ["legal-provisions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("legal_provisions").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as LegalProvision[];
    },
  });
}
