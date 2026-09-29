/**
 * Avisos de vencimento — funções de servidor chamadas pela tela.
 * A organização é sempre a do usuário logado, verificada no banco.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendDigestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: allowed } = await supabase.rpc("can_manage_finance");
    if (!allowed) throw new Error("Sem permissão para enviar avisos.");
    const { data: orgId } = await supabase.rpc("current_org_id");
    if (!orgId) throw new Error("Nenhum órgão em contexto.");
    const { sendDigest } = await import("@/lib/avisos.server");
    return sendDigest(orgId, true);
  });
