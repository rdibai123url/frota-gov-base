/**
 * Dibai Fleet — cálculo de rota planejada entre origem e destino de uma viagem.
 *
 * Não é rastreamento: o sistema não sabe por onde o veículo passou. O que se
 * calcula aqui é a rota rodoviária provável entre dois endereços informados no
 * agendamento, para estimar distância, duração e consumo antes da viagem.
 *
 * Provedor padrão: OSRM sobre OpenStreetMap (uso livre, sem chave). Pode ser
 * trocado por variável de ambiente do servidor, sem alterar as telas.
 * Toda consulta é cacheada por par de coordenadas, de modo que trajetos
 * repetidos (o caso comum no serviço público) nunca voltem ao provedor.
 *
 * Falha de rede NUNCA bloqueia o agendamento: a resposta apenas informa que
 * não foi possível calcular e o servidor pode digitar a distância manualmente.
 */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RoutePoint = {
  address?: string | null | undefined;
  district?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
};

/** Geometria simplificada da rota (GeoJSON LineString), só para desenhar no mapa. */
export type RouteGeometry = { type: string; coordinates: [number, number][] };

export type RouteResult = {
  ok: boolean;
  status: "calculada" | "sem_endereco" | "nao_encontrado" | "falhou";
  distanceKm: number | null;
  durationMin: number | null;
  geometry: RouteGeometry | null;
  provider: string;
  cached: boolean;
  message: string;
  origin: { lat: number; lon: number } | null;
  destination: { lat: number; lon: number } | null;
};

const TIMEOUT_MS = 9000;

function config() {
  return {
    provider: process.env["ROUTER_PROVIDER"] || "osrm",
    routerUrl: process.env["ROUTER_BASE_URL"] || "https://router.project-osrm.org/route/v1/driving",
    geocoderUrl: process.env["GEOCODER_BASE_URL"] || "https://nominatim.openstreetmap.org/search",
  };
}

const UA = "Dibai Fleet (gestao de frota publica; contato via sistema)";

