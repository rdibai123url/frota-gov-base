/**
 * Rodada 2 — Etapa 3: Consulta à Tabela FIPE via provedor configurado.
 *
 * Importante: o FrotaGov não é a FIPE nem um canal oficial dela. Toda consulta
 * é feita a um provedor público configurado pelo órgão (por padrão
 * https://fipe.api.br), e o resultado é sempre identificado como
 * "Consulta à Tabela FIPE via provedor configurado".
 *
 * Regras:
 * - A chave/segredo do provedor, quando existir, fica somente no servidor,
 *   lida pelo NOME guardado no conector. Nunca vai para o navegador, para os
 *   registros técnicos ou para a exportação.
 * - O histórico mensal nunca é sobrescrito: cada mês de referência gera um
 *   registro próprio em asset_market_values (índice único por mês/origem).
 * - Indisponibilidade externa nunca interrompe a operação: a função devolve
 *   o erro tratado e o veículo continua utilizável.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_BASE = "https://fipe.api.br/api/v1";
const TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;

export type FipeKind = "carros" | "motos" | "caminhoes";

export type FipeItem = { codigo: string; nome: string };

export type FipeQuote = {
  ok: boolean;
  message: string;
  value?: number | undefined;
  fipeCode?: string | undefined;
  referenceLabel?: string | undefined;
  referenceDate?: string | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  yearModel?: number | undefined;
  fuel?: string | undefined;
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "R$ 70.727,00" -> 70727 */
export function parseFipeValue(v: string | number | null | undefined): number {
  if (typeof v === "number") return v;
  const raw = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** "setembro de 2026" -> "2026-09-01" */
export function parseFipeReference(label: string | null | undefined): string {
  const t = String(label ?? "")
    .toLowerCase()
    .trim();
  const m = MONTHS.findIndex((x) => t.startsWith(x));
  const year = t.match(/(\d{4})/)?.[1];
  if (m < 0 || !year) {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  return `${year}-${String(m + 1).padStart(2, "0")}-01`;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  attempt = 1,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`Provedor indisponível (HTTP ${res.status}).`);
      // Recuo exponencial simples: 1s, 2s, 4s.
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      return fetchJson(url, headers, attempt + 1);
    }
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const msg =
        (body as { error?: string } | null)?.error ??
        `Consulta recusada pelo provedor (HTTP ${res.status}).`;
      throw new Error(msg);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

type Ctx = { supabase: { from: (t: string) => any } }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Lê a configuração do conector FIPE do órgão (sem expor o segredo). */
async function fipeConfig(supabase: Ctx["supabase"]) {
  const { data } = await supabase
    .from("integration_connectors")
    .select("*")
    .eq("kind", "fipe")
    .maybeSingle();
  const connector = data as {
    id: string;
    organization_id: string;
    base_url: string | null;
    secret_name: string | null;
    status: string;
    config: Record<string, unknown> | null;
    rate_limit_per_minute: number | null;
    sync_interval_days: number | null;
    last_sync_at: string | null;
    failure_count: number | null;
    last_error_at: string | null;
  } | null;
  const secret = connector?.secret_name ? process.env[connector.secret_name] : undefined;
  const headers: Record<string, string> = { accept: "application/json" };
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return {
    connector,
    baseUrl: (connector?.base_url || DEFAULT_BASE).replace(/\/+$/, ""),
    headers,
  };
}

async function logFipe(
  supabase: Ctx["supabase"],
  entry: {
    organizationId: string;
    connectorId?: string | null | undefined;
    operation: string;
    status: "sucesso" | "parcial" | "erro";
    message: string;
    total?: number | undefined;
    ok?: number | undefined;
    err?: number | undefined;
    userId?: string | null | undefined;
    durationMs?: number | undefined;
  },
) {
  await supabase.from("integration_logs").insert({
    organization_id: entry.organizationId,
    connector_id: entry.connectorId ?? null,
    kind: "fipe",
    operation: entry.operation,
    direction: "entrada",
    status: entry.status,
    message: entry.message.slice(0, 1000),
    records_total: entry.total ?? 0,
    records_ok: entry.ok ?? 0,
    records_error: entry.err ?? 0,
    duration_ms: entry.durationMs ?? null,
    created_by: entry.userId ?? null,
  });
}

/* ------------------------------ catálogos ------------------------------- */

export const fipeBrands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: FipeKind }) => input)
  .handler(async ({ data, context }) => {
    const { baseUrl, headers } = await fipeConfig(context.supabase as never);
    try {
      const list = (await fetchJson(`${baseUrl}/${data.kind}/marcas`, headers)) as FipeItem[];
      return { ok: true as const, items: list ?? [], message: "" };
    } catch (e) {
      return { ok: false as const, items: [] as FipeItem[], message: msgOf(e) };
    }
  });

