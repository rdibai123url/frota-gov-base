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
  exportacao: ADMIN,
  integracoes: ADMIN,
  "chaves-api": ADMIN,
  backup: ADMIN,
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

/** O perfil pode abrir a tela deste módulo? (módulo sem regra = liberado). */
export function roleCanOpen(moduleKey: string, roles: AppRole[]): boolean {
  const allowed = MODULE_ROLES[moduleKey];
  if (!allowed) return true;
  return roles.some((r) => allowed.includes(r));
}
