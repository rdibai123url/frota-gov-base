import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, FileText, Package, Upload, ExternalLink, GitBranch, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { MoneyInput, LitersInput, CnpjInput } from "@/components/form-fields";
import { PageHeader } from "@/components/app-shell";
import { SummaryCards } from "@/components/summary-cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpInlineButton } from "@/components/help-button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CONTRACT_MODALITIES,
  CONTRACT_STATUS,
  MATERIAL_KINDS,
  MATERIAL_KIND_LABELS,
  MEASURE_UNITS,
  brl,
  contractTotals,
  dateBR,
  isValidCNPJ,
  itemBalance,
  label,
  maskCNPJ,
  num,
  supabase,
  useContracts,
  useFuelTypes,
  useInvalidate,
  usePerms,
  useSuppliers,
  useContractObjectKinds,
  objectKindLabel,
  CONTRACT_OBJECT_KIND_FALLBACK,
  type ContractItem,
  type ContractRow,
  parseBRNumber,
  formatLiters,
  onlyDigits,
  AMENDMENT_CHANGES_VALUE,
  AMENDMENT_CREATES_PERIOD,
  AMENDMENT_KIND_LABELS,
  CONTRACT_AMENDMENT_KINDS,
  periodBalance,
  useContractAmendments,
  useContractPeriods,
  useExternalEntities,
  type ContractAmendmentKind,
} from "@/lib/frotagov";
import { EntitySelect } from "@/components/entity-select";
import { employeesByFunction, useEmployees } from "@/lib/pessoas";

