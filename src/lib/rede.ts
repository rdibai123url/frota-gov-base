/* =====================================================================
 * FASE 11 — Bloco 3: rede operacional derivada dos contratos.
 *
 * A operação (fornecedores/postos, oficinas/prestadores do órgão e mapa)
 * não tem mais cadastro solto: as empresas são deduzidas dos contratos
 * vigentes do próprio órgão, usando o cadastro mestre de Pessoas e
 * Empresas Externas como identidade. Empresas sem contrato continuam
 * existindo no cadastro mestre (cotação, compra direta, terceiro).
 *
 * Multi-tenant: todas as consultas passam pelos hooks já existentes,
 * que aplicam RLS por organization_id.
 * ===================================================================== */
import { useMemo } from "react";

import { onlyDigits, useContracts, type ContractItem, type ContractRow } from "@/lib/frotagov";

/** Categorias operacionais reconhecidas na rede. */
export type NetworkCategory =
  "combustivel" | "pecas" | "pneus" | "manutencao" | "higienizacao" | "seguros" | "outro";

export const NETWORK_CATEGORY_LABELS: Record<NetworkCategory, string> = {
  combustivel: "Combustível e derivados",
  pecas: "Peças e acessórios",
  pneus: "Pneus",
  manutencao: "Manutenção / oficina",
  higienizacao: "Higienização / lava-jato",
  seguros: "Seguros",
  outro: "Outros fornecimentos",
};

export function networkCategoryLabel(c: string) {
  return NETWORK_CATEGORY_LABELS[c as NetworkCategory] ?? c;
}

/** Contratos que valem para a operação do dia a dia. */
export function isOperationalContract(c: ContractRow) {
  return c.status === "vigente" || c.status === "suspenso";
}

/** Categorias de um contrato, a partir do objeto e dos itens contratados. */
export function contractCategories(c: ContractRow): NetworkCategory[] {
  const out = new Set<NetworkCategory>();
  switch (c.object_kind) {
    case "combustivel_oleos":
      out.add("combustivel");
      break;
    case "pecas":
      out.add("pecas");
      break;
    case "pneus":
      out.add("pneus");
      break;
    case "manutencao":
      out.add("manutencao");
      break;
    case "higienizacao":
      out.add("higienizacao");
      break;
    case "seguros":
      out.add("seguros");
      break;
    default:
      break;
  }
  for (const i of c.items ?? []) {
    if (i.material_kind === "combustivel") out.add("combustivel");
    else if (i.material_kind === "peca") out.add("pecas");
    else if (i.material_kind === "pneu") out.add("pneus");
    else if (i.material_kind === "servico") out.add("manutencao");
  }
  if (out.size === 0) out.add("outro");
  return [...out];
}

export type NetworkCompany = {
  /** Chave estável de agrupamento — evita empresa duplicada na lista/mapa. */
  key: string;
  entityId: string | null;
  supplierId: string | null;
  name: string;
  tradeName: string | null;
  document: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Categorias declaradas no cadastro mestre da empresa. */
  masterCategories: string[];
  /** Categorias efetivamente contratadas. */
  categories: NetworkCategory[];
  contracts: ContractRow[];
  /** Há contrato por credenciamento. */
  accredited: boolean;
};

function companyFrom(c: ContractRow): NetworkCompany {
  const e = c.entity;
  const digits = onlyDigits(e?.document ?? c.cnpj ?? "");
  const key = e?.id ?? c.supplier_id ?? (digits || `contrato:${c.id}`);
  return {
    key,
    entityId: e?.id ?? null,
    supplierId: c.supplier_id ?? null,
    name: e?.name ?? c.supplier?.legal_name ?? "Empresa não identificada",
    tradeName: e?.trade_name ?? c.supplier?.trade_name ?? null,
    document: e?.document ?? c.cnpj ?? null,
    address: e?.address ?? null,
    district: e?.district ?? null,
    city: e?.city ?? null,
    state: e?.state ?? null,
    phone: e?.phone ?? null,
    email: e?.email ?? null,
    contactName: e?.contact_name ?? null,
    latitude: e?.latitude ?? null,
    longitude: e?.longitude ?? null,
    masterCategories: e?.categories ?? [],
    categories: [],
    contracts: [],
    accredited: false,
  };
}

/**
 * Empresas da rede operacional, agrupadas por empresa (nunca duplicadas),
 * com o resumo dos contratos que as habilitam.
 */
export function useNetworkCompanies(only?: NetworkCategory[]) {
  const { data: contracts = [], isLoading } = useContracts();

  const companies = useMemo(() => {
    const map = new Map<string, NetworkCompany>();
    for (const c of contracts) {
      if (!isOperationalContract(c)) continue;
      const cats = contractCategories(c);
      if (only && only.length > 0 && !cats.some((k) => only.includes(k))) continue;
      const base = companyFrom(c);
      const cur = map.get(base.key) ?? base;
      cur.contracts.push(c);
      cur.categories = [...new Set([...cur.categories, ...cats])];
      if (c.modality === "credenciamento") cur.accredited = true;
      // completa dados faltantes a partir de outro contrato da mesma empresa
      cur.address ??= base.address;
      cur.city ??= base.city;
      cur.state ??= base.state;
      cur.phone ??= base.phone;
      cur.email ??= base.email;
      cur.contactName ??= base.contactName;
      cur.latitude ??= base.latitude;
      cur.longitude ??= base.longitude;
      map.set(cur.key, cur);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [contracts, only]);

  return { companies, isLoading };
}

/** Saldo de um item contratual considerando aditivos, reservas e consumo. */
export function contractItemBalance(i: ContractItem) {
  const quantity = Number(i.quantity ?? 0);
  const reserved = Number(i.reserved_quantity ?? 0);
  const consumed = Number(i.consumed_quantity ?? 0);
  const unit = Number(i.unit_price ?? 0);
  const available = quantity - reserved - consumed;
  return {
    quantity,
    reserved,
    consumed,
    available,
    unit,
    total: Number(i.total_value ?? quantity * unit),
    availableValue: available * unit,
  };
}

/** Itens de material (peça, pneu, acessório) de um contrato. */
export function materialItems(c: ContractRow | null | undefined) {
  return (c?.items ?? []).filter((i) => i.active && i.material_kind !== "combustivel");
}

/** Itens de combustível/derivados de um contrato. */
export function fuelItems(c: ContractRow | null | undefined) {
  return (c?.items ?? []).filter((i) => i.active && i.material_kind === "combustivel");
}
