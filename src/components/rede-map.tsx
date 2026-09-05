/**
 * Mapa interativo dos prestadores cadastrados pelo órgão — OpenStreetMap + Leaflet.
 *
 * Sem API paga e sem chave: os ladrilhos vêm do OpenStreetMap, com a
 * atribuição exigida pela licença. Carregado apenas no navegador.
 */
import { useEffect, useMemo } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { formatNumberBR } from "@/lib/format";

export type MapPoint = {
  id: string;
  nome: string;
  tipo: string;
  situacao: string;
  endereco: string;
  telefone: string | null;
  latitude: number;
  longitude: number;
  distancia: number | null;
};

/** Cores discretas e distinguíveis também por formato do rótulo. */
const TYPE_STYLE: Record<string, { color: string; sigla: string }> = {
  "Posto / fornecedor": { color: "#1d4ed8", sigla: "P" },
  Oficina: { color: "#b45309", sigla: "O" },
  Credenciado: { color: "#047857", sigla: "C" },
};

function styleOf(tipo: string) {
  return TYPE_STYLE[tipo] ?? { color: "#475569", sigla: "•" };
}

const referenceIcon = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#dc2626;border:3px solid white;box-shadow:0 0 0 2px #dc2626"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function FitBounds({ points, origin }: { points: MapPoint[]; origin: { lat: number; lon: number } | null }) {
  const map = useMap();
  useEffect(() => {
    const coords: [number, number][] = points.map((p) => [p.latitude, p.longitude]);
    if (origin) coords.push([origin.lat, origin.lon]);
    if (coords.length === 0) return;
    if (origin) {
      map.setView([origin.lat, origin.lon], coords.length > 1 ? map.getZoom() : 13);
    }
    if (coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 15 });
    } else {
      map.setView(coords[0]!, 14);
    }
  }, [map, points, origin]);
  return null;
}

export default function RedeMap({
  points,
  origin,
  radiusKm,
}: {
  points: MapPoint[];
  origin: { lat: number; lon: number } | null;
  radiusKm: number | null;
}) {
  const center = useMemo<[number, number]>(() => {
    if (origin) return [origin.lat, origin.lon];
    if (points[0]) return [points[0].latitude, points[0].longitude];
    return [-15.78, -47.93];
  }, [origin, points]);

  return (
    <MapContainer
      center={center}
      zoom={points.length || origin ? 12 : 4}
      scrollWheelZoom
      className="h-[420px] w-full rounded-lg md:h-[520px]"
      style={{ zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitBounds points={points} origin={origin} />

      {origin && (
        <>
          <Marker position={[origin.lat, origin.lon]} icon={referenceIcon}>
            <Popup>Ponto de referência da busca</Popup>
          </Marker>
          {radiusKm && radiusKm > 0 && (
            <Circle
              center={[origin.lat, origin.lon]}
              radius={radiusKm * 1000}
              pathOptions={{ color: "#dc2626", fillOpacity: 0.05, weight: 1 }}
            />
          )}
        </>
      )}

      {points.map((p) => {
        const st = styleOf(p.tipo);
        return (
          <CircleMarker
            key={p.id}
            center={[p.latitude, p.longitude]}
            radius={8}
            pathOptions={{ color: st.color, fillColor: st.color, fillOpacity: 0.75, weight: 2 }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{p.nome}</p>
                <p className="text-xs uppercase tracking-wide" style={{ color: st.color }}>
                  {p.tipo} · {p.situacao}
                </p>
                {p.endereco && <p className="text-xs">{p.endereco}</p>}
                {p.telefone && <p className="text-xs">Telefone: {p.telefone}</p>}
                {p.distancia !== null && (
                  <p className="text-xs">
                    Distância aproximada em linha reta: {formatNumberBR(p.distancia, 2)} km
                  </p>
                )}
                <a
                  className="text-xs underline"
                  href={`https://www.openstreetmap.org/directions?to=${p.latitude}%2C${p.longitude}${
                    origin ? `&from=${origin.lat}%2C${origin.lon}` : ""
                  }`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir rota no mapa externo
                </a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
