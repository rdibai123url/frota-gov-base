import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, CarFront, LogOut, LogIn, Ban, Eye, Route as RouteIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  USAGE_STATUS,
  VEHICLE_CATEGORY_HINT,
  cnhState,
  dateTimeBR,
  driverEligible,
  findDriverAt,
  label,
  num,
  supabase,
  useDrivers,
  useInvalidate,
  usePerms,
  useUnits,
  useVehicleUsages,
  useVehicles,
  type UsageRow,
  type UsageStatus,
  UF_LIST,
} from "@/lib/frotagov";
import { useEmployees } from "@/lib/pessoas";
import { computeRoute } from "@/lib/rotas.functions";
import { computeTripResult, useCandidateFuelings, useUsageFuelings } from "@/lib/viagem-resultado";
import {
  CONSUMPTION_SOURCE_LABEL,
  DISTANCE_SOURCE_LABEL,
  durationLabel,
  estimateTrip,
  useVehicleConsumption,
} from "@/lib/viagens";
import { Switch } from "@/components/ui/switch";
import { brl } from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/utilizacao")({
  head: () => ({
    meta: [
      { title: "Utilização e reservas — FrotaGov" },
      {
        name: "description",
        content:
          "Reserva, autorização, saída e retorno de veículos oficiais com controle de conflitos de agenda, condutor responsável e quilometragem.",
      },
      { property: "og:title", content: "Utilização e reservas — FrotaGov" },
      { property: "og:description", content: "Controle de uso e reserva da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Utilizacao,
});

const ALL = "__all__";
const NONE = "__none__";
const PAGE_SIZE = 12;
const BLOCKED_VEHICLE = ["inativo", "baixado"];

const STATUS_STYLE: Record<UsageStatus, string> = {
  solicitada: "bg-muted text-muted-foreground",
  autorizada: "bg-primary/10 text-primary",
  em_uso: "bg-warning/20 text-warning-foreground",
  concluida: "bg-success/15 text-success",
  cancelada: "bg-destructive/10 text-destructive",
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function Utilizacao() {
  const { data: usages = [], isLoading } = useVehicleUsages();
  const { data: vehicles = [] } = useVehicles();
  const invalidate = useInvalidate();
  const perms = usePerms();

  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [openNew, setOpenNew] = useState(false);
  const [detail, setDetail] = useState<UsageRow | null>(null);
  const [closing, setClosing] = useState<UsageRow | null>(null);
  const [cancelling, setCancelling] = useState<UsageRow | null>(null);

  // consulta "quem conduzia"
  const [lookVehicle, setLookVehicle] = useState(NONE);
  const [lookAt, setLookAt] = useState("");

  const lookupResult = useMemo(() => {
    if (lookVehicle === NONE || !lookAt) return undefined;
    return findDriverAt(usages, lookVehicle, new Date(lookAt));
  }, [usages, lookVehicle, lookAt]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return usages.filter((u) => {
      if (fStatus !== ALL && u.status !== fStatus) return false;
      if (t) {
        const hay = [u.code, (u.vehicle?.plate ?? u.vehicle?.asset_code ?? ""), u.driver?.full_name, u.destination, u.purpose]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [usages, q, fStatus]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  async function startTrip(u: UsageRow) {
    const { error } = await supabase
      .from("vehicle_usages")
      .update({ status: "em_uso", actual_departure: new Date().toISOString() })
      .eq("id", u.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Saída registrada para ${(u.vehicle?.plate ?? u.vehicle?.asset_code ?? "")}.`);
      invalidate(["vehicle-usages"]);
    }
  }

  return (
    <>
      <PageHeader
        title="Utilização e reservas"
        description="Reserve veículos, autorize deslocamentos e registre saída, retorno e quilometragem."
        action={
          perms.canRegister ? (
            <Button className="gap-2" onClick={() => setOpenNew(true)}>
              <Plus className="size-4" /> Nova utilização
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2">
          <Label className="text-xs">Busca (nº, placa, condutor, destino)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Buscar…" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {USAGE_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-4 rounded-lg border bg-card p-4 shadow-card">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium">
          <CarFront className="size-4" /> Quem conduzia o veículo?
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select value={lookVehicle} onValueChange={setLookVehicle}>
            <SelectTrigger><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Selecione o veículo</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{(v.plate ?? v.asset_code)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="datetime-local" value={lookAt} onChange={(e) => setLookAt(e.target.value)} />
          <div className="flex items-center text-sm">
            {lookupResult === undefined && <span className="text-muted-foreground">Informe veículo e data/hora.</span>}
            {lookupResult === null && <span className="text-muted-foreground">Nenhuma utilização registrada nesse momento.</span>}
            {lookupResult && (
              <span>
                <strong>{lookupResult.driver?.full_name ?? "Condutor não informado"}</strong> — {lookupResult.code} ({label(USAGE_STATUS, lookupResult.status)})
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Condutor</TableHead>
              <TableHead>Saída prevista</TableHead>
              <TableHead>Retorno previsto</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Nenhuma utilização registrada.
                </TableCell>
              </TableRow>
            )}
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs">{u.code}</TableCell>
                <TableCell className="font-medium">{(u.vehicle?.plate ?? u.vehicle?.asset_code ?? "—")}</TableCell>
                <TableCell>{u.driver?.full_name ?? "—"}</TableCell>
                <TableCell>{dateTimeBR(u.planned_departure)}</TableCell>
                <TableCell>{dateTimeBR(u.planned_return)}</TableCell>
                <TableCell className="max-w-40 truncate">{u.destination ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_STYLE[u.status]}>{label(USAGE_STATUS, u.status)}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label="Detalhes" onClick={() => setDetail(u)}>
                      <Eye className="size-4" />
                    </Button>
                    {perms.canRegister && (u.status === "solicitada" || u.status === "autorizada") && (
                      <Button variant="ghost" size="icon" aria-label="Registrar saída" onClick={() => startTrip(u)}>
                        <LogOut className="size-4" />
                      </Button>
                    )}
                    {perms.canRegister && u.status === "em_uso" && (
                      <Button variant="ghost" size="icon" aria-label="Registrar retorno" onClick={() => setClosing(u)}>
                        <LogIn className="size-4" />
                      </Button>
                    )}
                    {perms.canCancel && u.status !== "cancelada" && u.status !== "concluida" && (
                      <Button variant="ghost" size="icon" aria-label="Cancelar" onClick={() => setCancelling(u)}>
                        <Ban className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{filtered.length} registro(s) · página {current} de {pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      {openNew && <NewUsageDialog onClose={() => setOpenNew(false)} onSaved={() => invalidate(["vehicle-usages", "vehicles"])} />}
      {detail && <UsageDetail usage={detail} onClose={() => setDetail(null)} />}
      {closing && (
        <CloseUsageDialog usage={closing} onClose={() => setClosing(null)} onSaved={() => invalidate(["vehicle-usages", "vehicles"])} />
      )}
      {cancelling && (
        <CancelUsageDialog usage={cancelling} onClose={() => setCancelling(null)} onSaved={() => invalidate(["vehicle-usages"])} />
      )}
    </>
  );
}

function NewUsageDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: units = [] } = useUnits();
  const { data: employees = [] } = useEmployees();
  const { data: usages = [] } = useVehicleUsages();
  const perms = usePerms();

  const [vehicleId, setVehicleId] = useState(NONE);
  const [driverId, setDriverId] = useState(NONE);
  const [requester, setRequester] = useState(perms.userName);
  const [authorizer, setAuthorizer] = useState(perms.canWrite ? perms.userName : "");
  const [plannedOut, setPlannedOut] = useState(toLocalInput(new Date().toISOString()));
  const [plannedBack, setPlannedBack] = useState("");
  const [requesterEmployee, setRequesterEmployee] = useState(NONE);
  const [authorizerEmployee, setAuthorizerEmployee] = useState(NONE);
  const [origin, setOrigin] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [originState, setOriginState] = useState(NONE);
  const [destination, setDestination] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [destinationState, setDestinationState] = useState(NONE);
  const [purpose, setPurpose] = useState("");
  const [startKm, setStartKm] = useState("");
  const [passengers, setPassengers] = useState("");
  const [notes, setNotes] = useState("");
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);

  /* ------------------- inteligência de viagem (estimativa) ------------------ */
  const [roundTrip, setRoundTrip] = useState(false);
  const [routeKm, setRouteKm] = useState<number | null>(null);
  const [routeMin, setRouteMin] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<unknown>(null);
  const [distanceSource, setDistanceSource] = useState<"nao_calculada" | "rota" | "manual">("nao_calculada");
  const [manualKm, setManualKm] = useState("");
  const [fuelPrice, setFuelPrice] = useState("");
  const [routing, setRouting] = useState(false);
  const [routeNote, setRouteNote] = useState("");

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const driver = drivers.find((d) => d.id === driverId) ?? null;
  const unit = units.find((u) => u.id === vehicle?.unit_id) ?? null;

  const consumption = useVehicleConsumption(vehicle?.id ?? null, {
    assetClass: vehicle?.asset_class ?? null,
    category: vehicle?.vehicle_type ?? null,
    brand: vehicle?.brand ?? null,
    model: vehicle?.model ?? null,
  });
  const oneWayKm = distanceSource === "manual" ? Number(manualKm || 0) : routeKm;
  const trip = estimateTrip({
    distanceKm: oneWayKm,
    roundTrip,
    kmpl: consumption.kmpl,
    fuelPrice: fuelPrice ? Number(fuelPrice) : null,
  });

  /** Calcula a rota rodoviária provável entre os endereços informados. */
  async function calcularRota() {
    if (!originCity.trim() || !destinationCity.trim()) {
      toast.error("Informe ao menos a cidade de origem e a de destino.");
      return;
    }
    setRouting(true);
    try {
      const res = await computeRoute({
        data: {
          origin: {
            address: origin,
            city: originCity,
            state: originState === NONE ? null : originState,
          },
          destination: {
            address: destination,
            city: destinationCity,
            state: destinationState === NONE ? null : destinationState,
          },
        },
      });
      setRouteNote(res.message);
      if (res.ok) {
        setRouteKm(res.distanceKm);
        setRouteMin(res.durationMin);
        setRouteGeometry(res.geometry);
        setDistanceSource("rota");
        toast.success("Rota estimada calculada.");
      } else {
        toast.warning(res.message);
      }
    } catch {
      setRouteNote("Não foi possível consultar o serviço de rotas agora.");
      toast.message("Serviço de rotas indisponível. Você pode informar a distância manualmente.");
    } finally {
      setRouting(false);
    }
  }

  const issues: { level: "erro" | "alerta" | "info"; message: string }[] = [];
  if (!vehicle) issues.push({ level: "erro", message: "Selecione o veículo." });
  if (vehicle && BLOCKED_VEHICLE.includes(vehicle.status))
    issues.push({ level: "erro", message: `Veículo ${(vehicle.plate ?? vehicle.asset_code)} está ${vehicle.status} e não pode ser utilizado.` });
  if (vehicle?.status === "manutencao")
    issues.push({ level: "alerta", message: "Veículo em manutenção: é obrigatório justificar a liberação." });
  if (!driver) issues.push({ level: "erro", message: "Selecione o condutor." });
  if (driver && !driver.active) issues.push({ level: "erro", message: "Condutor inativo não pode ser designado." });
  if (driver && cnhState(driver.license_expiry) === "vencida")
    issues.push({ level: "erro", message: `CNH de ${driver.full_name} está vencida.` });
  if (driver && cnhState(driver.license_expiry) === "a_vencer")
    issues.push({ level: "alerta", message: "CNH do condutor vence nos próximos 30 dias." });
  if (
    vehicle?.vehicle_type &&
    driver?.license_categories?.length &&
    VEHICLE_CATEGORY_HINT[vehicle.vehicle_type] &&
    !VEHICLE_CATEGORY_HINT[vehicle.vehicle_type]!.some((c) => driver.license_categories!.includes(c))
  )
    issues.push({
      level: "alerta",
      message: `Categoria da CNH pode ser insuficiente para ${vehicle.vehicle_type} (sugerido: ${VEHICLE_CATEGORY_HINT[vehicle.vehicle_type]!.join(", ")}).`,
    });
  if (perms.roles.includes("unit_manager") && !perms.canManageFleet) {
    if (vehicle && vehicle.unit_id !== perms.unitId)
      issues.push({ level: "erro", message: "Você só pode operar veículos da sua própria unidade." });
    if (driver && driver.unit_id !== perms.unitId)
      issues.push({ level: "erro", message: "Você só pode designar condutores da sua própria unidade." });
  }
  if (!plannedOut) issues.push({ level: "erro", message: "Informe a data/hora prevista de saída." });
  if (plannedOut && plannedBack && new Date(plannedBack) <= new Date(plannedOut))
    issues.push({ level: "erro", message: "O retorno previsto deve ser posterior à saída." });

  // conflito de reserva (validado também no banco)
  if (vehicle && plannedOut) {
    const ini = new Date(plannedOut).getTime();
    const fim = plannedBack ? new Date(plannedBack).getTime() : ini;
    const conflict = usages.find((u) => {
      if (u.vehicle_id !== vehicle.id) return false;
      if (["cancelada", "concluida"].includes(u.status)) return false;
      const a = new Date(u.planned_departure).getTime();
      const b = new Date(u.planned_return ?? u.planned_departure).getTime();
      return ini <= b && fim >= a;
    });
    if (conflict)
      issues.push({
        level: "erro",
        message: `Conflito de reserva com a utilização ${conflict.code} (${dateTimeBR(conflict.planned_departure)}).`,
      });
  }

  const needsJustification = vehicle?.status === "manutencao";
  const blocked = issues.some((i) => i.level === "erro");

  async function submit() {
    if (blocked || !perms.orgId || !vehicle || !driver) return;
    if (needsJustification && justification.trim().length < 10) {
      toast.error("Justifique a utilização do veículo em manutenção (mínimo 10 caracteres).");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("vehicle_usages").insert({
      organization_id: perms.orgId,
      vehicle_id: vehicle.id,
      unit_id: vehicle.unit_id,
      driver_id: driver.id,
      requester_employee_id: requesterEmployee === NONE ? null : requesterEmployee,
      authorizer_employee_id: authorizerEmployee === NONE ? null : authorizerEmployee,
      requester_name: requester.trim() || perms.userName,
      requester_id: perms.userId,
      authorizer_name: authorizer.trim() || null,
      authorizer_id: authorizer.trim() ? perms.userId : null,
      planned_departure: new Date(plannedOut).toISOString(),
      planned_return: plannedBack ? new Date(plannedBack).toISOString() : null,
      origin: origin.trim() || null,
      origin_city: originCity.trim() || null,
      origin_state: originState === NONE ? null : originState,
      destination: destination.trim() || null,
      destination_city: destinationCity.trim() || null,
      destination_state: destinationState === NONE ? null : destinationState,
      purpose: purpose.trim() || null,
      start_km: startKm ? Number(startKm) : null,
      passengers: passengers
        .split(/[,;\n]/)
        .map((p) => p.trim())
        .filter(Boolean),
      notes: notes.trim() || null,
      round_trip: roundTrip,
      estimated_distance_km: trip.totalKm,
      estimated_duration_min: roundTrip && routeMin ? routeMin * 2 : routeMin,
      route_geometry: (routeGeometry ?? null) as never,
      route_provider: distanceSource === "rota" ? "osrm" : null,
      route_calculated_at: distanceSource === "rota" ? new Date().toISOString() : null,
      distance_source: distanceSource,
      estimated_consumption_kmpl: consumption.kmpl,
      consumption_source: consumption.source,
      estimated_liters: trip.liters,
      fuel_price_used: fuelPrice ? Number(fuelPrice) : null,
      estimated_cost: trip.cost,
      maintenance_justification: needsJustification ? justification.trim() : null,
      status: (perms.canWrite ? "autorizada" : "solicitada") as UsageStatus,
      created_by: perms.userId,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Utilização registrada.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova utilização / reserva</DialogTitle>
          <DialogDescription>
            O número da requisição é gerado automaticamente. Conflitos de agenda e restrições de condutor são
            verificados no servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Veículo *</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecione</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id} disabled={BLOCKED_VEHICLE.includes(v.status)}>
                    {(v.plate ?? v.asset_code)} — {v.model ?? v.brand ?? "veículo"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Unidade (do veículo)</Label>
            <Input value={unit?.name ?? "—"} readOnly className="bg-muted/50" />
          </div>
          <div>
            <Label>Condutor *</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecione</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id} disabled={!driverEligible(d)}>
                    {d.full_name}
                    {!driverEligible(d) ? " (indisponível)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Solicitante (funcionário)</Label>
            <Select
              value={requesterEmployee}
              onValueChange={(v) => {
                setRequesterEmployee(v);
                const emp = employees.find((e) => e.id === v);
                if (emp) setRequester(emp.full_name);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione no cadastro de pessoas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não vincular</SelectItem>
                {employees
                  .filter((e) => e.active)
                  .map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                      {e.registration ? ` — ${e.registration}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Autorizador (funcionário)</Label>
            <Select
              value={authorizerEmployee}
              onValueChange={(v) => {
                setAuthorizerEmployee(v);
                const emp = employees.find((e) => e.id === v);
                setAuthorizer(emp ? emp.full_name : "");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione no cadastro de pessoas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não vincular</SelectItem>
                {employees
                  .filter((e) => e.active)
                  .map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                      {e.registration ? ` — ${e.registration}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="req">Nome do solicitante</Label>
              <Input id="req" value={requester} onChange={(e) => setRequester(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="aut">Nome do autorizador</Label>
              <Input id="aut" value={authorizer} onChange={(e) => setAuthorizer(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="km">KM inicial</Label>
            <Input id="km" type="number" value={startKm} onChange={(e) => setStartKm(e.target.value)} placeholder={vehicle?.current_km ? String(vehicle.current_km) : ""} />
          </div>
          <div>
            <Label htmlFor="po">Saída prevista *</Label>
            <Input id="po" type="datetime-local" value={plannedOut} onChange={(e) => setPlannedOut(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pb">Retorno previsto</Label>
            <Input id="pb" type="datetime-local" value={plannedBack} onChange={(e) => setPlannedBack(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ori">Origem (local)</Label>
            <Input id="ori" value={origin} onChange={(e) => setOrigin(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <div>
              <Label htmlFor="oric">Cidade de origem</Label>
              <Input id="oric" value={originCity} onChange={(e) => setOriginCity(e.target.value)} />
            </div>
            <div>
              <Label>UF</Label>
              <Select value={originState} onValueChange={setOriginState}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {UF_LIST.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="dst">Destino (local)</Label>
            <Input id="dst" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <div>
              <Label htmlFor="dstc">Cidade de destino</Label>
              <Input id="dstc" value={destinationCity} onChange={(e) => setDestinationCity(e.target.value)} />
            </div>
            <div>
              <Label>UF</Label>
              <Select value={destinationState} onValueChange={setDestinationState}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {UF_LIST.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Inteligência de viagem: rota, distância e consumo estimado. */}
          <div className="gov-band sm:col-span-2 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <RouteIcon className="size-4" /> Estimativa da viagem
              </p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={roundTrip} onCheckedChange={setRoundTrip} />
                  Ida e volta
                </label>
                <Button type="button" variant="outline" size="sm" onClick={calcularRota} disabled={routing}>
                  {routing ? <Loader2 className="size-4 animate-spin" /> : <RouteIcon className="size-4" />}
                  {routing ? "Calculando…" : "Calcular rota"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="kmman">Distância só de ida (km)</Label>
                <Input
                  id="kmman"
                  inputMode="decimal"
                  value={distanceSource === "manual" ? manualKm : routeKm != null ? String(routeKm) : ""}
                  onChange={(e) => {
                    setManualKm(e.target.value);
                    setDistanceSource(e.target.value ? "manual" : "nao_calculada");
                  }}
                  placeholder="Calcule a rota ou informe"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {DISTANCE_SOURCE_LABEL[distanceSource]}
                </p>
              </div>
              <div>
                <Label htmlFor="prc">Preço do litro (opcional)</Label>
                <Input
                  id="prc"
                  inputMode="decimal"
                  value={fuelPrice}
                  onChange={(e) => setFuelPrice(e.target.value)}
                  placeholder="Ex.: 6,29"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Usado apenas para estimar o custo.</p>
              </div>
              <div>
                <Label>Consumo considerado</Label>
                <Input
                  readOnly
                  className="bg-muted/50"
                  value={consumption.kmpl ? `${num(consumption.kmpl, 2)} km/l` : "—"}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {consumption.source ? CONSUMPTION_SOURCE_LABEL[consumption.source] : consumption.note}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
              <div>
                <p className="gov-label">Distância total</p>
                <p className="tabular-nums">{trip.totalKm != null ? `${num(trip.totalKm, 1)} km` : "—"}</p>
              </div>
              <div>
                <p className="gov-label">Duração estimada</p>
                <p className="tabular-nums">{durationLabel(roundTrip && routeMin ? routeMin * 2 : routeMin)}</p>
              </div>
              <div>
                <p className="gov-label">Combustível estimado</p>
                <p className="tabular-nums">{trip.liters != null ? `${num(trip.liters, 1)} L` : "—"}</p>
              </div>
              <div>
                <p className="gov-label">Custo estimado</p>
                <p className="tabular-nums">{trip.cost != null ? brl(trip.cost) : "—"}</p>
              </div>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              {routeNote || "Valores estimados para planejamento. A quilometragem oficial continua sendo a registrada na saída e no retorno."}
            </p>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="fin">Finalidade / serviço</Label>
            <Input id="fin" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pas">Passageiros (separe por vírgula)</Label>
            <Input id="pas" value={passengers} onChange={(e) => setPassengers(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="obs">Observações / eventos</Label>
            <Textarea id="obs" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {needsJustification && (
            <div className="sm:col-span-2">
              <Label htmlFor="just">Justificativa (veículo em manutenção) *</Label>
              <Textarea id="just" rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} />
            </div>
          )}
        </div>

        {issues.length > 0 && (
          <ul className="space-y-1 rounded-md border p-3 text-sm">
            {issues.map((i, idx) => (
              <li
                key={idx}
                className={
                  i.level === "erro" ? "text-destructive" : i.level === "alerta" ? "text-warning-foreground" : "text-muted-foreground"
                }
              >
                • {i.message}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || blocked}>{saving ? "Salvando…" : "Registrar utilização"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TripResultBlock({ usage }: { usage: UsageRow }) {
  const perms = usePerms();
  const invalidate = useInvalidate();
  const { data: linked = [] } = useUsageFuelings(usage.id);
  const from = usage.actual_departure ?? usage.planned_departure ?? null;
  const to = usage.actual_return ?? usage.planned_return ?? null;
  const { data: candidates = [] } = useCandidateFuelings({
    vehicleId: usage.vehicle_id,
    from,
    to,
    enabled: perms.canRegister,
  });
  const [linking, setLinking] = useState<string | null>(null);

  const result = useMemo(
    () =>
      computeTripResult({
        startKm: usage.start_km,
        endKm: usage.end_km,
        plannedKm: usage.estimated_distance_km,
        fuelings: linked,
      }),
    [usage.start_km, usage.end_km, usage.estimated_distance_km, linked],
  );

  async function link(id: string) {
    setLinking(id);
    const { error } = await supabase.from("fuelings").update({ usage_id: usage.id }).eq("id", id);
    setLinking(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Abastecimento vinculado à viagem.");
    invalidate(["usage-fuelings", "usage-fuelings-candidates", "fuelings"]);
  }

  const mapUrl =
    usage.origin && usage.destination
      ? `https://www.openstreetmap.org/directions?from=${encodeURIComponent(usage.origin)}&to=${encodeURIComponent(usage.destination)}`
      : null;

  const cell = (k: string, v: string) => (
    <div key={k}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="text-sm">{v}</dd>
    </div>
  );

  return (
    <section className="mt-2 space-y-4 rounded-lg border bg-muted/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="gov-title text-sm uppercase tracking-wider">Planejado x realizado</h3>
        {mapUrl && (
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href={mapUrl} target="_blank" rel="noreferrer">
              <RouteIcon className="size-4" /> Ver rota no mapa
            </a>
          </Button>
        )}
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        {cell("Distância planejada", result.plannedKm != null ? `${num(result.plannedKm, 1)} km` : "—")}
        {cell("KM realizado (odômetro)", result.realKm != null ? `${num(result.realKm, 1)} km` : "—")}
        {cell(
          "Diferença",
          result.diffKm != null
            ? `${result.diffKm > 0 ? "+" : ""}${num(result.diffKm, 1)} km${result.diffPct != null ? ` (${result.diffPct > 0 ? "+" : ""}${num(result.diffPct, 1)}%)` : ""}`
            : "—",
        )}
        {cell("Odômetro de saída", usage.start_km != null ? num(usage.start_km, 0) : "—")}
        {cell("Odômetro de retorno", usage.end_km != null ? num(usage.end_km, 0) : "—")}
        {cell("Abastecimentos vinculados", String(result.fuelingCount))}
        {cell("Litros abastecidos na viagem", result.liters != null ? `${num(result.liters, 2)} L` : "—")}
        {cell("Valor abastecido na viagem", result.value != null ? brl(result.value) : "—")}
        {cell("Preço médio por litro", result.avgPrice != null ? brl(result.avgPrice) : "—")}
        {cell("Litros estimados", usage.estimated_liters != null ? `${num(usage.estimated_liters, 1)} L` : "—")}
        {cell("Custo estimado", usage.estimated_cost != null ? brl(usage.estimated_cost) : "—")}
        {cell(
          "Consumo de referência",
          usage.estimated_consumption_kmpl != null
            ? `${num(usage.estimated_consumption_kmpl, 2)} km/l (${CONSUMPTION_SOURCE_LABEL[usage.consumption_source ?? ""] ?? "origem não informada"})`
            : "—",
        )}
      </dl>

      <div className="rounded-md border bg-card p-3 text-sm">
        <p className="font-medium">
          {result.effectiveKmpl != null
            ? `Consumo efetivo: ${num(result.effectiveKmpl, 2)} km/l`
            : "Consumo efetivo indisponível"}
        </p>
        <p className="text-muted-foreground">
          {result.effectiveKmpl != null
            ? "Apurado entre dois abastecimentos de tanque cheio com odômetro registrado."
            : result.effectiveNote}
        </p>
      </div>

      {linked.length > 0 && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Abastecimentos da viagem</p>
          <ul className="space-y-1 text-sm">
            {linked.map((f) => (
              <li key={f.id} className="flex flex-wrap gap-2 rounded-md bg-card px-3 py-2">
                <span>{dateTimeBR(f.fueled_at)}</span>
                <span>{num(f.quantity ?? 0, 2)} L</span>
                <span>{brl(f.total_value ?? 0)}</span>
                {f.full_tank && <Badge variant="outline">Tanque cheio</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {perms.canRegister && candidates.length > 0 && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Abastecimentos do mesmo bem no período, ainda sem viagem
          </p>
          <ul className="space-y-1 text-sm">
            {candidates.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-md bg-card px-3 py-2">
                <span>{dateTimeBR(f.fueled_at)}</span>
                <span>{num(f.quantity ?? 0, 2)} L</span>
                <span>{brl(f.total_value ?? 0)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={linking === f.id}
                  onClick={() => link(f.id)}
                >
                  {linking === f.id ? "Vinculando…" : "Vincular à viagem"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function UsageDetail({ usage, onClose }: { usage: UsageRow; onClose: () => void }) {
  const items: [string, string][] = [
    ["Número", usage.code ?? "—"],
    ["Situação", label(USAGE_STATUS, usage.status)],
    ["Veículo", (usage.vehicle?.plate ?? usage.vehicle?.asset_code ?? "—")],
    ["Unidade", usage.unit?.name ?? "—"],
    ["Condutor", usage.driver?.full_name ?? "—"],
    ["Solicitante", usage.requester_name ?? "—"],
    ["Autorizador", usage.authorizer_name ?? "—"],
    ["Saída prevista", dateTimeBR(usage.planned_departure)],
    ["Retorno previsto", dateTimeBR(usage.planned_return)],
    ["Saída real", dateTimeBR(usage.actual_departure)],
    ["Retorno real", dateTimeBR(usage.actual_return)],
    ["Origem", usage.origin ?? "—"],
    ["Ida e volta", usage.round_trip ? "Sim" : "Não"],
    [
      "Distância estimada",
      usage.estimated_distance_km != null
        ? `${num(usage.estimated_distance_km, 1)} km (${DISTANCE_SOURCE_LABEL[usage.distance_source ?? "nao_calculada"] ?? "—"})`
        : "—",
    ],
    ["Duração estimada", durationLabel(usage.estimated_duration_min)],
    [
      "Combustível estimado",
      usage.estimated_liters != null ? `${num(usage.estimated_liters, 1)} L` : "—",
    ],
    ["Custo estimado", usage.estimated_cost != null ? brl(usage.estimated_cost) : "—"],
    ["Destino", usage.destination ?? "—"],
    ["Finalidade", usage.purpose ?? "—"],
    ["KM inicial", usage.start_km != null ? num(usage.start_km, 0) : "—"],
    ["KM final", usage.end_km != null ? num(usage.end_km, 0) : "—"],
    ["Passageiros", (usage.passengers ?? []).join(", ") || "—"],
    ["Observações", usage.notes ?? "—"],
    ["Justificativa (manutenção)", usage.maintenance_justification ?? "—"],
    ["Motivo do cancelamento", usage.cancel_reason ?? "—"],
  ];
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Utilização {usage.code}</DialogTitle>
          <DialogDescription>Registro completo do deslocamento para fins de auditoria.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 sm:grid-cols-2">
          {items.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        {usage.status === "concluida" && <TripResultBlock usage={usage} />}
      </DialogContent>
    </Dialog>
  );
}

function CloseUsageDialog({ usage, onClose, onSaved }: { usage: UsageRow; onClose: () => void; onSaved: () => void }) {
  const [endKm, setEndKm] = useState(usage.end_km != null ? String(usage.end_km) : "");
  const [notes, setNotes] = useState(usage.notes ?? "");
  const [saving, setSaving] = useState(false);
  const startKm = Number(usage.start_km ?? 0);
  const invalid = endKm !== "" && startKm > 0 && Number(endKm) < startKm;

  async function submit() {
    if (invalid) return;
    setSaving(true);
    const { error } = await supabase
      .from("vehicle_usages")
      .update({
        status: "concluida",
        actual_return: new Date().toISOString(),
        end_km: endKm ? Number(endKm) : null,
        notes: notes.trim() || null,
      })
      .eq("id", usage.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Retorno registrado. A quilometragem do veículo foi atualizada quando maior.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar retorno — {usage.code}</DialogTitle>
          <DialogDescription>
            KM inicial registrado: {usage.start_km != null ? num(usage.start_km, 0) : "não informado"}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="ekm">KM final</Label>
            <Input id="ekm" type="number" value={endKm} onChange={(e) => setEndKm(e.target.value)} />
            {invalid && <p className="mt-1 text-sm text-destructive">O KM final não pode ser inferior ao inicial.</p>}
          </div>
          <div>
            <Label htmlFor="cobs">Observações / eventos do trajeto</Label>
            <Textarea id="cobs" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Voltar</Button>
          <Button onClick={submit} disabled={saving || invalid}>{saving ? "Salvando…" : "Concluir utilização"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelUsageDialog({ usage, onClose, onSaved }: { usage: UsageRow; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (reason.trim().length < 5) {
      toast.error("Descreva o motivo do cancelamento.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("vehicle_usages")
      .update({ status: "cancelada", cancel_reason: reason.trim() })
      .eq("id", usage.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Utilização cancelada (registro preservado para auditoria).");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar utilização {usage.code}</DialogTitle>
          <DialogDescription>O registro não é excluído: fica mantido com o motivo informado.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do cancelamento" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Voltar</Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>Confirmar cancelamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
