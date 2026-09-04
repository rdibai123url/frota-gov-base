/**
 * Fase 10 — Bloco 6 / Rodada 1 Etapa 2: geolocalização da rede credenciada.
 *
 * Mapa interativo real (OpenStreetMap + Leaflet, sem API paga) com pins por
 * tipo de estabelecimento, popup com dados do cadastro, ponto de referência,
 * raio em km, filtros, lista e exportação CSV.
 *
 * As coordenadas são obtidas automaticamente pela geocodificação do endereço;
 * é possível corrigir o ponto manualmente e reprocessar os pendentes.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ExternalLink, Download, Crosshair, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { supabase, useOrganization, usePerms, useUnits, useInvalidate } from "@/lib/frotagov";
import { formatNumberBR, parseBRNumber } from "@/lib/format";
import { exportReportCsv } from "@/lib/reports";
import { haversineKm } from "@/lib/integracoes";
import {
  GEOCODE_STATUS_LABEL,
  geocodeRecord,
  saveManualCoordinates,
  type GeoTable,
} from "@/lib/geocode";

const RedeMap = lazy(() => import("@/components/rede-map"));

export const Route = createFileRoute("/_authenticated/mapa-rede")({
  head: () => ({
    meta: [
      { title: "Mapa da rede credenciada — FrotaGov" },
      {
        name: "description",
        content:
          "Mapa interativo com postos, oficinas e credenciados do órgão, busca por proximidade, filtros por tipo de atendimento e situação.",
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
  table: GeoTable;
  recordId: string;
  nome: string;
  tipo: string;
  especialidades: string;
  endereco: string;
  telefone: string | null;
  cidade: string;
  situacao: string;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

function enderecoDe(p: {
  address?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  return [p.address, p.district, [p.city, p.state].filter(Boolean).join(" / ")].filter(Boolean).join(" — ");
}

function useNetworkPoints() {
  return useQuery({
    queryKey: ["rede-geolocalizada"],
    queryFn: async () => {
      const [partners, suppliers, workshops] = await Promise.all([
        supabase
          .from("accredited_partners")
          .select(
            "id, legal_name, trade_name, address, district, city, state, phone, status, kinds, latitude, longitude, geocode_status",
          ),
        supabase
          .from("suppliers")
          .select(
            "id, legal_name, trade_name, address, city, state, zip_code, phone, active, latitude, longitude, geocode_status",
          ),
        supabase
          .from("workshops")
          .select(
            "id, legal_name, trade_name, address, district, city, state, zip_code, phone, status, specialties, latitude, longitude, geocode_status",
          ),
      ]);
      const points: Point[] = [];
      for (const p of partners.data ?? []) {
        points.push({
          id: `credenciado-${p.id}`,
          table: "accredited_partners",
          recordId: p.id,
          nome: p.trade_name || p.legal_name,
          tipo: "Credenciado",
          especialidades: (p.kinds ?? []).join(", "),
          endereco: enderecoDe(p),
          telefone: p.phone ?? null,
          cidade: [p.city, p.state].filter(Boolean).join(" / "),
          situacao: p.status,
          latitude: p.latitude,
          longitude: p.longitude,
          geocode_status: p.geocode_status ?? "pendente",
          address: p.address,
          district: p.district,
          city: p.city,
          state: p.state,
          zip_code: null,
        });
      }
      for (const s of suppliers.data ?? []) {
        points.push({
          id: `posto-${s.id}`,
          table: "suppliers",
          recordId: s.id,
          nome: s.trade_name || s.legal_name,
          tipo: "Posto / fornecedor",
          especialidades: "abastecimento",
          endereco: enderecoDe(s),
          telefone: s.phone ?? null,
          cidade: [s.city, s.state].filter(Boolean).join(" / "),
          situacao: s.active ? "ativo" : "inativo",
          latitude: s.latitude,
          longitude: s.longitude,
          geocode_status: s.geocode_status ?? "pendente",
          address: s.address,
          district: null,
          city: s.city,
          state: s.state,
          zip_code: s.zip_code,
        });
      }
      for (const w of workshops.data ?? []) {
        points.push({
          id: `oficina-${w.id}`,
          table: "workshops",
          recordId: w.id,
          nome: w.trade_name || w.legal_name,
          tipo: "Oficina",
          especialidades: (w.specialties ?? []).join(", "),
          endereco: enderecoDe(w),
          telefone: w.phone ?? null,
          cidade: [w.city, w.state].filter(Boolean).join(" / "),
          situacao: w.status,
          latitude: w.latitude,
          longitude: w.longitude,
          geocode_status: w.geocode_status ?? "pendente",
          address: w.address,
          district: w.district,
          city: w.city,
          state: w.state,
          zip_code: w.zip_code,
        });
      }
      return points;
    },
  });
}

const ALL = "__all__";

const LEGEND = [
  { tipo: "Posto / fornecedor", cor: "#1d4ed8" },
  { tipo: "Oficina", cor: "#b45309" },
  { tipo: "Credenciado", cor: "#047857" },
];

function MapaRede() {
  const { data: points = [], isLoading } = useNetworkPoints();
  const { data: units = [] } = useUnits();
  const { data: org } = useOrganization();
  const { userName, canManageFleet } = usePerms();
  const invalidate = useInvalidate();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [tipo, setTipo] = useState(ALL);
  const [situacao, setSituacao] = useState(ALL);
  const [busca, setBusca] = useState("");
  const [unitId, setUnitId] = useState(ALL);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [raio, setRaio] = useState("");
  const [fixing, setFixing] = useState<Point | null>(null);
  const [running, setRunning] = useState(false);

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

  const raioKm = raio ? parseBRNumber(raio) : null;

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
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
          (!q || `${p.nome} ${p.cidade} ${p.endereco} ${p.especialidades}`.toLowerCase().includes(q)) &&
          (!raioKm || !Number.isFinite(raioKm) || (p.distancia !== null && p.distancia <= raioKm)),
      )
      .sort((a, b) => {
        if (a.distancia === null && b.distancia === null) return a.nome.localeCompare(b.nome);
        if (a.distancia === null) return 1;
        if (b.distancia === null) return -1;
        return a.distancia - b.distancia;
      });
  }, [points, tipo, situacao, busca, origin, raioKm]);

  const mapPoints = rows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      nome: r.nome,
      tipo: r.tipo,
      situacao: r.situacao,
      endereco: r.endereco,
      telefone: r.telefone,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      distancia: r.distancia,
    }));

  const pendentes = points.filter((p) => (p.latitude == null || p.longitude == null) && p.address && p.city);
  const semEndereco = points.filter((p) => p.latitude == null || p.longitude == null).length - pendentes.length;

  async function geocodificarPendentes() {
    if (pendentes.length === 0) return;
    setRunning(true);
    let ok = 0;
    let falhou = 0;
    // Uma consulta por vez, com pausa: política de uso do OpenStreetMap.
    for (const p of pendentes.slice(0, 25)) {
      const r = await geocodeRecord(p.table, p.recordId, {
        address: p.address,
        district: p.district,
        city: p.city,
        state: p.state,
        zip_code: p.zip_code,
      });
      if (r.status === "geocodificado") ok += 1;
      else falhou += 1;
      await new Promise((res) => setTimeout(res, 1100));
    }
    setRunning(false);
    invalidate(["rede-geolocalizada"]);
    toast.success(`Geocodificação concluída: ${ok} localizado(s), ${falhou} sem coordenadas.`);
  }

  const columns = [
    { key: "nome", label: "Estabelecimento" },
    { key: "tipo", label: "Tipo" },
    { key: "especialidades", label: "Especialidades / produtos" },
    { key: "endereco", label: "Endereço" },
    { key: "situacao", label: "Situação" },
    { key: "distancia", label: "Distância aproximada (km)" },
  ];

  return (
    <>
      <PageHeader
        title="Mapa da rede credenciada"
        description="Postos, oficinas e credenciados no mapa. A distância é uma estimativa em linha reta entre as coordenadas — não considera o trajeto pelas ruas."
        action={
          <Button
            variant="outline"
            onClick={() =>
              exportReportCsv(
                "rede-credenciada-localizacao",
                columns,
                rows.map((r) => ({
                  ...r,
                  distancia: r.distancia === null ? "—" : formatNumberBR(r.distancia, 2),
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
            <Input id="busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, município, endereço ou especialidade" />
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

      <div className="mb-4 overflow-hidden rounded-lg border bg-card p-2 shadow-card">
        {mounted ? (
          <Suspense
            fallback={
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" /> Carregando mapa…
              </div>
            }
          >
            <RedeMap points={mapPoints} origin={origin} radiusKm={raioKm} />
          </Suspense>
        ) : (
          <div className="h-[420px] animate-pulse rounded-lg bg-muted" />
        )}
        <div className="flex flex-wrap items-center gap-4 px-2 py-2 text-xs text-muted-foreground">
          {LEGEND.map((l) => (
            <span key={l.tipo} className="inline-flex items-center gap-1">
              <span className="inline-block size-3 rounded-full" style={{ backgroundColor: l.cor }} aria-hidden />
              {l.tipo}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-3 rounded-full bg-destructive" aria-hidden /> Ponto de referência
          </span>
          <span>{mapPoints.length} ponto(s) no mapa</span>
        </div>
      </div>

      {(pendentes.length > 0 || semEndereco > 0) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            {pendentes.length} estabelecimento(s) com endereço aguardando geocodificação
            {semEndereco > 0 ? ` e ${semEndereco} sem endereço suficiente` : ""}.
          </span>
          {canManageFleet && pendentes.length > 0 && (
            <Button size="sm" variant="outline" onClick={geocodificarPendentes} disabled={running}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
              {running ? "Localizando…" : "Tentar geocodificar pendentes"}
            </Button>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              <TableHead className="w-40">Coordenadas</TableHead>
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
                <TableCell className="max-w-52 truncate">{r.especialidades || "—"}</TableCell>
                <TableCell className="max-w-64 truncate">{r.endereco || "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.situacao === "ativo" ? "default" : "secondary"}>{r.situacao}</Badge>
                </TableCell>
                <TableCell>{r.distancia === null ? "—" : `${formatNumberBR(r.distancia, 2)} km`}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
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
                      <span className="text-xs text-muted-foreground">
                        {GEOCODE_STATUS_LABEL[r.geocode_status] ?? "Sem coordenadas"}
                      </span>
                    )}
                    {canManageFleet && (
                      <Button variant="ghost" size="sm" onClick={() => setFixing(r)}>
                        Corrigir
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {fixing && (
        <ManualCoordinatesDialog
          point={fixing}
          onClose={() => setFixing(null)}
          onSaved={() => invalidate(["rede-geolocalizada"])}
        />
      )}
    </>
  );
}

function ManualCoordinatesDialog({
  point,
  onClose,
  onSaved,
}: {
  point: Point;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lat, setLat] = useState(point.latitude != null ? String(point.latitude) : "");
  const [lon, setLon] = useState(point.longitude != null ? String(point.longitude) : "");
  const [saving, setSaving] = useState(false);

  async function tentarNovamente() {
    setSaving(true);
    const r = await geocodeRecord(
      point.table,
      point.recordId,
      {
        address: point.address,
        district: point.district,
        city: point.city,
        state: point.state,
        zip_code: point.zip_code,
      },
      { force: true },
    );
    setSaving(false);
    if (r.status === "geocodificado") {
      setLat(String(r.latitude));
      setLon(String(r.longitude));
      toast.success("Endereço localizado.");
      onSaved();
    } else {
      toast.warning(r.message);
    }
  }

  async function salvar() {
    const la = Number(lat.replace(",", "."));
    const lo = Number(lon.replace(",", "."));
    if (!Number.isFinite(la) || !Number.isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
      toast.error("Informe latitude entre -90 e 90 e longitude entre -180 e 180.");
      return;
    }
    setSaving(true);
    const { error } = await saveManualCoordinates(point.table, point.recordId, la, lo);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível gravar as coordenadas.");
      return;
    }
    toast.success("Coordenadas atualizadas.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corrigir localização — {point.nome}</DialogTitle>
          <DialogDescription>
            {point.endereco || "Sem endereço cadastrado."} · situação:{" "}
            {GEOCODE_STATUS_LABEL[point.geocode_status] ?? point.geocode_status}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="mlat">Latitude</Label>
            <Input id="mlat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.5505" />
          </div>
          <div>
            <Label htmlFor="mlon">Longitude</Label>
            <Input id="mlon" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-46.6333" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={tentarNovamente} disabled={saving || !point.address}>
            Tentar geocodificar novamente
          </Button>
          <Button onClick={salvar} disabled={saving}>
            Salvar coordenadas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
