/**
 * Ajuda contextual do Dibai Fleet.
 *
 * Estrutura única e centralizada com o conteúdo do botão "i" exibido ao lado do
 * título de cada página. Nenhum texto de ajuda deve ser duplicado nas telas:
 * para manter ou corrigir a orientação de uma página, edite apenas este arquivo.
 *
 * Regra editorial: linguagem administrativa simples, sem detalhes técnicos
 * internos, sem nomes de tabelas, sem segredos, credenciais ou consultas.
 */

export type FieldTag = "Obrigatório" | "Automático" | "Calculado" | "Condicional";

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

export const HELP_TOPICS: Record<string, HelpTopic> = {
  "/condutores": t(
    "Condutores / Motoristas",
    "Cadastro dos motoristas autorizados a dirigir, com habilitação (CNH), validade e situação. Também registra os afastamentos (férias, licença, INSS e atestado).",
    [
      "Clique em “Novo condutor” e preencha nome, CPF, secretaria, vínculo e os dados da CNH.",
      "Informe a categoria e a validade da CNH: o sistema avisa antes de vencer e bloqueia o condutor com CNH vencida.",
      "Se o motorista for usar o sistema pelo celular, escolha o “Usuário do sistema” dele.",
      "Quando um motorista se afastar, clique no ícone de calendário da linha, escolha o motivo e informe a previsão de retorno.",
    ],
    [
      { label: "Nome e CPF", description: "Identificação do motorista.", tags: REQ },
      {
        label: "Categoria e validade da CNH",
        description:
          "A validade gera aviso antes do vencimento; CNH vencida impede novas viagens e autorizações.",
        tags: REQ,
      },
      {
        label: "Vínculo",
        description: "Efetivo, comissionado, contratado, terceirizado ou outro.",
        tags: REQ,
      },
      {
        label: "Usuário do sistema",
        description:
          "Liga o motorista ao login dele para a Área do motorista. Deixe em branco se ele não acessa o sistema.",
        tags: COND,
      },
      {
        label: "Situação",
        description:
          "Somente condutores ativos aparecem nas listas de viagem, autorização e escala.",
      },
      {
        label: "Afastamento",
        description:
          "Motivo (férias, licença, INSS ou atestado de até 15 dias), data de início e previsão de retorno. Na data de retorno o motorista volta sozinho a ficar disponível.",
      },
    ],
    [
      "Atestado tem no máximo 15 dias e exige a data de retorno.",
      "Motorista afastado não pode ser escolhido em viagens, autorizações de abastecimento nem na escala; o banco também recusa.",
      "Sem previsão de retorno, o motorista continua afastado até você clicar em “Registrar retorno agora”.",
    ],
  ),
  "/perfis-acesso": t(
    "Perfis de acesso",
    "Define quais telas cada perfil e cada usuário pode abrir. Todo usuário novo começa com o acesso do perfil dele; o gestor pode liberar mais ou menos telas para uma pessoa em particular.",
    [
      "Na aba “Por perfil”, marque ou desmarque as telas de cada perfil (gestor de frota, responsável de unidade, operador, fiscal).",
      "Na aba “Por usuário”, escolha a pessoa e ligue ou desligue cada tela só para ela.",
      "O rótulo “ajustado para este usuário” mostra o que foi mudado em relação ao perfil.",
      "Use “Voltar ao acesso do perfil” (ou “Voltar ao padrão”) para desfazer os ajustes.",
    ],
    [
      { label: "Por perfil", description: "Vale para todos que têm aquele perfil." },
      {
        label: "Por usuário",
        description: "Vale só para a pessoa escolhida e tem prioridade sobre o perfil.",
      },
    ],
    [
      "Dashboard, Perfis de acesso, Usuários e Dados do órgão nunca são bloqueados.",
      "Esconder a tela não substitui a segurança do sistema: o que cada perfil pode gravar continua limitado.",
      "Somente o administrador do órgão altera os acessos.",
    ],
  ),
  "/escala": t(
    "Escala de motoristas",
    "Monta, mês a mês, a escala dos motoristas de cada unidade de plantão (ex.: SAMU — unidade X), com os dias de trabalho, o horário de início e a carga horária de 8, 12 ou 24 horas.",
    [
      "Cadastre a unidade de plantão em “Nova unidade de plantão”.",
      "Escolha a unidade e o mês.",
      "Na aba “Montar escala”, escolha o motorista na lista, o horário de início e a carga horária (8, 12 ou 24 horas). O término é calculado.",
      "Marque no calendário os dias em que ele trabalha (ou use os atalhos: dias úteis, fins de semana, dia sim dia não) e clique em Salvar.",
      "Na aba “Escala do mês”, veja todos os motoristas e imprima a escala.",
    ],
    [
      {
        label: "Unidade de plantão",
        description: "Local ou serviço que precisa de motorista em escala.",
        tags: REQ,
      },
      { label: "Horário de início", description: "Hora em que o turno começa.", tags: REQ },
      {
        label: "Carga horária",
        description:
          "8, 12 ou 24 horas. O horário de término é calculado (24 h termina no dia seguinte).",
        tags: REQ,
      },
      {
        label: "Dias de trabalho",
        description:
          "Dias marcados no calendário. Dias em verde já têm turno; dias riscados são de afastamento do motorista.",
        tags: REQ,
      },
    ],
    [
      "O motorista não pode ser escalado em dia de afastamento nem em dois turnos ao mesmo tempo.",
      "Para remover um turno, passe o mouse sobre ele na aba “Escala do mês” e clique.",
    ],
  ),
  "/motorista": t(
    "Área do motorista",
    "Tela simples para quem dirige: mostra as suas viagens autorizadas, permite fazer o checklist do veículo com fotos e leva ao registro de abastecimento e de ocorrência.",
    [
      "Confira se a sua CNH está em dia (o aviso aparece no alto).",
      "Na viagem do dia, faça o checklist de saída antes de sair e o de retorno ao voltar, tirando fotos de qualquer problema.",
      "Use “Registrar abastecimento” depois de abastecer e “Registrar ocorrência” em caso de acidente ou defeito.",
    ],
    [
      {
        label: "Viagem",
        description: "Veículo, trajeto e horário previsto de saída, definidos por quem autorizou.",
        tags: AUTO,
      },
      {
        label: "Checklist",
        description:
          "Lista de itens do veículo. Marque OK ou Com problema; fotos ajudam a comprovar o estado.",
        tags: COND,
      },
    ],
    ["Para aparecer aqui, o seu usuário precisa estar ligado ao seu cadastro em Condutores."],
  ),
  "/painel": t(
    "Dashboard",
    "Mostra, em números e gráficos, como está a frota do órgão: quantos veículos rodam, quanto se gasta, o que está vencendo e o que precisa de atenção.",
    [
      "Escolha o período dos gráficos no alto da tela (3, 6 ou 12 meses).",
      "Use as abas para ver cada assunto: Visão geral, Abastecimento, Manutenção, Financeiro / Contratual e Administrativo / Legal.",
      "Clique no ícone “i” de qualquer número ou gráfico para ler o que ele significa e o que fazer.",
      "Clique em um cartão para abrir a tela com os detalhes.",
    ],
    [
      {
        label: "Cartões com números",
        description: "Resumo do momento; o “i” de cada um explica como o número é calculado.",
        tags: CALC,
      },
      {
        label: "Gráficos",
        description: "Mostram a evolução dos gastos e a divisão por secretaria, veículo e tipo.",
        tags: CALC,
      },
      {
        label: "Período dos gráficos",
        description: "Define quantos meses aparecem nos gráficos de todas as abas.",
      },
    ],
    [
      "Os números refletem apenas os dados do seu órgão.",
      "Não é preciso preencher nada nesta tela.",
    ],
  ),
  "/pneus": t(
    "Controle de pneus",
    "Controla cada pneu da frota: onde está instalado, quantos quilômetros já rodou, com que frequência é trocado e quando está chegando ao fim da vida útil.",
    [
      "Cadastre cada pneu com código, marca, medida e vida útil esperada em km.",
      "Para colocar o pneu no veículo, use “Movimentar” e informe veículo, posição e o km do veículo.",
      "Ao retirar, informe o km e o motivo (desgaste, furo, rodízio etc.). O sistema calcula os km rodados.",
      "No alto da tela, acompanhe as trocas dos últimos 12 meses e os pneus perto do fim.",
    ],
    [
      {
        label: "Código do pneu",
        description: "Número de fogo ou etiqueta; não pode repetir.",
        tags: REQ,
      },
      {
        label: "Vida útil esperada (km)",
        description: "Quantos km o fabricante indica. É a base do aviso de fim de vida.",
        tags: COND,
      },
      {
        label: "KM na instalação / retirada",
        description:
          "Hodômetro do veículo nesses dois momentos; a diferença é o quanto o pneu rodou.",
        tags: COND,
      },
      {
        label: "Posição",
        description: "Onde o pneu está (dianteiro esquerdo, traseiro direito, estepe etc.).",
      },
    ],
    ["O km da retirada não pode ser menor que o da instalação."],
    ["Pneu com 85% ou mais da vida útil aparece em “perto do fim”."],
  ),
  "/sustentabilidade": t(
    "Sustentabilidade da frota",
    "Estima quanto a frota emite de gás de efeito estufa e quanto usa de combustível renovável, para o órgão acompanhar e reduzir o impacto ambiental.",
    [
      "Na aba Painel, escolha o período e veja litros, emissões e evolução mensal.",
      "Na aba Por veículo, escolha um veículo para ver as emissões, o km/L e a comparação com a média da frota.",
      "Na aba Fatores de emissão, confira ou ajuste os fatores de cada combustível.",
    ],
    [
      {
        label: "CO2e estimado",
        description:
          "Litros abastecidos vezes o fator de emissão do combustível. É estimativa, não medição.",
        tags: CALC,
      },
      {
        label: "Fator de emissão",
        description: "Quantos kg de CO2e cada litro produz. Pode ser ajustado pelo órgão.",
        tags: COND,
      },
      {
        label: "Km por litro",
        description: "Consumo do veículo, calculado pelos hodômetros dos abastecimentos.",
        tags: CALC,
      },
    ],
    [
      "Para calcular o km/L e a emissão por 100 km é preciso informar o hodômetro nos abastecimentos.",
    ],
  ),
  "/exportacao": t(
    "Exportar dados",
    "Baixa uma cópia completa dos dados do órgão em um único arquivo e permite conferir se a cópia guardada está inteira.",
    [
      "Clique em “Exportar todos os dados” e aguarde o arquivo ser gerado.",
      "Anote a soma de verificação (SHA-256) mostrada na tela e guarde o arquivo em dois lugares.",
      "Para testar uma cópia antiga, use “Conferir uma cópia já baixada”: escolha o arquivo e, se quiser, cole a soma anotada.",
    ],
    [
      {
        label: "Arquivo .zip",
        description: "Contém planilhas (CSV), arquivos JSON, um manifesto e um LEIA-ME.",
        tags: AUTO,
      },
      {
        label: "Soma de verificação",
        description:
          "Código que muda se o arquivo for alterado; serve para provar que a cópia está intacta.",
        tags: AUTO,
      },
    ],
    [
      "Nenhuma senha, token ou chave é incluída no arquivo.",
      "Recomenda-se baixar e conferir a cópia todo mês.",
    ],
  ),
  "/avisos": t(
    "Avisos de vencimento",
    "Mostra o que está vencido ou perto de vencer (CNH, seguro, contrato, revisão, licenciamento, garantia) e envia um resumo por e-mail, para ninguém perder prazo.",
    [
      "Veja na primeira caixa tudo o que precisa de atenção agora.",
      "Para avisar um motorista, clique em “Avisar” e o WhatsApp abre com a mensagem pronta.",
      "Na segunda caixa, ligue o aviso por e-mail, escreva os e-mails que recebem e escolha a frequência.",
      "Ajuste com quantos dias de antecedência cada tipo de aviso deve aparecer e salve.",
      "Use “Enviar resumo agora” para testar.",
    ],
    [
      {
        label: "E-mails que recebem",
        description: "Um ou mais e-mails, separados por vírgula ou por linha.",
        tags: COND,
      },
      {
        label: "Frequência",
        description: "Toda segunda-feira ou todos os dias. Só envia quando há algo vencendo.",
      },
      {
        label: "Dias de antecedência",
        description: "Quantos dias antes do vencimento o item passa a aparecer.",
      },
    ],
    [
      "O envio por e-mail exige que o e-mail do órgão esteja configurado pelo administrador.",
      "O WhatsApp abre com a mensagem pronta; quem confirma o envio é você.",
    ],
  ),
  "/prestacao-contas": t(
    "Prestação de contas",
    "Gera os dados do exercício em arquivos prontos para o Tribunal de Contas, a controladoria ou a auditoria.",
    [
      "Escolha o exercício (ano).",
      "Clique em “Baixar pacote completo (ZIP)” para receber tudo, ou baixe cada conjunto em CSV, XML ou Excel.",
      "Envie os arquivos ao órgão de controle conforme a orientação dele.",
    ],
    [
      {
        label: "Exercício",
        description: "O ano dos dados. Empenhos usam o ano do empenho; os demais, a data do fato.",
        tags: REQ,
      },
      {
        label: "Conjuntos",
        description: "Bens, abastecimentos, manutenções, contratos, empenhos, multas e sinistros.",
      },
    ],
    [
      "Cada Tribunal de Contas tem seu leiaute; este pacote usa o padrão do Dibai Fleet e pode ser mapeado quando exigido.",
    ],
  ),
  "/rastreamento": t(
    "Rastreamento",
    "Mostra onde estão os veículos com rastreador, quais estão em movimento, parados ou sem sinal, e avisa sobre excesso de velocidade, bateria baixa e saída de áreas permitidas.",
    [
      "Em Rastreadores, vincule cada rastreador a um veículo e entregue o token ao fornecedor do rastreamento.",
      "Em Áreas e limites, defina a velocidade máxima e as áreas permitidas (raio em metros).",
      "Acompanhe o mapa, os alertas e o trajeto de cada veículo.",
    ],
    [
      {
        label: "Token do rastreador",
        description:
          "Senha do rastreador, mostrada uma única vez. Guarde e entregue ao fornecedor.",
        tags: AUTO,
      },
      {
        label: "Velocidade máxima",
        description: "Acima dela o sistema gera um alerta.",
        tags: COND,
      },
      {
        label: "Área permitida",
        description:
          "Círculo com centro (latitude e longitude) e raio. O sistema avisa ao sair ou entrar.",
        tags: COND,
      },
    ],
    ["A tela só existe para órgãos em que o administrador da plataforma ligou o módulo."],
  ),
  "/faturamento": t(
    "Faturamento",
    "Fecha o mês de cada contrato de gerenciamento: reúne abastecimentos, manutenções e lavagens, aplica glosas e taxa de administração e calcula o valor a pagar.",
    [
      "Clique em “Nova fatura”, escolha o contrato e o mês e informe a taxa de administração (pode ser negativa).",
      "Confira os itens; para discordar de um valor, aplique uma glosa com o motivo.",
      "Informe a nota fiscal para marcar como conferida e, depois do pagamento, marque como paga.",
    ],
    [
      {
        label: "Taxa de administração",
        description: "Percentual sobre o valor conferido. Pode ser negativa (desconto).",
        tags: COND,
      },
      { label: "Glosa", description: "Valor não aceito, sempre com motivo.", tags: COND },
      {
        label: "Líquido",
        description: "Valor conferido mais a taxa, menos retenções.",
        tags: CALC,
      },
    ],
    ["Fatura paga não pode ser alterada nem apagada.", "Uma operação só entra em uma fatura."],
  ),
  "/gestao-contrato": t(
    "Gestão do contrato (IMR)",
    "Registra a fiscalização do contrato e acompanha a nota mensal de qualidade do serviço (IMR).",
    [
      "Na aba Ocorrências, registre notificações, advertências e atestos, com prazo e resolução.",
      "Na aba Indicadores, carregue o modelo, ajuste metas e pesos e lance o resultado de cada mês.",
      "Veja a nota final do mês e a faixa (ótimo, bom, regular, insatisfatório).",
      "Na aba Relatório final, imprima o resumo para o atesto.",
    ],
    [
      {
        label: "Meta e peso",
        description: "A meta é o resultado esperado; o peso diz o quanto o indicador vale na nota.",
      },
      {
        label: "Nota do mês",
        description: "De 0 a 10, calculada pelos pesos dos indicadores.",
        tags: CALC,
      },
    ],
    ["Só é usada por órgãos que gerenciam contrato de gerenciamento de frota."],
  ),
  "/regras-manutencao": t(
    "Regras de manutenção",
    "Define os limites do órgão para manutenção: quem aprova até que valor, tempos padrão de serviço, teto do valor da hora de mão de obra, prazos de devolução e regras de lavagem.",
    [
      "Escolha a aba da regra que quer cadastrar.",
      "Preencha os campos e salve; a regra passa a valer nas próximas manutenções.",
    ],
    [
      {
        label: "Alçada",
        description: "Até que valor cada perfil pode aprovar uma ordem de serviço.",
      },
      {
        label: "Tempo padrão",
        description: "Horas normais de um serviço, usadas para conferir o orçamento.",
      },
    ],
    ["Serve para órgãos com regras formais de aprovação."],
  ),
  "/garantias": t(
    "Garantias, preços e regras",
    "Lista peças e serviços que ainda estão na garantia, para o órgão exigir o reparo sem pagar de novo.",
    [
      "Consulte os itens em garantia por veículo.",
      "Se o defeito voltar dentro do prazo, cobre a oficina com base nesta lista.",
    ],
    undefined,
    [
      "A garantia vem da manutenção registrada (dias de garantia) e da garantia de fábrica do veículo.",
    ],
  ),
  "/pesquisa-precos": t(
    "Pesquisa de preços",
    "Mostra quanto o órgão já pagou por uma peça ou serviço, para comparar antes de aprovar novos orçamentos.",
    [
      "Digite o nome da peça ou do serviço.",
      "Compare os valores pagos, as datas e os fornecedores.",
    ],
    undefined,
    ["Os preços vêm dos registros do próprio órgão."],
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
      {
        label: "Renavam / Chassi",
        description: "Identificadores oficiais; usados na consulta de dados oficiais.",
      },
      {
        label: "Marca, modelo e ano",
        description:
          "Podem ser preenchidos automaticamente pela consulta de dados oficiais ou pela tabela de referência de preços.",
      },
      {
        label: "Tipo de medidor",
        description:
          "Define se o veículo é controlado por hodômetro (km), horímetro (horas), ambos ou nenhum.",
        tags: REQ,
      },
      {
        label: "Unidade / Secretaria",
        description: "Lotação responsável pelo bem; determina rateio e relatórios por unidade.",
        tags: REQ,
      },
      {
        label: "Propriedade",
        description:
          "Indica se o bem é próprio, locado, cedido ou de terceiro; campos adicionais aparecem conforme a escolha.",
        tags: COND,
      },
      {
        label: "Situação",
        description:
          "Ativo, em manutenção, baixado ou indisponível; a situação bloqueia certas operações.",
        tags: REQ,
      },
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
      {
        label: "Número de patrimônio",
        description: "Identificação principal quando não existe placa.",
        tags: REQ,
      },
      {
        label: "Tipo de equipamento",
        description: "Classificação usada em relatórios, cotações e planos de manutenção.",
        tags: REQ,
      },
      {
        label: "Unidade de lotação",
        description:
          "Selecionada em Secretarias/Unidades; define responsabilidade e rateio de custo.",
        tags: REQ,
      },
      {
        label: "Tipo de medidor",
        description: "Normalmente horímetro; define se o consumo é apurado por hora trabalhada.",
        tags: REQ,
      },
      {
        label: "Horímetro atual",
        description: "Atualizado automaticamente pelos abastecimentos e utilizações lançados.",
        tags: AUTO,
      },
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
      {
        label: "Condutor",
        description: "Somente condutores ativos e habilitados aparecem na lista.",
        tags: REQ,
      },
      {
        label: "Marcação de saída / retorno",
        description: "Hodômetro ou horímetro conforme o bem.",
        tags: REQ,
      },
      {
        label: "Distância percorrida",
        description: "Diferença entre retorno e saída.",
        tags: CALC,
      },
      {
        label: "Finalidade e destino",
        description: "Justificativa do uso; aparece nos relatórios e na transparência.",
      },
      {
        label: "Calcular rota",
        description:
          "Estima a distância e a duração pela rota rodoviária entre as cidades de origem e destino informadas. Serve para planejar; não substitui a marcação real.",
        tags: COND,
      },
      {
        label: "Ida e volta",
        description: "Marque para dobrar a distância e a duração estimadas do trajeto.",
      },
      {
        label: "Distância só de ida (km)",
        description:
          "Preenchida pelo cálculo da rota. Se o serviço de mapas não responder, digite a distância conhecida.",
        tags: COND,
      },
      {
        label: "Consumo considerado",
        description:
          "Vem da média real de km/l dos abastecimentos do próprio veículo nos últimos 12 meses; sem histórico, usa o parâmetro cadastrado em Inteligência. Não é digitado aqui.",
        tags: AUTO,
      },
      {
        label: "Combustível e custo estimados",
        description:
          "Calculados pela distância total dividida pelo consumo; o custo só aparece quando o preço do litro é informado.",
        tags: CALC,
      },
      {
        label: "Planejado x realizado",
        description:
          "Aparece no detalhe da utilização concluída. Compara a distância planejada com o KM do odômetro e mostra litros, valor e preço médio dos abastecimentos da viagem.",
        tags: CALC,
      },
      {
        label: "Consumo efetivo",
        description:
          "Só é apurado quando há abastecimento de tanque cheio no início e no fim do trecho, ambos com odômetro. Sem essa base, o sistema informa que está indisponível em vez de estimar.",
        tags: COND,
      },
      {
        label: "Vincular abastecimento à viagem",
        description:
          "Lista abastecimentos do mesmo bem no período que ainda não pertencem a nenhuma viagem; o vínculo é validado por órgão, bem e data. O vínculo também pode ser feito na tela de Abastecimentos.",
        tags: COND,
      },
    ],
    [
      "Três números diferentes: KM oficial (odômetro de retorno menos o de saída), litros abastecidos na viagem (o que foi comprado) e consumo efetivo km/l (só com dois tanques cheios com odômetro).",
      "Litros e valor da viagem somam apenas os abastecimentos vinculados àquela utilização.",
      "A marcação de retorno não pode ser menor que a de saída.",
      "Um bem não pode ter duas utilizações abertas ao mesmo tempo.",
      "Só aparecem bens e condutores do próprio órgão; bens em manutenção, cedidos ou baixados não podem ser reservados.",
      "O histórico de utilização alimenta o filtro de veículos por condutor nos relatórios.",
      "A quilometragem oficial vem sempre do odômetro; litros abastecidos não são tratados como litros consumidos.",
    ],
  ),

  "/utilizacao/checklist": t(
    "Checklist de saída e retorno",
    "Registra as condições do veículo antes e depois da utilização. A comparação ajuda a identificar possíveis novas ocorrências sem atribuir culpa.",
    [
      "Na saída, confira cada item antes de iniciar a utilização.",
      "No retorno, repita a conferência durante o fechamento.",
      "Marque Com problema, descreva a ocorrência e anexe fotos quando necessário.",
    ],
    [
      {
        label: "Situação dos itens",
        description: "Escolha OK, Com problema ou Não se aplica para cada item.",
        tags: REQ,
      },
      {
        label: "Odômetro",
        description: "Informe a marcação observada no momento da conferência.",
        tags: COND,
      },
      {
        label: "Fotos",
        description: "Ficam em armazenamento privado do órgão e apoiam a análise de avarias.",
        tags: COND,
      },
      {
        label: "Responsável e data/hora",
        description: "Registrados automaticamente ao salvar.",
        tags: AUTO,
      },
    ],
    [
      "Uma diferença no retorno é apenas uma possível nova ocorrência e deve ser analisada.",
      "Itens com problema podem originar uma solicitação de manutenção com os dados básicos reaproveitados.",
    ],
  ),

  "/disponibilidade": t(
    "Disponibilidade da Frota",
    "Consolida a situação operacional atual de cada veículo ou equipamento a partir dos registros do órgão.",
    [
      "Use os indicadores para filtrar rapidamente.",
      "Refine por unidade, situação, classe ou bem.",
      "Abra o item para tratar a utilização, manutenção, obrigação ou ficha relacionada.",
    ],
    [
      {
        label: "Situação atual",
        description:
          "Calculada a partir da situação cadastral, obrigação vencida, manutenção, uso e reserva; não é digitada nesta tela.",
        tags: CALC,
      },
      {
        label: "Motivo principal",
        description: "Mostra a condição de maior prioridade que determinou a situação.",
        tags: AUTO,
      },
    ],
    [
      "Prioridade: bloqueio ou indisponibilidade cadastral/documental; manutenção; uso; reserva; disponível.",
      "A tela não mostra mapa porque não há localização real dos veículos registrada no sistema.",
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
      {
        label: "Solicitante, beneficiário e autorizador",
        description:
          "Selecionados no cadastro de pessoas do órgão (funcionários e pessoas externas), evitando digitação livre de nomes.",
        tags: REQ,
      },
      {
        label: "Dispositivo legal / norma",
        description:
          "Escolhido no cadastro de dispositivos legais do órgão; há também campo de texto livre para normas não cadastradas.",
        tags: COND,
      },
      {
        label: "Período",
        description: "Datas de saída e retorno; base para o número de diárias.",
        tags: REQ,
      },
      {
        label: "Valor total",
        description: "Quantidade de diárias multiplicada pelo valor unitário.",
        tags: CALC,
      },
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
      {
        label: "Auto de infração",
        description: "Número do documento emitido pelo órgão autuador.",
        tags: REQ,
      },
      {
        label: "Data e hora da infração",
        description: "Usada para identificar o condutor pelo registro de utilização.",
        tags: REQ,
      },
      {
        label: "Condutor indicado",
        description: "Sugerido a partir da utilização do veículo no momento da infração.",
        tags: ["Automático", "Condicional"],
      },
      {
        label: "Prazo de defesa/indicação",
        description: "Gera alertas conforme a proximidade do vencimento.",
        tags: AUTO,
      },
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
      {
        label: "Bem envolvido",
        description: "Veículo ou equipamento da frota do órgão.",
        tags: REQ,
      },
      {
        label: "Data, hora e local",
        description:
          "Usados para identificar o condutor pelo registro de utilização e para instruir o processo.",
        tags: REQ,
      },
      {
        label: "Tipo de ocorrência",
        description:
          "Colisão, tombamento, atropelamento, furto/roubo, incêndio, perda total e outros.",
        tags: REQ,
      },
      {
        label: "Condutor",
        description:
          "Sugerido pela utilização aberta do bem no momento da ocorrência; confirme antes de salvar.",
        tags: ["Automático", "Condicional"],
      },
      {
        label: "Apólice acionada",
        description: "Só aparece quando o bem tem seguro vigente na data da ocorrência.",
        tags: COND,
      },
      {
        label: "Custo estimado e franquia",
        description: "Entram no custo acumulado do bem e nos relatórios de sinistralidade.",
      },
      {
        label: "Situação",
        description:
          "Registrado, em apuração, seguradora acionada, reparo autorizado ou encerrado.",
        tags: REQ,
      },
    ],
    [
      "Enquanto o bem estiver indisponível por sinistro, ele não aparece para reserva ou utilização.",
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
      {
        label: "Seguradora",
        description:
          "Empresa selecionada no cadastro de pessoas e empresas externas; não digite o nome.",
        tags: ["Obrigatório", "Automático"],
      },
      {
        label: "Número da apólice",
        description: "Identificação do contrato de seguro junto à seguradora.",
        tags: REQ,
      },
      {
        label: "Vigência",
        description: "Início e fim da cobertura; o sistema avisa antes do vencimento.",
        tags: REQ,
      },
      {
        label: "Veículos cobertos",
        description:
          "Selecionados na frota do órgão; um mesmo bem não deve ficar em duas apólices vigentes.",
        tags: REQ,
      },
      {
        label: "Prêmio e franquia",
        description:
          "O prêmio entra no custo do bem; a franquia é usada no cálculo do custo do sinistro.",
      },
      {
        label: "Situação",
        description: "Ativa, a vencer, vencida ou cancelada, conforme a vigência.",
        tags: AUTO,
      },
    ],
    ["Ao registrar um sinistro, apenas apólices vigentes do veículo aparecem para acionamento."],
  ),

  "/obrigacoes": t(
    "Obrigações legais",
    "Acompanhamento de licenciamento, IPVA, vistorias, certificados e demais documentos obrigatórios da frota.",
    [
      "Cadastre a obrigação e o vencimento.",
      "Vincule ao bem correspondente.",
      "Registre a quitação ou renovação quando concluída.",
    ],
    [
      {
        label: "Bem",
        description: "Veículo ou equipamento a que o documento se refere.",
        tags: REQ,
      },
      {
        label: "Tipo de obrigação",
        description: "Licenciamento, IPVA, seguro obrigatório, vistoria, certificado e outros.",
        tags: REQ,
      },
      {
        label: "Exercício / competência",
        description:
          "Ano a que o documento se refere; evita confundir renovações de anos diferentes.",
        tags: REQ,
      },
      {
        label: "Vencimento",
        description: "Base dos avisos de documento vencido ou a vencer.",
        tags: REQ,
      },
      {
        label: "Valor e comprovante",
        description: "Preencha ao registrar a quitação; ficam disponíveis para conferência.",
        tags: COND,
      },
      {
        label: "Situação",
        description:
          "Pendente, quitada, vencida, cancelada ou não aplicável, conforme o registro da baixa.",
        tags: AUTO,
      },
    ],
    [
      "Documentos vencidos aparecem em Alertas e podem restringir o uso do bem conforme a política do órgão.",
    ],
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
      {
        label: "Bem",
        description:
          "Veículo ou equipamento movimentado; a situação atual dele é mostrada ao selecionar.",
        tags: REQ,
      },
      {
        label: "Tipo de movimentação",
        description:
          "Remanejamento entre unidades, cessão, locação, fiel depositário, alienação, doação, leilão, furto/roubo, perda total ou baixa.",
        tags: REQ,
      },
      {
        label: "Unidade de origem",
        description: "Preenchida com a lotação atual do bem.",
        tags: AUTO,
      },
      {
        label: "Unidade ou entidade de destino",
        description:
          "Unidade do próprio órgão ou entidade externa já cadastrada, conforme o tipo escolhido.",
        tags: ["Obrigatório", "Condicional"],
      },
      {
        label: "Data e documento",
        description:
          "Data de efeito e número do ato, termo ou processo que autoriza a movimentação.",
        tags: REQ,
      },
      {
        label: "Justificativa",
        description: "Texto exigido para rastreabilidade e auditoria.",
        tags: REQ,
      },
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
      {
        label: "Bem",
        description: "Veículo ou equipamento analisado; a lista traz apenas bens do próprio órgão.",
        tags: REQ,
      },
      {
        label: "Período",
        description: "Recorta a linha do tempo e os totais apresentados.",
        tags: REQ,
      },
      {
        label: "Linha do tempo",
        description:
          "Reúne o que já foi lançado nas outras telas (utilizações, abastecimentos, manutenções, limpezas, multas, sinistros e movimentações). Nada é digitado aqui.",
        tags: AUTO,
      },
      {
        label: "Indicadores de consumo e custo",
        description: "Calculados a partir dos lançamentos do período e das marcações de medidor.",
        tags: CALC,
      },
    ],
    [
      "Esta tela é apenas de consulta: correções devem ser feitas na tela onde o lançamento foi originado.",
      "Períodos sem marcação de medidor confiável ficam sem consumo médio.",
    ],
  ),

  "/autorizacoes": t(
    "Autorizações",
    "Emite a autorização prévia de abastecimento, reservando quantidade ou valor no contrato, empenho e cota antes do consumo.",
    [
      "Clique em Nova autorização e escolha o bem e o combustível.",
      "Informe a quantidade ou o valor autorizado.",
      "Emita a autorização e entregue ao condutor.",
      "Após o abastecimento, registre o consumo real para encerrar a autorização.",
    ],
    [
      { label: "Bem", description: "Veículo ou equipamento que será abastecido.", tags: REQ },
      {
        label: "Combustível/produto",
        description: "Deve estar previsto no contrato vigente.",
        tags: REQ,
      },
      {
        label: "Quantidade ou valor autorizado",
        description: "Reservado imediatamente no contrato, no empenho e na cota.",
        tags: REQ,
      },
      {
        label: "Saldo disponível",
        description: "Mostra o quanto ainda pode ser reservado.",
        tags: CALC,
      },
      {
        label: "Posto/fornecedor",
        description:
          "Limita onde a autorização pode ser utilizada; deve pertencer ao contrato do próprio órgão.",
        tags: COND,
      },
      {
        label: "Contrato e item",
        description:
          "A autorização nasce vinculada ao item do contrato; o preço utilizado é sempre o do item contratual.",
        tags: ["Automático", "Obrigatório"],
      },
    ],
    [
      "A autorização não é emitida se não houver saldo suficiente de contrato, empenho ou cota.",
      "A reserva fica bloqueada até o abastecimento ser lançado ou a autorização ser cancelada.",
      "A diferença entre o autorizado e o consumido volta automaticamente ao saldo.",
    ],
    [
      "Autorizado 50 litros, abastecidos 40: os 10 litros restantes retornam ao saldo assim que o abastecimento é registrado.",
    ],
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
      {
        label: "Autorização",
        description:
          "Ao selecionar, os dados do bem, do combustível, do contrato e do item são preenchidos automaticamente.",
        tags: ["Automático", "Condicional"],
      },
      {
        label: "Quantidade abastecida",
        description: "Consumo real; não pode ultrapassar o autorizado.",
        tags: REQ,
      },
      {
        label: "Valor total",
        description: "Quantidade multiplicada pelo valor unitário.",
        tags: CALC,
      },
      { label: "Marcação do medidor", description: "Base do cálculo de consumo médio.", tags: REQ },
      {
        label: "Encerra a autorização",
        description: "Quando marcado, devolve o saldo não utilizado.",
        tags: AUTO,
      },
      {
        label: "Tanque cheio",
        description:
          "Marque quando o abastecimento completou efetivamente o tanque. Essa marcação é o que permite calcular o consumo efetivo em km/l entre dois abastecimentos completos.",
      },
      {
        label: "Viagem / utilização",
        description:
          "Vincula o abastecimento a uma viagem do mesmo bem no período. O sistema apenas sugere quando há uma única viagem compatível; a confirmação é sua.",
        tags: COND,
      },
    ],
    [
      "A marcação informada deve ser maior ou igual à última registrada para o bem.",
      "Abastecimentos de lubrificantes e aditivos não entram no cálculo de consumo médio.",
      "Quilometragem oficial vem do odômetro; litros abastecidos são o que foi comprado, não o que foi consumido.",
      "Sem duas marcações de tanque cheio com odômetro, o km/l efetivo fica indisponível — isso é apenas informação, não impede o registro nem gera inconsistência.",
    ],
  ),

  "/combustiveis": t(
    "Combustíveis",
    "Cadastro dos produtos abastecíveis e insumos automotivos usados nas autorizações, contratos e relatórios.",
    [
      "Cadastre o produto com nome e unidade de medida.",
      "Indique se ele entra no cálculo de consumo.",
      "Vincule aos itens de contrato no módulo de Contratos.",
    ],
    [
      {
        label: "Unidade de medida",
        description: "Litro, quilo, hora ou unidade, conforme o produto.",
        tags: REQ,
      },
      {
        label: "Entra no consumo",
        description: "Define se o produto é considerado nos indicadores de km/l.",
      },
      {
        label: "Uso em contrato",
        description:
          "O produto só pode ser autorizado quando houver item de contrato vigente do próprio órgão que o contemple.",
        tags: COND,
      },
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
      {
        label: "Servidor",
        description: "Escolhido no cadastro de funcionários do órgão; não digite o nome.",
        tags: ["Obrigatório", "Automático"],
      },
      {
        label: "Tipo de cota",
        description: "Quantitativa (litros) ou financeira (R$).",
        tags: REQ,
      },
      {
        label: "Periodicidade",
        description: "Semanal ou mensal; define quando o limite é renovado.",
        tags: REQ,
      },
      {
        label: "Saldo utilizado",
        description: "Atualizado a cada autorização emitida e abastecimento lançado.",
        tags: AUTO,
      },
      {
        label: "Situação",
        description: "Somente cotas ativas são consideradas na emissão de autorizações.",
      },
    ],
    [
      "Autorização acima do saldo da cota do servidor é bloqueada.",
      "A cota de servidor é somada às demais travas: contrato, empenho e cota da unidade continuam valendo.",
    ],
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
      {
        label: "CNPJ e razão social",
        description:
          "Identificação oficial do posto ou fornecedor; o CNPJ evita cadastro duplicado.",
        tags: REQ,
      },
      {
        label: "Endereço completo",
        description:
          "Logradouro, bairro, município e UF. Quanto mais completo, maior a chance de o mapa localizar o ponto.",
        tags: REQ,
      },
      {
        label: "Latitude / longitude",
        description:
          "Buscadas automaticamente pelo endereço; corrija manualmente quando o endereço não for localizado. O sistema nunca estima coordenadas.",
        tags: AUTO,
      },
      {
        label: "Situação",
        description:
          "Fornecedores inativos deixam de aparecer nas autorizações e nos contratos novos.",
      },
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
      'Ao registrar, escolha entre "Usar solicitação existente" (que preenche automaticamente os dados já informados) e "Registrar manutenção sem solicitação prévia".',
      "Escolha a origem: por contrato (com oficina contratada, contrato e item de mão de obra) ou fora de contrato.",
      "Lance as peças substituídas/utilizadas e encerre a manutenção com a data de conclusão.",
    ],
    [
      {
        label: "Unidade solicitante",
        description:
          "Sugerida a partir da unidade do funcionário solicitante; pode ser ajustada por quem tem permissão.",
        tags: ["Automático", "Obrigatório"],
      },
      { label: "Tipo", description: "Corretiva ou preventiva.", tags: REQ },
      {
        label: "Plano preventivo",
        description: "Lista apenas os planos cadastrados para o bem selecionado.",
        tags: COND,
      },
      {
        label: "Oficina e contrato",
        description:
          "Na origem por contrato, a oficina contratada e o contrato vigente definem os itens disponíveis.",
        tags: COND,
      },
      {
        label: "Valor unitário",
        description:
          "Vem do item contratual e fica bloqueado para edição; o total é quantidade × valor unitário.",
        tags: ["Automático", "Calculado"],
      },
      {
        label: "Peças substituídas/utilizadas",
        description:
          "Selecionadas entre os itens do contrato, com nº do item, descrição, referência, unidade, saldo disponível e valor unitário.",
        tags: COND,
      },
      { label: "Custo total", description: "Soma de serviços e peças lançados.", tags: CALC },
      {
        label: "Período de indisponibilidade",
        description:
          "Diferença entre entrada e saída; alimenta o indicador de disponibilidade da frota.",
        tags: CALC,
      },
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
      {
        label: "Funcionário solicitante",
        description: "Escolhido no cadastro de funcionários; não digite o nome.",
        tags: ["Obrigatório", "Automático"],
      },
      {
        label: "Unidade solicitante",
        description: "Sugerida pela lotação do solicitante; só quem tem permissão pode trocar.",
        tags: ["Automático", "Obrigatório"],
      },
      {
        label: "Bem",
        description: "Veículo ou equipamento do próprio órgão que precisa do serviço.",
        tags: REQ,
      },
      {
        label: "Descrição",
        description:
          "Relato objetivo do defeito ou do serviço pedido; orienta a oficina e a cotação.",
        tags: REQ,
      },
      {
        label: "Prioridade",
        description: "Baixa, normal, alta ou urgente; organiza a fila de atendimento.",
      },
      {
        label: "Situação",
        description: "Aberta, em análise, aprovada, em manutenção, concluída ou cancelada.",
        tags: AUTO,
      },
    ],
    [
      "Ao registrar a manutenção usando a solicitação, bem, unidade, tipo e descrição já vêm preenchidos.",
      "Uma solicitação concluída não volta a ficar aberta: registre nova solicitação se o problema retornar.",
    ],
  ),

  "/planos-manutencao": t(
    "Planos preventivos",
    "Define os intervalos de revisão por quilometragem, horas ou tempo, gerando avisos automáticos de manutenção vencida ou próxima.",
    [
      "Crie o plano e escolha os bens ou o tipo de bem.",
      "Defina o intervalo (km, horas ou meses).",
      "No campo Tipo de serviço, use o botão + para cadastrar um novo tipo sem sair da tela.",
      "Acompanhe os avisos gerados na tela de Alertas.",
    ],
    [
      {
        label: "Tipo de serviço",
        description: "Escolhido da lista do órgão; o botão + cria o tipo e já o deixa selecionado.",
        tags: REQ,
      },
      { label: "Intervalo", description: "Base do próximo vencimento do plano.", tags: REQ },
      {
        label: "Próxima revisão",
        description:
          "Calculada a partir da última execução e do intervalo, atualizada quando uma manutenção do plano é concluída.",
        tags: CALC,
      },
    ],
  ),

  "/limpeza": t(
    "Limpeza da frota",
    "Controle de higienização e lavagem dos bens, com data, tipo de serviço, responsável e custo.",
    [
      "Registre a limpeza informando bem e data.",
      "Informe o tipo de serviço e o custo, quando houver.",
      'Use "Imprimir / Gerar PDF" para emitir a solicitação institucional a ser apresentada no estabelecimento.',
      "Use os filtros para conferir a periodicidade por bem.",
    ],
    [
      {
        label: "Tipo de serviço",
        description: "Lavagem simples, completa, higienização ou outro.",
        tags: REQ,
      },
      {
        label: "Imprimir / Gerar PDF",
        description:
          "Documento com brasão e dados do órgão, código, bem, tipo de limpeza, prestador quando definido, solicitante, data e observações.",
        tags: AUTO,
      },
    ],
  ),

  "/rede-credenciada": t(
    "Oficinas e fornecedores",
    "Para que serve: reúne as oficinas e prestadores cadastrados pelo próprio órgão, com serviços atendidos, endereço e posição no mapa. O Dibai Fleet não disponibiliza prestadores; nada aqui é compartilhado com outros órgãos.",
    [
      "Cadastre a oficina do seu órgão com CNPJ e endereço.",
      "Indique os serviços atendidos.",
      "Salve: a posição no mapa é obtida automaticamente pelo endereço.",
    ],
    [
      {
        label: "CNPJ e razão social",
        description: "Identificação oficial do prestador; evita duplicidade no cadastro.",
        tags: REQ,
      },
      {
        label: "Serviços atendidos",
        description:
          "Especialidades da oficina; filtram onde ela aparece em cotações, ordens de serviço e manutenções do próprio órgão.",
      },
      {
        label: "Endereço e localização",
        description:
          "A posição no mapa vem do endereço; pode ser corrigida manualmente quando não localizada.",
        tags: AUTO,
      },
      {
        label: "Situação",
        description:
          "Em análise, ativo, suspenso ou inativo. Somente oficinas ativas podem receber ordem de serviço.",
      },
    ],
    [
      "Para execução por contrato, a oficina também precisa constar como contratada no contrato vigente.",
    ],
  ),

  "/mapa-rede": t(
    "Mapa dos prestadores do órgão",
    "Para que serve: visualiza no mapa somente os postos, oficinas e prestadores cadastrados pelo próprio órgão, apoiando o planejamento de rotas e a cobertura por região.",
    [
      "Use os filtros por tipo de estabelecimento e situação.",
      "Clique em um ponto para ver os dados do estabelecimento.",
      "Para cadastros sem localização, use a busca de coordenadas ou informe latitude e longitude manualmente.",
      "Ajuste o zoom para comparar a cobertura por região.",
    ],
    [
      {
        label: "Filtro por tipo",
        description: "Postos de combustível, oficinas, credenciados e higienização/lava-jatos.",
      },
      {
        label: "Pontos no mapa",
        description:
          "Alimentados automaticamente pelos cadastros, contratos e credenciamentos do próprio órgão. O sistema não traz prestadores prontos nem dados de outros órgãos.",
        tags: AUTO,
      },
      {
        label: "Localização pendente",
        description:
          "Cadastros sem coordenada ficam listados à parte para busca automática ou correção manual.",
        tags: COND,
      },
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
      {
        label: "Tipo da cotação",
        description:
          "Serviços, Peças, ou Serviços e peças. Define quais campos a empresa preenche na proposta.",
        tags: REQ,
      },
      { label: "Objeto da cotação", description: "Descrição do que está sendo cotado.", tags: REQ },
      {
        label: "Prazo final para recebimento da proposta",
        description: "Data limite de resposta; também encerra o link enviado ao fornecedor.",
        tags: REQ,
      },
      {
        label: "Veículo ou bem",
        description:
          "Vincule quando a cotação for para um item da frota; pode ficar em branco em compras de estoque.",
        tags: COND,
      },
      {
        label: "Observações",
        description: "Informações complementares exibidas também na página do fornecedor.",
      },
      {
        label: "Situação da cotação",
        description: "Rascunho, Aberta, Em análise, Encerrada ou Cancelada.",
        tags: AUTO,
      },
      {
        label: "Valor das propostas",
        description: "Sempre o valor líquido, já descontado.",
        tags: CALC,
      },
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
      {
        label: "Descrição do item",
        description: "O que está sendo pedido. Com autocomplete pelo histórico do órgão.",
        tags: REQ,
      },
      {
        label: "Sugestão do histórico",
        description:
          "Traz descrição e unidade usual de itens já cotados no órgão; nunca reaproveita preço, marca ou fornecedor.",
        tags: AUTO,
      },
      { label: "Unidade", description: "Unidade de medida usada na cotação e na proposta." },
      {
        label: "Quantidade",
        description: "Definida pelo órgão nas peças e materiais; o fornecedor não pode alterá-la.",
        tags: COND,
      },
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
      {
        label: "Empresas cadastradas",
        description: "Selecionadas da rede do órgão, com e-mail já preenchido.",
      },
      {
        label: "E-mails avulsos",
        description:
          "Para empresas ainda não cadastradas; a vinculação ocorre quando a empresa for cadastrada.",
        tags: COND,
      },
      {
        label: "Situação do convite",
        description:
          "Pendente (criado, sem envio), Enviado, Respondido, Prazo expirado, Erro no envio e Recusado.",
        tags: AUTO,
      },
      {
        label: "Histórico do convite",
        description: "Criação, envios, tentativas, último erro e data da resposta.",
        tags: AUTO,
      },
      {
        label: "Envio de e-mail",
        description:
          "Depende do provedor de envio configurado pelo órgão; sem configuração o sistema avisa e oferece o link.",
      },
      {
        label: "Copiar link",
        description: "Endereço público e exclusivo daquele convite, protegido por token.",
        tags: AUTO,
      },
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
      {
        label: "Empresa / oficina / loja",
        description:
          "Pode ser escolhida mesmo sem convite prévio; o convite interno é criado sem envio de e-mail.",
        tags: REQ,
      },
      {
        label: "Cadastrar nova empresa",
        description:
          "Inclui a empresa na rede do órgão (tipo, razão social, CNPJ/CPF, contato, endereço e especialidade) e já a seleciona.",
      },
      {
        label: "Campos da proposta",
        description: "Exibidos conforme o tipo da cotação escolhido na abertura.",
        tags: COND,
      },
      {
        label: "Origem",
        description: "Propostas lançadas aqui aparecem como Manual em Propostas recebidas.",
        tags: AUTO,
      },
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
      {
        label: "Origem",
        description: "Manual (lançada pelo órgão) ou Link (enviada pelo fornecedor).",
        tags: AUTO,
      },
      {
        label: "Situação da proposta",
        description: "Recebida, aprovada ou desclassificada.",
        tags: AUTO,
      },
      {
        label: "Validade da proposta (dias)",
        description: "Prazo em que o fornecedor mantém os valores.",
      },
      { label: "Prazo de execução", description: "Dias para executar o serviço.", tags: COND },
      {
        label: "Garantia dos serviços / Garantia das peças",
        description: "Informadas separadamente, em dias, no cabeçalho da proposta.",
        tags: COND,
      },
      {
        label: "Desconto",
        description: "Informado em R$ ou em %; o sistema converte e aplica sobre o total bruto.",
        tags: CALC,
      },
      {
        label: "Subtotais, desconto e valor líquido",
        description: "Calculados pelo sistema a partir dos valores informados.",
        tags: CALC,
      },
      {
        label: "Valor exibido",
        description: "Sempre o valor líquido final, já com o desconto.",
        tags: CALC,
      },
      {
        label: "Motivo da desclassificação",
        description: "Exigido ao desclassificar uma proposta.",
        tags: COND,
      },
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
      {
        label: "Validade da proposta (dias)",
        description: "Tempo em que a empresa mantém os valores.",
      },
      { label: "Prazo de execução (dias)", description: "Tempo para concluir o serviço." },
      { label: "Garantia dos serviços (dias)", description: "Garantia da execução." },
      { label: "Quantidade de horas", description: "Horas-homem previstas." },
      { label: "Valor da hora/homem (R$)", description: "Valor unitário da hora." },
      {
        label: "Total da mão de obra",
        description: "Horas multiplicadas pelo valor da hora.",
        tags: CALC,
      },
      {
        label: "Valor global dos demais serviços (R$)",
        description: "Serviços não cobrados por hora.",
      },
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
      {
        label: "Quantidade",
        description: "Definida pelo órgão; fica bloqueada para o fornecedor.",
        tags: AUTO,
      },
      { label: "Valor unitário (R$)", description: "Preço por unidade do item." },
      {
        label: "Total do item",
        description: "Quantidade multiplicada pelo valor unitário.",
        tags: CALC,
      },
      { label: "Total geral das peças", description: "Soma dos itens.", tags: CALC },
      {
        label: "Garantia das peças (dias)",
        description: "Informada uma vez, no cabeçalho da proposta, valendo para todos os itens.",
      },
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
      {
        label: "Subtotal de serviços e Subtotal de peças",
        description: "Calculados separadamente e somados no total bruto.",
        tags: CALC,
      },
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
      {
        label: "Cabeçalho institucional",
        description: "Brasão, nome do órgão, CNPJ e cidade/UF.",
        tags: AUTO,
      },
      {
        label: "Tipo da cotação, objeto e observações",
        description: "Definidos pelo órgão.",
        tags: AUTO,
      },
      {
        label: "Veículo ou bem",
        description: "Exibido apenas quando a cotação estiver vinculada a um item da frota.",
        tags: COND,
      },
      {
        label: "Prazo final para recebimento da proposta",
        description: "Data limite para envio.",
        tags: AUTO,
      },
      {
        label: "Quantidade das peças",
        description: "Definida pelo órgão e bloqueada para o fornecedor.",
        tags: AUTO,
      },
      {
        label: "Horas-homem",
        description: "Editáveis pelo fornecedor nas cotações de serviços.",
        tags: COND,
      },
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
      {
        label: "Propostas comparadas",
        description: "Somente as válidas; desclassificadas ficam de fora.",
        tags: AUTO,
      },
      { label: "Desconto e valor líquido", description: "Exibidos por proposta.", tags: CALC },
      {
        label: "Menor valor",
        description: "Destacado automaticamente pelo valor líquido.",
        tags: CALC,
      },
      {
        label: "Justificativa de escolha",
        description: "Exigida quando a proposta aprovada não for a de menor valor.",
        tags: COND,
      },
      {
        label: "Justificativa de quantidade",
        description: "Exigida quando houver menos de três propostas válidas.",
        tags: COND,
      },
      { label: "Análise técnica", description: "Registro do parecer do órgão sobre as propostas." },
      {
        label: "Proposta aprovada",
        description: "Passa a ser a base para a ordem de serviço ou compra.",
        tags: AUTO,
      },
    ],
    ["A comparação usa sempre o valor líquido, nunca o bruto."],
  ),

  "/ordens-servico": t(
    "Ordens de Serviço",
    "Autoriza e acompanha a execução de serviços pelos prestadores cadastrados pelo próprio órgão, do orçamento aprovado até a entrega e o pagamento.",
    [
      "Gere a ordem a partir da cotação aprovada ou diretamente.",
      "Escolha a origem da despesa: contrato ou compra direta/pronto pagamento.",
      "Na origem por contrato, selecione o contrato e o item contratual correspondente.",
      "Acompanhe a execução e registre a conclusão e o valor final.",
    ],
    [
      {
        label: "Origem da despesa",
        description:
          "Define o restante da tela: por contrato exige contrato e item; compra direta/pronto pagamento dispensa contrato.",
        tags: REQ,
      },
      {
        label: "Prestador",
        description:
          "Na compra direta pode ser qualquer empresa do cadastro mestre, mesmo sem contrato ou credenciamento.",
        tags: REQ,
      },
      {
        label: "Contrato e item contratual",
        description:
          "Aparecem apenas na origem por contrato; o valor unitário vem do item e não é editável.",
        tags: ["Obrigatório", "Condicional"],
      },
      {
        label: "Valor total",
        description:
          "Quantidade multiplicada pelo valor unitário do item; soma dos itens autorizados.",
        tags: CALC,
      },
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
      {
        label: "Tipo de objeto",
        description:
          "Classifica o contrato (combustível, peças, manutenção, higienização, locação, seguro e outros) e orienta onde ele pode ser usado.",
        tags: REQ,
      },
      {
        label: "Vigência",
        description: "Fora da vigência o contrato não pode ser utilizado.",
        tags: REQ,
      },
      {
        label: "Itens",
        description: "Cada item tem quantidade e preço unitário; o total é calculado.",
        tags: CALC,
      },
      {
        label: "Saldo do item",
        description: "Quantidade contratada menos consumida e reservada.",
        tags: CALC,
      },
      {
        label: "Cards de resumo",
        description:
          "Contratos vigentes, valor contratado, consumido, reservado e saldo disponível, calculados a partir dos itens e das execuções.",
        tags: CALC,
      },
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
      {
        label: "Número e descrição do item",
        description:
          "Identificação do item no instrumento contratual; use a mesma redação do contrato para facilitar a conferência.",
        tags: REQ,
      },
      {
        label: "Produto vinculado",
        description:
          "Combustível, peça ou tipo de serviço já cadastrado. É esse vínculo que faz o item aparecer nas telas de abastecimento e manutenção.",
        tags: REQ,
      },
      {
        label: "Unidade de medida",
        description: "Litro, hora, peça, serviço; deve ser a mesma usada no consumo.",
        tags: REQ,
      },
      {
        label: "Quantidade contratada",
        description: "Limite total previsto para o item; alterações só por aditivo.",
        tags: REQ,
      },
      {
        label: "Valor unitário",
        description:
          "Preço contratado por unidade; o total do item é calculado pela quantidade. É esse preço que as demais telas usam, bloqueado para edição.",
        tags: ["Obrigatório", "Calculado"],
      },
      {
        label: "Valor total do item",
        description: "Quantidade multiplicada pelo valor unitário.",
        tags: CALC,
      },
      {
        label: "Consumido / reservado / saldo",
        description:
          "Atualizados automaticamente pelas autorizações, abastecimentos, manutenções e ordens de serviço.",
        tags: ["Automático", "Calculado"],
      },
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
      {
        label: "Tipo de aditivo",
        description:
          "Prorrogação, acréscimo, supressão, reajuste, reequilíbrio ou combinado. Define quais campos ficam disponíveis.",
        tags: REQ,
      },
      {
        label: "Número e data de assinatura",
        description:
          "Identificação do termo aditivo; a data define a partir de quando a alteração vale.",
        tags: REQ,
      },
      {
        label: "Fundamento legal",
        description: "Dispositivo que autoriza a alteração; aparece no histórico e nos documentos.",
      },
      {
        label: "Nova vigência",
        description: "Exigida nas prorrogações; cria uma nova vigência com saldo próprio.",
        tags: COND,
      },
      {
        label: "Itens alterados",
        description:
          "Nos aditivos de valor, informe a nova quantidade e/ou preço por item; o sistema recalcula os saldos.",
        tags: COND,
      },
      {
        label: "Valor anterior e posterior",
        description: "Calculados a partir dos itens antes e depois do aditivo.",
        tags: CALC,
      },
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
      {
        label: "Dotação, fonte e elemento",
        description:
          "Escolhidos de cadastros reutilizáveis do próprio órgão; o botão + cria o registro e já o deixa selecionado.",
        tags: REQ,
      },
      {
        label: "Saldo disponível",
        description: "Valor empenhado menos reservado e liquidado.",
        tags: CALC,
      },
      {
        label: "Cards de resumo",
        description: "Empenhos ativos, valor empenhado, consumido, reservado e saldo disponível.",
        tags: CALC,
      },
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
      {
        label: "Abrangência",
        description: "Define a quem a cota se aplica: órgão, unidade ou bem específico.",
        tags: REQ,
      },
      {
        label: "Tipo de cota",
        description: "Quantitativa (litros/horas) ou financeira (R$).",
        tags: REQ,
      },
      {
        label: "Período",
        description: "Intervalo em que o limite vale; ao terminar, a cota deixa de reservar saldo.",
        tags: REQ,
      },
      {
        label: "Limite",
        description: "Valor ou quantidade máxima permitida no período.",
        tags: REQ,
      },
      {
        label: "Reservado / consumido",
        description:
          "Atualizados automaticamente pelas autorizações emitidas e pelos abastecimentos lançados.",
        tags: AUTO,
      },
      {
        label: "Saldo restante",
        description: "Limite menos o consumido e o reservado em aberto.",
        tags: CALC,
      },
    ],
    [
      "Autorização acima do saldo da cota é bloqueada na emissão.",
      "Suplementação de cota é registrada como lançamento próprio e fica no histórico.",
    ],
  ),

  "/centros-custo": t(
    "Centros de Custo",
    "Define para onde a despesa da frota é apropriada, permitindo apurar custo por área, programa ou projeto.",
    [
      "Cadastre o centro de custo com código e nome.",
      "Vincule a unidade responsável, quando o centro pertencer a uma secretaria específica.",
      "Use o centro nos relatórios para apurar o custo por área.",
    ],
    [
      {
        label: "Código",
        description: "Identificação usada em relatórios, exportações e integração contábil.",
        tags: REQ,
      },
      { label: "Nome", description: "Descrição reconhecível pela área responsável.", tags: REQ },
      {
        label: "Unidade vinculada",
        description:
          "Selecionada em Secretarias/Unidades; usada para sugerir o centro nas despesas daquela unidade.",
        tags: COND,
      },
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
      {
        label: "Razão social",
        description:
          "Nome oficial do órgão, exatamente como consta nos atos administrativos. Aparece nos documentos emitidos.",
        tags: REQ,
      },
      {
        label: "Nome curto",
        description:
          "Versão reduzida usada no menu e nos cabeçalhos quando o nome oficial é longo.",
      },
      {
        label: "CNPJ",
        description: "Informe apenas números; o sistema aplica a formatação.",
        tags: REQ,
      },
      {
        label: "Endereço, município e UF",
        description: "Usados nos documentos impressos e como referência de localização nos mapas.",
        tags: REQ,
      },
      {
        label: "Brasão",
        description:
          "Imagem exibida no topo do sistema e em todo documento impresso ou PDF gerado.",
      },
      {
        label: "Período de gestão",
        description:
          "Datas de início e fim do mandato; usado apenas como informação institucional.",
        tags: COND,
      },
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
      {
        label: "Nome e sigla",
        description: "Identificação usada em telas, filtros e relatórios.",
        tags: REQ,
      },
      {
        label: "Tipo de unidade",
        description:
          "Classificação administrativa (secretaria, departamento, diretoria, coordenação e outros).",
        tags: REQ,
      },
      {
        label: "Unidade superior",
        description: "Monta a hierarquia. Deixe em branco apenas nas unidades de primeiro nível.",
        tags: COND,
      },
      {
        label: "Responsável",
        description:
          "Servidor indicado como responsável pela unidade; escolhido no cadastro de funcionários, não digitado.",
      },
      {
        label: "Endereço e coordenadas",
        description:
          "A localização é buscada pelo endereço; pode ser corrigida manualmente quando não for encontrada.",
        tags: AUTO,
      },
    ],
    [
      "A unidade lotada no bem é que determina quais veículos aparecem nos filtros dependentes dos relatórios.",
      "Unidades com bens, pessoas ou lançamentos vinculados não devem ser excluídas: ajuste os vínculos antes.",
    ],
  ),

  "/entidades-externas": t(
    "Pessoas e Empresas Externas",
    "Cadastro único de quem não é servidor do órgão: empresas fornecedoras, oficinas, postos, órgãos parceiros, consórcios e pessoas físicas externas. Todas as demais telas selecionam a partir daqui.",
    [
      "Escolha se é pessoa física ou jurídica e informe CPF/CNPJ, nome ou razão social.",
      "Marque as categorias de atuação (combustível, manutenção, peças, higienização, locação e outras): elas definem onde a empresa poderá ser selecionada.",
      "Preencha o endereço completo e salve.",
    ],
    [
      {
        label: "Tipo de pessoa",
        description: "Física ou jurídica; define se o documento é CPF ou CNPJ.",
        tags: REQ,
      },
      {
        label: "CPF / CNPJ",
        description: "Identificação única no órgão; impede cadastro duplicado.",
        tags: REQ,
      },
      {
        label: "Nome / razão social e nome fantasia",
        description:
          "Nome oficial usado em contratos e documentos; o fantasia é opcional e ajuda na busca.",
        tags: REQ,
      },
      {
        label: "Categorias de atuação",
        description:
          "Determinam em quais telas a empresa aparece (contratos, cotações, ordens de serviço, abastecimento, limpeza).",
        tags: REQ,
      },
      {
        label: "Endereço e coordenadas",
        description:
          "A posição no mapa é buscada pelo endereço; se não for encontrada, informe latitude e longitude manualmente.",
        tags: AUTO,
      },
      {
        label: "Situação",
        description:
          "Empresas inativas deixam de aparecer nas listas de seleção, mas permanecem no histórico.",
      },
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
      {
        label: "Nome e CPF",
        description: "Identificação da pessoa; o CPF impede duplicidade de cadastro.",
        tags: REQ,
      },
      {
        label: "Matrícula",
        description: "Registro funcional usado nos documentos e nas conferências.",
      },
      {
        label: "Unidade de lotação",
        description:
          "Escolhida em Secretarias/Unidades. É essa lotação que sugere automaticamente a unidade solicitante nas manutenções e reservas.",
        tags: REQ,
      },
      {
        label: "Cargo e função",
        description:
          "A função identifica papéis operacionais (fiscal, gestor, almoxarife) e orienta a seleção nas telas correspondentes.",
        tags: COND,
      },
      {
        label: "Situação",
        description:
          "Somente pessoas ativas aparecem nas listas de seleção; inativos permanecem no histórico.",
        tags: REQ,
      },
    ],
    [
      "Nomes nunca devem ser digitados livremente em contratos, diárias ou manutenções: selecione a pessoa cadastrada aqui.",
      "Para que a pessoa possa conduzir veículos, cadastre-a também em Condutores, com habilitação e validade.",
      "Acesso ao sistema é concedido separadamente em Usuários e permissões.",
    ],
  ),

  "/usuarios": t(
    "Usuários e Permissões",
    "Gestão dos usuários do órgão e dos perfis de acesso que determinam o que cada pessoa pode ver e fazer.",
    [
      "Cadastre o usuário com nome e e-mail institucional.",
      "Atribua o perfil de acesso adequado.",
      "Desative o acesso quando o servidor deixar a função.",
    ],
    [
      {
        label: "E-mail institucional",
        description:
          "É o login da pessoa e o endereço usado para recuperar senha. Não pode se repetir.",
        tags: REQ,
      },
      {
        label: "Funcionário vinculado",
        description:
          "Associe o acesso à pessoa já cadastrada em Funcionários, para que os registros fiquem identificados.",
        tags: COND,
      },
      {
        label: "Perfil de acesso",
        description:
          "Define o que a pessoa pode ver e fazer: administrador do órgão, gestor de frota, gestor de unidade, operador ou auditor.",
        tags: REQ,
      },
      {
        label: "Situação",
        description:
          "Usuários inativos continuam no histórico, mas não conseguem entrar no sistema.",
      },
    ],
    [
      "Conceda o menor perfil necessário: operador registra o dia a dia, auditor apenas consulta.",
      "O usuário só enxerga dados do órgão em que foi cadastrado.",
      "Criação, alteração de perfil e desativação ficam registradas para auditoria.",
    ],
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
      {
        label: "Validação",
        description: "Linhas com erro são apontadas e não são gravadas.",
        tags: AUTO,
      },
    ],
    ["A importação só grava depois da confirmação; nada é alterado durante a conferência."],
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
      {
        label: "Consumo médio",
        description: "Calculado com base nos abastecimentos e nas marcações do medidor.",
        tags: CALC,
      },
      {
        label: "Custo por km/hora",
        description: "Custos do período divididos pela distância ou horas registradas.",
        tags: CALC,
      },
      {
        label: "Parâmetros de referência",
        description: "Definem o que é considerado consumo fora do padrão.",
      },
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
      {
        label: "Ano e Mês",
        description:
          'Preenchem as datas do período; escolha "Ano inteiro" para o exercício completo.',
        tags: AUTO,
      },
      {
        label: "Período (De/Até)",
        description:
          "Recorta os lançamentos considerados; pode ser ajustado após escolher ano e mês.",
        tags: REQ,
      },
      {
        label: "Secretaria / unidade",
        description:
          "Ao escolher a unidade, a lista de veículos passa a mostrar apenas os bens lotados nela.",
      },
      {
        label: "Condutor",
        description:
          "Ao escolher o condutor, a lista de veículos passa a mostrar apenas os bens que ele efetivamente utilizou no histórico.",
      },
      {
        label: "Tipo de contrato",
        description:
          "Categoria do objeto contratual (combustível, peças, manutenção, higienização, locação, seguro e outros); define quais contratos aparecem no filtro Contrato.",
      },
      {
        label: "Contrato",
        description:
          "Seleciona um contrato específico; os relatórios passam a considerar apenas os consumos e execuções vinculados a ele.",
      },
    ],
    [
      "Quando um filtro superior muda e invalida o filtro já escolhido, o filtro dependente é limpo automaticamente.",
      "Filtros desabilitados não se aplicam ao relatório selecionado.",
      "Relatórios sem resultado indicam ausência de lançamentos no filtro escolhido, não erro do sistema.",
    ],
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
      {
        label: "Endereço público",
        description: "Link aberto, sem necessidade de login.",
        tags: AUTO,
      },
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
      {
        label: "Credenciais do provedor",
        description: "Cadastradas em área protegida; nunca são exibidas novamente nem exportadas.",
        tags: REQ,
      },
      {
        label: "Situação da integração",
        description: "Só fica ativa após teste de conexão bem-sucedido.",
        tags: AUTO,
      },
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
    "Reúne dois tipos de ocorrência: avisos orientativos, que servem para decisão do gestor, e inconsistências corretivas, que dependem de corrigir um dado no cadastro de origem.",
    [
      "Use o filtro de situação para ver abertos ou o histórico já resolvido.",
      "Clique no ícone de informação da linha para ver o que significa, o impacto e os passos daquele alerta.",
      "Em inconsistência corretiva, corrija o dado indicado: o alerta sai dos abertos sozinho.",
      "Em aviso orientativo, use Resolver e informe a justificativa; o dado de origem não é alterado.",
    ],
    [
      {
        label: "Tratamento",
        description:
          "Orientativo (pode ser encerrado com justificativa) ou Corretivo (só sai quando o dado for corrigido).",
        tags: AUTO,
      },
      {
        label: "Detalhe",
        description: "Motivo exato que gerou a ocorrência, calculado pelas regras do órgão.",
        tags: AUTO,
      },
      {
        label: "Situação",
        description:
          "Aberto, resolvido automaticamente, resolvido por correção ou resolvido por decisão do usuário.",
        tags: AUTO,
      },
      {
        label: "Justificativa do encerramento",
        description:
          "Obrigatória ao resolver um aviso orientativo; fica registrada com autor e data.",
        tags: COND,
      },
    ],
    [
      "Nenhum alerta é apagado: o encerrado sai da lista de abertos e continua no histórico.",
      "Inconsistência corretiva não pode ser ignorada.",
      "Resolver aviso orientativo exige perfil de administração do órgão ou gestor de frota.",
      "Enquanto houver alerta aberto, o item do menu fica em âmbar com o número de pendências.",
    ],
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
      {
        label: "Órgão em contexto",
        description: "Enquanto houver órgão selecionado, as telas mostram os dados dele.",
        tags: AUTO,
      },
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
      {
        label: "Nova senha",
        description: "Deve ser confirmada de forma idêntica no campo seguinte.",
        tags: REQ,
      },
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
      {
        label: "Valor de mercado",
        description: "Referencial obtido da tabela de preços quando o bem estiver vinculado.",
        tags: AUTO,
      },
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
