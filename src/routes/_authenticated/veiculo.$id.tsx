import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Truck } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { useDiaries, DIARY_STATUS } from "@/lib/diarias";
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
  onlyFuelRows,
  useFuelTypes,
  useVehicleCleanings,
  CLEANING_STATUS,
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
  const { data: fines = [] } = useTrafficFines();
  const { data: accidents = [] } = useAccidents();
  const { data: policies = [] } = useInsurancePolicies();
  const { data: obligations = [] } = useVehicleObligations();
  const { data: movements = [] } = useAssetMovements();
  const { data: diaries = [] } = useDiaries();
  const { data: cleanings = [] } = useVehicleCleanings(id);

  const vehicle = vehicles.find((v) => v.id === id) ?? null;
  const vUsages = useMemo(() => usages.filter((u) => u.vehicle_id === id), [usages, id]);
  const vFuelings = useMemo(() => fuelings.filter((f) => f.vehicle_id === id), [fuelings, id]);
  const vAuths = useMemo(() => auths.filter((a) => a.vehicle_id === id), [auths, id]);
  const vRecords = useMemo(() => records.filter((r) => r.vehicle_id === id), [records, id]);
  const vParts = useMemo(() => vRecords.flatMap((r) => (r.parts ?? []).map((p) => ({ ...p, code: r.code }))), [vRecords]);
  const vTires = useMemo(() => tires.filter((t) => t.vehicle_id === id), [tires, id]);
  const vFines = useMemo(() => fines.filter((f) => f.vehicle_id === id), [fines, id]);
  const vAccidents = useMemo(() => accidents.filter((a) => a.vehicle_id === id), [accidents, id]);
  const vObligations = useMemo(() => obligations.filter((o) => o.vehicle_id === id), [obligations, id]);
  const vMovements = useMemo(() => movements.filter((m) => m.vehicle_id === id), [movements, id]);
  const vDiaries = useMemo(() => diaries.filter((d) => d.vehicle_id === id), [diaries, id]);
  const vPolicies = useMemo(
    () => policies.filter((p) => (p.vehicles ?? []).some((iv) => iv.vehicle_id === id)),
    [policies, id],
  );

  const [cat, setCat] = useState("todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const timeline = useMemo(() => {
    const items: { at: string; cat: string; catLabel: string; title: string; detail: string; value: string }[] = [];
    const push = (
      at: string | null | undefined,
      c: string,
      cl: string,
      title: string,
      detail: string,
      value = "",
    ) => {
      if (at) items.push({ at, cat: c, catLabel: cl, title, detail, value });
    };

    vMovements.forEach((m) =>
      push(
        `${m.moved_on}T12:00:00`,
        "patrimonio",
        "Patrimônio",
        `${m.code ?? "MOV"} · ${label(ASSET_MOVEMENT_KINDS, m.kind)}`,
        [m.from_unit?.acronym ?? m.from_unit?.name, m.unit?.acronym ?? m.unit?.name ?? m.entity?.name]
          .filter(Boolean)
          .join(" → ") || (m.reason ?? "—"),
        m.book_value !== null ? brl(Number(m.book_value)) : "",
      ),
    );
    vDiaries.forEach((d) =>
      push(
        d.departure_at,
        "diaria",
        "Diárias",
        `${d.code ?? "RD"} · ${DIARY_STATUS[d.status]}`,
        `${d.beneficiary_name} — ${[d.destination_city, d.destination_state].filter(Boolean).join("/")}`,
        brl(Number(d.total_value || 0)),
      ),
    );
    vUsages.forEach((u) =>
      push(
        u.actual_departure ?? u.planned_departure,
        "utilizacao",
        "Utilização",
        `${u.code ?? "UTL"} · ${label(USAGE_STATUS, u.status)}`,
        u.destination ?? "—",
      ),
    );
    vFuelings.forEach((f) =>
      push(
        f.fueled_at,
        "abastecimento",
        "Abastecimento",
        `${num(Number(f.quantity), 4)} · ${f.status === "valido" ? "Válido" : "Cancelado"}`,
        f.odometer_km ? `${num(Number(f.odometer_km), 0)} km` : "—",
        brl(Number(f.total_value ?? 0)),
      ),
    );
    vAuths.forEach((a) =>
      push(a.valid_from, "autorizacao", "Autorização", `${a.code ?? "AUT"} · ${a.status}`, a.purpose ?? "—"),
    );
    cleanings.forEach((c) =>
      push(
        c.performed_at,
        "limpeza",
        "Limpeza",
        `${c.code ?? "LIMP"} · ${label(CLEANING_STATUS, c.status)}`,
        (c.service_types ?? []).join(", ") || "—",
        brl(Number(c.total_value ?? 0)),
      ),
    );
    vRecords.forEach((r) =>
      push(
        r.entry_at,
        "manutencao",
        "Manutenção",
        `${r.code ?? "MNT"} · ${label(MAINTENANCE_KINDS, r.kind)}`,
        r.services,
        brl(maintenanceTotal(r)),
      ),
    );
    vParts.forEach((p) =>
      push(
        p.installed_at ? `${p.installed_at}T12:00:00` : null,
        "peca",
        "Peça",
        p.description,
        `${num(Number(p.quantity), 2)} un. · OS ${p.code ?? "—"}`,
        brl(Number(p.total_value)),
      ),
    );
    vTires.forEach((t) =>
      push(
        t.install_date ? `${t.install_date}T12:00:00` : null,
        "pneu",
        "Pneu",
        `${t.code} · ${label(TIRE_STATUS, t.status)}`,
        `${t.brand ?? "—"} ${t.size ?? ""} · ${t.position ?? "sem posição"}`,
      ),
    );
    vAccidents.forEach((a) =>
      push(
        a.occurred_at,
        "sinistro",
        "Sinistro",
        `${a.code ?? "SIN"} · ${label(ACCIDENT_KINDS, a.kind)}`,
        a.description,
        a.expenses_value !== null ? brl(Number(a.expenses_value)) : "",
      ),
    );
    vFines.forEach((f) =>
      push(
        f.occurred_at,
        "multa",
        "Multa",
        `${f.code ?? "MUL"} · ${label(FINE_STATUS, f.status)}`,
        `${f.issuing_authority} · ${f.description}`,
        brl(Number(f.amount ?? 0)),
      ),
    );
    vPolicies.forEach((p) =>
      push(
        `${p.valid_from}T12:00:00`,
        "seguro",
        "Seguro",
        `Apólice ${p.policy_number}`,
        `${p.insurer_name} · vigência até ${dateBR(p.valid_to)}`,
        brl(Number(p.premium_value ?? 0)),
      ),
    );
    vObligations.forEach((o) =>
      push(
        o.due_date ? `${o.due_date}T12:00:00` : null,
        "obrigacao",
        "Obrigação legal",
        `${o.obligation_type} · ${label(OBLIGATION_STATUS, o.status)}`,
        o.document_number ?? "—",
        o.amount !== null ? brl(Number(o.amount)) : "",
      ),
    );
    statusHistory.forEach((h) =>
      push(
        h.created_at,
        "situacao",
        "Situação",
        `${h.from_status ? label(VEHICLE_STATUS, h.from_status) : "—"} → ${label(VEHICLE_STATUS, h.to_status)}`,
        h.reason ?? h.source ?? "—",
      ),
    );

    return items
      .filter((i) => cat === "todas" || i.cat === cat)
      .filter((i) => (!from || i.at >= from) && (!to || i.at <= `${to}T23:59:59`))
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [
    vMovements,
    vDiaries,
    vUsages,
    vFuelings,
    vAuths,
    vRecords,
    vParts,
    vTires,
    vAccidents,
    vFines,
    vPolicies,
    vObligations,
    statusHistory,
    cat,
    from,
    to,
  ]);

  const { data: fuelProducts = [] } = useFuelTypes();

  const totals = useMemo(
    () => ({
      manutencao: vRecords.filter((r) => r.status === "concluida").reduce((s, r) => s + maintenanceTotal(r), 0),
      combustivel: vFuelings.filter((f) => f.status === "valido").reduce((s, f) => s + Number(f.total_value ?? 0), 0),
      litros: onlyFuelRows(
        vFuelings.filter((f) => f.status === "valido"),
        fuelProducts,
      ).reduce((s, f) => s + Number(f.quantity ?? 0), 0),
    }),
    [vRecords, vFuelings, fuelProducts],
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

          <Tabs defaultValue="linha">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="linha">Linha do tempo</TabsTrigger>
              <TabsTrigger value="manutencoes">Manutenções</TabsTrigger>
              <TabsTrigger value="limpeza">Limpeza</TabsTrigger>
              <TabsTrigger value="pecas">Peças</TabsTrigger>
              <TabsTrigger value="pneus">Pneus</TabsTrigger>
              <TabsTrigger value="abastecimentos">Abastecimentos</TabsTrigger>
              <TabsTrigger value="autorizacoes">Autorizações</TabsTrigger>
              <TabsTrigger value="utilizacoes">Utilizações</TabsTrigger>
              <TabsTrigger value="diarias">Diárias</TabsTrigger>
              <TabsTrigger value="multas">Multas</TabsTrigger>
              <TabsTrigger value="sinistros">Sinistros</TabsTrigger>
              <TabsTrigger value="patrimonio">Patrimônio</TabsTrigger>
              <TabsTrigger value="obrigacoes">Obrigações</TabsTrigger>
              <TabsTrigger value="situacao">Situação</TabsTrigger>
            </TabsList>

            <TabsContent value="linha">
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Categoria</Label>
                  <Select value={cat} onValueChange={setCat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        ["todas", "Todas as categorias"],
                        ["patrimonio", "Movimentações patrimoniais"],
                        ["utilizacao", "Utilizações e reservas"],
                        ["diaria", "Diárias"],
                        ["abastecimento", "Abastecimentos"],
                        ["autorizacao", "Autorizações"],
                        ["manutencao", "Manutenções e OS"],
                        ["limpeza", "Limpeza"],
                        ["peca", "Peças"],
                        ["pneu", "Pneus"],
                        ["sinistro", "Acidentes e sinistros"],
                        ["multa", "Multas"],
                        ["seguro", "Seguros"],
                        ["obrigacao", "Obrigações legais"],
                        ["situacao", "Alterações de situação"],
                      ].map(([v, l]) => (
                        <SelectItem key={v} value={v!}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="from">De</Label>
                  <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="to">Até</Label>
                  <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <HistTable
                head={["Data", "Categoria", "Evento", "Detalhe", "Valor", ""]}
                empty="Nenhum evento no período selecionado."
                rows={timeline.map((i) => [dateTimeBR(i.at), i.catLabel, i.title, i.detail, i.value, ""])}
              />
            </TabsContent>

            <TabsContent value="limpeza">
              <HistTable
                head={["Código", "Data", "Serviços", "Fornecedor", "Valor", "Situação"]}
                empty="Nenhum serviço de limpeza registrado."
                rows={cleanings.map((c) => [
                  c.code ?? "—",
                  dateTimeBR(c.performed_at),
                  (c.service_types ?? []).join(", ") || "—",
                  c.supplier?.trade_name ?? c.supplier?.legal_name ?? "—",
                  brl(Number(c.total_value ?? 0)),
                  label(CLEANING_STATUS, c.status),
                ])}
              />
            </TabsContent>

            <TabsContent value="multas">
              <HistTable
                head={["Código", "Auto / órgão", "Data", "Descrição", "Valor", "Situação"]}
                empty="Nenhuma multa registrada."
                rows={vFines.map((f) => [
                  f.code ?? "—",
                  `${f.notice_number} · ${f.issuing_authority}`,
                  dateTimeBR(f.occurred_at),
                  f.description,
                  brl(Number(f.amount ?? 0)),
                  label(FINE_STATUS, f.status),
                ])}
              />
            </TabsContent>

            <TabsContent value="sinistros">
              <HistTable
                head={["Código", "Tipo", "Data", "Descrição", "Despesas", "Situação"]}
                empty="Nenhum sinistro registrado."
                rows={vAccidents.map((a) => [
                  a.code ?? "—",
                  label(ACCIDENT_KINDS, a.kind),
                  dateTimeBR(a.occurred_at),
                  a.description,
                  brl(Number(a.expenses_value ?? 0)),
                  a.status,
                ])}
              />
            </TabsContent>

            <TabsContent value="patrimonio">
              <HistTable
                head={["Código", "Tipo", "Data", "Origem → destino", "Ato", "Motivo"]}
                empty="Nenhuma movimentação patrimonial registrada."
                rows={vMovements.map((m) => [
                  m.code ?? "—",
                  label(ASSET_MOVEMENT_KINDS, m.kind),
                  dateBR(m.moved_on),
                  `${m.from_unit?.acronym ?? "—"} → ${m.unit?.acronym ?? m.entity?.name ?? "—"}`,
                  m.act_number ?? "—",
                  m.reason ?? "—",
                ])}
              />
            </TabsContent>

            <TabsContent value="obrigacoes">
              <HistTable
                head={["Obrigação", "Exercício", "Documento", "Vencimento", "Valor", "Situação"]}
                empty="Nenhuma obrigação registrada."
                rows={vObligations.map((o) => [
                  o.obligation_type,
                  String(o.exercise ?? "—"),
                  o.document_number ?? "—",
                  dateBR(o.due_date),
                  brl(Number(o.amount ?? 0)),
                  label(OBLIGATION_STATUS, o.status),
                ])}
              />
            </TabsContent>

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

            <TabsContent value="diarias">
              <HistTable
                head={["Código", "Beneficiário", "Destino", "Saída", "Retorno", "Valor total", "Situação"]}
                empty="Nenhuma diária vinculada a este veículo."
                rows={vDiaries.map((d) => [
                  d.code ?? "—",
                  d.beneficiary_name,
                  [d.destination_city, d.destination_state].filter(Boolean).join("/") || "—",
                  dateTimeBR(d.departure_at),
                  d.return_at ? dateTimeBR(d.return_at) : "—",
                  brl(Number(d.total_value || 0)),
                  DIARY_STATUS[d.status],
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
