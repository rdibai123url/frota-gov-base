/**
 * Textos do ícone "i" de cada indicador e gráfico do Dashboard.
 * Linguagem simples: o que é, como é calculado e o que fazer.
 */
export type DashHelp = { what: string; calc?: string; action?: string };

const h = (what: string, calc?: string, action?: string): DashHelp => ({
  what,
  ...(calc ? { calc } : {}),
  ...(action ? { action } : {}),
});

/** Explicação de cada tela (aba) do Dashboard. */
export const TAB_HELP: Record<string, string> = {
  geral:
    "Resumo do órgão: quantos veículos existem, quantos estão rodando ou parados e quanto a frota custa por mês. É a primeira tela para quem precisa de uma visão rápida.",
  abastecimento:
    "Acompanha o combustível: quanto foi abastecido e gasto, o preço do litro, os motoristas com habilitação a vencer e as autorizações de abastecimento. Os dados vêm dos abastecimentos registrados no sistema.",
  manutencao:
    "Mostra a saúde da frota: revisões atrasadas, veículos na oficina, cotações de serviço, ordens de serviço e limpeza. Serve para evitar veículo parado e gasto sem controle.",
  financeiro:
    "Mostra o dinheiro dos contratos: quanto já foi usado, quanto sobra, empenhos, cotas e contratos perto de vencer. Serve para não estourar o saldo nem deixar contrato vencer sem aviso.",
  administrativo:
    "Reúne o que é obrigação legal: multas, licenciamento, seguros, acidentes, movimentação de bens e diárias. Serve para o órgão não perder prazo nem pagar multa desnecessária.",
};

const G = "Os dados vêm dos cadastros do próprio órgão.";

