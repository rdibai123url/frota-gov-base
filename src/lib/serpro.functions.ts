/**
 * Rodada 2 — Etapa 4: consulta oficial SERPRO / SENATRAN (base nacional).
 *
 * Regras permanentes:
 * - Nenhum dado é obtido por raspagem de sites ou fontes não autorizadas.
 * - Sem credencial válida do órgão, nenhuma consulta é feita: a tela informa
 *   "Integração disponível mediante contratação/credenciais do órgão".
 * - O retorno oficial nunca sobrescreve o cadastro automaticamente: gera um
 *   comparativo, e o usuário decide o que aplicar. Placa/chassi/RENAVAM
 *   continuam protegidos contra duplicidade pelas regras do banco.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TIMEOUT_MS = 15000;

type Json = Record<string, unknown>;

const FIELD_MAP: { source: string[]; column: string; label: string }[] = [
  { source: ["placa"], column: "plate", label: "Placa" },
  { source: ["chassi"], column: "chassis", label: "Chassi" },
  { source: ["renavam", "codigoRenavam"], column: "renavam", label: "RENAVAM" },
  { source: ["marca", "marcaModelo"], column: "brand", label: "Marca" },
  { source: ["modelo"], column: "model", label: "Modelo" },
  { source: ["anoFabricacao"], column: "year_manufacture", label: "Ano de fabricação" },
  { source: ["anoModelo"], column: "year_model", label: "Ano do modelo" },
  { source: ["cor", "corVeiculo"], column: "color", label: "Cor" },
  { source: ["combustivel"], column: "fuel_type", label: "Combustível" },
];

function pick(payload: Json, keys: string[]) {
  for (const k of keys) {
    const v = payload[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

export const consultarSerpro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vehicleId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const started = Date.now();

    const { data: connector } = await supabase
      .from("integration_connectors")
      .select("*")
      .eq("kind", "serpro")
      .maybeSingle();

    const secret = connector?.secret_name ? process.env[connector.secret_name] : undefined;
    if (!connector || !connector.base_url || !secret) {
      return {
        ok: false as const,
        available: false as const,
        message:
          "Integração disponível mediante contratação/credenciais do órgão junto ao SERPRO/SENATRAN. Nenhuma consulta foi realizada.",
        divergences: [] as { field: string; label: string; current: string | null; official: string | null }[],
      };
    }

    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (!vehicle) throw new Error("Veículo não encontrado.");
    if (!vehicle.plate) {
      return {
        ok: false as const,
        available: true as const,
        message: "Informe a placa do veículo antes de consultar a base nacional.",
        divergences: [],
      };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let payload: Json | null = null;
    let message = "";
    try {
      const url = `${connector.base_url.replace(/\/+$/, "")}/veiculo/${encodeURIComponent(
        String(vehicle.plate).replace(/[^A-Za-z0-9]/g, ""),
      )}`;
      const res = await fetch(url, {
        headers: { accept: "application/json", authorization: `Bearer ${secret}` },
        signal: ctrl.signal,
      });
      const body = (await res.json().catch(() => null)) as Json | null;
      if (!res.ok) {
        message =
          res.status === 401 || res.status === 403
            ? "As credenciais do órgão foram recusadas pelo SERPRO/SENATRAN."
            : `Consulta recusada pela base nacional (HTTP ${res.status}).`;
      } else if (!body) {
        message = "A base nacional não retornou dados para esta placa.";
      } else {
        payload = body;
        message = "Consulta oficial concluída.";
      }
    } catch (e) {
      message =
        e instanceof Error && e.message.includes("aborted")
          ? "A base nacional não respondeu no tempo limite."
          : "Não foi possível concluir a consulta oficial neste momento.";
    } finally {
      clearTimeout(timer);
    }

    const divergences: { field: string; label: string; current: string | null; official: string | null }[] = [];
    if (payload) {
      for (const f of FIELD_MAP) {
        const official = pick(payload, f.source);
        if (!official) continue;
        const current = vehicle[f.column as keyof typeof vehicle];
        const currentStr = current === null || current === undefined ? null : String(current);
        if ((currentStr ?? "").toUpperCase() !== official.toUpperCase()) {
          divergences.push({ field: f.column, label: f.label, current: currentStr, official });
        }
      }

      await supabase.from("detran_snapshots").insert({
        organization_id: vehicle.organization_id,
        vehicle_id: vehicle.id,
        source: "serpro",
        payload: payload as never,
        divergences: divergences as never,
        fetched_at: new Date().toISOString(),
        created_by: userId,
      });
    }

    await supabase.from("integration_logs").insert({
      organization_id: vehicle.organization_id,
      connector_id: connector.id,
      kind: "serpro",
      operation: "consulta_veiculo",
      direction: "entrada",
      status: payload ? "sucesso" : "erro",
      message: message.slice(0, 1000),
      records_total: 1,
      records_ok: payload ? 1 : 0,
      records_error: payload ? 0 : 1,
      duration_ms: Date.now() - started,
      created_by: userId,
    });

    return { ok: Boolean(payload), available: true as const, message, divergences };
  });

/** Aplica ao cadastro apenas os campos escolhidos pelo usuário. */
export const aplicarDadosOficiais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vehicleId: string; fields: Record<string, string> }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const allowed = new Set(FIELD_MAP.map((f) => f.column));
    const update: Record<string, unknown> = { updated_by: userId };
    for (const [k, v] of Object.entries(data.fields)) {
      if (!allowed.has(k)) continue;
      update[k] = k.startsWith("year_") ? Number(v) || null : v;
    }
    const { error } = await supabase.from("vehicles").update(update as never).eq("id", data.vehicleId);
    if (error) throw new Error(error.message);
    return { ok: true, applied: Object.keys(update).filter((k) => k !== "updated_by") };
  });
