import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Truck } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ACCIDENT_KINDS,
  ASSET_MOVEMENT_KINDS,
  FINE_STATUS,
  MAINTENANCE_KINDS,
  MAINTENANCE_RECORD_STATUS,
  OBLIGATION_STATUS,
  TIRE_STATUS,
  USAGE_STATUS,
  VEHICLE_STATUS,
  brl,
  dateBR,
  dateTimeBR,
  label,
  maintenanceTotal,
  num,
  useAccidents,
  useAssetMovements,
  useAuthorizations,
  useFuelings,
  useInsurancePolicies,
  useMaintenanceRecords,
  useTires,
  useTrafficFines,
  useVehicleObligations,
  useVehicleStatusHistory,
  useVehicleUsages,
  useVehicles,
} from "@/lib/frotagov";


export const Route = createFileRoute("/_authenticated/veiculo/$id")({
  head: () => ({
    meta: [
      { title: "Histórico do veículo — FrotaGov" },
      {
        name: "description",
        content:
          "Histórico completo do veículo: utilizações, abastecimentos, autorizações, manutenções, peças, pneus e mudanças de situação.",
      },
      { property: "og:title", content: "Histórico do veículo — FrotaGov" },
      { property: "og:description", content: "Linha do tempo completa do veículo na frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoricoVeiculo,
});

function HistoricoVeiculo() {
  const { id } = Route.useParams();
  const { data: vehicles = [] } = useVehicles();
  const { data: usages = [] } = useVehicleUsages();
  const { data: fuelings = [] } = useFuelings();
  const { data: auths = [] } = useAuthorizations();
  const { data: records = [] } = useMaintenanceRecords();
  const { data: tires = [] } = useTires();
  const { data: statusHistory = [] } = useVehicleStatusHistory(id);

  const vehicle = vehicles.find((v) => v.id === id) ?? null;
  const vUsages = useMemo(() => usages.filter((u) => u.vehicle_id === id), [usages, id]);
  const vFuelings = useMemo(() => fuelings.filter((f) => f.vehicle_id === id), [fuelings, id]);
  const vAuths = useMemo(() => auths.filter((a) => a.vehicle_id === id), [auths, id]);
  const vRecords = useMemo(() => records.filter((r) => r.vehicle_id === id), [records, id]);
  const vParts = useMemo(() => vRecords.flatMap((r) => (r.parts ?? []).map((p) => ({ ...p, code: r.code }))), [vRecords]);
  const vTires = useMemo(() => tires.filter((t) => t.vehicle_id === id), [tires, id]);

  const totals = useMemo(
    () => ({
      manutencao: vRecords.filter((r) => r.status === "concluida").reduce((s, r) => s + maintenanceTotal(r), 0),
      combustivel: vFuelings.filter((f) => f.status === "valido").reduce((s, f) => s + Number(f.total_value ?? 0), 0),
      litros: vFuelings.filter((f) => f.status === "valido").reduce((s, f) => s + Number(f.quantity ?? 0), 0),
    }),
    [vRecords, vFuelings],
  );

  return (
    <>
      <PageHeader
        title={vehicle ? `Veículo ${vehicle.plate}` : "Veículo"}
        description={
          vehicle
            ? `${vehicle.brand ?? ""} ${vehicle.model ?? ""} · ${num(Number(vehicle.current_km ?? 0), 0)} km · ${label(
                VEHICLE_STATUS,
                vehicle.status,
              )}`
            : "Histórico completo do veículo."
        }
        action={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/veiculos">
              <ArrowLeft className="size-4" /> Voltar
            </Link>
          </Button>
        }
      />

      {!vehicle && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground shadow-card">
          <Truck className="mx-auto mb-2 size-6 opacity-50" />
          Veículo não encontrado neste órgão.
        </div>
      )}

      {vehicle && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Custo de manutenção", value: brl(totals.manutencao) },
              { label: "Gasto com combustível", value: brl(totals.combustivel) },
              { label: "Volume abastecido", value: num(totals.litros, 4) },
              { label: "Pneus instalados", value: String(vTires.filter((t) => t.status === "instalado").length) },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="gov-title mt-2 text-2xl">{c.value}</p>
              </div>
            ))}
          </div>

          <Tabs defaultValue="manutencoes">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="manutencoes">Manutenções</TabsTrigger>
              <TabsTrigger value="pecas">Peças</TabsTrigger>
              <TabsTrigger value="pneus">Pneus</TabsTrigger>
              <TabsTrigger value="abastecimentos">Abastecimentos</TabsTrigger>
              <TabsTrigger value="autorizacoes">Autorizações</TabsTrigger>
              <TabsTrigger value="utilizacoes">Utilizações</TabsTrigger>
              <TabsTrigger value="situacao">Situação</TabsTrigger>
            </TabsList>

            <TabsContent value="manutencoes">
              <HistTable
                head={["OS", "Tipo", "Entrada / saída", "Serviços", "Total", "Situação"]}
                empty="Nenhuma manutenção registrada."
                rows={vRecords.map((r) => [
                  r.code ?? "—",
                  label(MAINTENANCE_KINDS, r.kind),
                  `${dateTimeBR(r.entry_at)} → ${r.exit_at ? dateTimeBR(r.exit_at) : "em aberto"}`,
                  r.services,
                  brl(maintenanceTotal(r)),
                  label(MAINTENANCE_RECORD_STATUS, r.status),
                ])}
              />
            </TabsContent>

            <TabsContent value="pecas">
              <HistTable
                head={["Data", "OS", "Peça", "Qtd.", "Total", "Garantia"]}
                empty="Nenhuma peça aplicada."
                rows={vParts.map((p) => [
                  dateBR(p.installed_at),
                  p.code ?? "—",
                  p.description,
                  num(Number(p.quantity), 2),
                  brl(Number(p.total_value)),
                  p.warranty_until ? dateBR(p.warranty_until) : "—",
                ])}
              />
            </TabsContent>

            <TabsContent value="pneus">
              <HistTable
                head={["Código", "Marca / medida", "Posição", "Instalação", "KM acumulado", "Situação"]}
                empty="Nenhum pneu vinculado."
                rows={vTires.map((t) => [
                  t.code,
                  `${t.brand ?? "—"} ${t.size ?? ""}`,
                  t.position ?? "—",
                  t.install_date ? dateBR(t.install_date) : "—",
                  `${num(Number(t.accumulated_km ?? 0), 0)} km`,
                  label(TIRE_STATUS, t.status),
                ])}
              />
            </TabsContent>

            <TabsContent value="abastecimentos">
              <HistTable
                head={["Data", "Quantidade", "Valor unitário", "Total", "KM", "Situação"]}
                empty="Nenhum abastecimento registrado."
                rows={vFuelings.map((f) => [
                  dateTimeBR(f.fueled_at),
                  num(Number(f.quantity), 4),
                  brl(Number(f.unit_price)),
                  brl(Number(f.total_value ?? 0)),
                  f.odometer_km ? num(Number(f.odometer_km), 0) : "—",
                  f.status === "valido" ? "Válido" : "Cancelado",
                ])}
              />
            </TabsContent>

            <TabsContent value="autorizacoes">
              <HistTable
                head={["Código", "Validade", "Limite", "Consumido", "Situação", "Finalidade"]}
                empty="Nenhuma autorização emitida."
                rows={vAuths.map((a) => [
                  a.code ?? "—",
                  `${dateTimeBR(a.valid_from)} → ${dateTimeBR(a.valid_until)}`,
                  num(Number(a.max_quantity), 4),
                  num(Number(a.consumed_quantity), 4),
                  a.status,
                  a.purpose ?? "—",
                ])}
              />
            </TabsContent>

            <TabsContent value="utilizacoes">
              <HistTable
                head={["Código", "Saída prevista", "Destino", "KM inicial", "KM final", "Situação"]}
                empty="Nenhuma utilização registrada."
                rows={vUsages.map((u) => [
                  u.code ?? "—",
                  dateTimeBR(u.planned_departure),
                  u.destination ?? "—",
                  u.start_km ? num(Number(u.start_km), 0) : "—",
                  u.end_km ? num(Number(u.end_km), 0) : "—",
                  label(USAGE_STATUS, u.status),
                ])}
              />
            </TabsContent>

            <TabsContent value="situacao">
              <HistTable
                head={["Data", "De", "Para", "Origem", "Motivo", ""]}
                empty="Nenhuma mudança de situação registrada."
                rows={statusHistory.map((h) => [
                  dateTimeBR(h.created_at),
                  h.from_status ? label(VEHICLE_STATUS, h.from_status) : "—",
                  label(VEHICLE_STATUS, h.to_status),
                  h.source ?? "—",
                  h.reason ?? "—",
                  "",
                ])}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </>
  );
}

function HistTable({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((h, i) => (
              <TableHead key={i}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={head.length} className="py-10 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((c, j) => (
                <TableCell key={j} className="max-w-[280px] truncate text-sm">
                  {j === 0 ? <Badge variant="outline">{c}</Badge> : c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