export const DASH_HELP: Record<string, DashHelp> = {
  /* ------------------------------ Visão geral ------------------------------ */
  "Total de veículos": h(
    "Quantidade de veículos cadastrados no órgão, de qualquer situação.",
    "Conta todos os veículos da tela Veículos.",
    "Se o número parecer errado, confira o cadastro em Frota > Veículos.",
  ),
  "Veículos ativos": h(
    "Veículos que estão em uso normal e podem sair.",
    "Conta os veículos com situação “ativo”.",
    "Veículos parados, baixados ou em manutenção não entram aqui.",
  ),
  "Em manutenção": h(
    "Veículos que estão na oficina e não podem ser usados agora.",
    "Conta os veículos com situação “em manutenção”.",
    "Quando o serviço terminar, conclua a manutenção para o veículo voltar a ficar ativo.",
  ),
  "Secretarias / Unidades": h(
    "Quantidade de secretarias ou setores cadastrados.",
    "Conta as unidades da tela Secretarias / Unidades.",
    "Cadastre cada secretaria para separar os gastos e os veículos de cada uma.",
  ),
  Usuários: h(
    "Pessoas com acesso ao sistema neste órgão.",
    "Conta os usuários cadastrados.",
    "Dê acesso somente a quem precisa e retire quem saiu do órgão.",
  ),

  /* ------------------------------ Abastecimento ---------------------------- */
  "Abastecimentos no mês": h(
    "Quantas vezes veículos foram abastecidos neste mês.",
    "Conta os abastecimentos válidos com data no mês atual. Cancelados não entram.",
  ),
  "Quantidade abastecida": h(
    "Total de combustível abastecido neste mês.",
    "Soma a quantidade dos abastecimentos válidos do mês, só de itens que são combustível (litros).",
  ),
  "Valor gasto no mês": h(
    "Quanto o órgão gastou com abastecimento neste mês.",
    "Soma o valor total dos abastecimentos válidos do mês.",
    "Compare com o gráfico de custo por mês para ver se o gasto está subindo.",
  ),
  "Veículos abastecidos": h(
    "Quantos veículos diferentes foram abastecidos neste mês.",
    "Conta cada veículo uma única vez, mesmo que tenha abastecido várias vezes.",
  ),
  "Alertas em aberto": h(
    "Abastecimentos que o sistema achou estranhos e que ninguém analisou ainda.",
    "Conta os alertas de abastecimento com situação “aberto”, gerados pelas conferências automáticas do sistema.",
    "Abra os alertas, confira o abastecimento e registre a análise.",
  ),
  "Condutores ativos": h(
    "Motoristas autorizados a dirigir veículos do órgão.",
    "Conta os condutores marcados como ativos.",
  ),
  "CNHs vencidas": h(
    "Motoristas com a carteira de habilitação vencida.",
    "Conta os condutores ativos cuja validade da CNH já passou.",
    "Motorista com CNH vencida não deve dirigir. Peça a renovação e atualize o cadastro.",
  ),
  "CNHs a vencer (30 dias)": h(
    "Motoristas cuja carteira vence nos próximos 30 dias.",
    "Conta os condutores com validade da CNH entre hoje e 30 dias.",
    "Avise o motorista com antecedência para renovar.",
  ),
  "Autorizações abertas": h(
    "Autorizações de abastecimento emitidas que ainda têm saldo para usar.",
    "Conta as autorizações autorizadas, pendentes ou usadas em parte, com saldo maior que zero.",
    "Autorizações paradas há muito tempo devem ser conferidas ou canceladas.",
  ),
  "Autorizações utilizadas no mês": h(
    "Autorizações de abastecimento que foram usadas neste mês.",
    "Conta as autorizações usadas total ou parcialmente, atualizadas no mês atual.",
  ),

  /* -------------------------------- Manutenção ----------------------------- */
  "Preventivas vencidas": h(
    "Revisões que já deveriam ter sido feitas e não foram.",
    "Compara o quilômetro e a data de cada plano preventivo com o veículo. Passou do limite, conta como vencida.",
    "Agende a revisão o quanto antes; veículo sem revisão quebra mais e pode perder a garantia.",
  ),
  "Preventivas a vencer": h(
    "Revisões que estão chegando perto do prazo.",
    "Conta os planos preventivos que entraram na faixa de aviso (por quilômetro ou por data).",
    "Aproveite para agendar antes de vencer.",
  ),
  "Solicitações em aberto": h(
    "Pedidos de conserto que ainda não foram concluídos nem cancelados.",
    "Conta as solicitações de manutenção em andamento.",
    "Acompanhe as mais antigas para não deixar veículo parado sem necessidade.",
  ),
  "Veículos em oficina": h(
    "Solicitações cujo veículo já está sendo consertado.",
    "Conta as solicitações com situação “em manutenção”.",
  ),
  "Custo de manutenção no mês": h(
    "Quanto foi gasto com manutenções concluídas neste mês.",
    "Soma peças, mão de obra e outros valores das manutenções concluídas no mês atual.",
  ),
  "Pneus instalados / estoque": h(
    "Pneus que estão rodando nos veículos e pneus guardados no estoque.",
    "Mostra a quantidade instalada e a quantidade em estoque, separadas por barra.",
    "Mantenha o estoque mínimo para trocas urgentes.",
  ),
  "Limpezas no mês": h(
    "Lavagens e higienizações realizadas neste mês.",
    "Conta as limpezas com situação “realizada” e data no mês atual.",
  ),
  "Gasto com limpeza no mês": h(
    "Quanto foi pago por limpezas neste mês.",
    "Soma o valor das limpezas realizadas no mês atual.",
  ),
  "Limpezas agendadas": h(
    "Limpezas marcadas que ainda não aconteceram.",
    "Conta as limpezas com situação “agendada”.",
  ),
  "Cotações abertas": h(
    "Pedidos de preço enviados às oficinas e ainda sem decisão.",
    "Conta as cotações abertas ou em análise.",
    "Aprove a melhor proposta para liberar o serviço.",
  ),
  "Aguardando propostas": h(
    "Cotações abertas em que nenhuma oficina respondeu ainda.",
    "Conta as cotações abertas sem nenhuma proposta.",
    "Cobre as oficinas ou convide outras para responder.",
  ),
  "Processos com menos de 3 propostas": h(
    "Cotações que ainda não têm o mínimo de propostas exigido para a decisão ser segura.",
    "Conta as cotações abertas ou em análise com menos de 3 propostas válidas.",
    "Convide mais oficinas: o mínimo de propostas protege o órgão em auditorias.",
  ),
  "Oficinas credenciadas ativas": h(
    "Oficinas liberadas para prestar serviço ao órgão.",
    "Conta as oficinas cadastradas com situação “ativo”.",
  ),
  "OS em aberto": h(
    "Ordens de serviço emitidas que ainda não foram concluídas.",
    "Conta as ordens de serviço que não estão concluídas nem canceladas.",
  ),
  "OS em execução": h(
    "Ordens de serviço em que a oficina já está trabalhando.",
    "Conta as ordens com veículo recebido, em execução ou aguardando peça.",
  ),
  "OS atrasadas": h(
    "Ordens de serviço que passaram do prazo combinado com a oficina.",
    "Conta as ordens abertas cujo prazo já passou.",
    "Cobre a oficina e registre a ocorrência; atraso repetido pode gerar advertência.",
  ),
  "Valor em manutenção no mês": h(
    "Valor das ordens de serviço concluídas neste mês.",
    "Soma o valor executado das ordens concluídas no mês atual.",
  ),

  /* -------------------------------- Financeiro ----------------------------- */
  "Contratos vigentes": h(
    "Contratos que estão valendo hoje.",
    "Conta os contratos com situação “vigente”.",
  ),
  "Saldo contratual": h(
    "Dinheiro que ainda pode ser usado nos contratos vigentes.",
    "Para cada contrato: valor dos itens menos o que já foi consumido e o que está reservado. Depois soma todos.",
    "Saldo baixo pede aditivo ou nova licitação; não deixe acabar no meio do ano.",
  ),
  "Empenhos ativos": h(
    "Empenhos (reservas de orçamento) que ainda estão valendo.",
    "Conta os empenhos com situação “ativo”.",
  ),
  "Saldo de empenhos": h(
    "Quanto ainda dá para gastar dentro dos empenhos ativos.",
    "Soma o valor disponível de cada empenho ativo.",
    "Sem saldo de empenho não se pode pagar; peça reforço à área de orçamento.",
  ),
  "Cotas com saldo crítico": h(
    "Cotas de combustível ou de gasto que estão quase no fim.",
    "Conta as cotas ativas em que já foi usado 80% ou mais do que foi concedido.",
    "Reforce a cota ou avise a secretaria antes de acabar.",
  ),
  "Contratos a vencer (60 dias)": h(
    "Contratos que terminam nos próximos 60 dias.",
    "Conta os contratos vigentes com data final entre hoje e 60 dias.",
    "Comece já a prorrogação ou a nova licitação para não ficar sem contrato.",
  ),

  /* ----------------------------- Administrativo ---------------------------- */
  "Multas em aberto": h(
    "Multas de trânsito que ainda não foram resolvidas.",
    "Conta as multas recebidas, em análise, com defesa apresentada ou indeferidas.",
    "Identifique o condutor e faça a defesa dentro do prazo.",
  ),
  "Valor de multas em aberto": h(
    "Quanto as multas em aberto somam.",
    "Soma o valor de todas as multas em aberto.",
  ),
  "Obrigações legais vencidas": h(
    "Documentos e taxas do veículo com prazo vencido, como licenciamento e IPVA.",
    "Conta as obrigações cadastradas com situação “vencida”.",
    "Regularize logo: veículo sem licenciamento pode ser apreendido.",
  ),
  "Seguros a vencer (60 dias)": h(
    "Apólices de seguro que terminam nos próximos 60 dias.",
    "Conta as apólices não canceladas com fim de vigência entre hoje e 60 dias.",
    "Renove antes do fim para o veículo não ficar sem cobertura.",
  ),
  "Sinistros em aberto": h(
    "Acidentes e ocorrências que ainda não foram encerrados.",
    "Conta os sinistros que não estão encerrados.",
    "Acompanhe seguradora, conserto e documentos até encerrar.",
  ),
  "Veículos indisponíveis por sinistro": h(
    "Veículos que estão bloqueados para uso por causa de um acidente em aberto.",
    "Conta os veículos de sinistros abertos marcados como “bloqueia o uso”.",
  ),
  "Movimentações patrimoniais no mês": h(
    "Mudanças de bens (cessão, transferência, baixa) feitas neste mês.",
    "Conta as movimentações com data no mês atual.",
  ),
  "Baixas e alienações acumuladas": h(
    "Bens que já saíram do patrimônio por baixa, venda ou leilão.",
    "Conta todas as movimentações de saída definitiva já registradas.",
  ),
  "Solicitadas no mês": h(
    "Pedidos de diária feitos neste mês.",
    "Conta as diárias pedidas neste mês, sem contar canceladas e rejeitadas.",
  ),
  Autorizadas: h(
    "Diárias que já foram autorizadas.",
    "Conta as diárias autorizadas e as já pagas, sem contar as canceladas e rejeitadas.",
  ),
  "Aguardando comprovação": h(
    "Diárias pagas cuja viagem ainda não foi comprovada.",
    "Conta as diárias em que falta a prestação de contas.",
    "Cobre o servidor: sem comprovação o valor pode precisar ser devolvido.",
  ),
  "Comprovações vencidas": h(
    "Diárias cujo prazo para comprovar já passou.",
    "Conta as diárias em que passaram 30 dias do retorno e não há prestação de contas aprovada.",
    "Notifique o servidor imediatamente.",
  ),
  "Valor de diárias no mês": h(
    "Quanto foi gasto com diárias neste mês.",
    "Soma o valor das diárias com saída neste mês, sem contar canceladas e rejeitadas.",
  ),
};

