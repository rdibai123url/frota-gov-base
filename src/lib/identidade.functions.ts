/**
 * Rodada 2 — Etapa 4: verificação técnica de SSO (OIDC/SAML) e LDAP.
 *
 * Nada é simulado: o teste apenas verifica se o endereço informado pelo órgão
 * responde e devolve um documento válido. Nenhum segredo é devolvido ao
 * navegador nem gravado no histórico.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TIMEOUT_MS = 12000;

async function timedFetch(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function safeMessage(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return m.includes("aborted") ? "O provedor não respondeu no tempo limite." : m;
}

/** Testa o provedor de login institucional (discovery OIDC ou metadados SAML). */
export const testSsoProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { providerId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: provider, error } = await supabase
      .from("sso_providers")
      .select("*")
      .eq("id", data.providerId)
      .maybeSingle();
    if (error || !provider) throw new Error("Provedor não encontrado.");

    const secret = provider.secret_name ? process.env[provider.secret_name] : undefined;
    let ok = false;
    let message = "";

    if (!provider.issuer && !provider.metadata_url) {
      message = "Informe o endereço de descoberta (OIDC) ou de metadados (SAML) antes de testar.";
    } else if (provider.protocol === "oidc" && !secret) {
      message =
        "Integração disponível mediante contratação/credenciais do órgão: o segredo do cliente ainda não foi cadastrado no servidor.";
    } else {
      const url =
        provider.protocol === "oidc"
          ? `${String(provider.issuer ?? "").replace(/\/+$/, "")}/.well-known/openid-configuration`
          : String(provider.metadata_url ?? "");
      try {
        const res = await timedFetch(url, { headers: { accept: "application/json, application/xml, text/xml" } });
        const body = await res.text();
        if (!res.ok) {
          message = `O provedor respondeu com erro (HTTP ${res.status}).`;
        } else if (provider.protocol === "oidc") {
          const doc = JSON.parse(body) as { authorization_endpoint?: string; token_endpoint?: string };
          ok = Boolean(doc.authorization_endpoint && doc.token_endpoint);
          message = ok
            ? "Descoberta OIDC válida: endpoints de autorização e token localizados."
            : "O endereço respondeu, mas não é um documento de descoberta OIDC válido.";
        } else {
          ok = body.includes("EntityDescriptor");
          message = ok
            ? "Metadados SAML válidos recebidos do provedor de identidade."
            : "O endereço respondeu, mas não contém metadados SAML válidos.";
        }
      } catch (e) {
        message = safeMessage(e);
      }
    }

    await supabase
      .from("sso_providers")
      .update({
        last_test_at: new Date().toISOString(),
        last_result: message.slice(0, 500),
        status: ok ? (provider.active ? "ativo" : "configurado") : provider.has_secret ? "erro" : "nao_configurado",
        updated_by: userId,
      })
      .eq("id", provider.id);

    await supabase.from("integration_logs").insert({
      organization_id: provider.organization_id,
      kind: provider.protocol === "saml" ? "saml" : "oidc",
      operation: "teste_conexao",
      direction: "saida",
      status: ok ? "sucesso" : "erro",
      message: message.slice(0, 1000),
      records_total: 1,
      records_ok: ok ? 1 : 0,
      records_error: ok ? 0 : 1,
      created_by: userId,
    });

    return { ok, message };
  });

/** Testa o gateway seguro do diretório LDAP/AD do órgão. */
export const testLdapDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { directoryId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dir, error } = await supabase
      .from("ldap_directories")
      .select("*")
      .eq("id", data.directoryId)
      .maybeSingle();
    if (error || !dir) throw new Error("Diretório não encontrado.");

    const secret = dir.secret_name ? process.env[dir.secret_name] : undefined;
    let ok = false;
    let message = "";

    if (!dir.gateway_url) {
      message =
        "O acesso ao diretório exige um gateway seguro publicado pelo órgão (o servidor do FrotaGov não abre conexão LDAP direta).";
    } else if (!secret) {
      message =
        "Integração disponível mediante contratação/credenciais do órgão: a senha de leitura ainda não foi cadastrada no servidor.";
    } else {
      try {
        const res = await timedFetch(`${dir.gateway_url.replace(/\/+$/, "")}/health`, {
          headers: { accept: "application/json", authorization: `Bearer ${secret}` },
        });
        ok = res.ok;
        message = ok
          ? "Gateway do diretório respondeu corretamente."
          : `O gateway respondeu com erro (HTTP ${res.status}).`;
      } catch (e) {
        message = safeMessage(e);
      }
    }

    await supabase
      .from("ldap_directories")
      .update({
        last_test_at: new Date().toISOString(),
        last_result: message.slice(0, 500),
        status: ok ? (dir.active ? "ativo" : "configurado") : dir.has_secret ? "erro" : "nao_configurado",
        updated_by: userId,
      })
      .eq("id", dir.id);

    await supabase.from("integration_logs").insert({
      organization_id: dir.organization_id,
      kind: "ldap",
      operation: "teste_conexao",
      direction: "saida",
      status: ok ? "sucesso" : "erro",
      message: message.slice(0, 1000),
      records_total: 1,
      records_ok: ok ? 1 : 0,
      records_error: ok ? 0 : 1,
      created_by: userId,
    });

    return { ok, message };
  });

/** Registra tentativa de acesso (sem tokens nem senhas) para auditoria. */
export const recordLoginEvent = createServerFn({ method: "POST" })
  .inputValidator((input: { email?: string; method: string; success: boolean; reason?: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("auth_login_events").insert({
      email: (data.email ?? "").slice(0, 200) || null,
      method: data.method,
      success: data.success,
      reason: (data.reason ?? "").slice(0, 300) || null,
    });
    return { ok: true };
  });

/** Lista pública (sem segredos) dos logins institucionais ativos de um domínio. */
export const listInstitutionalLogins = createServerFn({ method: "POST" })
  .inputValidator((input: { email?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("sso_providers")
      .select("id, display_name, protocol, allowed_domains, active, status")
      .eq("active", true)
      .in("status", ["ativo", "configurado"]);
    const domain = (data.email ?? "").split("@")[1]?.toLowerCase();
    const list = (rows ?? []).filter((p) => {
      const domains = (p.allowed_domains ?? []) as string[];
      if (!domains.length) return true;
      if (!domain) return true;
      return domains.some((d) => d.toLowerCase().replace(/^@/, "") === domain);
    });
    return list.map((p) => ({
      id: p.id,
      name: p.display_name,
      protocol: p.protocol,
      domains: (p.allowed_domains ?? []) as string[],
    }));
  });
