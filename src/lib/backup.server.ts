/**
 * Bloco D — motor de backup externo diário do FrotaGov.
 *
 * Executa exclusivamente no servidor. Nunca grava, devolve ou registra em log
 * qualquer credencial: as chaves ficam em segredos de ambiente e apenas o
 * NOME do segredo é guardado na configuração do órgão.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = SupabaseClient<any, any, any>;

export const APP_SCHEMA_VERSION = "11.0.0";

/** Tabelas do órgão copiadas no backup relacional. */
export const BACKUP_TABLES = [
  // Órgão, estrutura e usuários
  "organizations",
  "units",
  "cost_centers",
  "profiles",
  "user_roles",
  "org_counters",

  // Frota
  "vehicles",
  "equipment_types",
  "vehicle_status_history",
  "vehicle_usages",
  "vehicle_obligations",
  "vehicle_cleanings",
  "cleaning_types",
  "drivers",
  "asset_movements",
  "meter_corrections",

  // Diárias
  "diaries",
  "diary_proofs",

  // Pessoas, empresas e rede
  "suppliers",
  "supplier_contracts",
  "external_entities",
  "workshops",
  "accredited_partners",
  "partner_users",
  "partner_captures",
  "asset_cards",
  "asset_card_uses",

  // Abastecimento
  "fuel_types",
  "fuel_limits",
  "fuel_authorizations",
  "fuelings",
  "fueling_alerts",
  "server_fuel_quotas",

  // Contratos e orçamento
  "contracts",
  "contract_items",
  "contract_periods",
  "contract_amendments",
  "commitments",
  "commitment_movements",
  "quotas",
  "quota_supplements",
  "budget_movements",
  "opening_balances",

  // Manutenção
  "maintenance_plans",
  "maintenance_plan_items",
  "maintenance_requests",
  "maintenance_records",
  "maintenance_parts",
  "maintenance_settings",
  "service_orders",
  "service_order_items",

  // Compras e cotações
  "quotations",
  "quotation_items",
  "quotation_invitations",
  "quotation_proposals",
  "quotation_proposal_items",

  // Peças, pneus e almoxarifado
  "parts_catalog",
  "part_compatibilities",
  "compatibility_overrides",
  "tires",
  "tire_movements",
  "supply_orders",
  "supply_order_items",
  "warehouses",
  "stock_balances",
  "stock_movements",
  "stock_reservations",
  "inventories",
  "inventory_items",

  // Jurídico / patrimonial
  "traffic_fines",
  "accidents",
  "insurance_policies",
  "insurance_vehicles",

  // Inteligência e sustentabilidade
  "consumption_parameters",
  "intelligence_settings",
  "asset_market_values",
  "emission_factors",

  // Transparência
  "transparency_settings",
  "transparency_periods",
  "transparency_publications",
  "transparency_reopen_requests",
  "transparency_delivery_attempts",

  // Migração e relatórios
  "import_batches",
  "import_rows",
  "report_presets",

  // Integrações
  "integration_connectors",
  "integration_mappings",
  "integration_logs",
  "detran_snapshots",
  "webhook_endpoints",
  "webhook_deliveries",

  // Identidade institucional
  "sso_providers",
  "sso_claim_mappings",
  "ldap_directories",
  "ldap_group_mappings",
  "auth_login_events",

  // Auditoria
  "activity_logs",
  "audit_logs",
] as const;

/** Colunas nunca exportadas (hashes e material sensível de autenticação). */
const REDACTED_COLUMNS: Record<string, string[]> = {
  org_api_keys: ["key_hash"],
};

/** Buckets privados cujos arquivos pertencem ao órgão pelo prefixo `<orgId>/`. */
export const BACKUP_BUCKETS = ["brasoes", "comprovantes", "contratos", "manutencao", "frota"];

const MAX_FILES = 800;
const MAX_FILE_BYTES = 150 * 1024 * 1024;

