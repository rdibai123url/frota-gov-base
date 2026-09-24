/**
 * Bloco D — funções de servidor do backup externo diário.
 * Todas as ações sensíveis exigem Super Admin verificado no banco.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SettingsInput = {
  organizationId: string;
  enabled: boolean;
  hour: number;
  minute: number;
  timezone: string;
  include_database: boolean;
  include_storage: boolean;
  retention_daily: number;
  retention_weekly: number;
  retention_monthly: number;
  destination_kind: "sftp" | "s3" | "plataforma";
  platform_copy: boolean;
  sftp_host?: string | null;
  sftp_port?: number | null;
  sftp_user?: string | null;
  sftp_base_path?: string | null;
  s3_endpoint?: string | null;
  s3_region?: string | null;
  s3_bucket?: string | null;
  s3_prefix?: string | null;
  credentials_secret_name?: string | null;
  notes?: string | null;
};

async function assertSuperAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_super_admin", {
    _user_id: context.userId,
  });
  if (error || !data) throw new Error("Apenas o Super Admin pode executar esta ação.");
}

export const saveBackupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SettingsInput) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { organizationId, ...rest } = data;
    const payload = { ...rest, organization_id: organizationId, updated_by: context.userId };
    const { error } = await supabaseAdmin
      .from("backup_settings")
      .upsert(payload as never, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testBackupDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { testDestination } = await import("./backup.server");
    const { data: settings } = await supabaseAdmin
      .from("backup_settings")
      .select("*")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!settings) return { ok: false, message: "Configure o backup antes de testar a conexão." };
    const result = await testDestination(settings as never);
    await supabaseAdmin
      .from("backup_settings")
      .update({
        last_test_at: new Date().toISOString(),
        last_test_ok: result.ok,
        last_test_message: result.message,
      })
      .eq("organization_id", data.organizationId);
    return result;
  });

export const runBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runBackup } = await import("./backup.server");
    return runBackup(supabaseAdmin as never, data.organizationId, {
      kind: "manual",
      reason: data.reason ?? "Execução manual pelo Super Admin",
      requestedBy: context.userId,
    });
  });

export const verifyBackupIntegrity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sha256Hex } = await import("./backup.server");
    const { data: run } = await supabaseAdmin
      .from("backup_runs")
      .select("id, object_key, checksum, destination_kind")
      .eq("id", data.runId)
      .maybeSingle();
    if (!run?.object_key || !run.checksum)
      return { ok: false, message: "Execução sem cópia verificável na plataforma." };
    const { data: file, error } = await supabaseAdmin.storage
      .from("backups")
      .download(run.object_key);
    if (error || !file) return { ok: false, message: "Arquivo não encontrado no armazenamento." };
    const checksum = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
    const ok = checksum === run.checksum;
    await supabaseAdmin
      .from("backup_runs")
      .update({ integrity_valid: ok, integrity_checked_at: new Date().toISOString() })
      .eq("id", run.id);
    return {
      ok,
      message: ok
        ? "Integridade confirmada (SHA-256)."
        : "Divergência de conteúdo: o arquivo foi alterado.",
    };
  });

export const downloadBackupLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: run } = await supabaseAdmin
      .from("backup_runs")
      .select("object_key")
      .eq("id", data.runId)
      .maybeSingle();
    if (!run?.object_key) return { url: null, message: "Sem cópia disponível na plataforma." };
    const { data: signed, error } = await supabaseAdmin.storage
      .from("backups")
      .createSignedUrl(run.object_key, 300);
    if (error || !signed)
      return { url: null, message: "Não foi possível gerar o link temporário." };
    return { url: signed.signedUrl, message: "Link válido por 5 minutos." };
  });

export const setBackupProtection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string; protect: boolean; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as never);
    if (data.protect && (data.reason ?? "").trim().length < 10)
      throw new Error("Informe o motivo da proteção (mínimo de 10 caracteres).");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("backup_runs")
      .update({
        is_protected: data.protect,
        protected_reason: data.protect ? data.reason!.trim() : null,
        protected_by: data.protect ? context.userId : null,
        protected_at: data.protect ? new Date().toISOString() : null,
      })
      .eq("id", data.runId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Restauração assistida: exige justificativa e confirmação digitada, gera um
 * backup de segurança antes de qualquer gravação e registra tudo.
 */
