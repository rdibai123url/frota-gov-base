import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";

import { planDue, useMaintenanceLead, useMaintenancePlans, useVehicles } from "@/lib/frotagov";

/**
 * Aviso (não bloqueia) quando o veículo escolhido está com revisão preventiva vencida.
 * Aparece ao agendar uma utilização ou emitir uma autorização de despesa.
 */
export function AvisoPreventiva({ vehicleId }: { vehicleId: string }) {
  const { data: plans = [] } = useMaintenancePlans();
  const { data: vehicles = [] } = useVehicles();
  const lead = useMaintenanceLead();

  const pending = useMemo(() => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return [];
    return plans
      .filter(
        (p) =>
          p.active &&
          (p.vehicle_id === vehicle.id ||
            (!p.vehicle_id && (!p.vehicle_type || p.vehicle_type === vehicle.vehicle_type))),
      )
      .map((p) => ({ plan: p, due: planDue(p, vehicle, lead) }))
      .filter((x) => x.due.state === "vencido");
  }, [plans, vehicles, vehicleId, lead]);

  if (pending.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm sm:col-span-2"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div>
        <p className="font-medium">Este veículo está com revisão preventiva vencida.</p>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          {pending.map(({ plan, due }) => (
            <li key={plan.id}>
              {plan.name} — {due.detail}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted-foreground">
          Você pode continuar, mas o ideal é agendar a revisão.
        </p>
      </div>
    </div>
  );
}
