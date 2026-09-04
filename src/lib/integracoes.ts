/**
 * Fase 10 — Blocos 5 e 6.
 *
 * Central de Integrações (DETRAN, SIAFIC, LDAP/SSO, FIPE, Webhooks, API),
 * histórico de valor de mercado/FIPE dos ativos, fatores de emissão (ESG)
 * e apoio à geolocalização da rede credenciada.
 *
 * Princípios:
 * - Nenhuma integração externa é simulada. Sem credencial configurada o
 *   conector permanece com situação "não configurado" e as ações ficam
 *   desabilitadas.
 * - Segredos nunca são armazenados aqui: guardamos apenas o *nome* do
 *   segredo (`secret_name`) e o indicador `has_secret`.
 * - Emissões de CO2e são SEMPRE estimativas, calculadas a partir de fatores
 *   parametrizáveis por órgão — nunca medição real.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/frotagov";
import type { Database } from "@/integrations/supabase/types";

/* -------------------------------- tipos --------------------------------- */

export type IntegrationKind = Database["public"]["Enums"]["integration_kind"];
export type IntegrationStatus = Database["public"]["Enums"]["integration_status"];
export type IntegrationEnvironment = Database["public"]["Enums"]["integration_environment"];
export type Connector = Database["public"]["Tables"]["integration_connectors"]["Row"];
export type IntegrationLog = Database["public"]["Tables"]["integration_logs"]["Row"];
export type IntegrationMapping = Database["public"]["Tables"]["integration_mappings"]["Row"];
export type WebhookEndpoint = Database["public"]["Tables"]["webhook_endpoints"]["Row"];
export type WebhookDelivery = Database["public"]["Tables"]["webhook_deliveries"]["Row"];
export type MarketValue = Database["public"]["Tables"]["asset_market_values"]["Row"];
export type EmissionFactor = Database["public"]["Tables"]["emission_factors"]["Row"];
export type DetranSnapshot = Database["public"]["Tables"]["detran_snapshots"]["Row"];

/* ----------------------------- metadados -------------------------------- */

export const CONNECTOR_META: Record<
  IntegrationKind,
  { label: string; description: string; fields: { key: string; label: string; placeholder?: string }[]; secretLabel?: string; testable: boolean }
