/**
 * Rodada 3 — Etapa 6: auditoria funcional e de experiência do FrotaGov.
 *
 * Conteúdo estático usado pela aba "Auditoria e lançamento" (Super Admin).
 * Nenhum dado ou histórico é apagado: as decisões previstas aqui são de
 * manter, mover, consolidar, ocultar ou simplificar.
 */

export const LAUNCH_VERSION = "11.0.0";
export const LAUNCH_NAME = "FrotaGov 11.0.0 — Versão de Lançamento";

export const CLASSIFICATIONS = [
  "Essencial",
  "Avançada",
  "Obrigatória por controle/edital",
  "Redundante",
  "Baixa utilidade",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const DECISIONS = ["Mantido", "Movido", "Consolidado", "Ocultado", "Simplificado"] as const;
export type Decision = (typeof DECISIONS)[number];

export type AuditRow = {
  area: string;
  item: string;
  classification: Classification;
  decision: Decision;
  before: string;
  after: string;
};

export const PRODUCT_AUDIT: AuditRow[] = [
  {
    area: "Menu",
    item: "Manutenção (13 itens no mesmo grupo)",
    classification: "Essencial",
    decision: "Consolidado",
    before:
      "Manutenção reunia oficina, almoxarifado, prestadores do órgão, mapa, portal do credenciado, cotações e ordens de serviço.",
    after:
      'Manutenção mantém apenas oficina e insumos; prestadores do órgão, mapa, credenciados, portal, cotações e ordens de serviço passaram para a área "Prestadores e compras".',
  },
  {
    area: "Menu",
    item: "Portal do credenciado",
    classification: "Essencial",
    decision: "Movido",
    before:
      "Listado no meio dos itens de manutenção do órgão, embora seja a tela usada pelo estabelecimento.",
    after:
      "Agrupado com prestadores do órgão e cartão virtual, onde o gestor administra o credenciamento.",
  },
  {
    area: "Menu",
    item: "Mapa dos prestadores do órgão",
    classification: "Avançada",
    decision: "Movido",
    before: "Item separado dentro de Manutenção.",
    after: "Item da área de prestadores do órgão, ao lado do cadastro que alimenta o mapa.",
  },
  {
    area: "Menu",
    item: "Nomes de área do menu",
    classification: "Essencial",
    decision: "Simplificado",
    before: '"Relatórios e integrações" misturava painel analítico, transparência e conectores.',
    after:
      '"Relatórios e análises" para leitura gerencial e "Integrações e dados abertos" para transparência, conectores e chaves de API.',
  },
  {
    area: "Cadastros",
    item: "Endereço de fornecedores, oficinas, credenciados e entidades",
    classification: "Essencial",
    decision: "Simplificado",
    before: "Latitude e longitude digitadas manualmente para aparecer no mapa.",
    after:
      "Coordenadas obtidas automaticamente ao salvar o endereço; digitação manual só quando o endereço não é localizado.",
  },
  {
    area: "Frota",
    item: "Marca, modelo, ano e valor de referência do veículo",
    classification: "Essencial",
    decision: "Simplificado",
    before: "Redigitação dos dados e do valor de mercado a cada avaliação.",
    after:
      "Vínculo à tabela de referência preenche marca, modelo, ano e valor, com histórico mensal automático.",
  },
  {
    area: "Frota",
    item: "Conferência de dados oficiais do veículo",
    classification: "Obrigatória por controle/edital",
    decision: "Mantido",
    before: "Conferência manual de chassi, RENAVAM e características.",
    after:
      "Consulta oficial com comparação campo a campo e aplicação assistida; permanece desabilitada sem convênio.",
  },
  {
    area: "Abastecimento",
    item: "Seleção de veículo, condutor, posto, contrato e combustível",
    classification: "Essencial",
    decision: "Simplificado",
    before: "Listas longas sem busca e dados repetidos entre autorização e abastecimento.",
    after:
      "Seleção pesquisável que reaproveita o cadastro e transporta os dados da autorização para o abastecimento.",
  },
  {
    area: "Abastecimento",
    item: "Cartão físico, terminal POS e adquirência",
    classification: "Baixa utilidade",
    decision: "Mantido",
    before: "Ausente do produto.",
    after:
      "Permanece fora do núcleo e declarado como tal na matriz; o cartão virtual do bem cumpre a identificação sem processar pagamento.",
  },
  {
    area: "Manutenção",
    item: "Peças em manutenção e peças no almoxarifado",
    classification: "Essencial",
    decision: "Consolidado",
    before: "Catálogo de peças e itens do almoxarifado tratados como cadastros separados.",
    after:
      "Catálogo único de peças, com compatibilidade e saldo de estoque exibidos no mesmo registro.",
  },
  {
    area: "Relatórios",
    item: "Relatórios avançados e inteligência da frota",
    classification: "Avançada",
    decision: "Mantido",
    before: "Duas telas com sobreposição parcial de indicadores.",
    after:
      "Inteligência concentra consumo, custo e economicidade; relatórios avançados concentram emissão documental e exportação. A sobreposição fica registrada como ponto de fusão futura.",
  },
  {
    area: "Relatórios",
    item: "Matriz de funcionalidades",
    classification: "Obrigatória por controle/edital",
    decision: "Simplificado",
    before:
      "Três situações (Sim, Parcial, Não), sem distinguir o que depende de credencial do órgão.",
    after:
      'Cinco situações, separando "depende de credencial" e "fora do núcleo", com contagem e exportação por situação.',
  },
  {
    area: "Painel",
    item: "Cartões do painel executivo",
    classification: "Essencial",
    decision: "Mantido",
    before:
      "Indicadores de frota, custo, consumo, disponibilidade, contratos, orçamento, manutenção, conformidade e transparência.",
    after:
      "Mantidos: todos possuem ação correspondente (abrir lista filtrada ou alerta). Nenhum cartão puramente informativo foi acrescentado.",
  },
  {
    area: "Integrações",
    item: "Conectores sem credencial",
    classification: "Obrigatória por controle/edital",
    decision: "Mantido",
    before: "Risco de exibir conector externo como ativo antes do convênio.",
    after:
      'Conector sem credencial permanece "não configurado", com ação desabilitada e aviso explícito.',
  },
  {
    area: "Segurança",
    item: "Telas sensíveis por perfil",
    classification: "Obrigatória por controle/edital",
    decision: "Mantido",
    before: "Administração da plataforma, chaves de API, backup, exportação integral e importação.",
    after:
      "Continuam restritas a Super Admin, Administrador do órgão e Auditoria, conforme o caso, tanto no menu quanto no banco de dados.",
  },
  {
    area: "Exportação",
    item: "Pacote integral de dados",
    classification: "Obrigatória por controle/edital",
    decision: "Mantido",
    before: "Conjuntos das Fases 1 a 10.",
    after:
      "Acrescidos valor de mercado, geocodificação, integrações, identidade institucional e histórico de acessos, sempre sem senhas, tokens, certificados ou segredos.",
  },
];

export type LaunchSection = { title: string; items: string[] };

export const LAUNCH_REPORT: LaunchSection[] = [
  {
    title: "Visão geral",
    items: [
      "Sistema de gestão de frotas públicas multi-órgão, com isolamento total de dados, trilha de auditoria e Portal da Transparência.",
      "Cobre frota, abastecimento, manutenção, contratos e orçamento, legal e patrimonial, almoxarifado, prestadores do órgão e prestação de contas.",
    ],
  },
  {
    title: "Módulos essenciais visíveis",
    items: [
      "Painel executivo e alertas.",
      "Veículos, máquinas e equipamentos, utilização e condutores.",
      "Autorizações e abastecimentos.",
      "Manutenções, planos preventivos, limpeza, peças e pneus.",
      "Contratos, empenhos, cotas e centros de custo.",
      "Multas, sinistros, seguros, obrigações e patrimônio.",
      "Relatórios, exportações e Portal da Transparência.",
    ],
  },
  {
    title: "Módulos avançados",
    items: [
      "Inteligência da frota (consumo, custo por km/hora, TCO e economicidade).",
      "Almoxarifado, ordens de fornecimento e compatibilidade de peças.",
      "Cadastro digital de prestadores do próprio órgão, cartão virtual do bem, portal do credenciado e mapa.",
      "Sustentabilidade da frota, Central de Integrações, chaves de API e exportação integral.",
    ],
  },
  {
    title: "Integrações pendentes de credenciais do órgão",
    items: [
      "Consulta de dados oficiais do veículo (convênio SERPRO/SENATRAN/DETRAN).",
      "Sistema contábil do município (SIAFIC).",
      "Login institucional OIDC/SAML e diretório corporativo (LDAP).",
      "Base contratada da FIPE (a base pública já funciona sem credencial).",
      "Envio final do backup para servidor próprio por SFTP (agente do órgão).",
    ],
  },
  {
    title: "Fora do núcleo do produto",
    items: [
      "Cartão magnético físico, terminal POS, adquirência e processamento bancário.",
      "Rede de prestadores própria da fornecedora do sistema, marketplace de oficinas ou base compartilhada entre órgãos.",
      "Aplicativo nativo publicado em lojas e assinatura digital com certificado.",
      "Notificações por e-mail ou WhatsApp e autenticação em dois fatores.",
    ],
  },
  {
    title: "Pendências técnicas reais",
    items: [
      "Regressão visual autenticada das telas internas não executada na Rodada 3.",
      "Exportação integral síncrona e montada em memória.",
      "Avisos do verificador de segurança do banco sobre funções internas com privilégio elevado, esperados pelo desenho das regras de acesso.",
      "Sobreposição parcial entre Inteligência da frota e Relatórios avançados, candidata a fusão futura.",
    ],
  },
  {
    title: "Recomendação",
    items: [
      "Apto para o primeiro cliente real em operação assistida, com implantação acompanhada e migração de dados pelo assistente de importação.",
      "Antes da virada definitiva: regressão visual autenticada com os perfis do órgão e definição das credenciais dos conectores que o edital exigir.",
    ],
  },
];
