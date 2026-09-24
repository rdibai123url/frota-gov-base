/**
 * Bloco D — rotina agendada do backup externo diário.
 * Chamada pelo agendador do banco (pg_cron) com o segredo de rotina.
 * Processa um lote pequeno de órgãos vencidos por execução.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const MAX_ORGS_PER_RUN = 5;

export const Route = createFileRoute("/api/public/hooks/backup-diario")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runBackup, sha256Hex } = await import("@/lib/backup.server");

        // Aceita a chave padrão de rotinas da plataforma ou a chave própria
        // do agendador, guardada apenas como resumo no cofre interno.
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) {
          const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
          const { data: secret } = token
            ? await supabaseAdmin
                .from("cron_secrets")
                .select("token_hash")
                .eq("name", "backup_diario")
                .maybeSingle()
            : { data: null };
          if (!token || !secret || (await sha256Hex(token)) !== secret.token_hash)
            return unauthorized;
        }

        const { data: due, error } = await supabaseAdmin.rpc("backup_due_organizations");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const batch = (due ?? []).slice(0, MAX_ORGS_PER_RUN);
        const results: { organization_id: string; status: string }[] = [];

        for (const item of batch) {
          const org = item as { organization_id: string; cycle_key: string };
          const result = await runBackup(supabaseAdmin as never, org.organization_id, {
            kind: "automatico",
            cycleKey: org.cycle_key,
            reason: "Rotina diária automática",
          });
          results.push({ organization_id: org.organization_id, status: result.status });
        }

        return new Response(
          JSON.stringify({
            ok: true,
            processed: results.length,
            pending: Math.max((due ?? []).length - batch.length, 0),
            results,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
