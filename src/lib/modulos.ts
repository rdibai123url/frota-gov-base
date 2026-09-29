/**
 * Bloco 6.1 — Matriz de módulos por órgão.
 *
 * Cada módulo corresponde a uma tela (rota) do Dibai Fleet. A ausência de linha em
 * `organization_modules` significa "usar o padrão do módulo": habilitado, exceto
 * os módulos listados em DEFAULT_DISABLED, que nascem desabilitados para órgãos novos.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/frotagov";

export type ModuleDef = {
  /** Chave persistida em organization_modules.module_key (igual ao caminho da rota, sem a barra). */
  key: string;
  label: string;
  group: string;
  /** Rotas cobertas por este módulo. */
  routes: string[];
  /** Módulo estrutural: não pode ser desabilitado. */
  essential?: boolean;
};

const m = (
  key: string,
  label: string,
  group: string,
  extra: string[] = [],
  essential = false,
): ModuleDef => ({
  key,
  label,
  group,
  routes: [`/${key}`, ...extra],
  ...(essential ? { essential: true } : {}),
});

export const MODULES: ModuleDef[] = [
  m("painel", "Dashboard", "Dashboard", [], true),
  m("veiculos", "Veículos", "Frota", ["/veiculo/"]),
  m("equipamentos", "Máquinas e equipamentos", "Frota"),
  m("motorista", "Área do motorista", "Frota"),
  m("escala", "Escala de motoristas", "Frota"),
  m("minha-escala", "Minha escala", "Frota"),
  m("utilizacao", "Utilização e reservas", "Frota"),
  m("disponibilidade", "Disponibilidade da Frota", "Frota"),
  m("diarias", "Diárias", "Frota"),
  m("multas", "Multas e infrações", "Frota"),
  m("sinistros", "Acidentes e sinistros", "Frota"),
  m("seguros", "Seguros", "Frota"),
  m("obrigacoes", "Obrigações legais", "Frota"),
  m("patrimonio", "Movimentação patrimonial", "Frota"),
  m("historico-veiculo", "Histórico do veículo", "Frota"),
  m("autorizacoes", "Autorizações de abastecimento", "Abastecimento"),
  m("abastecimentos", "Abastecimentos", "Abastecimento"),
  m("combustiveis", "Combustíveis", "Abastecimento"),
  m("cotas-servidor", "Cotas de servidor", "Abastecimento"),
  m("fornecedores", "Fornecedores / Postos", "Abastecimento"),
  m("manutencoes", "Manutenções", "Manutenção"),
  m("planos-manutencao", "Planos preventivos", "Manutenção"),
  m("limpeza", "Limpeza da frota", "Manutenção"),
  m("garantias", "Garantias", "Manutenção"),
  m("pesquisa-precos", "Pesquisa de preços", "Manutenção"),
  m("regras-manutencao", "Regras de manutenção", "Manutenção"),
  m("pneus", "Controle de pneus", "Manutenção"),
  m("rede-credenciada", "Oficinas e prestadores do órgão", "Prestadores e compras"),
  m("mapa-rede", "Mapa dos prestadores do órgão", "Prestadores e compras"),
  m("cotacoes", "Cotações", "Prestadores e compras", ["/cotacao/"]),
  m("ordens-servico", "Ordens de Serviço", "Prestadores e compras", ["/ordem-servico/"]),
  m("contratos", "Contratos", "Contratos e Orçamento"),
  m("rastreamento", "Rastreamento", "Frota"),
  m("faturamento", "Faturamento", "Contratos e Orçamento"),
  m("gestao-contrato", "Gestão do contrato (IMR)", "Contratos e Orçamento"),
  m("empenhos", "Empenhos", "Contratos e Orçamento"),
  m("cotas", "Cotas e saldos", "Contratos e Orçamento"),
  m("centros-custo", "Centros de Custo", "Contratos e Orçamento"),
  m("orgao", "Dados do Órgão", "Cadastros", [], true),
  m("unidades", "Secretarias / Unidades", "Cadastros", [], true),
  m("condutores", "Condutores / Motoristas", "Cadastros"),
  m("funcionarios", "Funcionários", "Cadastros"),
  m("entidades-externas", "Pessoas e Empresas Externas", "Cadastros"),
  m("usuarios", "Usuários e Permissões", "Cadastros", [], true),
  m("perfis-acesso", "Perfis de acesso", "Cadastros", [], true),
  m("migracao", "Migração de dados", "Cadastros"),
  m("exportacao", "Exportar dados", "Cadastros"),
  m("inteligencia", "Inteligência da frota", "Relatórios e análises"),
  m("relatorios", "Relatórios avançados", "Relatórios e análises"),
  m("avisos", "Avisos de vencimento", "Relatórios e análises"),
  m("prestacao-contas", "Prestação de contas", "Relatórios e análises"),
  m("sustentabilidade", "Sustentabilidade da frota", "Relatórios e análises"),
  m("transparencia", "Portal da Transparência", "Integrações e dados abertos"),
  m("integracoes", "Central de Integrações", "Integrações e dados abertos"),
  m("chaves-api", "Chaves de API", "Integrações e dados abertos"),
  m("alertas", "Alertas e inconsistências", "Alertas"),
];

/** Módulos que nascem DESABILITADOS: o Super Admin ativa por órgão quando o órgão precisar. */
export const DEFAULT_DISABLED = [
  "equipamentos",
  "regras-manutencao",
  "faturamento",
  "gestao-contrato",
  "rastreamento",
  "integracoes",
  "chaves-api",
];

export const MODULE_GROUPS = Array.from(new Set(MODULES.map((x) => x.group)));

