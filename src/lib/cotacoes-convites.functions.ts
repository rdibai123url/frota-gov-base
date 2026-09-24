/**
 * FrotaGov — convites de cotação por e-mail (servidor).
 *
 * Todo o fluxo é executado no servidor:
 *  - o `organization_id` é sempre lido da própria cotação (nunca do cliente);
 *  - as gravações do usuário logado usam o cliente com RLS (permissões reais);
 *  - o link do fornecedor usa token aleatório; o banco guarda apenas o hash;
 *  - a resposta pública valida token, validade e situação da cotação.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  checkSettings,
  renderInviteEmail,
  sendEmail,
  type EmailSettings,
} from "@/lib/email.server";
import { NO_PUBLIC_BASE_MESSAGE, isPublicInviteLink, publicBase } from "@/lib/link-publico";

const TOKEN_TTL_DAYS = 30;

export type InviteTarget = {
  kind: "workshop" | "supplier" | "manual";
  id?: string | null;
  email: string;
  contactName?: string | null;
};

export type PublicQuotation = {
  ok: boolean;
  reason?: "invalido" | "expirado" | "encerrado" | "respondido";
  message?: string;
  /** Prazo encerrado: o fornecedor vê a solicitação, mas não pode enviar proposta. */
  expired?: boolean;
  quotation?: {
    code: string;
    description: string;
    specialty: string | null;
    quotation_kind: string;
    deadline_at: string | null;
    notes: string | null;
    organization: string;
    org_cnpj: string | null;
    org_city: string | null;
    org_state: string | null;
    org_logo_url: string | null;
    vehicle: string | null;
  };

  items?: {
    id: string;
    sequence: number;
    description: string;
    measure_unit: string;
    quantity: number;
  }[];
  invitation?: { id: string; email: string; contact_name: string | null; company: string | null };
};

/* ------------------------------ utilitários ----------------------------- */

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function requestOrigin() {
  const origin = getRequestHeader("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const host = getRequestHeader("host");
  if (!host) return "";
  const proto = getRequestHeader("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/**
 * Base do link do fornecedor, em ordem de prioridade:
 *  1. endereço público configurado pelo órgão;
 *  2. endereço público do ambiente (PUBLIC_APP_URL / VITE_PUBLIC_APP_URL);
 *  3. endereço da requisição, apenas quando já for público.
 * Qualquer endereço interno (localhost, rede interna, pré-visualização do
 * editor, ambiente de desenvolvimento) é descartado: nesse caso `base` é ""
 * e nenhum link pode ser copiado ou enviado.
 */
function resolveBase(orgBase?: string | null) {
  const base =
    publicBase(orgBase) ||
    publicBase(process.env["PUBLIC_APP_URL"]) ||
    publicBase(process.env["VITE_PUBLIC_APP_URL"]) ||
    publicBase(requestOrigin());
  return { base, isPublic: Boolean(base) };
}

function linkFor(token: string, orgBase?: string | null) {
  const { base, isPublic } = resolveBase(orgBase);
  if (!isPublic) return { link: null as string | null, isPublic: false };
  const link = `${base}/cotacao/${token}`;
  // Confere o endereço final montado (mesma regra do navegador).
  return isPublicInviteLink(link)
    ? { link, isPublic: true }
    : { link: null as string | null, isPublic: false };
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function deadlineText(deadline: string | null) {
  if (!deadline) return "sem prazo definido";
  return new Date(deadline).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

function expiryFor(deadline: string | null) {
  const fallback = Date.now() + TOKEN_TTL_DAYS * 86400000;
  const at = deadline ? new Date(deadline).getTime() : fallback;
  return new Date(Number.isFinite(at) ? at : fallback).toISOString();
}

/* --------------------------- configuração de e-mail --------------------- */

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      provider: EmailSettings["provider"];
      enabled: boolean;
      fromName: string;
      fromEmail: string;
      replyTo: string;
      smtpHost: string;
      smtpPort: number | null;
      smtpSecure: boolean;
      smtpUser: string;
      /** Endereço público do sistema usado nos links enviados aos fornecedores. */
      publicBaseUrl?: string | null;
      /** Enviado apenas quando o usuário digita uma nova credencial. */
      secret?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: orgId, error: orgErr } = await supabase.rpc("current_org_id");
    if (orgErr || !orgId) throw new Error("Órgão não identificado.");
    const { data: allowed } = await supabase.rpc("can_manage_users");
    if (!allowed) throw new Error("Sem permissão para configurar o envio de e-mail.");

    // O endereço público precisa ser mesmo público: nada de localhost, rede
    // interna, ambiente de desenvolvimento ou pré-visualização do editor.
    const typedBase = (data.publicBaseUrl ?? "").trim();
    const requestedBase = typedBase ? publicBase(typedBase) : null;
    if (typedBase && !requestedBase) {
      throw new Error(
        "Endereço público inválido. Informe um endereço https acessível de fora do órgão (endereços locais, de rede interna ou de pré-visualização não são aceitos).",
      );
    }

    const hasNewSecret = typeof data.secret === "string" && data.secret.trim().length > 0;
    if (hasNewSecret) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("org_email_secrets").upsert({
        organization_id: orgId,
        secret: data.secret!.trim(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error("Não foi possível guardar a credencial.");
    }

    const { data: existing } = await supabase
      .from("org_email_settings")
      .select("id, has_secret")
      .eq("organization_id", orgId)
      .maybeSingle();

    const payload = {
      organization_id: orgId,
      provider: data.provider,
      enabled: data.enabled,
      from_name: data.fromName || null,
      from_email: data.fromEmail || null,
      reply_to: data.replyTo || null,
      smtp_host: data.smtpHost || null,
      smtp_port: data.smtpPort,
      smtp_secure: data.smtpSecure,
      smtp_user: data.smtpUser || null,
      public_base_url: requestedBase,
      has_secret: hasNewSecret ? true : Boolean(existing?.has_secret),
      updated_by: userId,
    };

    const { error } = existing
      ? await supabase.from("org_email_settings").update(payload).eq("id", existing.id)
      : await supabase.from("org_email_settings").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true, hasSecret: payload.has_secret };
  });

/** Informa se a plataforma já tem uma chave Resend disponível (sem revelá-la). */
export const getEmailProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ platformResend: Boolean(process.env["RESEND_API_KEY"]) }));

