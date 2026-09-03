import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileCheck2, Plus, Printer, Upload } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { MoneyInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCNPJ, parseBRNumber } from "@/lib/format";
import {
  EXPENSE_ORIGINS,
  SERVICE_ORDER_STATUS,
  brl,
  dateBR,
  dateTimeBR,
  dbMessage,
  labelOf,
  num,
  openMaintenanceFile,
  supabase,
  uploadMaintenanceFile,
  useCommitments,
  useContractItems,
  useContracts,
  useCostCenters,
  useInvalidate,
  useMaintenanceRecords,
  useOrganization,
  usePerms,
  useQuotas,
  useQuotationProposals,
  useServiceOrderItems,
  useServiceOrders,
  useUnits,
  type ExpenseOrigin,
  type ServiceOrderRow,
  type ServiceOrderStatus,
} from "@/lib/frotagov";
import { useQuotations } from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/ordens-servico")({
  head: () => ({
    meta: [
      { title: "Ordens de Serviço — FrotaGov" },
      {
        name: "description",
        content:
          "Ordens de serviço eletrônicas emitidas à rede credenciada, com peças aprovadas, prazos, garantias, origem do recurso e controle de execução.",
      },
      { property: "og:title", content: "Ordens de Serviço — FrotaGov" },
      { property: "og:description", content: "Emissão e acompanhamento de ordens de serviço da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrdensServico,
});

const ALL = "__all__";
const NONE = "__none__";

function OrdensServico() {
  const { data: orders = [], isLoading } = useServiceOrders();
  const { data: quotations = [] } = useQuotations();
  const { data: units = [] } = useUnits();
  const { data: costCenters = [] } = useCostCenters();
  const { data: contracts = [] } = useContracts();
  const { data: contractItems = [] } = useContractItems();
  const { data: commitments = [] } = useCommitments();
  const { data: quotas = [] } = useQuotas();
  const { canManageFleet, orgId, userId, userName } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [quotationId, setQuotationId] = useState("");
  const [unitId, setUnitId] = useState(NONE);
  const [origin, setOrigin] = useState<ExpenseOrigin>("compra_direta");
  const [costCenter, setCostCenter] = useState(NONE);
  const [contract, setContract] = useState(NONE);
  const [contractItem, setContractItem] = useState(NONE);
  const [commitment, setCommitment] = useState(NONE);
  const [quota, setQuota] = useState(NONE);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ServiceOrderRow | null>(null);
  const [fStatus, setFStatus] = useState(ALL);
  const [search, setSearch] = useState("");

  const current = useMemo(() => orders.find((o) => o.id === detail?.id) ?? null, [orders, detail]);

  const approved = quotations.filter(
    (q) => q.selected_proposal_id && !orders.some((o) => o.quotation_id === q.id && o.status !== "cancelada"),
  );
  const chosenQuotation = approved.find((q) => q.id === quotationId) ?? null;
  const { data: chosenProposals = [] } = useQuotationProposals(quotationId || null);
  const chosenProposal = chosenProposals.find((p) => p.id === chosenQuotation?.selected_proposal_id) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (fStatus === ALL || o.status === fStatus) &&
        (!q ||
          `${o.code ?? ""} ${o.vehicle?.plate ?? ""} ${o.workshop?.legal_name ?? ""} ${o.services}`
            .toLowerCase()
            .includes(q)),
    );
  }, [orders, fStatus, search]);

  async function emit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosenQuotation || !chosenProposal) {
      toast.error("Selecione um processo com proposta aprovada.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    const { error } = await supabase.from("service_orders").insert({
      organization_id: orgId!,
      quotation_id: chosenQuotation.id,
      request_id: chosenQuotation.request_id,
      vehicle_id: chosenQuotation.vehicle_id,
      unit_id: unitId === NONE ? chosenQuotation.unit_id : unitId,
      workshop_id: chosenProposal.workshop_id,
      services: String(fd.get("services") ?? chosenQuotation.description),
      approved_value: Number(chosenProposal.total_value),
      execution_days: chosenProposal.execution_days,
      deadline_at: (fd.get("deadline_at") as string) || null,
      warranty_days: chosenProposal.warranty_days,
      expense_origin: origin,
      cost_center_id: costCenter === NONE ? null : costCenter,
      contract_id: contract === NONE ? null : contract,
      contract_item_id: contractItem === NONE ? null : contractItem,
      commitment_id: commitment === NONE ? null : commitment,
      quota_id: quota === NONE ? null : quota,
      authorizer_id: userId,
      authorizer_name: userName,
      notes: (fd.get("notes") as string) || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Ordem de serviço emitida.");
    invalidate(["service-orders", "quotations", "contracts", "commitments", "quotas"]);
    setOpen(false);
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Ordens de Serviço"
        description="Emissão eletrônica após aprovação da cotação, com reserva de saldo e acompanhamento da execução."
        action={
          canManageFleet && orgId ? (
            <Button
              onClick={() => {
                setQuotationId("");
                setUnitId(NONE);
                setOrigin("compra_direta");
                setCostCenter(NONE);
                setContract(NONE);
                setContractItem(NONE);
                setCommitment(NONE);
                setQuota(NONE);
                setOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="size-4" /> Emitir OS
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Buscar</Label>
          <Input placeholder="Código, veículo, oficina" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {SERVICE_ORDER_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OS</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Oficina</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead className="text-right">Aprovado</TableHead>
              <TableHead className="text-right">Executado</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <FileCheck2 className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma ordem de serviço emitida.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">
                  {o.code || "—"}
                  <span className="block text-xs text-muted-foreground">{o.quotation?.code || "sem cotação"}</span>
                </TableCell>
                <TableCell>{o.vehicle?.plate ?? "—"}</TableCell>
                <TableCell>{o.workshop?.trade_name || o.workshop?.legal_name}</TableCell>
                <TableCell className="text-sm">
                  {o.deadline_at ? dateBR(o.deadline_at) : "—"}
                  {o.deadline_at &&
                    new Date(`${o.deadline_at}T12:00:00`) < new Date() &&
                    !["concluida", "cancelada"].includes(o.status) && (
                      <span className="block text-xs text-destructive">atrasada</span>
                    )}
                </TableCell>
                <TableCell className="text-right">{brl(Number(o.approved_value))}</TableCell>
                <TableCell className="text-right">
                  {o.executed_value === null ? "—" : brl(Number(o.executed_value))}
                </TableCell>
                <TableCell>
                  <Badge variant={o.status === "concluida" ? "default" : "secondary"}>
                    {labelOf(SERVICE_ORDER_STATUS, o.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setDetail(o)}>
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Emitir ordem de serviço</DialogTitle>
          </DialogHeader>
          <form onSubmit={emit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Processo de cotação aprovado *</Label>
                <Select value={quotationId} onValueChange={setQuotationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {approved.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.code} — {q.vehicle?.plate} — {q.description.slice(0, 40)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {approved.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nenhuma cotação com proposta aprovada disponível. A execução formal só ocorre após a emissão da OS.
                  </p>
                )}
              </div>
              {chosenProposal && (
                <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <p>
                    Oficina: {chosenProposal.workshop?.trade_name || chosenProposal.workshop?.legal_name} — Valor
                    aprovado {brl(Number(chosenProposal.total_value))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Prazo {chosenProposal.execution_days ?? "—"} dia(s) · Garantia {chosenProposal.warranty_days ?? "—"}{" "}
                    dia(s)
                  </p>
                </div>
              )}
              <div>
                <Label>Unidade</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Herdar da cotação</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="deadline_at">Prazo de execução (data limite)</Label>
                <Input id="deadline_at" name="deadline_at" type="date" />
              </div>
              <div>
                <Label>Origem do recurso</Label>
                <Select value={origin} onValueChange={(v) => setOrigin(v as ExpenseOrigin)}>
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
                <Select value={costCenter} onValueChange={setCostCenter}>
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
              <div>
                <Label>Contrato</Label>
                <Select
                  value={contract}
                  onValueChange={(v) => {
                    setContract(v);
                    setContractItem(NONE);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem contrato</SelectItem>
                    {contracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Item contratual</Label>
                <Select value={contractItem} onValueChange={setContractItem} disabled={contract === NONE}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não vincular</SelectItem>
                    {contractItems
                      .filter((i) => i.contract_id === contract)
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.description.slice(0, 40)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Empenho</Label>
                <Select value={commitment} onValueChange={setCommitment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem empenho</SelectItem>
                    {commitments
                      .filter((c) => c.status === "ativo")
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.number} — saldo {brl(Number(c.available_value ?? 0))}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cota</Label>
                <Select value={quota} onValueChange={setQuota}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem cota</SelectItem>
                    {quotas
                      .filter((q) => q.active && q.quota_type === "financeira")
                      .map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.name} — saldo {brl(Number(q.balance_amount ?? 0))}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="services">Descrição dos serviços</Label>
                <Textarea
                  id="services"
                  name="services"
                  rows={3}
                  defaultValue={chosenQuotation?.description ?? ""}
                  key={quotationId}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !chosenProposal}>
                {saving ? "Emitindo…" : "Emitir OS"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!current} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          {current && <ServiceOrderDetail order={current} canManage={canManageFleet} userId={userId} orgId={orgId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ServiceOrderDetail({
  order,
  canManage,
  userId,
  orgId,
}: {
  order: ServiceOrderRow;
  canManage: boolean;
  userId: string | null;
  orgId: string | null;
}) {
  const { data: items = [] } = useServiceOrderItems(order.id);
  const { data: records = [] } = useMaintenanceRecords();
  const { data: org } = useOrganization();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [executed, setExecuted] = useState("");
  const [recordId, setRecordId] = useState(order.maintenance_record_id ?? NONE);
  const [file, setFile] = useState<File | null>(null);

  const closed = order.status === "concluida" || order.status === "cancelada";
  const itemsTotal = items.reduce((s, i) => s + Number(i.total_value), 0);

  function refresh() {
    invalidate([
      "service-orders",
      "service-order-items",
      "contracts",
      "contract-items",
      "commitments",
      "quotas",
      "maintenance-records",
      "vehicles",
    ]);
  }

  async function setStatus(status: ServiceOrderStatus) {
    let cancelReason: string | null = null;
    if (status === "cancelada") {
      const reason = window.prompt("Motivo do cancelamento da OS:") ?? "";
      if (!reason.trim()) {
        toast.error("O cancelamento exige motivo.");
        return;
      }
      cancelReason = reason;
    }
    const patch = {
      status,
      updated_by: userId,
      ...(cancelReason ? { cancel_reason: cancelReason } : {}),
      ...(status === "concluida"
        ? {
            executed_value: executed ? parseBRNumber(executed) : Number(order.approved_value),
            ...(recordId !== NONE ? { maintenance_record_id: recordId } : {}),
          }
        : {}),
    };
    setBusy(true);
    const { error } = await supabase.from("service_orders").update(patch).eq("id", order.id);
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Ordem de serviço atualizada.");
    refresh();
  }

  async function addItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const description = String(fd.get("description") ?? "").trim();
    if (!description) {
      toast.error("Informe a descrição do item.");
      return;
    }
    const { error } = await supabase.from("service_order_items").insert({
      organization_id: orgId!,
      service_order_id: order.id,
      kind: String(fd.get("kind") ?? "peca"),
      description,
      brand: (fd.get("brand") as string) || null,
      quantity: parseBRNumber(String(fd.get("quantity") ?? "1")) || 1,
      unit_value: parseBRNumber(String(fd.get("unit_value") ?? "0")),
      warranty_days: fd.get("warranty_days") ? Number(fd.get("warranty_days")) : null,
      created_by: userId,
    });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    form.reset();
    refresh();
  }

  async function registerReturn(itemId: string) {
    const to = window.prompt("Responsável pelo recebimento da peça substituída:") ?? "";
    if (!to.trim()) {
      toast.error("Informe o responsável.");
      return;
    }
    let path: string | null = null;
    try {
      if (file && orgId) path = await uploadMaintenanceFile(orgId, file, `os/${order.id}`);
    } catch (err) {
      toast.error(dbMessage(err));
      return;
    }
    const { error } = await supabase
      .from("service_order_items")
      .update({
        replaced_part_returned: true,
        returned_at: new Date().toISOString().slice(0, 10),
        returned_to: to,
        return_attachment_path: path,
        updated_by: userId,
      })
      .eq("id", itemId);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    setFile(null);
    toast.success("Devolução da peça registrada.");
    refresh();
  }

  function print() {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    const rows = items
      .map(
        (i) =>
          `<tr><td>${i.description}</td><td>${i.brand ?? "—"}</td><td style="text-align:right">${num(Number(i.quantity), 2)}</td><td style="text-align:right">${brl(Number(i.unit_value))}</td><td style="text-align:right">${brl(Number(i.total_value))}</td></tr>`,
      )
      .join("");
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${order.code}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#111}h1{font-size:18px;margin:0}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}td,th{border:1px solid #ccc;padding:6px}
      .hdr{display:flex;gap:16px;align-items:center;border-bottom:2px solid #123;padding-bottom:12px}
      p{font-size:13px;margin:4px 0}</style></head><body>
      <div class="hdr"><div><h1>${org?.legal_name ?? ""}</h1>
      <p>${[org?.city, org?.state].filter(Boolean).join(" / ")} — CNPJ ${formatCNPJ(org?.cnpj)}</p></div></div>
      <h2 style="font-size:16px">Ordem de Serviço ${order.code ?? ""}</h2>
      <p><b>Emitida em:</b> ${dateTimeBR(order.issued_at)}</p>
      <p><b>Veículo:</b> ${order.vehicle?.plate ?? ""} — ${order.vehicle?.brand ?? ""} ${order.vehicle?.model ?? ""}</p>
      <p><b>Oficina:</b> ${order.workshop?.legal_name ?? ""} — CNPJ ${formatCNPJ(order.workshop?.cnpj)}</p>
      <p><b>Processo de cotação:</b> ${order.quotation?.code ?? "—"}</p>
      <p><b>Serviços:</b> ${order.services}</p>
      <p><b>Prazo:</b> ${order.deadline_at ? dateBR(order.deadline_at) : "—"} — <b>Garantia:</b> ${order.warranty_days ?? "—"} dia(s)</p>
      <p><b>Valor aprovado:</b> ${brl(Number(order.approved_value))}</p>
      <table><thead><tr><th>Item</th><th>Marca</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:24px"><b>Autorizado por:</b> ${order.authorizer_name ?? "—"}</p>
      <p style="margin-top:40px">__________________________________________<br/>Assinatura do responsável</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          Ordem de serviço {order.code}
          <Badge variant={order.status === "concluida" ? "default" : "secondary"}>
            {labelOf(SERVICE_ORDER_STATUS, order.status)}
          </Badge>
        </DialogTitle>
      </DialogHeader>

      <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
        <p>
          <span className="text-muted-foreground">Veículo:</span> {order.vehicle?.plate ?? "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Oficina:</span>{" "}
          {order.workshop?.trade_name || order.workshop?.legal_name}
        </p>
        <p>
          <span className="text-muted-foreground">Cotação:</span> {order.quotation?.code ?? "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Aprovado:</span> {brl(Number(order.approved_value))}
        </p>
        <p>
          <span className="text-muted-foreground">Reservado:</span> {brl(Number(order.reserved_value))}
        </p>
        <p>
          <span className="text-muted-foreground">Consumido:</span> {brl(Number(order.consumed_value))}
        </p>
        <p className="sm:col-span-3">
          <span className="text-muted-foreground">Serviços:</span> {order.services}
        </p>
        <p className="sm:col-span-3 text-xs text-muted-foreground">
          Emitida em {dateTimeBR(order.issued_at)} por {order.authorizer_name ?? "—"} · Prazo{" "}
          {order.deadline_at ? dateBR(order.deadline_at) : "—"} · Garantia {order.warranty_days ?? "—"} dia(s)
          {order.cancel_reason ? ` · Cancelamento: ${order.cancel_reason}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={print} className="gap-2">
          <Printer className="size-4" /> Imprimir
        </Button>
        {canManage && !closed && (
          <>
            {order.status === "emitida" && (
              <Button size="sm" onClick={() => setStatus("veiculo_recebido")} disabled={busy}>
                Veículo recebido
              </Button>
            )}
            {["emitida", "veiculo_recebido", "aguardando_peca"].includes(order.status) && (
              <Button size="sm" onClick={() => setStatus("em_execucao")} disabled={busy}>
                Iniciar execução
              </Button>
            )}
            {order.status === "em_execucao" && (
              <Button size="sm" variant="outline" onClick={() => setStatus("aguardando_peca")} disabled={busy}>
                Aguardando peça
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setStatus("cancelada")} disabled={busy}>
              Cancelar OS
            </Button>
          </>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Peças e serviços aprovados</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="text-right">Unitário</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Garantia</TableHead>
              <TableHead>Peça substituída</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  Nenhum item registrado.
                </TableCell>
              </TableRow>
            )}
            {items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  {i.description}
                  <span className="block text-xs text-muted-foreground">{i.brand || ""}</span>
                </TableCell>
                <TableCell>{i.kind === "servico" ? "Serviço" : "Peça"}</TableCell>
                <TableCell className="text-right">{num(Number(i.quantity), 2)}</TableCell>
                <TableCell className="text-right">{brl(Number(i.unit_value))}</TableCell>
                <TableCell className="text-right">{brl(Number(i.total_value))}</TableCell>
                <TableCell className="text-sm">
                  {i.warranty_until ? `até ${dateBR(i.warranty_until)}` : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {i.replaced_part_returned ? (
                    <>
                      Devolvida em {dateBR(i.returned_at)} a {i.returned_to}
                      {i.return_attachment_path && (
                        <button
                          type="button"
                          className="ml-1 text-primary underline"
                          onClick={() =>
                            openMaintenanceFile(i.return_attachment_path!).catch((e) => toast.error(dbMessage(e)))
                          }
                        >
                          comprovante
                        </button>
                      )}
                    </>
                  ) : canManage && i.kind !== "servico" ? (
                    <Button variant="outline" size="sm" onClick={() => registerReturn(i.id)}>
                      Registrar devolução
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-1 text-right text-sm text-muted-foreground">Total dos itens: {brl(itemsTotal)}</p>
      </div>

      {canManage && !closed && (
        <>
          <form onSubmit={addItem} className="grid items-end gap-2 rounded-md border p-3 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Input name="description" />
            </div>
            <div>
              <Label>Tipo</Label>
              <select name="kind" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="peca">Peça</option>
                <option value="servico">Serviço</option>
              </select>
            </div>
            <div>
              <Label>Marca</Label>
              <Input name="brand" />
            </div>
            <div>
              <Label>Qtd.</Label>
              <Input name="quantity" defaultValue="1" inputMode="decimal" />
            </div>
            <div>
              <Label>Unitário</Label>
              <MoneyInput name="unit_value" />
            </div>
            <div>
              <Label>Garantia (dias)</Label>
              <Input name="warranty_days" type="number" min={0} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="ack" defaultChecked disabled />
              <Label htmlFor="ack" className="text-xs text-muted-foreground">
                Itens só podem ser incluídos antes da conclusão
              </Label>
            </div>
            <Button type="submit">Adicionar item</Button>
          </form>

          <div className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-3">
            <div className="sm:col-span-3 text-sm font-medium">Conclusão da OS</div>
            <div>
              <Label htmlFor="executed">Valor efetivamente executado</Label>
              <MoneyInput
                id="executed"
                value={executed}
                onValueChange={setExecuted}
                placeholder={brl(Number(order.approved_value))}
              />
            </div>
            <div>
              <Label>Manutenção executada vinculada</Label>
              <Select value={recordId} onValueChange={setRecordId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não vincular</SelectItem>
                  {records
                    .filter((r) => r.vehicle_id === order.vehicle_id)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.code} — {dateBR(r.entry_at.slice(0, 10))}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ret-file" className="flex items-center gap-2">
                <Upload className="size-4" /> Comprovante de devolução
              </Label>
              <Input id="ret-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button onClick={() => setStatus("concluida")} disabled={busy}>
              Concluir OS
            </Button>
          </div>
        </>
      )}
    </>
  );
}
