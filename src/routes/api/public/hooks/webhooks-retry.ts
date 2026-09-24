/**
 * Fase 10 — Bloco 5: reenvio automático de webhooks pendentes.
 *
 * Chamado pelo agendador com o segredo de rotina. Processa um lote pequeno de
 * entregas vencidas, aplicando backoff exponencial até o limite de tentativas
 * configurado no endpoint. O segredo do endpoint é lido do cofre e nunca é
 * devolvido na resposta.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const MAX_PER_RUN = 20;
/** Backoff: 1, 5, 15, 60 e 180 minutos. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

async function hmacSha256Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/hooks/webhooks-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();

        const { data: pending, error } = await supabaseAdmin
          .from("webhook_deliveries")
          .select("id, organization_id, endpoint_id, event, payload, attempt")
          .eq("status", "pendente")
          .lte("next_retry_at", now.toISOString())
          .order("next_retry_at", { ascending: true })
          .limit(MAX_PER_RUN);

        if (error)
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });

        const results: { id: string; status: string }[] = [];

        for (const delivery of pending ?? []) {
          const { data: endpoint } = await supabaseAdmin
            .from("webhook_endpoints")
            .select("url, active, max_retries, timeout_ms, secret_name")
            .eq("id", delivery.endpoint_id)
            .maybeSingle();

          if (!endpoint || !endpoint.active) {
            await supabaseAdmin
              .from("webhook_deliveries")
              .update({
                status: "descartada",
                error_message: "Endpoint inativo ou removido.",
                next_retry_at: null,
              })
              .eq("id", delivery.id);
            results.push({ id: delivery.id, status: "descartada" });
            continue;
          }

          const attempt = (delivery.attempt ?? 0) + 1;
          const body = JSON.stringify({
            event: delivery.event,
            delivery_id: delivery.id,
            sent_at: new Date().toISOString(),
            attempt,
            data: delivery.payload,
          });

          const secret = endpoint.secret_name ? process.env[endpoint.secret_name] : undefined;
          const headers: Record<string, string> = {
            "content-type": "application/json",
            "x-frotagov-event": delivery.event,
            "x-frotagov-delivery": delivery.id,
            "x-frotagov-attempt": String(attempt),
          };
          if (secret)
            headers["x-frotagov-signature"] = `sha256=${await hmacSha256Hex(secret, body)}`;

          let responseStatus: number | null = null;
          let responseBody = "";
          let failure: string | null = null;

          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), endpoint.timeout_ms ?? 10_000);
            const res = await fetch(endpoint.url, {
              method: "POST",
              headers,
              body,
              signal: controller.signal,
            });
            clearTimeout(timer);
            responseStatus = res.status;
            responseBody = (await res.text()).slice(0, 1000);
            if (!res.ok) failure = `Resposta HTTP ${res.status}.`;
          } catch (e) {
            failure = e instanceof Error ? e.message : "Falha de rede.";
          }

          const maxRetries = endpoint.max_retries ?? 5;
          const exhausted = attempt >= maxRetries;
          const status: "pendente" | "entregue" | "falha" = failure
            ? exhausted
              ? "falha"
              : "pendente"
            : "entregue";
          const backoff = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)] ?? 180;

          await supabaseAdmin
            .from("webhook_deliveries")
            .update({
              attempt,
              status,
              response_status: responseStatus,
              response_body: responseBody || null,
              error_message: failure,
              delivered_at: failure ? null : new Date().toISOString(),
              next_retry_at:
                status === "pendente"
                  ? new Date(Date.now() + backoff * 60_000).toISOString()
                  : null,
            })
            .eq("id", delivery.id);

          await supabaseAdmin
            .from("webhook_endpoints")
            .update({ last_delivery_at: new Date().toISOString(), last_status: status })
            .eq("id", delivery.endpoint_id);

          await supabaseAdmin.from("integration_logs").insert({
            organization_id: delivery.organization_id,
            kind: "webhook",
            operation: delivery.event,
            direction: "saida",
            status: failure ? (exhausted ? "erro" : "parcial") : "sucesso",
            message: failure ?? `Entrega concluída com HTTP ${responseStatus}.`,
            records_total: 1,
            records_ok: failure ? 0 : 1,
            records_error: failure ? 1 : 0,
          });

          results.push({ id: delivery.id, status });
        }

        return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
