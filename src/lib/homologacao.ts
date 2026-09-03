/**
 * Fase 9 — base de conhecimento da homologação do FrotaGov.
 * Conteúdo estático usado pelas telas "Documentação / Homologação" e
 * "Matriz de Funcionalidades", exclusivas do Super Admin.
 */

export const APP_VERSION = "9.0.0";
export const APP_STAGE = "Homologação geral (Fase 9)";

export type VersionEntry = { version: string; date: string; title: string; summary: string };

export const VERSION_HISTORY: VersionEntry[] = [
  { version: "1.0.0", date: "Fase 1", title: "Base multi-órgão", summary: "Autenticação, multi-organização com isolamento, órgão, unidades, veículos, painel e perfis." },
  { version: "2.0.0", date: "Fase 2", title: "Abastecimento", summary: "Fornecedores/postos, combustíveis, abastecimentos, medidores e alertas de consumo." },
  { version: "3.0.0", date: "Fase 3", title: "Condutores e autorizações", summary: "Condutores, utilização/reserva de veículos, autorização de abastecimento e limites." },
  { version: "4.0.0", date: "Fase 4", title: "Contratos e orçamento", summary: "Centros de custo, contratos, empenhos, cotas e motor de saldos (reserva/consumo/liberação/estorno)." },
  { version: "5.0.0", date: "Fase 5", title: "Manutenção, peças e pneus", summary: "Planos preventivos, solicitações, registros de manutenção, peças, pneus e histórico do veículo." },
  { version: "6.0.0", date: "Fase 6", title: "Rede credenciada, cotações e OS", summary: "Oficinas credenciadas, cotações com mínimo de propostas e justificativa, ordem de serviço eletrônica e garantias." },
  { version: "7.0.0", date: "Fase 7", title: "Legal e patrimonial", summary: "Multas, sinistros, seguros, obrigações legais, movimentação patrimonial e entidades externas." },
  { version: "8.0.0", date: "Fase 8", title: "Plataforma e integrações", summary: "Super Admin, onboarding controlado, logs globais, relatórios, Portal da Transparência e API v1." },
  { version: "9.0.0", date: "Fase 9", title: "Homologação e comercialização", summary: "Endurecimento de segurança, agendamento automático de rotinas, exportação .xlsx e impressão/PDF, painel executivo agrupado, dados abertos em CSV, paginação da API, documentação e matriz de licitações." },
];

export type ModuleInfo = { module: string; route: string; status: "ativo" | "parcial"; note?: string };

export const ACTIVE_MODULES: ModuleInfo[] = [
  { module: "Painel executivo", route: "/painel", status: "ativo" },
  { module: "Veículos e frota", route: "/veiculos", status: "ativo" },
  { module: "Utilização e reservas", route: "/utilizacao", status: "ativo" },
  { module: "Condutores", route: "/condutores", status: "ativo" },
  { module: "Autorização de abastecimento", route: "/autorizacoes", status: "ativo" },
  { module: "Abastecimentos", route: "/abastecimentos", status: "ativo" },
  { module: "Manutenção preventiva e corretiva", route: "/manutencoes", status: "ativo" },
  { module: "Peças e pneus", route: "/pecas", status: "ativo" },
  { module: "Rede credenciada", route: "/rede-credenciada", status: "ativo" },
  { module: "Cotações", route: "/cotacoes", status: "ativo" },
  { module: "Ordens de serviço", route: "/ordens-servico", status: "ativo" },
  { module: "Contratos, empenhos e cotas", route: "/contratos", status: "ativo" },
  { module: "Multas, sinistros, seguros e obrigações", route: "/multas", status: "ativo" },
  { module: "Movimentação patrimonial", route: "/patrimonio", status: "ativo" },
  { module: "Relatórios e exportações", route: "/relatorios", status: "ativo" },
  { module: "Portal da Transparência", route: "/transparencia", status: "ativo", note: "Desabilitado por padrão em cada órgão." },
  { module: "API pública v1 (leitura)", route: "/chaves-api", status: "ativo", note: "Somente leitura, com chave por órgão." },
  { module: "Administração da Plataforma", route: "/plataforma", status: "ativo", note: "Exclusivo do Super Admin." },
];

export type ChecklistItem = { item: string; status: "ok" | "parcial"; detail: string };