export type BackupSettingsRow = {
  id: string;
  organization_id: string;
  enabled: boolean;
  hour: number;
  minute: number;
  timezone: string;
  include_database: boolean;
  include_storage: boolean;
  retention_daily: number;
  retention_weekly: number;
  retention_monthly: number;
  retention_days: number | null;
  destination_kind: "sftp" | "s3" | "plataforma";
  platform_copy: boolean;
  sftp_host: string | null;
  sftp_port: number | null;
  sftp_user: string | null;
  sftp_base_path: string | null;
  s3_endpoint: string | null;
  s3_region: string | null;
  s3_bucket: string | null;
  s3_prefix: string | null;
  credentials_secret_name: string | null;
};

/* ------------------------------ utilitários ----------------------------- */

const enc = new TextEncoder();

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string) {
  const buffer = typeof data === "string" ? enc.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", buffer as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Remove qualquer valor parecido com segredo antes de gravar log técnico. */
export function sanitizeLog(text: string) {
  return text
    .replace(/(?:password|senha|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization)\s*[:=]\s*\S+/gi, "$&".replace(/[:=]\s*\S+/, ": ***"))
    .replace(/AKIA[0-9A-Z]{12,}/g, "***")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "***")
    .replace(/sb_secret_[\w-]+/g, "***")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "***")
    .slice(0, 8000);
}

export function cycleKeyFor(settings: Pick<BackupSettingsRow, "hour" | "minute" | "timezone">, at = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const hh = String(settings.hour).padStart(2, "0");
  const mm = String(settings.minute).padStart(2, "0");
  return `${day}T${hh}:${mm}`;
}

/** Próxima execução prevista, em ISO, considerando o fuso do órgão. */
export function nextRunAt(settings: Pick<BackupSettingsRow, "hour" | "minute" | "timezone">, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const passed = hour * 60 + minute >= settings.hour * 60 + settings.minute;
  const base = new Date(at.getTime() + (passed ? 24 * 60 * 60 * 1000 : 0));
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone }).format(base);
  return `${day} ${String(settings.hour).padStart(2, "0")}:${String(settings.minute).padStart(2, "0")}`;
}

/** Caminho organizado no destino: /frotagov/<orgao>/<AAAA>/<MM>/<arquivo>. */
export function destinationPath(base: string, orgSlug: string, when: Date) {
  const year = when.getUTCFullYear();
  const month = String(when.getUTCMonth() + 1).padStart(2, "0");
  const clean = base.replace(/\/+$/, "");
  return `${clean}/${orgSlug}/${year}/${month}`;
}

export function orgSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "orgao";
}

/* --------------------------- credenciais (env) -------------------------- */

export type Credentials = Record<string, string>;

/**
 * Lê as credenciais do destino a partir do segredo de ambiente indicado.
 * O valor deve ser um JSON. Nunca é devolvido ao navegador nem registrado.
 */
export function readCredentials(secretName: string | null | undefined): Credentials | null {
  if (!secretName) return null;
  const raw = process.env[secretName];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Credentials;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/* ------------------------------ S3 (SigV4) ------------------------------ */

async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
}

