/**
 * Fase 10 — Bloco 6: geolocalização da rede credenciada.
 *
 * Reúne postos/fornecedores, oficinas e credenciados com coordenadas,
 * permite busca por proximidade a partir de uma unidade ou de um ponto
 * informado e exibe cada ponto no mapa aberto (OpenStreetMap) — sem
 * depender de API paga de mapas.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ExternalLink, Download } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { supabase, useOrganization, usePerms, useUnits } from "@/lib/frotagov";
import { formatNumberBR } from "@/lib/format";
import { exportReportCsv } from "@/lib/reports";
import { haversineKm } from "@/lib/integracoes";

export const Route = createFileRoute("/_authenticated/mapa-rede")({
  head: () => ({
    meta: [
      { title: "Mapa da rede credenciada — FrotaGov" },
      {
        name: "description",
        content:
          "Postos, oficinas e credenciados do órgão com localização, busca por proximidade, filtros por tipo de atendimento e situação.",
      },
      { property: "og:title", content: "Mapa da rede credenciada — FrotaGov" },
      {
        property: "og:description",
        content: "Localização da rede credenciada da frota pública com distância aproximada por unidade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapaRede,
});

type Point = {
  id: string;
  nome: string;
  tipo: string;
  especialidades: string;
  cidade: string;
  situacao: string;
  latitude: number | null;
  longitude: number | null;
};

function useNetworkPoints() {
  return useQuery({
    queryKey: ["rede-geolocalizada"],
    queryFn: async () => {
      const [partners, suppliers, workshops] = await Promise.all([
        supabase
          .from("accredited_partners")
          .select("id, legal_name, trade_name, city, state, status, kinds, latitude, longitude"),
        supabase.from("suppliers").select("id, legal_name, trade_name, city, state, active, latitude, longitude"),
        supabase
          .from("workshops")
          .select("id, legal_name, trade_name, city, state, status, specialties, latitude, longitude"),
      ]);
      const points: Point[] = [];
      for (const p of partners.data ?? []) {
        points.push({
          id: `credenciado-${p.id}`,
          nome: p.trade_name || p.legal_name,
          tipo: "Credenciado",
          especialidades: (p.kinds ?? []).join(", "),
          cidade: [p.city, p.state].filter(Boolean).join(" / "),
          situacao: p.status,
          latitude: p.latitude,
          longitude: p.longitude,
        });
      }
      for (const s of suppliers.data ?? []) {
        points.push({
          id: `posto-${s.id}`,
          nome: s.trade_name || s.legal_name,
          tipo: "Posto / fornecedor",
          especialidades: "abastecimento",
          cidade: [s.city, s.state].filter(Boolean).join(" / "),
          situacao: s.active ? "ativo" : "inativo",
          latitude: s.latitude,
          longitude: s.longitude,
        });
      }
      for (const w of workshops.data ?? []) {
        points.push({
          id: `oficina-${w.id}`,
          nome: w.trade_name || w.legal_name,
          tipo: "Oficina",
          especialidades: (w.specialties ?? []).join(", "),
          cidade: [w.city, w.state].filter(Boolean).join(" / "),
          situacao: w.status,
          latitude: w.latitude,
          longitude: w.longitude,
        });
      }
      return points;
    },
  });
}

const ALL = "__all__";

function MapaRede() {
  const { data: points = [], isLoading } = useNetworkPoints();
  const { data: units = [] } = useUnits();
  const { data: org } = useOrganization();
  const { userName } = usePerms();

  const [tipo, setTipo] = useState(ALL);
  const [situacao, setSituacao] = useState(ALL);
  const [busca, setBusca] = useState("");
  const [unitId, setUnitId] = useState(ALL);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [raio, setRaio] = useState("");

  const unitsWithCoords = units.filter(
    (u) => (u as { latitude?: number | null }).latitude != null && (u as { longitude?: number | null }).longitude != null,
  );

  const origin = useMemo(() => {
    if (unitId !== ALL) {
      const u = units.find((x) => x.id === unitId) as { latitude?: number | null; longitude?: number | null } | undefined;
      if (u?.latitude != null && u.longitude != null) return { lat: Number(u.latitude), lon: Number(u.longitude) };
    }
    const la = Number(lat.replace(",", "."));
    const lo = Number(lon.replace(",", "."));
    if (Number.isFinite(la) && Number.isFinite(lo) && lat && lon) return { lat: la, lon: lo };
    return null;
  }, [unitId, units, lat, lon]);

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const limit = Number(raio.replace(",", "."));
    return points
      .map((p) => ({
        ...p,
        distancia:
          origin && p.latitude != null && p.longitude != null
            ? haversineKm(origin, { lat: Number(p.latitude), lon: Number(p.longitude) })
            : null,
      }))
      .filter(
        (p) =>
          (tipo === ALL || p.tipo === tipo) &&
          (situacao === ALL || p.situacao === situacao) &&
          (!q || `${p.nome} ${p.cidade} ${p.especialidades}`.toLowerCase().includes(q)) &&
          (!raio || !Number.isFinite(limit) || (p.distancia !== null && p.distancia <= limit)),
      )
      .sort((a, b) => {
        if (a.distancia === null && b.distancia === null) return a.nome.localeCompare(b.nome);
        if (a.distancia === null) return 1;
        if (b.distancia === null) return -1;
        return a.distancia - b.distancia;
      });
  }, [points, tipo, situacao, busca, origin, raio]);

  const semCoordenadas = points.filter((p) => p.latitude == null || p.longitude == null).length;

  const columns = [
    { key: "nome", label: "Estabelecimento" },
    { key: "tipo", label: "Tipo" },
    { key: "especialidades", label: "Especialidades / produtos" },
    { key: "cidade", label: "Município" },
    { key: "situacao", label: "Situação" },
    { key: "distancia", label: "Distância aproximada (km)" },
  ];

  return (
    <>
      <PageHeader
        title="Mapa da rede credenciada"
        description="Postos, oficinas e credenciados com localização. A distância é aproximada, calculada em linha reta entre as coordenadas informadas — não considera rotas."
        action={
          <Button
            variant="outline"
            onClick={() =>
              exportReportCsv(
                "rede-credenciada-localizacao",
                columns,
                rows.map((r) => ({
                  ...r,
                  distancia: r.distancia === null ? "—" : formatNumberBR(r.distancia, 1),
                })),
                {
                  title: "Rede credenciada por localização",
                  organization: org?.legal_name ?? null,
                  issuedBy: userName,
                },
              )
            }
          >
            <Download className="size-4" /> Exportar CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4" /> Filtros e ponto de referência
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="busca">Busca</Label>
            <Input id="busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, município ou especialidade" />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="Credenciado">Credenciados</SelectItem>
                <SelectItem value="Posto / fornecedor">Postos / fornecedores</SelectItem>
                <SelectItem value="Oficina">Oficinas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Situação</Label>
            <Select value={situacao} onValueChange={setSituacao}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="suspenso">Suspenso</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
                <SelectItem value="em_analise">Em análise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Unidade de referência</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Não usar unidade</SelectItem>
                {unitsWithCoords.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="lat">Latitude de referência</Label>
            <Input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23,5505" />
          </div>
          <div>
            <Label htmlFor="lon">Longitude de referência</Label>
            <Input id="lon" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-46,6333" />
          </div>
          <div>
            <Label htmlFor="raio">Raio máximo (km)</Label>
            <Input id="raio" value={raio} onChange={(e) => setRaio(e.target.value)} placeholder="50" />
          </div>
        </CardContent>
      </Card>

      {semCoordenadas > 0 && (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {semCoordenadas} estabelecimento(s) ainda sem latitude/longitude. Informe as coordenadas no cadastro
          para que apareçam na busca por proximidade.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              <TableHead className="w-24">Mapa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhum estabelecimento encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell>{r.tipo}</TableCell>
                <TableCell className="max-w-64 truncate">{r.especialidades || "—"}</TableCell>
                <TableCell>{r.cidade || "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.situacao === "ativo" ? "default" : "secondary"}>{r.situacao}</Badge>
                </TableCell>
                <TableCell>{r.distancia === null ? "—" : `${formatNumberBR(r.distancia, 1)} km`}</TableCell>
                <TableCell>
                  {r.latitude != null && r.longitude != null ? (
                    <a
                      className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
                      href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=15/${r.latitude}/${r.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
