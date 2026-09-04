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
  quotation?: {
    code: string;
    description: string;
    specialty: string | null;
    deadline_at: string | null;
    notes: string | null;
    organization: string;
    vehicle: string | null;
  };
  items?: { id: string; sequence: number; description: string; measure_unit: string; quantity: number }[];
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

function baseUrl() {
  const origin = getRequestHeader("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const host = getRequestHeader("host");
  const proto = getRequestHeader("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

function linkFor(token: string) {
  return `${baseUrl()}/cotacao/${token}`;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function deadlineText(deadline: string | null) {
  if (!deadline) return "sem prazo definido";
  return new Date(deadline).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

function expiryFor(deadline: string | null) {
  const fallback = Date.now() + TOKEN_TTL_DAYS * 86400000;
  const at = deadline ? new Date(deadline).getTime() : fallback;
  return new Date(Number.isFinite(at) ? at : fallback).toISOString();
}

/* --------------------------- configuração de e-mail --------------------- */

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    provider: EmailSettings["provider"];
    enabled: boolean;
    fromName: string;
    fromEmail: string;
    replyTo: string;
    smtpHost: string;
    smtpPort: number | null;
    smtpSecure: boolean;
    smtpUser: string;
    /** Enviado apenas quando o usuário digita uma nova credencial. */
    secret?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: orgId, error: orgErr } = await supabase.rpc("current_org_id");
    if (orgErr || !orgId) throw new Error("Órgão não identificado.");
    const { data: allowed } = await supabase.rpc("can_manage_users");
    if (!allowed) throw new Error("Sem permissão para configurar o envio de e-mail.");

    const hasNewSecret = typeof data.secret === "string" && data.secret.trim().length > 0;
    if (hasNewSecret) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("org_email_secrets")
        .upsert({ organization_id: orgId, secret: data.secret!.trim(), updated_at: new Date().toISOString() });
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
      has_secret: hasNewSecret ? true : Boolean(existing?.has_secret),
      updated_by: userId,
    };

    const { error } = existing
      ? await supabase.from("org_email_settings").update(payload).eq("id", existing.id)
      : await supabase.from("org_email_settings").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true, hasSecret: payload.has_secret };
  });

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
        workshop_id: target.kind === "workshop" ? target.id ?? null : null,
        supplier_id: target.kind === "supplier" ? target.id ?? null : null,
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
        skipped.push({ email, reason: error?.message.includes("duplicate") ? "Já convidado" : error?.message ?? "Falha" });
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
    .select("provider, enabled, from_name, from_email, reply_to, smtp_host, smtp_port, smtp_secure, smtp_user, has_secret")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) return { settings: null as EmailSettings | null, secret: "" };
  const { data: secretRow } = await supabaseAdmin
    .from("org_email_secrets")
    .select("secret")
    .eq("organization_id", orgId)
    .maybeSingle();
  return { settings: data as EmailSettings, secret: secretRow?.secret ?? "" };
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

    const { settings, secret } = await loadSettings(quotation.organization_id);
    const problem = checkSettings(settings);
    if (problem || !settings) return { ok: false, configured: false, message: problem ?? "Envio de e-mail não configurado.", results: [] };

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

    const results: { id: string; email: string; ok: boolean; error?: string }[] = [];

    for (const invite of invites ?? []) {
      if (!invite.email) continue;
      // Cada envio gera um token novo: o link antigo deixa de valer.
      const token = randomToken();
      const tokenHash = await hashToken(token);
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
        link: linkFor(token),
        contactName: invite.contact_name,
      });

      try {
        await sendEmail(settings, secret, { to: invite.email, ...message });
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
        results.push({ id: invite.id, email: invite.email, ok: true });
      } catch (err) {
        const detail = err instanceof Error ? err.message.slice(0, 400) : "Falha desconhecida no envio";
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
      .select("id, quotation_id, send_status, quotation:quotations(deadline_at)")
      .eq("id", data.invitationId)
      .maybeSingle();
    if (!invite) throw new Error("Convite não encontrado neste órgão.");
    const token = randomToken();
    const deadline = (invite.quotation as { deadline_at: string | null } | null)?.deadline_at ?? null;
    const { error } = await supabase
      .from("quotation_invitations")
      .update({
        token_hash: await hashToken(token),
        token_expires_at: expiryFor(deadline),
        updated_by: userId,
      })
      .eq("id", invite.id);
    if (error) throw new Error("Sem permissão para gerar o link deste convite.");
    return { link: linkFor(token), expiresAt: expiryFor(deadline) };
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
    if (!/^[a-f0-9]{64}$/.test(data.token)) return { ok: false, reason: "invalido", message: "Link inválido." };
    const { supabaseAdmin, invite } = await findInvite(data.token);
    if (!invite) return { ok: false, reason: "invalido", message: "Link inválido ou já substituído por um reenvio." };
    if (invite.token_expires_at && new Date(invite.token_expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("quotation_invitations").update({ send_status: "expirado" }).eq("id", invite.id);
      return { ok: false, reason: "expirado", message: "O prazo desta cotação está encerrado." };
    }

    const { data: quotation } = await supabaseAdmin
      .from("quotations")
      .select("code, description, specialty, deadline_at, notes, status, organization_id, vehicle:vehicles(plate, asset_code, brand, model)")
      .eq("id", invite.quotation_id)
      .maybeSingle();
    if (!quotation) return { ok: false, reason: "invalido", message: "Cotação não encontrada." };
    if (!["rascunho", "aberta"].includes(quotation.status)) {
      return { ok: false, reason: "encerrado", message: "Esta cotação não está mais recebendo propostas." };
    }

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("legal_name, short_name")
      .eq("id", quotation.organization_id)
      .maybeSingle();
    const { data: items } = await supabaseAdmin
      .from("quotation_items")
      .select("id, sequence, description, measure_unit, quantity")
      .eq("quotation_id", invite.quotation_id)
      .order("sequence");
    const { data: company } = invite.workshop_id
      ? await supabaseAdmin.from("workshops").select("legal_name, trade_name").eq("id", invite.workshop_id).maybeSingle()
      : invite.supplier_id
        ? await supabaseAdmin.from("suppliers").select("legal_name, trade_name").eq("id", invite.supplier_id).maybeSingle()
        : { data: null };

    const v = quotation.vehicle as { plate: string | null; asset_code: string | null; brand: string | null; model: string | null } | null;
    return {
      ok: true,
      ...(invite.send_status === "respondido" ? { reason: "respondido" as const } : {}),
      quotation: {
        code: quotation.code ?? "—",
        description: quotation.description,
        specialty: quotation.specialty,
        deadline_at: quotation.deadline_at,
        notes: quotation.notes,
        organization: org?.short_name || org?.legal_name || "Órgão público",
        vehicle: v ? `${v.plate ?? v.asset_code ?? ""} ${v.brand ?? ""} ${v.model ?? ""}`.trim() : null,
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
  .inputValidator((input: {
    token: string;
    companyName: string;
    cnpj: string;
    contactName: string;
    phone: string;
    executionDays: number | null;
    warrantyDays: number | null;
    validUntil: string | null;
    paymentTerms: string;
    laborValue: number;
    discountValue: number;
    notes: string;
    items: { quotationItemId: string | null; description: string; brand: string; quantity: number; unitValue: number }[];
  }) => input)
  .handler(async ({ data }) => {
    if (!/^[a-f0-9]{64}$/.test(data.token)) return { ok: false, message: "Link inválido." };
    const { supabaseAdmin, invite } = await findInvite(data.token);
    if (!invite) return { ok: false, message: "Link inválido." };
    if (invite.token_expires_at && new Date(invite.token_expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("quotation_invitations").update({ send_status: "expirado" }).eq("id", invite.id);
      return { ok: false, message: "O prazo desta cotação está encerrado." };
    }
    if (invite.proposal_id) return { ok: false, message: "Já existe proposta registrada para este convite." };

    const { data: quotation } = await supabaseAdmin
      .from("quotations")
      .select("id, status, organization_id")
      .eq("id", invite.quotation_id)
      .maybeSingle();
    if (!quotation || !["rascunho", "aberta"].includes(quotation.status)) {
      return { ok: false, message: "Esta cotação não está mais recebendo propostas." };
    }

    const orgId = invite.organization_id;
    const digits = (data.cnpj || "").replace(/\D/g, "");
    const name = (data.companyName || "").trim() || invite.email || "Empresa convidada";

    // A proposta é sempre vinculada a uma empresa do cadastro do órgão.
    let workshopId = invite.workshop_id as string | null;
    if (!workshopId) {
      if (digits) {
        const { data: byCnpj } = await supabaseAdmin
          .from("workshops")
          .select("id")
          .eq("organization_id", orgId)
          .eq("cnpj", digits)
          .maybeSingle();
        workshopId = byCnpj?.id ?? null;
      }
      if (!workshopId) {
        const { data: novo, error } = await supabaseAdmin
          .from("workshops")
          .insert({
            organization_id: orgId,
            legal_name: name,
            trade_name: name,
            cnpj: digits || null,
            email: invite.email,
            phone: data.phone || null,
            contact_name: data.contactName || invite.contact_name,
            status: "ativo",
          })
          .select("id")
          .maybeSingle();
        if (error || !novo) return { ok: false, message: "Não foi possível registrar a empresa da proposta." };
        workshopId = novo.id;
      }
      await supabaseAdmin.from("quotation_invitations").update({ workshop_id: workshopId }).eq("id", invite.id);
    }

    const { data: existing } = await supabaseAdmin
      .from("quotation_proposals")
      .select("id")
      .eq("quotation_id", quotation.id)
      .eq("workshop_id", workshopId!)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("quotation_invitations")
        .update({ send_status: "respondido", status: "respondida", responded_at: new Date().toISOString(), proposal_id: existing.id })
        .eq("id", invite.id);
      return { ok: false, message: "Já existe proposta desta empresa nesta cotação." };
    }

    const { data: proposal, error: pErr } = await supabaseAdmin
      .from("quotation_proposals")
      .insert({
        organization_id: orgId,
        quotation_id: quotation.id,
        workshop_id: workshopId!,
        execution_days: data.executionDays,
        warranty_days: data.warrantyDays,
        valid_until: data.validUntil || null,
        payment_terms: data.paymentTerms || null,
        labor_value: data.laborValue || 0,
        discount_value: data.discountValue || 0,
        notes: data.notes || null,
      })
      .select("id")
      .maybeSingle();
    if (pErr || !proposal) return { ok: false, message: "Não foi possível registrar a proposta." };

    const rows = data.items
      .filter((i) => i.description.trim())
      .map((i) => ({
        organization_id: orgId,
        proposal_id: proposal.id,
        quotation_item_id: i.quotationItemId,
        description: i.description.trim(),
        brand: i.brand || null,
        quantity: i.quantity || 1,
        unit_value: i.unitValue || 0,
      }));
    if (rows.length) await supabaseAdmin.from("quotation_proposal_items").insert(rows);

    await supabaseAdmin
      .from("quotation_invitations")
      .update({
        send_status: "respondido",
        status: "respondida",
        responded_at: new Date().toISOString(),
        proposal_id: proposal.id,
      })
      .eq("id", invite.id);

    return { ok: true, message: "Proposta registrada com sucesso." };
  });
