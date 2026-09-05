/**
 * Bloco C — Importação e migração em massa (CSV/XLSX).
 *
 * Este módulo concentra:
 *  - a definição dos tipos de importação suportados e seus campos;
 *  - a leitura de arquivos CSV/XLSX e a sugestão automática de mapeamento;
 *  - a geração dos modelos de planilha;
 *  - a validação/simulação (nada é gravado em tabelas operacionais aqui).
 *
 * A gravação definitiva é feita exclusivamente pela rotina do banco
 * `commit_import_batch`, em uma única transação.
 */
import * as XLSX from "xlsx";

import {
  isValidCNPJ,
  isValidCPF,
  onlyDigits,
  parseBRNumber,
} from "@/lib/format";

/* ------------------------------- definições ------------------------------- */

export type FieldType =
  | "text"
  | "int"
  | "number"
  | "money"
  | "liters"
  | "date"
  | "datetime"
  | "cpf"
  | "cnpj"
  | "doc"
  | "plate"
  | "enum";

export type RefKind = "unit" | "vehicle" | "supplier" | "driver" | "fuel" | "contract" | "cost_center";

export type ImportField = {
  /** Chave gravada no registro normalizado (igual à coluna do banco, ou _ref). */
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Nomes alternativos aceitos no cabeçalho do arquivo (sugestão automática). */
  aliases?: string[];
  options?: string[];
  /** Campo de referência a outro cadastro do mesmo órgão. */
  ref?: RefKind;
  example?: string;
  hint?: string;
};

export type ImportModuleId =
  | "unidades"
  | "veiculos"
  | "condutores"
  | "fornecedores"
  | "produtos"
  | "centros_custo"
  | "contratos"
  | "empenhos"
  | "abastecimentos"
  | "utilizacoes"
  | "manutencoes"
  | "multas"
  | "seguros"
  | "obrigacoes"
  | "patrimonio"
  | "entidades"
  | "diarias"
  | "acidentes"
  | "rede_credenciada"
  | "pecas"
  | "pneus"
  | "planos"
  | "cotas"
  | "limpeza";

export type ImportModule = {
  id: ImportModuleId;
  label: string;
  description: string;
  /** Ordem recomendada de implantação. */
  order: number;
  /** Depende de quais módulos já importados. */
  depends: ImportModuleId[];
  /** Histórico legado (não gera efeito financeiro corrente). */
  legacy?: boolean;
  /** Campos usados para detectar registro já existente. */
  dedupe: string[];
  fields: ImportField[];
};

const CLEANING_STATUS_IMPORT = ["agendada", "realizada", "cancelada"];
const UNIT_TYPES = ["secretaria", "departamento", "diretoria", "coordenacao", "unidade", "outro"];
const VEHICLE_STATUS = ["ativo", "manutencao", "cedido", "inativo", "baixado"];
const DRIVER_BONDS = ["efetivo", "comissionado", "contratado", "terceirizado", "outro"];
const PRODUCT_CATEGORIES_IMPORT = ["combustivel", "lubrificante", "fluido", "aditivo", "outro"];
const CONTRACT_MODALITIES = [
  "pregao",
  "concorrencia",
  "dispensa",
  "inexigibilidade",
  "adesao_ata",
  "contratacao_direta",
  "outro",
];
const CONTRACT_STATUS = ["rascunho", "vigente", "suspenso", "encerrado", "rescindido"];
const COMMITMENT_KINDS = ["ordinario", "estimativo", "global"];
const COMMITMENT_STATUS = ["ativo", "esgotado", "anulado", "encerrado"];
const MAINTENANCE_KINDS = ["preventiva", "corretiva"];
const MAINTENANCE_STATUS = ["em_execucao", "concluida", "cancelada"];
const USAGE_STATUS = ["solicitada", "autorizada", "em_uso", "concluida", "cancelada"];
const FINE_STATUS = ["recebida", "em_analise", "defesa_apresentada", "deferida", "indeferida", "paga", "cancelada"];
const FINE_LIABILITY = ["nao_definida", "condutor", "orgao"];
const INSURANCE_STATUS = ["ativa", "a_vencer", "vencida", "cancelada"];
const OBLIGATION_STATUS = ["pendente", "quitada", "vencida", "nao_aplicavel", "cancelada"];
const ASSET_KINDS = [
  "proprio_em_uso",
  "cedido_ao_orgao",
  "cedido_a_terceiros",
  "locado",
  "fiel_depositario",
  "remanejamento",
  "baixa_manutencao",
  "alienacao_em_processo",
  "doacao",
  "leilao",
  "furto_roubo",
  "perda_total",
  "alienado",
  "desativado",
];

const DIARY_STATUS_IMPORT = [
  "rascunho", "solicitada", "em_analise", "autorizada", "paga",
  "viagem_realizada", "aguardando_comprovacao", "comprovada", "rejeitada", "cancelada",
];
const ACCIDENT_KINDS_IMPORT = ["colisao", "capotamento", "atropelamento", "incendio", "furto_roubo", "avaria", "outro"];
const ACCIDENT_STATUS_IMPORT = ["registrado", "em_apuracao", "em_reparo", "encerrado", "cancelado"];
const WORKSHOP_STATUS_IMPORT = ["ativa", "suspensa", "inativa"];
const TIRE_STATUS_IMPORT = ["estoque", "em_uso", "recapagem", "descartado"];
const QUOTA_TYPES_IMPORT = ["valor", "volume", "quantidade"];

const refUnit = (required = false): ImportField => ({
  key: "_unit",
  label: "Secretaria / Unidade",
  type: "text",
  ref: "unit",
  required,
  aliases: ["unidade", "secretaria", "lotacao", "setor", "orgao_lotacao"],
  example: "Secretaria de Saúde",
});
const refVehicle = (required = true): ImportField => ({
  key: "_vehicle",
  label: "Veículo (placa)",
  type: "plate",
  ref: "vehicle",
  required,
  aliases: ["placa", "veiculo", "veículo", "placa_veiculo"],
  example: "ABC1D23",
});
const refSupplier = (required = false): ImportField => ({
  key: "_supplier",
  label: "Fornecedor / Posto (CNPJ ou nome)",
  type: "text",
  ref: "supplier",
  required,
  aliases: ["fornecedor", "posto", "oficina", "cnpj_fornecedor", "prestador"],
  example: "00.000.000/0001-00",
});
const refDriver = (required = false): ImportField => ({
  key: "_driver",
  label: "Condutor (CPF ou nome)",
  type: "text",
  ref: "driver",
  required,
  aliases: ["condutor", "motorista", "cpf_condutor"],
});
const refContract = (required = false): ImportField => ({
  key: "_contract",
  label: "Contrato (número)",
  type: "text",
  ref: "contract",
  required,
  aliases: ["contrato", "numero_contrato", "n_contrato"],
});
const refCostCenter = (required = false): ImportField => ({
  key: "_cost_center",
  label: "Centro de custo (código)",
  type: "text",
  ref: "cost_center",
  required,
  aliases: ["centro_de_custo", "centro_custo", "cc"],
});

