/**
 * Rodada 2 — Etapa 4: identidade corporativa (SSO OIDC/SAML e diretório LDAP).
 *
 * Regras permanentes:
 * - Segredos (client secret, senha de bind, certificados privados) ficam
 *   somente no servidor; aqui guardamos apenas o NOME do segredo.
 * - Sem credencial válida o provedor fica desativado e o login padrão do
 *   FrotaGov continua funcionando normalmente.
 * - O histórico de acesso nunca registra tokens, senhas ou códigos.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/frotagov";
import type { Database } from "@/integrations/supabase/types";

export type SsoProvider = Database["public"]["Tables"]["sso_providers"]["Row"];
export type SsoClaimMapping = Database["public"]["Tables"]["sso_claim_mappings"]["Row"];
export type LdapDirectory = Database["public"]["Tables"]["ldap_directories"]["Row"];
export type LdapGroupMapping = Database["public"]["Tables"]["ldap_group_mappings"]["Row"];
export type LoginEvent = Database["public"]["Tables"]["auth_login_events"]["Row"];

export const PROTOCOL_LABEL: Record<string, string> = {
  oidc: "OpenID Connect (OIDC)",
  saml: "SAML 2.0",
};

export const LOGIN_METHOD_LABEL: Record<string, string> = {
  senha: "E-mail e senha",
  google: "Google",
  oidc: "SSO institucional (OIDC)",
  saml: "SSO institucional (SAML)",
  ldap: "Diretório corporativo (LDAP)",
};

export const NO_CREDENTIALS_NOTICE =
  "Integração disponível mediante contratação/credenciais do órgão.";

export function useSsoProviders() {
  return useQuery({
    queryKey: ["sso_providers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sso_providers")
        .select("*")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as SsoProvider[];
    },
  });
}

export function useSsoClaimMappings(providerId?: string) {
  return useQuery({
    queryKey: ["sso_claim_mappings", providerId ?? "todos"],
    queryFn: async () => {
      let q = supabase.from("sso_claim_mappings").select("*").order("priority");
      if (providerId) q = q.eq("provider_id", providerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SsoClaimMapping[];
    },
  });
}

export function useLdapDirectories() {
  return useQuery({
    queryKey: ["ldap_directories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ldap_directories")
        .select("*")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as LdapDirectory[];
    },
  });
}

export function useLdapGroupMappings(directoryId?: string) {
  return useQuery({
    queryKey: ["ldap_group_mappings", directoryId ?? "todos"],
    queryFn: async () => {
      let q = supabase.from("ldap_group_mappings").select("*").order("group_dn");
      if (directoryId) q = q.eq("directory_id", directoryId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LdapGroupMapping[];
    },
  });
}

export function useLoginEvents(limit = 200) {
  return useQuery({
    queryKey: ["auth_login_events", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auth_login_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as LoginEvent[];
    },
  });
}