export const Route = createFileRoute("/_authenticated/contratos")({
  head: () => ({
    meta: [
      { title: "Contratos — FrotaGov" },
      {
        name: "description",
        content:
          "Contratos administrativos de combustíveis e materiais da frota: vigência, valores, itens contratados, saldo e execução.",
      },
      { property: "og:title", content: "Contratos — FrotaGov" },
      { property: "og:description", content: "Gestão de contratos e saldos contratuais da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Contratos,
});

const ALL = "__all__";
const NONE = "__none__";

/** Rótulo do número do procedimento conforme a modalidade escolhida. */
const PROCEDURE_LABELS: Record<string, string> = {
  pregao: "Número do pregão",
  concorrencia: "Número da concorrência",
  dispensa: "Número da dispensa",
  inexigibilidade: "Número da inexigibilidade",
  adesao_ata: "Número da ata / adesão",
  contratacao_direta: "Número da contratação direta",
  credenciamento: "Número do edital de credenciamento",
  outro: "Número do procedimento",
};

const contractSchema = z.object({
  number: z.string().trim().min(1, "Informe o número do contrato").max(40),
  process_number: z.string().trim().max(40).optional(),
  procedure_number: z.string().trim().max(40).optional(),
  object: z.string().trim().min(3, "Descreva o objeto do contrato").max(400),
  cnpj: z.string().trim().optional(),
  signed_at: z.string().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  initial_value: z.string().optional(),
  current_value: z.string().optional(),
  notes: z.string().trim().max(600).optional(),
});

const itemSchema = z.object({
  item_code: z.string().trim().max(20).optional(),
  description: z.string().trim().min(2, "Descreva o item").max(200),
  quantity: z.string().min(1, "Informe a quantidade"),
  unit_price: z.string().min(1, "Informe o valor unitário"),
  notes: z.string().trim().max(300).optional(),
});

const money = (v: string | undefined) => parseBRNumber(v);

function StatusBadge({ status }: { status: ContractRow["status"] }) {
  const tone =
    status === "vigente" ? "default" : status === "rascunho" ? "secondary" : status === "suspenso" ? "outline" : "destructive";
  return <Badge variant={tone}>{label(CONTRACT_STATUS, status)}</Badge>;
}

function Contratos() {
  const { data: contracts = [], isLoading } = useContracts();
  const { data: suppliers = [] } = useSuppliers();
  const { data: entities = [], isLoading: loadingEntities } = useExternalEntities();
  const { data: employees = [], isLoading: loadingEmployees } = useEmployees();
  /** Nome da empresa contratada: cadastro mestre primeiro, fornecedor legado como alternativa. */
  const companyName = (c: ContractRow) => {
    const e = entities.find((x) => x.id === c.entity_id);
    if (e) return e.trade_name || e.name;
    return c.supplier ? c.supplier.trade_name || c.supplier.legal_name : "";
  };
  const employeeName = (id: string | null | undefined) =>
    employees.find((e) => e.id === id)?.full_name ?? "não informado";
  const { data: fuels = [] } = useFuelTypes();
  const { data: objectKinds = [] } = useContractObjectKinds();
  const kindOptions = objectKinds.length
    ? objectKinds.map((k) => ({ value: k.code, label: k.label }))
    : CONTRACT_OBJECT_KIND_FALLBACK;
  const { canManageFinance, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContractRow | null>(null);
  const [modality, setModality] = useState<string>("pregao");
  const [status, setStatus] = useState<string>("rascunho");
  const [supplierId, setSupplierId] = useState(NONE);
  const [objectKind, setObjectKind] = useState("combustivel_oleos");
  const [valueFromItems, setValueFromItems] = useState(false);
  const [srp, setSrp] = useState(false);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [fiscalId, setFiscalId] = useState<string | null>(null);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [itemsOf, setItemsOf] = useState<ContractRow | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContractItem | null>(null);
  const [itemFuel, setItemFuel] = useState(NONE);
  const [itemKind, setItemKind] = useState("combustivel");
  const [itemUnit, setItemUnit] = useState("litro");

  const { data: periods = [] } = useContractPeriods();
  const { data: amendments = [] } = useContractAmendments();
  const [amendFor, setAmendFor] = useState<ContractRow | null>(null);

  const [fStatus, setFStatus] = useState(ALL);
  const [fSupplier, setFSupplier] = useState(ALL);
  const [fKind, setFKind] = useState(ALL);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      contracts.filter((c) => {
        if (fStatus !== ALL && c.status !== fStatus) return false;
        if (fSupplier !== ALL && (c.supplier_id ?? NONE) !== fSupplier) return false;
        if (fKind !== ALL && c.object_kind !== fKind) return false;
        const q = search.trim().toLowerCase();
        return !q || `${c.number} ${c.process_number ?? ""} ${c.object}`.toLowerCase().includes(q);
      }),
    [contracts, fStatus, fSupplier, fKind, search],
  );

  const totals = useMemo(() => {
    const list = filtered.map(contractTotals);
    return {
      total: list.reduce((s, t) => s + t.total, 0),
      consumed: list.reduce((s, t) => s + t.consumed, 0),
      reserved: list.reduce((s, t) => s + t.reserved, 0),
      balance: list.reduce((s, t) => s + t.balance, 0),
      vigentes: filtered.filter((c) => c.status === "vigente").length,
    };
  }, [filtered]);

  function openNew() {
    setEditing(null);
    setModality("pregao");
    setStatus("rascunho");
    setSupplierId(NONE);
    setObjectKind("combustivel_oleos");
    setValueFromItems(false);
    setSrp(false);
    setEntityId(null);
    setFiscalId(null);
    setManagerId(null);
    setFile(null);
    setOpen(true);
  }

  function openEdit(c: ContractRow) {
    setEditing(c);
    setModality(c.modality);
    setStatus(c.status);
    setSupplierId(c.supplier_id ?? NONE);
    setObjectKind(c.object_kind ?? "combustivel_oleos");
    setValueFromItems(Boolean(c.value_from_items));
    setSrp(Boolean(c.srp));
    setEntityId(c.entity_id ?? null);
    setFiscalId(c.fiscal_employee_id ?? null);
    setManagerId(c.manager_employee_id ?? null);
    setFile(null);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = contractSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const d = parsed.data;
    if (d.cnpj && d.cnpj.replace(/\D/g, "").length > 0 && !isValidCNPJ(d.cnpj)) {
      toast.error("CNPJ inválido.");
      return;
    }
    if (d.valid_from && d.valid_to && d.valid_to < d.valid_from) {
      toast.error("O fim da vigência deve ser posterior ao início.");
      return;
    }

    const initialValue = money(d.initial_value);
    const currentValue = money(d.current_value) || initialValue;

    if (initialValue < 0 || currentValue < 0) {
      toast.error("Os valores do contrato não podem ser negativos.");
      return;
    }

    if (status === "vigente") {
      if (!d.signed_at) {
        toast.error("Para deixar o contrato vigente, informe a data de assinatura.");
        return;
      }
      if (!d.valid_from || !d.valid_to) {
        toast.error("Para deixar o contrato vigente, informe o início e o fim da vigência.");
        return;
      }
      if (!(currentValue > 0)) {
        toast.error("Para deixar o contrato vigente, informe um valor atual maior que zero.");
        return;
      }
    }

    setSaving(true);

    let attachment: string | null = editing?.attachment_path ?? null;
    if (file) {
      const path = `${orgId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("contratos").upload(path, file, { upsert: false });
      if (up.error) {
        setSaving(false);
        toast.error("Não foi possível enviar o PDF do contrato.");
        return;
      }
      attachment = path;
    }

    const payload = {
      number: d.number,
      process_number: d.process_number || null,
      modality: modality as ContractRow["modality"],
      object: d.object,
      object_kind: objectKind,
      value_from_items: valueFromItems,
      srp,
      procedure_number: d.procedure_number || null,
      entity_id: entityId,
      fiscal_employee_id: fiscalId,
      manager_employee_id: managerId,
      supplier_id: supplierId === NONE ? null : supplierId,
      cnpj: onlyDigits(d.cnpj) || null,
      signed_at: d.signed_at || null,
      valid_from: d.valid_from || null,
      valid_to: d.valid_to || null,
      initial_value: initialValue,
      current_value: currentValue,
      status: status as ContractRow["status"],
      notes: d.notes || null,
      attachment_path: attachment,
    };

    const { error } = editing
      ? await supabase.from("contracts").update(payload).eq("id", editing.id)
      : await supabase.from("contracts").insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "Já existe um contrato com esse número." : "Não foi possível salvar o contrato.",
      );
      return;
    }
    toast.success(editing ? "Contrato atualizado." : "Contrato cadastrado.");
    invalidate(["contracts", "contract-items"]);
    setOpen(false);
  }

  function openNewItem(c: ContractRow) {
    setItemsOf(c);
    setEditingItem(null);
    setItemFuel(NONE);
    setItemKind("combustivel");
    setItemUnit("litro");
    setItemOpen(true);
  }

  function openEditItem(c: ContractRow, i: ContractItem) {
    setItemsOf(c);
    setEditingItem(i);
    setItemFuel(i.fuel_type_id ?? NONE);
    setItemKind(i.material_kind);
    setItemUnit(i.measure_unit);
    setItemOpen(true);
  }

  async function onSubmitItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!itemsOf) return;
    const parsed = itemSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const qty = money(parsed.data.quantity);
    const price = money(parsed.data.unit_price);
    if (!(qty > 0) || !(price > 0)) {
      toast.error("Quantidade e valor unitário devem ser maiores que zero.");
      return;
    }
    if (editingItem) {
      const used = Number(editingItem.consumed_quantity) + Number(editingItem.reserved_quantity);
      if (qty < used) {
        toast.error(`A quantidade não pode ser menor que o já reservado/consumido (${formatLiters(used)}).`);
        return;
      }
    }
    setSaving(true);
    const payload = {
      item_code: parsed.data.item_code || null,
      description: parsed.data.description,
      fuel_type_id: itemFuel === NONE ? null : itemFuel,
      material_kind: itemKind,
      measure_unit: itemUnit,
      quantity: qty,
      unit_price: price,
      notes: parsed.data.notes || null,
    };
    const { error } = editingItem
      ? await supabase.from("contract_items").update(payload).eq("id", editingItem.id)
      : await supabase.from("contract_items").insert({
          ...payload,
          contract_id: itemsOf.id,
          organization_id: orgId!,
          created_by: userId,
        });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o item contratual.");
      return;
    }
    toast.success(editingItem ? "Item atualizado." : "Item incluído no contrato.");
    invalidate(["contracts", "contract-items"]);
    setItemOpen(false);
  }

  async function toggleItem(i: ContractItem) {
    const next = i.active === false;
    const { error } = await supabase.from("contract_items").update({ active: next }).eq("id", i.id);
    if (error) {
      toast.error("Não foi possível alterar a situação do item.");
      return;
    }
    toast.success(next ? "Item reativado." : "Item inativado. O histórico de execução foi preservado.");
    invalidate(["contracts", "contract-items"]);
  }

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from("contratos").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else toast.error("Não foi possível abrir o arquivo.");
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Contratos"
        description="Contratos administrativos que financiam o abastecimento e os materiais da frota."
        action={
          canManageFinance && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo contrato
            </Button>
          ) : undefined
        }
      />

      <SummaryCards
        cards={[
          { label: "Contratos vigentes", value: String(totals.vigentes) },
          { label: "Valor contratado", value: brl(totals.total) },
          { label: "Valor consumido", value: brl(totals.consumed) },
          { label: "Reservado", value: brl(totals.reserved) },
          { label: "Saldo disponível", value: brl(totals.balance) },
        ]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label>Buscar</Label>
          <Input placeholder="Número, processo ou objeto" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {CONTRACT_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Objeto do contrato</Label>
          <Select value={fKind} onValueChange={setFKind}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os objetos</SelectItem>
              {kindOptions.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Fornecedor</Label>
          <Select value={fSupplier} onValueChange={setFSupplier}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.trade_name || s.legal_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground shadow-card">
          <FileText className="mx-auto mb-2 size-6 opacity-50" />
          Nenhum contrato encontrado. Cadastre o contrato e seus itens para controlar saldos.
        </div>
      )}

      <div className="space-y-4">
        {paged.rows.map((c) => {
          const t = contractTotals(c);
          return (
            <div key={c.id} className="rounded-lg border bg-card shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="gov-title text-lg">Contrato {c.number}</h3>
                    <StatusBadge status={c.status} />
                    <Badge variant="outline">{label(CONTRACT_MODALITIES, c.modality)}</Badge>
                    <Badge variant="secondary">{objectKindLabel(c.object_kind, objectKinds)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{c.object}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {companyName(c) || "Sem empresa informada"} ·{" "}
                    Processo {c.process_number || "—"} · Vigência {dateBR(c.valid_from)} a {dateBR(c.valid_to)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fiscal: {employeeName(c.fiscal_employee_id)} · Gestor: {employeeName(c.manager_employee_id)}
                    {c.srp ? " · Registro de preços (SRP)" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.attachment_path && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => openAttachment(c.attachment_path!)}>
                      <ExternalLink className="size-4" /> PDF
                    </Button>
                  )}
                  {canManageFinance && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={c.status !== "rascunho"}
                        title={
                          c.status === "rascunho"
                            ? "Incluir item na planilha inicial do contrato"
                            : "Contrato já assinado: itens só podem ser incluídos ou alterados por aditivo."
                        }
                        onClick={() => openNewItem(c)}
                      >
                        <Package className="size-4" /> Novo item
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => setAmendFor(c)}>
                        <GitBranch className="size-4" /> Novo aditivo
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Editar contrato" onClick={() => openEdit(c)}>
                        <Pencil className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-4 border-b p-5 sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <p className="text-xs text-muted-foreground">Valor contratado (itens)</p>
                  <p className="gov-title text-lg">{brl(t.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Consumido</p>
                  <p className="gov-title text-lg">{brl(t.consumed)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reservado</p>
                  <p className="gov-title text-lg">{brl(t.reserved)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="gov-title text-lg">{brl(t.balance)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Execução / vigência</p>
                  <p className="gov-title text-lg">{num(t.percent, 1)}%</p>
                  <p className="text-xs text-muted-foreground">
                    {t.days == null
                      ? "Sem vigência informada"
                      : t.days < 0
                        ? "Vigência encerrada"
                        : `${t.days} dia(s) restantes`}
                  </p>
                </div>
              </div>

              <ContractPeriodsPanel
                  contract={c}
                  periods={periods.filter((p) => p.contract_id === c.id)}
                  amendments={amendments.filter((a) => a.contract_id === c.id)}
                />

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Nº</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Contratado</TableHead>
                      <TableHead className="text-right">Valor unit.</TableHead>
                      <TableHead className="text-right">Reservado</TableHead>
                      <TableHead className="text-right">Consumido</TableHead>
                      <TableHead className="text-right">Saldo qtd.</TableHead>
                      <TableHead className="text-right">Saldo R$</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(c.items ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhum item cadastrado neste contrato.
                        </TableCell>
                      </TableRow>
                    )}
                    {[...(c.items ?? [])]
                      .sort((a, b2) => (a.item_number ?? 0) - (b2.item_number ?? 0))
                      .map((i) => {
                      const b = itemBalance(i);
                      const inactive = i.active === false;
                      return (
                        <TableRow key={i.id} className={inactive ? "opacity-60" : undefined}>
                          <TableCell className="text-sm text-muted-foreground">{i.item_number ?? "—"}</TableCell>
                          <TableCell className="font-medium">
                            {i.item_code ? `${i.item_code} — ` : ""}
                            {i.description}
                            {inactive && (
                              <Badge variant="outline" className="ml-2">
                                Inativo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{MATERIAL_KIND_LABELS[i.material_kind] ?? i.material_kind}</TableCell>
                          <TableCell className="text-right">
                            {formatLiters(Number(i.quantity))} {i.measure_unit}
                          </TableCell>
                          <TableCell className="text-right">{brl(Number(i.unit_price))}</TableCell>
                          <TableCell className="text-right">
                            {formatLiters(Number(i.reserved_quantity))}
                            <span className="block text-xs text-muted-foreground">{brl(Number(i.reserved_value))}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatLiters(Number(i.consumed_quantity))}
                            <span className="block text-xs text-muted-foreground">{brl(Number(i.consumed_value))}</span>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatLiters(b.quantity)}</TableCell>
                          <TableCell className="text-right font-medium">{brl(b.value)}</TableCell>
                          <TableCell>
                            {canManageFinance && (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Editar item"
                                  onClick={() => openEditItem(c, i)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={inactive ? "Reativar item" : "Inativar item"}
                                  title={
                                    inactive
                                      ? "Reativar item"
                                      : "Inativar item (itens com movimentação não podem ser excluídos)"
                                  }
                                  onClick={() => toggleItem(i)}
                                >
                                  {inactive ? <RotateCcw className="size-4" /> : <Ban className="size-4" />}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}
        <ListPagination state={paged} />
      </div>

      <AmendmentDialog contract={amendFor} onClose={() => setAmendFor(null)} />

      {/* contrato */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar contrato ${editing.number}` : "Novo contrato"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="number">Número do contrato *</Label>
                <Input id="number" name="number" defaultValue={editing?.number ?? ""} required maxLength={40} />
              </div>
              <div>
                <Label htmlFor="process_number">Processo administrativo</Label>
                <Input id="process_number" name="process_number" defaultValue={editing?.process_number ?? ""} />
              </div>
              <div>
                <Label>Modalidade</Label>
                <Select value={modality} onValueChange={setModality}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_MODALITIES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="procedure_number">{PROCEDURE_LABELS[modality] ?? "Número do procedimento"}</Label>
                <Input
                  id="procedure_number"
                  name="procedure_number"
                  defaultValue={editing?.procedure_number ?? ""}
                  maxLength={40}
                />
              </div>
              <div className="flex items-start gap-2 rounded-md border p-3 sm:col-span-2">
                <Checkbox id="srp" checked={srp} onCheckedChange={(v) => setSrp(v === true)} />
                <div>
                  <Label htmlFor="srp" className="cursor-pointer">
                    Sistema de Registro de Preços (SRP)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Marque quando o contrato decorre de ata de registro de preços.
                  </p>
                </div>
              </div>
              <div>
                <Label>Objeto do contrato *</Label>
                <Select value={objectKind} onValueChange={setObjectKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kindOptions.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Classificação usada em listagens, filtros e relatórios.
                </p>
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="object">Descrição do objeto *</Label>
                <Textarea id="object" name="object" defaultValue={editing?.object ?? ""} rows={2} required />
              </div>
              <div className="sm:col-span-2">
                <Label>Empresa contratada (cadastro mestre)</Label>
                <EntitySelect
                  value={entityId}
                  onChange={setEntityId}
                  loading={loadingEntities}
                  placeholder="Buscar empresa ou pessoa cadastrada"
                  searchPlaceholder="Nome, nome fantasia ou documento…"
                  emptyLabel="Nenhuma pessoa ou empresa cadastrada ainda."
                  createHref="/entidades-externas"
                  createLabel="Cadastrar empresa"
                  options={entities
                    .filter((e) => e.active || e.id === entityId)
                    .map((e) => ({
                      value: e.id,
                      label: e.trade_name || e.name,
                      description: [e.document ? maskCNPJ(e.document) : null, e.city].filter(Boolean).join(" · "),
                      keywords: [e.name, e.trade_name, e.document],
                    }))}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  A empresa vem do cadastro único de pessoas e empresas externas — não é preciso duplicar o cadastro.
                </p>
              </div>
              <div>
                <Label>Fornecedor de abastecimento (opcional)</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.trade_name || s.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Usado pelos lançamentos de abastecimento já vinculados a este fornecedor.
                </p>
              </div>
              <div>
                <Label>Fiscal do contrato</Label>
                <EntitySelect
                  value={fiscalId}
                  onChange={setFiscalId}
                  loading={loadingEmployees}
                  placeholder="Selecionar fiscal"
                  emptyLabel="Nenhum funcionário com função de fiscal."
                  createHref="/funcionarios"
                  createLabel="Cadastrar funcionário"
                  options={employeesByFunction(employees, "fiscal_contrato").map((e) => ({
                    value: e.id,
                    label: e.full_name,
                    description: e.job_title,
                    keywords: [e.registration, e.cpf],
                  }))}
                />
              </div>
              <div>
                <Label>Gestor do contrato</Label>
                <EntitySelect
                  value={managerId}
                  onChange={setManagerId}
                  loading={loadingEmployees}
                  placeholder="Selecionar gestor"
                  emptyLabel="Nenhum funcionário com função de gestor."
                  createHref="/funcionarios"
                  createLabel="Cadastrar funcionário"
                  options={employeesByFunction(employees, "gestor_contrato").map((e) => ({
                    value: e.id,
                    label: e.full_name,
                    description: e.job_title,
                    keywords: [e.registration, e.cpf],
                  }))}
                />
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <CnpjInput
                  id="cnpj"
                  name="cnpj"
                  defaultValue={editing?.cnpj ?? ""}
                />
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="signed_at">Assinatura{status === "vigente" ? " *" : ""}</Label>
                <Input
                  id="signed_at"
                  name="signed_at"
                  type="date"
                  defaultValue={editing?.signed_at ?? ""}
                  required={status === "vigente"}
                />
              </div>
              <div>
                <Label htmlFor="valid_from">Início da vigência{status === "vigente" ? " *" : ""}</Label>
                <Input
                  id="valid_from"
                  name="valid_from"
                  type="date"
                  defaultValue={editing?.valid_from ?? ""}
                  required={status === "vigente"}
                />
              </div>
              <div>
                <Label htmlFor="valid_to">Fim da vigência{status === "vigente" ? " *" : ""}</Label>
                <Input
                  id="valid_to"
                  name="valid_to"
                  type="date"
                  defaultValue={editing?.valid_to ?? ""}
                  required={status === "vigente"}
                />
              </div>
              <div>
                <Label htmlFor="initial_value">Valor global inicial (R$)</Label>
                <MoneyInput
                  id="initial_value"
                  name="initial_value"
                  defaultValue={editing ? Number(editing.initial_value) : ""}
                />
              </div>
              <div>
                <Label htmlFor="current_value">Valor atual (R$){status === "vigente" ? " *" : ""}</Label>
                <MoneyInput
                  id="current_value"
                  name="current_value"
                  defaultValue={editing ? Number(editing.current_value) : ""}
                  required={status === "vigente"}
                />
              </div>
              <div className="sm:col-span-3 flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="value_from_items"
                  checked={valueFromItems}
                  onCheckedChange={(v) => setValueFromItems(v === true)}
                />
                <div>
                  <Label htmlFor="value_from_items" className="cursor-pointer">
                    Contrato itemizado — o valor atual é a soma dos itens
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Com a opção marcada, o valor atual do contrato passa a ser calculado automaticamente pela soma de
                    quantidade × valor unitário dos itens ativos.
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="file">PDF do contrato</Label>
                <Input
                  id="file"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {editing?.attachment_path && !file && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Upload className="size-3" /> Arquivo já anexado
                  </p>
                )}
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" defaultValue={editing?.notes ?? ""} rows={2} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Prorrogações e aditivos serão registrados em módulo próprio; o contrato já mantém contador de aditivos e
              valor atual separado do valor inicial.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar contrato"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* item */}
      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar item contratual" : "Novo item contratual"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmitItem} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="item_code">Código / item</Label>
                <Input id="item_code" name="item_code" defaultValue={editingItem?.item_code ?? ""} maxLength={20} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Descrição *</Label>
                <Input id="description" name="description" defaultValue={editingItem?.description ?? ""} required />
              </div>
              <div>
                <Label>Natureza</Label>
                <Select value={itemKind} onValueChange={setItemKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {MATERIAL_KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Combustível vinculado</Label>
                <Select value={itemFuel} onValueChange={setItemFuel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não aplicável</SelectItem>
                    {fuels.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade de medida</Label>
                <Select value={itemUnit} onValueChange={setItemUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASURE_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quantity">Quantidade contratada *</Label>
                <LitersInput
                  id="quantity"
                  name="quantity"
                  defaultValue={editingItem ? Number(editingItem.quantity) : ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="unit_price">Valor unitário (R$) *</Label>
                <MoneyInput
                  id="unit_price"
                  name="unit_price"
                  defaultValue={editingItem ? Number(editingItem.unit_price) : ""}
                  required
                />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Input id="notes" name="notes" defaultValue={editingItem?.notes ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setItemOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}


/* ---------------------- vigências e aditivos ---------------------- */

function ContractPeriodsPanel({
  contract,
  periods,
  amendments,
}: {
  contract: ContractRow;
  periods: import("@/lib/frotagov").ContractPeriod[];
  amendments: import("@/lib/frotagov").ContractAmendment[];
}) {
  const ordered = [...periods].sort((a, b) => a.sequence - b.sequence);
  const current = ordered.find((p) => p.is_current) ?? ordered[ordered.length - 1] ?? null;
  return (
    <div className="border-b p-5">
      <div className="mb-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <p className="text-xs text-muted-foreground">Valor original</p>
          <p className="gov-title text-base">{brl(Number(contract.initial_value ?? 0))}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Valor atual</p>
          <p className="gov-title text-base">{brl(Number(contract.current_value ?? 0))}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Vigência original</p>
          <p className="text-sm">
            {dateBR(contract.original_valid_from ?? contract.valid_from)} a{" "}
            {dateBR(contract.original_valid_to ?? contract.valid_to)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Vigência atual</p>
          <p className="text-sm">
            {dateBR(contract.valid_from)} a {dateBR(contract.valid_to)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Aditivos · saldo da vigência</p>
          <p className="gov-title text-base">
            {amendments.length} · {current ? brl(periodBalance(current)) : "—"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <HelpInlineButton topicKey="/contratos/itens" /> Ajuda sobre itens do contrato
        </span>
        <span className="flex items-center gap-1">
          <HelpInlineButton topicKey="/contratos/aditivos" /> Ajuda sobre aditivos
        </span>
      </div>

      <details className="rounded-md border bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Histórico de vigências e aditivos ({ordered.length} vigência(s), {amendments.length} aditivo(s))
        </summary>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vigência</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Valor da vigência</TableHead>
                <TableHead className="text-right">Reservado</TableHead>
                <TableHead className="text-right">Consumido</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.sequence}ª</TableCell>
                  <TableCell>
                    {dateBR(p.valid_from)} a {dateBR(p.valid_to)}
                  </TableCell>
                  <TableCell className="text-right">{brl(Number(p.period_value))}</TableCell>
                  <TableCell className="text-right">{brl(Number(p.reserved_value))}</TableCell>
                  <TableCell className="text-right">{brl(Number(p.consumed_value))}</TableCell>
                  <TableCell className="text-right font-medium">{brl(periodBalance(p))}</TableCell>
                  <TableCell>
                    <Badge variant={p.is_current ? "default" : "secondary"}>
                      {p.is_current ? "Vigência corrente" : "Encerrada"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {amendments.length > 0 && (
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Aditivo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Assinatura</TableHead>
                  <TableHead>Nova vigência</TableHead>
                  <TableHead className="text-right">Valor anterior</TableHead>
                  <TableHead className="text-right">Valor posterior</TableHead>
                  <TableHead>Fundamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...amendments]
                  .sort((a, b) => a.signed_at.localeCompare(b.signed_at))
                  .map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.number}</TableCell>
                      <TableCell>{AMENDMENT_KIND_LABELS[a.kind] ?? a.kind}</TableCell>
                      <TableCell>{dateBR(a.signed_at)}</TableCell>
                      <TableCell>
                        {a.new_valid_from ? `${dateBR(a.new_valid_from)} a ${dateBR(a.new_valid_to)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">{brl(Number(a.previous_contract_value ?? 0))}</TableCell>
                      <TableCell className="text-right">{brl(Number(a.new_contract_value ?? 0))}</TableCell>
                      <TableCell className="max-w-[240px] truncate">{a.justification || "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </div>
      </details>
    </div>
  );
}

/** Linha da planilha de itens do aditivo (acréscimo, supressão ou item novo). */
type AmendmentItemRow = {
  key: string;
  operation: "acrescimo" | "supressao";
  contract_item_id: string | null;
  description: string;
  measure_unit: string;
  quantity: string;
  unit_price: string;
};

function AmendmentDialog({ contract, onClose }: { contract: ContractRow | null; onClose: () => void }) {
  const { orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const [kind, setKind] = useState<ContractAmendmentKind>("prorrogacao");
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<AmendmentItemRow[]>([]);

  const createsPeriod = AMENDMENT_CREATES_PERIOD.includes(kind);
  const changesValue = AMENDMENT_CHANGES_VALUE.includes(kind);
  const changesItems = kind === "acrescimo" || kind === "supressao" || kind === "combinado";
  const help = CONTRACT_AMENDMENT_KINDS.find((k) => k.value === kind)?.help ?? "";
  const contractItems = (contract?.items ?? []).filter((i) => i.active !== false);

  /** Impacto financeiro da planilha do aditivo (acréscimos menos supressões). */
  const rowsDelta = rows.reduce(
    (sum, r) => sum + (r.operation === "supressao" ? -1 : 1) * parseBRNumber(r.quantity) * parseBRNumber(r.unit_price),
    0,
  );

  const updateRow = (key: string, patch: Partial<AmendmentItemRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addRow(existing: boolean) {
    setRows((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        operation: kind === "supressao" ? "supressao" : "acrescimo",
        contract_item_id: existing ? (contractItems[0]?.id ?? null) : null,
        description: "",
        measure_unit: "litro",
        quantity: "",
        unit_price: existing ? String(contractItems[0]?.unit_price ?? "") : "",
      },
    ]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contract) return;
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim();

    if (!get("number")) {
      toast.error("Informe o número do aditivo.");
      return;
    }
    if (!get("justification")) {
      toast.error("Informe o fundamento/justificativa do aditivo.");
      return;
    }
    if (createsPeriod && (!get("new_valid_from") || !get("new_valid_to"))) {
      toast.error("Informe a data inicial e final da nova vigência.");
      return;
    }
    const delta = parseBRNumber(get("delta_value"));
    const percent = parseBRNumber(get("percent"));
    if (changesValue && !delta && !percent && rows.length === 0) {
      toast.error("Informe o valor, o percentual ou a planilha de itens da alteração.");
      return;
    }
    for (const r of rows) {
      if (!r.contract_item_id && r.description.trim().length < 2) {
        toast.error("Descreva o item novo incluído pelo aditivo.");
        return;
      }
      if (!(parseBRNumber(r.quantity) > 0) || !(parseBRNumber(r.unit_price) > 0)) {
        toast.error("Quantidade e valor unitário dos itens do aditivo devem ser maiores que zero.");
        return;
      }
    }


    setSaving(true);
    let attachment: string | null = null;
    if (file && orgId) {
      const path = `${orgId}/aditivos/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await supabase.storage.from("contratos").upload(path, file);
      if (!up.error) attachment = path;
    }

    const periodValue = parseBRNumber(get("period_value"));
    const { data: amendment, error } = await supabase.from("contract_amendments").insert({
      organization_id: orgId!,
      contract_id: contract.id,
      number: get("number"),
      kind,
      signed_at: get("signed_at") || new Date().toISOString().slice(0, 10),
      effect_date: get("effect_date") || get("signed_at") || new Date().toISOString().slice(0, 10),
      new_valid_from: createsPeriod ? get("new_valid_from") : null,
      new_valid_to: createsPeriod ? get("new_valid_to") : null,
      delta_value: changesValue && delta ? delta : null,
      percent: changesValue && percent ? percent : null,
      period_value: createsPeriod && periodValue ? periodValue : null,
      index_name: get("index_name") || null,
      justification: get("justification"),
      attachment_path: attachment,
      created_by: userId,
    })
      .select("id")
      .maybeSingle();
    if (error || !amendment) {
      setSaving(false);
      toast.error(error?.message || "Não foi possível registrar o aditivo.");
      return;
    }

    if (rows.length > 0) {
      const { error: itemsError } = await supabase.from("contract_amendment_items").insert(
        rows.map((r) => ({
          organization_id: orgId!,
          amendment_id: amendment.id,
          contract_id: contract.id,
          contract_item_id: r.contract_item_id,
          operation: r.operation,
          description: r.contract_item_id ? null : r.description.trim(),
          measure_unit: r.measure_unit,
          quantity: parseBRNumber(r.quantity),
          unit_price: parseBRNumber(r.unit_price),
        })),
      );
      if (itemsError) {
        setSaving(false);
        toast.error(itemsError.message || "O aditivo foi registrado, mas a planilha de itens não pôde ser aplicada.");
        invalidate(["contracts", "contract-periods", "contract-amendments", "contract-items"]);
        return;
      }
    }

    setSaving(false);
    toast.success("Aditivo registrado. Contrato, vigências e itens atualizados.");
    invalidate(["contracts", "contract-periods", "contract-amendments", "contract-items"]);
    setFile(null);
    setRows([]);
    onClose();
  }

  return (
    <Dialog open={!!contract} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo aditivo — Contrato {contract?.number}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Tipo de aditivo *</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ContractAmendmentKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_AMENDMENT_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{help}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="number">Número do aditivo *</Label>
              <Input id="number" name="number" required maxLength={40} />
            </div>
            <div>
              <Label htmlFor="signed_at">Data de assinatura</Label>
              <Input id="signed_at" name="signed_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <Label htmlFor="effect_date">Data de efeito</Label>
              <Input id="effect_date" name="effect_date" type="date" />
            </div>
          </div>

          {createsPeriod && (
            <div className="grid gap-4 rounded-md border bg-muted/30 p-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="new_valid_from">Início da nova vigência *</Label>
                <Input id="new_valid_from" name="new_valid_from" type="date" />
              </div>
              <div>
                <Label htmlFor="new_valid_to">Fim da nova vigência *</Label>
                <Input id="new_valid_to" name="new_valid_to" type="date" />
              </div>
              <div>
                <Label htmlFor="period_value">Valor da nova vigência (R$)</Label>
                <MoneyInput id="period_value" name="period_value" />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-3">
                A nova vigência inicia com o valor informado (ou, em prorrogação simples, com o valor-base do
                contrato). O saldo não utilizado da vigência anterior <strong>não</strong> é transportado e permanece
                registrado no histórico.
              </p>
            </div>
          )}

          {changesValue && (
            <div className="grid gap-4 rounded-md border bg-muted/30 p-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="delta_value">Valor do acréscimo/supressão (R$)</Label>
                <MoneyInput id="delta_value" name="delta_value" />
              </div>
              <div>
                <Label htmlFor="percent">Percentual (%)</Label>
                <MoneyInput id="percent" name="percent" />
              </div>
              <div>
                <Label htmlFor="index_name">Índice / critério</Label>
                <Input id="index_name" name="index_name" placeholder="IPCA, INPC, IGP-M…" />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Valor atual do contrato: <strong>{brl(Number(contract?.current_value ?? 0))}</strong>. O valor original
                é preservado e o histórico registra valor anterior e posterior.
              </p>
            </div>
          )}

          {changesItems && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Planilha de itens do aditivo</Label>
                  <p className="text-xs text-muted-foreground">
                    Acrescente ou suprima quantidade de itens já contratados, ou inclua itens novos. Fora do aditivo, a
                    planilha do contrato assinado fica bloqueada.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={contractItems.length === 0}
                    onClick={() => addRow(true)}
                  >
                    Item existente
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addRow(false)}>
                    Item novo
                  </Button>
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum item incluído nesta planilha.</p>
              ) : (
                <div className="space-y-3">
                  {rows.map((r) => (
                    <div key={r.key} className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-6">
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Item</Label>
                        {r.contract_item_id ? (
                          <Select
                            value={r.contract_item_id}
                            onValueChange={(v) => {
                              const it = contractItems.find((i) => i.id === v);
                              updateRow(r.key, {
                                contract_item_id: v,
                                measure_unit: it?.measure_unit ?? r.measure_unit,
                                unit_price: String(it?.unit_price ?? r.unit_price),
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {contractItems.map((i) => (
                                <SelectItem key={i.id} value={i.id}>
                                  {i.item_number ? `${i.item_number} — ` : ""}
                                  {i.description}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={r.description}
                            placeholder="Descrição do item novo"
                            onChange={(e) => updateRow(r.key, { description: e.target.value })}
                          />
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Operação</Label>
                        <Select
                          value={r.operation}
                          onValueChange={(v) => updateRow(r.key, { operation: v as AmendmentItemRow["operation"] })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="acrescimo">Acréscimo</SelectItem>
                            <SelectItem value="supressao" disabled={!r.contract_item_id}>
                              Supressão
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Unidade</Label>
                        <Select
                          value={r.measure_unit}
                          onValueChange={(v) => updateRow(r.key, { measure_unit: v })}
                          disabled={!!r.contract_item_id}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MEASURE_UNITS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Quantidade</Label>
                        <LitersInput value={r.quantity} onValueChange={(v) => updateRow(r.key, { quantity: v })} />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Label className="text-xs">Valor unitário</Label>
                          <MoneyInput
                            value={r.unit_price}
                            onValueChange={(v) => updateRow(r.key, { unit_price: v })}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remover item do aditivo"
                          onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                        >
                          <Ban className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Impacto da planilha: <strong>{brl(rowsDelta)}</strong>. Informe também o valor do aditivo acima para
                    atualizar o valor global do contrato.
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="justification">Fundamento / justificativa *</Label>
            <Textarea id="justification" name="justification" rows={3} required />
          </div>

          <div>
            <Label htmlFor="amend_file">Anexo do aditivo (PDF)</Label>
            <div className="flex items-center gap-2">
              <Upload className="size-4 text-muted-foreground" />
              <Input
                id="amend_file"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Registrando…" : "Registrar aditivo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
