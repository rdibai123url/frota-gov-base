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
      { label: "Tipo de equipamento", description: "Classificação usada em relatórios e planos de manutenção.", tags: REQ },
      { label: "Horímetro", description: "Marcação de horas trabalhadas; base do consumo por hora.", tags: COND },
    ],
    ["Bens sem placa exigem patrimônio; bens com placa devem ser cadastrados em Veículos."],
  ),

  "/utilizacao": t(
    "Utilização e reservas",
    "Registra a saída e o retorno dos bens, com condutor, finalidade, destino e quilometragem, além das reservas programadas.",
    [
      "Clique em Nova utilização e informe o bem e o condutor.",
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
    ],
  ),

  "/diarias": t(
    "Diárias",
    "Controle de diárias de viagem vinculadas a deslocamentos da frota, com valores, período e prestação de contas.",
    [
      "Cadastre a diária informando servidor, destino e período.",
      "Vincule ao uso do veículo quando houver.",
      "Acompanhe a situação até a prestação de contas.",
    ],
    [
      { label: "Servidor", description: "Beneficiário da diária.", tags: REQ },
      { label: "Período", description: "Datas de saída e retorno; base para o número de diárias.", tags: REQ },
      { label: "Valor total", description: "Quantidade de diárias multiplicada pelo valor unitário.", tags: CALC },
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
      { label: "Data e local", description: "Identificação básica da ocorrência.", tags: REQ },
      { label: "Apólice acionada", description: "Aparece quando o veículo possui seguro vigente.", tags: COND },
      { label: "Custo estimado / franquia", description: "Compõe o custo total do bem." },
    ],
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
      { label: "Vigência", description: "Início e fim da cobertura; gera alerta antes do vencimento.", tags: REQ },
      { label: "Franquia", description: "Valor de participação usado no cálculo de custos de sinistro." },
    ],
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
      { label: "Tipo de obrigação", description: "Licenciamento, IPVA, vistoria, certificado, entre outros.", tags: REQ },
      { label: "Vencimento", description: "Base dos alertas de documento vencido ou a vencer.", tags: REQ },
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
      { label: "Tipo de movimentação", description: "Transferência, cessão, incorporação ou baixa.", tags: REQ },
      { label: "Unidade de destino", description: "Passa a responder pelo bem a partir da data informada.", tags: COND },
      { label: "Justificativa", description: "Texto exigido para rastreabilidade e auditoria.", tags: REQ },
    ],
    ["A baixa patrimonial altera a situação do bem e impede novas operações."],
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
      { label: "Bem", description: "Veículo ou equipamento analisado.", tags: REQ },
      { label: "Indicadores de consumo e custo", description: "Calculados com base nos lançamentos do período.", tags: CALC },
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
      { label: "Posto/fornecedor", description: "Limita onde a autorização pode ser utilizada.", tags: COND },
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
      { label: "Autorização", description: "Ao selecionar, os dados do bem e do combustível são preenchidos.", tags: ["Automático", "Condicional"] },
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
      { label: "Tipo de cota", description: "Quantitativa (litros) ou financeira (R$).", tags: REQ },
      { label: "Saldo utilizado", description: "Atualizado a cada autorização e abastecimento.", tags: AUTO },
    ],
    ["Autorizações acima do saldo da cota são bloqueadas."],
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
      { label: "CNPJ", description: "Identificação do fornecedor; validado no formato oficial.", tags: REQ },
      { label: "Endereço", description: "Quanto mais completo, melhor a precisão do mapa.", tags: REQ },
      { label: "Latitude / longitude", description: "Obtidas automaticamente a partir do endereço; podem ser ajustadas manualmente.", tags: ["Automático", "Depende de integração"] },
    ],
    ["Endereços incompletos podem ficar sem posição no mapa até o ajuste manual."],
  ),

  "/manutencoes": t(
    "Manutenções",
    "Registro de manutenções corretivas e preventivas, com serviços, peças, custos, oficina e tempo de indisponibilidade.",
    [
      "Abra uma manutenção informando o bem e o tipo.",
      "Lance serviços, peças e valores.",
      "Encerre a manutenção com a data de conclusão.",
    ],
    [
      { label: "Tipo", description: "Corretiva, preventiva ou preditiva.", tags: REQ },
      { label: "Oficina", description: "Rede credenciada ou fornecedor cadastrado.", tags: COND },
      { label: "Custo total", description: "Soma de serviços e peças lançados.", tags: CALC },
      { label: "Período de indisponibilidade", description: "Diferença entre entrada e saída; alimenta o indicador de disponibilidade da frota.", tags: CALC },
    ],
    ["Enquanto a manutenção estiver aberta, o bem é contabilizado como indisponível."],
  ),

  "/planos-manutencao": t(
    "Planos de manutenção preventiva",
    "Define os intervalos de revisão por quilometragem, horas ou tempo, gerando avisos automáticos de manutenção vencida ou próxima.",
    [
      "Crie o plano e escolha os bens ou o tipo de bem.",
      "Defina o intervalo (km, horas ou meses).",
      "Acompanhe os avisos gerados na tela de Alertas.",
    ],
    [
      { label: "Intervalo", description: "Base do próximo vencimento do plano.", tags: REQ },
      { label: "Próxima revisão", description: "Calculada a partir da última execução e do intervalo.", tags: CALC },
    ],
  ),

  "/limpeza": t(
    "Limpeza da frota",
    "Controle de higienização e lavagem dos bens, com data, tipo de serviço, responsável e custo.",
    [
      "Registre a limpeza informando bem e data.",
      "Informe o tipo de serviço e o custo, quando houver.",
      "Use os filtros para conferir a periodicidade por bem.",
    ],
    [
      { label: "Tipo de serviço", description: "Lavagem simples, completa, higienização ou outro.", tags: REQ },
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
      { label: "Código / descrição", description: "Identificação usada nas ordens de fornecimento e no estoque.", tags: REQ },
      { label: "Compatibilidade", description: "Indica quais bens aceitam a peça; pode ser ajustada manualmente." },
    ],
    ["Peças marcadas como incompatíveis geram aviso ao serem incluídas em uma ordem."],
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
      { label: "Itens", description: "Cada item traz quantidade e valor unitário.", tags: REQ },
      { label: "Valor total", description: "Soma de quantidade × valor unitário dos itens.", tags: CALC },
      { label: "Situação", description: "Rascunho, emitida, entregue ou cancelada.", tags: AUTO },
    ],
    ["Ordens entregues não podem mais ser editadas; use cancelamento com justificativa."],
  ),

  "/almoxarifado": t(
    "Almoxarifado",
    "Controle de estoque de peças e insumos: entradas, saídas, reservas, saldos por depósito e inventário.",
    [
      "Cadastre depósitos e saldos iniciais.",
      "Registre entradas e saídas de material.",
      "Use o inventário para conferência periódica.",
    ],
    [
      { label: "Depósito", description: "Local físico do estoque.", tags: REQ },
      { label: "Saldo disponível", description: "Saldo em estoque menos as reservas ativas.", tags: CALC },
      { label: "Movimentação", description: "Entrada, saída, ajuste ou transferência; sempre com justificativa.", tags: REQ },
    ],
    ["Saídas acima do saldo disponível são bloqueadas."],
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
      { label: "Número de série / fogo", description: "Identificação única do pneu.", tags: REQ },
      { label: "Posição", description: "Local de instalação no bem.", tags: COND },
      { label: "Vida útil percorrida", description: "Calculada pela quilometragem do bem enquanto o pneu esteve instalado.", tags: CALC },
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
      { label: "CNPJ e razão social", description: "Identificação do prestador.", tags: REQ },
      { label: "Serviços atendidos", description: "Usados para filtrar a oficina em cotações e ordens de serviço." },
      { label: "Localização", description: "Obtida do endereço; ajustável manualmente.", tags: ["Automático", "Depende de integração"] },
    ],
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
      "Ajuste o zoom para comparar a cobertura por região.",
    ],
    [
      { label: "Filtro por tipo", description: "Postos, oficinas ou credenciados." },
      { label: "Pontos no mapa", description: "Exibidos apenas para cadastros com localização obtida ou informada.", tags: ["Automático", "Depende de integração"] },
    ],
    ["Cadastros sem endereço válido não aparecem no mapa."],
  ),

  "/cotacoes": t(
    "Cotações",
    "Coleta e compara propostas de serviços e peças junto à rede credenciada antes da contratação, inclusive com convite por e-mail para empresas cadastradas ou não.",
    [
      "Abra a cotação descrevendo o serviço ou item e cadastre os itens solicitados: ao digitar a descrição, o sistema sugere itens já usados pelo próprio órgão — clique numa sugestão para preencher descrição e unidade, ou continue digitando para cadastrar um item novo.",
      "Na aba Convites, clique em “Enviar convites”, busque empresas por nome, CNPJ ou e-mail e acrescente e-mails avulsos.",
      "Revise a lista final, remova quem não deve receber e confirme o envio: cada empresa recebe uma mensagem individual, sem ver as demais.",
      "Acompanhe a situação de cada convite, reenvie quando necessário ou copie o link para mandar por outro meio.",
      "Compare as propostas recebidas e escolha a vencedora.",
    ],
    [
      { label: "Objeto da cotação", description: "Descrição do serviço ou peça solicitada.", tags: REQ },
      { label: "Prazo limite", description: "Data final para resposta; também define a validade do link do convite.", tags: REQ },
      { label: "Convites", description: "Empresas cadastradas e e-mails avulsos convidados a propor.", tags: COND },
      { label: "Situação do convite", description: "Pendente (criado, ainda sem envio), Enviado, Erro no envio, Respondido e Prazo expirado.", tags: AUTO },
      { label: "Histórico do convite", description: "Criação, envio, reenvios, número de tentativas, último erro e data da resposta.", tags: AUTO },
      { label: "Envio de e-mail", description: "Servidor SMTP do órgão ou provedor de envio; sem configuração o sistema avisa e oferece o link para envio manual.", tags: EXT },
      { label: "Propostas", description: "Valores informados por cada prestador convidado." },
      { label: "Menor valor", description: "Destacado automaticamente na comparação.", tags: CALC },
    ],
    [
      "A escolha de proposta que não seja a de menor valor exige justificativa.",
      "Cada convite tem link próprio, que expira no prazo da cotação e não exige login do fornecedor.",
      "Reenviar ou copiar o link gera um endereço novo: o anterior deixa de funcionar.",
      "Quando o fornecedor responde, o convite passa a “Respondido” e a proposta fica vinculada à empresa; e-mail avulso que coincidir com empresa cadastrada é vinculado sem perder o histórico.",
      "Sem provedor de e-mail configurado, o envio é bloqueado e o sistema não registra falso envio — use “Copiar link”.",
      "Somente quem administra a frota pode convidar ou reenviar; a configuração do provedor é restrita à administração do órgão.",
    ],
  ),


  "/ordens-servico": t(
    "Ordens de Serviço",
    "Autoriza e acompanha a execução de serviços na rede credenciada, do orçamento aprovado até a entrega e o pagamento.",
    [
      "Gere a ordem a partir da cotação aprovada ou diretamente.",
      "Acompanhe a execução pelo prestador.",
      "Registre a conclusão e o valor final.",
    ],
    [
      { label: "Prestador", description: "Oficina ou credenciado responsável.", tags: REQ },
      { label: "Itens e serviços", description: "Base do valor da ordem.", tags: REQ },
      { label: "Valor total", description: "Soma dos itens autorizados.", tags: CALC },
    ],
    ["Ordens concluídas ficam bloqueadas para edição e geram lançamento de custo no bem."],
  ),

  "/contratos": t(
    "Contratos",
    "Cadastro dos contratos de fornecimento e serviços, com itens, quantidades, preços e saldos consumidos.",
    [
      "Cadastre o contrato com fornecedor, vigência e valor.",
      "Inclua os itens contratados com quantidade e preço unitário.",
      "Acompanhe o saldo conforme as autorizações e ordens forem emitidas.",
    ],
    [
      { label: "Vigência", description: "Fora da vigência o contrato não pode ser utilizado.", tags: REQ },
      { label: "Itens", description: "Cada item tem quantidade e preço unitário; o total é calculado.", tags: CALC },
      { label: "Saldo do item", description: "Quantidade contratada menos consumida e reservada.", tags: CALC },
    ],
    ["Contratos vencidos ou sem saldo bloqueiam a emissão de novas autorizações."],
  ),

  "/empenhos": t(
    "Empenhos",
    "Controle dos empenhos orçamentários vinculados aos contratos, com valores empenhados, reservados e liquidados.",
    [
      "Cadastre o empenho com número, data e valor.",
      "Vincule ao contrato correspondente.",
      "Acompanhe o consumo do saldo empenhado.",
    ],
    [
      { label: "Número do empenho", description: "Identificação orçamentária oficial.", tags: REQ },
      { label: "Saldo disponível", description: "Valor empenhado menos reservado e liquidado.", tags: CALC },
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
      { label: "Tipo de cota", description: "Quantitativa (litros) ou financeira (R$).", tags: REQ },
      { label: "Saldo restante", description: "Limite menos consumo e reservas em aberto.", tags: CALC },
    ],
  ),

  "/centros-custo": t(
    "Centros de custo",
    "Estrutura de rateio das despesas da frota, permitindo apurar custos por área, programa ou projeto.",
    [
      "Cadastre o centro de custo com código e nome.",
      "Vincule unidades e bens.",
      "Use nos relatórios para apurar custos por área.",
    ],
    [
      { label: "Código", description: "Identificação usada nos relatórios e exportações.", tags: REQ },
    ],
  ),

  "/orgao": t(
    "Dados do Órgão",
    "Identificação institucional usada em documentos, relatórios, portal da transparência e cabeçalho do sistema.",
    [
      "Preencha razão social, CNPJ e endereço.",
      "Envie o brasão do órgão.",
      "Salve: os dados passam a aparecer nos documentos emitidos.",
    ],
    [
      { label: "Razão social e CNPJ", description: "Identificação oficial do órgão.", tags: REQ },
      { label: "Brasão", description: "Imagem exibida no cabeçalho e nos relatórios." },
    ],
  ),

  "/unidades": t(
    "Secretarias / Unidades",
    "Estrutura administrativa do órgão: secretarias, departamentos e unidades responsáveis pelos bens.",
    [
      "Cadastre a unidade com nome e responsável.",
      "Informe o endereço quando houver atendimento presencial.",
      "Vincule bens e condutores à unidade.",
    ],
    [
      { label: "Nome da unidade", description: "Aparece nos relatórios e no rateio de custos.", tags: REQ },
      { label: "Unidade superior", description: "Permite montar a hierarquia administrativa.", tags: COND },
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
      { label: "Habilitação e validade", description: "Habilitação vencida gera alerta e pode bloquear o uso do veículo.", tags: REQ },
      { label: "Categoria", description: "Deve ser compatível com o veículo dirigido.", tags: REQ },
      { label: "Situação", description: "Somente condutores ativos aparecem nas telas de utilização.", tags: REQ },
    ],
  ),

  "/entidades-externas": t(
    "Entidades externas",
    "Cadastro de órgãos, consórcios e entidades parceiras envolvidas em cessões, convênios e compartilhamento de frota.",
    [
      "Cadastre a entidade com CNPJ e endereço.",
      "Indique o tipo de vínculo.",
      "Use nas movimentações patrimoniais e cessões.",
    ],
    [
      { label: "Tipo de vínculo", description: "Convênio, cessão, consórcio ou outro.", tags: REQ },
      { label: "Localização", description: "Obtida do endereço informado.", tags: AUTO },
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
      { label: "E-mail", description: "Usado para acesso e recuperação de senha.", tags: REQ },
      { label: "Perfil de acesso", description: "Define as telas e ações permitidas.", tags: REQ },
      { label: "Situação", description: "Usuários inativos não conseguem acessar o sistema." },
    ],
    ["Alterações de perfil ficam registradas para auditoria."],
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
      { label: "Resumo do pacote", description: "Mostra os conjuntos e a quantidade de registros incluídos.", tags: AUTO },
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
      "Aplique os filtros de período e abrangência.",
      "Gere e exporte em planilha ou documento.",
    ],
    [
      { label: "Período", description: "Recorta os lançamentos considerados.", tags: REQ },
      { label: "Filtros de abrangência", description: "Unidade, centro de custo, bem ou fornecedor." },
    ],
    ["Relatórios sem resultado indicam ausência de lançamentos no filtro escolhido, não erro do sistema."],
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
