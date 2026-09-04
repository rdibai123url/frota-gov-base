/**
 * Exportação completa de dados do órgão — camada de servidor.
 *
 * Autorização obrigatória: Super Admin, Org Admin ou Auditor (controladoria).
 * O órgão exportado é SEMPRE o do perfil do usuário autenticado; nada vem do
 * cliente, de modo que é impossível exportar outro `organization_id`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FullExportResponse = {
  fileName: string;
  base64: string;
  bytes: number;
  checksum: string;
  fileCount: number;
  recordCount: number;
  files: { arquivo: string; tabela: string; registros: number; erro?: string }[];
};

export const runFullExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FullExportResponse> => {
    const { supabase, userId } = context;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id, full_name, email")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const organizationId = profile?.organization_id as string | undefined;
    if (!organizationId) throw new Error("Usuário sem órgão em contexto.");

    const [{ data: isSuper }, { data: isOrgAdmin }, { data: isAuditor }] = await Promise.all([
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("has_role", { _user_id: userId, _role: "org_admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "auditor" }),
    ]);
    if (!isSuper && !isOrgAdmin && !isAuditor) {
      throw new Error("Apenas Super Admin, Administrador do órgão ou Auditoria podem exportar todos os dados.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildFullExport, EXPORT_SCHEMA_VERSION } = await import("./exportacao.server");

    const startedAt = Date.now();
    try {
      const result = await buildFullExport(supabaseAdmin, organizationId, {
        id: userId,
        name: (profile?.full_name as string | null) ?? "Usuário",
        email: (profile?.email as string | null) ?? null,
      });

      await supabaseAdmin.from("activity_logs").insert({
        organization_id: organizationId,
        actor_id: userId,
        actor_name: (profile?.full_name as string | null) ?? null,
        action: "exportacao_completa",
        entity: "organizations",
        entity_id: organizationId,
        description: `Exportação completa gerada: ${result.fileCount} arquivos, ${result.recordCount} registros, ${result.bytes} bytes.`,
        metadata: {
          arquivo: result.fileName,
          checksum_sha256: result.checksum,
          arquivos: result.fileCount,
          registros: result.recordCount,
          bytes: result.bytes,
          duracao_ms: Date.now() - startedAt,
          esquema: EXPORT_SCHEMA_VERSION,
          status: "sucesso",
        },
      } as never);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha desconhecida na exportação.";
      await supabaseAdmin.from("activity_logs").insert({
        organization_id: organizationId,
        actor_id: userId,
        actor_name: (profile?.full_name as string | null) ?? null,
        action: "exportacao_completa",
        entity: "organizations",
        entity_id: organizationId,
        description: `Falha na exportação completa: ${message}`,
        metadata: { status: "erro", erro: message, duracao_ms: Date.now() - startedAt },
      } as never);
      throw new Error(message);
    }
  });