/* ------------------------------- convites ------------------------------- */

export const createInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quotationId: string; targets: InviteTarget[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: quotation, error: qErr } = await supabase
      .from("quotations")
      .select("id, organization_id, deadline_at, status")
      .eq("id", data.quotationId)
      .maybeSingle();
    if (qErr || !quotation) throw new Error("Cotação não encontrada neste órgão.");
    if (!["rascunho", "aberta"].includes(quotation.status)) {
      throw new Error("Esta cotação não está mais aberta para novos convites.");
    }
    const { data: mayInvite } = await supabase.rpc("can_manage_maintenance");
    if (!mayInvite) throw new Error("Sem permissão para convidar empresas nesta cotação.");

    const created: { id: string; email: string }[] = [];
    const skipped: { email: string; reason: string }[] = [];

    for (const target of data.targets) {
      const email = (target.email || "").trim().toLowerCase();
      if (!isEmail(email)) {
        skipped.push({ email: target.email, reason: "E-mail inválido" });
        continue;
      }
      const token = randomToken();
      const row = {
        organization_id: quotation.organization_id,
        quotation_id: quotation.id,
        workshop_id: target.kind === "workshop" ? (target.id ?? null) : null,
        supplier_id: target.kind === "supplier" ? (target.id ?? null) : null,
        email,
        contact_name: target.contactName || null,
        is_manual: target.kind === "manual",
        token_hash: await hashToken(token),
        token_expires_at: expiryFor(quotation.deadline_at),
        send_status: "pendente",
        created_by: userId,
      };
      const { data: inserted, error } = await supabase
        .from("quotation_invitations")
        .insert(row)
        .select("id")
        .maybeSingle();
      if (error || !inserted) {
        skipped.push({
          email,
          reason: error?.message.includes("duplicate")
            ? "Já convidado"
            : (error?.message ?? "Falha"),
        });
        continue;
      }
      created.push({ id: inserted.id, email });
    }
    return { created, skipped };
  });

