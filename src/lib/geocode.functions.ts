/**
 * FrotaGov — serviço de geocodificação desacoplado (Etapa 2).
 *
 * Provedor padrão: OpenStreetMap / Nominatim (uso livre, sem API paga),
 * respeitando a política de uso: identificação por User-Agent, uma consulta
 * por vez e cache persistente para nunca repetir o mesmo endereço.
 *
 * O provedor é configurável por variável de ambiente do servidor
 * (GEOCODER_PROVIDER / GEOCODER_BASE_URL); nada é chamado a partir do
 * navegador e nenhuma chave é exposta.
 *
 * Falha de rede NUNCA bloqueia o cadastro: a resposta apenas informa
 * "falhou" e o registro fica pendente de geocodificação.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GeocodeResult = {
  ok: boolean;
  status: "geocodificado" | "nao_encontrado" | "falhou" | "sem_endereco";
  latitude: number | null;
  longitude: number | null;
  displayName: string | null;
  precision: string | null;
  provider: string;
  cached: boolean;
  message: string;
};

const TIMEOUT_MS = 8000;

function providerConfig() {
  const provider = process.env["GEOCODER_PROVIDER"] || "nominatim";
  const baseUrl = process.env["GEOCODER_BASE_URL"] || "https://nominatim.openstreetmap.org/search";
  return { provider, baseUrl };
}

/** Normaliza o endereço para servir de chave estável de cache. */
export function normalizeQuery(parts: (string | null | undefined)[]) {
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function fetchWithTimeout(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "FrotaGov/10.7 (gestao de frota publica; contato via sistema)",
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export const geocodeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      address?: string;
      district?: string;
      city?: string;
      state?: string;
      zip?: string;
      force?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<GeocodeResult> => {
    const { provider, baseUrl } = providerConfig();
    const query = normalizeQuery([
      data.address,
      data.district,
      data.city,
      data.state,
      data.zip,
      "Brasil",
    ]);
    const base: GeocodeResult = {
      ok: false,
      status: "sem_endereco",
      latitude: null,
      longitude: null,
      displayName: null,
      precision: null,
      provider,
      cached: false,
      message: "Endereço insuficiente para localizar no mapa.",
    };
    // Exige ao menos logradouro + município.
    if (!data.address?.trim() || !data.city?.trim()) return base;

    const supabase = context.supabase;

    if (!data.force) {
      const { data: cached } = await supabase
        .from("geocode_cache")
        .select("latitude, longitude, display_name, precision, provider, found")
        .eq("query", query)
        .maybeSingle();
      if (cached) {
        return cached.found
          ? {
              ok: true,
              status: "geocodificado",
              latitude: Number(cached.latitude),
              longitude: Number(cached.longitude),
              displayName: cached.display_name,
              precision: cached.precision,
              provider: cached.provider,
              cached: true,
              message: "Coordenadas obtidas do cache do sistema.",
            }
          : {
              ...base,
              status: "nao_encontrado",
              cached: true,
              message: "Endereço não localizado pelo provedor (consulta em cache).",
            };
      }
    }

    try {
      const url = `${baseUrl}?format=jsonv2&limit=1&countrycodes=br&addressdetails=1&q=${encodeURIComponent(query)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        const body = await res.text();
        console.error(`Geocodificação falhou [${res.status}]: ${body.slice(0, 300)}`);
        return {
          ...base,
          status: "falhou",
          message: `Serviço de geocodificação indisponível (${res.status}).`,
        };
      }
      const json = (await res.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
        addresstype?: string;
        type?: string;
      }>;
      const hit = json?.[0];
      const found = Boolean(hit);
      const lat = hit ? Number(hit.lat) : null;
      const lon = hit ? Number(hit.lon) : null;
      const precision = hit ? (hit.addresstype ?? hit.type ?? null) : null;

      await supabase.from("geocode_cache").upsert(
        {
          query,
          latitude: lat,
          longitude: lon,
          display_name: hit?.display_name ?? null,
          precision,
          provider,
          found,
        },
        { onConflict: "query" },
      );

      if (!found) {
        return {
          ...base,
          status: "nao_encontrado",
          message: "Endereço não localizado pelo provedor de mapas.",
        };
      }
      return {
        ok: true,
        status: "geocodificado",
        latitude: lat,
        longitude: lon,
        displayName: hit!.display_name,
        precision,
        provider,
        cached: false,
        message: "Coordenadas obtidas automaticamente.",
      };
    } catch (err) {
      console.error("Geocodificação falhou:", err);
      return {
        ...base,
        status: "falhou",
        message: "Não foi possível consultar o serviço de mapas agora.",
      };
    }
  });
