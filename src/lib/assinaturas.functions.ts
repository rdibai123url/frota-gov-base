/**
 * Assinatura eletrônica — funções de servidor.
 *
 * Fluxo: o usuário confirma a própria senha; o servidor confere se ele pode assinar aquele
 * documento, calcula o resumo (hash) dos campos que definem o documento e grava a assinatura.
 * O resumo é recalculado ao consultar: se o documento mudou depois de assinado, aparece o aviso.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SignDocType =
  "autorizacao_abastecimento" | "ordem_servico" | "contrato_ocorrencia" | "fatura";

const DOC_TYPES: SignDocType[] = [
  "autorizacao_abastecimento",
  "ordem_servico",
  "contrato_ocorrencia",
  "fatura",
];

type DocDef = {
  table: "fuel_authorizations" | "service_orders" | "contract_occurrences" | "billing_invoices";
  /** Campos que definem o documento (não incluem contadores que mudam com o uso). */
  fields: string[];
  label: (row: Record<string, unknown>) => string;
  finance: boolean;
};

const DEFS: Record<SignDocType, DocDef> = {
  autorizacao_abastecimento: {
    table: "fuel_authorizations",
    fields: [
      "code",
      "vehicle_id",
      "driver_id",
      "fuel_type_id",
      "supplier_id",
      "unit_id",
      "max_quantity",
      "max_value",
      "max_unit_price",
      "valid_from",
      "valid_until",
      "purpose",
      "fill_tank",
    ],
    label: (r) => `Autorização de abastecimento ${r["code"] ?? ""}`.trim(),
    finance: false,
  },
  ordem_servico: {
    table: "service_orders",
    fields: [
      "code",
      "vehicle_id",
      "workshop_id",
      "services",
      "approved_value",
      "deadline_at",
      "warranty_days",
      "contract_id",
      "quotation_id",
      "proposal_id",
    ],
    label: (r) => `Ordem de serviço ${r["code"] ?? ""}`.trim(),
    finance: false,
  },
  contrato_ocorrencia: {
    table: "contract_occurrences",
    fields: ["contract_id", "kind", "author_role", "description", "occurred_at", "deadline_at"],
    label: (r) => `Registro de gestão do contrato (${String(r["kind"] ?? "")})`,
    finance: false,
  },
  fatura: {
    table: "billing_invoices",
    fields: [
      "code",
      "supplier_id",
      "contract_id",
      "reference_month",
      "items_total",
      "glosa_total",
      "admin_fee_value",
      "withholding_value",
      "net_total",
      "nf_number",
    ],
    label: (r) => `Fatura ${r["code"] ?? ""}`.trim(),
    finance: true,
  },
};

function alphabet() {
  return "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
}

async function sha256Hex(text: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function newCode() {
  const { randomBytes } = await import("node:crypto");
  const a = alphabet();
  return Array.from(randomBytes(8), (b) => a[b % a.length]).join("");
}

async function loadDoc(
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  docType: SignDocType,
  docId: string,
) {
  const def = DEFS[docType];
  const { data, error } = await supabase.from(def.table).select("*").eq("id", docId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Documento não encontrado neste órgão.");
  const row = data as unknown as Record<string, unknown>;
  const snapshot = def.fields.map((f) => [f, row[f] ?? null]);
  return {
    row,
    label: def.label(row),
    hash: await sha256Hex(JSON.stringify(snapshot)),
    organizationId: String(row["organization_id"]),
  };
}

function validate(input: { docType: string; docId: string }) {
  if (!DOC_TYPES.includes(input?.docType as SignDocType))
    throw new Error("Tipo de documento inválido.");
  if (!/^[0-9a-f-]{36}$/i.test(String(input?.docId))) throw new Error("Documento inválido.");
  return { docType: input.docType as SignDocType, docId: String(input.docId) };
}

export const signDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { docType: string; docId: string; password: string }) => ({
    ...validate(input),
    password: typeof input?.password === "string" ? input.password.slice(0, 200) : "",
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { clientIp, rateLimited } = await import("@/lib/rate-limit.server");

    if (rateLimited(`sign:${userId}`, 6)) throw new Error("Muitas tentativas. Aguarde um minuto.");
    if (!data.password) throw new Error("Digite a sua senha para assinar.");

    const def = DEFS[data.docType];
    const { data: allowed } = await supabase.rpc(def.finance ? "can_manage_finance" : "can_write");
    if (!allowed) throw new Error("O seu perfil não permite assinar este documento.");

    // confirma a senha do próprio usuário (sessão separada; não altera o login atual)
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const email = String((claims as Record<string, unknown>)["email"] ?? "");
    if (!url || !key || !email) throw new Error("Não foi possível confirmar a senha.");
    const { createClient } = await import("@supabase/supabase-js");
    const probe = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined as never },
    });
    const { data: signIn, error: pwError } = await probe.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (pwError || signIn.user?.id !== userId) throw new Error("Senha incorreta.");
    await probe.auth.signOut().catch(() => undefined);

    const doc = await loadDoc(supabase, data.docType, data.docId);

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("electronic_signatures")
      .insert({
        organization_id: doc.organizationId,
        doc_type: data.docType,
        doc_id: data.docId,
        doc_label: doc.label,
        doc_hash: doc.hash,
        signer_id: userId,
        signer_name: profile?.full_name || email,
        signer_role: roles?.[0]?.role ?? null,
        verification_code: await newCode(),
        ip_address: clientIp((n) => getRequestHeader(n)),
        user_agent: (getRequestHeader("user-agent") ?? "").slice(0, 300) || null,
      })
      .select("verification_code")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Você já assinou este documento.");
      throw new Error("Não foi possível registrar a assinatura.");
    }
    return { code: inserted.verification_code };
  });

/** Assinaturas do documento, cada uma com a informação de que o documento continua igual ou não. */
export const documentSignatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { docType: string; docId: string }) => validate(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("electronic_signatures")
      .select("id, signer_name, signer_role, signed_at, verification_code, doc_hash")
      .eq("doc_type", data.docType)
      .eq("doc_id", data.docId)
      .order("signed_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!rows?.length) return [];
    const current = await loadDoc(supabase, data.docType, data.docId);
    return rows.map((r) => ({
      id: r.id,
      signer_name: r.signer_name,
      signer_role: r.signer_role,
      signed_at: r.signed_at,
      verification_code: r.verification_code,
      intact: r.doc_hash === current.hash,
    }));
  });