async function loadSettings(orgId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("org_email_settings")
    .select(
      "provider, enabled, from_name, from_email, reply_to, smtp_host, smtp_port, smtp_secure, smtp_user, has_secret, public_base_url",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data)
    return {
      settings: null as EmailSettings | null,
      secret: "",
      publicBaseUrl: null as string | null,
    };
  const { data: secretRow } = await supabaseAdmin
    .from("org_email_secrets")
    .select("secret")
    .eq("organization_id", orgId)
    .maybeSingle();
  const publicBaseUrl = (data as { public_base_url?: string | null }).public_base_url ?? null;
  const settings = data as EmailSettings;
  let secret = secretRow?.secret ?? "";
  // Chave da plataforma (painel de Integrações): usada apenas quando o órgão
  // escolheu Resend e ainda não cadastrou uma chave própria.
  if (!secret && settings.provider === "resend") {
    const platform = process.env["RESEND_API_KEY"] ?? "";
    if (platform) {
      secret = platform;
      settings.has_secret = true;
    }
  }
  return { settings, secret, publicBaseUrl };
}

/** Dispara (ou reenvia) convites — sempre um e-mail individual por destinatário. */
export const sendInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quotationId: string; invitationIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: quotation } = await supabase
      .from("quotations")
      .select("id, organization_id, code, description, specialty, deadline_at, notes")
      .eq("id", data.quotationId)
      .maybeSingle();
    if (!quotation) throw new Error("Cotação não encontrada neste órgão.");

    const { data: allowed } = await supabase.rpc("can_manage_maintenance");
    if (!allowed) throw new Error("Sem permissão para enviar convites desta cotação.");

    const { settings, secret, publicBaseUrl } = await loadSettings(quotation.organization_id);
    const problem = checkSettings(settings);
    if (problem || !settings)
      return {
        ok: false,
        configured: false,
        message: problem ?? "Envio de e-mail não configurado.",
        results: [],
      };
    // Nunca enviar um link que o fornecedor não consegue abrir (endereço interno).
    if (!resolveBase(publicBaseUrl).isPublic) {
      return { ok: false, configured: true, message: NO_PUBLIC_BASE_MESSAGE, results: [] };
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("legal_name, short_name")
      .eq("id", quotation.organization_id)
      .maybeSingle();
    const { data: items = [] } = await supabase
      .from("quotation_items")
      .select("sequence, description, measure_unit, quantity")
      .eq("quotation_id", quotation.id)
      .order("sequence");

    const { data: invites = [] } = await supabase
      .from("quotation_invitations")
      .select("id, email, contact_name, attempts, token_expires_at")
      .eq("quotation_id", quotation.id)
      .in("id", data.invitationIds);

    const results: {
      id: string;
      email: string;
      ok: boolean;
      error?: string;
      providerId?: string | null;
    }[] = [];

    for (const invite of invites ?? []) {
      if (!invite.email) continue;
      // Cada envio gera um token novo: o link antigo deixa de valer.
      const token = randomToken();
      const tokenHash = await hashToken(token);
      const { link: inviteLink } = linkFor(token, publicBaseUrl);
      // Redundância proposital: nada é enviado sem endereço público válido.
      if (!inviteLink) {
        results.push({
          id: invite.id,
          email: invite.email,
          ok: false,
          error: NO_PUBLIC_BASE_MESSAGE,
        });
        continue;
      }
      const message = renderInviteEmail({
        orgName: org?.short_name || org?.legal_name || "Órgão público",
        quotationCode: quotation.code ?? "—",

        description: quotation.description,
        specialty: quotation.specialty,

        deadlineText: deadlineText(quotation.deadline_at),
        notes: quotation.notes,
        items: (items ?? []).map((i) => ({
          sequence: i.sequence,
          description: i.description,
          measure_unit: i.measure_unit,
          quantity: Number(i.quantity),
        })),
        link: inviteLink,
        contactName: invite.contact_name,
      });

      try {
        const providerId = await sendEmail(settings, secret, { to: invite.email, ...message });
        await supabase
          .from("quotation_invitations")
          .update({
            token_hash: tokenHash,
            token_expires_at: expiryFor(quotation.deadline_at),
            send_status: "enviado",
            sent_at: new Date().toISOString(),
            last_attempt_at: new Date().toISOString(),
            attempts: (invite.attempts ?? 0) + 1,
            last_error: null,
            provider: settings.provider,
            updated_by: userId,
          })
          .eq("id", invite.id);
        results.push({ id: invite.id, email: invite.email, ok: true, providerId });
      } catch (err) {
        const detail =
          err instanceof Error ? err.message.slice(0, 400) : "Falha desconhecida no envio";
        await supabase
          .from("quotation_invitations")
          .update({
            send_status: "erro",
            last_attempt_at: new Date().toISOString(),
            attempts: (invite.attempts ?? 0) + 1,
            last_error: detail,
            provider: settings.provider,
            updated_by: userId,
          })
          .eq("id", invite.id);
        results.push({ id: invite.id, email: invite.email, ok: false, error: detail });
      }
    }
    return { ok: results.every((r) => r.ok), configured: true, message: "", results };
  });

