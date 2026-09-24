import type {
  MaintenanceRequestRow,
  ServiceOrderRow,
  UsageRow,
  Vehicle,
  VehicleObligationRow,
} from "@/lib/frotagov";

export type AvailabilityStatus =
  "disponivel" | "reservado" | "em_uso" | "em_manutencao" | "indisponivel" | "bloqueado";
export type AvailabilityRow = {
  vehicle: Vehicle;
  status: AvailabilityStatus;
  reason: string;
  currentUsage: UsageRow | null;
  nextReservation: UsageRow | null;
  maintenance: MaintenanceRequestRow | null;
  serviceOrder: ServiceOrderRow | null;
  obligation: VehicleObligationRow | null;
};

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  em_uso: "Em uso",
  em_manutencao: "Em manutenção",
  indisponivel: "Indisponível",
  bloqueado: "Bloqueado",
};

export function deriveAvailability(
  vehicle: Vehicle,
  usages: UsageRow[],
  requests: MaintenanceRequestRow[],
  orders: ServiceOrderRow[],
  obligations: VehicleObligationRow[],
  now = new Date(),
): AvailabilityRow {
  const vUsages = usages.filter((x) => x.vehicle_id === vehicle.id && x.status !== "cancelada");
  const currentUsage =
    vUsages
      .filter((x) => x.status === "em_uso")
      .sort(
        (a, b) =>
          new Date(b.actual_departure ?? b.planned_departure).getTime() -
          new Date(a.actual_departure ?? a.planned_departure).getTime(),
      )[0] ?? null;
  const nextReservation =
    vUsages
      .filter(
        (x) =>
          ["solicitada", "autorizada"].includes(x.status) &&
          new Date(x.planned_departure).getTime() >= now.getTime(),
      )
      .sort(
        (a, b) => new Date(a.planned_departure).getTime() - new Date(b.planned_departure).getTime(),
      )[0] ?? null;
  const maintenance =
    requests
      .filter((x) => x.vehicle_id === vehicle.id && x.status === "em_manutencao")
      .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())[0] ??
    null;
  const serviceOrder =
    orders
      .filter(
        (x) =>
          x.vehicle_id === vehicle.id &&
          ["veiculo_recebido", "em_execucao", "aguardando_peca"].includes(x.status),
      )
      .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())[0] ?? null;
  const obligation =
    obligations
      .filter(
        (x) =>
          x.vehicle_id === vehicle.id &&
          !x.not_applicable &&
          (x.status === "vencida" ||
            (x.status === "pendente" &&
              x.due_date &&
              new Date(`${x.due_date}T23:59:59`).getTime() < now.getTime())),
      )
      .sort((a, b) => String(a.due_date ?? "").localeCompare(String(b.due_date ?? "")))[0] ?? null;

  if (["baixado", "inativo", "cedido"].includes(vehicle.status)) {
    return {
      vehicle,
      status: "indisponivel",
      reason: `Situação cadastral: ${vehicle.status}.`,
      currentUsage,
      nextReservation,
      maintenance,
      serviceOrder,
      obligation,
    };
  }
  if (obligation) {
    return {
      vehicle,
      status: "bloqueado",
      reason: `${obligation.obligation_type} vencida em ${obligation.due_date ?? "data não informada"}.`,
      currentUsage,
      nextReservation,
      maintenance,
      serviceOrder,
      obligation,
    };
  }
  if (vehicle.status === "manutencao" || maintenance || serviceOrder) {
    return {
      vehicle,
      status: "em_manutencao",
      reason:
        maintenance?.description ?? serviceOrder?.services ?? "Situação cadastral em manutenção.",
      currentUsage,
      nextReservation,
      maintenance,
      serviceOrder,
      obligation,
    };
  }
  if (currentUsage) {
    return {
      vehicle,
      status: "em_uso",
      reason: `Utilização ${currentUsage.code ?? "em andamento"}.`,
      currentUsage,
      nextReservation,
      maintenance,
      serviceOrder,
      obligation,
    };
  }
  if (nextReservation) {
    return {
      vehicle,
      status: "reservado",
      reason: `Próxima reserva ${nextReservation.code ?? "programada"}.`,
      currentUsage,
      nextReservation,
      maintenance,
      serviceOrder,
      obligation,
    };
  }
  return {
    vehicle,
    status: "disponivel",
    reason: "Sem uso, reserva ou restrição ativa.",
    currentUsage,
    nextReservation,
    maintenance,
    serviceOrder,
    obligation,
  };
}
