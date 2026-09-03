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
  const roles = me?.roles ?? [];
  return {
    roles,
    orgId: me?.profile?.organization_id ?? null,
    unitId: me?.profile?.unit_id ?? null,
    userId: me?.profile?.id ?? null,
    userName: me?.profile?.full_name ?? me?.email ?? "",
    canWrite: roles.some((r) => WRITE_ROLES.includes(r)),
    canRegister: roles.some((r) => REGISTER_ROLES.includes(r)),
    canCancel: roles.some((r) => CANCEL_ROLES.includes(r)),
    canManageFleet: roles.some((r) => (["super_admin", "org_admin", "fleet_manager"] as AppRole[]).includes(r)),
    isAuditor: roles.length > 0 && roles.every((r) => r === "auditor"),
  };
}


/* ------------------------------ máscaras ------------------------------ */

const digits = (v: string) => v.replace(/\D/g, "");

export function maskCNPJ(v: string) {
  const d = digits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskCEP(v: string) {
  const d = digits(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

export function maskPlate(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function isValidCNPJ(v: string) {
  const d = digits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = 0; i < len; i++) {
      sum += Number(d[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const brl = (n: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n ?? 0));

export const num = (n: number | null | undefined, digitsCount = 2) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digitsCount,
    maximumFractionDigits: digitsCount,
  }).format(Number(n ?? 0));

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
  "*, vehicle:vehicles(id, plate, asset_code, fuel_type, tank_capacity, status), unit:units(id, name, acronym), supplier:suppliers(id, legal_name, trade_name), fuel:fuel_types(id, name, measure_unit), driver:drivers(id, full_name), authorization:fuel_authorizations(id, code, max_quantity, consumed_quantity)";


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
        .select("*, vehicle:vehicles(id, plate), fueling:fuelings(id, fueled_at, status)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as (FuelingAlert & {
        vehicle: { id: string; plate: string } | null;
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
  vehicle: Pick<Vehicle, "id" | "plate" | "status"> | null;
  unit: Pick<Unit, "id" | "name" | "acronym"> | null;
  driver: Pick<Driver, "id" | "full_name" | "license_expiry" | "active"> | null;
};

export type AuthorizationRow = FuelAuthorization & {
  vehicle: Pick<Vehicle, "id" | "plate" | "fuel_type" | "status"> | null;
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

export const maskCPF = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");

export function isValidCPF(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

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
          "*, vehicle:vehicles(id, plate, status), unit:units(id, name, acronym), driver:drivers(id, full_name, license_expiry, active)",
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
          "*, vehicle:vehicles(id, plate, fuel_type, status), unit:units(id, name, acronym), driver:drivers(id, full_name, license_expiry, active), fuel:fuel_types(id, name, measure_unit), supplier:suppliers(id, legal_name, trade_name)",
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