export async function s3Request(
  settings: BackupSettingsRow,
  creds: Credentials,
  method: "PUT" | "HEAD" | "GET",
  key: string,
  body?: Uint8Array,
) {
  const region = settings.s3_region || creds["region"] || "us-east-1";
  const bucket = settings.s3_bucket!;
  const endpoint = (settings.s3_endpoint || `https://s3.${region}.amazonaws.com`).replace(/\/+$/, "");
  const host = new URL(endpoint).host;
  const url = `${endpoint}/${bucket}/${key.replace(/^\/+/, "")}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body ?? new Uint8Array());

  const canonicalUri = new URL(url).pathname
    .split("/")
    .map((s) => encodeURIComponent(decodeURIComponent(s)))
    .join("/");
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`;

  const kDate = await hmac(enc.encode(`AWS4${creds["secret_access_key"] ?? ""}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = Array.from(new Uint8Array(await hmac(kSigning, stringToSign)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${creds["access_key_id"] ?? ""}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (body) headers["content-type"] = "application/json";

  return fetch(url, { method, headers, ...(body ? { body: body as unknown as BodyInit } : {}) });
}

/* -------------------------- coleta e empacotamento ---------------------- */

type Collected = {
  bundle: Uint8Array;
  manifest: Record<string, unknown>;
  recordCount: number;
  fileCount: number;
  warnings: string[];
};

async function collect(admin: Admin, settings: BackupSettingsRow, org: { id: string; legal_name: string }): Promise<Collected> {
  const warnings: string[] = [];
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  let recordCount = 0;

  if (settings.include_database) {
    for (const table of BACKUP_TABLES) {
      const column = table === "organizations" ? "id" : "organization_id";
      const { data: rows, error } = await admin.from(table).select("*").eq(column, org.id);
      if (error) {
        warnings.push(`Tabela ${table}: ${error.message}`);
        continue;
      }
      const redact = REDACTED_COLUMNS[table] ?? [];
      const clean = (rows ?? []).map((r: Record<string, unknown>) => {
        if (!redact.length) return r;
        const copy = { ...r };
        for (const c of redact) copy[c] = "***";
        return copy;
      });
      data[table] = clean;
      counts[table] = clean.length;
      recordCount += clean.length;
    }
  }

  const files: {
    bucket: string;
    path: string;
    size: number | null;
    updated_at: string | null;
    content_base64?: string | null;
    checksum?: string | null;
  }[] = [];
  let fileBytes = 0;
  if (settings.include_storage) {
    for (const bucket of BACKUP_BUCKETS) {
      const stack = [`${org.id}`];
      while (stack.length) {
        const prefix = stack.pop()!;
        const { data: entries, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
        if (error) {
          warnings.push(`Anexos ${bucket}: ${error.message}`);
          break;
        }
        for (const entry of entries ?? []) {
          const full = `${prefix}/${entry.name}`;
          if (!entry.id) {
            stack.push(full);
            continue;
          }
          const size = (entry.metadata as { size?: number } | null)?.size ?? null;

let contentBase64: string | null = null;
let fileChecksum: string | null = null;

if ((fileBytes + (size ?? 0)) <= MAX_FILE_BYTES) {
  const { data: downloaded, error: downloadError } =
    await admin.storage.from(bucket).download(full);

  if (downloadError || !downloaded) {
    warnings.push(`Arquivo ${bucket}/${full}: não foi possível copiar o conteúdo.`);
  } else {
    const bytes = new Uint8Array(await downloaded.arrayBuffer());

    contentBase64 = Buffer.from(bytes).toString("base64");
    fileChecksum = await sha256Hex(bytes);
  }
}

files.push({
  bucket,
  path: full,
  size,
  updated_at: entry.updated_at ?? null,
  content_base64: contentBase64,
  checksum: fileChecksum,
});

fileBytes += size ?? 0;
          if (files.length >= MAX_FILES) break;
        }
        if (files.length >= MAX_FILES) break;
      }
    }
    if (files.length >= MAX_FILES) warnings.push(`Inventário de anexos limitado a ${MAX_FILES} arquivos nesta execução.`);
    if (fileBytes > MAX_FILE_BYTES)
      warnings.push("Volume de anexos acima do limite do pacote: os arquivos foram inventariados com caminho e tamanho, sem cópia binária embutida.");
  }

  const manifest = {
    organization_id: org.id,
    organization_name: org.legal_name,
    generated_at: new Date().toISOString(),
    app_schema_version: APP_SCHEMA_VERSION,
    include_database: settings.include_database,
    include_storage: settings.include_storage,
    tables: counts,
    record_count: recordCount,
    file_count: files.length,
    file_bytes: fileBytes,
    warnings,
  };

  const bundle = enc.encode(JSON.stringify({ manifest, data, files }));
  return { bundle, manifest, recordCount, fileCount: files.length, warnings };
}

/* ------------------------------- execução ------------------------------- */

export type RunOptions = {
  kind: "automatico" | "manual" | "teste";
  reason?: string | null;
  requestedBy?: string | null;
  cycleKey?: string;
};

/**
 * Executa o backup de um órgão. É a MESMA rotina usada pelo agendamento
 * automático e pelo "Fazer backup agora".
 *
 * Idempotência e execução única: a chave de ciclo é única por órgão, então uma
 * segunda chamada no mesmo ciclo é rejeitada pelo banco e retorna `duplicated`.
 */
export async function runBackup(
  admin: Admin,
  organizationId: string,
  options: RunOptions,
): Promise<{ runId: string | null; status: string; duplicated?: boolean; message: string }> {
  const { data: settings } = await admin
    .from("backup_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!settings) return { runId: null, status: "falhou", message: "Órgão sem configuração de backup." };
  const config = settings as BackupSettingsRow;

  const { data: org } = await admin
    .from("organizations")
    .select("id, legal_name")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return { runId: null, status: "falhou", message: "Órgão não encontrado." };

  const cycleKey =
    options.cycleKey ??
    (options.kind === "automatico" ? cycleKeyFor(config) : `${options.kind}-${new Date().toISOString()}`);

  const startedAt = new Date();
  const { data: run, error: insertError } = await admin
    .from("backup_runs")
    .insert({
      organization_id: organizationId,
      cycle_key: cycleKey,
      kind: options.kind,
      status: "em_execucao",
      scheduled_for: startedAt.toISOString(),
      started_at: startedAt.toISOString(),
      included_database: config.include_database,
      included_storage: config.include_storage,
      destination_kind: config.destination_kind,
      reason: options.reason ?? null,
      requested_by: options.requestedBy ?? null,
    })
    .select("id")
    .single();

  if (insertError || !run) {
    const duplicated = (insertError?.code ?? "") === "23505";
    return {
      runId: null,
      status: duplicated ? "duplicado" : "falhou",
      duplicated,
      message: duplicated
        ? "Já existe execução para este ciclo; nada foi feito."
        : sanitizeLog(insertError?.message ?? "Não foi possível iniciar a execução."),
    };
  }

  const log: string[] = [];
  try {
    const collected = await collect(admin, config, org as { id: string; legal_name: string });
    log.push(
      `Coleta concluída: ${collected.recordCount} registros, ${collected.fileCount} anexos processados.`,
    );

    const checksum = await sha256Hex(collected.bundle);
    const slug = orgSlug((org as { legal_name: string }).legal_name);
    const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
    const fileName = `frotagov-${slug}-${stamp}.json`;

    const warnings = [...collected.warnings];
    let objectKey: string | null = null;
    let path: string | null = null;

    // Cópia gerenciada na plataforma (sempre que solicitada ou como destino principal).
    if (config.platform_copy || config.destination_kind === "plataforma") {
      const platformPath = `${organizationId}/${startedAt.getUTCFullYear()}/${String(startedAt.getUTCMonth() + 1).padStart(2, "0")}/${fileName}`;
      const { error } = await admin.storage
        .from("backups")
        .upload(platformPath, collected.bundle as unknown as Blob, { contentType: "application/json", upsert: false });
      if (error) throw new Error(`Cópia na plataforma: ${error.message}`);
      objectKey = platformPath;
      path = `backups/${platformPath}`;
      log.push("Cópia gravada no armazenamento privado da plataforma.");
    }

    if (config.destination_kind === "s3") {
      const creds = readCredentials(config.credentials_secret_name);
      if (!creds?.["access_key_id"] || !creds["secret_access_key"])
        throw new Error(`Credenciais do destino S3 ausentes no segredo "${config.credentials_secret_name ?? "não informado"}".`);
      const key = `${destinationPath(config.s3_prefix || "frotagov", slug, startedAt)}/${fileName}`.replace(/^\/+/, "");
      const response = await s3Request(config, creds, "PUT", key, collected.bundle);
      if (!response.ok) throw new Error(`Destino S3 recusou o envio (HTTP ${response.status}).`);
      objectKey = key;
      path = `s3://${config.s3_bucket}/${key}`;
      log.push("Cópia enviada ao destino S3 compatível.");
    }

    if (config.destination_kind === "sftp") {
      // O runtime serverless não abre conexões SSH/SFTP. O pacote fica na
      // plataforma e é coletado pelo agente do servidor próprio.
      warnings.push(
        `Destino SFTP: o pacote ficou disponível na plataforma para coleta pelo agente em ${destinationPath(config.sftp_base_path || "/frotagov", slug, startedAt)}/${fileName}. O envio SSH não é executado pelo servidor da aplicação.`,
      );
      log.push("Destino SFTP configurado: entrega delegada ao agente externo.");
    }

    const finishedAt = new Date();
    const status = warnings.length ? "concluido_com_aviso" : "concluido";
    const { error: finalizeError } = await admin
      .from("backup_runs")
      .update({
        status,
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        total_bytes: collected.bundle.byteLength,
        record_count: collected.recordCount,
        file_count: collected.fileCount,
        destination_path: path,
        object_key: objectKey,
        checksum,
        integrity_valid: true,
        integrity_checked_at: finishedAt.toISOString(),
        manifest: { ...collected.manifest, warnings },
        tech_log: sanitizeLog(log.join("\n")),
        error_summary: warnings.length ? sanitizeLog(warnings.join(" | ")) : null,
      })
      .eq("id", run.id);
    if (finalizeError) throw new Error(`Registro da execução: ${finalizeError.message}`);

    return { runId: run.id, status, message: warnings.length ? warnings.join(" | ") : "Backup concluído." };
  } catch (error) {
    const finishedAt = new Date();
    const message = sanitizeLog(error instanceof Error ? error.message : "Falha desconhecida.");
    console.error("[backup] falha:", message);
    await admin
      .from("backup_runs")
      .update({
        status: "falhou",
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        error_summary: message,
        tech_log: sanitizeLog(log.join("\n")),
      })
      .eq("id", run.id);
    return { runId: run.id, status: "falhou", message };
  }
}

