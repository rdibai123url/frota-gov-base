import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, MapPinned, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseBRNumber } from "@/lib/format";
import { exportReportCsv } from "@/lib/reports";
import {
  dateTimeBR,
  dbMessage,
  supabase,
  useInvalidate,
  usePerms,
  useVehicles,
} from "@/lib/frotagov";
import {
  ALERT_KINDS,
  DEFAULT_SETTINGS,
  FLEET_STATE_LABEL,
  GEOFENCE_ALERT_ON,
  fleetState,
  newDeviceToken,
  useLastPositions,
  useTrackingAlerts,
  useTrackingDevices,
  useTrackingGeofences,
  useTrackingSettings,
  useVehicleTrack,
  type FleetState,
} from "@/lib/rastreamento";

const FrotaMap = lazy(() => import("@/components/frota-map"));

export const Route = createFileRoute("/_authenticated/rastreamento")({
  head: () => ({
    meta: [
      { title: "Rastreamento — Dibai Fleet" },
      {
        name: "description",
        content:
          "Localização dos veículos, alertas de velocidade e bateria, áreas permitidas e trajetos, com dados dos rastreadores instalados na frota.",
      },
    ],
  }),
  component: Rastreamento,
});

const STATE_COLOR: Record<FleetState, string> = {
  em_movimento: "#047857",
  parado: "#b45309",
  sem_sinal: "#b91c1c",
  sem_rastreador: "#64748b",
};

