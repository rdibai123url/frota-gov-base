import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ban, FileCheck2, PackagePlus, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { ListPagination, usePaged } from "@/components/list-pagination";
import { ItemHistoryInput } from "@/components/item-history-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseBRNumber } from "@/lib/format";
import { usePartners } from "@/lib/credenciados";
import {
  EXPENSE_ORIGINS,
  checkCompatibility,
  rpcArgs,
  supplyStatusLabel,
  supplyStatusTone,
  useSupplyOrderItems,
  useSupplyOrders,
  useWarehouses,
  type ExpenseOrigin,
} from "@/lib/almoxarifado";
import {
  brl,
  dateBR,
  dbMessage,
  num,
  supabase,
  useContractItems,
  useContracts,
  useCostCenters,
  useInvalidate,
  usePartsCatalog,
  usePerms,
  useSuppliers,
  useUnits,
  useVehicles,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/ofp")({
  head: () => ({
    meta: [
      { title: "Ordens de Fornecimento de Peças — FrotaGov" },
      {
        name: "description",
        content:
          "Emissão e acompanhamento de Ordens de Fornecimento de Peças (OFP), separadas da Ordem de Serviço, com itens, reserva orçamentária, atendimento parcial e conferência.",
      },
      { property: "og:title", content: "Ordens de Fornecimento de Peças — FrotaGov" },
      { property: "og:description", content: "Fluxo completo de fornecimento de peças e materiais da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OFP,
});

const NONE = "__none__";

type ItemDraft = { part_id: string; description: string; quantity: string; unit_value: string; measure_unit: string };

function OFP() {
  const { canManageFleet, orgId, userName } = usePerms();
  const invalidate = useInvalidate();
  const { data: orders = [], isLoading } = useSupplyOrders();
  const { data: partners = [] } = usePartners();
  const { data: suppliers = [] } = useSuppliers();
  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();
  const { data: parts = [] } = usePartsCatalog();
  const { data: contracts = [] } = useContracts();
  const { data: contractItems = [] } = useContractItems();
  const { data: costCenters = [] } = useCostCenters();
  const { data: warehouses = [] } = useWarehouses();

  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const { data: items = [] } = useSupplyOrderItems(detail);
  const paged = usePaged(orders);

  const [form, setForm] = useState({
    unit_id: NONE,
    vehicle_id: NONE,
    partner_id: NONE,
    supplier_id: NONE,
    expense_origin: "contrato" as ExpenseOrigin,
    contract_id: NONE,
    contract_item_id: NONE,
    cost_center_id: NONE,
    deadline_at: "",
    delivery_place: "",
    justification: "",
  });
  const [drafts, setDrafts] = useState<ItemDraft[]>([
    { part_id: NONE, description: "", quantity: "", unit_value: "", measure_unit: "unidade" },
  ]);

  const partnerLabel = useMemo(() => {
    const map = new Map<string, string>();
    partners.forEach((p) => map.set(p.id, p.trade_name || p.legal_name));
    return map;
  }, [partners]);
  const order = orders.find((o) => o.id === detail) ?? null;

  async function create() {
    if (!orgId) return;

    const rows = drafts.filter((d) => d.description.trim() && parseBRNumber(d.quantity));
    if (!rows.length) {
      toast.error("Inclua ao menos um item com descrição e quantidade");
      return;
    }

    if (form.vehicle_id !== NONE) {
      for (const d of rows) {
        if (d.part_id === NONE) continue;
        const ok = await checkCompatibility(d.part_id, form.vehicle_id);
        if (!ok) {
          toast.warning(`Atenção: "${d.description}" não consta como compatível com o ativo selecionado.`);
        }
      }
    }

    /*
     * A criação da OFP e de todos os seus itens acontece em uma única
     * transação no banco. Se qualquer item falhar, nenhuma parte da OFP
     * fica gravada.
     *
     * O cast abaixo é temporário até a próxima regeneração dos tipos
     * TypeScript do Supabase incluir a RPC supply_order_create.
     */
    const callRpc = supabase.rpc as unknown as (
      functionName: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: string | null; error: { message: string } | null }>;

    const { data, error } = await callRpc("supply_order_create", {
      _unit_id: form.unit_id === NONE ? null : form.unit_id,
      _vehicle_id: form.vehicle_id === NONE ? null : form.vehicle_id,
      _partner_id: form.partner_id === NONE ? null : form.partner_id,
      _supplier_id: form.supplier_id === NONE ? null : form.supplier_id,
      _expense_origin: form.expense_origin,
      _contract_id: form.contract_id === NONE ? null : form.contract_id,
      _contract_item_id: form.contract_item_id === NONE ? null : form.contract_item_id,
      _cost_center_id: form.cost_center_id === NONE ? null : form.cost_center_id,
      _deadline_at: form.deadline_at || null,
      _delivery_place: form.delivery_place.trim() || null,
      _justification: form.justification.trim() || null,
      _requester_name: userName || null,
      _items: rows.map((d) => ({
        part_id: d.part_id === NONE ? null : d.part_id,
        description: d.description.trim(),
        measure_unit: d.measure_unit,
        quantity: parseBRNumber(d.quantity) ?? 0,
        unit_value: parseBRNumber(d.unit_value) ?? 0,
      })),
    });

    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível criar a OFP.");
      return;
    }

    toast.success("OFP criada em rascunho");
    setOpen(false);
    setDrafts([{ part_id: NONE, description: "", quantity: "", unit_value: "", measure_unit: "unidade" }]);
    invalidate(["supply-orders", "supply-order-items"]);
  }

  async function issue(id: string) {
    const { error } = await supabase.rpc("supply_order_issue", { _order: id });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("OFP aprovada e emitida");
    invalidate(["supply-orders", "contract-items", "budget-movements"]);
  }

  async function cancel(id: string) {
    const reason = window.prompt("Motivo do cancelamento:");
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("supply_order_cancel", { _order: id, _reason: reason.trim() });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("OFP cancelada e reserva liberada");
    invalidate(["supply-orders", "contract-items", "budget-movements"]);
  }

  async function receive(itemId: string) {
    const qty = window.prompt("Quantidade recebida:");
    const q = parseBRNumber(qty ?? "");
    if (!q) return;
    const wh = warehouses[0]?.id;
    const { error } = await supabase.rpc(
      "supply_order_deliver",
      rpcArgs({ _item: itemId, _quantity: q, _warehouse: wh }),
    );
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Atendimento registrado e estoque atualizado");
    invalidate(["supply-orders", "supply-order-items", "stock-balances", "stock-movements"]);
  }

  return (
    <div>
      <PageHeader
        title="Ordens de Fornecimento de Peças"
        description="A OFP é o instrumento de fornecimento de peças e materiais, separado da Ordem de Serviço de manutenção: solicitação, aprovação, emissão, atendimento parcial ou total, conferência e liberação de reserva não utilizada."
        action={
          canManageFleet ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova OFP
            </Button>
          ) : null
        }
      />

      <div className="gov-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OFP</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead className="text-right">Valor máximo</TableHead>
              <TableHead className="text-right">Reservado</TableHead>
              <TableHead className="text-right">Consumido</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8}>Carregando…</TableCell>
              </TableRow>
            )}
            {!isLoading && orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  Nenhuma ordem de fornecimento registrada.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono">{o.code}</TableCell>
                <TableCell>
                  {(o.partner_id ? partnerLabel.get(o.partner_id) : null) ??
                    suppliers.find((s) => s.id === o.supplier_id)?.trade_name ??
                    "—"}
                </TableCell>
                <TableCell>{dateBR(o.deadline_at)}</TableCell>
                <TableCell className="text-right">{brl(o.max_value)}</TableCell>
                <TableCell className="text-right">{brl(o.reserved_value)}</TableCell>
                <TableCell className="text-right">{brl(o.consumed_value)}</TableCell>
                <TableCell>
                  <Badge variant={supplyStatusTone(o.status)}>{supplyStatusLabel(o.status)}</Badge>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setDetail(o.id)}>
                    Itens
                  </Button>
                  {canManageFleet && (o.status === "rascunho" || o.status === "aguardando_aprovacao") && (
                    <Button size="sm" onClick={() => issue(o.id)}>
                      <FileCheck2 className="mr-1 h-4 w-4" /> Emitir
                    </Button>
                  )}
                  {canManageFleet && !["cancelada", "atendida"].includes(o.status) && (
                    <Button size="sm" variant="outline" onClick={() => cancel(o.id)}>
                      <Ban className="mr-1 h-4 w-4" /> Cancelar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      {/* itens da OFP */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Itens da OFP {order?.code}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qtd. autorizada</TableHead>
                <TableHead className="text-right">Entregue</TableHead>
                <TableHead className="text-right">Valor unitário</TableHead>
                <TableHead className="text-right">Valor máximo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.description}</TableCell>
                  <TableCell className="text-right">{num(it.quantity, 4)}</TableCell>
                  <TableCell className="text-right">{num(it.delivered_quantity, 4)}</TableCell>
                  <TableCell className="text-right">{brl(it.unit_value)}</TableCell>
                  <TableCell className="text-right">{brl(it.max_value)}</TableCell>
                  <TableCell className="text-right">
                    {canManageFleet &&
                      order &&
                      ["aprovada", "parcialmente_atendida"].includes(order.status) && (
                        <Button size="sm" variant="outline" onClick={() => receive(it.id)}>
                          <PackagePlus className="mr-1 h-4 w-4" /> Receber
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* nova OFP */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova Ordem de Fornecimento de Peças</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Unidade</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informada</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ativo (opcional)</Label>
              <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem ativo</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate ?? v.asset_code ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Credenciado</Label>
              <Select value={form.partner_id} onValueChange={(v) => setForm({ ...form, partner_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.trade_name || p.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.trade_name || s.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Origem do custeio</Label>
              <Select
                value={form.expense_origin}
                onValueChange={(v) => setForm({ ...form, expense_origin: v as ExpenseOrigin })}
              >
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
            <div>
              <Label>Centro de custo</Label>
              <Select value={form.cost_center_id} onValueChange={(v) => setForm({ ...form, cost_center_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {costCenters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.expense_origin === "contrato" && (
              <>
                <div>
                  <Label>Contrato</Label>
                  <Select
                    value={form.contract_id}
                    onValueChange={(v) => setForm({ ...form, contract_id: v, contract_item_id: NONE })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não informado</SelectItem>
                      {contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Item do contrato</Label>
                  <Select
                    value={form.contract_item_id}
                    onValueChange={(v) => setForm({ ...form, contract_item_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não informado</SelectItem>
                      {contractItems
                        .filter((i) => form.contract_id === NONE || i.contract_id === form.contract_id)
                        .map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.description}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label>Prazo de entrega</Label>
              <Input
                type="date"
                value={form.deadline_at}
                onChange={(e) => setForm({ ...form, deadline_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Local de entrega</Label>
              <Input
                value={form.delivery_place}
                onChange={(e) => setForm({ ...form, delivery_place: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Justificativa</Label>
              <Textarea
                rows={2}
                value={form.justification}
                onChange={(e) => setForm({ ...form, justification: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-2 space-y-2">
            <Label>Itens</Label>
            {drafts.map((d, idx) => (
              <div key={idx} className="grid gap-2 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <Select
                    value={d.part_id}
                    onValueChange={(v) => {
                      const p = parts.find((x) => x.id === v);
                      const next = [...drafts];
                      next[idx] = {
                        ...d,
                        part_id: v,
                        description: p?.description ?? d.description,
                        measure_unit: p?.measure_unit ?? d.measure_unit,
                      };
                      setDrafts(next);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Peça do catálogo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Item avulso</SelectItem>
                      {parts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ItemHistoryInput
                  className="sm:col-span-3"
                  placeholder="Descrição"
                  value={d.description}
                  onChange={(v) => {
                    const next = [...drafts];
                    next[idx] = { ...d, description: v };
                    setDrafts(next);
                  }}
                  onPick={(s) => {
                    if (!s.measure_unit) return;
                    const next = [...drafts];
                    next[idx] = { ...d, description: s.description, measure_unit: s.measure_unit };
                    setDrafts(next);
                  }}
                />

                <Input
                  className="sm:col-span-2"
                  placeholder="Qtd."
                  value={d.quantity}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...d, quantity: e.target.value };
                    setDrafts(next);
                  }}
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="Valor unit."
                  value={d.unit_value}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...d, unit_value: e.target.value };
                    setDrafts(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="sm:col-span-1"
                  onClick={() => setDrafts(drafts.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDrafts([
                  ...drafts,
                  { part_id: NONE, description: "", quantity: "", unit_value: "", measure_unit: "unidade" },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar item
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create}>Salvar rascunho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
