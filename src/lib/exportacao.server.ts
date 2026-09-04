/**
 * Exportação integral de dados por órgão (migração, auditoria e integração).
 *
 * Executa apenas no servidor. Nunca exporta senhas, hashes, tokens, códigos de
 * segurança de cartão/autorização, chaves de API ou credenciais de backup.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { zipSync, strToU8 } from "fflate";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = SupabaseClient<any, any, any>;
type Row = Record<string, unknown>;

export const EXPORT_SCHEMA_VERSION = "1.0.0";
export const EXPORT_APP_VERSION = "10.6.0";
export const CSV_DELIMITER = ";";
export const CSV_ENCODING = "UTF-8 (com BOM)";

/** Colunas jamais exportadas, em qualquer tabela. */
const FORBIDDEN_COLUMNS = new Set([
  "security_code",
  "qr_token",
  "key_hash",
  "token_hash",
  "password",
  "password_hash",
  "credentials_secret_name",
  "integration_secret_name",
  "access_token",
  "refresh_token",
  "webhook_secret",
  "secret",
]);

/** Tabelas técnicas/efêmeras ou de segredos que não entram no pacote. */
const EXCLUDED_TABLES = new Set(["org_api_keys", "cron_secrets", "platform_sessions", "platform_settings"]);

type ModuleDef = {
  /** Nome do arquivo (sem extensão) dentro da pasta. */
  file: string;
  /** Pasta lógica dentro do ZIP. */
  folder: string;
  /** Tabelas que compõem o arquivo (uma tabela por arquivo, sempre). */
  table: string;
  /** Ordena o CSV por esta coluna quando existir. */
  orderBy?: string;
  /** Gera também JSON estruturado (estruturas relacionais complexas). */
  json?: boolean;
};

/**
 * Mapa módulo → tabela. Um arquivo por conjunto tabular, com nome legível.
 * Cobre todos os módulos das Fases 1–10 (inclusive Blocos 3 e 4).
 */
