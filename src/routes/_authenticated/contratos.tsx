import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, FileText, Package, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  type ContractItem,
  type ContractRow,
} from "@/lib/frotagov";

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

const contractSchema = z.object({
  number: z.string().trim().min(1, "Informe o número do contrato").max(40),
  process_number: z.string().trim().max(40).optional(),
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

const money = (v: string | undefined) => Number(String(v ?? "0").replace(/\./g, "").replace(",", ".")) || 0;

function StatusBadge({ status }: { status: ContractRow["status"] }) {
  const tone =
    status === "vigente" ? "default" : status === "rascunho" ? "secondary" : status === "suspenso" ? "outline" : "destructive";
  return <Badge variant={tone}>{label(CONTRACT_STATUS, status)}</Badge>;
}

function Contratos() {
  const { data: contracts = [], isLoading } = useContracts();
  const { data: suppliers = [] } = useSuppliers();
  const { data: fuels = [] } = useFuelTypes();
  const { canManageFinance, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContractRow | null>(null);
  const [modality, setModality] = useState<string>("pregao");
  const [status, setStatus] = useState<string>("rascunho");
  const [supplierId, setSupplierId] = useState(NONE);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [itemsOf, setItemsOf] = useState<ContractRow | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContractItem | null>(null);
  const [itemFuel, setItemFuel] = useState(NONE);
  const [itemKind, setItemKind] = useState("combustivel");
  const [itemUnit, setItemUnit] = useState("litro");

  const [fStatus, setFStatus] = useState(ALL);
  const [fSupplier, setFSupplier] = useState(ALL);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      contracts.filter((c) => {
        if (fStatus !== ALL && c.status !== fStatus) return false;
        if (fSupplier !== ALL && (c.supplier_id ?? NONE) !== fSupplier) return false;
        const q = search.trim().toLowerCase();
        return !q || `${c.number} ${c.process_number ?? ""} ${c.object}`.toLowerCase().includes(q);
      }),
    [contracts, fStatus, fSupplier, search],
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
    setFile(null);
    setOpen(true);
  }

  function openEdit(c: ContractRow) {
    setEditing(c);
    setModality(c.modality);
    setStatus(c.status);
    setSupplierId(c.supplier_id ?? NONE);
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
      supplier_id: supplierId === NONE ? null : supplierId,
      cnpj: d.cnpj || null,
      signed_at: d.signed_at || null,
      valid_from: d.valid_from || null,
      valid_to: d.valid_to || null,
      initial_value: money(d.initial_value),
      current_value: money(d.current_value) || money(d.initial_value),
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
        toast.error(`A quantidade não pode ser menor que o já reservado/consumido (${num(used, 3)}).`);
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

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from("contratos").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else toast.error("Não foi possível abrir o arquivo.");
  }

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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Contratos vigentes", value: String(totals.vigentes) },
          { label: "Valor contratado", value: brl(totals.total) },
          { label: "Valor consumido", value: brl(totals.consumed) },
          { label: "Reservado", value: brl(totals.reserved) },
          { label: "Saldo disponível", value: brl(totals.balance) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

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
        {filtered.map((c) => {
          const t = contractTotals(c);
          return (
            <div key={c.id} className="rounded-lg border bg-card shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="gov-title text-lg">Contrato {c.number}</h3>
                    <StatusBadge status={c.status} />
                    <Badge variant="outline">{label(CONTRACT_MODALITIES, c.modality)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{c.object}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.supplier ? c.supplier.trade_name || c.supplier.legal_name : "Sem fornecedor"} ·
                    {" "}Processo {c.process_number || "—"} · Vigência {dateBR(c.valid_from)} a {dateBR(c.valid_to)}
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
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => openNewItem(c)}>
                        <Package className="size-4" /> Novo item
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

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                        <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                          Nenhum item cadastrado neste contrato.
                        </TableCell>
                      </TableRow>
                    )}
                    {(c.items ?? []).map((i) => {
                      const b = itemBalance(i);
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">
                            {i.item_code ? `${i.item_code} — ` : ""}
                            {i.description}
                          </TableCell>
                          <TableCell>{MATERIAL_KIND_LABELS[i.material_kind] ?? i.material_kind}</TableCell>
                          <TableCell className="text-right">
                            {num(Number(i.quantity), 3)} {i.measure_unit}
                          </TableCell>
                          <TableCell className="text-right">{brl(Number(i.unit_price))}</TableCell>
                          <TableCell className="text-right">{num(Number(i.reserved_quantity), 3)}</TableCell>
                          <TableCell className="text-right">{num(Number(i.consumed_quantity), 3)}</TableCell>
                          <TableCell className="text-right font-medium">{num(b.quantity, 3)}</TableCell>
                          <TableCell className="text-right font-medium">{brl(b.value)}</TableCell>
                          <TableCell>
                            {canManageFinance && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Editar item"
                                onClick={() => openEditItem(c, i)}
                              >
                                <Pencil className="size-4" />
                              </Button>
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
      </div>

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
              <div className="sm:col-span-3">
                <Label htmlFor="object">Objeto *</Label>
                <Textarea id="object" name="object" defaultValue={editing?.object ?? ""} rows={2} required />
              </div>
              <div>
                <Label>Fornecedor contratado</Label>
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
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  name="cnpj"
                  defaultValue={editing?.cnpj ?? ""}
                  onChange={(e) => (e.currentTarget.value = maskCNPJ(e.currentTarget.value))}
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
                <Label htmlFor="signed_at">Assinatura</Label>
                <Input id="signed_at" name="signed_at" type="date" defaultValue={editing?.signed_at ?? ""} />
              </div>
              <div>
                <Label htmlFor="valid_from">Início da vigência</Label>
                <Input id="valid_from" name="valid_from" type="date" defaultValue={editing?.valid_from ?? ""} />
              </div>
              <div>
                <Label htmlFor="valid_to">Fim da vigência</Label>
                <Input id="valid_to" name="valid_to" type="date" defaultValue={editing?.valid_to ?? ""} />
              </div>
              <div>
                <Label htmlFor="initial_value">Valor global inicial (R$)</Label>
                <Input
                  id="initial_value"
                  name="initial_value"
                  inputMode="decimal"
                  defaultValue={editing ? String(editing.initial_value) : ""}
                />
              </div>
              <div>
                <Label htmlFor="current_value">Valor atual (R$)</Label>
                <Input
                  id="current_value"
                  name="current_value"
                  inputMode="decimal"
                  defaultValue={editing ? String(editing.current_value) : ""}
                />
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
                <Input
                  id="quantity"
                  name="quantity"
                  inputMode="decimal"
                  defaultValue={editingItem ? String(editingItem.quantity) : ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="unit_price">Valor unitário (R$) *</Label>
                <Input
                  id="unit_price"
                  name="unit_price"
                  inputMode="decimal"
                  defaultValue={editingItem ? String(editingItem.unit_price) : ""}
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