> = {
  detran: {
    label: "DETRAN",
    description:
      "Consulta cadastral de veículos (placa, RENAVAM, chassi, licenciamento). Depende de convênio e credenciais do órgão junto ao DETRAN estadual.",
    fields: [
      { key: "uf", label: "UF do DETRAN", placeholder: "SP" },
      { key: "convenio", label: "Número do convênio" },
      { key: "usuario", label: "Usuário/identificação" },
    ],
    secretLabel: "DETRAN_API_TOKEN",
    testable: true,
  },
  siafic: {
    label: "SIAFIC / Contabilidade",
    description:
      "Troca de empenhos, contratos, centros de custo, dotações, liquidações e pagamentos com o sistema contábil do município. Layout configurável (CSV/JSON/API).",
    fields: [
      { key: "sistema", label: "Sistema contábil", placeholder: "Nome do fornecedor" },
      { key: "exercicio", label: "Exercício", placeholder: "2026" },
      { key: "unidade_gestora", label: "Unidade gestora" },
    ],
    secretLabel: "SIAFIC_API_TOKEN",
    testable: true,
  },
  ldap_sso: {
    label: "LDAP / SSO corporativo",
    description:
      "Autenticação corporativa por OIDC ou SAML (LDAP somente por gateway seguro). O login padrão do FrotaGov continua disponível como alternativa.",
    fields: [
      { key: "protocolo", label: "Protocolo (OIDC/SAML)", placeholder: "OIDC" },
      { key: "issuer", label: "Issuer / Metadata URL" },
      { key: "client_id", label: "Client ID" },
      { key: "dominio", label: "Domínio de e-mail" },
    ],
    secretLabel: "SSO_CLIENT_SECRET",
    testable: false,
  },
  fipe: {
    label: "FIPE / valor de mercado",
    description:
      "Atualização automática do valor de mercado dos veículos. Enquanto não houver API contratada, o valor é informado manualmente ou importado.",
    fields: [
      { key: "provedor", label: "Provedor da API" },
      { key: "tabela", label: "Tabela de referência" },
    ],
    secretLabel: "FIPE_API_KEY",
    testable: true,
  },
  serpro: {
    label: "SERPRO / SENATRAN (RENAVAM)",
    description:
      "Consulta oficial de dados de veículo e condutor na base nacional. Disponível mediante contratação e credenciais do órgão junto ao SERPRO/SENATRAN. Sem credencial, nenhuma consulta é feita.",
    fields: [
      { key: "produto", label: "Produto contratado", placeholder: "Consulta Veicular" },
      { key: "cnpj_orgao", label: "CNPJ do órgão contratante" },
      { key: "consumer_key", label: "Consumer Key" },
    ],
    secretLabel: "SERPRO_API_TOKEN",
    testable: true,
  },
  oidc: {
    label: "SSO — OIDC",
    description:
      "Login institucional por OpenID Connect. Segredos ficam somente no servidor; o login padrão do FrotaGov permanece disponível.",
    fields: [
      { key: "issuer", label: "Issuer / Discovery URL" },
      { key: "client_id", label: "Client ID" },
      { key: "dominio", label: "Domínio de e-mail" },
    ],
    secretLabel: "OIDC_CLIENT_SECRET",
    testable: true,
  },
  saml: {
    label: "SSO — SAML 2.0",
    description:
      "Login institucional por SAML 2.0 com metadados do provedor de identidade do órgão.",
    fields: [
      { key: "metadata_url", label: "URL de metadados do IdP" },
      { key: "entity_id", label: "Entity ID" },
      { key: "dominio", label: "Domínio de e-mail" },
    ],
    secretLabel: "SAML_SIGNING_CERT",
    testable: true,
  },
  ldap: {
    label: "Diretório LDAP / Active Directory",
    description:
      "Sincronização de usuários e grupos do diretório corporativo por gateway seguro. Credenciais ficam somente no servidor.",
    fields: [
      { key: "host", label: "Endereço do gateway", placeholder: "https://gateway.orgao.gov.br" },
      { key: "base_dn", label: "Base DN", placeholder: "dc=orgao,dc=gov,dc=br" },
      { key: "bind_dn", label: "Usuário de leitura (bind DN)" },
    ],
    secretLabel: "LDAP_BIND_PASSWORD",
    testable: true,
  },
  webhook: {
    label: "Webhooks",
    description:
      "Notificações automáticas para sistemas do órgão a cada evento relevante do FrotaGov, com assinatura HMAC e reenvio automático.",
    fields: [],
    testable: false,
  },
  api: {
    label: "API FrotaGov",
    description:
      "API REST somente leitura, autenticada por chave do órgão, com escopos, paginação, filtros e auditoria.",
    fields: [{ key: "rate_limit", label: "Limite por minuto", placeholder: "120" }],
    testable: true,
  },
};

export const STATUS_LABELS: Record<IntegrationStatus, string> = {
  nao_configurado: "Não configurado",
  configurado: "Configurado",
  ativo: "Ativo",
  erro: "Com erro",
  desativado: "Desativado",
};

export const WEBHOOK_EVENTS: { value: string; label: string }[] = [
  { value: "autorizacao.criada", label: "Autorização de abastecimento criada" },
  { value: "autorizacao.cancelada", label: "Autorização cancelada" },
  { value: "abastecimento.concluido", label: "Abastecimento concluído" },
  { value: "manutencao.alterada", label: "Manutenção alterada" },
  { value: "ordem_servico.alterada", label: "Ordem de Serviço alterada" },
  { value: "ofp.alterada", label: "Ordem de Fornecimento alterada" },
  { value: "estoque.baixo", label: "Estoque abaixo do mínimo" },
  { value: "contrato.vencimento", label: "Contrato próximo do vencimento" },
  { value: "transparencia.fechada", label: "Competência de transparência fechada" },
  { value: "transparencia.reaberta", label: "Competência de transparência reaberta" },
  { value: "alerta.critico", label: "Alerta crítico de inconsistência" },
];

export const SIAFIC_ENTITIES = [
  "empenhos",
  "contratos",
  "contratos_itens",
  "centros_de_custo",
  "dotacoes",
  "liquidacoes",
  "pagamentos",
  "veiculos",
  "abastecimentos",
  "manutencoes",
] as const;

