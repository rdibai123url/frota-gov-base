/**
 * FrotaGov — envio de e-mail institucional (somente servidor).
 *
 * Arquitetura por provedor: SMTP institucional, Resend e SendGrid.
 * A credencial nunca sai do servidor: fica em `org_email_secrets`, tabela
 * acessível apenas pelo papel de serviço, e jamais é devolvida ao navegador,
 * gravada em log ou incluída na exportação integral.
 */

export type EmailProvider = "nenhum" | "smtp" | "resend" | "sendgrid";

export type EmailSettings = {
  provider: EmailProvider;
  enabled: boolean;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  smtp_user: string | null;
  has_secret: boolean;
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export class EmailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailNotConfiguredError";
  }
}

/** Valida a configuração e devolve mensagem amigável quando faltar algo. */
export function checkSettings(s: EmailSettings | null): string | null {
  if (!s || !s.enabled || s.provider === "nenhum") return "Envio de e-mail não configurado.";
  if (!s.from_email) return "Envio de e-mail não configurado: falta o e-mail remetente.";
  if (!s.has_secret) return "Envio de e-mail não configurado: falta a senha/chave do provedor.";
  if (s.provider === "smtp" && (!s.smtp_host || !s.smtp_port || !s.smtp_user)) {
    return "Envio de e-mail não configurado: faltam servidor, porta ou usuário SMTP.";
  }
  return null;
}

function fromHeader(s: EmailSettings) {
  const name = (s.from_name || "FrotaGov").replace(/["\\<>]/g, " ").trim();
  return `"${name}" <${s.from_email}>`;
}

async function sendResend(s: EmailSettings, secret: string, msg: EmailMessage): Promise<string | null> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromHeader(s),
      to: [msg.to],
      ...(s.reply_to ? { reply_to: s.reply_to } : {}),
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  // O Resend confirma o aceite devolvendo o identificador do envio.
  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return body?.id ?? null;
}

async function sendSendgrid(s: EmailSettings, secret: string, msg: EmailMessage) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: msg.to }] }],
      from: { email: s.from_email, name: s.from_name || "FrotaGov" },
      ...(s.reply_to ? { reply_to: { email: s.reply_to } } : {}),
      subject: msg.subject,
      content: [
        { type: "text/plain", value: msg.text },
        { type: "text/html", value: msg.html },
      ],
    }),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/* --------------------------------- SMTP --------------------------------- */

type SmtpSocket = {
  write: (data: string) => Promise<void>;
  read: () => Promise<string>;
  close: () => Promise<void>;
  startTls?: () => Promise<SmtpSocket>;
};

async function openSocket(host: string, port: number, secure: boolean): Promise<SmtpSocket> {
  // `cloudflare:sockets` no runtime de produção (Workers).
  const specifier = "cloudflare:sockets";
  const mod = (await import(/* @vite-ignore */ specifier).catch(() => null)) as
    | { connect: (addr: string, opts?: Record<string, unknown>) => unknown }
    | null;
  if (!mod?.connect) throw new Error("SMTP indisponível neste runtime.");
  const socket = mod.connect(`${host}:${port}`, secure ? { secureTransport: "starttls" } : {}) as {
    writable: WritableStream<Uint8Array>;
    readable: ReadableStream<Uint8Array>;
    close: () => Promise<void>;
    startTls?: () => unknown;
  };
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  return {
    write: async (data) => {
      await writer.write(enc.encode(data));
    },
    read: async () => {
      const { value } = await reader.read();
      return value ? dec.decode(value) : "";
    },
    close: async () => {
      try {
        await socket.close();
      } catch {
        /* ignora */
      }
    },
  };
}

function expect(response: string, codes: string[]) {
  if (!codes.some((c) => response.startsWith(c))) {
    throw new Error(`SMTP respondeu: ${response.trim().slice(0, 200)}`);
  }
}

async function sendSmtp(s: EmailSettings, secret: string, msg: EmailMessage) {
  const sock = await openSocket(s.smtp_host!, s.smtp_port!, s.smtp_secure);
  try {
    expect(await sock.read(), ["220"]);
    await sock.write(`EHLO frotagov\r\n`);
    expect(await sock.read(), ["250"]);
    await sock.write(`AUTH LOGIN\r\n`);
    expect(await sock.read(), ["334"]);
    await sock.write(`${btoa(s.smtp_user!)}\r\n`);
    expect(await sock.read(), ["334"]);
    await sock.write(`${btoa(secret)}\r\n`);
    expect(await sock.read(), ["235"]);
    await sock.write(`MAIL FROM:<${s.from_email}>\r\n`);
    expect(await sock.read(), ["250"]);
    await sock.write(`RCPT TO:<${msg.to}>\r\n`);
    expect(await sock.read(), ["250", "251"]);
    await sock.write(`DATA\r\n`);
    expect(await sock.read(), ["354"]);
    const boundary = `frotagov-${Math.random().toString(36).slice(2)}`;
    const body = [
      `From: ${fromHeader(s)}`,
      `To: ${msg.to}`,
      s.reply_to ? `Reply-To: ${s.reply_to}` : null,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(msg.subject)))}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      msg.text.replace(/^\./gm, ".."),
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      msg.html.replace(/^\./gm, ".."),
      `--${boundary}--`,
      `.`,
      ``,
    ]
      .filter((l) => l !== null)
      .join("\r\n");
    await sock.write(body);
    expect(await sock.read(), ["250"]);
    await sock.write(`QUIT\r\n`);
  } finally {
    await sock.close();
  }
}

