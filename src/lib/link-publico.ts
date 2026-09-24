/**
 * FrotaGov — validação do endereço público usado nos links enviados a
 * fornecedores externos (convites de cotação).
 *
 * Regra: o fornecedor não tem login do FrotaGov e abre o link de fora da rede
 * do órgão. Endereços de desenvolvimento, pré-visualização do editor ou de rede
 * interna NUNCA podem ser copiados nem enviados.
 *
 * Este módulo é puro (sem acesso a rede/ambiente) e é usado tanto no servidor
 * quanto no navegador, para que a mesma regra valha nos dois lados.
 */

export const NO_PUBLIC_BASE_MESSAGE =
  "Endereço público do sistema não configurado. Publique o sistema ou informe a URL pública em Configurar envio.";

/** Endereços que jamais podem virar link de fornecedor. */
export function isInternalHost(host: string): boolean {
  const h =
    (host || "")
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .split(":")[0] ?? "";
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  // Sem ponto = host interno (ex.: "app", "frotagov", nome de container).
  if (!h.includes(".")) return true;
  if (/\.(local|localdomain|internal|intranet|test|example|invalid)$/.test(h)) return true;
  // Ambientes de edição/pré-visualização da plataforma (exigem login).
  if (/^id-preview(-[a-z0-9]+)?--/.test(h)) return true;
  if (/(^|\.)preview[-.]/.test(h)) return true;
  return false;
}

/** Normaliza para `https://host` (ou "" quando o valor não é utilizável). */
export function normalizeBase(value: string | null | undefined): string {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

/** Base pública válida (https e host externo) ou "" quando não serve. */
export function publicBase(value: string | null | undefined): string {
  const base = normalizeBase(value);
  if (!base) return "";
  let host = "";
  try {
    host = new URL(base).host;
  } catch {
    return "";
  }
  if (isInternalHost(host)) return "";
  // Endereço externo sempre em https (link de fornecedor nunca sai em http).
  return `https://${host}`;
}

/** Confere o link final (usado antes de escrever na área de transferência). */
export function isPublicInviteLink(link: string | null | undefined): boolean {
  if (!link) return false;
  try {
    const url = new URL(link);
    if (url.protocol !== "https:") return false;
    if (isInternalHost(url.host)) return false;
    return /^\/cotacao\/[a-f0-9]{64}$/.test(url.pathname);
  } catch {
    return false;
  }
}