/** Ajuda dos gráficos (BI) de cada aba. */
export const CHART_HELP: Record<string, DashHelp> = {
  custoMes: h(
    "Quanto a frota custou em cada mês, separado em combustível, manutenção e limpeza.",
    `Soma os valores registrados em cada mês. ${G}`,
    "Se uma barra sobe de repente, veja qual parte cresceu e investigue.",
  ),
  composicao: h(
    "Divisão do custo total entre combustível, manutenção e limpeza.",
    "Cada fatia é a soma daquele tipo de gasto dividida pelo total do período.",
  ),
  porUnidade: h(
    "Quais secretarias mais gastam com a frota.",
    "Soma os gastos de cada secretaria no período e mostra as 8 maiores.",
    "Use para conversar com as secretarias que gastam muito acima das demais.",
  ),
  topVeiculos: h(
    "Os 10 veículos que mais custaram no período.",
    "Soma combustível, manutenção e limpeza de cada veículo.",
    "Veículo muito caro pode estar velho demais: avalie trocar ou vender.",
  ),
  situacaoFrota: h(
    "Quantos veículos estão em cada situação: ativo, em manutenção, parado etc.",
    "Conta os veículos por situação cadastrada.",
  ),
  precoLitro: h(
    "Preço médio pago por litro em cada mês.",
    "Divide o valor total pelos litros abastecidos no mês.",
    "Se subir muito, compare com o preço de mercado e com o contrato.",
  ),
  litrosMes: h(
    "Litros de combustível abastecidos em cada mês.",
    "Soma os litros dos abastecimentos válidos.",
  ),
  porCombustivel: h(
    "Quanto foi gasto com cada tipo de combustível (gasolina, diesel etc.).",
    "Soma o valor dos abastecimentos por tipo de combustível no período.",
  ),
  topAbastecimento: h(
    "Os 10 veículos que mais gastaram com combustível.",
    "Soma o valor dos abastecimentos de cada veículo no período.",
    "Compare com o consumo e os alertas para achar abastecimento estranho.",
  ),
  cnhSituacao: h(
    "Situação da habilitação dos motoristas ativos: em dia, a vencer, vencida ou sem registro.",
    "Compara a validade da CNH de cada condutor com a data de hoje.",
    "Cadastre a validade dos que estão “sem registro”.",
  ),
  manutMes: h(
    "Quanto foi gasto com manutenção em cada mês.",
    "Soma o valor das manutenções que não foram canceladas, pela data de entrada.",
  ),
  manutTipo: h(
    "Quanto se gastou em cada tipo de manutenção (preventiva, corretiva etc.).",
    "Soma o valor das manutenções por tipo.",
    "Corretiva muito maior que preventiva indica falta de revisão em dia.",
  ),
  tempoReparo: h(
    "Quantos dias, em média, os veículos ficam na oficina em cada mês.",
    "Diferença entre a entrada e a saída da oficina nas manutenções concluídas.",
    "Tempo alto significa veículo parado; cobre prazos das oficinas.",
  ),
  osStatus: h(
    "Ordens de serviço por situação: emitida, em execução, concluída etc.",
    "Conta as ordens de serviço por situação.",
  ),
  topManutencao: h(
    "Os 10 veículos que mais gastaram com manutenção.",
    "Soma o valor das manutenções de cada veículo no período.",
    "Veículos que aparecem sempre aqui são candidatos à substituição.",
  ),
  contratosUso: h(
    "Para cada contrato vigente: quanto já foi usado, quanto está reservado e quanto sobra.",
    "Usa o valor dos itens do contrato, o consumido e o reservado.",
    "Barras quase cheias pedem atenção: o contrato está acabando.",
  ),
  contratosPrazo: h(
    "Contratos vigentes agrupados pelo tempo que falta para acabar.",
    "Conta os contratos pela data final: até 30 dias, 31 a 60, 61 a 90 e mais de 90.",
    "Contratos nas faixas curtas precisam de prorrogação ou nova licitação.",
  ),
  empenhosSaldo: h(
    "Valor dos empenhos ativos e quanto ainda pode ser usado.",
    "Compara o valor empenhado com o disponível em cada empenho ativo (os 8 maiores).",
  ),
  cotasUso: h(
    "Quanto de cada cota já foi usado, em porcentagem.",
    "Soma o consumido e o reservado e divide pelo concedido, para as 8 cotas mais usadas.",
    "Acima de 80% é hora de reforçar a cota.",
  ),
  multasStatus: h(
    "Multas por situação: recebida, em defesa, paga etc.",
    "Conta as multas por situação.",
  ),
  multasMes: h(
    "Valor das multas recebidas em cada mês.",
    "Soma o valor das multas pela data em que a infração aconteceu.",
    "Se sobe, reforce a orientação aos motoristas.",
  ),
  obrigacoesStatus: h(
    "Obrigações legais dos veículos (licenciamento, IPVA etc.) por situação.",
    "Conta as obrigações por situação: pendente, quitada, vencida, não se aplica ou cancelada.",
    "Atenda primeiro as vencidas.",
  ),
  sinistrosMes: h(
    "Quantidade de acidentes e ocorrências por mês.",
    "Conta os sinistros pela data em que aconteceram.",
    "Meses com muitos casos pedem revisão de treinamento e de rotas.",
  ),
  diariasMes: h(
    "Valor das diárias pagas em cada mês.",
    "Soma o valor das diárias pela data de saída, sem contar canceladas e rejeitadas.",
  ),
};