export const TECH_CHECKLIST: ChecklistItem[] = [
  { item: "Isolamento multi-órgão (RLS)", status: "ok", detail: "Todas as tabelas operacionais filtram pelo órgão em contexto; o Super Admin só enxerga o órgão em que entrou." },
  { item: "Perfis e permissões", status: "ok", detail: "Seis perfis com regras de leitura, escrita e ações sensíveis aplicadas no banco e na interface." },
  { item: "Funções internas do banco protegidas", status: "ok", detail: "Gatilhos e rotinas internas não são executáveis pelo aplicativo nem por visitantes." },
  { item: "Funções de permissão executáveis por usuários autenticados", status: "parcial", detail: "As funções de verificação de perfil e de órgão precisam ser executáveis para que as regras de acesso funcionem; é o comportamento esperado." },
  { item: "Rotinas automáticas", status: "ok", detail: "Alertas e expiração de autorizações a cada hora; limpeza de logs por retenção diariamente às 03:20." },
  { item: "Auditoria e logs globais", status: "ok", detail: "Trilha de auditoria por tabela e log funcional com órgão, responsável, marcação de Super Admin, filtros, paginação e exportação." },
  { item: "Sem exclusão física de dados operacionais", status: "ok", detail: "As telas oferecem cancelamento, inativação ou revogação; não há botão de exclusão definitiva." },
  { item: "Recuperação e troca de senha", status: "ok", detail: "Recuperação por e-mail, senha temporária com troca obrigatória e alteração de senha em Perfil e segurança." },
  { item: "Exportações", status: "ok", detail: "CSV, Excel nativo (.xlsx) e impressão/PDF com cabeçalho institucional." },
  { item: "Padrão de dados pt-BR", status: "ok", detail: "Moeda 1.000,00, litros 1.000,0000, CPF e CNPJ mascarados com validação de dígitos e armazenamento apenas de dígitos." },
  { item: "Arquivos privados", status: "ok", detail: "Anexos ficam em armazenamento privado por órgão, acessados por link temporário." },
  { item: "TypeScript e build", status: "ok", detail: "Verificação de tipos e build de produção sem erros." },
  { item: "Envio de e-mail com domínio próprio", status: "parcial", detail: "Os e-mails de autenticação usam o remetente padrão do provedor; o domínio institucional exige verificação pelo órgão." },
];

export type MatrixRow = {
  module: string;
  feature: string;
  status: "Sim" | "Parcial" | "Não";
  note: string;
  evidence: string;
};

