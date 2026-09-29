import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Fuel, IdCard, MapPin } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VehicleChecklistPanel } from "@/components/vehicle-checklist";
import { cnhState, dateBR, dateTimeBR, supabase, usePerms, type UsageRow } from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/motorista")({
  head: () => ({
    meta: [
      { title: "Área do motorista — Dibai Fleet" },
      {
        name: "description",
        content:
          "Tela simples para o motorista: viagens do dia, checklist do veículo com fotos, abastecimento e registro de ocorrência.",
      },
    ],
  }),
  component: AreaMotorista,
});

const STATUS: Record<string, string> = {
  solicitada: "Solicitada",
  autorizada: "Autorizada",
  em_uso: "Em uso",
};

function useMinhasViagens(userId: string | null) {
  return useQuery({
    queryKey: ["motorista", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data: driver, error: dErr } = await supabase
        .from("drivers")
        .select("id, full_name, license_expiry, license_categories, active")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (dErr) throw dErr;
      if (!driver) return { driver: null, usages: [] as UsageRow[] };
      const { data, error } = await supabase
        .from("vehicle_usages")
        .select(
          "*, vehicle:vehicles(id, plate, asset_code, status), unit:units(id, name, acronym), driver:drivers(id, full_name, license_expiry, active)",
        )
        .eq("driver_id", driver.id)
        .in("status", ["autorizada", "em_uso", "solicitada"])
        .order("planned_departure", { ascending: true })
        .limit(20);
      if (error) throw error;
      return { driver, usages: (data ?? []) as unknown as UsageRow[] };
    },
  });
}

function AreaMotorista() {
  const { userId } = usePerms();
  const { data, isLoading } = useMinhasViagens(userId);
  const driver = data?.driver ?? null;
  const cnh = driver ? cnhState(driver.license_expiry) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Área do motorista"
        description="Tudo o que você precisa antes, durante e depois da viagem, em uma tela simples."
      />

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && !driver && (
        <div className="rounded-lg border bg-card p-6 text-sm shadow-card">
          <p className="font-medium">
            O seu usuário ainda não está ligado a um cadastro de condutor.
          </p>
          <p className="mt-1 text-muted-foreground">
            Peça ao gestor de frota para abrir o seu cadastro em{" "}
            <strong>Cadastros → Condutores</strong> e informar o seu usuário. Depois disso, as suas
            viagens aparecem aqui.
          </p>
        </div>
      )}

      {driver && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2">
            <IdCard className="size-5" />
            <div>
              <p className="font-medium">{driver.full_name}</p>
              <p className="text-xs text-muted-foreground">
                CNH {driver.license_categories?.join(", ") || "—"} · validade{" "}
                {driver.license_expiry ? dateBR(driver.license_expiry) : "não informada"}
              </p>
            </div>
          </div>
          {cnh === "vencida" && <Badge variant="destructive">CNH vencida — não dirija</Badge>}
          {cnh === "a_vencer" && <Badge variant="outline">CNH vence em breve</Badge>}
          {cnh === "ok" && <Badge variant="secondary">CNH em dia</Badge>}
        </div>
      )}

      {driver && (
        <div className="grid grid-cols-2 gap-3">
          <Button asChild size="lg" className="h-16 gap-2">
            <Link to="/abastecimentos">
              <Fuel className="size-5" /> Registrar abastecimento
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-16 gap-2">
            <Link to="/sinistros">
              <AlertTriangle className="size-5" /> Registrar ocorrência
            </Link>
          </Button>
        </div>
      )}

      {driver && data && data.usages.length === 0 && (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
          Você não tem viagens autorizadas ou em andamento.
        </p>
      )}

      {data?.usages.map((u) => (
        <section key={u.id} className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              {u.vehicle?.plate ?? u.vehicle?.asset_code ?? "Veículo"}{" "}
              <span className="text-sm font-normal text-muted-foreground">· {u.code}</span>
            </h2>
            <Badge variant={u.status === "em_uso" ? "default" : "secondary"}>
              {STATUS[u.status] ?? u.status}
            </Badge>
          </div>
          <p className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span>
              {[u.origin, u.destination].filter(Boolean).join(" → ") || "Destino não informado"}
              <span className="block text-xs text-muted-foreground">
                Saída prevista {dateTimeBR(u.planned_departure)}
                {u.purpose ? ` · ${u.purpose}` : ""}
              </span>
            </span>
          </p>
          <VehicleChecklistPanel usage={u} compact />
        </section>
      ))}
    </div>
  );
}
