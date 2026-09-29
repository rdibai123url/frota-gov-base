/**
 * Avisos de vencimento por e-mail (somente servidor).
 * Monta o resumo do que está vencido ou perto de vencer e envia pelo e-mail já configurado
 * do órgão. Não envia nada quando não há itens.
 */
import { checkSettings, loadOrgEmailSettings, sendEmail } from "@/lib/email.server";

export type AvisoItem = {
  kind: string;
  title: string;
  detail: string;
  due_date: string;
  days: number;
  phone: string | null;
};

const KIND_LABEL: Record<string, string> = {
  cnh: "Habilitação (CNH)",
  seguro: "Seguros",
  contrato: "Contratos",
  obrigacao: "Obrigações legais",
  garantia: "Garantia de fábrica",
  revisao: "Revisões preventivas",
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const dateBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");

function whenText(days: number) {
  if (days < 0) return `venceu há ${Math.abs(days)} dia(s)`;
  if (days === 0) return "vence hoje";
  return `vence em ${days} dia(s)`;
}

export function renderDigest(orgName: string, items: AvisoItem[]) {
  const groups = new Map<string, AvisoItem[]>();
  for (const it of items) groups.set(it.kind, [...(groups.get(it.kind) ?? []), it]);

  const textLines: string[] = [`FrotaGov — avisos de vencimento de ${orgName}`, ""];
  let html = `<div style="font-family:Arial,sans-serif;color:#0f1f38;max-width:640px">
  <h2 style="color:#0b2545;margin:0 0 4px">Avisos de vencimento</h2>
  <p style="margin:0 0 16px;color:#5b6b82">${esc(orgName)} — ${items.length} item(ns) precisam de atenção.</p>`;

  for (const [kind, list] of groups) {
    const sorted = [...list].sort((a, b) => a.days - b.days);
    textLines.push(KIND_LABEL[kind] ?? kind);
    html += `<h3 style="color:#0b2545;margin:18px 0 6px;font-size:15px">${esc(KIND_LABEL[kind] ?? kind)}</h3><ul style="padding-left:18px;margin:0">`;
    for (const it of sorted) {
      const line = `${it.title} — ${it.detail}, ${whenText(it.days)} (${dateBR(it.due_date)})`;
      textLines.push(`- ${line}`);
      const color = it.days < 0 ? "#c53030" : "#0f1f38";
      html += `<li style="margin:3px 0;color:${color}">${esc(line)}</li>`;
    }
    html += "</ul>";
    textLines.push("");
  }
  html += `<p style="margin-top:22px;font-size:12px;color:#5b6b82">Mensagem automática do FrotaGov. Os prazos de aviso são ajustados na tela “Avisos de vencimento”.</p></div>`;
  return { html, text: textLines.join("\n") };
}

export type SendResult = {
  ok: boolean;
  status: "enviado" | "erro" | "sem_itens";
  items: number;
  recipients: number;
  message: string;
};

/** Envia o resumo do órgão. `force` ignora a frequência e o intervalo mínimo. */
export async function sendDigest(orgId: string, force: boolean): Promise<SendResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cfg } = await supabaseAdmin
    .from("notification_settings")
    .select("email_enabled, recipients, frequency, last_sent_at")
    .eq("organization_id", orgId)
    .maybeSingle();
  const recipients = (cfg?.recipients ?? []).filter(Boolean);

  const log = async (r: SendResult) => {
    await supabaseAdmin.from("notification_log").insert({
      organization_id: orgId,
      channel: "email",
      status: r.status,
      items_count: r.items,
      recipients_count: r.recipients,
      message: r.message.slice(0, 500),
    });
    return r;
  };

  if (!force) {
    if (!cfg?.email_enabled || recipients.length === 0)
      return {
        ok: true,
        status: "sem_itens",
        items: 0,
        recipients: 0,
        message: "Avisos desligados.",
      };
    const last = cfg.last_sent_at ? new Date(cfg.last_sent_at).getTime() : 0;
    if (Date.now() - last < 20 * 3600 * 1000)
      return {
        ok: true,
        status: "sem_itens",
        items: 0,
        recipients: 0,
        message: "Já enviado hoje.",
      };
    if (cfg.frequency === "semanal" && new Date().getDay() !== 1)
      return {
        ok: true,
        status: "sem_itens",
        items: 0,
        recipients: 0,
        message: "Aguardando a segunda-feira.",
      };
  }
  if (recipients.length === 0)
    return {
      ok: false,
      status: "erro",
      items: 0,
      recipients: 0,
      message: "Nenhum e-mail de destino cadastrado.",
    };

  const { data: rows, error } = await supabaseAdmin.rpc("notification_items", { _org: orgId });
  if (error)
    return log({
      ok: false,
      status: "erro",
      items: 0,
      recipients: recipients.length,
      message: error.message,
    });
  const items = (rows ?? []) as AvisoItem[];
  if (items.length === 0)
    return log({
      ok: true,
      status: "sem_itens",
      items: 0,
      recipients: recipients.length,
      message: "Nada vencendo.",
    });

  const { settings, secret } = await loadOrgEmailSettings(orgId);
  const problem = checkSettings(settings);
  if (problem || !settings)
    return log({
      ok: false,
      status: "erro",
      items: items.length,
      recipients: recipients.length,
      message: problem ?? "E-mail não configurado.",
    });

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("legal_name, short_name")
    .eq("id", orgId)
    .maybeSingle();
  const name = org?.short_name || org?.legal_name || "Órgão";
  const { html, text } = renderDigest(name, items);

  let sent = 0;
  const errors: string[] = [];
  for (const to of recipients) {
    try {
      await sendEmail(settings, secret, {
        to,
        subject: `FrotaGov — ${items.length} aviso(s) de vencimento`,
        html,
        text,
      });
      sent++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "falha");
    }
  }
  if (sent > 0) {
    await supabaseAdmin
      .from("notification_settings")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("organization_id", orgId);
  }
  return log({
    ok: sent > 0,
    status: sent > 0 ? "enviado" : "erro",
    items: items.length,
    recipients: sent,
    message: sent > 0 ? `Enviado a ${sent} destinatário(s).` : (errors[0] ?? "Falha no envio."),
  });
}
