/**
 * Rotina diária dos avisos de vencimento.
 * Chamada pelo agendador (uma vez por dia) com a chave de rotinas da plataforma.
 * Só envia para órgãos com avisos ligados, respeitando a frequência escolhida.
 */
import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const MAX_ORGS_PER_RUN = 25;

export const Route = createFileRoute("/api/public/hooks/avisos-diarios")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendDigest } = await import("@/lib/avisos.server");

        const { data: orgs, error } = await supabaseAdmin
          .from("notification_settings")
          .select("organization_id")
          .eq("email_enabled", true)
          .limit(MAX_ORGS_PER_RUN);
        if (error) {
          return new Response(JSON.stringify({ ok: false }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: { organization_id: string; status: string }[] = [];
        for (const o of orgs ?? []) {
          const r = await sendDigest(o.organization_id, false);
          results.push({ organization_id: o.organization_id, status: r.status });
        }
        return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
