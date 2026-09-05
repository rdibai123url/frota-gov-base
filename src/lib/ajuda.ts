/**
 * Ajuda contextual do FrotaGov.
 *
 * Estrutura única e centralizada com o conteúdo do botão "i" exibido ao lado do
 * título de cada página. Nenhum texto de ajuda deve ser duplicado nas telas:
 * para manter ou corrigir a orientação de uma página, edite apenas este arquivo.
 *
 * Regra editorial: linguagem administrativa simples, sem detalhes técnicos
 * internos, sem nomes de tabelas, sem segredos, credenciais ou consultas.
 */

export type FieldTag =
  | "Obrigatório"
  | "Automático"
  | "Calculado"
  | "Condicional"
  | "Depende de integração";

export type HelpField = {
  label: string;
  description: string;
  tags?: FieldTag[];
};

export type HelpTopic = {
  /** Nome da função/módulo. */
  title: string;
  /** Para que serve. */
  purpose: string;
  /** Como usar, em passos curtos. */
  steps: string[];
  /** Campos relevantes do formulário (ou filtros/indicadores, quando não há formulário). */
  fields?: HelpField[] | undefined;
  /** Regras e bloqueios importantes da tela. */
  rules?: string[] | undefined;
  /** Exemplos curtos. */
  examples?: string[] | undefined;
};

const t = (
  title: string,
  purpose: string,
  steps: string[],
  fields?: HelpField[],
  rules?: string[],
  examples?: string[],
): HelpTopic => ({ title, purpose, steps, fields, rules, examples });


const REQ: FieldTag[] = ["Obrigatório"];
const AUTO: FieldTag[] = ["Automático"];
const CALC: FieldTag[] = ["Calculado"];
const COND: FieldTag[] = ["Condicional"];
const EXT: FieldTag[] = ["Depende de integração"];

