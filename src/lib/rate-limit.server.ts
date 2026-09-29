/**
 * Limitador simples em memória para rotas públicas.
 * Vale por instância do servidor: reduz abuso e ruído, mas não substitui
 * um limite global (usado junto com a checagem no banco onde há gravação).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

/** IP do cliente a partir dos cabeçalhos do proxy (Vercel). */
export function clientIp(headers: (name: string) => string | undefined) {
  const forwarded = headers("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headers("x-real-ip") || "desconhecido").slice(0, 64);
}
