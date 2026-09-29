import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Resolve autorização com o JWT do usuário antes de acessar o cliente privilegiado. */
export async function requireCacheContext(userClient: SupabaseClient<Database>) {
  const [org, permission] = await Promise.all([
    userClient.rpc("current_org_id"),
    userClient.rpc("can_operate_usage"),
  ]);
  if (org.error || permission.error || !org.data || permission.data !== true) {
    throw new Error("Sem permissão para consultar mapas neste órgão.");
  }
  return { supabase: supabaseAdmin, organizationId: org.data };
}

/** Não lê entradas legadas alimentadas pelo cliente; namespace também separa os órgãos. */
export function trustedGeocodeKey(organizationId: string, provider: string, query: string) {
  return JSON.stringify(["server-v1", organizationId, provider, query]);
}