/** Gera um link novo para entrega manual (WhatsApp, ofício, telefone). */
export const issueInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invitationId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: invite } = await supabase
      .from("quotation_invitations")
      .select("id, organization_id, quotation_id, send_status, quotation:quotations(deadline_at)")
      .eq("id", data.invitationId)
      .maybeSingle();
    if (!invite) throw new Error("Convite não encontrado neste órgão.");
    const { data: mayLink } = await supabase.rpc("can_manage_maintenance");
    if (!mayLink) throw new Error("Sem permissão para gerar o link deste convite.");
    const deadline =
      (invite.quotation as { deadline_at: string | null } | null)?.deadline_at ?? null;
    const { publicBaseUrl } = await loadSettings(invite.organization_id);
    // Sem endereço público não há link possível: não gira o token nem devolve link.
    if (!resolveBase(publicBaseUrl).isPublic) {
      return {
        link: null as string | null,
        isPublic: false,
        warning: NO_PUBLIC_BASE_MESSAGE,
        expiresAt: null as string | null,
      };
    }
    const token = randomToken();
    const { link, isPublic } = linkFor(token, publicBaseUrl);
    if (!isPublic || !link) {
      return {
        link: null as string | null,
        isPublic: false,
        warning: NO_PUBLIC_BASE_MESSAGE,
        expiresAt: null as string | null,
      };
    }
    const { error } = await supabase
      .from("quotation_invitations")
      .update({
        token_hash: await hashToken(token),
        token_expires_at: expiryFor(deadline),
        updated_by: userId,
      })
      .eq("id", invite.id);
    if (error) throw new Error("Sem permissão para gerar o link deste convite.");
    return { link, isPublic: true, warning: null as string | null, expiresAt: expiryFor(deadline) };
  });

/* ------------------------- resposta pública (token) --------------------- */

async function findInvite(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await hashToken(token);
  const { data } = await supabaseAdmin
    .from("quotation_invitations")
    .select(
      "id, organization_id, quotation_id, email, contact_name, workshop_id, supplier_id, token_expires_at, send_status, proposal_id",
    )
    .eq("token_hash", hash)
    .maybeSingle();
  return { supabaseAdmin, invite: data };
}

