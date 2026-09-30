/**
 * Requisições de saída para endereços informados por órgãos (webhooks, conectores, S3).
 *
 * Protege contra SSRF: exige https, recusa credenciais na URL, resolve o nome e
 * bloqueia endereços internos (loopback, redes privadas, link-local/metadados de
 * nuvem, CGNAT, multicast) e nunca segue redirecionamentos automaticamente.
 *
 * Para testes locais com serviços em rede interna, defina
 * FROTAGOV_ALLOW_PRIVATE_URLS=1 no ambiente (nunca em produção).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {}

function ipv4ToParts(ip: string) {
  return ip.split(".").map((n) => Number(n));
}

function isPrivateIpv4(ip: string) {
  const [a = 0, b = 0] = ipv4ToParts(ip);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(ip: string) {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  // O parser de URL normaliza para a forma hexadecimal (::ffff:7f00:1).
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (mappedHex?.[1] && mappedHex[2]) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return (
    v.startsWith("fc") ||
    v.startsWith("fd") ||
    v.startsWith("fe8") ||
    v.startsWith("fe9") ||
    v.startsWith("fea") ||
    v.startsWith("feb") ||
    v.startsWith("ff")
  );
}

export function isPrivateAddress(ip: string) {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return true;
}

/** Valida a URL e devolve o objeto URL; lança UnsafeUrlError se não for segura. */
export async function assertSafeOutboundUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Endereço inválido.");
  }
  const allowPrivate = process.env["FROTAGOV_ALLOW_PRIVATE_URLS"] === "1";

  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:"))
    throw new UnsafeUrlError("Só endereços https são permitidos.");
  if (url.username || url.password)
    throw new UnsafeUrlError("O endereço não pode conter usuário ou senha.");
  if (allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    throw new UnsafeUrlError("Endereço interno não permitido.");

  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address)))
    throw new UnsafeUrlError("Endereço interno não permitido.");
  return url;
}

/** fetch com validação anti-SSRF, sem seguir redirecionamentos. */
export async function safeFetch(raw: string, init: RequestInit = {}) {
  const url = await assertSafeOutboundUrl(raw);
  return fetch(url, { ...init, redirect: "manual" });
}