export const IMPORT_MODULES: ImportModule[] = [
  {
    id: "unidades",
    label: "Secretarias / Unidades",
    description: "Estrutura administrativa do órgão. Deve ser o primeiro passo da migração.",
    order: 1,
    depends: [],
    dedupe: ["name", "acronym"],
    fields: [
      { key: "name", label: "Nome da unidade", type: "text", required: true, aliases: ["unidade", "secretaria", "nome"] },
      { key: "acronym", label: "Sigla", type: "text", aliases: ["sigla", "abreviacao"] },
      { key: "unit_type", label: "Tipo", type: "enum", options: UNIT_TYPES, aliases: ["tipo", "tipo_unidade"] },
      { key: "manager_name", label: "Responsável", type: "text", aliases: ["responsavel", "gestor", "secretario"] },
      { key: "manager_role", label: "Cargo do responsável", type: "text", aliases: ["cargo"] },
      { key: "phone", label: "Telefone", type: "text", aliases: ["telefone", "fone"] },
      { key: "email", label: "E-mail", type: "text", aliases: ["email", "e_mail"] },
    ],
  },
  {
    id: "veiculos",
    label: "Veículos",
    description: "Frota do órgão. Requer as unidades já importadas quando houver lotação.",
    order: 2,
    depends: ["unidades"],
    dedupe: ["plate", "renavam", "chassis", "asset_code"],
    fields: [
      { key: "plate", label: "Placa", type: "plate", required: true, aliases: ["placa"], example: "ABC1D23" },
      { key: "renavam", label: "Renavam", type: "text", aliases: ["renavam"] },
      { key: "chassis", label: "Chassi", type: "text", aliases: ["chassi", "chassis"] },
      { key: "asset_code", label: "Patrimônio", type: "text", aliases: ["patrimonio", "tombamento", "bem"] },
      { key: "brand", label: "Marca", type: "text", aliases: ["marca", "fabricante"] },
      { key: "model", label: "Modelo", type: "text", aliases: ["modelo"] },
      { key: "year_manufacture", label: "Ano de fabricação", type: "int", aliases: ["ano_fabricacao", "ano_fab"] },
      { key: "year_model", label: "Ano do modelo", type: "int", aliases: ["ano_modelo", "ano"] },
      { key: "color", label: "Cor", type: "text", aliases: ["cor"] },
      { key: "vehicle_type", label: "Tipo do veículo", type: "text", aliases: ["tipo", "especie", "categoria"] },
      { key: "fuel_type", label: "Combustível", type: "text", aliases: ["combustivel"] },
      { key: "tank_capacity", label: "Capacidade do tanque (L)", type: "liters", aliases: ["tanque", "capacidade"] },
      { key: "current_km", label: "KM atual", type: "number", aliases: ["km", "hodometro", "quilometragem"] },
      { key: "hour_meter", label: "Horímetro", type: "number", aliases: ["horimetro", "horas"] },
      { key: "status", label: "Situação", type: "enum", options: VEHICLE_STATUS, aliases: ["situacao", "status"] },
      refUnit(),
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "condutores",
    label: "Condutores / Motoristas",
    description: "Servidores e terceirizados habilitados a conduzir veículos do órgão.",
    order: 3,
    depends: ["unidades"],
    dedupe: ["cpf", "license_number"],
    fields: [
      { key: "full_name", label: "Nome completo", type: "text", required: true, aliases: ["nome", "condutor", "motorista"] },
      { key: "cpf", label: "CPF", type: "cpf", aliases: ["cpf", "documento"] },
      { key: "registration_number", label: "Matrícula", type: "text", aliases: ["matricula", "registro"] },
      { key: "bond_type", label: "Vínculo", type: "enum", options: DRIVER_BONDS, aliases: ["vinculo", "tipo_vinculo"] },
      { key: "license_number", label: "CNH", type: "text", aliases: ["cnh", "habilitacao", "registro_cnh"] },
      { key: "license_categories", label: "Categorias da CNH", type: "text", aliases: ["categoria", "categorias", "categoria_cnh"], hint: "Separe por vírgula: A,B,D" },
      { key: "license_expiry", label: "Validade da CNH", type: "date", aliases: ["validade", "validade_cnh", "vencimento_cnh"] },
      { key: "phone", label: "Telefone", type: "text", aliases: ["telefone", "celular"] },
      { key: "email", label: "E-mail", type: "text", aliases: ["email"] },
      refUnit(),
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "fornecedores",
    label: "Fornecedores / Postos",
    description: "Postos, oficinas e demais fornecedores. Os contratos podem ser vinculados depois.",
    order: 4,
    depends: [],
    dedupe: ["cnpj", "legal_name"],
    fields: [
      { key: "legal_name", label: "Razão social", type: "text", required: true, aliases: ["razao_social", "nome", "fornecedor"] },
      { key: "trade_name", label: "Nome fantasia", type: "text", aliases: ["fantasia", "nome_fantasia"] },
      { key: "cnpj", label: "CNPJ", type: "cnpj", aliases: ["cnpj", "documento"] },
      { key: "state_registration", label: "Inscrição estadual", type: "text", aliases: ["inscricao_estadual", "ie"] },
      { key: "address", label: "Endereço", type: "text", aliases: ["endereco", "logradouro"] },
      { key: "city", label: "Município", type: "text", aliases: ["municipio", "cidade"] },
      { key: "state", label: "UF", type: "text", aliases: ["uf", "estado"] },
      { key: "zip_code", label: "CEP", type: "text", aliases: ["cep"] },
      { key: "phone", label: "Telefone", type: "text", aliases: ["telefone"] },
      { key: "email", label: "E-mail", type: "text", aliases: ["email"] },
      { key: "contact_name", label: "Contato", type: "text", aliases: ["contato", "responsavel"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "produtos",
    label: "Combustíveis / Produtos",
    description: "Combustíveis, lubrificantes, fluidos e demais produtos automotivos.",
    order: 5,
    depends: [],
    dedupe: ["name"],
    fields: [
      { key: "name", label: "Nome do produto", type: "text", required: true, aliases: ["produto", "combustivel", "nome"] },
      { key: "acronym", label: "Sigla", type: "text", aliases: ["sigla"] },
      { key: "category", label: "Categoria", type: "enum", options: PRODUCT_CATEGORIES_IMPORT, aliases: ["categoria", "tipo"] },
      { key: "measure_unit", label: "Unidade de medida", type: "text", aliases: ["unidade", "unidade_medida", "um"] },
    ],
  },
  {
    id: "centros_custo",
    label: "Centros de custo",
    description: "Centros de custo utilizados nas despesas do órgão.",
    order: 6,
    depends: ["unidades"],
    dedupe: ["code"],
    fields: [
      { key: "code", label: "Código", type: "text", required: true, aliases: ["codigo", "cc"] },
      { key: "name", label: "Nome", type: "text", required: true, aliases: ["nome", "descricao"] },
      { key: "description", label: "Descrição", type: "text", aliases: ["detalhe", "observacao"] },
      refUnit(),
    ],
  },
  {
    id: "contratos",
    label: "Contratos",
    description: "Contratos vigentes e encerrados. A vigência original é criada automaticamente.",
    order: 7,
    depends: ["fornecedores"],
    dedupe: ["number"],
    fields: [
      { key: "number", label: "Número do contrato", type: "text", required: true, aliases: ["contrato", "numero", "n_contrato"] },
      { key: "object", label: "Objeto", type: "text", required: true, aliases: ["objeto", "descricao"] },
      { key: "process_number", label: "Processo administrativo", type: "text", aliases: ["processo", "n_processo"] },
      { key: "modality", label: "Modalidade", type: "enum", options: CONTRACT_MODALITIES, aliases: ["modalidade", "licitacao"] },
      refSupplier(),
      { key: "cnpj", label: "CNPJ do contratado", type: "cnpj", aliases: ["cnpj", "cnpj_contratado"] },
      { key: "signed_at", label: "Data de assinatura", type: "date", aliases: ["assinatura", "data_assinatura"] },
      { key: "valid_from", label: "Início da vigência", type: "date", required: true, aliases: ["inicio_vigencia", "vigencia_inicio", "inicio"] },
      { key: "valid_to", label: "Fim da vigência", type: "date", required: true, aliases: ["fim_vigencia", "vigencia_fim", "termino"] },
      { key: "initial_value", label: "Valor contratado", type: "money", required: true, aliases: ["valor", "valor_contrato", "valor_inicial"] },
      { key: "status", label: "Situação", type: "enum", options: CONTRACT_STATUS, aliases: ["situacao", "status"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "empenhos",
    label: "Empenhos",
    description: "Notas de empenho. Podem referenciar contrato, centro de custo e unidade.",
    order: 8,
    depends: ["contratos"],
    dedupe: ["number"],
    fields: [
      { key: "number", label: "Número do empenho", type: "text", required: true, aliases: ["empenho", "numero", "ne"] },
      { key: "exercise", label: "Exercício", type: "int", aliases: ["exercicio", "ano"] },
      { key: "issued_at", label: "Data de emissão", type: "date", required: true, aliases: ["data", "emissao", "data_emissao"] },
      { key: "kind", label: "Tipo", type: "enum", options: COMMITMENT_KINDS, aliases: ["tipo", "modalidade"] },
      { key: "committed_value", label: "Valor empenhado", type: "money", required: true, aliases: ["valor", "valor_empenhado"] },
      refContract(),
      refSupplier(),
      refCostCenter(),
      refUnit(),
      { key: "budget_allocation", label: "Dotação orçamentária", type: "text", aliases: ["dotacao", "dotacao_orcamentaria"] },
      { key: "resource_source", label: "Fonte de recurso", type: "text", aliases: ["fonte", "fonte_recurso"] },
      { key: "expense_element", label: "Elemento de despesa", type: "text", aliases: ["elemento", "elemento_despesa"] },
      { key: "status", label: "Situação", type: "enum", options: COMMITMENT_STATUS, aliases: ["situacao", "status"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "abastecimentos",
    label: "Abastecimentos históricos",
    description:
      "Histórico legado de abastecimentos. Não gera autorização eletrônica e não consome saldo de contrato, empenho ou cota.",
    order: 9,
    depends: ["veiculos", "produtos", "fornecedores"],
    legacy: true,
    dedupe: [],
    fields: [
      refVehicle(),
      { key: "fueled_at", label: "Data/hora do abastecimento", type: "datetime", required: true, aliases: ["data", "data_abastecimento", "data_hora"] },
      { key: "_fuel", label: "Combustível / produto", type: "text", ref: "fuel", required: true, aliases: ["combustivel", "produto"] },
      { key: "quantity", label: "Quantidade (litros)", type: "liters", required: true, aliases: ["litros", "quantidade", "qtd"] },
      { key: "unit_price", label: "Preço unitário", type: "money", required: true, aliases: ["preco", "valor_unitario", "preco_litro"] },
      { key: "odometer_km", label: "Hodômetro (KM)", type: "number", aliases: ["km", "hodometro", "quilometragem"] },
      { key: "hour_meter", label: "Horímetro", type: "number", aliases: ["horimetro"] },
      refSupplier(),
      refUnit(),
      { key: "driver_name", label: "Condutor (nome)", type: "text", aliases: ["condutor", "motorista"] },
      { key: "invoice_number", label: "Documento fiscal", type: "text", aliases: ["nota", "cupom", "documento", "nf"] },
      { key: "document_kind", label: "Tipo de documento", type: "text", aliases: ["tipo_documento"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "utilizacoes",
    label: "Utilizações históricas",
    description: "Viagens e reservas já realizadas no sistema anterior.",
    order: 10,
    depends: ["veiculos", "condutores"],
    legacy: true,
    dedupe: [],
    fields: [
      refVehicle(),
      refDriver(),
      { key: "actual_departure", label: "Saída", type: "datetime", required: true, aliases: ["saida", "data_saida", "inicio"] },
      { key: "actual_return", label: "Retorno", type: "datetime", aliases: ["retorno", "data_retorno", "fim"] },
      { key: "start_km", label: "KM inicial", type: "number", aliases: ["km_inicial", "km_saida"] },
      { key: "end_km", label: "KM final", type: "number", aliases: ["km_final", "km_retorno"] },
      { key: "origin", label: "Origem", type: "text", aliases: ["origem"] },
      { key: "destination", label: "Destino", type: "text", aliases: ["destino"] },
      { key: "purpose", label: "Finalidade", type: "text", aliases: ["finalidade", "motivo", "objetivo"] },
      { key: "requester_name", label: "Solicitante", type: "text", aliases: ["solicitante", "requisitante"] },
      refUnit(),
      { key: "status", label: "Situação", type: "enum", options: USAGE_STATUS, aliases: ["situacao", "status"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "manutencoes",
    label: "Manutenções históricas",
    description: "Manutenções preventivas e corretivas já executadas. Não consome empenho nem cota.",
    order: 11,
    depends: ["veiculos", "fornecedores"],
    legacy: true,
    dedupe: [],
    fields: [
      refVehicle(),
      { key: "kind", label: "Tipo", type: "enum", options: MAINTENANCE_KINDS, aliases: ["tipo", "natureza"] },
      { key: "entry_at", label: "Entrada", type: "datetime", required: true, aliases: ["data", "entrada", "data_entrada"] },
      { key: "exit_at", label: "Saída", type: "datetime", aliases: ["saida", "data_saida", "conclusao"] },
      { key: "services", label: "Serviços executados", type: "text", required: true, aliases: ["servico", "servicos", "descricao"] },
      { key: "odometer_km", label: "Hodômetro (KM)", type: "number", aliases: ["km", "hodometro"] },
      { key: "labor_value", label: "Mão de obra", type: "money", aliases: ["mao_de_obra", "servico_valor"] },
      { key: "parts_value", label: "Peças", type: "money", aliases: ["pecas", "valor_pecas"] },
      { key: "other_value", label: "Outros valores", type: "money", aliases: ["outros"] },
      { key: "total_value", label: "Valor total", type: "money", required: true, aliases: ["valor", "total", "valor_total"] },
      refSupplier(),
      refUnit(),
      { key: "invoice_number", label: "Documento fiscal", type: "text", aliases: ["nota", "nf", "documento"] },
      { key: "status", label: "Situação", type: "enum", options: MAINTENANCE_STATUS, aliases: ["situacao", "status"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "multas",
    label: "Multas / Infrações",
    description: "Autos de infração recebidos no sistema anterior.",
    order: 12,
    depends: ["veiculos"],
    legacy: true,
    dedupe: ["notice_number"],
    fields: [
      refVehicle(),
      { key: "notice_number", label: "Número do auto/AIT", type: "text", required: true, aliases: ["auto", "ait", "numero", "notificacao"] },
      { key: "occurred_at", label: "Data da infração", type: "datetime", required: true, aliases: ["data", "data_infracao"] },
      { key: "issuing_authority", label: "Órgão autuador", type: "text", aliases: ["orgao", "autuador", "detran"] },
      { key: "infraction_code", label: "Código da infração", type: "text", aliases: ["codigo", "enquadramento"] },
      { key: "description", label: "Descrição", type: "text", aliases: ["descricao", "infracao"] },
      { key: "location", label: "Local", type: "text", aliases: ["local", "endereco"] },
      { key: "amount", label: "Valor", type: "money", required: true, aliases: ["valor", "valor_multa"] },
      { key: "due_date", label: "Vencimento", type: "date", aliases: ["vencimento", "data_vencimento"] },
      refDriver(),
      { key: "responsible_name", label: "Responsável indicado", type: "text", aliases: ["responsavel", "condutor_indicado"] },
      { key: "liability", label: "Responsabilidade", type: "enum", options: FINE_LIABILITY, aliases: ["responsabilidade"] },
      { key: "status", label: "Situação", type: "enum", options: FINE_STATUS, aliases: ["situacao", "status"] },
      refUnit(),
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "seguros",
    label: "Seguros",
    description: "Apólices vigentes e encerradas do órgão.",
    order: 13,
    depends: ["fornecedores"],
    legacy: true,
    dedupe: ["policy_number"],
    fields: [
      { key: "policy_number", label: "Número da apólice", type: "text", required: true, aliases: ["apolice", "numero"] },
      { key: "insurer_name", label: "Seguradora", type: "text", required: true, aliases: ["seguradora", "empresa"] },
      { key: "valid_from", label: "Início da vigência", type: "date", required: true, aliases: ["inicio", "vigencia_inicio"] },
      { key: "valid_to", label: "Fim da vigência", type: "date", required: true, aliases: ["fim", "vigencia_fim"] },
      { key: "premium_value", label: "Prêmio", type: "money", aliases: ["premio", "valor"] },
      { key: "deductible_value", label: "Franquia", type: "money", aliases: ["franquia"] },
      { key: "coverages", label: "Coberturas", type: "text", aliases: ["cobertura", "coberturas"] },
      refSupplier(),
      refContract(),
      { key: "status", label: "Situação", type: "enum", options: INSURANCE_STATUS, aliases: ["situacao", "status"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "obrigacoes",
    label: "Obrigações legais",
    description: "IPVA, licenciamento, DPVAT e demais obrigações por veículo.",
    order: 14,
    depends: ["veiculos"],
    legacy: true,
    dedupe: [],
    fields: [
      refVehicle(),
      { key: "obligation_type", label: "Tipo de obrigação", type: "text", required: true, aliases: ["tipo", "obrigacao"], example: "IPVA" },
      { key: "exercise", label: "Exercício", type: "int", aliases: ["exercicio", "ano"] },
      { key: "due_date", label: "Vencimento", type: "date", required: true, aliases: ["vencimento", "data_vencimento"] },
      { key: "amount", label: "Valor", type: "money", aliases: ["valor"] },
      { key: "document_number", label: "Documento", type: "text", aliases: ["documento", "guia"] },
      { key: "status", label: "Situação", type: "enum", options: OBLIGATION_STATUS, aliases: ["situacao", "status"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "patrimonio",
    label: "Movimentações patrimoniais",
    description: "Cessões, remanejamentos, baixas e demais movimentações de bens.",
    order: 15,
    depends: ["veiculos", "unidades"],
    legacy: true,
    dedupe: [],
    fields: [
      refVehicle(),
      { key: "kind", label: "Tipo de movimentação", type: "enum", options: ASSET_KINDS, required: true, aliases: ["tipo", "movimentacao"] },
      { key: "moved_on", label: "Data da movimentação", type: "date", required: true, aliases: ["data", "data_movimentacao"] },
      refUnit(),
      { key: "owner_name", label: "Proprietário", type: "text", aliases: ["proprietario"] },
      { key: "holder_name", label: "Detentor / responsável", type: "text", aliases: ["detentor", "responsavel"] },
      { key: "asset_code", label: "Patrimônio", type: "text", aliases: ["patrimonio", "tombamento"] },
      { key: "act_number", label: "Ato / documento", type: "text", aliases: ["ato", "portaria", "documento"] },
      { key: "odometer_km", label: "Hodômetro (KM)", type: "number", aliases: ["km", "hodometro"] },
      { key: "reason", label: "Motivo", type: "text", aliases: ["motivo", "justificativa"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "entidades",
    label: "Entidades externas",
    description: "Órgãos cedentes, seguradoras, leiloeiros e demais entidades relacionadas.",
    order: 16,
    depends: [],
    dedupe: ["document", "name"],
    fields: [
      { key: "name", label: "Nome / razão social", type: "text", required: true, aliases: ["nome", "razao_social", "entidade"] },
      { key: "kind", label: "Tipo", type: "enum", options: ["pf", "pj"], aliases: ["tipo", "natureza"] },
      { key: "document", label: "CPF / CNPJ", type: "doc", aliases: ["documento", "cnpj", "cpf"] },
      { key: "address", label: "Endereço", type: "text", aliases: ["endereco"] },
      { key: "city", label: "Município", type: "text", aliases: ["municipio", "cidade"] },
      { key: "state", label: "UF", type: "text", aliases: ["uf", "estado"] },
      { key: "phone", label: "Telefone", type: "text", aliases: ["telefone"] },
      { key: "email", label: "E-mail", type: "text", aliases: ["email"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "diarias",
    label: "Diárias (RD)",
    description: "Requisições de diária já concedidas em sistema anterior. Registros legados, sem efeito orçamentário corrente.",
    order: 17,
    depends: ["unidades", "condutores"],
    legacy: true,
    dedupe: ["beneficiary_name", "departure_at"],
    fields: [
      refUnit(),
      refDriver(),
      refVehicle(false),
      { key: "beneficiary_name", label: "Beneficiário", type: "text", required: true, aliases: ["nome", "servidor", "beneficiario"] },
      { key: "beneficiary_role", label: "Cargo / função", type: "text", aliases: ["cargo", "funcao"] },
      { key: "beneficiary_cpf", label: "CPF do beneficiário", type: "cpf", aliases: ["cpf"] },
      { key: "requester_name", label: "Solicitante", type: "text", aliases: ["solicitante"] },
      { key: "origin_city", label: "Cidade de origem", type: "text", aliases: ["origem", "cidade_origem"] },
      { key: "origin_state", label: "UF de origem", type: "text", aliases: ["uf_origem"] },
      { key: "destination_city", label: "Cidade de destino", type: "text", required: true, aliases: ["destino", "cidade_destino"] },
      { key: "destination_state", label: "UF de destino", type: "text", aliases: ["uf_destino"] },
      { key: "departure_at", label: "Data/hora de saída", type: "datetime", required: true, aliases: ["saida", "data_saida", "partida"] },
      { key: "return_at", label: "Data/hora de retorno", type: "datetime", aliases: ["retorno", "data_retorno"] },
      { key: "quantity", label: "Quantidade de diárias", type: "number", aliases: ["qtd", "quantidade", "diarias"] },
      { key: "unit_value", label: "Valor unitário", type: "money", aliases: ["valor_unitario", "valor_diaria"] },
      { key: "purpose", label: "Finalidade / motivo", type: "text", aliases: ["motivo", "finalidade", "objetivo"] },
      { key: "event_name", label: "Evento / atividade", type: "text", aliases: ["evento"] },
      { key: "event_location", label: "Local do evento", type: "text", aliases: ["local"] },
      { key: "legal_basis", label: "Dispositivo legal", type: "text", aliases: ["norma", "base_legal", "decreto"] },
      { key: "status", label: "Situação", type: "enum", options: DIARY_STATUS_IMPORT, aliases: ["situacao", "status"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "acidentes",
    label: "Acidentes / Sinistros",
    description: "Ocorrências de sinistro já encerradas ou em andamento no sistema anterior.",
    order: 18,
    depends: ["veiculos"],
    legacy: true,
    dedupe: ["_vehicle", "occurred_at"],
    fields: [
      refVehicle(true),
      refUnit(),
      refDriver(),
      { key: "kind", label: "Natureza", type: "enum", options: ACCIDENT_KINDS_IMPORT, aliases: ["tipo", "natureza"] },
      { key: "occurred_at", label: "Data/hora da ocorrência", type: "datetime", required: true, aliases: ["data", "data_ocorrencia"] },
      { key: "location", label: "Local", type: "text", aliases: ["local", "endereco"] },
      { key: "description", label: "Descrição", type: "text", aliases: ["descricao", "relato"] },
      { key: "third_parties", label: "Terceiros envolvidos", type: "text", aliases: ["terceiros"] },
      { key: "police_report_number", label: "Boletim de ocorrência", type: "text", aliases: ["bo", "boletim"] },
      { key: "damages", label: "Danos", type: "text", aliases: ["danos"] },
      { key: "deductible_value", label: "Franquia", type: "money", aliases: ["franquia"] },
      { key: "expenses_value", label: "Despesas", type: "money", aliases: ["despesas", "custo"] },
      { key: "status", label: "Situação", type: "enum", options: ACCIDENT_STATUS_IMPORT, aliases: ["situacao"] },
      { key: "reporter_name", label: "Comunicante", type: "text", aliases: ["comunicante", "responsavel"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "limpeza",
    label: "Limpeza de veículos",
    description: "Serviços de lavagem e higienização já executados no sistema anterior.",
    order: 18.5,
    depends: ["veiculos"],
    legacy: true,
    dedupe: ["_vehicle", "performed_at"],
    fields: [
      refVehicle(true),
      refUnit(),
      refSupplier(),
      refContract(),
      refCostCenter(),
      { key: "performed_at", label: "Data/hora do serviço", type: "datetime", required: true, aliases: ["data", "data_servico", "data_limpeza"] },
      { key: "service_types", label: "Tipos de serviço (separados por ponto e vírgula)", type: "text", aliases: ["servicos", "tipo", "tipos"] },
      { key: "odometer_km", label: "Quilometragem", type: "number", aliases: ["km", "hodometro", "odometro"] },
      { key: "total_value", label: "Valor total", type: "money", aliases: ["valor", "valor_total", "custo"] },
      { key: "invoice_number", label: "Nota fiscal", type: "text", aliases: ["nf", "nota", "nota_fiscal"] },
      { key: "status", label: "Situação", type: "enum", options: CLEANING_STATUS_IMPORT, aliases: ["situacao"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "rede_credenciada",
    label: "Oficinas e prestadores do órgão",
    description: "Oficinas e prestadores do próprio órgão para manutenção.",
    order: 19,
    depends: [],
    dedupe: ["cnpj", "legal_name"],
    fields: [
      { key: "legal_name", label: "Razão social", type: "text", required: true, aliases: ["razao_social", "nome", "oficina"] },
      { key: "trade_name", label: "Nome fantasia", type: "text", aliases: ["fantasia"] },
      { key: "cnpj", label: "CNPJ", type: "cnpj", aliases: ["cnpj", "documento"] },
      { key: "address", label: "Endereço", type: "text", aliases: ["endereco"] },
      { key: "city", label: "Município", type: "text", aliases: ["cidade", "municipio"] },
      { key: "state", label: "UF", type: "text", aliases: ["uf", "estado"] },
      { key: "zip_code", label: "CEP", type: "text", aliases: ["cep"] },
      { key: "phone", label: "Telefone", type: "text", aliases: ["telefone"] },
      { key: "email", label: "E-mail", type: "text", aliases: ["email"] },
      { key: "contact_name", label: "Contato", type: "text", aliases: ["contato", "responsavel"] },
      { key: "specialties", label: "Especialidades (separadas por vírgula)", type: "text", aliases: ["especialidades", "servicos"] },
      { key: "coverage_area", label: "Área de cobertura", type: "text", aliases: ["cobertura", "regiao"] },
      { key: "status", label: "Situação", type: "enum", options: WORKSHOP_STATUS_IMPORT, aliases: ["situacao"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "pecas",
    label: "Peças e acessórios",
    description: "Catálogo de peças, acessórios e materiais aplicados na frota.",
    order: 20,
    depends: [],
    dedupe: ["internal_code", "description"],
    fields: [
      { key: "internal_code", label: "Código interno", type: "text", aliases: ["codigo", "cod"] },
      { key: "description", label: "Descrição", type: "text", required: true, aliases: ["descricao", "peca", "item"] },
      { key: "brand", label: "Marca", type: "text", aliases: ["marca", "fabricante"] },
      { key: "reference", label: "Referência", type: "text", aliases: ["referencia", "part_number"] },
      { key: "measure_unit", label: "Unidade de medida", type: "text", aliases: ["unidade", "un"] },
      { key: "category", label: "Categoria", type: "text", aliases: ["categoria", "grupo"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "pneus",
    label: "Pneus",
    description: "Pneus em estoque ou instalados, com vida útil acumulada.",
    order: 21,
    depends: ["veiculos", "fornecedores"],
    dedupe: ["code", "serial_number"],
    fields: [
      { key: "code", label: "Código / número de controle", type: "text", required: true, aliases: ["codigo", "numero"] },
      { key: "brand", label: "Marca", type: "text", aliases: ["marca"] },
      { key: "model", label: "Modelo", type: "text", aliases: ["modelo"] },
      { key: "size", label: "Medida", type: "text", aliases: ["medida", "tamanho"] },
      { key: "dot", label: "DOT", type: "text", aliases: ["dot"] },
      { key: "serial_number", label: "Número de série", type: "text", aliases: ["serie", "serial"] },
      refSupplier(),
      { key: "purchase_value", label: "Valor de compra", type: "money", aliases: ["valor", "valor_compra"] },
      { key: "purchase_date", label: "Data da compra", type: "date", aliases: ["data_compra"] },
      { key: "expected_life_km", label: "Vida útil prevista (km)", type: "number", aliases: ["vida_util", "km_previsto"] },
      { key: "accumulated_km", label: "Km acumulado", type: "number", aliases: ["km_acumulado", "km_rodado"] },
      { key: "status", label: "Situação", type: "enum", options: TIRE_STATUS_IMPORT, aliases: ["situacao"] },
      refVehicle(false),
      { key: "position", label: "Posição no veículo", type: "text", aliases: ["posicao"] },
      { key: "install_km", label: "Km na instalação", type: "number", aliases: ["km_instalacao"] },
      { key: "install_date", label: "Data da instalação", type: "date", aliases: ["data_instalacao"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "planos",
    label: "Planos preventivos",
    description: "Planos de manutenção preventiva por veículo ou tipo de veículo.",
    order: 22,
    depends: ["veiculos"],
    dedupe: ["name"],
    fields: [
      { key: "name", label: "Nome do plano", type: "text", required: true, aliases: ["plano", "nome"] },
      { key: "description", label: "Descrição", type: "text", aliases: ["descricao"] },
      { key: "service_type", label: "Tipo de serviço", type: "text", aliases: ["servico", "tipo"] },
      refVehicle(false),
      { key: "vehicle_type", label: "Tipo de veículo", type: "text", aliases: ["tipo_veiculo", "categoria"] },
      { key: "interval_km", label: "Intervalo (km)", type: "number", aliases: ["km", "intervalo_km"] },
      { key: "interval_hours", label: "Intervalo (horas)", type: "number", aliases: ["horas", "intervalo_horas"] },
      { key: "interval_months", label: "Intervalo (meses)", type: "int", aliases: ["meses", "intervalo_meses"] },
      { key: "tolerance_km", label: "Tolerância (km)", type: "number", aliases: ["tolerancia_km"] },
      { key: "tolerance_days", label: "Tolerância (dias)", type: "int", aliases: ["tolerancia_dias"] },
      { key: "last_done_at", label: "Última execução", type: "date", aliases: ["ultima_execucao"] },
      { key: "last_done_km", label: "Km da última execução", type: "number", aliases: ["km_ultima"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
  {
    id: "cotas",
    label: "Cotas e saldos",
    description: "Cotas de consumo por unidade, contrato ou centro de custo.",
    order: 23,
    depends: ["unidades", "contratos", "centros_custo"],
    dedupe: ["name"],
    fields: [
      { key: "name", label: "Nome da cota", type: "text", required: true, aliases: ["cota", "nome", "descricao"] },
      { key: "quota_type", label: "Tipo de cota", type: "enum", options: QUOTA_TYPES_IMPORT, aliases: ["tipo"] },
      { key: "measure_unit", label: "Unidade de medida", type: "text", aliases: ["unidade_medida", "un"] },
      refContract(),
      refCostCenter(),
      refUnit(),
      { key: "valid_from", label: "Vigência inicial", type: "date", aliases: ["inicio", "vigencia_inicio"] },
      { key: "valid_to", label: "Vigência final", type: "date", aliases: ["fim", "vigencia_fim"] },
      { key: "granted_amount", label: "Valor / quantidade concedida", type: "number", aliases: ["concedido", "valor", "quantidade"] },
      { key: "notes", label: "Observações", type: "text", aliases: ["observacao", "obs"] },
    ],
  },
];

/** Grupos exibidos na tela "Migração de dados" (seleção de um tipo por vez). */
export const IMPORT_GROUPS: { id: string; label: string; modules: ImportModuleId[] }[] = [
  {
    id: "basicos",
    label: "Cadastros básicos",
    modules: ["unidades", "condutores", "veiculos", "fornecedores", "produtos", "centros_custo"],
  },
  {
    id: "orcamento",
    label: "Contratos e orçamento",
    modules: ["contratos", "empenhos", "cotas"],
  },
  {
    id: "operacao",
    label: "Operação",
    modules: ["abastecimentos", "utilizacoes", "diarias", "manutencoes", "limpeza", "planos", "pecas", "pneus", "rede_credenciada"],
  },
  {
    id: "legal",
    label: "Legal e patrimonial",
    modules: ["multas", "acidentes", "seguros", "obrigacoes", "patrimonio", "entidades"],
  },
];

export const moduleById = (id: string) => IMPORT_MODULES.find((m) => m.id === id);

export const BATCH_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_validacao: "Em validação",
  com_erros: "Com erros",
  pronto: "Pronto para importar",
  importando: "Importando",
  concluido: "Concluído",
  cancelado: "Cancelado",
  anulado: "Anulado",
};

export const DUPLICATE_STRATEGIES = [
  { value: "ignorar", label: "Ignorar registros já existentes" },
  { value: "atualizar", label: "Atualizar cadastro existente (somente campos seguros)" },
  { value: "rejeitar", label: "Rejeitar o arquivo se houver registro já existente" },
];

export const OPENING_BALANCE_KINDS = [
  { value: "contrato", label: "Saldo de contrato / vigência" },
  { value: "empenho", label: "Saldo de empenho" },
  { value: "cota", label: "Saldo de cota" },
  { value: "veiculo_km", label: "KM / horímetro inicial do veículo" },
  { value: "pneu", label: "Posição de pneus / estoque" },
];

/* ------------------------------ leitura de arquivo ------------------------------ */

export type ParsedFile = { headers: string[]; rows: Record<string, string>[] };

/** Lê CSV ou XLSX e devolve cabeçalhos e linhas como texto. */
export async function parseImportFile(file: File): Promise<ParsedFile> {
  // JSON estruturado: array de objetos ou { dados: [...] } / { registros: [...] }.
  if (/\.json$/i.test(file.name) || file.type === "application/json") {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Arquivo JSON inválido. Envie um array de objetos ou { \"dados\": [...] }.");
    }
    const list = Array.isArray(parsed)
      ? parsed
      : ((parsed as Record<string, unknown>)?.["dados"] ??
         (parsed as Record<string, unknown>)?.["registros"] ??
         (parsed as Record<string, unknown>)?.["data"]);
    if (!Array.isArray(list)) {
      throw new Error("JSON sem lista de registros. Use um array de objetos ou { \"dados\": [...] }.");
    }
    const headers: string[] = [];
    const rows: Record<string, string>[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const record: Record<string, string> = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        if (!headers.includes(k)) headers.push(k);
        record[k] = v === null || v === undefined ? "" : String(v).trim();
      }
      rows.push(record);
    }
    return { headers, rows };
  }
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  const sheetName = book.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = book.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  if (!matrix.length) return { headers: [], rows: [] };
  const headerRow = (matrix[0] ?? []).map((h) => String(h ?? "").trim());
  const headers = headerRow.filter((h) => h !== "");
  const rows: Record<string, string>[] = [];
  for (const line of matrix.slice(1)) {
    const record: Record<string, string> = {};
    let filled = false;
    headerRow.forEach((h, i) => {
      if (!h) return;
      const cell = (line as unknown[])[i];
      const text = cell instanceof Date ? cell.toISOString() : String(cell ?? "").trim();
      record[h] = text;
      if (text) filled = true;
    });
    if (filled) rows.push(record);
  }
  return { headers, rows };
}

const slug = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Sugere o mapeamento coluna do arquivo → campo do FrotaGov. */
export function suggestMapping(headers: string[], mod: ImportModule): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const field of mod.fields) {
    const candidates = [field.key, field.label, ...(field.aliases ?? [])].map(slug);
    const found = headers.find((h) => !used.has(h) && candidates.includes(slug(h)));
    const partial =
      found ??
      headers.find(
        (h) => !used.has(h) && candidates.some((c) => c.length > 3 && (slug(h).includes(c) || c.includes(slug(h)))),
      );
    if (partial) {
      map[field.key] = partial;
      used.add(partial);
    }
  }
  return map;
}

/** Gera e baixa o modelo de planilha (.xlsx) do módulo. */
export function downloadTemplate(mod: ImportModule) {
  const header = mod.fields.map((f) => f.label + (f.required ? " *" : ""));
  const example = mod.fields.map((f) => f.example ?? exampleFor(f));
  const help = mod.fields.map((f) => fieldHint(f));
  const aoa = [header, example, help];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = header.map((h, i) => ({ wch: Math.max(16, Math.min(42, Math.max(h.length, String(help[i]).length / 2))) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Modelo");
  XLSX.writeFile(book, `modelo-frotagov-${mod.id}.xlsx`);
}

function exampleFor(f: ImportField) {
  switch (f.type) {
    case "money":
      return "1.234,56";
    case "liters":
      return "45,0000";
    case "number":
      return "125000";
    case "int":
      return "2024";
    case "date":
      return "31/12/2026";
    case "datetime":
      return "31/12/2026 14:30";
    case "cpf":
      return "000.000.000-00";
    case "cnpj":
      return "00.000.000/0000-00";
    case "plate":
      return "ABC1D23";
    case "enum":
      return f.options?.[0] ?? "";
    default:
      return "";
  }
}

export function fieldHint(f: ImportField) {
  const parts: string[] = [];
  if (f.required) parts.push("obrigatório");
  if (f.ref) parts.push("deve existir no FrotaGov");
  if (f.type === "money") parts.push("valor no padrão 1.234,56");
  if (f.type === "liters") parts.push("litros no padrão 1.234,5678");
  if (f.type === "date" || f.type === "datetime") parts.push("data dd/mm/aaaa");
  if (f.type === "cpf") parts.push("CPF válido");
  if (f.type === "cnpj") parts.push("CNPJ válido");
  if (f.options) parts.push(`valores: ${f.options.join(", ")}`);
  if (f.hint) parts.push(f.hint);
  return parts.join(" — ");
}

/* --------------------------------- validação --------------------------------- */

export type LookupItem = { id: string; keys: string[]; label: string; extra?: Record<string, unknown> };
export type Lookups = Partial<Record<RefKind, LookupItem[]>>;

export type RowIssue = { field: string; label: string; value: string; reason: string; level: "erro" | "aviso" };
export type ValidatedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: Record<string, string>;
  status: "valido" | "aviso" | "erro" | "duplicado";
  issues: RowIssue[];
  duplicateOf?: string | null;
};

const normKey = (v: string) => slug(v);

/** Índice de busca de referências: aceita nome, sigla, placa, CPF/CNPJ etc. */
export function buildLookup(items: LookupItem[]) {
  const index = new Map<string, LookupItem>();
  for (const item of items) for (const k of item.keys) if (k) index.set(normKey(k), item);
  return index;
}

function parseDateBR(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(raw);
  if (br) {
    const [, d, m, y] = br;
    const year = y!.length === 2 ? `20${y}` : y!;
    const dd = d!.padStart(2, "0");
    const mm = m!.padStart(2, "0");
    if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
    return `${year}-${mm}-${dd}`;
  }
  return null;
}

function parseDateTimeBR(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return new Date(raw).toISOString();
  const [datePart, timePart] = raw.split(/[ T]/);
  const date = parseDateBR(datePart ?? "");
  if (!date) return null;
  const time = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(timePart ?? "");
  const hh = time ? time[1]!.padStart(2, "0") : "12";
  const mi = time ? time[2] : "00";
  const ss = time?.[3] ?? "00";
  const built = new Date(`${date}T${hh}:${mi}:${ss}`);
  return Number.isNaN(built.getTime()) ? null : built.toISOString();
}

export const normalizePlate = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type ValidateOptions = {
  mod: ImportModule;
  mapping: Record<string, string>;
  rows: Record<string, string>[];
  lookups: Lookups;
  /** Índice de registros já existentes: chave normalizada → id. */
  existing: Map<string, string>;
  duplicateStrategy: string;
};

/**
 * Valida todas as linhas sem gravar nada nas tabelas operacionais.
 * Devolve as linhas normalizadas prontas para a gravação transacional.
 */
export function validateRows({
  mod,
  mapping,
  rows,
  lookups,
  existing,
  duplicateStrategy,
}: ValidateOptions): ValidatedRow[] {
  const indexes: Partial<Record<RefKind, Map<string, LookupItem>>> = {};
  (Object.keys(lookups) as RefKind[]).forEach((k) => {
    indexes[k] = buildLookup(lookups[k] ?? []);
  });
  const seen = new Map<string, number>();

  return rows.map((raw, i) => {
    const issues: RowIssue[] = [];
    const normalized: Record<string, string> = {};

    for (const field of mod.fields) {
      const column = mapping[field.key];
      const value = (column ? (raw[column] ?? "") : "").trim();

      if (!value) {
        if (field.required) {
          issues.push({
            field: field.key,
            label: field.label,
            value: "",
            reason: "Campo obrigatório não preenchido",
            level: "erro",
          });
        }
        continue;
      }

      switch (field.type) {
        case "money":
        case "liters":
        case "number": {
          const n = parseBRNumber(value);
          if (!Number.isFinite(n) || (n === 0 && !/^0([.,]0+)?$/.test(value.replace(/\s/g, "")))) {
            issues.push({ field: field.key, label: field.label, value, reason: "Valor numérico inválido", level: "erro" });
            continue;
          }
          if (n < 0) {
            issues.push({ field: field.key, label: field.label, value, reason: "Valor não pode ser negativo", level: "erro" });
            continue;
          }
          normalized[field.key] = String(n);
          break;
        }
        case "int": {
          const n = Math.trunc(parseBRNumber(value));
          if (!n) {
            issues.push({ field: field.key, label: field.label, value, reason: "Número inteiro inválido", level: "erro" });
            continue;
          }
          normalized[field.key] = String(n);
          break;
        }
        case "date": {
          const d = parseDateBR(value);
          if (!d) {
            issues.push({ field: field.key, label: field.label, value, reason: "Data inválida (use dd/mm/aaaa)", level: "erro" });
            continue;
          }
          normalized[field.key] = d;
          break;
        }
        case "datetime": {
          const d = parseDateTimeBR(value);
          if (!d) {
            issues.push({
              field: field.key,
              label: field.label,
              value,
              reason: "Data/hora inválida (use dd/mm/aaaa hh:mm)",
              level: "erro",
            });
            continue;
          }
          if (new Date(d).getTime() > Date.now() + 86_400_000) {
            issues.push({ field: field.key, label: field.label, value, reason: "Data futura em registro histórico", level: "aviso" });
          }
          normalized[field.key] = d;
          break;
        }
        case "cpf": {
          if (!isValidCPF(value)) {
            issues.push({ field: field.key, label: field.label, value, reason: "CPF inválido", level: "erro" });
            continue;
          }
          normalized[field.key] = onlyDigits(value);
          break;
        }
        case "cnpj": {
          if (!isValidCNPJ(value)) {
            issues.push({ field: field.key, label: field.label, value, reason: "CNPJ inválido", level: "erro" });
            continue;
          }
          normalized[field.key] = onlyDigits(value);
          break;
        }
        case "doc": {
          const digits = onlyDigits(value);
          const ok = digits.length === 11 ? isValidCPF(digits) : digits.length === 14 ? isValidCNPJ(digits) : false;
          if (!ok) {
            issues.push({ field: field.key, label: field.label, value, reason: "CPF/CNPJ inválido", level: "erro" });
            continue;
          }
          normalized[field.key] = digits;
          break;
        }
        case "plate": {
          const plate = normalizePlate(value);
          if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) {
            issues.push({ field: field.key, label: field.label, value, reason: "Placa fora do padrão brasileiro", level: "erro" });
            continue;
          }
          normalized[field.key] = plate;
          break;
        }
        case "enum": {
          const candidate = slug(value);
          const match = field.options?.find((o) => slug(o) === candidate);
          if (!match) {
            issues.push({
              field: field.key,
              label: field.label,
              value,
              reason: `Valor não aceito. Use: ${field.options?.join(", ")}`,
              level: "erro",
            });
            continue;
          }
          normalized[field.key] = match;
          break;
        }
        default:
          normalized[field.key] = value;
      }

      // referência a outro cadastro do órgão
      if (field.ref && normalized[field.key]) {
        const index = indexes[field.ref];
        const hit = index?.get(normKey(normalized[field.key]!));
        if (!hit) {
          issues.push({
            field: field.key,
            label: field.label,
            value,
            reason: `Não encontrado no FrotaGov. Importe ${refLabel(field.ref)} antes deste módulo.`,
            level: field.required ? "erro" : "aviso",
          });
          if (field.required) continue;
          delete normalized[field.key];
        }
      }
    }

    // duplicidade — dentro do próprio arquivo e contra o que já existe no órgão
    let duplicateOf: string | null = null;
    if (mod.dedupe.length) {
      for (const key of mod.dedupe) {
        const value = normalized[key];
        if (!value) continue;
        const composed = `${key}:${normKey(value)}`;
        const already = existing.get(composed);
        if (already) {
          duplicateOf = already;
          issues.push({
            field: key,
            label: mod.fields.find((f) => f.key === key)?.label ?? key,
            value,
            reason: "Registro já existe no órgão",
            level: duplicateStrategy === "rejeitar" ? "erro" : "aviso",
          });
          break;
        }
        const repeated = seen.get(composed);
        if (repeated) {
          issues.push({
            field: key,
            label: mod.fields.find((f) => f.key === key)?.label ?? key,
            value,
            reason: `Repetido na linha ${repeated} do próprio arquivo`,
            level: "erro",
          });
          break;
        }
        seen.set(composed, i + 2);
      }
    }

    // coerências específicas
    if (mod.id === "utilizacoes" && normalized["start_km"] && normalized["end_km"]) {
      if (Number(normalized["end_km"]) < Number(normalized["start_km"])) {
        issues.push({ field: "end_km", label: "KM final", value: normalized["end_km"]!, reason: "KM final menor que o inicial", level: "erro" });
      }
    }
    if (mod.id === "contratos" && normalized["valid_from"] && normalized["valid_to"]) {
      if (normalized["valid_to"]! < normalized["valid_from"]!) {
        issues.push({ field: "valid_to", label: "Fim da vigência", value: normalized["valid_to"]!, reason: "Fim da vigência anterior ao início", level: "erro" });
      }
    }
    if (mod.id === "seguros" && normalized["valid_from"] && normalized["valid_to"]) {
      if (normalized["valid_to"]! < normalized["valid_from"]!) {
        issues.push({ field: "valid_to", label: "Fim da vigência", value: normalized["valid_to"]!, reason: "Fim da vigência anterior ao início", level: "erro" });
      }
    }

    const hasError = issues.some((x) => x.level === "erro");
    const status: ValidatedRow["status"] = hasError
      ? "erro"
      : duplicateOf
        ? "duplicado"
        : issues.length
          ? "aviso"
          : "valido";

    return { rowNumber: i + 2, raw, normalized, status, issues, duplicateOf };
  });
}

function refLabel(ref: RefKind) {
  switch (ref) {
    case "unit":
      return "as secretarias/unidades";
    case "vehicle":
      return "os veículos";
    case "supplier":
      return "os fornecedores";
    case "driver":
      return "os condutores";
    case "fuel":
      return "os combustíveis/produtos";
    case "contract":
      return "os contratos";
    case "cost_center":
      return "os centros de custo";
  }
}

export function summarize(rows: ValidatedRow[]) {
  return {
    total: rows.length,
    valid: rows.filter((r) => r.status === "valido").length,
    warning: rows.filter((r) => r.status === "aviso").length,
    error: rows.filter((r) => r.status === "erro").length,
    duplicate: rows.filter((r) => r.status === "duplicado").length,
  };
}

/** Baixa a planilha de erros com linha, campo, valor recebido e motivo. */
export function downloadIssues(mod: ImportModule, rows: ValidatedRow[]) {
  const aoa: unknown[][] = [["Linha", "Situação", "Campo", "Valor recebido", "Motivo"]];
  for (const row of rows) {
    for (const issue of row.issues) {
      aoa.push([row.rowNumber, row.status, issue.label, issue.value, issue.reason]);
    }
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [{ wch: 8 }, { wch: 12 }, { wch: 28 }, { wch: 28 }, { wch: 60 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Ocorrências");
  XLSX.writeFile(book, `ocorrencias-${mod.id}.xlsx`);
}
