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

/** Órgão em contexto: perfil do usuário ou órgão escolhido pelo Super Admin. */
export function useActiveOrgId() {
  return useQuery({
    queryKey: ["active-org-id"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("active_org_id");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

export function useOrganization() {
  const { data: orgId } = useActiveOrgId();
  return useQuery({
    queryKey: ["organization", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .maybeSingle();
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

/* ===== FASE 10 — Bloco 1: máquinas e equipamentos ===== */

export type AssetClass = "veiculo" | "equipamento";
export type EquipmentType = Database["public"]["Tables"]["equipment_types"]["Row"];

export const ASSET_CLASSES = [
  { value: "veiculo", label: "Veículo" },
  { value: "equipamento", label: "Máquina / equipamento" },
];

export const METER_KINDS = [
  { value: "hodometro", label: "Hodômetro (km)" },
  { value: "horimetro", label: "Horímetro (h)" },
  { value: "ambos", label: "Hodômetro e horímetro" },
  { value: "nenhum", label: "Sem medidor" },
];

export const ASSET_OWNERSHIP = [
  { value: "proprio", label: "Próprio" },
  { value: "locado", label: "Locado" },
  { value: "cedido", label: "Cedido" },
  { value: "emprestado", label: "Emprestado" },
  { value: "comodato", label: "Comodato" },
  { value: "doado", label: "Doado" },
  { value: "fiel_depositario", label: "Fiel depositário" },
  { value: "baixado", label: "Baixado" },
  { value: "alienado", label: "Alienado" },
  { value: "leiloado", label: "Leiloado" },
  { value: "perdido_furtado", label: "Perdido / furtado" },
  { value: "outro", label: "Outro" },
];

/** Identificação de exibição: placa para veículos, patrimônio para equipamentos. */
export function assetLabel(v?: Pick<Vehicle, "plate" | "asset_code"> | null) {
  if (!v) return "—";
  return v.plate || v.asset_code || "Sem identificação";
}

export function useEquipmentTypes() {
  return useQuery({
    queryKey: ["equipment-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_types")
        .select("*")
        .eq("active", true)
        .order("name");
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

/* ===================== FASE 2 — ABASTECIMENTO ===================== */

export type FuelType = Database["public"]["Tables"]["fuel_types"]["Row"];
export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
export type Fueling = Database["public"]["Tables"]["fuelings"]["Row"];
export type FuelingAlert = Database["public"]["Tables"]["fueling_alerts"]["Row"];

export type FuelingRow = Fueling & {
  vehicle: Pick<Vehicle, "id" | "plate" | "asset_code" | "fuel_type" | "tank_capacity" | "status"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  supplier: Pick<Supplier, "id" | "legal_name" | "trade_name"> | null;
  fuel: Pick<FuelType, "id" | "name" | "measure_unit"> | null;
  driver: { id: string; full_name: string } | null;
  authorization: { id: string; code: string | null; max_quantity: number; consumed_quantity: number } | null;
  contract: { id: string; number: string } | null;
  contract_item: { id: string; description: string; measure_unit: string } | null;
  commitment: { id: string; number: string; exercise: number } | null;
  cost_center: { id: string; code: string; name: string } | null;
  quota: { id: string; name: string } | null;
};


export const MEASURE_UNITS = ["litro", "m³", "kWh", "kg", "outra"];

/** Perfis com permissão de registrar abastecimento e de cancelar. */
export const REGISTER_ROLES: AppRole[] = [
  "super_admin",
  "org_admin",
  "fleet_manager",
  "unit_manager",
  "operator",
];
export const CANCEL_ROLES: AppRole[] = ["super_admin", "org_admin", "fleet_manager"];

export function usePerms() {
  const { data: me } = useProfile();
  const { data: activeOrgId } = useActiveOrgId();
  const roles = me?.roles ?? [];
  // Órgão em contexto: perfil do usuário ou órgão acessado pelo Super Admin.
  const orgId = activeOrgId ?? me?.profile?.organization_id ?? null;
  // Sem órgão em contexto não há operação possível (Super Admin fora de um órgão).
  const inOrg = Boolean(orgId);
  return {
    roles,
    orgId,
    unitId: me?.profile?.unit_id ?? null,
    userId: me?.profile?.id ?? null,
    userName: me?.profile?.full_name ?? me?.email ?? "",
    canWrite: inOrg && roles.some((r) => WRITE_ROLES.includes(r)),
    canRegister: inOrg && roles.some((r) => REGISTER_ROLES.includes(r)),
    canCancel: inOrg && roles.some((r) => CANCEL_ROLES.includes(r)),
    canManageFleet: inOrg && roles.some((r) => (["super_admin", "org_admin", "fleet_manager"] as AppRole[]).includes(r)),
    canManageFinance: inOrg && roles.some((r) => (["super_admin", "org_admin", "fleet_manager"] as AppRole[]).includes(r)),
    // Integrações, conectores, webhooks e chaves: administração do órgão.
    canManageUsers: inOrg && roles.some((r) => (["super_admin", "org_admin"] as AppRole[]).includes(r)),
    isAuditor: roles.length > 0 && roles.every((r) => r === "auditor"),
    // Exportação integral de dados: gestão máxima do órgão e controladoria.
    canExportData:
      inOrg && roles.some((r) => (["super_admin", "org_admin", "auditor"] as AppRole[]).includes(r)),
  };

}


/* ------------------------------ máscaras ------------------------------ */
/** Padrão global de formatação — implementação única em src/lib/format.ts. */
export {
  maskCNPJ,
  maskCPF,
  maskCEP,
  isValidCNPJ,
  isValidCPF,
  formatCNPJ,
  formatCPF,
  formatMoney,
  formatLiters,
  formatLitersUnit,
  formatNumberBR,
  parseBRNumber,
  maskDecimalBR,
  maskMoneyBR,
  maskLitersBR,
  toMaskedNumber,
  onlyDigits,
  MONEY_DECIMALS,
  LITER_DECIMALS,
} from "@/lib/format";

import { formatBRL, formatNumberBR as _num } from "@/lib/format";

export function maskPlate(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

/** Moeda com símbolo (R$ 1.234.567,80). */
export const brl = (n: number | null | undefined) => formatBRL(n);

/** Número no padrão brasileiro com casas decimais fixas. */
export const num = (n: number | null | undefined, digitsCount = 2) => _num(n, digitsCount);

export const dateTimeBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

/* ------------------------------- dados -------------------------------- */

export function useFuelTypes() {
  return useQuery({
    queryKey: ["fuel-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fuel_types").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("legal_name");
      if (error) throw error;
      return data;
    },
  });
}

const FUELING_SELECT =
  "*, vehicle:vehicles(id, plate, asset_code, fuel_type, tank_capacity, status), unit:units(id, name, acronym), supplier:suppliers(id, legal_name, trade_name), fuel:fuel_types(id, name, measure_unit), driver:drivers(id, full_name), authorization:fuel_authorizations(id, code, max_quantity, consumed_quantity), contract:contracts(id, number), contract_item:contract_items(id, description, measure_unit), commitment:commitments(id, number, exercise), cost_center:cost_centers(id, code, name), quota:quotas(id, name)";


export function useFuelings() {
  return useQuery({
    queryKey: ["fuelings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuelings")
        .select(FUELING_SELECT)
        .order("fueled_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as FuelingRow[];
    },
  });
}

export function useFuelingAlerts() {
  return useQuery({
    queryKey: ["fueling-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fueling_alerts")
        .select("*, vehicle:vehicles(id, plate,asset_code), fueling:fuelings(id, fueled_at, status)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as (FuelingAlert & {
        vehicle: { id: string; plate: string | null; asset_code: string | null } | null;
        fueling: { id: string; fueled_at: string; status: string } | null;
      })[];
    },
  });
}

export function useComprovanteUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["comprovante", path],
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage.from("comprovantes").createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
}

/* --------------------- regras de validação (Fase 2) -------------------- */

export type RuleLevel = "erro" | "alerta" | "info";
export type RuleIssue = { level: RuleLevel; type: string; message: string };

export const ALERT_TYPE_LABELS: Record<string, string> = {
  combustivel_incompativel: "Combustível incompatível",
  km_inferior: "KM inferior ao último registrado",
  horimetro_inferior: "Horímetro inferior ao último registrado",
  tanque_excedido: "Quantidade acima da capacidade do tanque",
  abastecimento_proximo: "Abastecimentos muito próximos",
  possivel_duplicidade: "Possível duplicidade",
  veiculo_manutencao: "Veículo em manutenção abastecido",
  veiculo_bloqueado: "Veículo indisponível para abastecimento",
  cnh_vencida: "CNH vencida",
  cnh_a_vencer: "CNH a vencer em 30 dias",
  autorizacao_a_expirar: "Autorização prestes a expirar",
  autorizacao_expirada_nao_utilizada: "Autorização expirada sem utilização",
  acima_do_autorizado: "Registro acima do limite autorizado",
  abastecimento_sem_autorizacao: "Abastecimento sem autorização prévia",
  excesso_limite: "Excesso de limite diário/mensal",
};


/** Normaliza nomes de combustível para comparação (Diesel S10 x diesel s10). */
function normalizeFuel(v: string | null | undefined) {
  return (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function fuelCompatible(vehicleFuel: string | null, fuelName: string | null) {
  const v = normalizeFuel(vehicleFuel);
  const f = normalizeFuel(fuelName);
  if (!v || !f) return true; // informação insuficiente
  if (v === f || v.includes(f) || f.includes(v)) return true;
  if (v === "flex") return f.includes("gasolina") || f.includes("etanol");
  if (v.includes("diesel") && f.includes("diesel")) return true;
  if (v === "hibrido") return f.includes("gasolina") || f.includes("etanol");
  if (f === "outro") return true;
  return false;
}

export type FuelingDraft = {
  vehicle: Vehicle | null;
  fuel: FuelType | null;
  supplier: Supplier | null;
  fueledAt: Date | null;
  quantity: number;
  unitPrice: number;
  odometer: number | null;
  hourMeter: number | null;
};

/** Avalia todas as regras automáticas de validação do abastecimento. */
export function evaluateFueling(draft: FuelingDraft, history: FuelingRow[]): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const v = draft.vehicle;

  if (!v) {
    issues.push({ level: "erro", type: "veiculo_obrigatorio", message: "Selecione o veículo." });
  } else {
    if (v.status === "baixado" || v.status === "inativo") {
      issues.push({
        level: "erro",
        type: "veiculo_bloqueado",
        message: `Veículo ${v.plate} está ${v.status} e não pode ser abastecido.`,
      });
    }
    if (v.status === "manutencao") {
      issues.push({
        level: "alerta",
        type: "veiculo_manutencao",
        message: `Veículo ${v.plate} está em manutenção. É obrigatório justificar o abastecimento.`,
      });
    }
  }

  if (!draft.fuel) {
    issues.push({ level: "erro", type: "combustivel_obrigatorio", message: "Selecione o combustível." });
  } else if (!draft.fuel.active) {
    issues.push({ level: "erro", type: "combustivel_inativo", message: "O combustível selecionado está inativo." });
  }

  if (draft.supplier && !draft.supplier.active) {
    issues.push({ level: "erro", type: "fornecedor_inativo", message: "O fornecedor/posto selecionado está inativo." });
  }
  if (!draft.supplier) {
    issues.push({ level: "info", type: "fornecedor_ausente", message: "Nenhum fornecedor informado neste registro." });
  }

  if (v && draft.fuel && !fuelCompatible(v.fuel_type, draft.fuel.name)) {
    issues.push({
      level: "alerta",
      type: "combustivel_incompativel",
      message: `Combustível ${draft.fuel.name} é incompatível com o cadastro do veículo (${v.fuel_type}). Exige justificativa administrativa.`,
    });
  }

  if (!(draft.quantity > 0)) {
    issues.push({ level: "erro", type: "quantidade_invalida", message: "A quantidade deve ser maior que zero." });
  }
  if (!(draft.unitPrice > 0)) {
    issues.push({ level: "erro", type: "preco_invalido", message: "O preço unitário deve ser maior que zero." });
  }

  const vehicleHistory = history.filter((f) => f.vehicle_id === v?.id && f.status === "valido");
  const lastKm = Math.max(
    Number(v?.current_km ?? 0),
    ...vehicleHistory.map((f) => Number(f.odometer_km ?? 0)),
    0,
  );
  const lastHour = Math.max(
    Number(v?.hour_meter ?? 0),
    ...vehicleHistory.map((f) => Number(f.hour_meter ?? 0)),
    0,
  );

  if (draft.odometer != null && lastKm > 0 && draft.odometer < lastKm) {
    issues.push({
      level: "erro",
      type: "km_inferior",
      message: `KM informado (${num(draft.odometer, 0)}) é menor que o último KM válido (${num(lastKm, 0)}).`,
    });
  }
  if (draft.hourMeter != null && lastHour > 0 && draft.hourMeter < lastHour) {
    issues.push({
      level: "erro",
      type: "horimetro_inferior",
      message: `Horímetro informado é menor que o último horímetro válido (${num(lastHour, 1)}).`,
    });
  }
  if (draft.odometer == null && draft.hourMeter == null) {
    issues.push({
      level: "alerta",
      type: "sem_medidor",
      message: "Nenhum KM ou horímetro informado para este abastecimento.",
    });
  }

  if (v?.tank_capacity && draft.quantity > Number(v.tank_capacity)) {
    issues.push({
      level: "alerta",
      type: "tanque_excedido",
      message: `Quantidade (${num(draft.quantity, 2)}) excede a capacidade do tanque (${num(Number(v.tank_capacity), 2)}). Justificativa obrigatória.`,
    });
  }

  if (v && draft.fueledAt) {
    const ts = draft.fueledAt.getTime();
    for (const f of vehicleHistory) {
      const diffH = Math.abs(ts - new Date(f.fueled_at).getTime()) / 36e5;
      const sameQty = Math.abs(Number(f.quantity) - draft.quantity) < 0.51;
      const samePrice = Math.abs(Number(f.unit_price) - draft.unitPrice) < 0.02;
      if (diffH <= 1 && sameQty && samePrice && f.supplier_id === (draft.supplier?.id ?? null)) {
        issues.push({
          level: "alerta",
          type: "possivel_duplicidade",
          message: `Possível duplicidade: já existe abastecimento semelhante em ${dateTimeBR(f.fueled_at)}.`,
        });
        break;
      }
    }
    const proximo = vehicleHistory.some(
      (f) => Math.abs(ts - new Date(f.fueled_at).getTime()) / 36e5 <= 4,
    );
    if (proximo && !issues.some((i) => i.type === "possivel_duplicidade")) {
      issues.push({
        level: "alerta",
        type: "abastecimento_proximo",
        message: "Existe outro abastecimento deste veículo nas últimas 4 horas.",
      });
    }
  }

  return issues;
}

export { useMutation, supabase };


/* ===================== FASE 3 — CONDUTORES / UTILIZAÇÃO / AUTORIZAÇÃO ===================== */

export type Driver = Database["public"]["Tables"]["drivers"]["Row"];
export type VehicleUsage = Database["public"]["Tables"]["vehicle_usages"]["Row"];
export type FuelAuthorization = Database["public"]["Tables"]["fuel_authorizations"]["Row"];
export type FuelLimit = Database["public"]["Tables"]["fuel_limits"]["Row"];
export type DriverBond = Database["public"]["Enums"]["driver_bond"];
export type UsageStatus = Database["public"]["Enums"]["usage_status"];
export type FuelAuthStatus = Database["public"]["Enums"]["fuel_auth_status"];
export type LimitScope = Database["public"]["Enums"]["limit_scope"];

export type DriverRow = Driver & { unit: Pick<Unit, "id" | "name" | "acronym"> | null };

export type UsageRow = VehicleUsage & {
  vehicle: Pick<Vehicle, "id" | "plate" | "asset_code" | "status"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  driver: Pick<Driver, "id" | "full_name" | "license_expiry" | "active"> | null;
};

export type AuthorizationRow = FuelAuthorization & {
  vehicle: Pick<Vehicle, "id" | "plate" | "asset_code" | "fuel_type" | "status"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  driver: Pick<Driver, "id" | "full_name" | "license_expiry" | "active"> | null;
  fuel: Pick<FuelType, "id" | "name" | "measure_unit"> | null;
  supplier: Pick<Supplier, "id" | "legal_name" | "trade_name"> | null;
};

export const DRIVER_BONDS: { value: DriverBond; label: string }[] = [
  { value: "efetivo", label: "Servidor efetivo" },
  { value: "comissionado", label: "Comissionado" },
  { value: "contratado", label: "Contratado" },
  { value: "terceirizado", label: "Terceirizado" },
  { value: "outro", label: "Outro" },
];

export const USAGE_STATUS: { value: UsageStatus; label: string }[] = [
  { value: "solicitada", label: "Solicitada" },
  { value: "autorizada", label: "Autorizada" },
  { value: "em_uso", label: "Em uso" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];

export const AUTH_STATUS: { value: FuelAuthStatus; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "autorizada", label: "Autorizada" },
  { value: "utilizada_parcial", label: "Utilizada parcialmente" },
  { value: "utilizada", label: "Utilizada" },
  { value: "expirada", label: "Expirada" },
  { value: "cancelada", label: "Cancelada" },
];

export const LIMIT_SCOPES: { value: LimitScope; label: string }[] = [
  { value: "organizacao", label: "Órgão (global)" },
  { value: "unidade", label: "Secretaria / unidade" },
  { value: "veiculo", label: "Veículo" },
];

/** Categorias de CNH — estrutura preparada para validação técnica futura por tipo de veículo. */
export const CNH_CATEGORIES = ["ACC", "A", "B", "C", "D", "E"];

/** Regra mínima sugerida por tipo de veículo (arquitetura preparada, ainda não bloqueante). */
export const VEHICLE_CATEGORY_HINT: Record<string, string[]> = {
  Motocicleta: ["A"],
  "Automóvel": ["B", "C", "D", "E"],
  Caminhonete: ["B", "C", "D", "E"],
  "Van / Micro-ônibus": ["D", "E"],
  "Ônibus": ["D", "E"],
  "Caminhão": ["C", "D", "E"],
  Ambulância: ["B", "C", "D", "E"],
  "Máquina / Equipamento": ["C", "D", "E"],
  Trator: ["C", "D", "E"],
};

/* maskCPF / isValidCPF: reexportados de @/lib/format (padrão global). */

export const dateBR = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—";

/** Situação da CNH do condutor. */
export type CnhState = "ok" | "a_vencer" | "vencida" | "sem_registro";

export function cnhState(expiry: string | null | undefined, days = 30): CnhState {
  if (!expiry) return "sem_registro";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${expiry}T12:00:00`);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "vencida";
  if (diff <= days) return "a_vencer";
  return "ok";
}

export const CNH_LABELS: Record<CnhState, string> = {
  ok: "Regular",
  a_vencer: "A vencer em 30 dias",
  vencida: "Vencida",
  sem_registro: "Sem validade informada",
};

/** Condutor apto a nova autorização/utilização. */
export function driverEligible(d: Pick<Driver, "active" | "license_expiry">) {
  return d.active && cnhState(d.license_expiry) !== "vencida";
}

export function authorizationBalance(a: Pick<FuelAuthorization, "max_quantity" | "consumed_quantity">) {
  return Number(a.max_quantity ?? 0) - Number(a.consumed_quantity ?? 0);
}

export function authorizationUsable(a: AuthorizationRow, at: Date = new Date()) {
  if (["cancelada", "expirada", "utilizada"].includes(a.status)) return false;
  if (new Date(a.valid_until) < at) return false;
  if (new Date(a.valid_from) > at) return false;
  return authorizationBalance(a) > 0.001;
}

/* --------------------------------- hooks -------------------------------- */

export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*, unit:units(id, name, acronym)")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as DriverRow[];
    },
  });
}

export function useVehicleUsages() {
  return useQuery({
    queryKey: ["vehicle-usages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_usages")
        .select(
          "*, vehicle:vehicles(id, plate,asset_code, status), unit:units(id, name, acronym), driver:drivers(id, full_name, license_expiry, active)",
        )
        .order("planned_departure", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as UsageRow[];
    },
  });
}

export function useAuthorizations() {
  return useQuery({
    queryKey: ["fuel-authorizations"],
    queryFn: async () => {
      await supabase.rpc("expire_fuel_authorizations");
      const { data, error } = await supabase
        .from("fuel_authorizations")
        .select(
          "*, vehicle:vehicles(id, plate,asset_code, fuel_type, status), unit:units(id, name, acronym), driver:drivers(id, full_name, license_expiry, active), fuel:fuel_types(id, name, measure_unit), supplier:suppliers(id, legal_name, trade_name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as AuthorizationRow[];
    },
  });
}

export function useFuelLimits() {
  return useQuery({
    queryKey: ["fuel-limits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fuel_limits").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/** Localiza quem conduzia um veículo em determinado momento. */
export function findDriverAt(usages: UsageRow[], vehicleId: string, at: Date) {
  const t = at.getTime();
  return (
    usages.find((u) => {
      if (u.vehicle_id !== vehicleId || u.status === "cancelada") return false;
      const ini = new Date(u.actual_departure ?? u.planned_departure).getTime();
      const fim = new Date(u.actual_return ?? u.planned_return ?? u.actual_departure ?? u.planned_departure).getTime();
      return t >= ini && t <= Math.max(fim, ini);
    }) ?? null
  );
}


/* ===================== FASE 4 — CONTRATOS / EMPENHOS / CENTROS DE CUSTO / COTAS ===================== */

export type CostCenter = Database["public"]["Tables"]["cost_centers"]["Row"];
export type Contract = Database["public"]["Tables"]["contracts"]["Row"];
export type ContractItem = Database["public"]["Tables"]["contract_items"]["Row"];
export type Commitment = Database["public"]["Tables"]["commitments"]["Row"];
export type Quota = Database["public"]["Tables"]["quotas"]["Row"];
export type QuotaSupplement = Database["public"]["Tables"]["quota_supplements"]["Row"];
export type BudgetMovement = Database["public"]["Tables"]["budget_movements"]["Row"];

export type ContractModality = Database["public"]["Enums"]["contract_modality"];
export type ContractStatus = Database["public"]["Enums"]["contract_status"];
export type CommitmentKind = Database["public"]["Enums"]["commitment_kind"];
export type CommitmentStatus = Database["public"]["Enums"]["commitment_status"];
export type QuotaType = Database["public"]["Enums"]["quota_type"];
export type ExpenseOrigin = Database["public"]["Enums"]["expense_origin"];

export type CostCenterRow = CostCenter & { unit: Pick<Unit, "id" | "name" | "acronym"> | null };
export type ContractEntity = Pick<
  ExternalEntity,
  | "id"
  | "name"
  | "trade_name"
  | "document"
  | "kind"
  | "address"
  | "district"
  | "city"
  | "state"
  | "zip_code"
  | "phone"
  | "email"
  | "contact_name"
  | "categories"
  | "latitude"
  | "longitude"
>;

export type ContractRow = Contract & {
  supplier: Pick<Supplier, "id" | "legal_name" | "trade_name"> | null;
  entity: ContractEntity | null;
  items: ContractItem[];
};
export type ContractItemRow = ContractItem & {
  contract: Pick<Contract, "id" | "number" | "status" | "valid_to"> | null;
  fuel: Pick<FuelType, "id" | "name" | "measure_unit"> | null;
};
export type CommitmentRow = Commitment & {
  contract: Pick<Contract, "id" | "number"> | null;
  supplier: Pick<Supplier, "id" | "legal_name" | "trade_name"> | null;
  cost_center: Pick<CostCenter, "id" | "code" | "name"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
};
export type QuotaRow = Quota & {
  contract: Pick<Contract, "id" | "number"> | null;
  item: Pick<ContractItem, "id" | "description" | "measure_unit"> | null;
  commitment: Pick<Commitment, "id" | "number"> | null;
  cost_center: Pick<CostCenter, "id" | "code" | "name"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
};

export const CONTRACT_MODALITIES: { value: ContractModality; label: string }[] = [
  { value: "pregao", label: "Pregão" },
  { value: "concorrencia", label: "Concorrência" },
  { value: "dispensa", label: "Dispensa" },
  { value: "inexigibilidade", label: "Inexigibilidade" },
  { value: "adesao_ata", label: "Adesão à Ata" },
  { value: "contratacao_direta", label: "Contratação Direta" },
  { value: "credenciamento", label: "Credenciamento" },
  { value: "outro", label: "Outro" },
];

export const CONTRACT_STATUS: { value: ContractStatus; label: string }[] = [
  { value: "rascunho", label: "Rascunho" },
  { value: "vigente", label: "Vigente" },
  { value: "suspenso", label: "Suspenso" },
  { value: "encerrado", label: "Encerrado" },
  { value: "rescindido", label: "Rescindido" },
];

export const COMMITMENT_KINDS: { value: CommitmentKind; label: string }[] = [
  { value: "ordinario", label: "Ordinário" },
  { value: "estimativo", label: "Estimativo" },
  { value: "global", label: "Global" },
];

export const COMMITMENT_STATUS: { value: CommitmentStatus; label: string }[] = [
  { value: "ativo", label: "Ativo" },
  { value: "esgotado", label: "Esgotado" },
  { value: "anulado", label: "Anulado" },
  { value: "encerrado", label: "Encerrado" },
];

export const QUOTA_TYPES: { value: QuotaType; label: string }[] = [
  { value: "financeira", label: "Financeira (R$)" },
  { value: "quantitativa", label: "Quantitativa (litros/unidades)" },
];

export const EXPENSE_ORIGINS: { value: ExpenseOrigin; label: string; ready: boolean }[] = [
  { value: "contrato", label: "Contrato administrativo", ready: true },
  { value: "compra_direta", label: "Compra direta / pronto pagamento", ready: true },
  { value: "convenio", label: "Convênio", ready: false },
  { value: "doacao", label: "Doação / entidade externa", ready: false },
  { value: "almoxarifado", label: "Almoxarifado", ready: false },
  { value: "recurso_proprio", label: "Recurso próprio / outro", ready: false },
];

export const MATERIAL_KINDS = ["combustivel", "lubrificante", "fluido", "aditivo", "outro"];
export const MATERIAL_KIND_LABELS: Record<string, string> = {
  combustivel: "Combustível",
  lubrificante: "Lubrificante",
  fluido: "Fluido",
  aditivo: "Aditivo",
  outro: "Outro material/serviço",
};

export const ALERT_CATEGORIES: { value: string; label: string }[] = [
  { value: "abastecimento", label: "Abastecimento" },
  { value: "contrato", label: "Contrato" },
  { value: "empenho", label: "Empenho" },
  { value: "cota", label: "Cota" },
  { value: "bloqueio", label: "Bloqueio por saldo" },
  { value: "manutencao", label: "Manutenção" },
  { value: "cotacao", label: "Cotação" },
  { value: "ordem_servico", label: "Ordem de serviço" },
  { value: "credenciamento", label: "Credenciamento" },
  { value: "frota", label: "Frota (multas, sinistros, seguros e documentos)" },
  { value: "backup", label: "Backup externo" },
  { value: "inteligencia", label: "Inteligência (consumo e custos)" },
];

/** Fase 10 — Bloco 2: alertas gerados pela inteligência da frota. */
export const INTELLIGENCE_ALERT_LABELS: Record<string, string> = {
  consumo_fora_do_parametro: "Consumo fora do parâmetro esperado",
  custo_manutencao_elevado: "Custo de manutenção elevado",
};

export const BACKUP_ALERT_LABELS: Record<string, string> = {
  backup_atrasado: "Sem backup concluído nas últimas 48 horas",
  backup_falhou: "Última execução de backup falhou",
  backup_integridade: "Falha na validação de integridade do backup",
  backup_destino: "Teste de conexão com o destino falhou",
};

export const FINANCE_ALERT_LABELS: Record<string, string> = {
  contrato_80: "Contrato com 80% executado",
  contrato_90: "Contrato com 90% executado",
  contrato_esgotado: "Contrato integralmente executado",
  contrato_vence_60: "Contrato a vencer em 60 dias",
  contrato_vence_30: "Contrato a vencer em 30 dias",
  contrato_vence_15: "Contrato a vencer em 15 dias",
  contrato_vence_7: "Contrato a vencer em 7 dias",
  contrato_vencido: "Contrato com vigência encerrada",
  empenho_saldo_20: "Empenho com saldo abaixo de 20%",
  empenho_saldo_10: "Empenho com saldo abaixo de 10%",
  empenho_zerado: "Empenho sem saldo",
  cota_saldo_20: "Cota com saldo abaixo de 20%",
  cota_saldo_10: "Cota com saldo abaixo de 10%",
  cota_zerada: "Cota sem saldo",
  saldo_insuficiente: "Bloqueio por saldo insuficiente",
  manutencao_vencido: "Manutenção preventiva vencida",
  manutencao_proximo: "Manutenção preventiva próxima do vencimento",
  garantia_a_vencer: "Garantia a vencer",
  cotacao_prazo_proximo: "Prazo de propostas próximo do fim",
  cotacao_prazo_vencido: "Prazo de propostas encerrado",
  cotacao_insuficiente: "Processo com menos de 3 propostas válidas",
  os_atrasada: "Ordem de serviço atrasada",
  credenciamento_vencendo: "Credenciamento de oficina vencendo",
  multa_a_vencer: "Multa a vencer",
  multa_vencida: "Multa vencida",
  obrigacao_a_vencer: "Obrigação legal a vencer",
  obrigacao_vencida: "Obrigação legal vencida",
  seguro_a_vencer: "Seguro a vencer",
  seguro_vencido: "Seguro vencido",
  sinistro_em_aberto: "Sinistro em aberto há mais de 30 dias",
  perda_total_sem_baixa: "Perda total sem movimentação patrimonial",
};


export function alertLabel(type: string) {
  return (
    ALERT_TYPE_LABELS[type] ??
    FINANCE_ALERT_LABELS[type] ??
    BACKUP_ALERT_LABELS[type] ??
    INTELLIGENCE_ALERT_LABELS[type] ??
    type
  );
}

/** Percentual seguro (0–100+). */
export const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

export const daysUntil = (iso: string | null | undefined) =>
  iso ? Math.ceil((new Date(`${iso}T12:00:00`).getTime() - Date.now()) / 86400000) : null;

/** Extrai a mensagem amigável de um erro do banco. */
export function dbMessage(e: unknown) {
  const m = (e as { message?: string } | null)?.message ?? "";
  return m.replace(/^.*?(?=Saldo|Limite|Autoriza|Contrato|Empenho|Cota|Item|Ve[íi]culo|Condutor)/s, "") || m;
}

/** Registra alerta de bloqueio por saldo insuficiente. */
export async function logBudgetBlock(message: string, entityType: string, entityId: string | null) {
  await supabase.rpc("log_budget_block", {
    _message: message,
    _entity_type: entityType,
    _entity_id: entityId as string,
  });
}

/* --------------------------------- hooks -------------------------------- */

export function useCostCenters() {
  return useQuery({
    queryKey: ["cost-centers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_centers")
        .select("*, unit:units(id, name, acronym)")
        .order("code");
      if (error) throw error;
      return (data ?? []) as unknown as CostCenterRow[];
    },
  });
}

export function useContracts() {
  return useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, supplier:suppliers(id, legal_name, trade_name), items:contract_items(*)")
        .order("number");
      if (error) throw error;
      return (data ?? []) as unknown as ContractRow[];
    },
  });
}

export function useContractItems() {
  return useQuery({
    queryKey: ["contract-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_items")
        .select("*, contract:contracts(id, number, status, valid_to), fuel:fuel_types(id, name, measure_unit)")
        .order("description");
      if (error) throw error;
      return (data ?? []) as unknown as ContractItemRow[];
    },
  });
}

export function useCommitments() {
  return useQuery({
    queryKey: ["commitments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commitments")
        .select(
          "*, contract:contracts(id, number), supplier:suppliers(id, legal_name, trade_name), cost_center:cost_centers(id, code, name), unit:units(id, name, acronym)",
        )
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CommitmentRow[];
    },
  });
}

export function useQuotas() {
  return useQuery({
    queryKey: ["quotas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotas")
        .select(
          "*, contract:contracts(id, number), item:contract_items(id, description, measure_unit), commitment:commitments(id, number), cost_center:cost_centers(id, code, name), unit:units(id, name, acronym)",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as QuotaRow[];
    },
  });
}

export function useQuotaSupplements(quotaId: string | null) {
  return useQuery({
    queryKey: ["quota-supplements", quotaId],
    enabled: !!quotaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quota_supplements")
        .select("*")
        .eq("quota_id", quotaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBudgetMovements(authorizationId?: string | null) {
  return useQuery({
    queryKey: ["budget-movements", authorizationId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("budget_movements").select("*").order("created_at", { ascending: false }).limit(300);
      if (authorizationId) q = q.eq("authorization_id", authorizationId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContractFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["contrato-arquivo", path],
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage.from("contratos").createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
}

/* ============ OBJETO DO CONTRATO (classificação extensível) ============ */

export type ContractObjectKind = Database["public"]["Tables"]["contract_object_kinds"]["Row"];

/** Fallback usado enquanto a lista do banco não carrega (mesma ordem do cadastro). */
export const CONTRACT_OBJECT_KIND_FALLBACK: { value: string; label: string }[] = [
  { value: "seguros", label: "Seguros" },
  { value: "combustivel_oleos", label: "Combustível e óleos" },
  { value: "manutencao", label: "Manutenção preventiva e corretiva" },
  { value: "pneus", label: "Pneus" },
  { value: "pecas", label: "Peças automotivas" },
  { value: "higienizacao", label: "Higienização" },
];

export function useContractObjectKinds() {
  return useQuery({
    queryKey: ["contract-object-kinds"],
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_object_kinds")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ContractObjectKind[];
    },
  });
}

export function objectKindLabel(code: string | null | undefined, kinds: ContractObjectKind[] = []) {
  if (!code) return "—";
  return (
    kinds.find((k) => k.code === code)?.label ??
    CONTRACT_OBJECT_KIND_FALLBACK.find((k) => k.value === code)?.label ??
    code
  );
}

/* ====== VEÍCULO PARTICULAR DE SERVIDOR COM COTA DE COMBUSTÍVEL ====== */

export type ServerFuelQuota = Database["public"]["Tables"]["server_fuel_quotas"]["Row"];
export type ServerQuotaPeriod = Database["public"]["Enums"]["server_quota_period"];
export type ServerQuotaStatus = Database["public"]["Enums"]["server_quota_status"];

export type ServerFuelQuotaRow = ServerFuelQuota & {
  vehicle: Pick<Vehicle, "id" | "plate" | "asset_code" | "brand" | "model" | "status"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  fuel: Pick<FuelType, "id" | "name" | "measure_unit"> | null;
};

export const SERVER_QUOTA_PERIODS: { value: ServerQuotaPeriod; label: string }[] = [
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
];

export const SERVER_QUOTA_STATUS: { value: ServerQuotaStatus; label: string }[] = [
  { value: "ativa", label: "Ativa" },
  { value: "inativa", label: "Inativa" },
  { value: "suspensa", label: "Suspensa" },
];

/** Início (inclusivo) e fim (exclusivo) do ciclo da cota, na semana ou no mês. */
export function serverQuotaCycle(period: ServerQuotaPeriod, at: Date = new Date()) {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  if (period === "semanal") {
    const dow = (d.getDay() + 6) % 7; // segunda-feira como início, igual ao banco
    const start = new Date(d);
    start.setDate(d.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
  }
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start, end };
}

export function useServerFuelQuotas() {
  return useQuery({
    queryKey: ["server-fuel-quotas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_fuel_quotas")
        .select(
          "*, vehicle:vehicles(id, plate,asset_code, brand, model, status), unit:units(id, name, acronym), fuel:fuel_types(id, name, measure_unit)",
        )
        .order("beneficiary_name");
      if (error) throw error;
      return (data ?? []) as unknown as ServerFuelQuotaRow[];
    },
  });
}

/** Abastecimentos válidos vinculados a cotas de servidor nos últimos ciclos. */
export function useServerQuotaFuelings() {
  return useQuery({
    queryKey: ["server-quota-fuelings"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(1);
      since.setMonth(since.getMonth() - 1);
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("fuelings")
        .select("id, server_quota_id, vehicle_id, quantity, total_value, fueled_at, status")
        .not("server_quota_id", "is", null)
        .eq("status", "valido")
        .gte("fueled_at", since.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type ServerQuotaFueling = {
  server_quota_id: string | null;
  quantity: number | null;
  total_value: number | null;
  fueled_at: string;
};

/** Consumo do ciclo corrente da cota e saldo restante (o saldo não acumula entre ciclos). */
export function serverQuotaUsage(
  quota: Pick<ServerFuelQuota, "id" | "period" | "quota_quantity" | "alert_threshold_percent">,
  fuelings: ServerQuotaFueling[],
  at: Date = new Date(),
) {
  const { start, end } = serverQuotaCycle(quota.period, at);
  const inCycle = fuelings.filter((f) => {
    if (f.server_quota_id !== quota.id) return false;
    const t = new Date(f.fueled_at).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
  const used = inCycle.reduce((s, f) => s + Number(f.quantity ?? 0), 0);
  const value = inCycle.reduce((s, f) => s + Number(f.total_value ?? 0), 0);
  const total = Number(quota.quota_quantity ?? 0);
  const percent = pct(used, total);
  return {
    cycleStart: start,
    cycleEnd: end,
    used,
    value,
    total,
    balance: Math.max(total - used, 0),
    percent,
    exhausted: total > 0 && used >= total - 0.001,
    nearLimit: total > 0 && percent >= Number(quota.alert_threshold_percent ?? 80) && used < total - 0.001,
  };
}

/** Cota vigente do veículo na data indicada (ativa tem precedência). */
export function activeServerQuota(
  quotas: ServerFuelQuotaRow[],
  vehicleId: string | null | undefined,
  at: Date = new Date(),
) {
  if (!vehicleId) return null;
  const day = at.toISOString().slice(0, 10);
  const list = quotas.filter(
    (q) => q.vehicle_id === vehicleId && q.start_date <= day && (!q.end_date || q.end_date >= day),
  );
  return list.find((q) => q.status === "ativa") ?? list[0] ?? null;
}

/* ------------------------------- cálculos ------------------------------- */

export function contractTotals(c: ContractRow) {
  // Itens inativados deixam de compor o valor do contrato, mas preservam o histórico.
  const items = (c.items ?? []).filter((i) => i.active !== false);
  const total = items.reduce((s, i) => s + Number(i.total_value ?? 0), 0);
  const consumed = items.reduce((s, i) => s + Number(i.consumed_value ?? 0), 0);
  const reserved = items.reduce((s, i) => s + Number(i.reserved_value ?? 0), 0);
  return {
    total,
    consumed,
    reserved,
    balance: total - consumed - reserved,
    percent: pct(consumed, total),
    days: daysUntil(c.valid_to),
  };
}

export function itemBalance(i: ContractItem) {
  return {
    quantity: Number(i.quantity ?? 0) - Number(i.reserved_quantity ?? 0) - Number(i.consumed_quantity ?? 0),
    value: Number(i.total_value ?? 0) - Number(i.reserved_value ?? 0) - Number(i.consumed_value ?? 0),
  };
}

export function quotaPercent(q: Quota) {
  const granted = Number(q.granted_amount ?? 0);
  return pct(Number(q.consumed_amount ?? 0) + Number(q.reserved_amount ?? 0), granted);
}

/* ======================================================================== */
/*                      FASE 5 — MANUTENÇÃO, PEÇAS E PNEUS                  */
/* ======================================================================== */

export type MaintenancePlan = Database["public"]["Tables"]["maintenance_plans"]["Row"];
export type MaintenancePlanItem = Database["public"]["Tables"]["maintenance_plan_items"]["Row"];
export type MaintenanceRequest = Database["public"]["Tables"]["maintenance_requests"]["Row"];
export type MaintenanceRecord = Database["public"]["Tables"]["maintenance_records"]["Row"];
export type MaintenancePart = Database["public"]["Tables"]["maintenance_parts"]["Row"];
export type PartCatalog = Database["public"]["Tables"]["parts_catalog"]["Row"];
export type Tire = Database["public"]["Tables"]["tires"]["Row"];
export type TireMovement = Database["public"]["Tables"]["tire_movements"]["Row"];
export type VehicleStatusHistory = Database["public"]["Tables"]["vehicle_status_history"]["Row"];
export type MaintenanceSettings = Database["public"]["Tables"]["maintenance_settings"]["Row"];

export type MaintenanceKind = Database["public"]["Enums"]["maintenance_kind"];
export type MaintenancePriority = Database["public"]["Enums"]["maintenance_priority"];
export type MaintenanceRequestStatus = Database["public"]["Enums"]["maintenance_request_status"];
export type MaintenanceRecordStatus = Database["public"]["Enums"]["maintenance_record_status"];
export type TireStatus = Database["public"]["Enums"]["tire_status"];

type VehicleRef = Pick<Vehicle, "id" | "plate" | "asset_code" | "brand" | "model" | "current_km" | "hour_meter" | "status">;
type UnitRef = Pick<Unit, "id" | "name" | "acronym">;

export type MaintenancePlanRow = MaintenancePlan & {
  vehicle: VehicleRef | null;
  items: MaintenancePlanItem[] | null;
};
export type MaintenanceRequestRow = MaintenanceRequest & {
  vehicle: VehicleRef | null;
  unit: UnitRef | null;
  cost_center: Pick<CostCenter, "id" | "code" | "name"> | null;
  plan: Pick<MaintenancePlan, "id" | "name"> | null;
};
export type MaintenanceRecordRow = MaintenanceRecord & {
  vehicle: VehicleRef | null;
  supplier: Pick<Supplier, "id" | "legal_name" | "trade_name"> | null;
  request: Pick<MaintenanceRequest, "id" | "code" | "kind"> | null;
  parts: MaintenancePart[] | null;
  commitment: Pick<Commitment, "id" | "number"> | null;
  quota: Pick<Quota, "id" | "name"> | null;
};
export type TireRow = Tire & {
  vehicle: VehicleRef | null;
  supplier: Pick<Supplier, "id" | "legal_name" | "trade_name"> | null;
};

export const MAINTENANCE_KINDS: { value: MaintenanceKind; label: string }[] = [
  { value: "preventiva", label: "Preventiva" },
  { value: "corretiva", label: "Corretiva" },
];

export const MAINTENANCE_PRIORITIES: { value: MaintenancePriority; label: string }[] = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

export const MAINTENANCE_REQUEST_STATUS: { value: MaintenanceRequestStatus; label: string }[] = [
  { value: "aberta", label: "Aberta" },
  { value: "em_analise", label: "Em análise" },
  { value: "aprovada", label: "Aprovada" },
  { value: "em_manutencao", label: "Em manutenção" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];

export const MAINTENANCE_RECORD_STATUS: { value: MaintenanceRecordStatus; label: string }[] = [
  { value: "em_execucao", label: "Em execução" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];

export const TIRE_STATUS: { value: TireStatus; label: string }[] = [
  { value: "estoque", label: "Em estoque" },
  { value: "instalado", label: "Instalado" },
  { value: "em_reparo", label: "Em reparo" },
  { value: "recapagem", label: "Em recapagem" },
  { value: "descartado", label: "Descartado" },
  { value: "baixado", label: "Baixado" },
];

export const TIRE_POSITIONS = [
  "Dianteiro esquerdo",
  "Dianteiro direito",
  "Traseiro esquerdo",
  "Traseiro direito",
  "Traseiro esquerdo interno",
  "Traseiro direito interno",
  "Estepe",
];

export const PART_CATEGORIES = ["Motor", "Freios", "Suspensão", "Elétrica", "Filtros", "Lubrificantes", "Carroceria", "Outros"];

export const MAINTENANCE_SERVICE_TYPES = [
  "Troca de óleo e filtros",
  "Revisão geral",
  "Freios",
  "Suspensão",
  "Pneus e alinhamento",
  "Elétrica",
  "Motor",
  "Ar-condicionado",
  "Outros",
];

/* ------------------------- regras de vencimento ------------------------- */

export type DueState = "ok" | "proximo" | "vencido" | "sem_criterio";

export const DUE_LABELS: Record<DueState, string> = {
  ok: "Em dia",
  proximo: "Próximo do vencimento",
  vencido: "Vencido",
  sem_criterio: "Sem critério definido",
};

export type MaintenanceLead = { km: number; hours: number; days: number };
export const DEFAULT_LEAD: MaintenanceLead = { km: 500, hours: 20, days: 15 };

export function planDue(
  plan: MaintenancePlan,
  vehicle: Pick<Vehicle, "current_km" | "hour_meter"> | null | undefined,
  lead: MaintenanceLead = DEFAULT_LEAD,
): { state: DueState; detail: string } {
  const km = Number(vehicle?.current_km ?? 0);
  const hm = Number(vehicle?.hour_meter ?? 0);
  const baseKm = Number(plan.last_done_km ?? 0);
  const baseH = Number(plan.last_done_hours ?? 0);
  const baseDate = plan.last_done_at ? new Date(plan.last_done_at) : new Date(plan.created_at);

  let state: DueState = "sem_criterio";
  const details: string[] = [];
  const worse = (s: DueState) => {
    const rank: Record<DueState, number> = { sem_criterio: 0, ok: 1, proximo: 2, vencido: 3 };
    if (rank[s] > rank[state]) state = s;
  };

  if (plan.interval_km) {
    const target = baseKm + Number(plan.interval_km);
    const rest = target - km;
    worse(km >= target + Number(plan.tolerance_km ?? 0) ? "vencido" : rest <= lead.km ? "proximo" : "ok");
    details.push(`${num(Math.abs(rest), 0)} km ${rest >= 0 ? "restantes" : "excedidos"}`);
  }
  if (plan.interval_hours) {
    const target = baseH + Number(plan.interval_hours);
    const rest = target - hm;
    worse(hm >= target + Number(plan.tolerance_hours ?? 0) ? "vencido" : rest <= lead.hours ? "proximo" : "ok");
    details.push(`${num(Math.abs(rest), 1)} h ${rest >= 0 ? "restantes" : "excedidas"}`);
  }
  if (plan.interval_months) {
    const target = new Date(baseDate);
    target.setMonth(target.getMonth() + Number(plan.interval_months));
    const rest = Math.ceil((target.getTime() - Date.now()) / 86400000);
    worse(rest < -Number(plan.tolerance_days ?? 0) ? "vencido" : rest <= lead.days ? "proximo" : "ok");
    details.push(`${Math.abs(rest)} dia(s) ${rest >= 0 ? "restantes" : "em atraso"} · vence em ${dateBR(target.toISOString())}`);
  }
  return { state, detail: details.join(" · ") || "Informe KM, horímetro ou meses" };
}

export function maintenanceTotal(m: Pick<MaintenanceRecord, "labor_value" | "parts_value" | "other_value">) {
  return Number(m.labor_value ?? 0) + Number(m.parts_value ?? 0) + Number(m.other_value ?? 0);
}

/* --------------------------------- hooks -------------------------------- */

export function useMaintenanceSettings() {
  return useQuery({
    queryKey: ["maintenance-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("maintenance_settings").select("*").maybeSingle();
      if (error) throw error;
      return (data ?? null) as MaintenanceSettings | null;
    },
  });
}

export function useMaintenanceLead(): MaintenanceLead {
  const { data } = useMaintenanceSettings();
  return {
    km: Number(data?.lead_km ?? DEFAULT_LEAD.km),
    hours: Number(data?.lead_hours ?? DEFAULT_LEAD.hours),
    days: Number(data?.lead_days ?? DEFAULT_LEAD.days),
  };
}

export function useMaintenancePlans() {
  return useQuery({
    queryKey: ["maintenance-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_plans")
        .select(
          "*, vehicle:vehicles(id, plate,asset_code, brand, model, current_km, hour_meter, status), items:maintenance_plan_items(*)",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as MaintenancePlanRow[];
    },
  });
}

export function useMaintenanceRequests() {
  return useQuery({
    queryKey: ["maintenance-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select(
          "*, vehicle:vehicles(id, plate,asset_code, brand, model, current_km, hour_meter, status), unit:units(id, name, acronym), cost_center:cost_centers(id, code, name), plan:maintenance_plans(id, name)",
        )
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MaintenanceRequestRow[];
    },
  });
}

export function useMaintenanceRecords() {
  return useQuery({
    queryKey: ["maintenance-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_records")
        .select(
          "*, vehicle:vehicles(id, plate,asset_code, brand, model, current_km, hour_meter, status), supplier:suppliers(id, legal_name, trade_name), request:maintenance_requests(id, code, kind), parts:maintenance_parts(*), commitment:commitments(id, number), quota:quotas(id, name)",
        )
        .order("entry_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MaintenanceRecordRow[];
    },
  });
}

export function usePartsCatalog() {
  return useQuery({
    queryKey: ["parts-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parts_catalog").select("*").order("description");
      if (error) throw error;
      return (data ?? []) as PartCatalog[];
    },
  });
}

export function useMaintenanceParts() {
  return useQuery({
    queryKey: ["maintenance-parts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_parts")
        .select("*")
        .order("installed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaintenancePart[];
    },
  });
}

export function useTires() {
  return useQuery({
    queryKey: ["tires"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tires")
        .select(
          "*, vehicle:vehicles(id, plate,asset_code, brand, model, current_km, hour_meter, status), supplier:suppliers(id, legal_name, trade_name)",
        )
        .order("code");
      if (error) throw error;
      return (data ?? []) as unknown as TireRow[];
    },
  });
}

export function useTireMovements(tireId: string | null) {
  return useQuery({
    queryKey: ["tire-movements", tireId],
    enabled: !!tireId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tire_movements")
        .select("*")
        .eq("tire_id", tireId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TireMovement[];
    },
  });
}

export function useVehicleStatusHistory(vehicleId: string | null) {
  return useQuery({
    queryKey: ["vehicle-status-history", vehicleId],
    enabled: !!vehicleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_status_history")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VehicleStatusHistory[];
    },
  });
}

export async function refreshMaintenanceAlerts() {
  await supabase.rpc("refresh_maintenance_alerts");
}

/* ===================== FASE 6 — REDE CREDENCIADA, COTAÇÕES E OS ===================== */

export type Workshop = Database["public"]["Tables"]["workshops"]["Row"];
export type Quotation = Database["public"]["Tables"]["quotations"]["Row"];
export type QuotationItem = Database["public"]["Tables"]["quotation_items"]["Row"];
export type QuotationInvitation = Database["public"]["Tables"]["quotation_invitations"]["Row"];
export type QuotationProposal = Database["public"]["Tables"]["quotation_proposals"]["Row"];
export type QuotationProposalItem = Database["public"]["Tables"]["quotation_proposal_items"]["Row"];
export type ServiceOrder = Database["public"]["Tables"]["service_orders"]["Row"];
export type ServiceOrderItem = Database["public"]["Tables"]["service_order_items"]["Row"];

export type WorkshopStatus = Database["public"]["Enums"]["workshop_status"];
export type QuotationStatus = Database["public"]["Enums"]["quotation_status"];
export type ProposalStatus = Database["public"]["Enums"]["proposal_status"];
export type InvitationStatus = Database["public"]["Enums"]["invitation_status"];
export type ServiceOrderStatus = Database["public"]["Enums"]["service_order_status"];

export type QuotationRow = Quotation & {
  vehicle: Pick<Vehicle, "id" | "plate" | "asset_code" | "brand" | "model"> | null;
  request: Pick<MaintenanceRequest, "id" | "code" | "description"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
};
export type ProposalRow = QuotationProposal & {
  workshop: Pick<Workshop, "id" | "legal_name" | "trade_name" | "cnpj"> | null;
};
export type InvitationRow = QuotationInvitation & {
  workshop: Pick<Workshop, "id" | "legal_name" | "trade_name" | "specialties" | "status"> | null;
};
export type ServiceOrderRow = ServiceOrder & {
  vehicle: Pick<Vehicle, "id" | "plate" | "asset_code" | "brand" | "model"> | null;
  workshop: Pick<Workshop, "id" | "legal_name" | "trade_name" | "cnpj" | "phone"> | null;
  quotation: Pick<Quotation, "id" | "code"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
};

export const WORKSHOP_STATUS: { value: WorkshopStatus; label: string }[] = [
  { value: "em_analise", label: "Em análise" },
  { value: "ativo", label: "Ativo" },
  { value: "suspenso", label: "Suspenso" },
  { value: "inativo", label: "Inativo" },
];

export const QUOTATION_STATUS: { value: QuotationStatus; label: string }[] = [
  { value: "rascunho", label: "Rascunho" },
  { value: "aberta", label: "Aberta" },
  { value: "em_analise", label: "Em análise" },
  { value: "encerrada", label: "Encerrada" },
  { value: "cancelada", label: "Cancelada" },
];

export const PROPOSAL_STATUS: { value: ProposalStatus; label: string }[] = [
  { value: "recebida", label: "Recebida" },
  { value: "desclassificada", label: "Desclassificada" },
  { value: "selecionada", label: "Selecionada" },
  { value: "nao_selecionada", label: "Não selecionada" },
];

export const INVITATION_STATUS: { value: InvitationStatus; label: string }[] = [
  { value: "convidada", label: "Convidada" },
  { value: "respondida", label: "Respondida" },
  { value: "recusada", label: "Recusou" },
  { value: "sem_resposta", label: "Sem resposta" },
];

export const SERVICE_ORDER_STATUS: { value: ServiceOrderStatus; label: string }[] = [
  { value: "emitida", label: "Emitida" },
  { value: "veiculo_recebido", label: "Veículo recebido" },
  { value: "em_execucao", label: "Em execução" },
  { value: "aguardando_peca", label: "Aguardando peça" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];

export const WORKSHOP_SPECIALTIES = [
  "Mecânica",
  "Elétrica",
  "Funilaria",
  "Pintura",
  "Pneus",
  "Alinhamento/Balanceamento",
  "Ar-condicionado",
  "Vidraçaria",
  "Chaveiro",
  "Lavagem",
  "Reboque",
  "Concessionária/Autorizada",
  "Outras",
];

/** Meta legal de propostas por processo de cotação. */
export const MIN_PROPOSALS = 3;

export function labelOf<T extends string>(list: { value: T; label: string }[], v: T | null | undefined) {
  return list.find((i) => i.value === v)?.label ?? "—";
}

export function useWorkshops() {
  return useQuery({
    queryKey: ["workshops"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workshops").select("*").order("legal_name");
      if (error) throw error;
      return (data ?? []) as Workshop[];
    },
  });
}

export function useQuotations() {
  return useQuery({
    queryKey: ["quotations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select(
          "*, vehicle:vehicles(id, plate,asset_code, brand, model), request:maintenance_requests(id, code, description), unit:units(id, name, acronym)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as QuotationRow[];
    },
  });
}

export function useQuotationItems(quotationId: string | null) {
  return useQuery({
    queryKey: ["quotation-items", quotationId],
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_items")
        .select("*")
        .eq("quotation_id", quotationId!)
        .order("sequence");
      if (error) throw error;
      return (data ?? []) as QuotationItem[];
    },
  });
}

export function useQuotationInvitations(quotationId: string | null) {
  return useQuery({
    queryKey: ["quotation-invitations", quotationId],
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_invitations")
        .select("*, workshop:workshops(id, legal_name, trade_name, specialties, status)")
        .eq("quotation_id", quotationId!)
        .order("invited_at");
      if (error) throw error;
      return (data ?? []) as unknown as InvitationRow[];
    },
  });
}

export function useQuotationProposals(quotationId: string | null) {
  return useQuery({
    queryKey: ["quotation-proposals", quotationId],
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_proposals")
        .select("*, workshop:workshops(id, legal_name, trade_name, cnpj)")
        .eq("quotation_id", quotationId!)
        .order("total_value");
      if (error) throw error;
      return (data ?? []) as unknown as ProposalRow[];
    },
  });
}

export function useProposalItems(quotationId: string | null) {
  return useQuery({
    queryKey: ["proposal-items", quotationId],
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_proposal_items")
        .select("*, proposal:quotation_proposals!inner(quotation_id)")
        .eq("proposal.quotation_id", quotationId!);
      if (error) throw error;
      return (data ?? []) as unknown as QuotationProposalItem[];
    },
  });
}

export function useServiceOrders() {
  return useQuery({
    queryKey: ["service-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select(
          "*, vehicle:vehicles(id, plate,asset_code, brand, model), workshop:workshops(id, legal_name, trade_name, cnpj, phone), quotation:quotations(id, code), unit:units(id, name, acronym)",
        )
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ServiceOrderRow[];
    },
  });
}

export function useServiceOrderItems(serviceOrderId: string | null) {
  return useQuery({
    queryKey: ["service-order-items", serviceOrderId],
    enabled: !!serviceOrderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_order_items")
        .select("*")
        .eq("service_order_id", serviceOrderId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ServiceOrderItem[];
    },
  });
}

export function useMaintenancePlanItems(planId: string | null) {
  return useQuery({
    queryKey: ["maintenance-plan-items", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_plan_items")
        .select("*")
        .eq("plan_id", planId!)
        .order("sequence");
      if (error) throw error;
      return (data ?? []) as MaintenancePlanItem[];
    },
  });
}

/** Upload de anexo privado no bucket de manutenção (pasta por órgão). */
export async function uploadMaintenanceFile(orgId: string, file: File, folder: string) {
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${orgId}/${folder}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("manutencao").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export function useMaintenanceFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["manutencao-arquivo", path],
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage.from("manutencao").createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
}

export async function openMaintenanceFile(path: string) {
  const { data, error } = await supabase.storage.from("manutencao").createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error("Não foi possível abrir o anexo");
  window.open(data.signedUrl, "_blank", "noopener");
}

export async function refreshProcurementAlerts() {
  await supabase.rpc("refresh_procurement_alerts");
}

/* ======================================================================== */
/*   FASE 7 — MULTAS, SINISTROS, SEGUROS, OBRIGAÇÕES E PATRIMÔNIO           */
/* ======================================================================== */

export type ExternalEntity = Database["public"]["Tables"]["external_entities"]["Row"];
export type TrafficFine = Database["public"]["Tables"]["traffic_fines"]["Row"];
export type Accident = Database["public"]["Tables"]["accidents"]["Row"];
export type InsurancePolicy = Database["public"]["Tables"]["insurance_policies"]["Row"];
export type InsuranceVehicle = Database["public"]["Tables"]["insurance_vehicles"]["Row"];
export type VehicleObligation = Database["public"]["Tables"]["vehicle_obligations"]["Row"];
export type AssetMovement = Database["public"]["Tables"]["asset_movements"]["Row"];

export type EntityKind = Database["public"]["Enums"]["entity_kind"];
export type FineStatus = Database["public"]["Enums"]["fine_status"];
export type FineLiability = Database["public"]["Enums"]["fine_liability"];
export type AccidentKind = Database["public"]["Enums"]["accident_kind"];
export type AccidentStatus = Database["public"]["Enums"]["accident_status"];
export type InsuranceStatus = Database["public"]["Enums"]["insurance_status"];
export type ObligationStatus = Database["public"]["Enums"]["obligation_status"];
export type AssetMovementKind = Database["public"]["Enums"]["asset_movement_kind"];

type PlateRef = Pick<Vehicle, "id" | "plate" | "asset_code" | "brand" | "model" | "status" | "current_km" | "unit_id">;

export type TrafficFineRow = TrafficFine & {
  vehicle: PlateRef | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  driver: Pick<Driver, "id" | "full_name" | "cpf"> | null;
  usage: Pick<VehicleUsage, "id" | "code" | "planned_departure"> | null;
};
export type AccidentRow = Accident & {
  vehicle: PlateRef | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  driver: Pick<Driver, "id" | "full_name"> | null;
  usage: Pick<VehicleUsage, "id" | "code"> | null;
  policy: Pick<InsurancePolicy, "id" | "policy_number" | "insurer_name"> | null;
  entity: Pick<ExternalEntity, "id" | "name" | "document"> | null;
};
export type InsurancePolicyRow = InsurancePolicy & {
  supplier: Pick<Supplier, "id" | "legal_name" | "trade_name"> | null;
  contract: Pick<Contract, "id" | "number"> | null;
  vehicles: (InsuranceVehicle & { vehicle: PlateRef | null })[] | null;
};
export type VehicleObligationRow = VehicleObligation & { vehicle: PlateRef | null };
export type AssetMovementRow = AssetMovement & {
  vehicle: PlateRef | null;
  from_unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  entity: Pick<ExternalEntity, "id" | "name" | "document" | "kind"> | null;
  winner: Pick<ExternalEntity, "id" | "name" | "document"> | null;
  accident: Pick<Accident, "id" | "code" | "kind"> | null;
};

export const ENTITY_KINDS: { value: EntityKind; label: string }[] = [
  { value: "pj", label: "Pessoa jurídica" },
  { value: "pf", label: "Pessoa física" },
];

export const FINE_STATUS: { value: FineStatus; label: string }[] = [
  { value: "recebida", label: "Recebida" },
  { value: "em_analise", label: "Em análise" },
  { value: "defesa_apresentada", label: "Defesa apresentada" },
  { value: "deferida", label: "Deferida" },
  { value: "indeferida", label: "Indeferida" },
  { value: "paga", label: "Paga" },
  { value: "cancelada", label: "Cancelada" },
];

export const FINE_LIABILITY: { value: FineLiability; label: string }[] = [
  { value: "nao_definida", label: "Não definida" },
  { value: "condutor", label: "Do condutor" },
  { value: "orgao", label: "Do órgão" },
];

export const ACCIDENT_KINDS: { value: AccidentKind; label: string }[] = [
  { value: "colisao", label: "Colisão" },
  { value: "tombamento", label: "Tombamento" },
  { value: "atropelamento", label: "Atropelamento" },
  { value: "dano_estacionado", label: "Dano com veículo estacionado" },
  { value: "furto_roubo", label: "Furto / roubo" },
  { value: "incendio", label: "Incêndio" },
  { value: "perda_total", label: "Perda total" },
  { value: "outro", label: "Outro" },
];

export const ACCIDENT_STATUS: { value: AccidentStatus; label: string }[] = [
  { value: "registrado", label: "Registrado" },
  { value: "em_apuracao", label: "Em apuração" },
  { value: "seguradora_acionada", label: "Seguradora acionada" },
  { value: "reparo_autorizado", label: "Reparo autorizado" },
  { value: "encerrado", label: "Encerrado" },
];

export const INSURANCE_STATUS: { value: InsuranceStatus; label: string }[] = [
  { value: "ativa", label: "Ativa" },
  { value: "a_vencer", label: "A vencer" },
  { value: "vencida", label: "Vencida" },
  { value: "cancelada", label: "Cancelada" },
];

export const OBLIGATION_STATUS: { value: ObligationStatus; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "quitada", label: "Quitada" },
  { value: "vencida", label: "Vencida" },
  { value: "nao_aplicavel", label: "Não aplicável" },
  { value: "cancelada", label: "Cancelada" },
];

export const OBLIGATION_TYPES = [
  "Licenciamento / CRLV",
  "IPVA",
  "Seguro obrigatório (DPVAT)",
  "Inspeção veicular",
  "Tacógrafo / cronotacógrafo",
  "Registro ANTT",
  "Inspeção ambiental",
  "Outra obrigação",
];

export const ASSET_MOVEMENT_KINDS: { value: AssetMovementKind; label: string }[] = [
  { value: "proprio_em_uso", label: "Próprio em uso" },
  { value: "cedido_ao_orgao", label: "Cedido ao órgão" },
  { value: "cedido_a_terceiros", label: "Cedido a terceiros" },
  { value: "locado", label: "Locado" },
  { value: "fiel_depositario", label: "Fiel depositário" },
  { value: "remanejamento", label: "Remanejamento entre unidades" },
  { value: "baixa_manutencao", label: "Baixa para manutenção / remanejamento" },
  { value: "alienacao_em_processo", label: "Em processo de alienação" },
  { value: "doacao", label: "Doação" },
  { value: "leilao", label: "Leilão" },
  { value: "furto_roubo", label: "Furto / roubo" },
  { value: "perda_total", label: "Perda total" },
  { value: "alienado", label: "Alienado" },
  { value: "desativado", label: "Desativado" },
];

/** Movimentações que encerram a vida útil do bem no órgão. */
export const DISPOSAL_KINDS: AssetMovementKind[] = ["doacao", "leilao", "alienado", "desativado", "perda_total"];
/** Movimentações que envolvem entidade externa. */
export const EXTERNAL_KINDS: AssetMovementKind[] = [
  "cedido_ao_orgao",
  "cedido_a_terceiros",
  "locado",
  "fiel_depositario",
  "doacao",
  "leilao",
  "alienado",
];

export const CONDITION_STATES = ["Ótimo", "Bom", "Regular", "Ruim", "Inservível"];

/* --------------------------------- hooks -------------------------------- */

export function useExternalEntities() {
  return useQuery({
    queryKey: ["external-entities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("external_entities").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as ExternalEntity[];
    },
  });
}

const VEHICLE_REF = "vehicles(id, plate,asset_code, brand, model, status, current_km, unit_id)";

export function useTrafficFines() {
  return useQuery({
    queryKey: ["traffic-fines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("traffic_fines")
        .select(
          `*, vehicle:${VEHICLE_REF}, unit:units(id, name, acronym), driver:drivers(id, full_name, cpf), usage:vehicle_usages(id, code, planned_departure)`,
        )
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TrafficFineRow[];
    },
  });
}

export function useAccidents() {
  return useQuery({
    queryKey: ["accidents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accidents")
        .select(
          `*, vehicle:${VEHICLE_REF}, unit:units(id, name, acronym), driver:drivers(id, full_name), usage:vehicle_usages(id, code), policy:insurance_policies(id, policy_number, insurer_name), entity:external_entities!accidents_third_party_entity_id_fkey(id, name, document)`,
        )
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AccidentRow[];
    },
  });
}

export function useInsurancePolicies() {
  return useQuery({
    queryKey: ["insurance-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insurance_policies")
        .select(
          `*, supplier:suppliers(id, legal_name, trade_name), contract:contracts(id, number), vehicles:insurance_vehicles(*, vehicle:${VEHICLE_REF})`,
        )
        .order("valid_to", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InsurancePolicyRow[];
    },
  });
}

export function useVehicleObligations() {
  return useQuery({
    queryKey: ["vehicle-obligations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_obligations")
        .select(`*, vehicle:${VEHICLE_REF}`)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VehicleObligationRow[];
    },
  });
}

export function useAssetMovements() {
  return useQuery({
    queryKey: ["asset-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_movements")
        .select(
          `*, vehicle:${VEHICLE_REF}, from_unit:units!asset_movements_from_unit_id_fkey(id, name, acronym), unit:units!asset_movements_unit_id_fkey(id, name, acronym), entity:external_entities!asset_movements_entity_id_fkey(id, name, document, kind), winner:external_entities!asset_movements_auction_winner_entity_id_fkey(id, name, document), accident:accidents(id, code, kind)`,
        )
        .order("moved_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AssetMovementRow[];
    },
  });
}

/** Sugere o condutor que estava com o veículo no momento da infração/sinistro. */
export function suggestDriverForMoment(
  usages: UsageRow[],
  vehicleId: string | null,
  moment: Date | null,
): UsageRow | null {
  if (!vehicleId || !moment || Number.isNaN(moment.getTime())) return null;
  const ts = moment.getTime();
  const candidates = usages.filter((u) => {
    if (u.vehicle_id !== vehicleId || u.status === "cancelada") return false;
    const start = new Date(u.actual_departure ?? u.planned_departure).getTime();
    const end = new Date(u.actual_return ?? u.planned_return ?? u.planned_departure).getTime();
    return ts >= start - 36e5 && ts <= end + 36e5;
  });
  return candidates[0] ?? null;
}

/** Situação de vencimento para multas, seguros e obrigações. */
export function dueState(date: string | null | undefined, lead = 30): DueState {
  const d = daysUntil(date);
  if (d === null) return "sem_criterio";
  if (d < 0) return "vencido";
  if (d <= lead) return "proximo";
  return "ok";
}

/** Upload de anexo privado da frota (pasta por órgão). */
export async function uploadFleetFile(orgId: string, file: File, folder: string) {
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${orgId}/${folder}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("frota").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function openFleetFile(path: string) {
  const { data, error } = await supabase.storage.from("frota").createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error("Não foi possível abrir o anexo");
  window.open(data.signedUrl, "_blank", "noopener");
}

export async function refreshFleetAlerts() {
  await supabase.rpc("refresh_fleet_alerts");
}

/* ======================================================================== */
/*   MELHORIAS OPERACIONAIS — PRODUTOS, VÍNCULOS, ADITIVOS E EMPENHOS       */
/* ======================================================================== */

export type SupplierContract = Database["public"]["Tables"]["supplier_contracts"]["Row"];
export type ContractPeriod = Database["public"]["Tables"]["contract_periods"]["Row"];
export type ContractAmendment = Database["public"]["Tables"]["contract_amendments"]["Row"];
export type CommitmentMovement = Database["public"]["Tables"]["commitment_movements"]["Row"];
export type ContractAmendmentKind = Database["public"]["Enums"]["contract_amendment_kind"];

/** Categorias de produto do cadastro antes chamado apenas de "combustíveis". */
export const PRODUCT_CATEGORIES: { value: string; label: string; units: string[] }[] = [
  { value: "combustivel", label: "Combustível", units: ["litro", "m³", "kWh", "kg"] },
  { value: "lubrificante", label: "Óleo lubrificante", units: ["litro", "unidade", "kg"] },
  { value: "fluido", label: "Fluido", units: ["litro", "unidade", "kg"] },
  { value: "aditivo", label: "Aditivo automotivo", units: ["litro", "unidade", "kg"] },
  { value: "outro", label: "Outro produto automotivo", units: ["litro", "unidade", "kg", "m³", "outra"] },
];

export const PRODUCT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  PRODUCT_CATEGORIES.map((c) => [c.value, c.label]),
);

export const PRODUCT_UNITS = ["litro", "m³", "kWh", "kg", "unidade", "outra"];

/** Somente estes itens contam nos indicadores de litros de combustível e média km/l. */
export function isFuelProduct(p: { category?: string | null } | null | undefined) {
  return (p?.category ?? "combustivel") === "combustivel";
}

/** Filtra abastecimentos deixando apenas os de combustível de fato. */
export function onlyFuelRows<T extends { fuel_type_id?: string | null }>(
  rows: T[],
  products: Pick<FuelType, "id" | "category">[],
): T[] {
  const fuelIds = new Set(products.filter((p) => isFuelProduct(p)).map((p) => p.id));
  return rows.filter((r) => !r.fuel_type_id || fuelIds.has(r.fuel_type_id));
}

/** Tipos de documento fiscal aceitos no abastecimento. */
export const DOCUMENT_KINDS: { value: string; label: string; needsKey?: boolean }[] = [
  { value: "cupom", label: "Cupom fiscal" },
  { value: "nfce", label: "NFC-e", needsKey: true },
  { value: "nfe", label: "NF-e", needsKey: true },
  { value: "nota", label: "Nota fiscal" },
  { value: "recibo", label: "Recibo" },
  { value: "outro", label: "Outro documento" },
];

export const DOCUMENT_KIND_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_KINDS.map((d) => [d.value, d.label]),
);

export const CONTRACT_AMENDMENT_KINDS: { value: ContractAmendmentKind; label: string; help: string }[] = [
  {
    value: "prorrogacao",
    label: "Prorrogação de vigência (sem alteração do valor-base)",
    help: "Cria uma nova vigência que inicia com o valor contratual definido para o período, sem herdar saldo remanescente.",
  },
  {
    value: "acrescimo",
    label: "Acréscimo de valor",
    help: "Aumenta o valor vigente do contrato preservando o valor original.",
  },
  {
    value: "supressao",
    label: "Supressão de valor",
    help: "Reduz o valor vigente do contrato preservando o valor original.",
  },
  { value: "reajuste", label: "Reajuste", help: "Aplica índice/percentual sobre o valor vigente." },
  {
    value: "reequilibrio",
    label: "Reequilíbrio econômico-financeiro",
    help: "Recompõe o valor vigente mediante fundamento específico.",
  },
  {
    value: "prorrogacao_valor",
    label: "Prorrogação com novo valor",
    help: "Nova vigência iniciando com o novo valor integral informado.",
  },
  {
    value: "combinado",
    label: "Aditivo combinado",
    help: "Altera valor e vigência no mesmo instrumento.",
  },
];

export const AMENDMENT_KIND_LABELS: Record<string, string> = Object.fromEntries(
  CONTRACT_AMENDMENT_KINDS.map((k) => [k.value, k.label]),
);

/** Aditivos que criam nova vigência. */
export const AMENDMENT_CREATES_PERIOD: ContractAmendmentKind[] = [
  "prorrogacao",
  "prorrogacao_valor",
  "combinado",
];
/** Aditivos que alteram valor. */
export const AMENDMENT_CHANGES_VALUE: ContractAmendmentKind[] = [
  "acrescimo",
  "supressao",
  "reajuste",
  "reequilibrio",
  "combinado",
];

/* --------------------------------- hooks -------------------------------- */

export type SupplierContractRow = SupplierContract & {
  contract: Pick<
    Contract,
    "id" | "number" | "object" | "valid_from" | "valid_to" | "status" | "current_value" | "initial_value"
  > | null;
  supplier: Pick<Supplier, "id" | "legal_name" | "cnpj"> | null;
};

export function useSupplierContracts() {
  return useQuery({
    queryKey: ["supplier-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_contracts")
        .select(
          "*, contract:contracts(id, number, object, valid_from, valid_to, status, current_value, initial_value), supplier:suppliers(id, legal_name, cnpj)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SupplierContractRow[];
    },
  });
}

export function useContractPeriods() {
  return useQuery({
    queryKey: ["contract-periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_periods")
        .select("*")
        .order("sequence", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContractPeriod[];
    },
  });
}

export function useContractAmendments() {
  return useQuery({
    queryKey: ["contract-amendments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_amendments")
        .select("*")
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractAmendment[];
    },
  });
}

export function useCommitmentMovements() {
  return useQuery({
    queryKey: ["commitment-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commitment_movements")
        .select("*")
        .order("moved_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommitmentMovement[];
    },
  });
}

/* ------------------------------- cálculos ------------------------------- */

/** Consolidado financeiro do empenho, incluindo reforços e reduções. */
export function commitmentTotals(e: Commitment, movements: CommitmentMovement[] = []) {
  const mine = movements.filter((m) => m.commitment_id === e.id);
  const reinforced = mine.filter((m) => m.kind === "reforco").reduce((s, m) => s + Number(m.value ?? 0), 0);
  const reduced = mine.filter((m) => m.kind === "reducao").reduce((s, m) => s + Number(m.value ?? 0), 0);
  const committed = Number(e.committed_value ?? 0);
  const cancelled = Number(e.cancelled_value ?? 0);
  const reserved = Number(e.reserved_value ?? 0);
  const consumed = Number(e.consumed_value ?? 0);
  return {
    original: committed - reinforced,
    reinforced,
    reduced,
    committed,
    cancelled,
    current: committed - cancelled,
    reserved,
    consumed,
    available: Number(e.available_value ?? committed - cancelled - reserved - consumed),
  };
}

/** Vigência aplicável a uma data (ou a vigência corrente). */
export function periodAt(periods: ContractPeriod[], contractId: string, at: Date = new Date()) {
  const list = periods.filter((p) => p.contract_id === contractId);
  const day = at.toISOString().slice(0, 10);
  return (
    list.find((p) => p.valid_from <= day && day <= p.valid_to) ??
    list.find((p) => p.is_current) ??
    list[list.length - 1] ??
    null
  );
}

export function periodBalance(p: ContractPeriod) {
  return Number(p.period_value ?? 0) - Number(p.reserved_value ?? 0) - Number(p.consumed_value ?? 0);
}

/* ======================================================================== */
/*   MANUTENÇÃO — LIMPEZA DE VEÍCULOS                                       */
/* ======================================================================== */

export type CleaningType = Database["public"]["Tables"]["cleaning_types"]["Row"];
export type VehicleCleaning = Database["public"]["Tables"]["vehicle_cleanings"]["Row"];
export type CleaningStatus = Database["public"]["Enums"]["cleaning_status"];

export type VehicleCleaningRow = VehicleCleaning & {
  vehicle: VehicleRef | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  supplier: Pick<Supplier, "id" | "legal_name" | "trade_name"> | null;
  contract: Pick<Contract, "id" | "number"> | null;
  commitment: Pick<Commitment, "id" | "number"> | null;
  quota: Pick<Quota, "id" | "name"> | null;
  cost_center: Pick<CostCenter, "id" | "code" | "name"> | null;
};

export const CLEANING_STATUS: { value: CleaningStatus; label: string }[] = [
  { value: "agendada", label: "Agendada" },
  { value: "realizada", label: "Realizada" },
  { value: "cancelada", label: "Cancelada" },
];

const CLEANING_SELECT =
  "*, vehicle:vehicles(id, plate,asset_code, brand, model, current_km, hour_meter, status), unit:units(id, name, acronym), supplier:suppliers(id, legal_name, trade_name), contract:contracts(id, number), commitment:commitments(id, number), quota:quotas(id, name), cost_center:cost_centers(id, code, name)";

export function useCleaningTypes(onlyActive = false) {
  return useQuery({
    queryKey: ["cleaning-types", onlyActive],
    queryFn: async () => {
      let q = supabase.from("cleaning_types").select("*").order("sort_order").order("name");
      if (onlyActive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CleaningType[];
    },
  });
}

export function useVehicleCleanings(vehicleId?: string) {
  return useQuery({
    queryKey: ["vehicle-cleanings", vehicleId ?? "todas"],
    queryFn: async () => {
      let q = supabase.from("vehicle_cleanings").select(CLEANING_SELECT).order("performed_at", { ascending: false });
      if (vehicleId) q = q.eq("vehicle_id", vehicleId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VehicleCleaningRow[];
    },
  });
}