export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string; justification: string; confirmation: string }) => input)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as never);
    if (data.justification.trim().length < 15)
      throw new Error("A justificativa deve ter ao menos 15 caracteres.");
    if (data.confirmation.trim().toUpperCase() !== "RESTAURAR")
      throw new Error('Digite "RESTAURAR" para confirmar.');

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runBackup, BACKUP_TABLES, RESTORE_CONFLICT_COLUMNS, sha256Hex } =
      await import("./backup.server");
    const { Buffer } = await import("node:buffer");

    const { data: run } = await supabaseAdmin
      .from("backup_runs")
      .select("id, organization_id, object_key, status, checksum")
      .eq("id", data.runId)
      .maybeSingle();
    if (!run?.object_key)
      throw new Error("Esta execução não possui pacote restaurável na plataforma.");

    const safety = await runBackup(supabaseAdmin as never, run.organization_id, {
      kind: "manual",
      reason: "Backup de segurança anterior à restauração",
      requestedBy: context.userId,
    });

    const { data: restore } = await supabaseAdmin
      .from("backup_restores")
      .insert({
        organization_id: run.organization_id,
        run_id: run.id,
        safety_run_id: safety.runId,
        status: "em_execucao",
        justification: data.justification.trim(),
        confirmation_text: "RESTAURAR",
        requested_by: context.userId,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    try {
      const { data: file, error } = await supabaseAdmin.storage
        .from("backups")
        .download(run.object_key);
      if (error || !file) throw new Error("Pacote de backup não encontrado no armazenamento.");

      const bundleBytes = new Uint8Array(await file.arrayBuffer());
      if (run.checksum) {
        const actualBundleChecksum = await sha256Hex(bundleBytes);
        if (actualBundleChecksum !== run.checksum) {
          throw new Error(
            "Falha de integridade: o pacote de backup não corresponde ao checksum registrado.",
          );
        }
      }

      const parsed = JSON.parse(Buffer.from(bundleBytes).toString("utf8")) as {
        data?: Record<string, Record<string, unknown>[]>;
        files?: {
          bucket: string;
          path: string;
          size: number | null;
          updated_at: string | null;
          content_base64?: string | null;
          checksum?: string | null;
        }[];
      };

      let restored = 0;
      let restoredFiles = 0;
      let skippedFiles = 0;
      // Valida a integridade dos anexos antes de iniciar a restauração.
      for (const item of parsed.files ?? []) {
        if (!item.content_base64) continue;

        const bytes = Buffer.from(item.content_base64, "base64");

        if (item.checksum) {
          const actualChecksum = await sha256Hex(bytes);

          if (actualChecksum !== item.checksum) {
            throw new Error(`Falha de integridade no arquivo ${item.bucket}/${item.path}.`);
          }
        }
      }
      for (const table of BACKUP_TABLES) {
        const rows = parsed.data?.[table];
        if (!rows?.length) continue;
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          const onConflict = RESTORE_CONFLICT_COLUMNS[table] ?? "id";
          const { error: upErr } = await supabaseAdmin
            .from(table)
            .upsert(chunk as never, { onConflict });
          if (upErr) throw new Error(`Tabela ${table}: ${upErr.message}`);
          restored += chunk.length;
        }
      }
      // Restaura os arquivos privados nos buckets originais.
      for (const item of parsed.files ?? []) {
        if (!item.content_base64) {
          skippedFiles += 1;
          continue;
        }

        const bytes = Buffer.from(item.content_base64, "base64");

        const { error: storageError } = await supabaseAdmin.storage
          .from(item.bucket)
          .upload(item.path, bytes, {
            upsert: true,
          });

        if (storageError) {
          throw new Error(`Arquivo ${item.bucket}/${item.path}: ${storageError.message}`);
        }

        restoredFiles += 1;
      }

      const summary =
        `${restored} registros reaplicados. ` +
        `${restoredFiles} arquivo(s) restaurado(s).` +
        (skippedFiles > 0
          ? ` ${skippedFiles} arquivo(s) antigo(s) sem conteúdo binário foram ignorados.`
          : "");
      await supabaseAdmin
        .from("backup_restores")
        .update({
          status: "concluido",
          finished_at: new Date().toISOString(),
          result_summary: summary,
        })
        .eq("id", restore!.id);
      return { ok: true, message: summary, safetyRunId: safety.runId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na restauração.";
      await supabaseAdmin
        .from("backup_restores")
        .update({ status: "falhou", finished_at: new Date().toISOString(), error_summary: message })
        .eq("id", restore!.id);
      throw new Error(message);
    }
  });
