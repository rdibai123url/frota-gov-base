/**
 * Matriz de acesso por perfil.
 *
 * Define quais perfis podem ABRIR cada tela. A regra vale no menu (a tela some) e ao digitar o
 * endereço direto. Quem grava dados continua limitado também pelo banco (segurança em camadas):
 * esconder a tela nunca substitui a regra do banco.
 *
 * Telas que não aparecem aqui ficam abertas a todos os perfis do órgão.
 */
import type { AppRole } from "@/lib/frotagov";

const ADMIN: AppRole[] = ["super_admin", "org_admin"];
const GESTAO: AppRole[] = ["super_admin", "org_admin", "fleet_manager"];
const GESTAO_E_FISCAL: AppRole[] = [...GESTAO, "auditor"];
const SEM_OPERADOR: AppRole[] = [
  "super_admin",
  "org_admin",
  "fleet_manager",
  "unit_manager",
  "auditor",
];

export const MODULE_ROLES: Record<string, AppRole[]> = {
  // implantação e integração: só administrador
  migracao: ADMIN,
  exportacao: [...ADMIN, "auditor"],
  integracoes: ADMIN,
  "chaves-api": ADMIN,
  backup: ADMIN,
  "perfis-acesso": ADMIN,
  "prestacao-contas": SEM_OPERADOR,
  // dinheiro e contratos: gestão e controle interno
  contratos: SEM_OPERADOR,
  empenhos: SEM_OPERADOR,
  cotas: SEM_OPERADOR,
  "centros-custo": SEM_OPERADOR,
  faturamento: GESTAO_E_FISCAL,
  "gestao-contrato": GESTAO_E_FISCAL,
  "regras-manutencao": GESTAO_E_FISCAL,
  "pesquisa-precos": SEM_OPERADOR,
  // pessoas
  funcionarios: SEM_OPERADOR,
  diarias: SEM_OPERADOR,
  // análises
  relatorios: SEM_OPERADOR,
  inteligencia: SEM_OPERADOR,
  sustentabilidade: SEM_OPERADOR,
};

/** Escolhas do administrador do órgão: módulo → perfil → liberado ou não. */
export type AccessOverrides = Record<string, Partial<Record<AppRole, boolean>>>;

/** Padrão do sistema para um perfil abrir a tela (módulo sem regra = liberado). */
export function defaultAllows(moduleKey: string, role: AppRole): boolean {
  const allowed = MODULE_ROLES[moduleKey];
  return !allowed || allowed.includes(role);
}

/**
 * O usuário pode abrir a tela deste módulo?
 * Ordem: escolha do gestor para o usuário > escolha do órgão para o perfil > padrão do sistema.
 * Com vários perfis, basta um deles permitir.
 */
export function roleCanOpen(
  moduleKey: string,
  roles: AppRole[],
  overrides: AccessOverrides = {},
  userOverrides: Record<string, boolean> = {},
): boolean {
  if (ALWAYS_OPEN.includes(moduleKey)) return true;
  // escolha do gestor para esta pessoa vale mais que qualquer regra de perfil
  const mine = userOverrides[moduleKey];
  if (mine !== undefined) return mine;
  if (roles.length === 0) return !MODULE_ROLES[moduleKey];
  return roles.some((r) => overrides[moduleKey]?.[r] ?? defaultAllows(moduleKey, r));
}

/** Telas que o administrador não pode fechar para si mesmo. */
export const ALWAYS_OPEN = ["painel", "perfis-acesso", "usuarios", "orgao"];