export const FEATURE_MATRIX: MatrixRow[] = [
  { module: "Plataforma", feature: "Operação multi-órgão com isolamento total de dados", status: "Sim", note: "Regras de acesso por órgão aplicadas no banco.", evidence: "/plataforma" },
  { module: "Plataforma", feature: "Super Admin com acesso por contexto de órgão", status: "Sim", note: "Banner de contexto e ações identificadas como Super Admin.", evidence: "/plataforma → Órgãos" },
  { module: "Plataforma", feature: "Onboarding controlado (sem autocadastro público)", status: "Sim", note: "Órgão e administrador principal criados apenas pelo Super Admin.", evidence: "/plataforma → Novo órgão" },
  { module: "Plataforma", feature: "Senha temporária com troca obrigatória", status: "Sim", note: "Exibida uma única vez, sem envio automático por e-mail.", evidence: "/plataforma → Novo órgão" },
  { module: "Segurança", feature: "Perfis e permissões diferenciados", status: "Sim", note: "Super Admin, Administrador, Gestor de Frota, Responsável por Unidade, Operador e Fiscal.", evidence: "/usuarios" },
  { module: "Segurança", feature: "Recuperação e alteração de senha", status: "Sim", note: "Por e-mail e pelo próprio usuário autenticado.", evidence: "/auth, /perfil" },
  { module: "Segurança", feature: "Autenticação em dois fatores", status: "Não", note: "Não implementada nesta versão.", evidence: "—" },
  { module: "Segurança", feature: "Trilha de auditoria e logs globais", status: "Sim", note: "Com filtros, paginação e exportação; nunca registra senhas ou tokens.", evidence: "/plataforma → Logs globais" },
  { module: "Cadastros", feature: "Órgão, secretarias/unidades e centros de custo", status: "Sim", note: "Estrutura administrativa completa.", evidence: "/orgao, /unidades, /centros-custo" },
  { module: "Cadastros", feature: "Veículos com identificação patrimonial e situação", status: "Sim", note: "Inclui histórico completo por veículo.", evidence: "/veiculos, /historico-veiculo" },
  { module: "Cadastros", feature: "Condutores com controle de CNH", status: "Sim", note: "Alertas de vencimento e bloqueio de uso com CNH vencida.", evidence: "/condutores" },
  { module: "Cadastros", feature: "Fornecedores, postos e entidades externas", status: "Sim", note: "Com validação de CNPJ/CPF.", evidence: "/fornecedores, /entidades-externas" },
  { module: "Utilização", feature: "Reserva, saída e retorno de veículos", status: "Sim", note: "Bloqueio de conflito de agenda e validação de quilometragem.", evidence: "/utilizacao" },
  { module: "Abastecimento", feature: "Autorização prévia com código e QR Code", status: "Sim", note: "Reserva de saldo no momento da autorização.", evidence: "/autorizacoes" },
  { module: "Abastecimento", feature: "Registro de abastecimento total e parcial", status: "Sim", note: "Baixa pelo valor efetivamente abastecido.", evidence: "/abastecimentos" },
  { module: "Abastecimento", feature: "Limites por órgão, unidade e veículo", status: "Sim", note: "Bloqueio e alerta automáticos.", evidence: "/autorizacoes" },
  { module: "Abastecimento", feature: "Cartão magnético / integração com rede de postos", status: "Não", note: "Fora do escopo das fases entregues.", evidence: "—" },
  { module: "Manutenção", feature: "Planos preventivos por tempo e quilometragem", status: "Sim", note: "Com alertas de vencimento.", evidence: "/planos-manutencao" },
  { module: "Manutenção", feature: "Solicitação, execução e conclusão de manutenção", status: "Sim", note: "Registro imutável após conclusão e indisponibilidade do veículo.", evidence: "/manutencoes" },
  { module: "Manutenção", feature: "Peças, pneus e garantias", status: "Sim", note: "Controle documental de peças; sem gestão de estoque de almoxarifado.", evidence: "/pecas, /pneus" },
  { module: "Manutenção", feature: "Rede credenciada, cotações e ordem de serviço eletrônica", status: "Sim", note: "Mínimo de propostas com justificativa obrigatória.", evidence: "/rede-credenciada, /cotacoes, /ordens-servico" },
  { module: "Orçamento", feature: "Contratos, itens, empenhos e cotas", status: "Sim", note: "Motor de saldos com reserva, consumo, liberação e estorno.", evidence: "/contratos, /empenhos, /cotas" },
  { module: "Orçamento", feature: "Integração com sistema contábil do órgão", status: "Não", note: "Depende de integração específica por município.", evidence: "—" },
  { module: "Legal", feature: "Multas, defesa e responsabilização do condutor", status: "Sim", note: "Cancelamento exige motivo registrado.", evidence: "/multas" },
  { module: "Legal", feature: "Sinistros, seguros e obrigações legais", status: "Sim", note: "Alertas automáticos de vencimento.", evidence: "/sinistros, /seguros, /obrigacoes" },
  { module: "Legal", feature: "Importação automática de multas do DETRAN", status: "Não", note: "Requer convênio e integração específica.", evidence: "—" },
  { module: "Patrimônio", feature: "Cessões, remanejamentos, baixas e alienações", status: "Sim", note: "Atualiza unidade, situação e quilometragem do veículo.", evidence: "/patrimonio" },
  { module: "Relatórios", feature: "Relatórios gerenciais com filtros e período", status: "Sim", note: "Frota, abastecimento, utilização, manutenção, contratos, legal e custo por veículo.", evidence: "/relatorios" },
  { module: "Relatórios", feature: "Exportação CSV e Excel nativo (.xlsx)", status: "Sim", note: "Disponível em relatórios, logs e matriz de funcionalidades.", evidence: "/relatorios" },
  { module: "Relatórios", feature: "Impressão / PDF com cabeçalho institucional", status: "Sim", note: "Gerado pelo navegador, com filtros e data/hora.", evidence: "/relatorios → Imprimir" },
  { module: "Transparência", feature: "Portal público por órgão, desabilitado por padrão", status: "Sim", note: "Somente dados agregados; sem dados pessoais.", evidence: "/transparencia" },
  { module: "Transparência", feature: "Download público de dados abertos em CSV", status: "Sim", note: "Por período, configurável pelo órgão.", evidence: "/transparencia/{slug}" },
  { module: "Integrações", feature: "API pública v1 de leitura com chave por órgão", status: "Sim", note: "Validade, revogação, escopos, paginação e isolamento por órgão.", evidence: "/chaves-api" },
  { module: "Integrações", feature: "API de escrita", status: "Não", note: "Não faz parte desta versão.", evidence: "—" },
  { module: "Operação", feature: "Rotinas automáticas de alertas e retenção de logs", status: "Sim", note: "Agendadas no banco de dados (horária e diária).", evidence: "/alertas" },
  { module: "Operação", feature: "Notificações por e-mail ou WhatsApp", status: "Não", note: "Os alertas são exibidos no sistema.", evidence: "—" },
  { module: "Operação", feature: "Aplicativo móvel nativo", status: "Parcial", note: "Interface responsiva em navegador; não há aplicativo publicado em lojas.", evidence: "Qualquer tela" },
];

export const KNOWN_LIMITATIONS: string[] = [
  "Não há integração com DETRAN, importação automática de multas nem portal de seguradoras.",
  "Não há envio de notificações por e-mail ou WhatsApp; os alertas são apresentados dentro do sistema.",
  "A senha temporária do administrador é entregue na tela, para repasse por canal seguro do órgão.",
  "Os e-mails de autenticação usam o remetente padrão do provedor enquanto o domínio institucional não for verificado.",
  "A API pública v1 é somente de leitura, sem escopos de escrita.",
  "Não há autenticação em dois fatores nem assinatura digital de documentos.",
  "O ambiente de demonstração é um órgão comum identificado como DEMONSTRAÇÃO; a limpeza é feita manualmente, sem rotina destrutiva automática.",
];