export const EXPORT_MODULES: ModuleDef[] = [
  { folder: "01_orgao", file: "dados_do_orgao", table: "organizations", json: true },
  { folder: "01_orgao", file: "secretarias_unidades", table: "units" },
  { folder: "01_orgao", file: "usuarios_perfis", table: "profiles" },
  { folder: "01_orgao", file: "usuarios_papeis", table: "user_roles" },
  { folder: "01_orgao", file: "centros_de_custo", table: "cost_centers" },
  { folder: "01_orgao", file: "contadores_numeracao", table: "org_counters" },

  { folder: "02_frota", file: "veiculos", table: "vehicles", json: true },
  { folder: "02_frota", file: "maquinas_e_equipamentos_tipos", table: "equipment_types" },
  { folder: "02_frota", file: "condutores_motoristas", table: "drivers" },
  { folder: "02_frota", file: "historico_veiculos_e_equipamentos", table: "vehicle_status_history" },
  { folder: "02_frota", file: "utilizacoes_reservas", table: "vehicle_usages" },
  { folder: "02_frota", file: "obrigacoes_legais", table: "vehicle_obligations" },
  { folder: "02_frota", file: "higienizacoes", table: "vehicle_cleanings" },
  { folder: "02_frota", file: "higienizacoes_tipos", table: "cleaning_types" },
  { folder: "02_frota", file: "movimentacoes_patrimoniais", table: "asset_movements" },
  { folder: "02_frota", file: "pneus", table: "tires" },
  { folder: "02_frota", file: "pneus_movimentacoes", table: "tire_movements" },

  { folder: "03_abastecimento", file: "combustiveis_produtos", table: "fuel_types" },
  { folder: "03_abastecimento", file: "fornecedores_postos", table: "suppliers" },
  { folder: "03_abastecimento", file: "fornecedores_contratos", table: "supplier_contracts" },
  { folder: "03_abastecimento", file: "autorizacoes_abastecimento", table: "fuel_authorizations", json: true },
  { folder: "03_abastecimento", file: "abastecimentos", table: "fuelings", json: true },
  { folder: "03_abastecimento", file: "limites_abastecimento", table: "fuel_limits" },
  { folder: "03_abastecimento", file: "cotas_servidor", table: "server_fuel_quotas" },
  { folder: "03_abastecimento", file: "correcoes_de_medidor", table: "meter_corrections" },

  { folder: "04_contratos_orcamento", file: "contratos", table: "contracts", json: true },
  { folder: "04_contratos_orcamento", file: "contratos_itens", table: "contract_items" },
  { folder: "04_contratos_orcamento", file: "contratos_periodos", table: "contract_periods" },
  { folder: "04_contratos_orcamento", file: "contratos_aditivos", table: "contract_amendments" },
  { folder: "04_contratos_orcamento", file: "empenhos", table: "commitments" },
  { folder: "04_contratos_orcamento", file: "empenhos_movimentacoes", table: "commitment_movements" },
  { folder: "04_contratos_orcamento", file: "cotas", table: "quotas" },
  { folder: "04_contratos_orcamento", file: "cotas_suplementacoes", table: "quota_supplements" },
  { folder: "04_contratos_orcamento", file: "movimentacoes_orcamentarias", table: "budget_movements", json: true },
  { folder: "04_contratos_orcamento", file: "saldos_iniciais", table: "opening_balances" },

  { folder: "05_manutencao", file: "manutencoes", table: "maintenance_records", json: true },
  { folder: "05_manutencao", file: "manutencoes_pecas_aplicadas", table: "maintenance_parts" },
  { folder: "05_manutencao", file: "manutencoes_solicitacoes", table: "maintenance_requests" },
  { folder: "05_manutencao", file: "planos_preventivos", table: "maintenance_plans" },
  { folder: "05_manutencao", file: "planos_preventivos_itens", table: "maintenance_plan_items" },
  { folder: "05_manutencao", file: "manutencao_configuracoes", table: "maintenance_settings" },
  { folder: "05_manutencao", file: "oficinas", table: "workshops" },
  { folder: "05_manutencao", file: "ordens_de_servico", table: "service_orders", json: true },
  { folder: "05_manutencao", file: "ordens_de_servico_itens", table: "service_order_items" },

  { folder: "06_compras", file: "cotacoes", table: "quotations", json: true },
  { folder: "06_compras", file: "cotacoes_itens", table: "quotation_items" },
  { folder: "06_compras", file: "cotacoes_convites", table: "quotation_invitations" },
  { folder: "06_compras", file: "propostas_cotacao", table: "quotation_proposals" },
  { folder: "06_compras", file: "propostas_cotacao_itens", table: "quotation_proposal_items" },

  { folder: "07_legal_patrimonial", file: "multas_infracoes", table: "traffic_fines" },
  { folder: "07_legal_patrimonial", file: "acidentes_sinistros", table: "accidents" },
  { folder: "07_legal_patrimonial", file: "seguros_apolices", table: "insurance_policies" },
  { folder: "07_legal_patrimonial", file: "seguros_coberturas_veiculos", table: "insurance_vehicles" },
  { folder: "07_legal_patrimonial", file: "entidades_externas", table: "external_entities" },

  { folder: "08_diarias", file: "diarias", table: "diaries", json: true },
  { folder: "08_diarias", file: "diarias_prestacao_de_contas", table: "diary_proofs" },

  { folder: "09_credenciados", file: "rede_credenciada", table: "accredited_partners" },
  { folder: "09_credenciados", file: "usuarios_credenciados", table: "partner_users" },
  { folder: "09_credenciados", file: "capturas_operacionais", table: "partner_captures", json: true },
  { folder: "09_credenciados", file: "cartoes_virtuais", table: "asset_cards" },
  { folder: "09_credenciados", file: "cartoes_virtuais_usos", table: "asset_card_uses" },

  { folder: "10_pecas_almoxarifado", file: "pecas_acessorios", table: "parts_catalog" },
  { folder: "10_pecas_almoxarifado", file: "compatibilidade_pecas", table: "part_compatibilities" },
  { folder: "10_pecas_almoxarifado", file: "compatibilidade_excecoes", table: "compatibility_overrides" },
  { folder: "10_pecas_almoxarifado", file: "ordens_de_fornecimento", table: "supply_orders", json: true },
  { folder: "10_pecas_almoxarifado", file: "ordens_de_fornecimento_itens", table: "supply_order_items" },
  { folder: "10_pecas_almoxarifado", file: "almoxarifados", table: "warehouses" },
  { folder: "10_pecas_almoxarifado", file: "estoque_saldos", table: "stock_balances" },
  { folder: "10_pecas_almoxarifado", file: "estoque_movimentacoes", table: "stock_movements", json: true },
  { folder: "10_pecas_almoxarifado", file: "estoque_reservas", table: "stock_reservations" },
  { folder: "10_pecas_almoxarifado", file: "inventarios", table: "inventories" },
  { folder: "10_pecas_almoxarifado", file: "inventarios_itens", table: "inventory_items" },

  { folder: "11_inteligencia", file: "inteligencia_parametros_consumo", table: "consumption_parameters" },
  { folder: "11_inteligencia", file: "inteligencia_configuracoes", table: "intelligence_settings" },
  { folder: "11_inteligencia", file: "alertas", table: "fueling_alerts" },
  { folder: "11_inteligencia", file: "valor_de_mercado_fipe", table: "asset_market_values", json: true },
  { folder: "11_inteligencia", file: "fatores_de_emissao", table: "emission_factors" },

  { folder: "12_transparencia", file: "transparencia_configuracoes", table: "transparency_settings" },
  { folder: "12_transparencia", file: "transparencia_periodos", table: "transparency_periods" },
  { folder: "12_transparencia", file: "transparencia_publicacoes", table: "transparency_publications" },
  { folder: "12_transparencia", file: "transparencia_reaberturas", table: "transparency_reopen_requests" },
  { folder: "12_transparencia", file: "transparencia_entregas", table: "transparency_delivery_attempts" },

  { folder: "13_administracao", file: "migracoes_import_batches", table: "import_batches" },
  { folder: "13_administracao", file: "migracoes_resultados", table: "import_rows" },
  { folder: "13_administracao", file: "backups_historico", table: "backup_runs" },
  { folder: "13_administracao", file: "backups_restauracoes", table: "backup_restores" },
  { folder: "13_administracao", file: "backups_configuracao", table: "backup_settings" },
  { folder: "13_administracao", file: "relatorios_preferencias", table: "report_presets" },
  { folder: "13_administracao", file: "logs_atividade", table: "activity_logs" },
  { folder: "13_administracao", file: "logs_auditoria", table: "audit_logs" },

  { folder: "14_integracoes", file: "conectores", table: "integration_connectors", json: true },
  { folder: "14_integracoes", file: "integracoes_mapeamentos", table: "integration_mappings", json: true },
  { folder: "14_integracoes", file: "integracoes_historico", table: "integration_logs" },
  { folder: "14_integracoes", file: "detran_consultas", table: "detran_snapshots", json: true },
  { folder: "14_integracoes", file: "webhooks_endpoints", table: "webhook_endpoints" },
  { folder: "14_integracoes", file: "webhooks_entregas", table: "webhook_deliveries", json: true },
];