export const fipeModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: FipeKind; brand: string }) => input)
  .handler(async ({ data, context }) => {
    const { baseUrl, headers } = await fipeConfig(context.supabase as never);
    try {
      const res = (await fetchJson(
        `${baseUrl}/${data.kind}/marcas/${data.brand}/modelos`,
        headers,
      )) as {
        modelos?: { codigo: number | string; nome: string }[];
      };
      const items = (res?.modelos ?? []).map((m) => ({ codigo: String(m.codigo), nome: m.nome }));
      return { ok: true as const, items, message: "" };
    } catch (e) {
      return { ok: false as const, items: [] as FipeItem[], message: msgOf(e) };
    }
  });

export const fipeYears = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: FipeKind; brand: string; model: string }) => input)
  .handler(async ({ data, context }) => {
    const { baseUrl, headers } = await fipeConfig(context.supabase as never);
    try {
      const list = (await fetchJson(
        `${baseUrl}/${data.kind}/marcas/${data.brand}/modelos/${data.model}/anos`,
        headers,
      )) as FipeItem[];
      return {
        ok: true as const,
        items: (list ?? []).map((i) => ({ codigo: String(i.codigo), nome: i.nome })),
        message: "",
      };
    } catch (e) {
      return { ok: false as const, items: [] as FipeItem[], message: msgOf(e) };
    }
  });

function msgOf(e: unknown) {
  return e instanceof Error ? e.message : "Falha ao consultar o provedor da Tabela FIPE.";
}

/* ------------------------- consulta e histórico -------------------------- */

async function quote(
  baseUrl: string,
  headers: Record<string, string>,
  kind: string,
  brand: string,
  model: string,
  year: string,
): Promise<FipeQuote> {
  try {
    const r = (await fetchJson(
      `${baseUrl}/${kind}/marcas/${brand}/modelos/${model}/anos/${year}`,
      headers,
    )) as {
      Valor?: string;
      CodigoFipe?: string;
      MesReferencia?: string;
      Marca?: string;
      Modelo?: string;
      AnoModelo?: number;
      Combustivel?: string;
    };
    const value = parseFipeValue(r?.Valor);
    if (!value)
      return { ok: false, message: "O provedor não retornou valor para esta combinação." };
    return {
      ok: true,
      message: "Consulta à Tabela FIPE via provedor configurado concluída.",
      value,
      fipeCode: r.CodigoFipe ?? undefined,
      referenceLabel: r.MesReferencia ?? undefined,
      referenceDate: parseFipeReference(r.MesReferencia),
      brand: r.Marca ?? undefined,
      model: r.Modelo ?? undefined,
      yearModel: r.AnoModelo ?? undefined,
      fuel: r.Combustivel ?? undefined,
    };
  } catch (e) {
    return { ok: false, message: msgOf(e) };
  }
}

/** Grava o valor no histórico mensal sem sobrescrever meses anteriores. */
async function saveHistory(
  supabase: Ctx["supabase"],
  args: {
    organizationId: string;
    vehicleId: string;
    q: FipeQuote;
    userId: string | null;
    provider: string;
  },
) {
  const { q } = args;
  const payload = {
    organization_id: args.organizationId,
    vehicle_id: args.vehicleId,
    reference_date: q.referenceDate!,
    reference_label: q.referenceLabel ?? null,
    value: q.value!,
    origin: "api",
    source: "Tabela FIPE via provedor configurado",
    provider: args.provider,
    source_reference: q.fipeCode ?? null,
    fipe_code: q.fipeCode ?? null,
    created_by: args.userId,
  };
  const { error } = await supabase.from("asset_market_values").insert(payload);
  // Índice único por veículo/mês/origem: repetir a consulta no mesmo mês
  // apenas confirma o valor, sem duplicar nem apagar histórico.
  if (error && !String(error.message ?? "").includes("duplicate key"))
    throw new Error(error.message);
  return { duplicated: Boolean(error) };
}

