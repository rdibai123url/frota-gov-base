/**
 * FrotaGov — camada de domínio (Fase 1).
 * Concentra tipos, rótulos e acesso a dados para facilitar a evolução do sistema.
 * Todo acesso é filtrado por organização (multi-tenant) via políticas do banco.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type OrgType = Database["public"]["Enums"]["org_type"];
export type UnitType = Database["public"]["Enums"]["unit_type"];
export type VehicleStatus = Database["public"]["Enums"]["vehicle_status"];

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: "prefeitura", label: "Prefeitura" },
  { value: "camara", label: "Câmara Municipal" },
  { value: "consorcio", label: "Consórcio Público" },
  { value: "autarquia", label: "Autarquia" },
  { value: "fundacao", label: "Fundação" },
  { value: "secretaria", label: "Secretaria" },
  { value: "outro", label: "Outro" },
];

export const AUTHORITY_ROLES = [
  "Prefeito(a)",
  "Secretário(a)",
  "Presidente",
  "Diretor(a)",
  "Superintendente",
  "Outro",
];

export const UNIT_TYPES: { value: UnitType; label: string }[] = [
  { value: "secretaria", label: "Secretaria" },
  { value: "departamento", label: "Departamento" },
  { value: "diretoria", label: "Diretoria" },
  { value: "coordenacao", label: "Coordenação" },
  { value: "unidade", label: "Unidade" },
  { value: "outro", label: "Outro" },
];

export const VEHICLE_STATUS: { value: VehicleStatus; label: string }[] = [
  { value: "ativo", label: "Ativo" },
  { value: "manutencao", label: "Em manutenção" },
  { value: "cedido", label: "Cedido" },
  { value: "inativo", label: "Inativo" },
  { value: "baixado", label: "Baixado" },
];

export const VEHICLE_TYPES = [
  "Automóvel",
  "Caminhonete",
  "Van / Micro-ônibus",
  "Ônibus",
  "Caminhão",
  "Ambulância",
  "Motocicleta",
  "Máquina / Equipamento",
  "Trator",
  "Outro",
];

export const FUEL_TYPES = [
  "Gasolina",
  "Etanol",
  "Flex",
  "Diesel S10",
  "Diesel S500",
  "GNV",
  "Elétrico",
  "Híbrido",
];

export const UF_LIST = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin da plataforma",
  org_admin: "Administrador do órgão",
  fleet_manager: "Gestor de Frota",
  unit_manager: "Secretário / Responsável de Unidade",
  operator: "Operador",
  auditor: "Fiscal / Controladoria (consulta)",
};

export const WRITE_ROLES: AppRole[] = ["super_admin", "org_admin", "fleet_manager", "unit_manager"];

export function label<T extends string>(list: { value: T; label: string }[], value: T | null) {
  return list.find((i) => i.value === value)?.label ?? "—";
}

/* ------------------------------- sessão -------------------------------- */

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
      ]);
      return {
        profile: profile ?? null,
        email: auth.user.email ?? "",
        roles: (roles ?? []).map((r) => r.role as AppRole),
      };
    },
  });
}

export function useOrganization() {
  return useQuery({
    queryKey: ["organization"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useBrasaoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["brasao", path],
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      if (!path) return null;
      if (path.startsWith("http")) return path;
      const { data } = await supabase.storage.from("brasoes").createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
}

/* -------------------------------- dados -------------------------------- */

export function useUnits() {
  return useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("plate");
      if (error) throw error;
      return data;
    },
  });
}

export function useOrgUsers() {
  return useQuery({
    queryKey: ["org-users"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      }));
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export { useMutation, supabase };
