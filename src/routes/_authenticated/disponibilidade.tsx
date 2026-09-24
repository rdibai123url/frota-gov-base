import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarClock, CarFront, CircleCheck, CircleOff, ShieldAlert, Wrench } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, KpiCard, KpiGrid, StatusBadge } from "@/components/ui-gov";
import {
  AVAILABILITY_LABEL,
  deriveAvailability,
  type AvailabilityStatus,
} from "@/lib/disponibilidade";
import {
  dateTimeBR,
  useMaintenanceRequests,
  useServiceOrders,
  useUnits,
  useVehicleObligations,
  useVehicleUsages,
  useVehicles,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/disponibilidade")({
  head: () => ({
    meta: [
      { title: "Disponibilidade da Frota — FrotaGov" },
      {
        name: "description",
        content: "Visão operacional da disponibilidade de veículos e equipamentos do órgão.",
      },
      { property: "og:title", content: "Disponibilidade da Frota — FrotaGov" },
      {
        property: "og:description",
        content:
          "Situações derivadas de usos, reservas, manutenções e obrigações da frota pública.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Disponibilidade,
});

const ALL = "__all__";
const STATUS_ORDER: AvailabilityStatus[] = [
  "disponivel",
  "em_uso",
  "reservado",
  "em_manutencao",
  "indisponivel",
  "bloqueado",
];

function Disponibilidade() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: usages = [] } = useVehicleUsages();
  const { data: requests = [] } = useMaintenanceRequests();
  const { data: orders = [] } = useServiceOrders();
  const { data: obligations = [] } = useVehicleObligations();
  const { data: units = [] } = useUnits();
  const [status, setStatus] = useState<string>(ALL);
  const [unit, setUnit] = useState(ALL);
  const [assetClass, setAssetClass] = useState(ALL);
  const [vehicleId, setVehicleId] = useState(ALL);
  const [search, setSearch] = useState("");

  const rows = useMemo(
    () =>
      vehicles.map((vehicle) => deriveAvailability(vehicle, usages, requests, orders, obligations)),
    [vehicles, usages, requests, orders, obligations],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_ORDER.map((key) => [key, rows.filter((row) => row.status === key).length]),
      ) as Record<AvailabilityStatus, number>,
    [rows],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const vehicle = row.vehicle;
      if (status !== ALL && row.status !== status) return false;
      if (unit !== ALL && vehicle.unit_id !== unit) return false;
      if (assetClass !== ALL && vehicle.asset_class !== assetClass) return false;
      if (vehicleId !== ALL && vehicle.id !== vehicleId) return false;
      return (
        !q ||
        [vehicle.plate, vehicle.asset_code, vehicle.brand, vehicle.model, row.reason]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [rows, status, unit, assetClass, vehicleId, search]);

  const setCardFilter = (next: AvailabilityStatus | "restritos") => {
    if (next === "restritos") setStatus(status === "indisponivel" ? "bloqueado" : "indisponivel");
    else setStatus(status === next ? ALL : next);
  };

  return (
    <>
      <PageHeader
        title="Disponibilidade da Frota"
        description="Situação operacional calculada com os usos, reservas, manutenções, obrigações e cadastros do órgão."
      />
      <KpiGrid className="mb-4">
        <KpiCard
          label="Total da frota"
          value={rows.length}
          icon={<CarFront className="size-4" />}
          onClick={() => setStatus(ALL)}
        />
        <KpiCard
          label="Disponíveis"
          value={counts.disponivel}
          tone="ok"
          icon={<CircleCheck className="size-4" />}
          onClick={() => setCardFilter("disponivel")}
        />
        <KpiCard
          label="Em uso"
          value={counts.em_uso}
          tone="info"
          icon={<CarFront className="size-4" />}
          onClick={() => setCardFilter("em_uso")}
        />
        <KpiCard
          label="Reservados"
          value={counts.reservado}
          tone="info"
          icon={<CalendarClock className="size-4" />}
          onClick={() => setCardFilter("reservado")}
        />
        <KpiCard
          label="Em manutenção"
          value={counts.em_manutencao}
          tone="warn"
          icon={<Wrench className="size-4" />}
          onClick={() => setCardFilter("em_manutencao")}
        />
        <KpiCard
          label="Indisponíveis / bloqueados"
          value={counts.indisponivel + counts.bloqueado}
          tone="danger"
          icon={<ShieldAlert className="size-4" />}
          onClick={() => setCardFilter("restritos")}
        />
      </KpiGrid>

      <section
        className="gov-band mb-4 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Filtros de disponibilidade"
      >
        <div>
          <Label htmlFor="disp-search">Busca</Label>
          <Input
            id="disp-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Placa, patrimônio ou modelo"
          />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {STATUS_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {AVAILABILITY_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Unidade / Secretaria</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {units.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.acronym ?? item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Classe</Label>
          <Select value={assetClass} onValueChange={setAssetClass}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              <SelectItem value="veiculo">Veículos</SelectItem>
              <SelectItem value="equipamento">Máquinas / equipamentos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Bem</Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate ?? vehicle.asset_code ?? vehicle.model ?? "Sem identificação"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Veículo / equipamento</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Operação atual / próxima</TableHead>
              <TableHead>Motivo principal</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading &&
              filtered.map((row) => {
                const vehicle = row.vehicle;
                const unitName = units.find((item) => item.id === vehicle.unit_id);
                const usage = row.currentUsage ?? row.nextReservation;
                const target =
                  row.currentUsage || row.nextReservation
                    ? "/utilizacao"
                    : row.maintenance || row.serviceOrder
                      ? "/manutencoes"
                      : row.obligation
                        ? "/obrigacoes"
                        : null;
                return (
                  <TableRow key={vehicle.id}>
                    <TableCell>
                      <strong>{vehicle.plate ?? vehicle.asset_code ?? "Sem identificação"}</strong>
                      <p className="text-xs text-muted-foreground">
                        {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") ||
                          vehicle.vehicle_type ||
                          vehicle.asset_class}
                      </p>
                    </TableCell>
                    <TableCell>{unitName?.acronym ?? unitName?.name ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge label={AVAILABILITY_LABEL[row.status]} />
                    </TableCell>
                    <TableCell>
                      {usage ? (
                        <>
                          <p>{usage.driver?.full_name ?? "Sem condutor"}</p>
                          <p className="text-xs text-muted-foreground">
                            {usage.destination ?? usage.purpose ?? "Destino não informado"} ·{" "}
                            {dateTimeBR(usage.actual_departure ?? usage.planned_departure)}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="line-clamp-2" title={row.reason}>
                        {row.reason}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {target && (
                          <Button asChild size="sm" variant="outline">
                            <Link to={target}>Tratar</Link>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/veiculo/$id" params={{ id: vehicle.id }}>
                            Ficha
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
        {!isLoading && filtered.length === 0 && (
          <EmptyState
            icon={<CircleOff className="size-5" />}
            title="Nenhum bem encontrado"
            description="Ajuste os filtros para consultar a disponibilidade."
          />
        )}
        {isLoading && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Calculando disponibilidade…
          </p>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        A localização não é exibida: o sistema não possui coordenadas reais dos veículos e não
        estima posições.
      </p>
    </>
  );
}