/** Campos do DETRAN mapeados para o cadastro do FrotaGov. */
export const DETRAN_FIELD_MAP: { detran: string; label: string; vehicle: string | null }[] = [
  { detran: "placa", label: "Placa", vehicle: "plate" },
  { detran: "renavam", label: "RENAVAM", vehicle: "renavam" },
  { detran: "chassi", label: "Chassi", vehicle: "chassis" },
  { detran: "marca", label: "Marca", vehicle: "brand" },
  { detran: "modelo", label: "Modelo", vehicle: "model" },
  { detran: "ano_fabricacao", label: "Ano de fabricação", vehicle: "year_manufacture" },
  { detran: "ano_modelo", label: "Ano do modelo", vehicle: "year_model" },
  { detran: "combustivel", label: "Combustível", vehicle: "fuel_type" },
  { detran: "categoria", label: "Categoria", vehicle: "vehicle_type" },
  { detran: "especie", label: "Espécie", vehicle: null },
  { detran: "carroceria", label: "Carroceria", vehicle: null },
  { detran: "cor", label: "Cor", vehicle: "color" },
  { detran: "capacidade", label: "Capacidade", vehicle: "capacity_desc" },
  { detran: "potencia", label: "Potência (cv)", vehicle: "power_hp" },
  { detran: "municipio_licenciamento", label: "Município de licenciamento", vehicle: null },
  { detran: "situacao", label: "Situação / licenciamento", vehicle: null },
];

/* -------------------------------- hooks --------------------------------- */

export function useConnectors(enabled = true) {
  return useQuery({
    queryKey: ["integration-connectors"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("integration_connectors").select("*").order("kind");
      if (error) throw error;
      return (data ?? []) as Connector[];
    },
  });
}

export function useIntegrationLogs(kind?: IntegrationKind | null, enabled = true) {
  return useQuery({
    queryKey: ["integration-logs", kind ?? "todos"],
    enabled,
    queryFn: async () => {
      let q = supabase.from("integration_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as IntegrationLog[];
    },
  });
}

export function useIntegrationMappings(enabled = true) {
  return useQuery({
    queryKey: ["integration-mappings"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_mappings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IntegrationMapping[];
    },
  });
}

export function useWebhookEndpoints(enabled = true) {
  return useQuery({
    queryKey: ["webhook-endpoints"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WebhookEndpoint[];
    },
  });
}

export function useWebhookDeliveries(endpointId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["webhook-deliveries", endpointId ?? "todos"],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from("webhook_deliveries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (endpointId) q = q.eq("endpoint_id", endpointId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as WebhookDelivery[];
    },
  });
}

export function useMarketValues(vehicleId?: string | null) {
  return useQuery({
    queryKey: ["market-values", vehicleId],
    enabled: Boolean(vehicleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_market_values")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("reference_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketValue[];
    },
  });
}

