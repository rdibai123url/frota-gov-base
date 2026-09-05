/**
 * FrotaGov — Painel de Ordens de Fornecimento (OFP) por contrato.
 *
 * Bloco 3: a OFP deixa de ser uma aba isolada e passa a nascer do contrato,
 * dentro de Peças e Acessórios e do Almoxarifado. O mesmo painel é usado nos
 * dois lugares, para que o recebimento seja acessível pelos dois caminhos.
 *
 * Regras aplicadas no servidor (banco): reserva do saldo contratual na
 * emissão, recebimento total/parcial sem ultrapassar o solicitado, devolução
 * do saldo bloqueado no cancelamento e trilha de auditoria. O frontend apenas
 * espelha e evita envios inválidos.
 */
import { useMemo, useState } from "react";
import { Ban, PackageCheck, PackagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseBRNumber } from "@/lib/format";
import {
  supplyStatusLabel,
  useSupplyOrderItems,
  useSupplyOrders,
  useWarehouses,
  type SupplyOrder,
} from "@/lib/almoxarifado";
import {
  brl,
  dateBR,
  dbMessage,
  num,
  supabase,
  useContracts,
  useInvalidate,
  usePerms,
  useUnits,
  type ContractItem,
  type ContractRow,
} from "@/lib/frotagov";
import { contractItemBalance } from "@/lib/rede";

const NONE = "__none__";

type Draft = { itemId: string; quantity: string };

const REFRESH = [
  "supply-orders",
  "supply-order-items",
  "contracts",
  "contract-items",
  "stock-balances",
  "stock-movements",
];

