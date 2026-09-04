/**
 * Fase 10 — Bloco 5: funções de servidor das integrações.
 *
 * Nenhuma integração é simulada: o teste de conexão faz uma requisição real
 * ao endereço configurado e registra honestamente o resultado. Sem endereço
 * ou sem segredo, a resposta é "não configurado".
 *
 * Segredos são lidos apenas do ambiente do servidor, a partir do NOME
 * guardado no conector — nunca trafegam para o navegador.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type TestInput = { connectorId: string };
type WebhookTestInput = { endpointId: string };

const TIMEOUT_MS = 10000;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function hmacHex(secret: string, body: string) {
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

/** Testa a conectividade real do conector configurado e registra o log. */
export const testConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TestInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: connector, error } = await supabase
      .from("integration_connectors")
      .select("*")
      .eq("id", data.connectorId)
      .maybeSingle();
    if (error || !connector) throw new Error("Conector não encontrado.");

    const started = Date.now();
    let status: "sucesso" | "erro" = "erro";
    let message = "Integração não configurada: informe o endereço do serviço e o segredo de acesso.";
    let httpStatus: number | null = null;

    if (connector.base_url) {
      const secret = connector.secret_name ? process.env[connector.secret_name] : undefined;
      try {
        const res = await fetchWithTimeout(
          connector.base_url,
          {
            method: "GET",
            headers: secret ? { authorization: `Bearer ${secret}` } : {},
          },
          TIMEOUT_MS,
        );
        httpStatus = res.status;
        status = res.ok ? "sucesso" : "erro";
        message = res.ok
          ? `Serviço respondeu com HTTP ${res.status}.`
          : `Serviço respondeu com HTTP ${res.status}.${connector.secret_name && !secret ? " O segredo informado não está cadastrado no servidor." : ""}`;
      } catch (e) {
        message = `Falha na comunicação: ${e instanceof Error ? e.message : "erro desconhecido"}.`;
      }
    }

    const duration = Date.now() - started;
    await supabase.from("integration_logs").insert({
      organization_id: connector.organization_id,
      connector_id: connector.id,
      kind: connector.kind,
      operation: "teste_de_conexao",
      direction: "teste",
      status,
      message,
      details: { http_status: httpStatus, base_url: connector.base_url } as never,
      duration_ms: duration,
      created_by: userId,
    });

    await supabase
      .from("integration_connectors")
      .update({
        last_attempt_at: new Date().toISOString(),
        last_result: message,
        ...(status === "sucesso" ? { last_sync_at: new Date().toISOString() } : {}),
      })
      .eq("id", connector.id);

    return { status, message, httpStatus, durationMs: duration };
  });

/** Envia um evento de teste assinado (HMAC-SHA256) para o endpoint do órgão. */
export const sendWebhookTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: WebhookTestInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: endpoint, error } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("id", data.endpointId)
      .maybeSingle();
    if (error || !endpoint) throw new Error("Endpoint não encontrado.");
    if (!endpoint.active) throw new Error("Endpoint desativado.");

    const payload = {
      event: "teste.conexao",
      sent_at: new Date().toISOString(),
      organization_id: endpoint.organization_id,
      data: { mensagem: "Evento de teste emitido pelo FrotaGov." },
    };
    const body = JSON.stringify(payload);
    const secret = endpoint.secret_name ? process.env[endpoint.secret_name] : undefined;
    const signature = secret ? await hmacHex(secret, body) : null;

    const { data: delivery } = await supabase
      .from("webhook_deliveries")
      .insert({
        organization_id: endpoint.organization_id,
        endpoint_id: endpoint.id,
        event: "teste.conexao",
        payload: payload as never,
        status: "pendente",
        attempt: 1,
      })
      .select("id")
      .maybeSingle();

    let status: "entregue" | "falha" = "falha";
    let responseStatus: number | null = null;
    let responseBody = "";
    let errorMessage: string | null = null;

    try {
      const res = await fetchWithTimeout(
        endpoint.url,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-frotagov-event": "teste.conexao",
            ...(signature ? { "x-frotagov-signature": `sha256=${signature}` } : {}),
          },
          body,
        },
        endpoint.timeout_ms ?? TIMEOUT_MS,
      );
      responseStatus = res.status;
      responseBody = (await res.text()).slice(0, 2000);
      status = res.ok ? "entregue" : "falha";
      if (!res.ok) errorMessage = `HTTP ${res.status}`;
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "erro desconhecido";
    }

    if (delivery?.id) {
      await supabase
        .from("webhook_deliveries")
        .update({
          status,
          response_status: responseStatus,
          response_body: responseBody || null,
          error_message: errorMessage,
          delivered_at: status === "entregue" ? new Date().toISOString() : null,
          next_retry_at:
            status === "falha" ? new Date(Date.now() + 60_000).toISOString() : null,
        })
        .eq("id", delivery.id);
    }

    await supabase
      .from("webhook_endpoints")
      .update({ last_delivery_at: new Date().toISOString(), last_status: status })
      .eq("id", endpoint.id);

    return {
      status,
      responseStatus,
      errorMessage,
      signed: Boolean(signature),
      warning: endpoint.secret_name && !signature ? "O segredo informado não está cadastrado no servidor; o envio saiu sem assinatura HMAC." : null,
    };
  });