function Rastreamento() {
  return (
    <div>
      <PageHeader
        title="Rastreamento"
        description="Veículos ativos, parados e sem sinal, alertas, áreas permitidas e trajetos — com os dados enviados pelos rastreadores da frota."
      />
      <Tabs defaultValue="painel" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="painel">Painel e mapa</TabsTrigger>
          <TabsTrigger value="alertas">Alertas</TabsTrigger>
          <TabsTrigger value="trajeto">Trajeto</TabsTrigger>
          <TabsTrigger value="rastreadores">Rastreadores</TabsTrigger>
          <TabsTrigger value="regras">Áreas e limites</TabsTrigger>
        </TabsList>
        <TabsContent value="painel">
          <Painel />
        </TabsContent>
        <TabsContent value="alertas">
          <Alertas />
        </TabsContent>
        <TabsContent value="trajeto">
          <Trajeto />
        </TabsContent>
        <TabsContent value="rastreadores">
          <Rastreadores />
        </TabsContent>
        <TabsContent value="regras">
          <Regras />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function MapBox({
  points,
  zones,
  track,
}: {
  points: React.ComponentProps<typeof FrotaMap>["points"];
  zones: React.ComponentProps<typeof FrotaMap>["zones"];
  track: [number, number][];
}) {
  const mounted = useMounted();
  return (
    <div className="mb-4 overflow-hidden rounded-lg border bg-card p-2 shadow-card">
      {mounted ? (
        <Suspense
          fallback={
            <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Carregando mapa…
            </div>
          }
        >
          <FrotaMap points={points} zones={zones} track={track} />
        </Suspense>
      ) : (
        <div className="h-[420px] animate-pulse rounded-lg bg-muted" />
      )}
    </div>
  );
}

/* ---------------------------------- painel --------------------------------- */

function Painel() {
  const { data: vehicles = [] } = useVehicles();
  const { data: last } = useLastPositions();
  const { data: settings } = useTrackingSettings();
  const { data: geofences = [] } = useTrackingGeofences();
  const { data: devices = [] } = useTrackingDevices();
  const offline = settings?.offline_minutes ?? DEFAULT_SETTINGS.offline_minutes;
  const withDevice = new Set(devices.filter((d) => d.active).map((d) => d.vehicle_id));

  const rows = useMemo(
    () =>
      vehicles
        .filter((v) => withDevice.has(v.id) || last?.has(v.id))
        .map((v) => {
          const pos = last?.get(v.id) ?? null;
          const state = fleetState(pos, offline);
          return { v, pos, state };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, last, offline, devices],
  );

  const count = (s: FleetState) => rows.filter((r) => r.state === s).length;
  const points = rows
    .filter((r) => r.pos)
    .map((r) => ({
      id: r.v.id,
      label: r.v.plate ?? r.v.asset_code ?? "Veículo",
      state: FLEET_STATE_LABEL[r.state],
      color: STATE_COLOR[r.state],
      latitude: Number(r.pos!.latitude),
      longitude: Number(r.pos!.longitude),
      detail: `Última posição: ${dateTimeBR(r.pos!.recorded_at)} · ${Number(r.pos!.speed_kmh ?? 0)} km/h`,
    }));
  const zones = geofences
    .filter((g) => g.active)
    .map((g) => ({
      id: g.id,
      name: g.name,
      lat: Number(g.center_lat),
      lng: Number(g.center_lng),
      radius: g.radius_m,
    }));

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {(["em_movimento", "parado", "sem_sinal"] as FleetState[]).map((s) => (
          <div key={s} className="rounded-lg border bg-card p-4 shadow-card">
            <div className="text-xs text-muted-foreground">{FLEET_STATE_LABEL[s]}</div>
            <div className="mt-1 text-2xl font-semibold" style={{ color: STATE_COLOR[s] }}>
              {count(s)}
            </div>
          </div>
        ))}
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="text-xs text-muted-foreground">Veículos com rastreador</div>
          <div className="mt-1 text-2xl font-semibold">{rows.length}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground shadow-card">
          <MapPinned className="mx-auto mb-2 size-6" />
          Nenhum rastreador cadastrado ainda. Vá em “Rastreadores” para vincular um rastreador a um
          veículo e receber as posições.
        </div>
      ) : (
        <>
          <MapBox points={points} zones={zones} track={[]} />
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Última posição</TableHead>
                  <TableHead className="text-right">Velocidade</TableHead>
                  <TableHead>Ignição</TableHead>
                  <TableHead className="text-right">Bateria</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ v, pos, state }) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.plate ?? v.asset_code}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        style={{ borderColor: STATE_COLOR[state], color: STATE_COLOR[state] }}
                      >
                        {FLEET_STATE_LABEL[state]}
                      </Badge>
                    </TableCell>
                    <TableCell>{pos ? dateTimeBR(pos.recorded_at) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {pos?.speed_kmh != null ? `${Number(pos.speed_kmh)} km/h` : "—"}
                    </TableCell>
                    <TableCell>
                      {pos?.ignition == null ? "—" : pos.ignition ? "Ligada" : "Desligada"}
                    </TableCell>
                    <TableCell className="text-right">
                      {pos?.battery_v != null ? `${Number(pos.battery_v)} V` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------- alertas --------------------------------- */

function Alertas() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const { data: alerts = [] } = useTrackingAlerts(onlyOpen);
  const { canWrite, userId } = usePerms();
  const invalidate = useInvalidate();

  async function ack(id: string) {
    const { error } = await supabase
      .from("tracking_alerts")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
      .eq("id", id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    invalidate(["tracking-alerts"]);
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Alertas dos rastreadores</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />{" "}
          Só os não vistos
        </label>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Veículo</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Detalhe</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                Nenhum alerta.
              </TableCell>
            </TableRow>
          )}
          {alerts.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{dateTimeBR(a.occurred_at)}</TableCell>
              <TableCell className="font-medium">
                {a.vehicle?.plate ?? a.vehicle?.asset_code ?? "—"}
              </TableCell>
              <TableCell>{ALERT_KINDS[a.kind] ?? a.kind}</TableCell>
              <TableCell>{a.message}</TableCell>
              <TableCell>
                {canWrite && !a.acknowledged_at && (
                  <Button size="sm" variant="outline" onClick={() => ack(a.id)}>
                    Marcar como visto
                  </Button>
                )}
                {a.acknowledged_at && <Badge variant="secondary">Visto</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* --------------------------------- trajeto --------------------------------- */

function Trajeto() {
  const { data: vehicles = [] } = useVehicles();
  const today = new Date().toISOString().slice(0, 10);
  const [vehicleId, setVehicleId] = useState<string>("");
  const [day, setDay] = useState(today);
  const { data: track = [], isLoading } = useVehicleTrack(
    vehicleId || null,
    `${day}T00:00:00`,
    `${day}T23:59:59`,
  );
  const coords = track.map((p) => [Number(p.latitude), Number(p.longitude)] as [number, number]);
  const last = track[track.length - 1];
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const maxSpeed = track.reduce((m, p) => Math.max(m, Number(p.speed_kmh ?? 0)), 0);

  function exportTrack() {
    exportReportCsv(
      `trajeto-${vehicle?.plate ?? "veiculo"}-${day}`,
      [
        { key: "hora", label: "Data/hora" },
        { key: "lat", label: "Latitude" },
        { key: "lng", label: "Longitude" },
        { key: "vel", label: "Velocidade (km/h)" },
        { key: "ign", label: "Ignição" },
      ],
      track.map((p) => ({
        hora: dateTimeBR(p.recorded_at),
        lat: p.latitude,
        lng: p.longitude,
        vel: p.speed_kmh ?? "",
        ign: p.ignition == null ? "" : p.ignition ? "Ligada" : "Desligada",
      })),
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-64 space-y-1.5">
          <Label>Veículo</Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.plate ?? v.asset_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dia">Dia</Label>
          <Input
            id="dia"
            type="date"
            value={day}
            max={today}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        {track.length > 0 && (
          <Button variant="outline" onClick={exportTrack}>
            Exportar CSV
          </Button>
        )}
      </div>
      {!vehicleId ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground shadow-card">
          Escolha um veículo e um dia para ver o trajeto percorrido.
        </div>
      ) : isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : track.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground shadow-card">
          Sem posições recebidas deste veículo neste dia.
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {track.length} posições · velocidade máxima {maxSpeed} km/h · última em{" "}
            {last ? dateTimeBR(last.recorded_at) : "—"}
          </p>
          <MapBox points={[]} zones={[]} track={coords} />
        </>
      )}
    </div>
  );
}

/* ------------------------------- rastreadores ------------------------------- */

function Rastreadores() {
  const { data: devices = [] } = useTrackingDevices();
  const { data: vehicles = [] } = useVehicles();
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<string | null>(null);

  const url = import.meta.env["VITE_SUPABASE_URL"] ?? "https://SEU-PROJETO.supabase.co";
  const plate = (id: string) => vehicles.find((v) => v.id === id)?.plate ?? "—";

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId || !vehicleId) {
      toast.error("Escolha o veículo.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { token, hash } = await newDeviceToken();
    const { error } = await supabase.from("tracking_devices").insert({
      organization_id: orgId,
      vehicle_id: vehicleId,
      provider: String(fd.get("provider") ?? "").trim() || null,
      device_identifier: String(fd.get("device_identifier") ?? "").trim() || null,
      token_hash: hash,
      notes: String(fd.get("notes") ?? "").trim() || null,
      created_by: userId,
    });
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    invalidate(["tracking-devices"]);
    setOpen(false);
    setShown(token);
  }

  async function toggle(id: string, active: boolean) {
    const { error } = await supabase
      .from("tracking_devices")
      .update({ active, updated_by: userId })
      .eq("id", id);
    if (error) toast.error(dbMessage(error));
    else invalidate(["tracking-devices"]);
  }

  const sample = `curl -X POST "${url}/rest/v1/rpc/tracking_ingest" \\
  -H "apikey: <chave pública do sistema>" \\
  -H "Content-Type: application/json" \\
  -d '{"_token":"<token do rastreador>","_payload":{"lat":-23.55,"lng":-46.63,"speed_kmh":42,"ignition":true,"battery_v":12.6,"odometer_km":15230}}'`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Rastreadores vinculados</h2>
            <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
              Cada rastreador recebe um token secreto, mostrado uma única vez. O fornecedor do
              rastreamento usa esse token para enviar as posições ao sistema.
            </p>
          </div>
          {canManageFleet && (
            <Button className="gap-2" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Novo rastreador
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Veículo</TableHead>
              <TableHead>Fornecedor / modelo</TableHead>
              <TableHead>Identificador</TableHead>
              <TableHead>Último sinal</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhum rastreador cadastrado.
                </TableCell>
              </TableRow>
            )}
            {devices.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{plate(d.vehicle_id)}</TableCell>
                <TableCell>{d.provider ?? "—"}</TableCell>
                <TableCell>{d.device_identifier ?? "—"}</TableCell>
                <TableCell>{d.last_seen_at ? dateTimeBR(d.last_seen_at) : "Nunca"}</TableCell>
                <TableCell>
                  <Badge variant={d.active ? "secondary" : "outline"}>
                    {d.active ? "Ativo" : "Desativado"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canManageFleet && (
                    <Button size="sm" variant="ghost" onClick={() => toggle(d.id, !d.active)}>
                      {d.active ? "Desativar" : "Reativar"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <h2 className="text-base font-semibold">Como o fornecedor envia os dados</h2>
        <p className="mt-1 mb-3 text-[13px] text-muted-foreground">
          Entregue ao fornecedor do rastreamento o token e este modelo de envio (uma chamada por
          posição). Campos aceitos: lat, lng (obrigatórios), speed_kmh, ignition, battery_v,
          heading, odometer_km e recorded_at.
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{sample}</pre>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo rastreador</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Veículo *</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate ?? v.asset_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="provider">Fornecedor / modelo</Label>
                <Input id="provider" name="provider" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="device_identifier">Identificador (IMEI/série)</Label>
                <Input id="device_identifier" name="device_identifier" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Criar e gerar token
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={shown !== null} onOpenChange={(v) => !v && setShown(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Token do rastreador</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copie agora e entregue ao fornecedor. Por segurança, este token não será mostrado
            novamente; se perder, desative este rastreador e crie outro.
          </p>
          <div className="break-all rounded-md bg-muted p-3 font-mono text-sm">{shown}</div>
          <DialogFooter>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                if (shown)
                  navigator.clipboard.writeText(shown).then(() => toast.success("Copiado."));
              }}
            >
              <Copy className="size-4" /> Copiar
            </Button>
            <Button onClick={() => setShown(null)}>Já guardei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --------------------------- áreas e limites de alerta --------------------------- */

function Regras() {
  const { data: geofences = [] } = useTrackingGeofences();
  const { data: settings } = useTrackingSettings();
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const [alertOn, setAlertOn] = useState("saida");
  const [busy, setBusy] = useState(false);

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      organization_id: orgId,
      max_speed_kmh: parseBRNumber(String(fd.get("max_speed_kmh") ?? "")),
      low_battery_v: parseBRNumber(String(fd.get("low_battery_v") ?? "")),
      offline_minutes: Math.round(parseBRNumber(String(fd.get("offline_minutes") ?? ""))),
      updated_by: userId,
    };
    const { error } = await supabase
      .from("tracking_settings")
      .upsert(payload, { onConflict: "organization_id" });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Limites salvos.");
    invalidate(["tracking-settings"]);
  }

  async function addZone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    const lat = parseSigned(String(fd.get("lat") ?? ""));
    const lng = parseSigned(String(fd.get("lng") ?? ""));
    const radius = Math.round(parseBRNumber(String(fd.get("radius") ?? "")));
    if (name.length < 2 || Number.isNaN(lat) || Number.isNaN(lng) || radius < 50) {
      toast.error("Informe o nome, a latitude, a longitude e um raio de pelo menos 50 m.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("tracking_geofences").insert({
      organization_id: orgId,
      name,
      center_lat: lat,
      center_lng: lng,
      radius_m: radius,
      alert_on: alertOn,
      created_by: userId,
    });
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Área criada.");
    form.reset();
    invalidate(["tracking-geofences"]);
  }

  async function removeZone(id: string) {
    const { error } = await supabase.from("tracking_geofences").delete().eq("id", id);
    if (error) toast.error(dbMessage(error));
    else invalidate(["tracking-geofences"]);
  }

  const s = settings ?? DEFAULT_SETTINGS;

  return (
    <div className="space-y-4">
      <form
        key={settings?.id ?? "padrao"}
        onSubmit={saveSettings}
        className="rounded-lg border bg-card p-4 shadow-card"
      >
        <h2 className="mb-3 text-base font-semibold">Limites de alerta</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="max_speed_kmh">Velocidade máxima (km/h)</Label>
            <Input
              id="max_speed_kmh"
              name="max_speed_kmh"
              inputMode="decimal"
              defaultValue={String(s.max_speed_kmh).replace(".", ",")}
              disabled={!canManageFleet}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="low_battery_v">Bateria mínima (V)</Label>
            <Input
              id="low_battery_v"
              name="low_battery_v"
              inputMode="decimal"
              defaultValue={String(s.low_battery_v).replace(".", ",")}
              disabled={!canManageFleet}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offline_minutes">Sem sinal após (minutos)</Label>
            <Input
              id="offline_minutes"
              name="offline_minutes"
              inputMode="numeric"
              defaultValue={String(s.offline_minutes)}
              disabled={!canManageFleet}
            />
          </div>
        </div>
        {canManageFleet && (
          <Button type="submit" className="mt-3">
            Salvar limites
          </Button>
        )}
      </form>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <h2 className="mb-1 text-base font-semibold">Áreas permitidas (cercas virtuais)</h2>
        <p className="mb-3 text-[13px] text-muted-foreground">
          O sistema avisa quando um veículo entra ou sai de uma área circular. Use latitude e
          longitude do centro (ex.: -23,5505 e -46,6333) e o raio em metros.
        </p>
        {canManageFleet && (
          <form onSubmit={addZone} className="mb-4 grid gap-3 sm:grid-cols-6">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" placeholder="Pátio da prefeitura" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lat">Latitude</Label>
              <Input id="lat" name="lat" inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lng">Longitude</Label>
              <Input id="lng" name="lng" inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="radius">Raio (m)</Label>
              <Input id="radius" name="radius" inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label>Avisar</Label>
              <Select value={alertOn} onValueChange={setAlertOn}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(GEOFENCE_ALERT_ON).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-6">
              <Button type="submit" disabled={busy} className="gap-2">
                <Plus className="size-4" /> Adicionar área
              </Button>
            </div>
          </form>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Centro</TableHead>
              <TableHead className="text-right">Raio</TableHead>
              <TableHead>Aviso</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {geofences.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhuma área cadastrada.
                </TableCell>
              </TableRow>
            )}
            {geofences.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell>
                  {Number(g.center_lat)}, {Number(g.center_lng)}
                </TableCell>
                <TableCell className="text-right">{g.radius_m} m</TableCell>
                <TableCell>{GEOFENCE_ALERT_ON[g.alert_on] ?? g.alert_on}</TableCell>
                <TableCell>
                  {canManageFleet && (
                    <Button size="sm" variant="ghost" onClick={() => removeZone(g.id)}>
                      Remover
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Aceita vírgula decimal e sinal negativo (coordenadas do hemisfério sul/oeste). */
function parseSigned(text: string): number {
  const t = text.trim();
  if (!t) return Number.NaN;
  const neg = t.startsWith("-");
  const n = Number(t.replace("-", "").replace(",", "."));
  return neg ? -n : n;
}