/* ------------------------------ utilitários ------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

function brDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return value.length <= 10
    ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

const onlyDigits = (v: string) => v.replace(/\D+/g, "");

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Remove chaves proibidas, inclusive dentro de colunas JSON (logs e payloads). */
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Row = {};
    for (const [k, v] of Object.entries(value as Row)) {
      if (FORBIDDEN_COLUMNS.has(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

/** Remove colunas proibidas de uma linha (e de qualquer conteúdo JSON aninhado). */
function sanitize(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (FORBIDDEN_COLUMNS.has(k)) continue;
    out[k] = v && typeof v === "object" ? scrub(v) : v;
  }
  return out;
}

/**
 * Monta o CSV: mantém as colunas originais (numéricas continuam numéricas) e
 * acrescenta colunas auxiliares — datas em pt-BR e documentos só com dígitos.
 */
export function toCsv(rows: Row[], columns: string[]): string {
  const extras: { name: string; from: string; kind: "data" | "digitos" }[] = [];
  const sample = rows.find(Boolean) ?? {};
  for (const c of columns) {
    const v = sample[c];
    if (typeof v === "string" && ISO_DATE.test(v)) extras.push({ name: `${c}_br`, from: c, kind: "data" });
    if (/^(cpf|cnpj|cpf_cnpj|document)$/.test(c)) extras.push({ name: `${c}_digitos`, from: c, kind: "digitos" });
  }
  const header = [...columns, ...extras.map((e) => e.name)];
  const lines = [header.join(CSV_DELIMITER)];
  for (const row of rows) {
    const cells = columns.map((c) => csvCell(row[c]));
    for (const e of extras) {
      const raw = row[e.from];
      cells.push(typeof raw === "string" && raw ? (e.kind === "data" ? brDate(raw) : onlyDigits(raw)) : "");
    }
    lines.push(cells.join(CSV_DELIMITER));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Lê uma tabela inteira do órgão em lotes, para não estourar memória/limites. */
async function fetchTable(
  admin: Admin,
  table: string,
  organizationId: string,
  orderBy?: string,
): Promise<{ rows: Row[]; error?: string }> {
  if (EXCLUDED_TABLES.has(table)) return { rows: [] };
  const rows: Row[] = [];
  const size = 1000;
  for (let page = 0; page < 200; page++) {
    let q = admin.from(table).select("*").range(page * size, page * size + size - 1);
    q = table === "organizations" ? q.eq("id", organizationId) : q.eq("organization_id", organizationId);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    const { data, error } = await q;
    if (error) return { rows, error: error.message };
    const batch = (data ?? []) as Row[];
    rows.push(...batch.map(sanitize));
    if (batch.length < size) break;
  }
  return { rows };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 48);
}

export type ExportResult = {
  fileName: string;
  base64: string;
  bytes: number;
  checksum: string;
  fileCount: number;
  recordCount: number;
  files: { arquivo: string; tabela: string; registros: number; erro?: string }[];
};

/**
 * Coleta todos os dados do órgão e devolve um ZIP pronto para download.
 * O `admin` é usado somente após a autorização do chamador ter sido verificada,
 * e TODA consulta é filtrada por `organization_id`.
 */
export async function buildFullExport(
  admin: Admin,
  organizationId: string,
  requester: { id: string; name: string; email: string | null },
): Promise<ExportResult> {
  const { data: org } = await admin
    .from("organizations")
    .select("id, legal_name, short_name, cnpj")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) throw new Error("Órgão não encontrado.");
  const organization = org as { id: string; legal_name: string; short_name: string | null; cnpj: string | null };

  const generatedAt = new Date();
  const zipFiles: Record<string, Uint8Array> = {};
  const manifestFiles: ExportResult["files"] = [];
  let recordCount = 0;

  for (const mod of EXPORT_MODULES) {
    const { rows, error } = await fetchTable(admin, mod.table, organizationId, mod.orderBy ?? "created_at");
    const fallback =
      rows.length === 0 && error
        ? await fetchTable(admin, mod.table, organizationId)
        : { rows, error: error };
    const finalRows = fallback.rows.length ? fallback.rows : rows;
    const finalError = fallback.error && !finalRows.length ? fallback.error : undefined;

    const columns = finalRows.length
      ? Array.from(new Set(finalRows.flatMap((r) => Object.keys(r))))
      : await columnsOf(admin, mod.table);

    const csvPath = `${mod.folder}/${mod.file}.csv`;
    zipFiles[csvPath] = strToU8(toCsv(finalRows, columns));
    manifestFiles.push({
      arquivo: csvPath,
      tabela: mod.table,
      registros: finalRows.length,
      ...(finalError ? { erro: finalError } : {}),
    });
    recordCount += finalRows.length;

    if (mod.json) {
      const jsonPath = `${mod.folder}/${mod.file}.json`;
      zipFiles[jsonPath] = strToU8(JSON.stringify(finalRows, null, 2));
      manifestFiles.push({ arquivo: jsonPath, tabela: mod.table, registros: finalRows.length });
    }
  }

  const manifest = {
    esquema: { nome: "frotagov-exportacao-completa", versao: EXPORT_SCHEMA_VERSION },
    aplicacao: { nome: "FrotaGov", versao: EXPORT_APP_VERSION },
    orgao: {
      id: organization.id,
      razao_social: organization.legal_name,
      nome_curto: organization.short_name,
      cnpj: organization.cnpj,
      cnpj_digitos: organization.cnpj ? onlyDigits(organization.cnpj) : null,
    },
    exportacao: {
      gerada_em: generatedAt.toISOString(),
      gerada_em_br: brDate(generatedAt.toISOString()),
      solicitada_por: { id: requester.id, nome: requester.name, email: requester.email },
      total_de_arquivos: manifestFiles.length + 2,
      total_de_registros: recordCount,
    },
    csv: { encoding: CSV_ENCODING, delimitador: CSV_DELIMITER, fim_de_linha: "CRLF" },
    aviso_seguranca:
      "Nenhuma senha, hash, token, código de segurança de cartão/autorização, chave de API ou credencial de backup/S3/SFTP foi incluída nesta exportação.",
    arquivos: manifestFiles,
  };

  zipFiles["manifesto_exportacao.json"] = strToU8(JSON.stringify(manifest, null, 2));
  zipFiles["LEIA-ME.txt"] = strToU8(
    [
      "FrotaGov — Exportação completa de dados",
      "=======================================",
      `Órgão: ${organization.legal_name}${organization.short_name ? ` (${organization.short_name})` : ""}`,
      `CNPJ: ${organization.cnpj ?? "não informado"}`,
      `Gerada em: ${brDate(generatedAt.toISOString())} (${generatedAt.toISOString()})`,
      `Solicitada por: ${requester.name}${requester.email ? ` <${requester.email}>` : ""}`,
      `Versão do FrotaGov: ${EXPORT_APP_VERSION} | Esquema da exportação: ${EXPORT_SCHEMA_VERSION}`,
      "",
      `Arquivos: ${manifestFiles.length + 2} | Registros: ${recordCount}`,
      `CSV em ${CSV_ENCODING}, delimitador "${CSV_DELIMITER}", quebra de linha CRLF.`,
      "Datas em ISO 8601; colunas auxiliares com sufixo _br trazem o formato brasileiro.",
      "Documentos trazem coluna auxiliar _digitos apenas com números.",
      "IDs e chaves estrangeiras foram preservados para reconstrução dos vínculos.",
      "Registros ativos, inativos, históricos e cancelados estão incluídos.",
      "",
      "Nenhuma senha, hash, token, código de segurança, chave de API ou credencial",
      "de backup foi incluída neste pacote.",
      "",
      "O detalhamento de arquivos e contagens está em manifesto_exportacao.json.",
    ].join("\n"),
  );

  const zipped = zipSync(zipFiles, { level: 6 });
  const checksum = await sha256Hex(zipped);

  const stamp = `${generatedAt.getFullYear()}${String(generatedAt.getMonth() + 1).padStart(2, "0")}${String(
    generatedAt.getDate(),
  ).padStart(2, "0")}_${String(generatedAt.getHours()).padStart(2, "0")}${String(generatedAt.getMinutes()).padStart(2, "0")}`;
  const fileName = `FrotaGov_Exportacao_Completa_${slugify(organization.short_name ?? organization.legal_name)}_${stamp}.zip`;

  return {
    fileName,
    base64: toBase64(zipped),
    bytes: zipped.length,
    checksum,
    fileCount: Object.keys(zipFiles).length,
    recordCount,
    files: manifestFiles,
  };
}

/** Cabeçalho de tabela vazia: usa o catálogo do banco, sem ler nenhum registro. */
async function columnsOf(admin: Admin, table: string): Promise<string[]> {
  const { data } = await admin.rpc("export_table_columns", { _table: table });
  const cols = (data ?? []) as string[];
  const visible = cols.filter((c) => !FORBIDDEN_COLUMNS.has(c));
  return visible.length ? visible : ["id", "organization_id", "created_at"];
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