/** Teste de conexão com o destino, sem revelar credenciais. */
export async function testDestination(settings: BackupSettingsRow): Promise<{ ok: boolean; message: string }> {
  if (settings.destination_kind === "plataforma") {
    return { ok: true, message: "Armazenamento privado da plataforma disponível." };
  }
  const creds = readCredentials(settings.credentials_secret_name);
  if (!creds) {
    return {
      ok: false,
      message: `Segredo "${settings.credentials_secret_name ?? "não informado"}" não encontrado ou fora do formato JSON esperado.`,
    };
  }
  if (settings.destination_kind === "s3") {
    if (!settings.s3_bucket) return { ok: false, message: "Bucket S3 não informado." };
    if (!creds["access_key_id"] || !creds["secret_access_key"])
      return { ok: false, message: "O segredo não contém access_key_id e secret_access_key." };
    try {
      const key = `${(settings.s3_prefix || "frotagov").replace(/\/+$/, "")}/.frotagov-conexao`;
      const response = await s3Request(settings, creds, "PUT", key, enc.encode("ok"));
      return response.ok
        ? { ok: true, message: "Conexão com o destino S3 validada com gravação de teste." }
        : { ok: false, message: `Destino S3 respondeu HTTP ${response.status}.` };
    } catch (error) {
      return { ok: false, message: sanitizeLog(error instanceof Error ? error.message : "Falha na conexão S3.") };
    }
  }
  // SFTP
  if (!settings.sftp_host || !settings.sftp_user)
    return { ok: false, message: "Host e usuário SFTP são obrigatórios." };
  if (!creds["password"] && !creds["private_key"])
    return { ok: false, message: "O segredo não contém password nem private_key." };
  return {
    ok: false,
    message:
      "Configuração SFTP completa, porém o servidor da aplicação não abre conexões SSH: o teste efetivo deve ser feito pelo agente instalado no servidor de destino.",
  };
}
