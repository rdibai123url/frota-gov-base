import { createFileRoute } from "@tanstack/react-router";
import { SignatureButton } from "@/components/signature-button";
import { useMemo, useState } from "react";
import { Ban, CheckCircle2, FileText, Plus, Printer, Wallet } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
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
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/form-fields";
import { parseBRNumber } from "@/lib/format";
import {
  brl,
  dateBR,
  dbMessage,
  supabase,
  useContracts,
  useInvalidate,
  useOrganization,
  usePerms,
  useSuppliers,
} from "@/lib/frotagov";
import {
  INVOICE_STATUS,
  SOURCE_LABEL,
  fetchInvoiceCandidates,
  monthEnd,
  monthStart,
  useInvoiceItems,
  useInvoices,
  type Candidate,
  type InvoiceRow,
} from "@/lib/faturamento";
import { printReport } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/faturamento")({
  head: () => ({
    meta: [
      { title: "Faturamento — FrotaGov" },
      {
        name: "description",
        content:
          "Faturas mensais por fornecedor com taxa de administração, glosas, retenções e conferência da nota fiscal.",
      },
    ],
  }),
  component: Faturamento,
});

const NONE = "__none__";
const ALL = "__all__";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  aberta: "outline",
  conferida: "default",
  paga: "secondary",
  cancelada: "destructive",
};

const supplierName = (s: { legal_name: string; trade_name: string | null } | null | undefined) =>
  s ? s.trade_name || s.legal_name : "—";

/** Aceita vírgula decimal e sinal negativo (a taxa de administração pode ser desconto). */
function parseSigned(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const neg = t.startsWith("-");
  const n = parseBRNumber(t.replace("-", ""));
  return neg ? -n : n;
}

/* ----------------------------------- página ----------------------------------- */