/** Consulta o valor e grava vínculo + histórico do veículo. */
export const fipeQuoteVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      vehicleId: string;
      kind: FipeKind;
      brand: string;
      brandName?: string;
      model: string;
      modelName?: string;
      year: string;
      persist?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const started = Date.now();
    const { connector, baseUrl, headers } = await fipeConfig(supabase as never);

    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("id, organization_id")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (!vehicle) throw new Error("Veículo não encontrado.");

    const q = await quote(baseUrl, headers, data.kind, data.brand, data.model, data.year);

    if (!q.ok) {
      await supabase
        .from("vehicles")
        .update({ fipe_last_query_at: new Date().toISOString(), fipe_last_status: "sem_retorno" })
        .eq("id", data.vehicleId);
      await logFipe(supabase as never, {
        organizationId: vehicle.organization_id,
        connectorId: connector?.id,
        operation: "consulta_valor",
        status: "erro",
        message: q.message,
        total: 1,
        err: 1,
        userId,
        durationMs: Date.now() - started,
      });
      return { ...q, saved: false };
    }

    if (data.persist !== false) {
      await supabase
        .from("vehicles")
        .update({
          fipe_kind: data.kind,
          fipe_brand_code: data.brand,
          fipe_brand_name: data.brandName ?? q.brand ?? null,
          fipe_model_code: data.model,
          fipe_model_name: data.modelName ?? q.model ?? null,
          fipe_year_code: data.year,
          fipe_code: q.fipeCode ?? null,
          fipe_value: q.value ?? null,
          fipe_reference_label: q.referenceLabel ?? null,
          fipe_reference_date: q.referenceDate ?? null,
          fipe_last_query_at: new Date().toISOString(),
          fipe_last_status: "ok",
          fipe_linked_at: new Date().toISOString(),
        })
        .eq("id", data.vehicleId);

      await saveHistory(supabase as never, {
        organizationId: vehicle.organization_id,
        vehicleId: data.vehicleId,
        q,
        userId,
        provider: baseUrl,
      });
    }

    await logFipe(supabase as never, {
      organizationId: vehicle.organization_id,
      connectorId: connector?.id,
      operation: "consulta_valor",
      status: "sucesso",
      message: `${q.fipeCode ?? "sem código"} — ${q.referenceLabel ?? "referência atual"}`,
      total: 1,
      ok: 1,
      userId,
      durationMs: Date.now() - started,
    });

    return { ...q, saved: data.persist !== false };
  });

/** Atualiza em lote todos os veículos vinculados à FIPE. */
export const fipeRefreshAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const started = Date.now();
    const { connector, baseUrl, headers } = await fipeConfig(supabase as never);
    if (!connector) throw new Error("Conector FIPE não configurado para este órgão.");

    const limit = Math.min(Math.max(data.limit ?? 60, 1), 200);
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select(
        "id, organization_id, plate, asset_code, fipe_kind, fipe_brand_code, fipe_model_code, fipe_year_code",
      )
      .not("fipe_year_code", "is", null)
      .limit(limit);

    const list = (vehicles ?? []) as {
      id: string;
      organization_id: string;
      fipe_kind: string | null;
      fipe_brand_code: string | null;
      fipe_model_code: string | null;
      fipe_year_code: string | null;
    }[];

    const perMinute = Math.max(1, connector.rate_limit_per_minute ?? 30);
    const gap = Math.ceil(60000 / perMinute);

    let ok = 0;
    let err = 0;
    for (const v of list) {
      if (!v.fipe_brand_code || !v.fipe_model_code || !v.fipe_year_code) continue;
      const q = await quote(
        baseUrl,
        headers,
        v.fipe_kind || "carros",
        v.fipe_brand_code,
        v.fipe_model_code,
        v.fipe_year_code,
      );
      if (q.ok) {
        await supabase
          .from("vehicles")
          .update({
            fipe_value: q.value ?? null,
            fipe_code: q.fipeCode ?? null,
            fipe_reference_label: q.referenceLabel ?? null,
            fipe_reference_date: q.referenceDate ?? null,
            fipe_last_query_at: new Date().toISOString(),
            fipe_last_status: "ok",
          })
          .eq("id", v.id);
        await saveHistory(supabase as never, {
          organizationId: v.organization_id,
          vehicleId: v.id,
          q,
          userId,
          provider: baseUrl,
        });
        ok += 1;
      } else {
        await supabase
          .from("vehicles")
          .update({ fipe_last_query_at: new Date().toISOString(), fipe_last_status: "sem_retorno" })
          .eq("id", v.id);
        err += 1;
      }
      await new Promise((r) => setTimeout(r, gap));
    }

    const interval = Math.max(1, connector.sync_interval_days ?? 30);
    await supabase
      .from("integration_connectors")
      .update({
        last_attempt_at: new Date().toISOString(),
        last_sync_at: ok > 0 ? new Date().toISOString() : (connector.last_sync_at ?? null),
        last_result: `Atualização FIPE: ${ok} veículo(s) atualizado(s), ${err} sem retorno.`,
        failure_count: err > 0 && ok === 0 ? (connector.failure_count ?? 0) + 1 : 0,
        last_error_at:
          err > 0 && ok === 0 ? new Date().toISOString() : (connector.last_error_at ?? null),
        next_sync_at: new Date(Date.now() + interval * 86400000).toISOString(),
      })
      .eq("id", connector.id);

    await logFipe(supabase as never, {
      organizationId: connector.organization_id,
      connectorId: connector.id,
      operation: "atualizacao_em_lote",
      status: err === 0 ? "sucesso" : ok === 0 ? "erro" : "parcial",
      message: `${ok} atualizado(s), ${err} sem retorno em ${list.length} veículo(s) vinculado(s).`,
      total: list.length,
      ok,
      err,
      userId,
      durationMs: Date.now() - started,
    });

    return { total: list.length, ok, err };
  });