export const getQuotationByToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }): Promise<PublicQuotation> => {
    if (!/^[a-f0-9]{64}$/.test(data.token))
      return { ok: false, reason: "invalido", message: "Link inválido." };
    const { supabaseAdmin, invite } = await findInvite(data.token);
    if (!invite)
      return {
        ok: false,
        reason: "invalido",
        message: "Link inválido ou já substituído por um reenvio.",
      };
    // O link continua abrindo depois do prazo, apenas em leitura.
    const tokenExpired = Boolean(
      invite.token_expires_at && new Date(invite.token_expires_at).getTime() < Date.now(),
    );
    if (tokenExpired) {
      await supabaseAdmin
        .from("quotation_invitations")
        .update({ send_status: "expirado" })
        .eq("id", invite.id);
    }

    const { data: quotation } = await supabaseAdmin
      .from("quotations")
      .select(
        "code, description, specialty, quotation_kind, deadline_at, notes, status, organization_id, vehicle:vehicles(plate, asset_code, brand, model)",
      )
      .eq("id", invite.quotation_id)
      .maybeSingle();
    if (!quotation) return { ok: false, reason: "invalido", message: "Cotação não encontrada." };
    if (!["rascunho", "aberta"].includes(quotation.status)) {
      return {
        ok: false,
        reason: "encerrado",
        message: "Esta cotação não está mais recebendo propostas.",
      };
    }

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("legal_name, short_name, cnpj, city, state, logo_url")
      .eq("id", quotation.organization_id)
      .maybeSingle();
    let logoUrl: string | null = null;
    const rawLogo = (org as { logo_url?: string | null } | null)?.logo_url ?? null;
    if (rawLogo) {
      if (rawLogo.startsWith("http")) logoUrl = rawLogo;
      else {
        const { data: signed } = await supabaseAdmin.storage
          .from("brasoes")
          .createSignedUrl(rawLogo, 60 * 60);
        logoUrl = signed?.signedUrl ?? null;
      }
    }
    const { data: items } = await supabaseAdmin
      .from("quotation_items")
      .select("id, sequence, description, measure_unit, quantity")
      .eq("quotation_id", invite.quotation_id)
      .order("sequence");
    const { data: company } = invite.workshop_id
      ? await supabaseAdmin
          .from("workshops")
          .select("legal_name, trade_name")
          .eq("id", invite.workshop_id)
          .maybeSingle()
      : invite.supplier_id
        ? await supabaseAdmin
            .from("suppliers")
            .select("legal_name, trade_name")
            .eq("id", invite.supplier_id)
            .maybeSingle()
        : { data: null };

    const v = quotation.vehicle as {
      plate: string | null;
      asset_code: string | null;
      brand: string | null;
      model: string | null;
    } | null;
    const deadlinePassed =
      tokenExpired ||
      Boolean(quotation.deadline_at && new Date(quotation.deadline_at).getTime() < Date.now());
    return {
      ok: true,
      expired: deadlinePassed,
      ...(invite.send_status === "respondido" ? { reason: "respondido" as const } : {}),
      quotation: {
        code: quotation.code ?? "—",
        description: quotation.description,
        specialty: quotation.specialty,
        quotation_kind: quotation.quotation_kind ?? "servicos_pecas",

        deadline_at: quotation.deadline_at,
        notes: quotation.notes,
        organization: org?.legal_name || org?.short_name || "Órgão público",
        org_cnpj: (org as { cnpj?: string | null } | null)?.cnpj ?? null,
        org_city: (org as { city?: string | null } | null)?.city ?? null,
        org_state: (org as { state?: string | null } | null)?.state ?? null,
        org_logo_url: logoUrl,
        vehicle: v
          ? `${v.plate ?? v.asset_code ?? ""} ${v.brand ?? ""} ${v.model ?? ""}`.trim()
          : null,
      },
      items: (items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity) })),
      invitation: {
        id: invite.id,
        email: invite.email ?? "",
        contact_name: invite.contact_name,
        company: (company as { trade_name?: string | null; legal_name?: string | null } | null)
          ? ((company as { trade_name?: string | null; legal_name?: string | null }).trade_name ??
            (company as { legal_name?: string | null }).legal_name ??
            null)
          : null,
      },
    };
  });