/**
 * Funções dentro das abas. O Super Admin pode desligar uma função sem desligar a aba inteira.
 * Ficam guardadas em organization_modules com a chave `fn:<função>`; sem linha, a função está ligada.
 */
export type FeatureDef = { key: string; module: string; label: string; hint: string };

export const FEATURES: FeatureDef[] = [
  {
    key: "condutores.afastamento",
    module: "condutores",
    label: "Afastamentos (férias, licença, INSS, atestado)",
    hint: "Botão Afastamento e filtro “Afastados agora”",
  },
  {
    key: "escala.imprimir",
    module: "escala",
    label: "Imprimir a escala",
    hint: "Botão de impressão da escala em A4",
  },
  {
    key: "relatorios.exportar",
    module: "relatorios",
    label: "Exportar relatórios (CSV, Excel, XML e PDF)",
    hint: "Desligado, o relatório só pode ser visto na tela",
  },
  {
    key: "veiculos.cadastro",
    module: "veiculos",
    label: "Cadastrar e editar veículos",
    hint: "Desligado, a tela fica somente para consulta",
  },
];

export const featureModuleKey = (key: string) => `fn:${key}`;

/** Pacotes prontos: o Super Admin escolhe o que o órgão contratou com um clique. */
export const MODULE_PRESETS: {
  id: string;
  label: string;
  description: string;
  groups: string[];
}[] = [
  {
    id: "gestao-frota",
    label: "Somente gestão de frota",
    description:
      "Veículos, condutores, escala, utilização e relatórios. Desliga abastecimento, manutenção, prestadores, contratos e orçamento.",
    groups: ["Dashboard", "Frota", "Cadastros", "Relatórios e análises", "Alertas"],
  },
  {
    id: "frota-abast",
    label: "Frota + abastecimento",
    description: "Gestão de frota mais autorizações e controle de abastecimento.",
    groups: [
      "Dashboard",
      "Frota",
      "Abastecimento",
      "Cadastros",
      "Relatórios e análises",
      "Alertas",
    ],
  },
  {
    id: "frota-abast-manut",
    label: "Frota + abastecimento + manutenção",
    description: "Sem prestadores, contratos e orçamento.",
    groups: [
      "Dashboard",
      "Frota",
      "Abastecimento",
      "Manutenção",
      "Cadastros",
      "Relatórios e análises",
      "Alertas",
    ],
  },
  {
    id: "completo",
    label: "Sistema completo",
    description: "Todas as abas (as que nascem desligadas continuam desligadas).",
    groups: MODULES.map((x) => x.group),
  },
];

export function moduleDefault(key: string) {
  return !DEFAULT_DISABLED.includes(key);
}

export function moduleForPath(pathname: string): ModuleDef | null {
  let best: ModuleDef | null = null;
  for (const mod of MODULES) {
    for (const r of mod.routes) {
      if (
        pathname === r ||
        pathname.startsWith(`${r}/`) ||
        (r.endsWith("/") && pathname.startsWith(r))
      ) {
        if (!best || r.length > Math.max(...best.routes.map((x) => x.length))) best = mod;
      }
    }
  }
  return best;
}

export type ModuleRow = {
  id: string;
  organization_id: string;
  module_key: string;
  enabled: boolean;
  updated_at: string;
};

/** Configuração do órgão em contexto (ou de um órgão específico, para o Super Admin). */
export function useOrganizationModules(organizationId?: string | null) {
  return useQuery({
    queryKey: ["organization-modules", organizationId ?? "atual"],
    staleTime: 1000 * 60,
    queryFn: async () => {
      let q = supabase
        .from("organization_modules")
        .select("id, organization_id, module_key, enabled, updated_at");
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ModuleRow[];
    },
  });
}

export function buildModuleMap(rows: ModuleRow[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const mod of MODULES) map[mod.key] = moduleDefault(mod.key);
  for (const r of rows) map[r.module_key] = r.enabled;
  for (const mod of MODULES) if (mod.essential) map[mod.key] = true;
  return map;
}

/** Escolhas de acesso por perfil feitas pelo administrador do órgão. */
export function useAccessOverrides() {
  return useQuery({
    queryKey: ["org-role-access"],
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_role_access")
        .select("module_key, role, allowed");
      if (error) throw error;
      const out: Record<string, Record<string, boolean>> = {};
      for (const r of data ?? []) (out[r.module_key] ??= {})[r.role] = r.allowed;
      return out as Record<string, Partial<Record<import("@/lib/frotagov").AppRole, boolean>>>;
    },
  });
}

/** Escolhas de acesso feitas pelo gestor especificamente para o usuário logado. */
export function useMyModuleAccess() {
  return useQuery({
    queryKey: ["my-module-access"],
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return {} as Record<string, boolean>;
      const { data, error } = await supabase
        .from("user_module_access")
        .select("module_key, allowed")
        .eq("user_id", auth.user.id);
      // sem a tabela (ambiente ainda não atualizado) vale o padrão do perfil
      if (error) return {} as Record<string, boolean>;
      const out: Record<string, boolean> = {};
      for (const r of data ?? []) out[r.module_key] = r.allowed;
      return out;
    },
  });
}

/** Diz se uma função de aba está ligada (sem configuração, está ligada). */
export function featureOn(map: Record<string, boolean>, key: string) {
  return map[featureModuleKey(key)] !== false;
}

export function useFeature(key: string) {
  const { map } = useModuleMap();
  return featureOn(map, key);
}

/** Mapa de módulos habilitados para o órgão em contexto. */
export function useModuleMap() {
  const { data: rows = [], isLoading } = useOrganizationModules();
  return { map: buildModuleMap(rows), isLoading };
}
