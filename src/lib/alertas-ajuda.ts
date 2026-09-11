/**
 * FrotaGov — orientação dos alertas e inconsistências.
 *
 * Dois comportamentos:
 * - ORIENTATIVO: aviso que não depende de corrigir um dado para o sistema
 *   funcionar. Pode ser encerrado por decisão do usuário, com justificativa
 *   e auditoria (RPC `dismiss_alert`).
 * - CORRETIVO: depende de um dado real. Não pode ser ignorado; some sozinho
 *   quando a condição de origem deixa de existir (RPC `resolve_stale_alerts`).
 */
export type AlertKind = "orientativo" | "corretivo";

export type AlertGuidance = {
  kind: AlertKind;
  /** O que significa e por que foi gerado. */
  meaning: string;
  /** Impacto prático se nada for feito. */
  impact: string;
  /** Onde revisar e o que fazer, passo a passo. */
  steps: string[];
};

const G = (
  kind: AlertKind,
  meaning: string,
  impact: string,
  steps: string[],
): AlertGuidance => ({ kind, meaning, impact, steps });

const GUIDANCE: Record<string, AlertGuidance> = {
  /* -------- contratos -------- */
  contrato_80: G(
    "orientativo",
    "O contrato já executou 80% do valor contratado.",
    "Sem novo saldo, os empenhos e as ordens deste contrato podem ser bloqueados antes do fim da vigência.",
    ["Abra Contratos e confira o consumo por item.", "Avalie aditivo de valor ou novo processo.", "Se a execução está dentro do planejado, encerre o alerta com justificativa."],
  ),
  contrato_90: G(
    "orientativo",
    "O contrato já executou 90% do valor contratado.",
    "O saldo remanescente tende a acabar no curto prazo.",
    ["Confira o saldo por item em Contratos.", "Providencie aditivo ou nova contratação.", "Encerre o alerta com justificativa se a decisão já foi tomada."],
  ),
  contrato_esgotado: G(
    "corretivo",
    "O contrato não tem mais saldo de valor.",
    "Novos abastecimentos, peças ou serviços nesse contrato serão recusados.",
    ["Registre aditivo de acréscimo, ou", "Encerre o contrato e vincule as operações a outro contrato vigente."],
  ),
  contrato_vencido: G(
    "corretivo",
    "A vigência do contrato terminou.",
    "Não é possível executar despesa em contrato fora da vigência.",
    ["Registre o aditivo de prorrogação com a nova data, ou", "Altere a situação do contrato para encerrado."],
  ),
  cotacao_insuficiente: G(
    "orientativo",
    "O processo tem menos de 3 propostas válidas.",
    "A instrução do processo pode ser questionada se a ausência de propostas não estiver formalizada.",
    ["Convide novas empresas cadastradas pelo órgão e aguarde proposta, ou", "Registre no processo a justificativa prevista para menos de 3 propostas.", "Com a justificativa registrada, encerre o alerta informando-a."],
  ),
  os_atrasada: G(
    "corretivo",
    "A ordem de serviço passou do prazo previsto e continua em aberto.",
    "O bem segue indisponível e o custo não é apropriado no período correto.",
    ["Abra a ordem de serviço e atualize a execução.", "Conclua ou cancele a ordem quando o serviço terminar."],
  ),
  saldo_insuficiente: G(
    "orientativo",
    "Uma operação foi bloqueada por falta de saldo em contrato, empenho ou cota.",
    "O registro do bloqueio serve de histórico; a operação não foi gravada.",
    ["Verifique qual saldo faltou na mensagem do alerta.", "Reforce empenho, cota ou contrato.", "Encerre o alerta após tratar o caso."],
  ),
};

const CORRECTIVE_PREFIX = [
  "empenho_",
  "cota_",
  "manutencao_",
  "obrigacao_",
  "seguro_",
  "multa_",
  "sinistro_",
  "credenciamento_",
  "combustivel_",
  "tanque_",
  "duplic",
  "cnh_",
];

const DEFAULT_CORRECTIVE = (type: string): AlertGuidance =>
  G(
    "corretivo",
    "Há um dado pendente ou vencido no cadastro de origem desta ocorrência.",
    "Enquanto o dado não for corrigido, o fluxo que depende dele pode ser recusado.",
    [
      "Abra o registro citado na mensagem do alerta.",
      "Atualize o dado pendente (documento, saldo, data ou informação obrigatória).",
      "O alerta sai da lista de abertos sozinho quando a pendência deixa de existir.",
    ],
  ) && {
    kind: "corretivo" as const,
    meaning: "Há um dado pendente ou vencido no cadastro de origem desta ocorrência.",
    impact: "Enquanto o dado não for corrigido, o fluxo que depende dele pode ser recusado.",
    steps: [
      "Abra o registro citado na mensagem do alerta.",
      "Atualize o dado pendente (documento, saldo, data ou informação obrigatória).",
      "O alerta sai da lista de abertos sozinho quando a pendência deixa de existir.",
    ],
    type,
  };

const DEFAULT_ADVISORY: AlertGuidance = G(
  "orientativo",
  "Aviso gerado pelas regras de acompanhamento do órgão.",
  "Não impede nenhuma operação; serve para revisão do gestor.",
  [
    "Revise o registro citado na mensagem.",
    "Se nada precisa ser alterado, encerre o alerta informando a justificativa.",
  ],
);

export function alertGuidance(type: string): AlertGuidance {
  const found = GUIDANCE[type];
  if (found) return found;
  if (CORRECTIVE_PREFIX.some((p) => type.startsWith(p))) {
    const d = DEFAULT_CORRECTIVE(type);
    return { kind: d.kind, meaning: d.meaning, impact: d.impact, steps: d.steps };
  }
  return DEFAULT_ADVISORY;
}

export const RESOLUTION_LABEL: Record<string, string> = {
  auto: "Resolvido automaticamente",
  correcao: "Resolvido por correção do dado",
  usuario: "Resolvido por decisão do usuário",
};