/** Dispara uma mensagem individual (um destinatário por envio). */
export async function sendEmail(settings: EmailSettings, secret: string, msg: EmailMessage) {
  const problem = checkSettings(settings);
  if (problem) throw new EmailNotConfiguredError(problem);
  if (settings.provider === "resend") return sendResend(settings, secret, msg);
  if (settings.provider === "sendgrid") return sendSendgrid(settings, secret, msg);
  return sendSmtp(settings, secret, msg);
}

/* ------------------------------- Template ------------------------------- */

function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InviteEmailData = {
  orgName: string;
  quotationCode: string;
  description: string;
  specialty: string | null;
  deadlineText: string;
  notes: string | null;
  items: { sequence: number; description: string; measure_unit: string; quantity: number }[];
  link: string;
  contactName: string | null;
};

/** Template institucional responsivo + versão texto simples. */
export function renderInviteEmail(d: InviteEmailData): { subject: string; html: string; text: string } {
  const subject = `Convite para cotação ${d.quotationCode} — ${d.orgName}`;
  const rows = d.items.length
    ? d.items
        .map(
          (i) =>
            `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e5e5">${i.sequence}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e5e5">${esc(
              i.description,
            )}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e5e5">${esc(i.measure_unit)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:right">${String(
              i.quantity,
            ).replace(".", ",")}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="padding:8px">Itens detalhados no link da cotação.</td></tr>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden">
  <tr><td style="background:#111111;padding:18px 24px;color:#ffffff">
    <div style="font-size:18px;font-weight:bold;letter-spacing:.5px">FrotaGov</div>
    <div style="font-size:13px;color:#d4d4d4">${esc(d.orgName)}</div>
  </td></tr>
  <tr><td style="padding:24px">
    <h1 style="margin:0 0 8px;font-size:19px">Convite para apresentação de proposta</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6">${d.contactName ? `Prezado(a) ${esc(d.contactName)},` : "Prezado(a) fornecedor(a),"} o órgão <strong>${esc(
      d.orgName,
    )}</strong> convida sua empresa a apresentar proposta para a cotação abaixo.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border:1px solid #e5e5e5;border-radius:8px">
      <tr><td style="padding:8px 12px;color:#666">Cotação</td><td style="padding:8px 12px"><strong>${esc(d.quotationCode)}</strong></td></tr>
      <tr><td style="padding:8px 12px;color:#666">Objeto</td><td style="padding:8px 12px">${esc(d.description)}</td></tr>
      ${d.specialty ? `<tr><td style="padding:8px 12px;color:#666">Especialidade</td><td style="padding:8px 12px">${esc(d.specialty)}</td></tr>` : ""}
      <tr><td style="padding:8px 12px;color:#666">Prazo final</td><td style="padding:8px 12px"><strong>${esc(d.deadlineText)}</strong></td></tr>
    </table>
    <h2 style="font-size:15px;margin:20px 0 6px">Itens / serviços</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
      <tr style="background:#fafafa"><th align="left" style="padding:6px 8px">#</th><th align="left" style="padding:6px 8px">Descrição</th><th align="left" style="padding:6px 8px">Un.</th><th align="right" style="padding:6px 8px">Qtd.</th></tr>
      ${rows}
    </table>
    ${d.notes ? `<p style="font-size:13px;color:#444;margin:16px 0 0"><strong>Observações:</strong> ${esc(d.notes)}</p>` : ""}
    <div style="text-align:center;margin:26px 0 6px">
      <a href="${esc(d.link)}" style="display:inline-block;background:#b91c1c;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:bold;font-size:15px">Responder cotação</a>
    </div>
    <p style="font-size:12px;color:#666;text-align:center;margin:0">Link exclusivo e pessoal. Não repasse este endereço.<br>${esc(d.link)}</p>
  </td></tr>
  <tr><td style="background:#fafafa;padding:14px 24px;font-size:11px;color:#777;border-top:1px solid #eee">
    Mensagem automática do sistema de gestão de frota do órgão. Não responda a este e-mail.
  </td></tr>
</table>
</td></tr></table></body></html>`;

  const text = [
    `${d.orgName} — Convite para cotação ${d.quotationCode}`,
    ``,
    `Objeto: ${d.description}`,
    d.specialty ? `Especialidade: ${d.specialty}` : null,
    `Prazo final para resposta: ${d.deadlineText}`,
    ``,
    `Itens / serviços:`,
    ...(d.items.length
      ? d.items.map((i) => `  ${i.sequence}. ${i.description} — ${String(i.quantity).replace(".", ",")} ${i.measure_unit}`)
      : ["  Detalhados no link da cotação."]),
    d.notes ? `\nObservações: ${d.notes}` : "",
    ``,
    `Responder cotação: ${d.link}`,
    ``,
    `Link exclusivo e pessoal. Mensagem automática — não responda a este e-mail.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { subject, html, text };
}
