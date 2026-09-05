/**
 * Bloco 6.1 — Matriz de módulos por órgão.
 *
 * Cada módulo corresponde a uma tela (rota) do FrotaGov. A ausência de linha em
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

const m = (key: string, label: string, group: string, extra: string[] = [], essential = false): ModuleDef => ({
  key,
  label,
  group,
  routes: [`/${key}`, ...extra],
  ...(essential ? { essential: true } : {}),
});

export const MODULES: ModuleDef[] = [
  m("painel", "Painel", "Painel", [], true),
  m("veiculos", "Veículos", "Frota", ["/veiculo/"]),
  m("equipamentos", "Máquinas e equipamentos", "Frota"),
  m("utilizacao", "Utilização e reservas", "Frota"),
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
  m("pecas", "Peças e acessórios", "Manutenção"),
  m("almoxarifado", "Almoxarifado", "Manutenção"),
  m("rede-credenciada", "Oficinas e prestadores do órgão", "Prestadores e compras"),
  m("credenciados", "Credenciados do órgão e cartão virtual", "Prestadores e compras"),
  m("portal-credenciado", "Portal do credenciado", "Prestadores e compras"),
  m("mapa-rede", "Mapa dos prestadores do órgão", "Prestadores e compras"),
  m("cotacoes", "Cotações", "Prestadores e compras", ["/cotacao/"]),
  m("ordens-servico", "Ordens de Serviço", "Prestadores e compras", ["/ordem-servico/"]),
  m("ofp", "Ordens de fornecimento (OFP)", "Prestadores e compras"),
  m("contratos", "Contratos", "Contratos e Orçamento"),
  m("empenhos", "Empenhos", "Contratos e Orçamento"),
  m("cotas", "Cotas e saldos", "Contratos e Orçamento"),
  m("centros-custo", "Centros de Custo", "Contratos e Orçamento"),
  m("orgao", "Dados do Órgão", "Cadastros", [], true),
  m("unidades", "Secretarias / Unidades", "Cadastros", [], true),
  m("condutores", "Condutores / Motoristas", "Cadastros"),
  m("funcionarios", "Funcionários", "Cadastros"),
  m("entidades-externas", "Pessoas e Empresas Externas", "Cadastros"),
  m("usuarios", "Usuários e Permissões", "Cadastros", [], true),
  m("migracao", "Migração de dados", "Cadastros"),
  m("exportacao", "Exportar dados", "Cadastros"),
  m("inteligencia", "Inteligência da frota", "Relatórios e análises"),
  m("relatorios", "Relatórios avançados", "Relatórios e análises"),
  m("sustentabilidade", "Sustentabilidade da frota", "Relatórios e análises"),
  m("transparencia", "Portal da Transparência", "Integrações e dados abertos"),
  m("integracoes", "Central de Integrações", "Integrações e dados abertos"),
  m("chaves-api", "Chaves de API", "Integrações e dados abertos"),
  m("alertas", "Alertas e inconsistências", "Alertas"),
];

/** Módulos que nascem DESABILITADOS para órgãos novos (Bloco 6.1). */
export const DEFAULT_DISABLED = ["credenciados", "portal-credenciado"];

export const MODULE_GROUPS = Array.from(new Set(MODULES.map((x) => x.group)));

export function moduleDefault(key: string) {
  return !DEFAULT_DISABLED.includes(key);
}

export function moduleForPath(pathname: string): ModuleDef | null {
  let best: ModuleDef | null = null;
  for (const mod of MODULES) {
    for (const r of mod.routes) {
      if (pathname === r || pathname.startsWith(`${r}/`) || (r.endsWith("/") && pathname.startsWith(r))) {
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
      let q = supabase.from("organization_modules").select("id, organization_id, module_key, enabled, updated_at");
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

/** Mapa de módulos habilitados para o órgão em contexto. */
export function useModuleMap() {
  const { data: rows = [], isLoading } = useOrganizationModules();
  return { map: buildModuleMap(rows), isLoading };
}