async function getJson(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Consulta de rota falhou [${res.status}]: ${body.slice(0, 300)}`);
      return null;
    }
    return (await res.json()) as unknown;
  } catch (err) {
    console.error("Consulta de rota falhou:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalize(parts: (string | null | undefined)[]) {
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Converte um endereço em coordenadas, reaproveitando o cache do sistema. */
async function locate(
  supabase: SupabaseClient<Database>,
  point: RoutePoint,
  organizationId: string,
) {
  const query = normalize([point.address, point.district, point.city, point.state, "Brasil"]);
  if (!point.city?.trim()) return null;

  const { trustedGeocodeKey } = await import("./cache-context.server");
  const cacheQuery = trustedGeocodeKey(organizationId, config().provider, query);
  const { data: cached } = await supabase
    .from("geocode_cache")
    .select("latitude, longitude, found")
    .eq("query", cacheQuery)
    .maybeSingle();
  if (cached) {
    return cached.found && cached.latitude != null
      ? { lat: Number(cached.latitude), lon: Number(cached.longitude) }
      : null;
  }

  const { geocoderUrl, provider } = config();
  const json = (await getJson(
    `${geocoderUrl}?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`,
  )) as Array<{ lat: string; lon: string; display_name: string; addresstype?: string }> | null;
  const candidate = Array.isArray(json) ? json[0] : undefined;
  const hit =
    candidate &&
    Number.isFinite(Number(candidate.lat)) &&
    Number.isFinite(Number(candidate.lon)) &&
    Math.abs(Number(candidate.lat)) <= 90 &&
    Math.abs(Number(candidate.lon)) <= 180
      ? candidate
      : undefined;

  await supabase.from("geocode_cache").upsert(
    {
      query: cacheQuery,
      latitude: hit ? Number(hit.lat) : null,
      longitude: hit ? Number(hit.lon) : null,
      display_name: hit?.display_name ?? null,
      precision: hit?.addresstype ?? null,
      provider,
      found: Boolean(hit),
    },
    { onConflict: "query" },
  );

  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

export const computeRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      origin: z.object({
        address: z.string().max(500).nullish(),
        district: z.string().max(200).nullish(),
        city: z.string().max(200).nullish(),
        state: z.string().max(100).nullish(),
      }),
      destination: z.object({
        address: z.string().max(500).nullish(),
        district: z.string().max(200).nullish(),
        city: z.string().max(200).nullish(),
        state: z.string().max(100).nullish(),
      }),
      force: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<RouteResult> => {
    const { provider, routerUrl } = config();
    const base: RouteResult = {
      ok: false,
      status: "sem_endereco",
      distanceKm: null,
      durationMin: null,
      geometry: null,
      provider,
      cached: false,
      message: "Informe ao menos a cidade de origem e a de destino.",
      origin: null,
      destination: null,
    };

    const { requireCacheContext } = await import("./cache-context.server");
    const { supabase, organizationId } = await requireCacheContext(context.supabase);

    const origin = await locate(supabase, data.origin, organizationId);
    const destination = await locate(supabase, data.destination, organizationId);
    if (!origin || !destination) {
      return {
        ...base,
        status: "nao_encontrado",
        message: "Não foi possível localizar um dos endereços. Informe a distância manualmente.",
        origin,
        destination,
      };
    }

    const key = [
      origin.lat.toFixed(4),
      origin.lon.toFixed(4),
      destination.lat.toFixed(4),
      destination.lon.toFixed(4),
      provider,
    ].join("|");

    if (!data.force) {
      const { data: hit } = await supabase
        .from("route_cache")
        .select("distance_km, duration_min, geometry, provider, found")
        .eq("organization_id", organizationId)
        .eq("cache_key", key)
        .maybeSingle();
      if (hit?.found) {
        return {
          ok: true,
          status: "calculada",
          distanceKm: Number(hit.distance_km),
          durationMin: hit.duration_min == null ? null : Number(hit.duration_min),
          geometry: (hit.geometry as RouteGeometry | null) ?? null,
          provider: hit.provider,
          cached: true,
          message: "Rota obtida do cache do sistema.",
          origin,
          destination,
        };
      }
    }

    const url =
      `${routerUrl}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}` +
      `?overview=simplified&geometries=geojson&alternatives=false&steps=false`;
    const json = (await getJson(url)) as {
      code?: string;
      routes?: Array<{ distance: number; duration: number; geometry: RouteGeometry }>;
    } | null;

    if (!json) {
      return {
        ...base,
        status: "falhou",
        message: "Serviço de rotas indisponível agora. Informe a distância manualmente.",
        origin,
        destination,
      };
    }

    const candidate = json.routes?.[0];
    const route =
      candidate &&
      Number.isFinite(candidate.distance) &&
      candidate.distance >= 0 &&
      Number.isFinite(candidate.duration) &&
      candidate.duration >= 0 &&
      candidate.geometry?.type === "LineString" &&
      Array.isArray(candidate.geometry.coordinates)
        ? candidate
        : undefined;
    const found = Boolean(route);
    const distanceKm = route ? Number((route.distance / 1000).toFixed(2)) : null;
    const durationMin = route ? Math.round(route.duration / 60) : null;

    await supabase.from("route_cache").upsert(
      {
        organization_id: organizationId,
        cache_key: key,
        origin_lat: origin.lat,
        origin_lon: origin.lon,
        destination_lat: destination.lat,
        destination_lon: destination.lon,
        distance_km: distanceKm,
        duration_min: durationMin,
        geometry: (route?.geometry ?? null) as never,
        provider,
        found,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,cache_key" },
    );

    if (!found) {
      return {
        ...base,
        status: "nao_encontrado",
        message: "Não há rota rodoviária conhecida entre esses pontos.",
        origin,
        destination,
      };
    }

    return {
      ok: true,
      status: "calculada",
      distanceKm,
      durationMin,
      geometry: route?.geometry ?? null,
      provider,
      cached: false,
      message: "Rota estimada calculada.",
      origin,
      destination,
    };
  });