export function SupplyOrderPanel({
  kinds = ["peca", "pneu", "acessorio", "material", "servico"],
  title = "Itens do contrato e Ordens de Fornecimento",
}: {
  kinds?: string[];
  title?: string;
}) {
  const { canManageFleet, orgId, userId, userName } = usePerms();
  const invalidate = useInvalidate();
  const { data: contracts = [] } = useContracts();
  const { data: orders = [] } = useSupplyOrders();
  const { data: units = [] } = useUnits();
  const { data: warehouses = [] } = useWarehouses();

  const usable = useMemo(
    () =>
      contracts.filter(
        (c) =>
          (c.status === "vigente" || c.status === "suspenso") &&
          (c.items ?? []).some((i) => i.active && kinds.includes(String(i.material_kind ?? "material"))),
      ),
    [contracts, kinds],
  );

  const [contractId, setContractId] = useState<string>("");
  const contract: ContractRow | null = usable.find((c) => c.id === contractId) ?? null;
  const items = useMemo(
    () => (contract?.items ?? []).filter((i) => i.active && kinds.includes(String(i.material_kind ?? "material"))),
    [contract, kinds],
  );

  const contractOrders = useMemo(
    () => orders.filter((o) => o.contract_id === contractId),
    [orders, contractId],
  );

  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [place, setPlace] = useState("");
  const [unitId, setUnitId] = useState(NONE);
  const [warehouseId, setWarehouseId] = useState(NONE);
  const [deadline, setDeadline] = useState("");
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [receiving, setReceiving] = useState<SupplyOrder | null>(null);

  function openNew() {
    setDrafts([]);
    setPlace("");
    setUnitId(NONE);
    setWarehouseId(warehouses[0]?.id ?? NONE);
    setDeadline("");
    setJustification("");
    setOpen(true);
  }

  function toggleDraft(i: ContractItem) {
    setDrafts((cur) =>
      cur.some((d) => d.itemId === i.id)
        ? cur.filter((d) => d.itemId !== i.id)
        : [...cur, { itemId: i.id, quantity: "" }],
    );
  }

  async function submit() {
    if (!orgId || !contract) return;
    const rows = drafts
      .map((d) => ({ d, item: items.find((i) => i.id === d.itemId) }))
      .filter((r) => r.item) as { d: Draft; item: ContractItem }[];
    if (rows.length === 0) {
      toast.error("Selecione ao menos um item do contrato.");
      return;
    }
    for (const r of rows) {
      const q = parseBRNumber(r.d.quantity) ?? 0;
      const b = contractItemBalance(r.item);
      if (q <= 0) {
        toast.error(`Informe a quantidade do item ${r.item.description}.`);
        return;
      }
      if (q > b.available) {
        toast.error(
          `Quantidade acima do saldo disponível do item ${r.item.description} (${num(b.available, 2)}).`,
        );
        return;
      }
    }
    if (!place.trim()) {
      toast.error("Informe o endereço/local de entrega.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("supply_orders")
      .insert({
        organization_id: orgId,
        code: "",
        contract_id: contract.id,
        supplier_id: contract.supplier_id,
        unit_id: unitId === NONE ? null : unitId,
        warehouse_id: warehouseId === NONE ? null : warehouseId,
        expense_origin: "contrato" as const,
        delivery_place: place.trim(),
        deadline_at: deadline || null,
        justification: justification.trim() || null,
        requester_id: userId,
        requester_name: userName,
        created_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      setSaving(false);
      toast.error(dbMessage(error));
      return;
    }
    const { error: e2 } = await supabase.from("supply_order_items").insert(
      rows.map((r) => ({
        organization_id: orgId,
        supply_order_id: data.id,
        contract_item_id: r.item.id,
        part_id: null,
        description: r.item.description,
        measure_unit: r.item.measure_unit,
        quantity: parseBRNumber(r.d.quantity) ?? 0,
        unit_value: Number(r.item.unit_price ?? 0),
        created_by: userId,
      })),
    );
    if (e2) {
      setSaving(false);
      toast.error(dbMessage(e2));
      return;
    }
    const { error: e3 } = await supabase.rpc("issue_supply_order", { _order: data.id });
    setSaving(false);
    if (e3) {
      toast.error(dbMessage(e3));
      invalidate(REFRESH);
      return;
    }
    toast.success("OFP emitida. O quantitativo foi bloqueado no saldo do contrato.");
    setOpen(false);
    invalidate(REFRESH);
  }

  async function cancelBalance(o: SupplyOrder) {
    const reason = window.prompt("Motivo do cancelamento do saldo não entregue:");
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("cancel_supply_order_balance", {
      _order: o.id,
      _reason: reason.trim(),
    });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Saldo não entregue cancelado e devolvido ao contrato.");
    invalidate(REFRESH);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Contrato *</Label>
          <Select value={contractId} onValueChange={setContractId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o contrato para ver os itens" />
            </SelectTrigger>
            <SelectContent>
              {usable.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.number} — {c.object.slice(0, 60)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Itens operacionais não são cadastrados avulsos: eles vêm dos itens do contrato.
          </p>
        </div>
        <div className="flex items-end">
          {canManageFleet && contract && (
            <Button className="gap-2" onClick={openNew}>
              <PackagePlus className="size-4" /> Nova Ordem de Fornecimento (OFP)
            </Button>
          )}
        </div>
      </div>

      {!contract && (
        <p className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Selecione um contrato compatível para ver os itens contratados, saldos e emitir OFP.
        </p>
      )}

      {contract && (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">N°</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Marca / código / referência</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Contratada</TableHead>
                  <TableHead className="text-right">Valor unitário</TableHead>
                  <TableHead className="text-right">Valor total</TableHead>
                  <TableHead className="text-right">Recebida</TableHead>
                  <TableHead className="text-right">Bloqueada</TableHead>
                  <TableHead className="text-right">Disponível</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      O contrato selecionado não possui itens compatíveis.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((i) => {
                  const b = contractItemBalance(i);
                  return (
                    <TableRow key={i.id}>
                      <TableCell>{i.item_number ?? "—"}</TableCell>
                      <TableCell className="font-medium">{i.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[i.item_code, i.notes].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell>{i.measure_unit}</TableCell>
                      <TableCell className="text-right">{num(b.quantity, 2)}</TableCell>
                      <TableCell className="text-right">{brl(b.unit)}</TableCell>
                      <TableCell className="text-right">{brl(b.total)}</TableCell>
                      <TableCell className="text-right">{num(b.consumed, 2)}</TableCell>
                      <TableCell className="text-right">{num(b.reserved, 2)}</TableCell>
                      <TableCell className="text-right font-medium">{num(b.available, 2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Ordens de Fornecimento do contrato</h3>
            <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OFP</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhuma OFP emitida para este contrato.
                      </TableCell>
                    </TableRow>
                  )}
                  {contractOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono">{o.code}</TableCell>
                      <TableCell>{o.issued_at ? dateBR(o.issued_at) : "—"}</TableCell>
                      <TableCell className="text-sm">{o.delivery_place || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={o.status === "atendida" ? "default" : "secondary"}>
                          {supplyStatusLabel(o.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button variant="ghost" size="sm" className="gap-2" onClick={() => setReceiving(o)}>
                          <PackageCheck className="size-4" /> Receber
                        </Button>
                        {canManageFleet &&
                          o.status !== "atendida" &&
                          o.status !== "cancelada" &&
                          o.status !== "rejeitada" && (
                            <Button variant="ghost" size="sm" className="gap-2" onClick={() => void cancelBalance(o)}>
                              <Ban className="size-4" /> Cancelar saldo
                            </Button>
                          )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* Nova OFP */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Ordem de Fornecimento — contrato {contract?.number}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="ofp-place">Endereço / local de entrega *</Label>
                <Input
                  id="ofp-place"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Ex.: Almoxarifado central, Rua X, 100 — Centro"
                />
              </div>
              <div>
                <Label>Unidade solicitante</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Depósito de destino</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ofp-deadline">Prazo de entrega</Label>
                <Input
                  id="ofp-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="ofp-just">Justificativa</Label>
                <Textarea
                  id="ofp-just"
                  rows={2}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Disponível</TableHead>
                    <TableHead className="w-40 text-right">Quantidade solicitada</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => {
                    const b = contractItemBalance(i);
                    const draft = drafts.find((d) => d.itemId === i.id);
                    const q = parseBRNumber(draft?.quantity ?? "") ?? 0;
                    return (
                      <TableRow key={i.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${i.description}`}
                            checked={!!draft}
                            onChange={() => toggleDraft(i)}
                          />
                        </TableCell>
                        <TableCell>
                          {i.item_number ? `${i.item_number}. ` : ""}
                          {i.description}
                          <span className="block text-xs text-muted-foreground">
                            {i.measure_unit} · {brl(b.unit)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{num(b.available, 2)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            inputMode="decimal"
                            className="text-right"
                            disabled={!draft}
                            value={draft?.quantity ?? ""}
                            onChange={(e) =>
                              setDrafts((cur) =>
                                cur.map((d) => (d.itemId === i.id ? { ...d, quantity: e.target.value } : d)),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">{brl(q * b.unit)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Emitindo…" : "Emitir OFP e bloquear saldo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptDialog order={receiving} onClose={() => setReceiving(null)} />
    </div>
  );
}

/** Recebimento total ou parcial de uma OFP, com registro de nota fiscal. */
export function ReceiptDialog({ order, onClose }: { order: SupplyOrder | null; onClose: () => void }) {
  const { orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const { data: items = [] } = useSupplyOrderItems(order?.id ?? null);
  const { data: warehouses = [] } = useWarehouses();

  const [qty, setQty] = useState<Record<string, string>>({});
  const [invoice, setInvoice] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [warehouseId, setWarehouseId] = useState(NONE);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!order || !orgId) return;
    const rows = items
      .map((i) => ({ i, q: parseBRNumber(qty[i.id] ?? "") ?? 0 }))
      .filter((r) => r.q > 0);
    if (rows.length === 0) {
      toast.error("Informe a quantidade recebida de ao menos um item.");
      return;
    }
    for (const r of rows) {
      const pending =
        Number(r.i.quantity) - Number(r.i.delivered_quantity ?? 0) - Number(r.i.cancelled_quantity ?? 0);
      if (r.q > pending) {
        toast.error(`Quantidade acima do saldo em aberto do item ${r.i.description} (${num(pending, 2)}).`);
        return;
      }
    }
    setSaving(true);
    const wh = warehouseId === NONE ? order.warehouse_id : warehouseId;
    const { error } = await supabase.from("supply_order_receipts").insert(
      rows.map((r) => ({
        organization_id: orgId,
        supply_order_id: order.id,
        supply_order_item_id: r.i.id,
        warehouse_id: wh,
        quantity: r.q,
        unit_value: Number(r.i.unit_value ?? 0),
        invoice_number: invoice.trim() || null,
        invoice_date: invoiceDate || null,
        invoice_value: parseBRNumber(invoiceValue) ?? null,
        created_by: userId,
      })),
    );
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Recebimento registrado e estoque atualizado.");
    setQty({});
    setInvoice("");
    setInvoiceDate("");
    setInvoiceValue("");
    invalidate(REFRESH);
    onClose();
  }

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Recebimento da OFP {order?.code}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="nf">Nota fiscal</Label>
              <Input id="nf" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="nfd">Data da nota</Label>
              <Input id="nfd" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="nfv">Valor da nota</Label>
              <Input id="nfv" inputMode="decimal" value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} />
            </div>
            <div>
              <Label>Depósito</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Padrão da OFP</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Solicitado</TableHead>
                  <TableHead className="text-right">Já recebido</TableHead>
                  <TableHead className="text-right">Em aberto</TableHead>
                  <TableHead className="w-40 text-right">Recebendo agora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => {
                  const pending =
                    Number(i.quantity) - Number(i.delivered_quantity ?? 0) - Number(i.cancelled_quantity ?? 0);
                  return (
                    <TableRow key={i.id}>
                      <TableCell>{i.description}</TableCell>
                      <TableCell className="text-right">{num(Number(i.quantity), 2)}</TableCell>
                      <TableCell className="text-right">{num(Number(i.delivered_quantity ?? 0), 2)}</TableCell>
                      <TableCell className="text-right font-medium">{num(pending, 2)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          inputMode="decimal"
                          className="text-right"
                          disabled={pending <= 0}
                          value={qty[i.id] ?? ""}
                          onChange={(e) => setQty((cur) => ({ ...cur, [i.id]: e.target.value }))}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Recebimento parcial mantém o saldo restante em aberto e bloqueado no contrato. Recebimento total encerra a
            OFP. Não é possível receber acima do solicitado.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Registrando…" : "Registrar recebimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Botão de atalho para recebimento, usado no Almoxarifado. */
export function ReceiveOfpButton() {
  const { data: orders = [] } = useSupplyOrders();
  const [order, setOrder] = useState<SupplyOrder | null>(null);
  const [pick, setPick] = useState(false);
  const openOrders = orders.filter(
    (o) => o.status === "aprovada" || o.status === "parcialmente_atendida",
  );

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setPick(true)}>
        <PackageCheck className="size-4" /> Receber OFP
      </Button>
      <Dialog open={pick} onOpenChange={setPick}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Selecionar OFP para recebimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {openOrders.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma OFP em aberto para recebimento.</p>
            )}
            {openOrders.map((o) => (
              <Button
                key={o.id}
                variant="outline"
                className="w-full justify-between"
                onClick={() => {
                  setOrder(o);
                  setPick(false);
                }}
              >
                <span className="font-mono">{o.code}</span>
                <span className="text-xs text-muted-foreground">{supplyStatusLabel(o.status)}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <ReceiptDialog order={order} onClose={() => setOrder(null)} />
    </>
  );
}

export const OFP_ICONS = { Plus, Trash2 };
