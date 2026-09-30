/**
 * Mapa da frota rastreada — OpenStreetMap + Leaflet (sem chave e sem custo).
 * Mostra a última posição dos veículos, as áreas (cercas virtuais) e, se houver,
 * o trajeto de um veículo. Carregado apenas no navegador.
 */
import { useEffect } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type FleetPoint = {
  id: string;
  label: string;
  state: string;
  color: string;
  latitude: number;
  longitude: number;
  detail: string;
};

export type FleetZone = { id: string; name: string; lat: number; lng: number; radius: number };

function FitAll({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length === 0) return;
    if (coords.length === 1) map.setView(coords[0]!, 14);
    else map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 16 });
  }, [map, coords]);
  return null;
}

export default function FrotaMap({
  points,
  zones,
  track,
}: {
  points: FleetPoint[];
  zones: FleetZone[];
  track: [number, number][];
}) {
  const coords: [number, number][] =
    track.length > 0 ? track : points.map((p) => [p.latitude, p.longitude]);

  return (
    <MapContainer
      center={[-15.78, -47.93]}
      zoom={4}
      scrollWheelZoom
      className="h-[420px] w-full rounded-lg md:h-[520px]"
      style={{ zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitAll coords={coords} />
      {zones.map((z) => (
        <Circle
          key={z.id}
          center={[z.lat, z.lng]}
          radius={z.radius}
          pathOptions={{ color: "#0b2545", fillOpacity: 0.06, weight: 1, dashArray: "6 4" }}
        >
          <Popup>{z.name}</Popup>
        </Circle>
      ))}
      {track.length > 1 && (
        <Polyline positions={track} pathOptions={{ color: "#1d4ed8", weight: 3 }} />
      )}
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.latitude, p.longitude]}
          radius={9}
          pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.8, weight: 2 }}
        >
          <Popup>
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{p.label}</p>
              <p className="text-xs">{p.state}</p>
              <p className="text-xs">{p.detail}</p>
              <a
                className="text-xs underline"
                href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=17/${p.latitude}/${p.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no mapa externo
              </a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
