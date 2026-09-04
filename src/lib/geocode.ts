/**
 * FrotaGov — apoio de geocodificação no cliente.
 *
 * Chama o serviço de servidor (Nominatim + cache) e grava o resultado no
 * cadastro correspondente. Todas as gravações passam pelas políticas de
 * organização já existentes (RLS) — o cliente nunca escolhe a organização.
 */
import { supabase } from "@/lib/frotagov";
import { geocodeAddress } from "@/lib/geocode.functions";

/** Cadastros com endereço operacional relevante para a rede. */
export type GeoTable = "suppliers" | "workshops" | "accredited_partners" | "external_entities";

export type AddressParts = {
  address?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
};

export type GeocodeOutcome = {
  status: "geocodificado" | "nao_encontrado" | "falhou" | "sem_endereco";
  message: string;
  latitude?: number | null;
  longitude?: number | null;
};

export const GEOCODE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente de geocodificação",
  geocodificado: "Geocodificado automaticamente",
  nao_encontrado: "Endereço não localizado",
  falhou: "Falha na consulta ao serviço de mapas",
  manual: "Coordenadas informadas manualmente",
};

/**
 * Geocodifica o endereço e grava latitude/longitude no registro.
 * Nunca lança: em caso de falha apenas marca o registro como pendente.
 */
export async function geocodeRecord(
  table: GeoTable,
  id: string,
  parts: AddressParts,
  opts: { force?: boolean } = {},
): Promise<GeocodeOutcome> {
  try {
    const res = await geocodeAddress({
      data: {
        address: parts.address ?? "",
        district: parts.district ?? "",
        city: parts.city ?? "",
        state: parts.state ?? "",
        zip: parts.zip_code ?? "",
        force: opts.force ?? false,
      },
    });

    const patch: Record<string, unknown> = {
      geocode_status: res.status,
      geocode_source: res.provider,
      geocode_precision: res.precision,
      geocoded_at: new Date().toISOString(),
    };
    if (res.ok) {
      patch["latitude"] = res.latitude;
      patch["longitude"] = res.longitude;
      patch["geocoded_address"] = res.displayName;
    }
    await supabase.from(table).update(patch).eq("id", id);

    return {
      status: res.status,
      message: res.message,
      latitude: res.latitude,
      longitude: res.longitude,
    };
  } catch {
    return { status: "falhou", message: "Não foi possível consultar o serviço de mapas agora." };
  }
}

/** Verifica se o endereço mudou o suficiente para exigir nova consulta. */
export function addressChanged(before: AddressParts | null | undefined, after: AddressParts) {
  const key = (p?: AddressParts | null) =>
    [p?.address, p?.district, p?.city, p?.state, p?.zip_code]
      .map((v) => String(v ?? "").trim().toLowerCase())
      .join("|");
  return key(before) !== key(after);
}

/** Gravação manual de coordenadas por usuário autorizado. */
export async function saveManualCoordinates(
  table: GeoTable,
  id: string,
  latitude: number | null,
  longitude: number | null,
) {
  return supabase
    .from(table)
    .update({
      latitude,
      longitude,
      geocode_status: latitude != null && longitude != null ? "manual" : "pendente",
      geocode_source: "manual",
      geocode_precision: null,
      geocoded_at: new Date().toISOString(),
    })
    .eq("id", id);
}
