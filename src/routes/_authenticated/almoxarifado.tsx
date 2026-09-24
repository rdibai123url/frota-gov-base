import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Boxes, ClipboardCheck, Plus, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { ReceiveOfpButton } from "@/components/ofp-panel";
import { ListPagination, usePaged } from "@/components/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpInlineButton } from "@/components/help-button";
import { Textarea } from "@/components/ui/textarea";
import { parseBRNumber } from "@/lib/format";
import {
  EXPENSE_ORIGINS,
  MOVEMENT_KINDS,
  movementDirection,
  movementLabel,
  rpcArgs,
  useInventories,
  useInventoryItems,
  useStockBalances,
  useStockMovements,
  useStockReservations,
  useWarehouses,
  type ExpenseOrigin,
  type StockMovementKind,
} from "@/lib/almoxarifado";
import {
  brl,
  dateTimeBR,
  dbMessage,
  num,
  supabase,
  useInvalidate,
  usePartsCatalog,
  usePerms,
  useUnits,
  useVehicles,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/almoxarifado")({
  head: () => ({
    meta: [
      { title: "Almoxarifado — FrotaGov" },
      {
        name: "description",
        content:
          "Controle de depósitos, saldos, entradas, saídas, transferências, reservas e inventário de peças e materiais da frota pública.",
      },
      { property: "og:title", content: "Almoxarifado — FrotaGov" },
      { property: "og:description", content: "Posição de estoque, movimentações e inventário de peças e materiais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Almoxarifado,
});

const NONE = "__none__";

function Almoxarifado() {
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const { data: warehouses = [] } = useWarehouses();
  const { data: balances = [] } = useStockBalances();
  const { data: movements = [] } = useStockMovements();
  const { data: reservations = [] } = useStockReservations();
  const { data: inventories = [] } = useInventories();
  const { data: parts = [] } = usePartsCatalog();
  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();

  const [tab, setTab] = useState("posicao");
  const [whOpen, setWhOpen] = useState(false);
  const [wh, setWh] = useState({ name: "", code: "", unit_id: NONE, address: "", responsible_name: "" });
  const [moveOpen, setMoveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);

  const partLabel = useMemo(() => {
    const map = new Map<string, string>();
    parts.forEach((p) => map.set(p.id, `${p.internal_code ? p.internal_code + " — " : ""}${p.description}`));
    return map;
  }, [parts]);
  const whLabel = useMemo(() => {
    const map = new Map<string, string>();
    warehouses.forEach((w) => map.set(w.id, w.name));
    return map;
  }, [warehouses]);
  const vehicleLabel = useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach((v) => map.set(v.id, v.plate ?? v.asset_code ?? "—"));
    return map;
  }, [vehicles]);

  const pagedBalances = usePaged(balances);
  const pagedMovements = usePaged(movements);

  const totals = useMemo(
    () => ({
      itens: balances.length,
      quantidade: balances.reduce((s, b) => s + Number(b.quantity ?? 0), 0),
      valor: balances.reduce((s, b) => s + Number(b.quantity ?? 0) * Number(b.average_cost ?? 0), 0),
      abaixoMinimo: balances.filter((b) => b.min_quantity != null && Number(b.quantity) < Number(b.min_quantity))
        .length,
    }),
    [balances],
  );

  async function saveWarehouse() {
    if (!orgId || !wh.name.trim()) {
      toast.error("Informe o nome do almoxarifado");
      return;
    }
    const { error } = await supabase.from("warehouses").insert({
      organization_id: orgId,
      name: wh.name.trim(),
      code: wh.code.trim() || null,
      unit_id: wh.unit_id === NONE ? null : wh.unit_id,
      address: wh.address.trim() || null,
      responsible_name: wh.responsible_name.trim() || null,
      created_by: userId,
    });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Almoxarifado cadastrado");
    setWhOpen(false);
    setWh({ name: "", code: "", unit_id: NONE, address: "", responsible_name: "" });
    invalidate(["warehouses"]);
  }

  return (
    <div>
      <PageHeader
        title="Almoxarifado"
        description="Depósitos, saldos por item e lote, entradas, saídas, transferências, reservas e inventário físico. A entrada por compra nasce do recebimento da OFP; entradas excepcionais (saldo inicial, devolução, doação, ajuste e correção) exigem justificativa e ficam registradas na auditoria."
        action={
          canManageFleet ? (
            <div className="flex flex-wrap gap-2">
              <ReceiveOfpButton />
              <Button variant="outline" onClick={() => setWhOpen(true)}>
                <WarehouseIcon className="mr-2 h-4 w-4" /> Novo depósito
              </Button>
              <Button variant="outline" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="mr-2 h-4 w-4" /> Transferir
              </Button>
              <Button variant="outline" onClick={() => setReserveOpen(true)}>
                Reservar
              </Button>
              <Button onClick={() => setMoveOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Movimentar
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="gov-card p-4">
          <div className="text-xs text-muted-foreground">Itens em estoque</div>
          <div className="text-2xl font-semibold">{totals.itens}</div>
        </div>
        <div className="gov-card p-4">
          <div className="text-xs text-muted-foreground">Quantidade total</div>
          <div className="text-2xl font-semibold">{num(totals.quantidade, 2)}</div>
        </div>
        <div className="gov-card p-4">
          <div className="text-xs text-muted-foreground">Valor estimado</div>
          <div className="text-2xl font-semibold">{brl(totals.valor)}</div>
        </div>
        <div className="gov-card p-4">
          <div className="text-xs text-muted-foreground">Abaixo do estoque mínimo</div>
          <div className="text-2xl font-semibold">{totals.abaixoMinimo}</div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="posicao">
            <Boxes className="mr-2 h-4 w-4" /> Posição de estoque
          </TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
          <TabsTrigger value="reservas">Reservas</TabsTrigger>
          <TabsTrigger value="inventario">
            <ClipboardCheck className="mr-2 h-4 w-4" /> Inventário
          </TabsTrigger>
          <TabsTrigger value="depositos">Depósitos</TabsTrigger>
        </TabsList>

        <TabsContent value="posicao">
          <div className="gov-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Disponível</TableHead>
                  <TableHead className="text-right">Custo médio</TableHead>
                  <TableHead>Localização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      Nenhum saldo registrado.
                    </TableCell>
                  </TableRow>
                )}
                {pagedBalances.rows.map((b) => {
                  const low = b.min_quantity != null && Number(b.quantity) < Number(b.min_quantity);
                  return (
                    <TableRow key={b.id}>
                      <TableCell>
                        {partLabel.get(b.part_id) ?? "—"}
                        {low && (
                          <Badge className="ml-2" variant="destructive">
                            Abaixo do mínimo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{whLabel.get(b.warehouse_id) ?? "—"}</TableCell>
                      <TableCell>{b.lot || "—"}</TableCell>
                      <TableCell className="text-right">{num(b.quantity, 4)}</TableCell>
                      <TableCell className="text-right">{num(b.reserved_quantity, 4)}</TableCell>
                      <TableCell className="text-right">
                        {num(Number(b.quantity) - Number(b.reserved_quantity), 4)}
                      </TableCell>
                      <TableCell className="text-right">{brl(b.average_cost)}</TableCell>
                      <TableCell>{b.location ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <ListPagination state={pagedBalances} />
          </div>
        </TabsContent>

        <TabsContent value="movimentacoes">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <HelpInlineButton topicKey="/almoxarifado/transferencias" />
            <span>Ajuda sobre transferências entre depósitos</span>
          </div>
          <div className="gov-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Origem do custeio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      Nenhuma movimentação registrada.
                    </TableCell>
                  </TableRow>
                )}
                {pagedMovements.rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{dateTimeBR(m.occurred_at)}</TableCell>
                    <TableCell>
                      <Badge variant={movementDirection(m.kind) === "in" ? "default" : "secondary"}>
                        {movementLabel(m.kind)}
                      </Badge>
                    </TableCell>
                    <TableCell>{partLabel.get(m.part_id) ?? "—"}</TableCell>
                    <TableCell>{whLabel.get(m.warehouse_id) ?? "—"}</TableCell>
                    <TableCell>{m.vehicle_id ? (vehicleLabel.get(m.vehicle_id) ?? "—") : "—"}</TableCell>
                    <TableCell className="text-right">
                      {movementDirection(m.kind) === "in" ? "+" : "−"}
                      {num(m.quantity, 4)}
                    </TableCell>
                    <TableCell className="text-right">{brl(m.total_value)}</TableCell>
                    <TableCell>
                      {EXPENSE_ORIGINS.find((o) => o.value === m.expense_origin)?.label ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination state={pagedMovements} />
          </div>
        </TabsContent>

        <TabsContent value="reservas">
          <div className="gov-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Consumido</TableHead>
                  <TableHead className="text-right">Liberado</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      Nenhuma reserva registrada.
                    </TableCell>
                  </TableRow>
                )}
                {reservations.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{partLabel.get(r.part_id) ?? "—"}</TableCell>
                    <TableCell>{whLabel.get(r.warehouse_id) ?? "—"}</TableCell>
                    <TableCell className="text-right">{num(r.quantity, 4)}</TableCell>
                    <TableCell className="text-right">{num(r.consumed_quantity, 4)}</TableCell>
                    <TableCell className="text-right">{num(r.released_quantity, 4)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "ativa" ? "default" : "secondary"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {canManageFleet && r.status === "ativa" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const v = window.prompt("Quantidade a consumir:");
                              if (v === null) return;

                              const q = parseBRNumber(v);
                              if (!(q > 0)) {
                                toast.error("Informe uma quantidade maior que zero.");
                                return;
                              }

                              const pending =
                                Number(r.quantity) -
                                Number(r.consumed_quantity) -
                                Number(r.released_quantity);

                              if (q > pending + 0.00005) {
                                toast.error(`A quantidade não pode ser maior que o saldo reservado (${num(pending, 4)}).`);
                                return;
                              }

                              const { error } = await supabase.rpc(
                                "stock_reservation_settle",
                                rpcArgs({ _reservation: r.id, _consume: q, _reason: "Consumo de reserva" }),
                              );
                              if (error) {
                                toast.error(dbMessage(error));
                                return;
                              }
                              toast.success("Consumo registrado");
                              invalidate(["stock-reservations", "stock-balances", "stock-movements"]);
                            }}
                          >
                            Consumir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const v = window.prompt("Quantidade a liberar:");
                              if (v === null) return;

                              const q = parseBRNumber(v);
                              if (!(q > 0)) {
                                toast.error("Informe uma quantidade maior que zero.");
                                return;
                              }

                              const pending =
                                Number(r.quantity) -
                                Number(r.consumed_quantity) -
                                Number(r.released_quantity);

                              if (q > pending + 0.00005) {
                                toast.error(`A quantidade não pode ser maior que o saldo reservado (${num(pending, 4)}).`);
                                return;
                              }

                              const { error } = await supabase.rpc(
                                "stock_reservation_settle",
                                rpcArgs({ _reservation: r.id, _release: q, _reason: "Liberação de reserva" }),
                              );
                              if (error) {
                                toast.error(dbMessage(error));
                                return;
                              }
                              toast.success("Reserva liberada");
                              invalidate(["stock-reservations", "stock-balances"]);
                            }}
                          >
                            Liberar
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="inventario">
          <InventoryPanel warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} partLabel={partLabel} />
        </TabsContent>

        <TabsContent value="depositos">
          <div className="gov-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehouses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Nenhum depósito cadastrado.
                    </TableCell>
                  </TableRow>
                )}
                {warehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell>{w.code ?? "—"}</TableCell>
                    <TableCell>{units.find((u) => u.id === w.unit_id)?.name ?? "—"}</TableCell>
                    <TableCell>{w.responsible_name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={w.active ? "default" : "secondary"}>{w.active ? "Ativo" : "Inativo"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* depósito */}
      <Dialog open={whOpen} onOpenChange={setWhOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo depósito</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Nome *</Label>
              <Input value={wh.name} onChange={(e) => setWh({ ...wh, name: e.target.value })} />
            </div>
            <div>
              <Label>Código</Label>
              <Input value={wh.code} onChange={(e) => setWh({ ...wh, code: e.target.value })} />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={wh.unit_id} onValueChange={(v) => setWh({ ...wh, unit_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não vinculado</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={wh.address} onChange={(e) => setWh({ ...wh, address: e.target.value })} />
            </div>
            <div>
              <Label>Responsável</Label>
              <Input
                value={wh.responsible_name}
                onChange={(e) => setWh({ ...wh, responsible_name: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveWarehouse}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MovementDialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        parts={parts.map((p) => ({ id: p.id, label: partLabel.get(p.id) ?? p.description }))}
        vehicles={vehicles.map((v) => ({ id: v.id, label: v.plate ?? v.asset_code ?? "—" }))}
      />

      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        parts={parts.map((p) => ({ id: p.id, label: partLabel.get(p.id) ?? p.description }))}
      />

      <ReserveDialog
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        parts={parts.map((p) => ({ id: p.id, label: partLabel.get(p.id) ?? p.description }))}
      />
    </div>
  );
}

/* ----------------------------- movimentação ----------------------------- */

function MovementDialog({
  open,
  onClose,
  warehouses,
  parts,
  vehicles,
}: {
  open: boolean;
  onClose: () => void;
  warehouses: { id: string; name: string }[];
  parts: { id: string; label: string }[];
  vehicles: { id: string; label: string }[];
}) {
  const invalidate = useInvalidate();
  const [f, setF] = useState({
    warehouse: "",
    part: "",
    kind: "entrada_compra" as StockMovementKind,
    quantity: "",
    unit_value: "",
    lot: "",
    vehicle: NONE,
    odometer: "",
    hour_meter: "",
    document: "",
    origin: "contrato" as ExpenseOrigin,
    reason: "",
    override: "",
  });
  const [busy, setBusy] = useState(false);
  const isOut = movementDirection(f.kind) === "out";

  async function save() {
    const q = parseBRNumber(f.quantity);
    if (!f.warehouse || !f.part || !q) {
      toast.error("Informe depósito, item e quantidade");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc(
      "stock_move",
      rpcArgs({
        _warehouse: f.warehouse,
        _part: f.part,
        _kind: f.kind,
        _quantity: q,
        _unit_value: parseBRNumber(f.unit_value) ?? 0,
        _lot: f.lot.trim(),
        _vehicle: f.vehicle === NONE ? undefined : f.vehicle,
        _odometer: parseBRNumber(f.odometer) ?? undefined,
        _hour_meter: parseBRNumber(f.hour_meter) ?? undefined,
        _document: f.document.trim() || undefined,
        _reason: f.reason.trim() || undefined,
        _expense_origin: f.origin,
        _override_justification: f.override.trim() || undefined,
      }),
    );
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Movimentação registrada");
    onClose();
    invalidate(["stock-balances", "stock-movements", "maintenance-parts", "compatibility-overrides"]);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Movimentação de estoque</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo *</Label>
            <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v as StockMovementKind })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_KINDS.filter((k) => k.value !== "estorno").map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Depósito *</Label>
            <Select value={f.warehouse} onValueChange={(v) => setF({ ...f, warehouse: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Item *</Label>
            <Select value={f.part} onValueChange={(v) => setF({ ...f, part: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a peça ou material" />
              </SelectTrigger>
              <SelectContent>
                {parts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade *</Label>
            <Input value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
          </div>
          <div>
            <Label>Valor unitário</Label>
            <Input value={f.unit_value} onChange={(e) => setF({ ...f, unit_value: e.target.value })} />
          </div>
          <div>
            <Label>Lote</Label>
            <Input value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value })} />
          </div>
          <div>
            <Label>Origem do custeio</Label>
            <Select value={f.origin} onValueChange={(v) => setF({ ...f, origin: v as ExpenseOrigin })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_ORIGINS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isOut && (
            <>
              <div>
                <Label>Ativo (aplicação)</Label>
                <Select value={f.vehicle} onValueChange={(v) => setF({ ...f, vehicle: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem ativo</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hodômetro</Label>
                <Input value={f.odometer} onChange={(e) => setF({ ...f, odometer: e.target.value })} />
              </div>
              <div>
                <Label>Horímetro</Label>
                <Input value={f.hour_meter} onChange={(e) => setF({ ...f, hour_meter: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Justificativa para peça incompatível (somente se necessário)</Label>
                <Input value={f.override} onChange={(e) => setF({ ...f, override: e.target.value })} />
              </div>
            </>
          )}
          <div>
            <Label>Documento</Label>
            <Input value={f.document} onChange={(e) => setF({ ...f, document: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Transferência entre depósitos com um ou vários itens.
 * Todos os itens são enviados ao banco em uma única transação atômica,
 * que valida saldos e registra as movimentações auditadas.
 */
function TransferDialog({
  open,
  onClose,
  warehouses,
  parts,
}: {
  open: boolean;
  onClose: () => void;
  warehouses: { id: string; name: string }[];
  parts: { id: string; label: string }[];
}) {
  const invalidate = useInvalidate();
  const [f, setF] = useState({ from: "", to: "", reason: "" });
  const [rows, setRows] = useState<{ key: string; part: string; quantity: string; lot: string }[]>([
    { key: crypto.randomUUID(), part: "", quantity: "", lot: "" },
  ]);
  const [saving, setSaving] = useState(false);

  function update(key: string, patch: Partial<{ part: string; quantity: string; lot: string }>) {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    const valid = rows.filter((r) => r.part && (parseBRNumber(r.quantity) ?? 0) > 0);
    if (!f.from || !f.to || valid.length === 0) {
      toast.error("Informe origem, destino e ao menos um item com quantidade");
      return;
    }
    if (f.from === f.to) {
      toast.error("Origem e destino devem ser diferentes");
      return;
    }

    setSaving(true);

    /*
     * Todos os itens são enviados ao banco em uma única transação.
     * Se qualquer item falhar, nenhuma transferência do lote é gravada.
     *
     * O cast é temporário até a próxima regeneração dos tipos TypeScript
     * do Supabase incluir a RPC stock_transfer_batch.
     */
    const callRpc = supabase.rpc as unknown as (
      functionName: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: number | null; error: { message: string } | null }>;

    const { data, error } = await callRpc("stock_transfer_batch", {
      _from: f.from,
      _to: f.to,
      _items: valid.map((r) => ({
        part_id: r.part,
        quantity: parseBRNumber(r.quantity) ?? 0,
        lot: r.lot.trim(),
      })),
      _reason: f.reason.trim() || null,
    });

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const transferred = Number(data ?? valid.length);
    toast.success(
      `Transferência realizada (${transferred} ${transferred === 1 ? "item" : "itens"})`,
    );

    setRows([{ key: crypto.randomUUID(), part: "", quantity: "", lot: "" }]);
    onClose();
    invalidate(["stock-balances", "stock-movements"]);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transferência entre depósitos</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Unidade / depósito de origem *</Label>
              <Select value={f.from} onValueChange={(v) => setF({ ...f, from: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade / depósito de destino *</Label>
              <Select value={f.to} onValueChange={(v) => setF({ ...f, to: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Itens *</Label>
            {rows.map((r) => (
              <div key={r.key} className="grid gap-2 sm:grid-cols-[1fr_120px_120px_40px]">
                <Select value={r.part} onValueChange={(v) => update(r.key, { part: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Item" />
                  </SelectTrigger>
                  <SelectContent>
                    {parts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Quantidade"
                  inputMode="decimal"
                  value={r.quantity}
                  onChange={(e) => update(r.key, { quantity: e.target.value })}
                />
                <Input placeholder="Lote" value={r.lot} onChange={(e) => update(r.key, { lot: e.target.value })} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover item"
                  disabled={rows.length === 1}
                  onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((cur) => [...cur, { key: crypto.randomUUID(), part: "", quantity: "", lot: "" }])
              }
            >
              Incluir item
            </Button>
          </div>

          <div>
            <Label>Motivo</Label>
            <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Transferindo…" : "Transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReserveDialog({
  open,
  onClose,
  warehouses,
  parts,
}: {
  open: boolean;
  onClose: () => void;
  warehouses: { id: string; name: string }[];
  parts: { id: string; label: string }[];
}) {
  const invalidate = useInvalidate();
  const [f, setF] = useState({ warehouse: "", part: "", quantity: "", lot: "", reason: "" });

  async function save() {
    const q = parseBRNumber(f.quantity);
    if (!f.warehouse || !f.part || !q) {
      toast.error("Informe depósito, item e quantidade");
      return;
    }
    const { error } = await supabase.rpc(
      "stock_reserve",
      rpcArgs({
        _warehouse: f.warehouse,
        _part: f.part,
        _quantity: q,
        _lot: f.lot.trim(),
        _reason: f.reason.trim() || undefined,
      }),
    );
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Reserva registrada");
    onClose();
    invalidate(["stock-balances", "stock-reservations"]);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reserva de estoque</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Depósito *</Label>
            <Select value={f.warehouse} onValueChange={(v) => setF({ ...f, warehouse: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Item *</Label>
            <Select value={f.part} onValueChange={(v) => setF({ ...f, part: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {parts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade *</Label>
            <Input value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
          </div>
          <div>
            <Label>Lote</Label>
            <Input value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value })} />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Reservar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- inventário ------------------------------- */

function InventoryPanel({
  warehouses,
  partLabel,
}: {
  warehouses: { id: string; name: string }[];
  partLabel: Map<string, string>;
}) {
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const { data: inventories = [] } = useInventories();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: items = [] } = useInventoryItems(selected);
  const { data: balances = [] } = useStockBalances();
  const [warehouse, setWarehouse] = useState("");

  async function open() {
    if (!orgId || !warehouse) {
      toast.error("Selecione o depósito");
      return;
    }
    const { data, error } = await supabase
      .from("inventories")
      .insert({ organization_id: orgId, warehouse_id: warehouse, code: "", created_by: userId })
      .select("id")
      .single();
    if (error || !data) {
      toast.error(dbMessage(error));
      return;
    }
    const rows = balances
      .filter((b) => b.warehouse_id === warehouse)
      .map((b) => ({
        organization_id: orgId,
        inventory_id: data.id,
        part_id: b.part_id,
        lot: b.lot,
        system_quantity: Number(b.quantity),
      }));
    if (rows.length) await supabase.from("inventory_items").insert(rows);
    toast.success("Inventário aberto com a posição atual do depósito");
    setSelected(data.id);
    invalidate(["inventories", "inventory-items"]);
  }

  async function saveCount(id: string, counted: string, justification: string) {
    const raw = counted.trim();
    const q = raw === "" ? null : parseBRNumber(raw);
  
    if (q !== null && (q === undefined || q < 0)) {
      toast.error("A quantidade contada não pode ser negativa.");
      return;
    }
  
    const { error } = await supabase
      .from("inventory_items")
      .update({
        counted_quantity: raw === "" ? null : q,
        justification: justification.trim() || null,
      })
      .eq("id", id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    invalidate(["inventory-items"]);
  }

  async function apply() {
    if (!selected) return;
    const { data, error } = await supabase.rpc("inventory_apply", { _inventory: selected });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(`Inventário finalizado. ${data ?? 0} ajuste(s) aplicado(s).`);
    invalidate(["inventories", "inventory-items", "stock-balances", "stock-movements"]);
  }

  return (
    <div className="space-y-4">
      {canManageFleet && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Label>Depósito</Label>
            <Select value={warehouse} onValueChange={setWarehouse}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={open}>Abrir inventário</Button>
        </div>
      )}

      <div className="gov-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Depósito</TableHead>
              <TableHead>Abertura</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventories.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Nenhum inventário registrado.
                </TableCell>
              </TableRow>
            )}
            {inventories.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono">{i.code}</TableCell>
                <TableCell>{warehouses.find((w) => w.id === i.warehouse_id)?.name ?? "—"}</TableCell>
                <TableCell>{dateTimeBR(i.opened_at)}</TableCell>
                <TableCell>
                  <Badge variant={i.status === "finalizado" ? "secondary" : "default"}>{i.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setSelected(i.id)}>
                    Contagem
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <div className="gov-card space-y-3 overflow-hidden p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead>Contado</TableHead>
                <TableHead className="text-right">Divergência</TableHead>
                <TableHead>Justificativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <InventoryRow key={it.id} item={it} partLabel={partLabel} onSave={saveCount} />
              ))}
            </TableBody>
          </Table>
          {canManageFleet && <Button onClick={apply}>Finalizar e ajustar estoque</Button>}
        </div>
      )}
    </div>
  );
}

function InventoryRow({
  item,
  partLabel,
  onSave,
}: {
  item: ReturnType<typeof useInventoryItems>["data"] extends (infer T)[] | undefined ? T : never;
  partLabel: Map<string, string>;
  onSave: (id: string, counted: string, justification: string) => void;
}) {
  const [counted, setCounted] = useState(item.counted_quantity != null ? String(item.counted_quantity) : "");
  const [justification, setJustification] = useState(item.justification ?? "");
  return (
    <TableRow>
      <TableCell>{partLabel.get(item.part_id) ?? "—"}</TableCell>
      <TableCell className="text-right">{num(item.system_quantity, 4)}</TableCell>
      <TableCell>
        <Input
          className="w-28"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          onBlur={() => onSave(item.id, counted, justification)}
        />
      </TableCell>
      <TableCell className="text-right">{num(item.difference, 4)}</TableCell>
      <TableCell>
        <Input
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          onBlur={() => onSave(item.id, counted, justification)}
        />
      </TableCell>
    </TableRow>
  );
}