export const HELP_TOPICS: Record<string, HelpTopic> = {
  "/painel": t(
    "Painel executivo",
    "Reúne os números do momento da frota: quantidade de bens, gastos, consumo, pendências e alertas, para acompanhamento rápido pela gestão.",
    [
      "Confira os cartões de indicadores no topo.",
      "Use os filtros de período para comparar meses.",
      "Clique em um indicador ou alerta para abrir a tela detalhada correspondente.",
    ],
    [
      { label: "Período", description: "Define o intervalo usado por todos os indicadores da tela." },
      { label: "Indicadores de custo", description: "Somam despesas lançadas no período (abastecimento, manutenção e demais custos).", tags: CALC },
      { label: "Pendências e alertas", description: "Contagem de itens que exigem ação, como documentos vencidos e inconsistências.", tags: AUTO },
    ],
    ["Os valores refletem apenas lançamentos do órgão em que você está conectado."],
  ),

  "/veiculos": t(
    "Veículos",
    "Cadastro central da frota: identificação, situação, lotação, propriedade e dados técnicos de cada veículo.",
    [
      "Use a busca e os filtros para localizar o veículo.",
      "Clique em Novo veículo para cadastrar.",
      "Abra a ficha do veículo para ver histórico, custos e documentos.",
    ],
    [
      { label: "Placa", description: "Identificação principal do veículo.", tags: REQ },
      { label: "Renavam / Chassi", description: "Identificadores oficiais; usados na consulta de dados oficiais.", tags: ["Depende de integração"] },
      { label: "Marca, modelo e ano", description: "Podem ser preenchidos automaticamente pela consulta de dados oficiais ou pela tabela de referência de preços.", tags: EXT },
      { label: "Tipo de medidor", description: "Define se o veículo é controlado por hodômetro (km), horímetro (horas), ambos ou nenhum.", tags: REQ },
      { label: "Unidade / Secretaria", description: "Lotação responsável pelo bem; determina rateio e relatórios por unidade.", tags: REQ },
      { label: "Propriedade", description: "Indica se o bem é próprio, locado, cedido ou de terceiro; campos adicionais aparecem conforme a escolha.", tags: COND },
      { label: "Situação", description: "Ativo, em manutenção, baixado ou indisponível; a situação bloqueia certas operações.", tags: REQ },
    ],
    [
      "Após haver movimentação registrada, os campos de identificação ficam protegidos contra alteração.",
      "Veículos baixados ou indisponíveis não podem receber novas autorizações de abastecimento.",
      "A unidade informada define quais veículos aparecem nos filtros dependentes dos relatórios.",
      "Planos de manutenção preventiva ficam vinculados ao bem: na manutenção só aparecem os planos daquele veículo ou equipamento.",
    ],
    ["Uma retroescavadeira deve ser cadastrada em Máquinas e equipamentos, não aqui."],
  ),

  "/equipamentos": t(
    "Máquinas e equipamentos",
    "Cadastro de bens que não circulam com placa: máquinas, implementos, geradores e equipamentos controlados por horímetro ou patrimônio.",
    [
      "Clique em Novo para cadastrar o bem.",
      "Informe o número de patrimônio e o tipo de equipamento.",
      "Defina o medidor (normalmente horímetro) para controle de consumo e manutenção.",
    ],
    [
      { label: "Número de patrimônio", description: "Identificação principal quando não existe placa.", tags: REQ },
      { label: "Tipo de equipamento", description: "Classificação usada em relatórios, cotações e planos de manutenção.", tags: REQ },
      { label: "Unidade de lotação", description: "Selecionada em Secretarias/Unidades; define responsabilidade e rateio de custo.", tags: REQ },
      { label: "Tipo de medidor", description: "Normalmente horímetro; define se o consumo é apurado por hora trabalhada.", tags: REQ },
      { label: "Horímetro atual", description: "Atualizado automaticamente pelos abastecimentos e utilizações lançados.", tags: AUTO },
    ],
    ["Bens sem placa exigem patrimônio; bens com placa devem ser cadastrados em Veículos."],
  ),

  "/utilizacao": t(
    "Utilização e reservas",
    "Registra a saída e o retorno dos bens, com condutor, finalidade, destino e quilometragem, além das reservas programadas.",
    [
      "Clique em Nova utilização (ou reserva) e informe o bem e o condutor.",
      "A unidade é sugerida pela lotação do bem e do condutor; ajuste se tiver permissão.",
      "Registre a marcação de saída.",
      "Ao retornar, informe a marcação de chegada para encerrar o uso.",
    ],
    [
      { label: "Condutor", description: "Somente condutores ativos e habilitados aparecem na lista.", tags: REQ },
      { label: "Marcação de saída / retorno", description: "Hodômetro ou horímetro conforme o bem.", tags: REQ },
      { label: "Distância percorrida", description: "Diferença entre retorno e saída.", tags: CALC },
      { label: "Finalidade e destino", description: "Justificativa do uso; aparece nos relatórios e na transparência." },
    ],
    [
      "A marcação de retorno não pode ser menor que a de saída.",
      "Um bem não pode ter duas utilizações abertas ao mesmo tempo.",
      "Só aparecem bens e condutores do próprio órgão; bens em manutenção, cedidos ou baixados não podem ser reservados.",
      "O histórico de utilização alimenta o filtro de veículos por condutor nos relatórios.",
    ],
  ),

  "/diarias": t(
    "Diárias",
    "Controle de diárias de viagem vinculadas a deslocamentos da frota, com valores, período e prestação de contas.",
    [
      "Cadastre a diária informando solicitante, beneficiário e autorizador a partir do cadastro de funcionários e pessoas externas.",
      "Informe destino, período e o dispositivo legal que fundamenta a concessão.",
      "Vincule ao uso do veículo quando houver.",
      "Acompanhe a situação até a prestação de contas.",
    ],
    [
      { label: "Solicitante, beneficiário e autorizador", description: "Selecionados no cadastro de pessoas do órgão (funcionários e pessoas externas), evitando digitação livre de nomes.", tags: REQ },
      { label: "Dispositivo legal / norma", description: "Escolhido no cadastro de dispositivos legais do órgão; há também campo de texto livre para normas não cadastradas.", tags: COND },
      { label: "Período", description: "Datas de saída e retorno; base para o número de diárias.", tags: REQ },
      { label: "Valor total", description: "Quantidade de diárias multiplicada pelo valor unitário.", tags: CALC },
    ],
    [
      "Somente pessoas e dispositivos legais do próprio órgão aparecem nas listas.",
      "O documento impresso reproduz o dispositivo legal informado.",
    ],
  ),

  "/multas": t(
    "Multas e infrações",
    "Registro e acompanhamento de autuações: identificação do condutor, prazos de defesa, indicação e pagamento.",
    [
      "Cadastre a multa com auto de infração, data e valor.",
      "Vincule o veículo e, quando cabível, indique o condutor.",
      "Acompanhe prazos e registre a baixa após o pagamento.",
    ],
    [
      { label: "Auto de infração", description: "Número do documento emitido pelo órgão autuador.", tags: REQ },
      { label: "Data e hora da infração", description: "Usada para identificar o condutor pelo registro de utilização.", tags: REQ },
      { label: "Condutor indicado", description: "Sugerido a partir da utilização do veículo no momento da infração.", tags: ["Automático", "Condicional"] },
      { label: "Prazo de defesa/indicação", description: "Gera alertas conforme a proximidade do vencimento.", tags: AUTO },
    ],
    ["Multas com prazo vencido continuam visíveis e passam a constar em Alertas."],
  ),

  "/sinistros": t(
    "Acidentes e sinistros",
    "Registro de acidentes, avarias e ocorrências, com boletim, terceiros envolvidos, custos e acionamento de seguro.",
    [
      "Registre a ocorrência com data, local e descrição.",
      "Anexe boletim e informações de terceiros, quando houver.",
      "Acompanhe o andamento até a conclusão.",
    ],
    [
      { label: "Bem envolvido", description: "Veículo ou equipamento da frota do órgão.", tags: REQ },
      { label: "Data, hora e local", description: "Usados para identificar o condutor pelo registro de utilização e para instruir o processo.", tags: REQ },
      { label: "Tipo de ocorrência", description: "Colisão, tombamento, atropelamento, furto/roubo, incêndio, perda total e outros.", tags: REQ },
      { label: "Condutor", description: "Sugerido pela utilização aberta do bem no momento da ocorrência; confirme antes de salvar.", tags: ["Automático", "Condicional"] },
      { label: "Apólice acionada", description: "Só aparece quando o bem tem seguro vigente na data da ocorrência.", tags: COND },
      { label: "Custo estimado e franquia", description: "Entram no custo acumulado do bem e nos relatórios de sinistralidade." },
      { label: "Situação", description: "Registrado, em apuração, seguradora acionada, reparo autorizado ou encerrado.", tags: REQ },
    ],
    ["Enquanto o bem estiver indisponível por sinistro, ele não aparece para reserva ou utilização."],
  ),

  "/seguros": t(
    "Seguros",
    "Controle de apólices da frota: vigência, cobertura, franquia e vínculo com os bens segurados.",
    [
      "Cadastre a apólice com seguradora e vigência.",
      "Vincule os veículos cobertos.",
      "Acompanhe os avisos de vencimento.",
    ],
    [
      { label: "Seguradora", description: "Empresa selecionada no cadastro de pessoas e empresas externas; não digite o nome.", tags: ["Obrigatório", "Automático"] },
      { label: "Número da apólice", description: "Identificação do contrato de seguro junto à seguradora.", tags: REQ },
      { label: "Vigência", description: "Início e fim da cobertura; o sistema avisa antes do vencimento.", tags: REQ },
      { label: "Veículos cobertos", description: "Selecionados na frota do órgão; um mesmo bem não deve ficar em duas apólices vigentes.", tags: REQ },
      { label: "Prêmio e franquia", description: "O prêmio entra no custo do bem; a franquia é usada no cálculo do custo do sinistro." },
      { label: "Situação", description: "Ativa, a vencer, vencida ou cancelada, conforme a vigência.", tags: AUTO },
    ],
    ["Ao registrar um sinistro, apenas apólices vigentes do veículo aparecem para acionamento."],
  ),

  "/obrigacoes": t(
    "Obrigações legais e documentos",
    "Acompanhamento de licenciamento, IPVA, vistorias, certificados e demais documentos obrigatórios da frota.",
    [
      "Cadastre a obrigação e o vencimento.",
      "Vincule ao bem correspondente.",
      "Registre a quitação ou renovação quando concluída.",
    ],
    [
      { label: "Bem", description: "Veículo ou equipamento a que o documento se refere.", tags: REQ },
      { label: "Tipo de obrigação", description: "Licenciamento, IPVA, seguro obrigatório, vistoria, certificado e outros.", tags: REQ },
      { label: "Exercício / competência", description: "Ano a que o documento se refere; evita confundir renovações de anos diferentes.", tags: REQ },
      { label: "Vencimento", description: "Base dos avisos de documento vencido ou a vencer.", tags: REQ },
      { label: "Valor e comprovante", description: "Preencha ao registrar a quitação; ficam disponíveis para conferência.", tags: COND },
      { label: "Situação", description: "Pendente, quitada, vencida, cancelada ou não aplicável, conforme o registro da baixa.", tags: AUTO },
    ],
    ["Documentos vencidos aparecem em Alertas e podem restringir o uso do bem conforme a política do órgão."],
  ),

  "/patrimonio": t(
    "Movimentação patrimonial",
    "Histórico de transferências, cessões, incorporações e baixas dos bens da frota, com data e justificativa.",
    [
      "Selecione o bem e registre a movimentação.",
      "Informe a unidade de origem e destino.",
      "Justifique a movimentação para fins de auditoria.",
    ],
    [
      { label: "Bem", description: "Veículo ou equipamento movimentado; a situação atual dele é mostrada ao selecionar.", tags: REQ },
      { label: "Tipo de movimentação", description: "Remanejamento entre unidades, cessão, locação, fiel depositário, alienação, doação, leilão, furto/roubo, perda total ou baixa.", tags: REQ },
      { label: "Unidade de origem", description: "Preenchida com a lotação atual do bem.", tags: AUTO },
      { label: "Unidade ou entidade de destino", description: "Unidade do próprio órgão ou entidade externa já cadastrada, conforme o tipo escolhido.", tags: ["Obrigatório", "Condicional"] },
      { label: "Data e documento", description: "Data de efeito e número do ato, termo ou processo que autoriza a movimentação.", tags: REQ },
      { label: "Justificativa", description: "Texto exigido para rastreabilidade e auditoria.", tags: REQ },
    ],
    [
      "A movimentação atualiza automaticamente a lotação e a situação do bem a partir da data informada.",
      "Bens baixados, alienados ou cedidos deixam de aparecer para reserva, abastecimento e manutenção.",
    ],
  ),

  "/historico-veiculo": t(
    "Histórico do veículo",
    "Linha do tempo completa de um bem: utilizações, abastecimentos, manutenções, multas, custos e indicadores.",
    [
      "Escolha o bem no seletor.",
      "Use o período para recortar o histórico.",
      "Exporte quando precisar instruir processo ou auditoria.",
    ],
    [
      { label: "Bem", description: "Veículo ou equipamento analisado; a lista traz apenas bens do próprio órgão.", tags: REQ },
      { label: "Período", description: "Recorta a linha do tempo e os totais apresentados.", tags: REQ },
      { label: "Linha do tempo", description: "Reúne o que já foi lançado nas outras telas (utilizações, abastecimentos, manutenções, limpezas, multas, sinistros e movimentações). Nada é digitado aqui.", tags: AUTO },
      { label: "Indicadores de consumo e custo", description: "Calculados a partir dos lançamentos do período e das marcações de medidor.", tags: CALC },
    ],
    [
      "Esta tela é apenas de consulta: correções devem ser feitas na tela onde o lançamento foi originado.",
      "Períodos sem marcação de medidor confiável ficam sem consumo médio.",
    ],
  ),

  "/autorizacoes": t(
    "Autorizações de abastecimento",
    "Emite a autorização prévia de abastecimento, reservando quantidade ou valor no contrato, empenho e cota antes do consumo.",
    [
      "Clique em Nova autorização e escolha o bem e o combustível.",
      "Informe a quantidade ou o valor autorizado.",
      "Emita a autorização e entregue ao condutor.",
      "Após o abastecimento, registre o consumo real para encerrar a autorização.",
    ],
    [
      { label: "Bem", description: "Veículo ou equipamento que será abastecido.", tags: REQ },
      { label: "Combustível/produto", description: "Deve estar previsto no contrato vigente.", tags: REQ },
      { label: "Quantidade ou valor autorizado", description: "Reservado imediatamente no contrato, no empenho e na cota.", tags: REQ },
      { label: "Saldo disponível", description: "Mostra o quanto ainda pode ser reservado.", tags: CALC },
      { label: "Posto/fornecedor", description: "Limita onde a autorização pode ser utilizada; deve pertencer ao contrato do próprio órgão.", tags: COND },
      { label: "Contrato e item", description: "A autorização nasce vinculada ao item do contrato; o preço utilizado é sempre o do item contratual.", tags: ["Automático", "Obrigatório"] },
    ],
    [
      "A autorização não é emitida se não houver saldo suficiente de contrato, empenho ou cota.",
      "A reserva fica bloqueada até o abastecimento ser lançado ou a autorização ser cancelada.",
      "A diferença entre o autorizado e o consumido volta automaticamente ao saldo.",
    ],
    ["Autorizado 50 litros, abastecidos 40: os 10 litros restantes retornam ao saldo assim que o abastecimento é registrado."],
  ),

  "/abastecimentos": t(
    "Abastecimentos",
    "Registra o abastecimento efetivamente realizado, com quantidade, valor, marcação do medidor e baixa da autorização.",
    [
      "Escolha a autorização correspondente (quando houver).",
      "Informe quantidade, valor unitário e marcação do hodômetro/horímetro.",
      "Salve para consumir a reserva e devolver a diferença ao saldo.",
    ],
    [
      { label: "Autorização", description: "Ao selecionar, os dados do bem, do combustível, do contrato e do item são preenchidos automaticamente.", tags: ["Automático", "Condicional"] },
      { label: "Quantidade abastecida", description: "Consumo real; não pode ultrapassar o autorizado.", tags: REQ },
      { label: "Valor total", description: "Quantidade multiplicada pelo valor unitário.", tags: CALC },
      { label: "Marcação do medidor", description: "Base do cálculo de consumo médio.", tags: REQ },
      { label: "Encerra a autorização", description: "Quando marcado, devolve o saldo não utilizado.", tags: AUTO },
    ],
    [
      "A marcação informada deve ser maior ou igual à última registrada para o bem.",
      "Abastecimentos de lubrificantes e aditivos não entram no cálculo de consumo médio.",
    ],
  ),

  "/combustiveis": t(
    "Combustíveis e produtos automotivos",
    "Cadastro dos produtos abastecíveis e insumos automotivos usados nas autorizações, contratos e relatórios.",
    [
      "Cadastre o produto com nome e unidade de medida.",
      "Indique se ele entra no cálculo de consumo.",
      "Vincule aos itens de contrato no módulo de Contratos.",
    ],
    [
      { label: "Unidade de medida", description: "Litro, quilo, hora ou unidade, conforme o produto.", tags: REQ },
      { label: "Entra no consumo", description: "Define se o produto é considerado nos indicadores de km/l." },
      { label: "Uso em contrato", description: "O produto só pode ser autorizado quando houver item de contrato vigente do próprio órgão que o contemple.", tags: COND },
    ],
  ),

  "/cotas-servidor": t(
    "Cotas de combustível de servidor",
    "Define limites individuais de combustível por servidor, em quantidade ou valor, para determinado período.",
    [
      "Cadastre a cota informando o servidor e o período.",
      "Escolha entre cota por quantidade ou por valor.",
      "Acompanhe o consumo e o saldo restante.",
    ],
    [
      { label: "Servidor", description: "Escolhido no cadastro de funcionários do órgão; não digite o nome.", tags: ["Obrigatório", "Automático"] },
      { label: "Tipo de cota", description: "Quantitativa (litros) ou financeira (R$).", tags: REQ },
      { label: "Periodicidade", description: "Semanal ou mensal; define quando o limite é renovado.", tags: REQ },
      { label: "Saldo utilizado", description: "Atualizado a cada autorização emitida e abastecimento lançado.", tags: AUTO },
      { label: "Situação", description: "Somente cotas ativas são consideradas na emissão de autorizações." },
    ],
    [
      "Autorização acima do saldo da cota do servidor é bloqueada.",
      "A cota de servidor é somada às demais travas: contrato, empenho e cota da unidade continuam valendo.",
    ]
  ),

  "/fornecedores": t(
    "Fornecedores / Postos",
    "Cadastro de postos e fornecedores de combustível, com endereço, contatos e localização no mapa.",
    [
      "Clique em Novo fornecedor e informe CNPJ e razão social.",
      "Preencha o endereço completo.",
      "Salve: a localização no mapa é buscada automaticamente pelo endereço.",
    ],
    [
      { label: "CNPJ e razão social", description: "Identificação oficial do posto ou fornecedor; o CNPJ evita cadastro duplicado.", tags: REQ },
      { label: "Endereço completo", description: "Logradouro, bairro, município e UF. Quanto mais completo, maior a chance de o mapa localizar o ponto.", tags: REQ },
      { label: "Latitude / longitude", description: "Buscadas automaticamente pelo endereço; corrija manualmente quando o endereço não for localizado. O sistema nunca estima coordenadas.", tags: ["Automático", "Depende de integração"] },
      { label: "Situação", description: "Fornecedores inativos deixam de aparecer nas autorizações e nos contratos novos." },
    ],
    [
      "O posto só pode receber autorização de abastecimento se estiver vinculado a contrato vigente do próprio órgão.",
      "Endereço incompleto deixa o cadastro na lista de localização pendente do Mapa da rede.",
    ],
  ),

  "/manutencoes": t(
    "Manutenções",
    "Registro de manutenções corretivas e preventivas, com serviços, peças, custos, oficina e tempo de indisponibilidade.",
    [
      "Na solicitação, informe o funcionário solicitante (a unidade solicitante é sugerida automaticamente) e o bem, quando a solicitação for para um bem específico.",
      "Ao registrar, escolha entre \"Usar solicitação existente\" (que preenche automaticamente os dados já informados) e \"Registrar manutenção sem solicitação prévia\".",
      "Escolha a origem: por contrato (com oficina contratada, contrato e item de mão de obra) ou fora de contrato.",
      "Lance as peças substituídas/utilizadas e encerre a manutenção com a data de conclusão.",
    ],
    [
      { label: "Unidade solicitante", description: "Sugerida a partir da unidade do funcionário solicitante; pode ser ajustada por quem tem permissão.", tags: ["Automático", "Obrigatório"] },
      { label: "Tipo", description: "Corretiva ou preventiva.", tags: REQ },
      { label: "Plano preventivo", description: "Lista apenas os planos cadastrados para o bem selecionado.", tags: COND },
      { label: "Oficina e contrato", description: "Na origem por contrato, a oficina contratada e o contrato vigente definem os itens disponíveis.", tags: COND },
      { label: "Valor unitário", description: "Vem do item contratual e fica bloqueado para edição; o total é quantidade × valor unitário.", tags: ["Automático", "Calculado"] },
      { label: "Peças substituídas/utilizadas", description: "Selecionadas entre os itens do contrato, com nº do item, descrição, referência, unidade, saldo disponível e valor unitário.", tags: COND },
      { label: "Custo total", description: "Soma de serviços e peças lançados.", tags: CALC },
      { label: "Período de indisponibilidade", description: "Diferença entre entrada e saída; alimenta o indicador de disponibilidade da frota.", tags: CALC },
    ],
    [
      "Centro de custo, empenho e cota não aparecem na tela operacional: são derivados da origem/contrato e permanecem registrados para auditoria e relatórios.",
      "Não é permitido consumir peça ou serviço acima do saldo do item contratual.",
      "Ao concluir manutenção vinculada a plano preventivo, o histórico do plano é atualizado e a próxima manutenção é calculada pela periodicidade cadastrada, sem duplicar evento em caso de reedição.",
      "Enquanto a manutenção estiver aberta, o bem é contabilizado como indisponível.",
    ],
  ),

  "/manutencoes/solicitacoes": t(
    "Solicitações de manutenção",
    "Registra o pedido de manutenção antes da execução: quem pediu, para qual bem e o que está ocorrendo. É a origem preferencial do registro da manutenção.",
    [
      "Clique em nova solicitação e informe o funcionário solicitante: a unidade solicitante é preenchida pela lotação dele.",
      "Selecione o bem e descreva o problema ou o serviço necessário.",
      "Escolha o tipo (corretiva ou preventiva) e a prioridade.",
      "Acompanhe a situação até a manutenção ser executada.",
    ],
    [
      { label: "Funcionário solicitante", description: "Escolhido no cadastro de funcionários; não digite o nome.", tags: ["Obrigatório", "Automático"] },
      { label: "Unidade solicitante", description: "Sugerida pela lotação do solicitante; só quem tem permissão pode trocar.", tags: ["Automático", "Obrigatório"] },
      { label: "Bem", description: "Veículo ou equipamento do próprio órgão que precisa do serviço.", tags: REQ },
      { label: "Descrição", description: "Relato objetivo do defeito ou do serviço pedido; orienta a oficina e a cotação.", tags: REQ },
      { label: "Prioridade", description: "Baixa, normal, alta ou urgente; organiza a fila de atendimento." },
      { label: "Situação", description: "Aberta, em análise, aprovada, em manutenção, concluída ou cancelada.", tags: AUTO },
    ],
    [
      "Ao registrar a manutenção usando a solicitação, bem, unidade, tipo e descrição já vêm preenchidos.",
      "Uma solicitação concluída não volta a ficar aberta: registre nova solicitação se o problema retornar.",
    ],
  ),

  "/planos-manutencao": t(
    "Planos de manutenção preventiva",
    "Define os intervalos de revisão por quilometragem, horas ou tempo, gerando avisos automáticos de manutenção vencida ou próxima.",
    [
      "Crie o plano e escolha os bens ou o tipo de bem.",
      "Defina o intervalo (km, horas ou meses).",
      "No campo Tipo de serviço, use o botão + para cadastrar um novo tipo sem sair da tela.",
      "Acompanhe os avisos gerados na tela de Alertas.",
    ],
    [
      { label: "Tipo de serviço", description: "Escolhido da lista do órgão; o botão + cria o tipo e já o deixa selecionado.", tags: REQ },
      { label: "Intervalo", description: "Base do próximo vencimento do plano.", tags: REQ },
      { label: "Próxima revisão", description: "Calculada a partir da última execução e do intervalo, atualizada quando uma manutenção do plano é concluída.", tags: CALC },
    ],
  ),

  "/limpeza": t(
    "Limpeza da frota",
    "Controle de higienização e lavagem dos bens, com data, tipo de serviço, responsável e custo.",
    [
      "Registre a limpeza informando bem e data.",
      "Informe o tipo de serviço e o custo, quando houver.",
      "Use \"Imprimir / Gerar PDF\" para emitir a solicitação institucional a ser apresentada no estabelecimento.",
      "Use os filtros para conferir a periodicidade por bem.",
    ],
    [
      { label: "Tipo de serviço", description: "Lavagem simples, completa, higienização ou outro.", tags: REQ },
      { label: "Imprimir / Gerar PDF", description: "Documento com brasão e dados do órgão, código, bem, tipo de limpeza, prestador quando definido, solicitante, data e observações.", tags: AUTO },
    ],
  ),

  "/pecas": t(
    "Peças e acessórios",
    "Catálogo de peças e acessórios com códigos, valores de referência e compatibilidade com os bens da frota.",
    [
      "Cadastre a peça com descrição e código.",
      "Use a aba de compatibilidade para vincular modelos atendidos.",
      "Consulte antes de emitir ordens de fornecimento.",
    ],
    [
      { label: "Código e descrição", description: "Identificação usada no estoque, nas ordens de fornecimento e nas cotações.", tags: REQ },
      { label: "Unidade de medida", description: "Peça, jogo, litro, metro; deve ser a mesma usada nas compras e no estoque.", tags: REQ },
      { label: "Valor de referência", description: "Preço estimado para conferência; não substitui o preço do item contratual, que sempre prevalece na execução." },
      { label: "Compatibilidade", description: "Relaciona marcas e modelos atendidos; pode ser ajustada manualmente quando o catálogo não cobrir o caso.", tags: COND },
    ],
    [
      "Peça incompatível com o bem gera aviso ao ser incluída em ordem ou manutenção.",
      "Na execução de manutenção por contrato, a peça só pode ser consumida se existir item de contrato com saldo.",
    ],
  ),

  "/ofp": t(
    "Ordens de Fornecimento de Peças",
    "Emite, acompanha e encerra ordens de fornecimento de peças, com itens, quantidades, valores e entrega.",
    [
      "Crie a ordem informando fornecedor e bem de destino.",
      "Inclua os itens com quantidade e valor.",
      "Emita, acompanhe a entrega e finalize ou cancele.",
    ],
    [
      { label: "Fornecedor", description: "Empresa do cadastro de pessoas e empresas externas; com contrato, apenas fornecedores do contrato aparecem.", tags: ["Obrigatório", "Condicional"] },
      { label: "Contrato e item", description: "Quando a compra é por contrato, o item define a peça e o valor unitário, que não é editável.", tags: ["Condicional", "Automático"] },
      { label: "Itens da ordem", description: "Cada linha traz peça, quantidade e valor unitário.", tags: REQ },
      { label: "Valor total", description: "Soma de quantidade × valor unitário de todos os itens.", tags: CALC },
      { label: "Recebimento", description: "Ao registrar a entrega, a quantidade recebida entra automaticamente no estoque do depósito indicado.", tags: AUTO },
      { label: "Situação", description: "Rascunho, aguardando aprovação, aprovada, parcialmente atendida, atendida, rejeitada ou cancelada.", tags: AUTO },
    ],
    [
      "Não é possível pedir acima do saldo do item contratual.",
      "Ordens já atendidas ficam bloqueadas para edição; use cancelamento com justificativa.",
    ]
  ),

  "/almoxarifado": t(
    "Almoxarifado",
    "Controle de estoque de peças e insumos: entradas, saídas, reservas, saldos por depósito e inventário.",
    [
      "Cadastre depósitos e saldos iniciais.",
      "Registre entradas e saídas de material; a entrada por compra nasce do recebimento da ordem de fornecimento.",
      "Use a transferência entre depósitos para mover um ou vários itens em uma única operação.",
      "Use o inventário para conferência periódica.",
    ],
    [
      { label: "Depósito", description: "Local físico do estoque; a transferência exige depósito de origem e de destino diferentes.", tags: REQ },
      { label: "Saldo disponível", description: "Saldo em estoque menos as reservas ativas.", tags: CALC },
      { label: "Movimentação", description: "Entrada, saída, ajuste ou transferência; sempre com justificativa.", tags: REQ },
      { label: "Transferência multi-item", description: "Permite incluir várias linhas de item e quantidade; cada linha é validada e registrada individualmente na auditoria.", tags: COND },
    ],
    [
      "Saídas e transferências acima do saldo disponível são bloqueadas.",
      "Entradas excepcionais (saldo inicial, devolução, doação, ajuste e correção) exigem justificativa e ficam registradas na auditoria.",
    ],
  ),

  "/almoxarifado/transferencias": t(
    "Transferência entre depósitos",
    "Move itens de um depósito para outro sem alterar o patrimônio total do estoque. Uma única operação pode transferir vários itens.",
    [
      "Selecione o depósito de origem e o de destino (precisam ser diferentes).",
      "Acrescente uma linha por item, informando a peça e a quantidade.",
      "Confira o saldo disponível mostrado em cada linha e confirme a transferência.",
    ],
    [
      { label: "Depósito de origem", description: "De onde o material sai; o saldo disponível é mostrado por item.", tags: REQ },
      { label: "Depósito de destino", description: "Para onde o material vai; deve ser diferente da origem.", tags: REQ },
      { label: "Itens e quantidades", description: "Várias linhas na mesma operação; cada linha é validada e registrada individualmente.", tags: REQ },
      { label: "Justificativa", description: "Motivo da movimentação; fica no histórico para auditoria.", tags: REQ },
      { label: "Saldo após a operação", description: "Baixado na origem e acrescido no destino no momento da confirmação.", tags: AUTO },
    ],
    [
      "Transferência acima do saldo disponível (saldo em estoque menos reservas) é bloqueada.",
      "A operação não altera custo médio total: apenas muda a localização do material.",
    ],
  ),

  "/pneus": t(
    "Pneus",
    "Gestão do ciclo de vida dos pneus: aquisição, instalação por posição, rodízio, recapagem e descarte.",
    [
      "Cadastre o pneu com número de série e medidas.",
      "Instale no bem indicando a posição.",
      "Registre rodízios, recapagens e o descarte final.",
    ],
    [
      { label: "Número de série / fogo", description: "Identificação única do pneu; não se repete no órgão.", tags: REQ },
      { label: "Medida e marca", description: "Usadas na conferência de compatibilidade com o bem.", tags: REQ },
      { label: "Bem e posição", description: "Informados na instalação; a posição indica o eixo/lado ocupado.", tags: COND },
      { label: "Situação", description: "Estoque, instalado, em reparo, recapagem, descartado ou baixado.", tags: AUTO },
      { label: "Vida útil percorrida", description: "Quilometragem acumulada do bem durante o período em que o pneu esteve instalado.", tags: CALC },
    ],
  ),

  "/rede-credenciada": t(
    "Rede credenciada",
    "Cadastro de oficinas e prestadores credenciados, com serviços atendidos, endereço e posição no mapa.",
    [
      "Cadastre a oficina com CNPJ e endereço.",
      "Indique os serviços atendidos.",
      "Salve: a posição no mapa é obtida automaticamente pelo endereço.",
    ],
    [
      { label: "CNPJ e razão social", description: "Identificação oficial do prestador; evita duplicidade no cadastro.", tags: REQ },
      { label: "Serviços atendidos", description: "Especialidades da oficina; filtram onde ela aparece em cotações, ordens de serviço e manutenções." },
      { label: "Endereço e localização", description: "A posição no mapa vem do endereço; pode ser corrigida manualmente quando não localizada.", tags: ["Automático", "Depende de integração"] },
      { label: "Situação", description: "Em análise, ativo, suspenso ou inativo. Somente oficinas ativas podem receber ordem de serviço." },
    ],
    ["Para execução por contrato, a oficina também precisa constar como contratada no contrato vigente."],
  ),

  "/credenciados": t(
    "Credenciados e cartão virtual",
    "Gestão dos parceiros credenciados e do cartão virtual do bem, usado para identificar veículo e autorização no atendimento.",
    [
      "Cadastre o parceiro e os usuários que acessarão o portal.",
      "Gere o cartão virtual do bem.",
      "Acompanhe os atendimentos capturados pelo parceiro.",
    ],
    [
      { label: "Parceiro", description: "Empresa credenciada responsável pelo atendimento.", tags: REQ },
      { label: "Cartão virtual", description: "Código de identificação do bem, apresentado no atendimento.", tags: AUTO },
      { label: "Usuários do parceiro", description: "Acessam apenas os dados do próprio credenciamento.", tags: COND },
    ],
    [
      "O cartão virtual identifica o bem; não é meio de pagamento e não realiza transação bancária.",
      "Cartões inativos não permitem captura de atendimento.",
    ],
  ),

  "/portal-credenciado": t(
    "Portal do credenciado",
    "Área usada pelo parceiro credenciado para validar o cartão do bem e registrar o atendimento de abastecimento ou manutenção.",
    [
      "Informe ou leia o código do cartão virtual.",
      "Confira os dados do bem e da autorização.",
      "Registre o atendimento com quantidade, valor e marcação do medidor.",
    ],
    [
      { label: "Código do cartão", description: "Identifica o bem e a autorização válida.", tags: REQ },
      { label: "Dados do bem", description: "Exibidos após a validação do cartão.", tags: AUTO },
    ],
    ["Cartões vencidos, inativos ou sem autorização válida não permitem registrar atendimento."],
  ),

  "/mapa-rede": t(
    "Mapa da rede credenciada",
    "Visualiza no mapa postos, oficinas e credenciados, apoiando o planejamento de rotas e a distribuição da rede.",
    [
      "Use os filtros por tipo de estabelecimento e situação.",
      "Clique em um ponto para ver os dados do estabelecimento.",
      "Para cadastros sem localização, use a busca de coordenadas ou informe latitude e longitude manualmente.",
      "Ajuste o zoom para comparar a cobertura por região.",
    ],
    [
      { label: "Filtro por tipo", description: "Postos de combustível, oficinas, credenciados e higienização/lava-jatos." },
      { label: "Pontos no mapa", description: "Alimentados automaticamente pelo cadastro mestre e pelos contratos e credenciamentos ativos do próprio órgão.", tags: ["Automático", "Depende de integração"] },
      { label: "Localização pendente", description: "Cadastros sem coordenada ficam listados à parte para busca automática ou correção manual.", tags: COND },
    ],
    [
      "O mapa mostra somente estabelecimentos do órgão em que você está conectado.",
      "Cadastros sem endereço válido não aparecem no mapa até receberem coordenada.",
      "A busca automática de coordenadas usa serviço público gratuito, com limite de consultas; quando falha, informe a coordenada manualmente. O sistema nunca estima coordenadas.",
      "Não é necessário recadastrar o estabelecimento apenas para que ele apareça no mapa.",
    ],
  ),

  "/cotacoes": t(
    "Cotações",
    "Coleta e compara propostas de serviços e de peças antes da contratação, com convite por e-mail ou link, lançamento manual de propostas e mapa comparativo.",
    [
      "Clique em Nova cotação, escolha o tipo (Serviços, Peças, ou Serviços e peças), descreva o objeto e informe o prazo final para recebimento da proposta.",
      "Vincule o veículo ou bem quando a cotação for para um item da frota; deixe em branco para compras de estoque.",
      "Na aba Itens solicitados, cadastre o que será cotado; nas peças, informe a quantidade que o órgão precisa.",
      "Na aba Convites, envie e-mails às empresas ou copie o link público para outros meios.",
      "Use Lançar proposta para registrar propostas recebidas fora do sistema.",
      "Compare tudo no Mapa comparativo e aprove a proposta vencedora.",
    ],
    [
      { label: "Tipo da cotação", description: "Serviços, Peças, ou Serviços e peças. Define quais campos a empresa preenche na proposta.", tags: REQ },
      { label: "Objeto da cotação", description: "Descrição do que está sendo cotado.", tags: REQ },
      { label: "Prazo final para recebimento da proposta", description: "Data limite de resposta; também encerra o link enviado ao fornecedor.", tags: REQ },
      { label: "Veículo ou bem", description: "Vincule quando a cotação for para um item da frota; pode ficar em branco em compras de estoque.", tags: COND },
      { label: "Observações", description: "Informações complementares exibidas também na página do fornecedor." },
      { label: "Situação da cotação", description: "Rascunho, Aberta, Em análise, Encerrada ou Cancelada.", tags: AUTO },
      { label: "Valor das propostas", description: "Sempre o valor líquido, já descontado.", tags: CALC },
    ],
    [
      "Rascunho permite montar itens e convites, mas o fornecedor ainda não responde; Aberta libera as respostas; Em análise interrompe novas propostas e libera a comparação; Encerrada e Cancelada bloqueiam alterações.",
      "Valores aparecem no padrão 0,00 e R$ 0,00; totais, descontos e valor líquido são calculados pelo sistema.",
      "Todos os dados, sugestões e históricos são do próprio órgão; nada é compartilhado entre órgãos.",
      "O link do fornecedor é protegido por token e só funciona em endereço público do sistema — endereços de teste ou de pré-visualização não servem.",
    ],
  ),

  "/cotacoes/itens": t(
    "Itens solicitados",
    "Lista o que o órgão quer cotar. É essa lista que o fornecedor recebe e preenche.",
    [
      "Digite a descrição: o sistema sugere itens já usados pelo próprio órgão; clique numa sugestão ou continue digitando para cadastrar um item novo.",
      "Confira a unidade (peça, litro, hora, serviço).",
      "Informe a quantidade quando o item for peça ou material.",
    ],
    [
      { label: "Descrição do item", description: "O que está sendo pedido. Com autocomplete pelo histórico do órgão.", tags: REQ },
      { label: "Sugestão do histórico", description: "Traz descrição e unidade usual de itens já cotados no órgão; nunca reaproveita preço, marca ou fornecedor.", tags: AUTO },
      { label: "Unidade", description: "Unidade de medida usada na cotação e na proposta." },
      { label: "Quantidade", description: "Definida pelo órgão nas peças e materiais; o fornecedor não pode alterá-la.", tags: COND },
    ],
    [
      "Peça é item físico com quantidade e valor unitário; serviço é mão de obra ou execução, cotada por horas e valores globais.",
      "O fornecedor não pode incluir itens no link público: responde exatamente ao que foi solicitado.",
      "Itens inéditos podem ser cadastrados livremente, mesmo sem histórico.",
    ],
  ),

  "/cotacoes/convites": t(
    "Convites",
    "Convida empresas a apresentar proposta, por e-mail ou por link, e acompanha a resposta de cada uma.",
    [
      "Clique em Enviar convites e busque empresas por nome, CNPJ ou e-mail.",
      "Acrescente e-mails avulsos de empresas ainda não cadastradas, ou cadastre a empresa na hora.",
      "Confirme o envio: cada empresa recebe uma mensagem individual, sem ver as demais.",
      "Quando não houver envio por e-mail, use Copiar link e mande pelo canal que preferir.",
      "Acompanhe a situação, reenvie, edite o destinatário ou exclua o convite enquanto o processo estiver aberto.",
    ],
    [
      { label: "Empresas cadastradas", description: "Selecionadas da rede do órgão, com e-mail já preenchido." },
      { label: "E-mails avulsos", description: "Para empresas ainda não cadastradas; a vinculação ocorre quando a empresa for cadastrada.", tags: COND },
      { label: "Situação do convite", description: "Pendente (criado, sem envio), Enviado, Respondido, Prazo expirado, Erro no envio e Recusado.", tags: AUTO },
      { label: "Histórico do convite", description: "Criação, envios, tentativas, último erro e data da resposta.", tags: AUTO },
      { label: "Envio de e-mail", description: "Depende do provedor de envio configurado pelo órgão; sem configuração o sistema avisa e oferece o link.", tags: EXT },
      { label: "Copiar link", description: "Endereço público e exclusivo daquele convite, protegido por token.", tags: AUTO },
    ],
    [
      "Copiar link só funciona com o endereço público do sistema configurado; endereços de teste, de rede interna ou de pré-visualização nunca são enviados ao fornecedor.",
      "Cada convite tem link próprio, protegido por token, sem login, válido até o prazo final da cotação.",
      "Reenviar ou copiar o link gera um endereço novo: o anterior deixa de funcionar.",
      "Depois do prazo, o link ainda abre para leitura, mas o envio de proposta fica bloqueado.",
      "Sem provedor de e-mail configurado o envio é bloqueado e nada é registrado como enviado — use Copiar link.",
      "Somente quem administra a frota pode convidar, reenviar ou excluir convites.",
    ],
  ),

  "/cotacoes/lancar": t(
    "Lançar proposta",
    "Registra no sistema uma proposta recebida fora dele — em papel, e-mail, WhatsApp ou balcão.",
    [
      "Selecione a empresa; se ela ainda não existir, use “+ Cadastrar nova empresa” sem sair da cotação.",
      "Preencha os campos conforme o tipo da cotação: serviços, peças, ou os dois grupos.",
      "Informe validade, prazos, garantias e desconto, e confirme o lançamento.",
    ],
    [
      { label: "Empresa / oficina / loja", description: "Pode ser escolhida mesmo sem convite prévio; o convite interno é criado sem envio de e-mail.", tags: REQ },
      { label: "Cadastrar nova empresa", description: "Inclui a empresa na rede do órgão (tipo, razão social, CNPJ/CPF, contato, endereço e especialidade) e já a seleciona." },
      { label: "Campos da proposta", description: "Exibidos conforme o tipo da cotação escolhido na abertura.", tags: COND },
      { label: "Origem", description: "Propostas lançadas aqui aparecem como Manual em Propostas recebidas.", tags: AUTO },
    ],
    [
      "A proposta manual segue exatamente as mesmas regras de cálculo da recebida por link.",
      "Cada empresa tem uma proposta por cotação; um novo lançamento para a mesma empresa substitui os valores anteriores.",
    ],
  ),

  "/cotacoes/propostas": t(
    "Propostas recebidas",
    "Reúne todas as propostas da cotação, lançadas pelo órgão ou enviadas pelo fornecedor no link público.",
    [
      "Use o filtro para ver todas, só as lançadas manualmente ou só as recebidas por link.",
      "Abra a proposta para conferir serviços, peças, prazos, garantias e desconto.",
      "Desclassifique, com o motivo, a proposta que não atender às condições.",
    ],
    [
      { label: "Origem", description: "Manual (lançada pelo órgão) ou Link (enviada pelo fornecedor).", tags: AUTO },
      { label: "Situação da proposta", description: "Recebida, aprovada ou desclassificada.", tags: AUTO },
      { label: "Validade da proposta (dias)", description: "Prazo em que o fornecedor mantém os valores." },
      { label: "Prazo de execução", description: "Dias para executar o serviço.", tags: COND },
      { label: "Garantia dos serviços / Garantia das peças", description: "Informadas separadamente, em dias, no cabeçalho da proposta.", tags: COND },
      { label: "Desconto", description: "Informado em R$ ou em %; o sistema converte e aplica sobre o total bruto.", tags: CALC },
      { label: "Subtotais, desconto e valor líquido", description: "Calculados pelo sistema a partir dos valores informados.", tags: CALC },
      { label: "Valor exibido", description: "Sempre o valor líquido final, já com o desconto.", tags: CALC },
      { label: "Motivo da desclassificação", description: "Exigido ao desclassificar uma proposta.", tags: COND },
    ],
    [
      "A garantia é da proposta inteira (serviços e peças), não item a item.",
      "Desconto em percentual não pode passar de 100%; desconto em valor não pode superar o total bruto.",
      "Proposta desclassificada continua registrada e sai da comparação.",
    ],
  ),

  "/cotacoes/servicos": t(
    "Proposta de serviços",
    "Campos usados quando a cotação é de serviços ou da parte de serviços de uma cotação mista.",
    [
      "Informe validade, prazo de execução e garantia dos serviços.",
      "Lance as horas-homem e o valor da hora; o total da mão de obra é calculado.",
      "Use o valor global dos demais serviços para o que não é cobrado por hora.",
    ],
    [
      { label: "Validade da proposta (dias)", description: "Tempo em que a empresa mantém os valores." },
      { label: "Prazo de execução (dias)", description: "Tempo para concluir o serviço." },
      { label: "Garantia dos serviços (dias)", description: "Garantia da execução." },
      { label: "Quantidade de horas", description: "Horas-homem previstas." },
      { label: "Valor da hora/homem (R$)", description: "Valor unitário da hora." },
      { label: "Total da mão de obra", description: "Horas multiplicadas pelo valor da hora.", tags: CALC },
      { label: "Valor global dos demais serviços (R$)", description: "Serviços não cobrados por hora." },
      { label: "Desconto", description: "Em R$ ou %, aplicado ao total bruto.", tags: CALC },
      { label: "Observações", description: "Condições e esclarecimentos da empresa." },
    ],
  ),

  "/cotacoes/pecas": t(
    "Proposta de peças",
    "Campos usados quando a cotação é de peças ou da parte de peças de uma cotação mista.",
    [
      "Para cada item solicitado, informe marca, nº/código e valor unitário.",
      "Confira o total de cada item e o total geral, calculados automaticamente.",
      "Informe validade, garantia das peças e desconto.",
    ],
    [
      { label: "Marca", description: "Marca oferecida para o item." },
      { label: "Nº / código da peça", description: "Referência do fabricante ou do catálogo." },
      { label: "Quantidade", description: "Definida pelo órgão; fica bloqueada para o fornecedor.", tags: AUTO },
      { label: "Valor unitário (R$)", description: "Preço por unidade do item." },
      { label: "Total do item", description: "Quantidade multiplicada pelo valor unitário.", tags: CALC },
      { label: "Total geral das peças", description: "Soma dos itens.", tags: CALC },
      { label: "Garantia das peças (dias)", description: "Informada uma vez, no cabeçalho da proposta, valendo para todos os itens." },
      { label: "Desconto", description: "Em R$ ou %, aplicado ao total bruto.", tags: CALC },
      { label: "Observações", description: "Condições e esclarecimentos da empresa." },
    ],
    ["A garantia é geral da proposta: não existe garantia por item."],
  ),

  "/cotacoes/servicos-pecas": t(
    "Proposta de serviços e peças",
    "Reúne, na mesma proposta, o bloco de serviços e o bloco de peças.",
    [
      "Preencha o bloco de serviços (horas, valor da hora e serviços globais).",
      "Preencha o bloco de peças (marca, código e valor unitário de cada item solicitado).",
      "Informe as duas garantias, o desconto e confira o valor líquido.",
    ],
    [
      { label: "Garantia dos serviços (dias)", description: "Garantia da execução." },
      { label: "Garantia das peças (dias)", description: "Garantia dos materiais fornecidos." },
      { label: "Subtotal de serviços e Subtotal de peças", description: "Calculados separadamente e somados no total bruto.", tags: CALC },
      { label: "Valor líquido final", description: "Total bruto menos o desconto.", tags: CALC },
    ],
    ["As duas garantias são independentes e ambas ficam registradas na proposta."],
  ),

  "/cotacoes/publica": t(
    "Página do fornecedor",
    "Tela aberta pelo link do convite, onde a empresa consulta o pedido do órgão e envia sua proposta, sem login.",
    [
      "Confira o cabeçalho com o órgão, o tipo da cotação, o objeto e o prazo final.",
      "Preencha os campos solicitados conforme o tipo da cotação.",
      "Envie a proposta antes do prazo final.",
    ],
    [
      { label: "Cabeçalho institucional", description: "Brasão, nome do órgão, CNPJ e cidade/UF.", tags: AUTO },
      { label: "Tipo da cotação, objeto e observações", description: "Definidos pelo órgão.", tags: AUTO },
      { label: "Veículo ou bem", description: "Exibido apenas quando a cotação estiver vinculada a um item da frota.", tags: COND },
      { label: "Prazo final para recebimento da proposta", description: "Data limite para envio.", tags: AUTO },
      { label: "Quantidade das peças", description: "Definida pelo órgão e bloqueada para o fornecedor.", tags: AUTO },
      { label: "Horas-homem", description: "Editáveis pelo fornecedor nas cotações de serviços.", tags: COND },
    ],
    [
      "A empresa preenche apenas o que foi solicitado e não pode acrescentar itens.",
      "Depois do prazo a página continua abrindo para leitura, mas não é possível editar nem enviar.",
      "O link é individual e protegido por token; endereços de teste ou pré-visualização não valem para fornecedor externo.",
    ],
  ),

  "/cotacoes/mapa": t(
    "Mapa comparativo",
    "Compara lado a lado as propostas válidas e apoia a decisão do órgão.",
    [
      "Confira, por item e no total, os valores de cada empresa.",
      "Verifique o menor valor destacado, sempre sobre a base líquida.",
      "Registre a análise técnica e aprove a proposta vencedora.",
    ],
    [
      { label: "Propostas comparadas", description: "Somente as válidas; desclassificadas ficam de fora.", tags: AUTO },
      { label: "Desconto e valor líquido", description: "Exibidos por proposta.", tags: CALC },
      { label: "Menor valor", description: "Destacado automaticamente pelo valor líquido.", tags: CALC },
      { label: "Justificativa de escolha", description: "Exigida quando a proposta aprovada não for a de menor valor.", tags: COND },
      { label: "Justificativa de quantidade", description: "Exigida quando houver menos de três propostas válidas.", tags: COND },
      { label: "Análise técnica", description: "Registro do parecer do órgão sobre as propostas." },
      { label: "Proposta aprovada", description: "Passa a ser a base para a ordem de serviço ou compra.", tags: AUTO },
    ],
    ["A comparação usa sempre o valor líquido, nunca o bruto."],
  ),



  "/ordens-servico": t(
    "Ordens de Serviço",
    "Autoriza e acompanha a execução de serviços na rede credenciada, do orçamento aprovado até a entrega e o pagamento.",
    [
      "Gere a ordem a partir da cotação aprovada ou diretamente.",
      "Escolha a origem da despesa: contrato ou compra direta/pronto pagamento.",
      "Na origem por contrato, selecione o contrato e o item contratual correspondente.",
      "Acompanhe a execução e registre a conclusão e o valor final.",
    ],
    [
      { label: "Origem da despesa", description: "Define o restante da tela: por contrato exige contrato e item; compra direta/pronto pagamento dispensa contrato.", tags: REQ },
      { label: "Prestador", description: "Na compra direta pode ser qualquer empresa do cadastro mestre, mesmo sem contrato ou credenciamento.", tags: REQ },
      { label: "Contrato e item contratual", description: "Aparecem apenas na origem por contrato; o valor unitário vem do item e não é editável.", tags: ["Obrigatório", "Condicional"] },
      { label: "Valor total", description: "Quantidade multiplicada pelo valor unitário do item; soma dos itens autorizados.", tags: CALC },
    ],
    [
      "Centro de custo, empenho e cota não aparecem na tela operacional: são derivados da origem e do contrato e permanecem registrados para auditoria e relatórios.",
      "Ordens nascidas de cotação só prosseguem com proposta aprovada.",
      "Ordens concluídas ficam bloqueadas para edição e geram lançamento de custo no bem.",
      "Só é possível selecionar contratos, itens e empresas do próprio órgão.",
    ],
  ),

  "/contratos": t(
    "Contratos",
    "Cadastro dos contratos de fornecimento e serviços, com itens, quantidades, preços e saldos consumidos.",
    [
      "Cadastre o contrato com fornecedor, tipo de objeto, vigência e valor.",
      "Inclua os itens contratados com quantidade e preço unitário.",
      "Registre aditivos de prazo, valor, acréscimo, supressão ou reajuste quando houver.",
      "Acompanhe nos cards de resumo o contratado, o consumido, o reservado e o saldo.",
    ],
    [
      { label: "Tipo de objeto", description: "Classifica o contrato (combustível, peças, manutenção, higienização, locação, seguro e outros) e orienta onde ele pode ser usado.", tags: REQ },
      { label: "Vigência", description: "Fora da vigência o contrato não pode ser utilizado.", tags: REQ },
      { label: "Itens", description: "Cada item tem quantidade e preço unitário; o total é calculado.", tags: CALC },
      { label: "Saldo do item", description: "Quantidade contratada menos consumida e reservada.", tags: CALC },
      { label: "Cards de resumo", description: "Contratos vigentes, valor contratado, consumido, reservado e saldo disponível, calculados a partir dos itens e das execuções.", tags: CALC },
    ],
    [
      "Contratos vencidos ou sem saldo bloqueiam a emissão de novas autorizações.",
      "Somente contratos do próprio órgão podem ser selecionados nas demais telas.",
      "Preços usados em manutenções e ordens de serviço vêm sempre do item contratual, não de valor digitado livremente.",
    ],
  ),

  "/contratos/itens": t(
    "Itens do contrato",
    "Detalha o que foi contratado: cada produto ou serviço com quantidade, preço unitário e saldo. É o item que controla preço e limite de consumo em abastecimentos, manutenções e ordens de serviço.",
    [
      "Clique em incluir item e descreva o objeto exatamente como consta no contrato.",
      "Informe a unidade de medida, a quantidade contratada e o valor unitário adjudicado.",
      "Confira o total calculado e salve; repita para cada item do contrato.",
    ],
    [
      { label: "Número e descrição do item", description: "Identificação do item no instrumento contratual; use a mesma redação do contrato para facilitar a conferência.", tags: REQ },
      { label: "Produto vinculado", description: "Combustível, peça ou tipo de serviço já cadastrado. É esse vínculo que faz o item aparecer nas telas de abastecimento e manutenção.", tags: REQ },
      { label: "Unidade de medida", description: "Litro, hora, peça, serviço; deve ser a mesma usada no consumo.", tags: REQ },
      { label: "Quantidade contratada", description: "Limite total previsto para o item; alterações só por aditivo.", tags: REQ },
      { label: "Valor unitário", description: "Preço contratado por unidade. É esse preço que as demais telas usam, bloqueado para edição.", tags: ["Obrigatório", "Calculado no total"] as unknown as FieldTag[] },
      { label: "Valor total do item", description: "Quantidade multiplicada pelo valor unitário.", tags: CALC },
      { label: "Consumido / reservado / saldo", description: "Atualizados automaticamente pelas autorizações, abastecimentos, manutenções e ordens de serviço.", tags: ["Automático", "Calculado"] },
    ],
    [
      "Não é possível consumir acima do saldo do item: o lançamento é bloqueado.",
      "Itens com consumo registrado não podem ter quantidade ou preço reduzidos livremente — use aditivo de supressão ou reajuste.",
    ],
  ),

  "/contratos/aditivos": t(
    "Aditivos contratuais",
    "Registra as alterações formais do contrato: prorrogação de prazo, acréscimo, supressão, reajuste ou reequilíbrio. O aditivo atualiza automaticamente vigência, valores e itens.",
    [
      "Clique em novo aditivo e escolha o tipo de alteração.",
      "Informe o número, a data de assinatura e o fundamento legal.",
      "Conforme o tipo, informe a nova vigência e/ou as alterações de quantidade e preço por item.",
      "Salve: o contrato passa a valer com a nova vigência e os novos saldos.",
    ],
    [
      { label: "Tipo de aditivo", description: "Prorrogação, acréscimo, supressão, reajuste, reequilíbrio ou combinado. Define quais campos ficam disponíveis.", tags: REQ },
      { label: "Número e data de assinatura", description: "Identificação do termo aditivo; a data define a partir de quando a alteração vale.", tags: REQ },
      { label: "Fundamento legal", description: "Dispositivo que autoriza a alteração; aparece no histórico e nos documentos." },
      { label: "Nova vigência", description: "Exigida nas prorrogações; cria uma nova vigência com saldo próprio.", tags: COND },
      { label: "Itens alterados", description: "Nos aditivos de valor, informe a nova quantidade e/ou preço por item; o sistema recalcula os saldos.", tags: COND },
      { label: "Valor anterior e posterior", description: "Calculados a partir dos itens antes e depois do aditivo.", tags: CALC },
    ],
    [
      "Não é possível suprimir quantidade já consumida.",
      "O histórico mostra todas as vigências e aditivos, com valor, reservado, consumido e saldo de cada período.",
    ],
  ),

  "/empenhos": t(
    "Empenhos",
    "Controle dos empenhos orçamentários vinculados aos contratos, com valores empenhados, reservados e liquidados.",
    [
      "Cadastre o empenho com número, data e valor.",
      "Informe dotação orçamentária, fonte de recurso e elemento de despesa; use o botão + ao lado de cada campo para criar um novo registro sem sair da tela.",
      "Vincule ao contrato correspondente.",
      "Acompanhe o consumo do saldo empenhado nos cards de resumo.",
    ],
    [
      { label: "Número do empenho", description: "Identificação orçamentária oficial.", tags: REQ },
      { label: "Dotação, fonte e elemento", description: "Escolhidos de cadastros reutilizáveis do próprio órgão; o botão + cria o registro e já o deixa selecionado.", tags: REQ },
      { label: "Saldo disponível", description: "Valor empenhado menos reservado e liquidado.", tags: CALC },
      { label: "Cards de resumo", description: "Empenhos ativos, valor empenhado, consumido, reservado e saldo disponível.", tags: CALC },
    ],
    ["Sem saldo de empenho a autorização de abastecimento não é emitida."],
  ),

  "/cotas": t(
    "Cotas e saldos",
    "Distribui limites de consumo por unidade, centro de custo ou período, e mostra os saldos em tempo real.",
    [
      "Cadastre a cota informando abrangência e período.",
      "Defina o limite em quantidade ou em valor.",
      "Acompanhe o consumo e o saldo restante.",
    ],
    [
      { label: "Abrangência", description: "Define a quem a cota se aplica: órgão, unidade ou bem específico.", tags: REQ },
      { label: "Tipo de cota", description: "Quantitativa (litros/horas) ou financeira (R$).", tags: REQ },
      { label: "Período", description: "Intervalo em que o limite vale; ao terminar, a cota deixa de reservar saldo.", tags: REQ },
      { label: "Limite", description: "Valor ou quantidade máxima permitida no período.", tags: REQ },
      { label: "Reservado / consumido", description: "Atualizados automaticamente pelas autorizações emitidas e pelos abastecimentos lançados.", tags: AUTO },
      { label: "Saldo restante", description: "Limite menos o consumido e o reservado em aberto.", tags: CALC },
    ],
    [
      "Autorização acima do saldo da cota é bloqueada na emissão.",
      "Suplementação de cota é registrada como lançamento próprio e fica no histórico.",
    ],
  ),

  "/centros-custo": t(
    "Centros de custo",
    "Define para onde a despesa da frota é apropriada, permitindo apurar custo por área, programa ou projeto.",
    [
      "Cadastre o centro de custo com código e nome.",
      "Vincule a unidade responsável, quando o centro pertencer a uma secretaria específica.",
      "Use o centro nos relatórios para apurar o custo por área.",
    ],
    [
      { label: "Código", description: "Identificação usada em relatórios, exportações e integração contábil.", tags: REQ },
      { label: "Nome", description: "Descrição reconhecível pela área responsável.", tags: REQ },
      { label: "Unidade vinculada", description: "Selecionada em Secretarias/Unidades; usada para sugerir o centro nas despesas daquela unidade.", tags: COND },
    ],
    [
      "Nas telas de manutenção e ordem de serviço o centro de custo não é digitado: ele é derivado da origem da despesa e do contrato, e fica registrado para relatórios e auditoria.",
    ],
  ),

  "/orgao": t(
    "Dados do Órgão",
    "Guarda a identificação institucional do órgão. É daqui que saem o cabeçalho do sistema, os documentos impressos, os relatórios e o portal da transparência.",
    [
      "Preencha razão social, CNPJ, endereço e contatos.",
      "Envie o brasão em imagem de boa qualidade.",
      "Informe o período de gestão, quando aplicável, e salve.",
    ],
    [
      { label: "Razão social", description: "Nome oficial do órgão, exatamente como consta nos atos administrativos. Aparece nos documentos emitidos.", tags: REQ },
      { label: "Nome curto", description: "Versão reduzida usada no menu e nos cabeçalhos quando o nome oficial é longo." },
      { label: "CNPJ", description: "Informe apenas números; o sistema aplica a formatação.", tags: REQ },
      { label: "Endereço, município e UF", description: "Usados nos documentos impressos e como referência de localização nos mapas.", tags: REQ },
      { label: "Brasão", description: "Imagem exibida no topo do sistema e em todo documento impresso ou PDF gerado." },
      { label: "Período de gestão", description: "Datas de início e fim do mandato; usado apenas como informação institucional.", tags: COND },
    ],
    [
      "A alteração vale para todo o órgão e passa a valer imediatamente nos próximos documentos emitidos.",
      "Cada órgão vê e edita somente os próprios dados.",
    ],
  ),

  "/unidades": t(
    "Secretarias / Unidades",
    "Monta a estrutura administrativa do órgão. A unidade define quem responde por cada bem e organiza custos, filtros e relatórios.",
    [
      "Cadastre a unidade com nome, sigla e tipo (secretaria, departamento, setor).",
      "Se a unidade estiver subordinada a outra, indique a unidade superior.",
      "Informe o endereço quando a unidade tiver sede própria: ele é usado como ponto de referência no mapa.",
    ],
    [
      { label: "Nome e sigla", description: "Identificação usada em telas, filtros e relatórios.", tags: REQ },
      { label: "Tipo de unidade", description: "Classificação administrativa (secretaria, departamento, diretoria, coordenação e outros).", tags: REQ },
      { label: "Unidade superior", description: "Monta a hierarquia. Deixe em branco apenas nas unidades de primeiro nível.", tags: COND },
      { label: "Responsável", description: "Servidor indicado como responsável pela unidade; escolhido no cadastro de funcionários, não digitado." },
      { label: "Endereço e coordenadas", description: "A localização é buscada pelo endereço; pode ser corrigida manualmente quando não for encontrada.", tags: ["Automático", "Depende de integração"] },
    ],
    [
      "A unidade lotada no bem é que determina quais veículos aparecem nos filtros dependentes dos relatórios.",
      "Unidades com bens, pessoas ou lançamentos vinculados não devem ser excluídas: ajuste os vínculos antes.",
    ],
  ),

  "/condutores": t(
    "Condutores / Motoristas",
    "Cadastro dos condutores autorizados, com habilitação, categoria, validade e situação.",
    [
      "Cadastre o condutor com nome e documento.",
      "Informe número, categoria e validade da habilitação.",
      "Mantenha a situação atualizada.",
    ],
    [
      { label: "Pessoa", description: "Selecione o servidor já cadastrado em Funcionários; nome, matrícula e unidade vêm desse cadastro e não são digitados aqui.", tags: ["Obrigatório", "Automático"] },
      { label: "Número e categoria da habilitação", description: "Informe conforme o documento. A categoria precisa ser compatível com o bem que o condutor vai conduzir.", tags: REQ },
      { label: "Validade da habilitação", description: "Gera aviso antes do vencimento; habilitação vencida bloqueia novas utilizações.", tags: REQ },
      { label: "Vínculo", description: "Efetivo, comissionado, contratado, terceirizado ou outro; usado em relatórios e na conferência de responsabilidade.", tags: REQ },
      { label: "Situação", description: "Somente condutores ativos aparecem nas listas de utilização, diárias e indicação de multa.", tags: REQ },
    ],
    [
      "O condutor precisa existir antes no cadastro de pessoas: esta tela apenas acrescenta os dados de habilitação.",
      "O histórico de utilização do condutor alimenta a sugestão de condutor nas multas e o filtro Condutor → Veículo nos relatórios.",
    ],
  ),

  "/entidades-externas": t(
    "Pessoas e empresas externas",
    "Cadastro único de quem não é servidor do órgão: empresas fornecedoras, oficinas, postos, órgãos parceiros, consórcios e pessoas físicas externas. Todas as demais telas selecionam a partir daqui.",
    [
      "Escolha se é pessoa física ou jurídica e informe CPF/CNPJ, nome ou razão social.",
      "Marque as categorias de atuação (combustível, manutenção, peças, higienização, locação e outras): elas definem onde a empresa poderá ser selecionada.",
      "Preencha o endereço completo e salve.",
    ],
    [
      { label: "Tipo de pessoa", description: "Física ou jurídica; define se o documento é CPF ou CNPJ.", tags: REQ },
      { label: "CPF / CNPJ", description: "Identificação única no órgão; impede cadastro duplicado.", tags: REQ },
      { label: "Nome / razão social e nome fantasia", description: "Nome oficial usado em contratos e documentos; o fantasia é opcional e ajuda na busca.", tags: REQ },
      { label: "Categorias de atuação", description: "Determinam em quais telas a empresa aparece (contratos, cotações, ordens de serviço, abastecimento, limpeza).", tags: REQ },
      { label: "Endereço e coordenadas", description: "A posição no mapa é buscada pelo endereço; se não for encontrada, informe latitude e longitude manualmente.", tags: ["Automático", "Depende de integração"] },
      { label: "Situação", description: "Empresas inativas deixam de aparecer nas listas de seleção, mas permanecem no histórico." },
    ],
    [
      "Não digite nomes de empresas soltos em outras telas: cadastre aqui uma vez e selecione onde for necessário.",
      "Empresas com contrato vigente de combustível, manutenção ou higienização aparecem automaticamente no Mapa da rede.",
      "Cada órgão enxerga apenas o próprio cadastro.",
    ],
  ),

  "/funcionarios": t(
    "Funcionários",
    "Cadastro das pessoas do próprio órgão. É a fonte usada para escolher solicitante, responsável, fiscal de contrato, condutor, beneficiário de diária e autorizador nas demais telas.",
    [
      "Clique em Novo e informe nome, CPF e matrícula.",
      "Indique a unidade de lotação, o cargo e a função (por exemplo, fiscal de contrato ou gestor de frota).",
      "Mantenha a situação atualizada quando a pessoa mudar de lotação ou deixar o órgão.",
    ],
    [
      { label: "Nome e CPF", description: "Identificação da pessoa; o CPF impede duplicidade de cadastro.", tags: REQ },
      { label: "Matrícula", description: "Registro funcional usado nos documentos e nas conferências." },
      { label: "Unidade de lotação", description: "Escolhida em Secretarias/Unidades. É essa lotação que sugere automaticamente a unidade solicitante nas manutenções e reservas.", tags: REQ },
      { label: "Cargo e função", description: "A função identifica papéis operacionais (fiscal, gestor, almoxarife) e orienta a seleção nas telas correspondentes.", tags: COND },
      { label: "Situação", description: "Somente pessoas ativas aparecem nas listas de seleção; inativos permanecem no histórico.", tags: REQ },
    ],
    [
      "Nomes nunca devem ser digitados livremente em contratos, diárias ou manutenções: selecione a pessoa cadastrada aqui.",
      "Para que a pessoa possa conduzir veículos, cadastre-a também em Condutores, com habilitação e validade.",
      "Acesso ao sistema é concedido separadamente em Usuários e permissões.",
    ],
  ),

  "/usuarios": t(
    "Usuários e permissões",
    "Gestão dos usuários do órgão e dos perfis de acesso que determinam o que cada pessoa pode ver e fazer.",
    [
      "Cadastre o usuário com nome e e-mail institucional.",
      "Atribua o perfil de acesso adequado.",
      "Desative o acesso quando o servidor deixar a função.",
    ],
    [
      { label: "E-mail institucional", description: "É o login da pessoa e o endereço usado para recuperar senha. Não pode se repetir.", tags: REQ },
      { label: "Funcionário vinculado", description: "Associe o acesso à pessoa já cadastrada em Funcionários, para que os registros fiquem identificados.", tags: COND },
      { label: "Perfil de acesso", description: "Define o que a pessoa pode ver e fazer: administrador do órgão, gestor de frota, gestor de unidade, operador ou auditor.", tags: REQ },
      { label: "Situação", description: "Usuários inativos continuam no histórico, mas não conseguem entrar no sistema." },
    ],
    [
      "Conceda o menor perfil necessário: operador registra o dia a dia, auditor apenas consulta.",
      "O usuário só enxerga dados do órgão em que foi cadastrado.",
      "Criação, alteração de perfil e desativação ficam registradas para auditoria.",
    ]
  ),

  "/migracao": t(
    "Migração de dados",
    "Importa cadastros e lançamentos a partir de planilhas, com validação prévia antes da gravação.",
    [
      "Baixe o modelo da planilha do conjunto desejado.",
      "Envie o arquivo preenchido.",
      "Confira os erros apontados, corrija e confirme a importação.",
    ],
    [
      { label: "Arquivo", description: "Planilha no modelo disponibilizado.", tags: REQ },
      { label: "Validação", description: "Linhas com erro são apontadas e não são gravadas.", tags: AUTO },
    ],
    ["A importação só grava depois da confirmação; nada é alterado durante a conferência."],
  ),

  "/exportacao": t(
    "Exportar dados",
    "Gera um pacote completo com todos os dados do órgão, para migração, auditoria ou uso em outros sistemas.",
    [
      "Clique em Exportar todos os dados.",
      "Aguarde a geração e acompanhe o progresso.",
      "Baixe o arquivo compactado gerado.",
    ],
    [
      { label: "Resumo do pacote", description: "Lista os conjuntos de dados e a quantidade de registros que serão incluídos.", tags: AUTO },
      { label: "Progresso", description: "Acompanha a geração; em bases grandes o processo pode levar alguns minutos.", tags: AUTO },
      { label: "Arquivo final", description: "Pacote compactado com planilhas, versão em formato de dados e documento de conferência.", tags: AUTO },
    ],
    [
      "A exportação traz apenas dados do órgão em que você está conectado.",
      "Senhas, chaves, certificados e credenciais nunca são incluídos no pacote.",
      "O acesso é restrito aos perfis de administração e auditoria; cada tentativa fica registrada.",
    ],
  ),

  "/inteligencia": t(
    "Inteligência da frota",
    "Analisa consumo, custo por quilômetro, custo total de propriedade, economicidade e disponibilidade dos bens.",
    [
      "Escolha o período e os filtros de análise.",
      "Compare bens, unidades ou tipos de frota.",
      "Use os apontamentos para decidir sobre renovação ou realocação.",
    ],
    [
      { label: "Consumo médio", description: "Calculado com base nos abastecimentos e nas marcações do medidor.", tags: CALC },
      { label: "Custo por km/hora", description: "Custos do período divididos pela distância ou horas registradas.", tags: CALC },
      { label: "Parâmetros de referência", description: "Definem o que é considerado consumo fora do padrão." },
    ],
    ["Bens sem marcação de medidor confiável ficam de fora dos indicadores de consumo."],
  ),

  "/relatorios": t(
    "Relatórios avançados",
    "Conjunto de relatórios gerenciais e operacionais com filtros por período, unidade, bem e tipo de despesa.",
    [
      "Escolha o relatório desejado.",
      "Selecione Ano e Mês para montar o período automaticamente, ou ajuste as datas De/Até manualmente.",
      "Refine por Secretaria/unidade, Veículo, Condutor, Tipo de contrato e Contrato.",
      "Gere e exporte em planilha ou documento.",
    ],
    [
      { label: "Ano e Mês", description: "Preenchem as datas do período; escolha \"Ano inteiro\" para o exercício completo.", tags: AUTO },
      { label: "Período (De/Até)", description: "Recorta os lançamentos considerados; pode ser ajustado após escolher ano e mês.", tags: REQ },
      { label: "Secretaria / unidade", description: "Ao escolher a unidade, a lista de veículos passa a mostrar apenas os bens lotados nela." },
      { label: "Condutor", description: "Ao escolher o condutor, a lista de veículos passa a mostrar apenas os bens que ele efetivamente utilizou no histórico." },
      { label: "Tipo de contrato", description: "Categoria do objeto contratual (combustível, peças, manutenção, higienização, locação, seguro e outros); define quais contratos aparecem no filtro Contrato." },
      { label: "Contrato", description: "Seleciona um contrato específico; os relatórios passam a considerar apenas os consumos e execuções vinculados a ele." },
    ],
    [
      "Quando um filtro superior muda e invalida o filtro já escolhido, o filtro dependente é limpo automaticamente.",
      "Filtros desabilitados não se aplicam ao relatório selecionado.",
      "Relatórios sem resultado indicam ausência de lançamentos no filtro escolhido, não erro do sistema.",
    ],
  ),

  "/sustentabilidade": t(
    "Sustentabilidade da Frota",
    "Estima emissões e eficiência energética da frota a partir do consumo registrado, apoiando metas ambientais.",
    [
      "Escolha o período de apuração.",
      "Confira as emissões estimadas por tipo de combustível.",
      "Compare a evolução entre períodos.",
    ],
    [
      { label: "Emissão estimada", description: "Consumo multiplicado pelo fator de emissão do combustível.", tags: CALC },
      { label: "Fatores de emissão", description: "Valores de referência utilizados no cálculo.", tags: AUTO },
    ],
    ["Os números são estimativas de referência, não medições diretas."],
  ),

  "/transparencia": t(
    "Portal da Transparência",
    "Publica dados abertos da frota para consulta pública, com controle do que é divulgado.",
    [
      "Escolha os conjuntos que devem ficar públicos.",
      "Gere o endereço público de consulta.",
      "Divulgue o endereço no site do órgão.",
    ],
    [
      { label: "Conjuntos publicados", description: "Definem o que aparece na página pública." },
      { label: "Endereço público", description: "Link aberto, sem necessidade de login.", tags: AUTO },
    ],
    ["Dados pessoais sensíveis não são publicados no portal público."],
  ),

  "/integracoes": t(
    "Central de Integrações",
    "Cadastro e monitoramento das integrações externas: tabela de referência de preços, dados oficiais de veículo, login institucional, diretório corporativo e envio de eventos.",
    [
      "Escolha a integração desejada.",
      "Informe os dados de conexão fornecidos pelo provedor.",
      "Use o teste de conexão antes de ativar.",
      "Acompanhe o histórico de chamadas e reenvie eventos que falharam.",
    ],
    [
      { label: "Ambiente", description: "Homologação ou produção.", tags: REQ },
      { label: "Credenciais do provedor", description: "Cadastradas em área protegida; nunca são exibidas novamente nem exportadas.", tags: ["Obrigatório", "Depende de integração"] },
      { label: "Situação da integração", description: "Só fica ativa após teste de conexão bem-sucedido.", tags: AUTO },
    ],
    [
      "Integrações sem credencial do órgão permanecem inativas.",
      "Segredos e certificados não aparecem em telas, relatórios, exportações ou históricos.",
    ],
  ),

  "/chaves-api": t(
    "Chaves de API",
    "Gera e revoga as chaves usadas por outros sistemas do órgão para consultar os dados públicos da frota.",
    [
      "Gere uma chave descrevendo a finalidade.",
      "Copie a chave no momento da criação.",
      "Revogue a chave quando não for mais necessária.",
    ],
    [
      { label: "Descrição/finalidade", description: "Identifica quem usa a chave.", tags: REQ },
      { label: "Chave", description: "Exibida uma única vez, no momento da criação.", tags: AUTO },
    ],
    ["Chaves revogadas param de funcionar imediatamente e não podem ser reativadas."],
  ),

  "/alertas": t(
    "Alertas e inconsistências",
    "Lista as pendências que exigem ação: documentos vencidos, habilitações a vencer, manutenções atrasadas, consumo fora do padrão e lançamentos inconsistentes.",
    [
      "Filtre por tipo de alerta ou gravidade.",
      "Clique no alerta para abrir o registro de origem.",
      "Resolva o cadastro ou lançamento indicado; o alerta some sozinho.",
    ],
    [
      { label: "Tipo de alerta", description: "Documentos, habilitação, manutenção, consumo ou saldo." },
      { label: "Gravidade", description: "Calculada pela proximidade do vencimento ou pelo desvio observado.", tags: CALC },
    ],
    ["Os alertas são recalculados automaticamente; não há como marcar como lido sem resolver a origem."],
  ),

  "/plataforma": t(
    "Administração da Plataforma",
    "Área do administrador da plataforma: órgãos atendidos, homologação de funcionalidades, auditoria de produto e rotinas de manutenção.",
    [
      "Escolha o órgão para acessar o contexto dele.",
      "Use as abas para homologação, auditoria e backups.",
      "Saia do órgão para voltar à visão da plataforma.",
    ],
    [
      { label: "Órgão em contexto", description: "Enquanto houver órgão selecionado, as telas mostram os dados dele.", tags: AUTO },
    ],
    ["Sem órgão em contexto, as ações de cadastro das telas do órgão ficam ocultas."],
  ),

  "/perfil": t(
    "Perfil e segurança",
    "Consulta dos seus dados de acesso e alteração da sua senha.",
    [
      "Confira nome, e-mail e perfil de acesso.",
      "Para trocar a senha, informe a senha atual e a nova duas vezes.",
      "Salve para aplicar a alteração.",
    ],
    [
      { label: "Senha atual", description: "Exigida para confirmar sua identidade.", tags: REQ },
      { label: "Nova senha", description: "Deve ser confirmada de forma idêntica no campo seguinte.", tags: REQ },
    ],
    ["A alteração de perfil de acesso é feita pelo administrador do órgão, não nesta tela."],
  ),

  "/veiculo": t(
    "Ficha do bem",
    "Visão completa de um veículo ou equipamento: dados cadastrais, documentos, custos, consumo, manutenções e ocorrências.",
    [
      "Use as abas para navegar entre os blocos de informação.",
      "Edite os dados cadastrais quando autorizado.",
      "Consulte o histórico para instruir processos e auditorias.",
    ],
    [
      { label: "Valor de mercado", description: "Referencial obtido da tabela de preços quando o bem estiver vinculado.", tags: ["Automático", "Depende de integração"] },
      { label: "Custos acumulados", description: "Somatório dos lançamentos do bem.", tags: CALC },
    ],
    ["Campos de identificação ficam protegidos depois que o bem tem movimentação registrada."],
  ),
};

/** Localiza a ajuda da rota atual, aceitando rotas com parâmetros (ex.: /veiculo/123). */
export function getHelpTopic(pathname: string): HelpTopic | null {
  if (HELP_TOPICS[pathname]) return HELP_TOPICS[pathname];
  const segments = pathname.split("/").filter(Boolean);
  while (segments.length > 0) {
    const candidate = `/${segments.join("/")}`;
    if (HELP_TOPICS[candidate]) return HELP_TOPICS[candidate];
    segments.pop();
  }
  return null;
}

export const HELP_TOPIC_COUNT = Object.keys(HELP_TOPICS).length;