export const submitProposalByToken = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      token: string;
      companyName: string;
      cnpj: string;
      contactName: string;
      phone: string;
      executionDays: number | null;
      warrantyDays: number | null;
      partsWarrantyDays: number | null;
      validDays: number | null;
      paymentTerms: string;
      laborHours: number;
      laborHourValue: number;
      servicesValue: number;
      discountMode: "amount" | "percent";
      discountInput: number;
      notes: string;
      items: {
        quotationItemId: string | null;
        description: string;
        brand: string;
        partNumber: string;
        unitValue: number;
      }[];
    }) => input,
  )
  .handler(async ({ data }) => {
    if (!/^[a-f0-9]{64}$/.test(data.token)) return { ok: false, message: "Link inválido." };

    const { supabaseAdmin, invite } = await findInvite(data.token);
    if (!invite) return { ok: false, message: "Link inválido." };
    if (invite.token_expires_at && new Date(invite.token_expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from("quotation_invitations")
        .update({ send_status: "expirado" })
        .eq("id", invite.id);
      return { ok: false, message: "O prazo para envio da proposta está encerrado." };
    }
    if (invite.proposal_id)
      return { ok: false, message: "Já existe proposta registrada para este convite." };

    const { data: quotation } = await supabaseAdmin
      .from("quotations")
      .select("id, status, organization_id, deadline_at, quotation_kind")
      .eq("id", invite.quotation_id)
      .maybeSingle();
    if (!quotation || !["rascunho", "aberta"].includes(quotation.status)) {
      return { ok: false, message: "Esta cotação não está mais recebendo propostas." };
    }
    // Conferência de prazo no servidor: nada é aceito depois do prazo final.
    if (quotation.deadline_at && new Date(quotation.deadline_at).getTime() < Date.now()) {
      return { ok: false, message: "O prazo para envio da proposta está encerrado." };
    }
    const kind = quotation.quotation_kind ?? "servicos_pecas";
    const kindHasParts = kind !== "servicos";
    const kindHasServices = kind !== "pecas";

    // Itens e quantidades vêm sempre do que o órgão solicitou — nunca do cliente.
    const { data: requested } = await supabaseAdmin
      .from("quotation_items")
      .select("id, description, quantity")
      .eq("quotation_id", quotation.id)
      .order("sequence");
    const requestedById = new Map((requested ?? []).map((i) => [i.id, i]));

    const orgId = invite.organization_id;

    // Conferência dos valores no servidor (o banco recalcula e valida novamente ao gravar).
    const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
    const laborHours = kindHasServices ? Math.max(0, data.laborHours || 0) : 0;
    const laborHourValue = kindHasServices ? Math.max(0, data.laborHourValue || 0) : 0;
    const laborValue = round2(laborHours * laborHourValue);
    const servicesValue = kindHasServices ? round2(Math.max(0, data.servicesValue || 0)) : 0;
    const validItems = kindHasParts
      ? data.items
          .filter((i) => i.quotationItemId && requestedById.has(i.quotationItemId))
          .map((i) => {
            const req = requestedById.get(i.quotationItemId!)!;
            return {
              quotationItemId: req.id,
              description: req.description,
              brand: i.brand,
              partNumber: i.partNumber,
              quantity: Math.max(0, Number(req.quantity) || 1),
              unitValue: Math.max(0, i.unitValue || 0),
            };
          })
      : [];
    const partsValue = round2(validItems.reduce((s, i) => s + i.quantity * i.unitValue, 0));
    const gross = round2(laborValue + servicesValue + partsValue);
    if (gross <= 0)
      return { ok: false, message: "Informe ao menos um valor de serviço ou de peça." };
    const discountInput = Math.max(0, data.discountInput || 0);
    if (data.discountMode === "percent" && discountInput > 100) {
      return { ok: false, message: "O desconto percentual não pode passar de 100%." };
    }
    if (data.discountMode === "amount" && discountInput > gross + 0.005) {
      return {
        ok: false,
        message: "O desconto em reais não pode ser maior que o valor bruto da proposta.",
      };
    }

    /*
     * Proposta + itens + desconto + marcação do convite como respondido
     * são gravados em uma única transação no banco.
     *
     * O cast é temporário até a próxima regeneração dos tipos TypeScript
     * do Supabase incluir a RPC quotation_proposal_submit_atomic.
     */
    const callRpc = supabaseAdmin.rpc as unknown as (
      functionName: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: string | null; error: { message: string } | null }>;

    const { data: proposalId, error: proposalError } = await callRpc(
      "quotation_proposal_submit_atomic",
      {
        _organization_id: orgId,
        _quotation_id: quotation.id,
        _invitation_id: invite.id,
        _workshop_id: invite.workshop_id ?? null,
        _company_name: (data.companyName || "").trim() || invite.email || "Empresa convidada",
        _cnpj: data.cnpj || null,
        _contact_name: data.contactName || invite.contact_name || null,
        _phone: data.phone || null,
        _email: invite.email || null,
        _source: "link",
        _execution_days: data.executionDays,
        _warranty_days: kindHasServices ? data.warrantyDays : null,
        _parts_warranty_days: kindHasParts ? data.partsWarrantyDays : null,
        _valid_days: data.validDays,
        _payment_terms: data.paymentTerms || null,
        _labor_hours: laborHours,
        _labor_hour_value: laborHourValue,
        _labor_value: laborValue,
        _services_value: servicesValue,
        _discount_mode: data.discountMode,
        _discount_input: discountInput,
        _notes: data.notes || null,
        _items: validItems.map((i) => ({
          quotation_item_id: i.quotationItemId,
          description: i.description.trim(),
          brand: i.brand || null,
          part_number: i.partNumber || null,
          quantity: i.quantity || 1,
          unit_value: i.unitValue || 0,
        })),
      },
    );

    if (proposalError || !proposalId) {
      return {
        ok: false,
        message: proposalError?.message ?? "Não foi possível registrar a proposta.",
      };
    }

    return { ok: true, message: "Proposta registrada com sucesso." };
  });
