/**
 * Rastreamento e telemetria.
 *
 * Origem: editais de gerenciamento de frota que exigem localização, alertas de
 * velocidade/bateria, cercas virtuais e painel de veículos ativos, parados e
 * sem sinal. Os rastreadores de terceiros enviam posições com um token próprio;
 * o banco valida o token, grava a posição e gera os alertas (função tracking_ingest).
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type TrackingDevice = Tables["tracking_devices"]["Row"];
export type TrackingPosition = Tables["tracking_positions"]["Row"];
export type TrackingAlert = Tables["tracking_alerts"]["Row"];
export type TrackingGeofence = Tables["tracking_geofences"]["Row"];
export type TrackingSettings = Tables["tracking_settings"]["Row"];

export const ALERT_KINDS: Record<string, string> = {
  excesso_velocidade: "Excesso de velocidade",
  bateria_baixa: "Bateria baixa",
  saida_geocerca: "Saiu da área permitida",
  entrada_geocerca: "Entrou em área monitorada",
};

export const GEOFENCE_ALERT_ON: Record<string, string> = {
  saida: "Ao sair da área",
  entrada: "Ao entrar na área",
  ambos: "Ao entrar e ao sair",
};

export const DEFAULT_SETTINGS = { max_speed_kmh: 110, low_battery_v: 11.5, offline_minutes: 30 };

export type FleetState = "em_movimento" | "parado" | "sem_sinal" | "sem_rastreador";

export const FLEET_STATE_LABEL: Record<FleetState, string> = {
  em_movimento: "Em movimento",
  parado: "Parado",
  sem_sinal: "Sem sinal",
  sem_rastreador: "Sem rastreador",
};

/** Situação do veículo a partir da última posição recebida. */
export function fleetState(
  last: Pick<TrackingPosition, "recorded_at" | "speed_kmh" | "ignition"> | null,
  offlineMinutes: number,
  now = Date.now(),
): FleetState {
  if (!last) return "sem_rastreador";
  const ageMin = (now - new Date(last.recorded_at).getTime()) / 60000;
  if (ageMin > offlineMinutes) return "sem_sinal";
  if ((last.speed_kmh ?? 0) >= 3) return "em_movimento";
  return "parado";
}

/** Gera um token aleatório (só é mostrado uma vez) e o hash SHA-256 guardado no banco. */
export async function newDeviceToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token =
    "fg_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return { token, hash: await sha256Hex(token) };
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Distância em metros entre dois pontos (Haversine). */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/* ---------------------------------- hooks ---------------------------------- */

export function useTrackingDevices() {
  return useQuery({
    queryKey: ["tracking-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_devices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useTrackingGeofences() {
  return useQuery({
    queryKey: ["tracking-geofences"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tracking_geofences").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useTrackingSettings() {
  return useQuery({
    queryKey: ["tracking-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tracking_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Última posição de cada veículo (consulta às posições recentes, uma por veículo). */
export function useLastPositions() {
  return useQuery({
    queryKey: ["tracking-last-positions"],
    refetchInterval: 30000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("tracking_positions")
        .select("*")
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const byVehicle = new Map<string, TrackingPosition>();
      for (const p of data) if (!byVehicle.has(p.vehicle_id)) byVehicle.set(p.vehicle_id, p);
      return byVehicle;
    },
  });
}

export function useTrackingAlerts(onlyOpen: boolean) {
  return useQuery({
    queryKey: ["tracking-alerts", onlyOpen],
    refetchInterval: 30000,
    queryFn: async () => {
      let q = supabase
        .from("tracking_alerts")
        .select("*, vehicle:vehicles(id, plate, asset_code)")
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (onlyOpen) q = q.is("acknowledged_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useVehicleTrack(vehicleId: string | null, fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ["tracking-track", vehicleId, fromIso, toIso],
    enabled: Boolean(vehicleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_positions")
        .select("*")
        .eq("vehicle_id", vehicleId as string)
        .gte("recorded_at", fromIso)
        .lte("recorded_at", toIso)
        .order("recorded_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data;
    },
  });
}