/** Último valor de mercado conhecido por ativo (para TCO e relatórios). */
export function useLatestMarketValues(enabled = true) {
  return useQuery({
    queryKey: ["market-values-latest"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_market_values")
        .select("*")
        .order("reference_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, MarketValue>();
      for (const row of (data ?? []) as MarketValue[]) {
        if (!map.has(row.vehicle_id)) map.set(row.vehicle_id, row);
      }
      return map;
    },
  });
}

export function useEmissionFactors(enabled = true) {
  return useQuery({
    queryKey: ["emission-factors"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emission_factors")
        .select("*")
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmissionFactor[];
    },
  });
}

export function useDetranSnapshots(vehicleId?: string | null) {
  return useQuery({
    queryKey: ["detran-snapshots", vehicleId],
    enabled: Boolean(vehicleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("detran_snapshots")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("fetched_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DetranSnapshot[];
    },
  });
}

/* ------------------------------ utilitários ------------------------------ */

/** Registra uma linha no histórico técnico de integrações. */
export async function logIntegration(entry: {
  organizationId: string;
  kind: IntegrationKind;
  connectorId?: string | null;
  operation: string;
  direction?: "entrada" | "saida" | "teste";
  status: "sucesso" | "parcial" | "erro";
  message?: string;
  recordsTotal?: number;
  recordsOk?: number;
  recordsError?: number;
  details?: Record<string, unknown>;
  userId?: string | null;
}) {
  await supabase.from("integration_logs").insert({
    organization_id: entry.organizationId,
    connector_id: entry.connectorId ?? null,
    kind: entry.kind,
    operation: entry.operation,
    direction: entry.direction ?? "saida",
    status: entry.status,
    message: entry.message ?? null,
    records_total: entry.recordsTotal ?? 0,
    records_ok: entry.recordsOk ?? 0,
    records_error: entry.recordsError ?? 0,
    details: (entry.details ?? {}) as never,
    created_by: entry.userId ?? null,
  });
}

/** Distância aproximada em km entre dois pontos (fórmula de Haversine). */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Normaliza o nome do combustível para casar com a chave do fator de emissão. */
export function fuelKeyOf(name: string | null | undefined): string {
  const t = (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (t.includes("etanol") || t.includes("alcool")) return "etanol";
  if (t.includes("diesel")) return "diesel";
  if (t.includes("gnv") || t.includes("gas natural")) return "gnv";
  if (t.includes("arla")) return "arla";
  if (t.includes("eletric") || t.includes("kwh")) return "eletrico";
  if (t.includes("gasolina")) return "gasolina";
  return "outro";
}

/** Escolhe o fator vigente na data informada (mais recente que já valia). */
export function factorFor(
  factors: EmissionFactor[],
  key: string,
  onDate: string,
): EmissionFactor | undefined {
  const day = onDate.slice(0, 10);
  return factors
    .filter(
      (f) =>
        f.active &&
        f.fuel_key === key &&
        f.valid_from <= day &&
        (!f.valid_to || f.valid_to >= day),
    )
    .sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0];
}

export type EsgInput = {
  fueledAt: string;
  fuelKey: string;
  quantity: number;
  distanceKm?: number;
  hours?: number;
};

export type EsgSummary = {
  totalLiters: number;
  totalCo2e: number;
  renewableLiters: number;
  renewablePct: number;
  byFuel: { key: string; label: string; liters: number; co2e: number; factor: number | null }[];
  byMonth: { month: string; liters: number; co2e: number }[];
  missingFactors: string[];
};

/** Estimativa de CO2e a partir dos litros consumidos e dos fatores do órgão. */
export function computeEsg(rows: EsgInput[], factors: EmissionFactor[]): EsgSummary {
  const byFuel = new Map<string, { liters: number; co2e: number; factor: number | null; label: string; renew: number }>();
  const byMonth = new Map<string, { liters: number; co2e: number }>();
  const missing = new Set<string>();
  let totalLiters = 0;
  let totalCo2e = 0;
  let renewableLiters = 0;

  for (const r of rows) {
    const f = factorFor(factors, r.fuelKey, r.fueledAt);
    if (!f) missing.add(r.fuelKey);
    const co2e = f ? r.quantity * Number(f.factor_kg_co2e_per_unit) : 0;
    const renew = f ? (r.quantity * Number(f.renewable_share_pct)) / 100 : 0;

    totalLiters += r.quantity;
    totalCo2e += co2e;
    renewableLiters += renew;

    const cur = byFuel.get(r.fuelKey) ?? {
      liters: 0,
      co2e: 0,
      factor: f ? Number(f.factor_kg_co2e_per_unit) : null,
      label: f?.label ?? r.fuelKey,
      renew: 0,
    };
    cur.liters += r.quantity;
    cur.co2e += co2e;
    cur.renew += renew;
    byFuel.set(r.fuelKey, cur);

    const month = r.fueledAt.slice(0, 7);
    const m = byMonth.get(month) ?? { liters: 0, co2e: 0 };
    m.liters += r.quantity;
    m.co2e += co2e;
    byMonth.set(month, m);
  }

  return {
    totalLiters,
    totalCo2e,
    renewableLiters,
    renewablePct: totalLiters > 0 ? (renewableLiters / totalLiters) * 100 : 0,
    byFuel: [...byFuel.entries()]
      .map(([key, v]) => ({ key, label: v.label, liters: v.liters, co2e: v.co2e, factor: v.factor }))
      .sort((a, b) => b.liters - a.liters),
    byMonth: [...byMonth.entries()]
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => (a.month < b.month ? -1 : 1)),
    missingFactors: [...missing],
  };
}