function Faturamento() {
  const { data: invoices = [], isLoading } = useInvoices();
  const { canManageFinance, orgId } = usePerms();
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [status, setStatus] = useState(ALL);

  const filtered = useMemo(
    () => invoices.filter((i) => status === ALL || i.status === status),
    [invoices, status],
  );

  const totals = useMemo(() => {
    const active = invoices.filter((i) => i.status !== "cancelada");
    return {
      aPagar: active
        .filter((i) => i.status !== "paga")
        .reduce((s, i) => s + Number(i.net_total), 0),
      pago: active.filter((i) => i.status === "paga").reduce((s, i) => s + Number(i.net_total), 0),
      glosa: active.reduce((s, i) => s + Number(i.glosa_total), 0),
    };
  }, [invoices]);

  return (
    <div>
      <PageHeader
        title="Faturamento"
        description="Fecha o mês por fornecedor: reúne abastecimentos, manutenções e lavagens, aplica a taxa de administração, registra glosas e retenções e confere a nota fiscal."
        action={
          canManageFinance && orgId ? (
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Plus className="size-4" /> Nova fatura
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="size-4" /> A pagar (abertas e conferidas)
          </div>
          <div className="mt-1 text-2xl font-semibold">{brl(totals.aPagar)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" /> Pago
          </div>
          <div className="mt-1 text-2xl font-semibold">{brl(totals.pago)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Ban className="size-4" /> Glosas aplicadas
          </div>
          <div className="mt-1 text-2xl font-semibold">{brl(totals.glosa)}</div>
        </div>
      </div>

      <div className="mb-4 max-w-xs">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as situações</SelectItem>
            {Object.entries(INVOICE_STATUS).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fatura</TableHead>
              <TableHead>Referência</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Glosa</TableHead>
              <TableHead className="text-right">Taxa adm.</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead>Nota fiscal</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                  Nenhuma fatura ainda. Clique em “Nova fatura” para fechar o mês de um fornecedor.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.code ?? "—"}</TableCell>
                <TableCell>
                  {new Date(i.reference_month + "T12:00:00").toLocaleDateString("pt-BR", {
                    month: "2-digit",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell>{supplierName(i.supplier)}</TableCell>
                <TableCell>{i.contract?.number ?? "—"}</TableCell>
                <TableCell className="text-right">{brl(Number(i.items_total))}</TableCell>
                <TableCell className="text-right">{brl(Number(i.glosa_total))}</TableCell>
                <TableCell className="text-right">
                  {brl(Number(i.admin_fee_value))}
                  <span className="block text-xs text-muted-foreground">
                    {Number(i.admin_fee_percent).toLocaleString("pt-BR")}%
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium">{brl(Number(i.net_total))}</TableCell>
                <TableCell>{i.nf_number ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[i.status] ?? "outline"}>
                    {INVOICE_STATUS[i.status] ?? i.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setDetailId(i.id)}>
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NewInvoiceDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(id) => {
          setOpen(false);
          setDetailId(id);
        }}
      />
      <InvoiceDetail
        invoice={invoices.find((i) => i.id === detailId) ?? null}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

/* ------------------------------- nova fatura ------------------------------- */

function NewInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { data: suppliers = [] } = useSuppliers();
  const { data: contracts = [] } = useContracts();
  const { orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [supplier, setSupplier] = useState(NONE);
  const [contract, setContract] = useState(NONE);
  const [month, setMonth] = useState(monthStart());
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState(false);

  const supplierContracts = contracts.filter(
    (c) => c.status === "vigente" && (supplier === NONE || c.supplier_id === supplier),
  );

  function pickContract(id: string) {
    setContract(id);
    const c = contracts.find((x) => x.id === id);
    if (c?.admin_fee_percent != null) setFee(String(c.admin_fee_percent).replace(".", ","));
  }

  async function create() {
    if (!orgId) return;
    if (supplier === NONE && contract === NONE) {
      toast.error("Selecione o contrato (ou o fornecedor).");
      return;
    }
    const start = month;
    const end = monthEnd(month);
    setBusy(true);
    try {
      const candidates = await fetchInvoiceCandidates(
        {
          supplierId: supplier === NONE ? null : supplier,
          contractId: contract === NONE ? null : contract,
        },
        start,
        end,
      );
      if (candidates.length === 0) {
        toast.error(
          "Não há operações a faturar deste fornecedor no mês (abastecimentos válidos, manutenções concluídas ou lavagens realizadas que ainda não estejam em fatura).",
        );
        return;
      }
      const { data: inv, error } = await supabase
        .from("billing_invoices")
        .insert({
          organization_id: orgId,
          reference_month: start,
          period_start: start,
          period_end: end,
          supplier_id:
            supplier === NONE
              ? (contracts.find((x) => x.id === contract)?.supplier_id ?? null)
              : supplier,
          contract_id: contract === NONE ? null : contract,
          admin_fee_percent: parseSigned(fee),
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      const rows = candidates.map((c: Candidate) => ({
        organization_id: orgId,
        invoice_id: inv.id,
        source_type: c.sourceType,
        source_id: c.sourceId,
        vehicle_id: c.vehicleId,
        description: c.description,
        service_date: c.date,
        amount: c.amount,
        created_by: userId,
      }));
      const { error: itemsError } = await supabase.from("billing_invoice_items").insert(rows);
      if (itemsError) {
        await supabase.from("billing_invoices").delete().eq("id", inv.id);
        throw itemsError;
      }
      toast.success(`Fatura criada com ${rows.length} operação(ões).`);
      invalidate(["billing-invoices", "billing-invoice-items"]);
      onCreated(inv.id);
    } catch (e) {
      toast.error(dbMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova fatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Fornecedor (opcional se escolher o contrato)</Label>
            <Select
              value={supplier}
              onValueChange={(v) => {
                setSupplier(v);
                setContract(NONE);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecione</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.trade_name || s.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mes">Mês de referência *</Label>
              <Input
                id="mes"
                type="month"
                value={month.slice(0, 7)}
                onChange={(e) => e.target.value && setMonth(e.target.value + "-01")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxa">Taxa de administração (%)</Label>
              <Input
                id="taxa"
                inputMode="decimal"
                placeholder="Ex.: 1,88 ou -2 (desconto)"
                value={fee}
                onChange={(e) => setFee(e.target.value.replace(/[^0-9,.-]/g, ""))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Contrato</Label>
            <Select value={contract} onValueChange={pickContract}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Todos os contratos</SelectItem>
                {supplierContracts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.number} — {c.object.slice(0, 32)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Se o contrato tiver taxa de administração cadastrada, ela é preenchida sozinha.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={create} disabled={busy}>
            {busy ? "Reunindo operações…" : "Reunir operações do mês"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ detalhe da fatura ----------------------------- */

function InvoiceDetail({ invoice, onClose }: { invoice: InvoiceRow | null; onClose: () => void }) {
  const { data: items = [] } = useInvoiceItems(invoice?.id ?? null);
  const { data: org } = useOrganization();
  const { canManageFinance, userId, userName } = usePerms();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [glosaTarget, setGlosaTarget] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!invoice) return null;
  const closed = invoice.status === "paga" || invoice.status === "cancelada";
  const editable = canManageFinance && !closed;
  const nfDiff =
    invoice.nf_value != null ? Number(invoice.nf_value) - Number(invoice.net_total) : null;

  const refresh = () => invalidate(["billing-invoices", "billing-invoice-items"]);

  async function saveHeader(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!invoice) return;
    const fd = new FormData(e.currentTarget);
    const nfRaw = String(fd.get("nf_value") ?? "").trim();
    setBusy(true);
    const { error } = await supabase
      .from("billing_invoices")
      .update({
        admin_fee_percent: parseSigned(String(fd.get("admin_fee_percent") ?? "")),
        withholding_value: parseBRNumber(String(fd.get("withholding_value") ?? "")),
        withholding_note: String(fd.get("withholding_note") ?? "").trim() || null,
        nf_number: String(fd.get("nf_number") ?? "").trim() || null,
        nf_date: String(fd.get("nf_date") ?? "") || null,
        nf_value: nfRaw === "" ? null : parseBRNumber(nfRaw),
        due_date: String(fd.get("due_date") ?? "") || null,
        notes: String(fd.get("notes") ?? "").trim() || null,
        updated_by: userId,
      })
      .eq("id", invoice.id);
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Fatura atualizada.");
    refresh();
  }

  async function setStatus(status: "conferida" | "paga", extra: Record<string, unknown> = {}) {
    if (!invoice) return;
    setBusy(true);
    const { error } = await supabase
      .from("billing_invoices")
      .update({ status, ...extra, updated_by: userId })
      .eq("id", invoice.id);
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(status === "conferida" ? "Fatura conferida." : "Pagamento registrado.");
    refresh();
    setPayOpen(false);
  }

  async function cancelInvoice(reason: string) {
    if (!invoice) return;
    if (reason.trim().length < 5) {
      toast.error("Informe o motivo do cancelamento (mínimo de 5 letras).");
      return;
    }
    setBusy(true);
    // As operações voltam a ficar disponíveis para uma nova fatura.
    const del = await supabase.from("billing_invoice_items").delete().eq("invoice_id", invoice.id);
    if (del.error) {
      setBusy(false);
      toast.error(dbMessage(del.error));
      return;
    }
    const { error } = await supabase
      .from("billing_invoices")
      .update({ status: "cancelada", cancel_reason: reason.trim(), updated_by: userId })
      .eq("id", invoice.id);
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Fatura cancelada. As operações voltaram a ficar disponíveis.");
    refresh();
    setCancelOpen(false);
  }

  async function saveGlosa(itemId: string, value: number, reason: string) {
    const { error } = await supabase
      .from("billing_invoice_items")
      .update({ glosa_value: value, glosa_reason: value > 0 ? reason.trim() : null })
      .eq("id", itemId);
    if (error) {
      toast.error(dbMessage(error));
      return false;
    }
    toast.success(value > 0 ? "Glosa registrada." : "Glosa removida.");
    refresh();
    return true;
  }

  function print() {
    if (!invoice) return;
    const ok = printReport(
      {
        title: `Fatura ${invoice.code ?? ""} — ${supplierName(invoice.supplier)}`,
        organization: org?.legal_name ?? org?.short_name ?? null,
        subtitle: `Referência ${new Date(invoice.reference_month + "T12:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })} · Situação: ${INVOICE_STATUS[invoice.status] ?? invoice.status}`,
        period: `${dateBR(invoice.period_start)} a ${dateBR(invoice.period_end)}`,
        issuedBy: userName,
        filters: [
          { label: "Bruto", value: brl(Number(invoice.items_total)) },
          { label: "Glosa", value: brl(Number(invoice.glosa_total)) },
          {
            label: `Taxa de administração (${Number(invoice.admin_fee_percent).toLocaleString("pt-BR")}%)`,
            value: brl(Number(invoice.admin_fee_value)),
          },
          { label: "Retenções", value: brl(Number(invoice.withholding_value)) },
          { label: "Líquido a pagar", value: brl(Number(invoice.net_total)) },
          { label: "Nota fiscal", value: invoice.nf_number ?? "—" },
        ],
      },
      [
        { key: "date", label: "Data" },
        { key: "kind", label: "Tipo" },
        { key: "plate", label: "Veículo" },
        { key: "description", label: "Descrição" },
        { key: "amount", label: "Valor" },
        { key: "glosa", label: "Glosa" },
        { key: "reason", label: "Motivo da glosa" },
      ],
      items.map((i) => ({
        date: i.service_date ? dateBR(i.service_date) : "—",
        kind: SOURCE_LABEL[i.source_type] ?? i.source_type,
        plate: i.vehicle?.plate ?? "—",
        description: i.description,
        amount: brl(Number(i.amount)),
        glosa: Number(i.glosa_value) > 0 ? brl(Number(i.glosa_value)) : "—",
        reason: i.glosa_reason ?? "",
      })),
    );
    if (!ok) toast.error("Permita a abertura de janelas para imprimir.");
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            <FileText className="size-5" /> Fatura {invoice.code}
            <Badge variant={STATUS_VARIANT[invoice.status] ?? "outline"}>
              {INVOICE_STATUS[invoice.status] ?? invoice.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {supplierName(invoice.supplier)}
          {invoice.contract ? ` · Contrato ${invoice.contract.number}` : ""} · Período{" "}
          {dateBR(invoice.period_start)} a {dateBR(invoice.period_end)}
          {invoice.cancel_reason ? ` · Motivo do cancelamento: ${invoice.cancel_reason}` : ""}
        </p>

        <div className="grid gap-3 sm:grid-cols-5">
          {[
            ["Bruto", brl(Number(invoice.items_total))],
            ["Glosa", brl(Number(invoice.glosa_total))],
            [
              `Taxa adm. (${Number(invoice.admin_fee_percent).toLocaleString("pt-BR")}%)`,
              brl(Number(invoice.admin_fee_value)),
            ],
            ["Retenções", brl(Number(invoice.withholding_value))],
            ["Líquido a pagar", brl(Number(invoice.net_total))],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className="mt-0.5 text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>

        {nfDiff !== null && (
          <div
            role="status"
            className={
              Math.abs(nfDiff) < 0.005
                ? "rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"
                : "rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            }
          >
            {Math.abs(nfDiff) < 0.005
              ? "Conferência: o valor da nota fiscal confere com o líquido da fatura."
              : `Conferência: a nota fiscal (${brl(Number(invoice.nf_value))}) difere do líquido da fatura em ${brl(Math.abs(nfDiff))} (${nfDiff > 0 ? "nota maior" : "nota menor"}).`}
          </div>
        )}

        <form
          key={invoice.updated_at}
          onSubmit={saveHeader}
          className="grid gap-4 rounded-lg border p-4 sm:grid-cols-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="admin_fee_percent">Taxa de administração (%)</Label>
            <Input
              id="admin_fee_percent"
              name="admin_fee_percent"
              inputMode="decimal"
              defaultValue={String(invoice.admin_fee_percent).replace(".", ",")}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="withholding_value">Retenções (R$)</Label>
            <MoneyInput
              id="withholding_value"
              name="withholding_value"
              defaultValue={invoice.withholding_value}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="withholding_note">Detalhe das retenções</Label>
            <Input
              id="withholding_note"
              name="withholding_note"
              placeholder="Ex.: IRRF 1,2% + ISS 2%"
              defaultValue={invoice.withholding_note ?? ""}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nf_number">Nota fiscal nº</Label>
            <Input
              id="nf_number"
              name="nf_number"
              defaultValue={invoice.nf_number ?? ""}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nf_date">Data da nota</Label>
            <Input
              id="nf_date"
              name="nf_date"
              type="date"
              defaultValue={invoice.nf_date ?? ""}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nf_value">Valor da nota (R$)</Label>
            <MoneyInput
              id="nf_value"
              name="nf_value"
              defaultValue={invoice.nf_value ?? ""}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due_date">Vencimento</Label>
            <Input
              id="due_date"
              name="due_date"
              type="date"
              defaultValue={invoice.due_date ?? ""}
              disabled={!editable}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-4">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={invoice.notes ?? ""}
              disabled={!editable}
            />
          </div>
          {editable && (
            <div className="sm:col-span-4">
              <Button type="submit" disabled={busy}>
                Salvar dados da fatura
              </Button>
            </div>
          )}
        </form>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Operações da fatura ({items.length})</h3>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Glosa</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.service_date ? dateBR(i.service_date) : "—"}</TableCell>
                    <TableCell>{SOURCE_LABEL[i.source_type] ?? i.source_type}</TableCell>
                    <TableCell>{i.vehicle?.plate ?? "—"}</TableCell>
                    <TableCell className="max-w-[300px] truncate" title={i.description}>
                      {i.description}
                    </TableCell>
                    <TableCell className="text-right">{brl(Number(i.amount))}</TableCell>
                    <TableCell className="text-right">
                      {Number(i.glosa_value) > 0 ? (
                        <span title={i.glosa_reason ?? ""}>{brl(Number(i.glosa_value))}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {editable && (
                        <Button size="sm" variant="ghost" onClick={() => setGlosaTarget(i.id)}>
                          Glosar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={print} className="gap-2">
              <Printer className="size-4" /> Imprimir
            </Button>
            <SignatureButton
              docType="fatura"
              docId={invoice.id}
              title={`a fatura ${invoice.code ?? ""}`}
              variant="outline"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageFinance && !closed && (
              <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={busy}>
                Cancelar fatura
              </Button>
            )}
            {canManageFinance && invoice.status === "aberta" && (
              <Button onClick={() => setStatus("conferida")} disabled={busy}>
                Marcar como conferida
              </Button>
            )}
            {canManageFinance && invoice.status === "conferida" && (
              <Button onClick={() => setPayOpen(true)} disabled={busy}>
                Registrar pagamento
              </Button>
            )}
          </div>
        </DialogFooter>

        <GlosaDialog
          item={items.find((i) => i.id === glosaTarget) ?? null}
          onClose={() => setGlosaTarget(null)}
          onSave={saveGlosa}
        />
        <PayDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          onConfirm={(d) => setStatus("paga", { paid_at: d })}
        />
        <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} onConfirm={cancelInvoice} />
      </DialogContent>
    </Dialog>
  );
}

function GlosaDialog({
  item,
  onClose,
  onSave,
}: {
  item: {
    id: string;
    description: string;
    amount: number;
    glosa_value: number;
    glosa_reason: string | null;
  } | null;
  onClose: () => void;
  onSave: (id: string, value: number, reason: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!item) return;
    const fd = new FormData(e.currentTarget);
    const value = parseBRNumber(String(fd.get("glosa_value") ?? ""));
    const reason = String(fd.get("glosa_reason") ?? "");
    if (value < 0 || value > Number(item.amount)) {
      toast.error("A glosa não pode ser negativa nem maior que o valor da operação.");
      return;
    }
    if (value > 0 && reason.trim().length < 5) {
      toast.error("Informe o motivo da glosa (mínimo de 5 letras).");
      return;
    }
    setBusy(true);
    const ok = await onSave(item.id, value, reason);
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Glosar operação</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {item.description} — valor {brl(Number(item.amount))}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="glosa_value">Valor glosado (R$) — use 0 para remover</Label>
            <MoneyInput id="glosa_value" name="glosa_value" defaultValue={item.glosa_value || ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="glosa_reason">Motivo da glosa *</Label>
            <Textarea
              id="glosa_reason"
              name="glosa_reason"
              rows={3}
              defaultValue={item.glosa_reason ?? ""}
              placeholder="Ex.: preço acima da tabela ANP na data do abastecimento"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              Salvar glosa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (date: string) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="paid_at">Data do pagamento</Label>
          <Input id="paid_at" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Depois de paga, a fatura não pode mais ser alterada.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button onClick={() => (date ? onConfirm(date) : toast.error("Informe a data."))}>
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar fatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cancel_reason">Motivo do cancelamento *</Label>
          <Textarea
            id="cancel_reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            As operações voltam a ficar disponíveis para uma nova fatura.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(reason)}>
            Cancelar fatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
