import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, PiggyBank, TrendingUp, History } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { MoneyInput, LitersInput } from "@/components/form-fields";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  MEASURE_UNITS,
  QUOTA_TYPES,
  brl,
  dateBR,
  dateTimeBR,
  dbMessage,
  label,
  num,
  quotaPercent,
  supabase,
  useCommitments,
  useContractItems,
  useContracts,
  useCostCenters,
  useInvalidate,
  usePerms,
  useQuotaSupplements,
  useQuotas,
  useUnits,
  type QuotaRow,
  parseBRNumber,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/cotas")({
  head: () => ({
    meta: [
      { title: "Cotas e saldos — FrotaGov" },
      {
        name: "description",
        content:
          "Cotas financeiras e quantitativas por contrato, item, empenho, centro de custo ou unidade, com reservas, consumo, saldo e suplementações.",
      },
      { property: "og:title", content: "Cotas e saldos — FrotaGov" },
      { property: "og:description", content: "Controle de cotas, reservas e saldos disponíveis da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cotas,
});

const ALL = "__all__";
const NONE = "__none__";
const money = (v: string | undefined) => parseBRNumber(v);

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome da cota").max(120),
  granted_amount: z.string().min(1, "Informe o valor/quantidade concedida"),
  valid_from: z.string().min(1, "Informe a vigência inicial"),
  valid_to: z.string().optional(),
  notes: z.string().trim().max(600).optional(),
});

function amountOf(q: QuotaRow, v: number) {
  return q.quota_type === "financeira" ? brl(v) : `${num(v, 3)} ${q.measure_unit}`;
}

function Cotas() {
  const { data: quotas = [], isLoading } = useQuotas();
  const { data: contracts = [] } = useContracts();
  const { data: items = [] } = useContractItems();
  const { data: commitments = [] } = useCommitments();
  const { data: centers = [] } = useCostCenters();
  const { data: units = [] } = useUnits();
  const { canManageFinance, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<QuotaRow | null>(null);
  const [quotaType, setQuotaType] = useState("financeira");
  const [measureUnit, setMeasureUnit] = useState("litro");
  const [contractId, setContractId] = useState(NONE);
  const [itemId, setItemId] = useState(NONE);
  const [commitmentId, setCommitmentId] = useState(NONE);
  const [centerId, setCenterId] = useState(NONE);
  const [unitId, setUnitId] = useState(NONE);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [suppOf, setSuppOf] = useState<QuotaRow | null>(null);
  const { data: supplements = [] } = useQuotaSupplements(suppOf?.id ?? null);

  const [fType, setFType] = useState(ALL);
  const [fUnit, setFUnit] = useState(ALL);
  const [fCenter, setFCenter] = useState(ALL);
  const [fContract, setFContract] = useState(ALL);
  const [search, setSearch] = useState("");

  const itemsOfContract = useMemo(
    () => (contractId === NONE ? items : items.filter((i) => i.contract_id === contractId)),
    [items, contractId],
  );

  const filtered = useMemo(
    () =>
      quotas.filter((q) => {
        if (fType !== ALL && q.quota_type !== fType) return false;
        if (fUnit !== ALL && (q.unit_id ?? NONE) !== fUnit) return false;
        if (fCenter !== ALL && (q.cost_center_id ?? NONE) !== fCenter) return false;
        if (fContract !== ALL && (q.contract_id ?? NONE) !== fContract) return false;
        const s = search.trim().toLowerCase();
        return !s || q.name.toLowerCase().includes(s);
      }),
    [quotas, fType, fUnit, fCenter, fContract, search],
  );

  const totals = useMemo(() => {
    const fin = filtered.filter((q) => q.quota_type === "financeira");
    return {
      count: filtered.length,
      granted: fin.reduce((s, q) => s + Number(q.granted_amount), 0),
      reserved: fin.reduce((s, q) => s + Number(q.reserved_amount), 0),
      consumed: fin.reduce((s, q) => s + Number(q.consumed_amount), 0),
      balance: fin.reduce((s, q) => s + Number(q.balance_amount ?? 0), 0),
      criticas: filtered.filter(
        (q) => q.active && Number(q.granted_amount) > 0 && 100 - quotaPercent(q) <= 20,
      ).length,
    };
  }, [filtered]);

  function openNew() {
    setEditing(null);
    setQuotaType("financeira");
    setMeasureUnit("litro");
    setContractId(NONE);
    setItemId(NONE);
    setCommitmentId(NONE);
    setCenterId(NONE);
    setUnitId(NONE);
    setActive(true);
    setOpen(true);
  }

  function openEdit(q: QuotaRow) {
    setEditing(q);
    setQuotaType(q.quota_type);
    setMeasureUnit(q.measure_unit);
    setContractId(q.contract_id ?? NONE);
    setItemId(q.contract_item_id ?? NONE);
    setCommitmentId(q.commitment_id ?? NONE);
    setCenterId(q.cost_center_id ?? NONE);
    setUnitId(q.unit_id ?? NONE);
    setActive(q.active);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const d = parsed.data;
    const granted = money(d.granted_amount);
    if (!(granted > 0)) {
      toast.error("O valor/quantidade concedida deve ser maior que zero.");
      return;
    }
    if (d.valid_to && d.valid_to < d.valid_from) {
      toast.error("A vigência final deve ser posterior à inicial.");
      return;
    }
    if (editing) {
      const used = Number(editing.consumed_amount) + Number(editing.reserved_amount);
      if (granted < used) {
        toast.error("A cota não pode ficar abaixo do já reservado/consumido. Use a suplementação para ampliar.");
        return;
      }
    }
    setSaving(true);
    const payload = {
      name: d.name,
      quota_type: quotaType as QuotaRow["quota_type"],
      measure_unit: quotaType === "financeira" ? "R$" : measureUnit,
      contract_id: contractId === NONE ? null : contractId,
      contract_item_id: itemId === NONE ? null : itemId,
      commitment_id: commitmentId === NONE ? null : commitmentId,
      cost_center_id: centerId === NONE ? null : centerId,
      unit_id: unitId === NONE ? null : unitId,
      granted_amount: granted,
      valid_from: d.valid_from,
      valid_to: d.valid_to || null,
      active,
      notes: d.notes || null,
    };
    const { error } = editing
      ? await supabase.from("quotas").update(payload).eq("id", editing.id)
      : await supabase.from("quotas").insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error) || "Não foi possível salvar a cota.");
      return;
    }
    toast.success(editing ? "Cota atualizada." : "Cota criada.");
    invalidate(["quotas"]);
    setOpen(false);
  }

  async function onSupplement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!suppOf) return;
    const fd = new FormData(e.currentTarget);
    const amount = money(String(fd.get("amount") ?? ""));
    const reason = String(fd.get("reason") ?? "").trim();
    if (!(amount > 0)) {
      toast.error("Informe um valor/quantidade maior que zero.");
      return;
    }
    if (reason.length < 5) {
      toast.error("Informe a justificativa da suplementação.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("quota_supplements").insert({
      quota_id: suppOf.id,
      organization_id: suppOf.organization_id,
      amount,
      reason,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error) || "Não foi possível suplementar a cota.");
      return;
    }
    toast.success("Suplementação registrada.");
    invalidate(["quotas", "quota-supplements"]);
    e.currentTarget.reset();
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Cotas e saldos"
        description="Cotas financeiras e quantitativas aplicadas a contratos, itens, empenhos, centros de custo e unidades."
        action={
          canManageFinance && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Nova cota
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Cotas cadastradas", value: String(totals.count) },
          { label: "Concedido (R$)", value: brl(totals.granted) },
          { label: "Reservado (R$)", value: brl(totals.reserved) },
          { label: "Consumido (R$)", value: brl(totals.consumed) },
          { label: "Saldo crítico", value: String(totals.criticas) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label>Buscar</Label>
          <Input placeholder="Nome da cota" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {QUOTA_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Contrato</Label>
          <Select value={fContract} onValueChange={setFContract}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {contracts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Unidade</Label>
          <Select value={fUnit} onValueChange={setFUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.acronym ?? u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Centro de custo</Label>
          <Select value={fCenter} onValueChange={setFCenter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {centers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} — {c.name}
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
              <TableHead>Cota</TableHead>
              <TableHead>Vinculação</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead className="text-right">Concedido</TableHead>
              <TableHead className="text-right">Reservado</TableHead>
              <TableHead className="text-right">Consumido</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">% usado</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  <PiggyBank className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma cota cadastrada. Crie cotas para limitar o consumo por unidade, contrato ou empenho.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((q) => {
              const usado = quotaPercent(q);
              const restante = 100 - usado;
              return (
                <TableRow key={q.id} className={q.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">
                    {q.name}
                    <span className="block text-xs text-muted-foreground">
                      {label(QUOTA_TYPES, q.quota_type)}
                      {!q.active && " · inativa"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[
                      q.contract && `Contrato ${q.contract.number}`,
                      q.item?.description,
                      q.commitment && `Empenho ${q.commitment.number}`,
                      q.cost_center && `CC ${q.cost_center.code}`,
                      q.unit && (q.unit.acronym ?? q.unit.name),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Órgão"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dateBR(q.valid_from)} a {q.valid_to ? dateBR(q.valid_to) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{amountOf(q, Number(q.granted_amount))}</TableCell>
                  <TableCell className="text-right">{amountOf(q, Number(q.reserved_amount))}</TableCell>
                  <TableCell className="text-right">{amountOf(q, Number(q.consumed_amount))}</TableCell>
                  <TableCell className="text-right font-medium">
                    {amountOf(q, Number(q.balance_amount ?? 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={restante <= 10 ? "destructive" : restante <= 20 ? "outline" : "secondary"}>
                      {num(usado, 1)}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Suplementar cota"
                        onClick={() => setSuppOf(q)}
                        disabled={!canManageFinance}
                      >
                        <TrendingUp className="size-4" />
                      </Button>
                      {canManageFinance && (
                        <Button variant="ghost" size="icon" aria-label="Editar cota" onClick={() => openEdit(q)}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar cota ${editing.name}` : "Nova cota"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Nome da cota *</Label>
                <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={quotaType} onValueChange={setQuotaType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTA_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {quotaType === "quantitativa" && (
                <div>
                  <Label>Unidade de medida</Label>
                  <Select value={measureUnit} onValueChange={setMeasureUnit}>
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
              )}
              <div>
                <Label>Contrato</Label>
                <Select
                  value={contractId}
                  onValueChange={(v) => {
                    setContractId(v);
                    setItemId(NONE);
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
                <Label>Item do contrato</Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem item</SelectItem>
                    {itemsOfContract.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Empenho</Label>
                <Select value={commitmentId} onValueChange={setCommitmentId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem empenho</SelectItem>
                    {commitments.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.number} / {c.exercise}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Centro de custo</Label>
                <Select value={centerId} onValueChange={setCenterId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem centro de custo</SelectItem>
                    {centers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Todo o órgão</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.acronym ? `${u.acronym} — ${u.name}` : u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="granted_amount">
                  {quotaType === "financeira" ? "Valor concedido (R$) *" : "Quantidade concedida *"}
                </Label>
                {quotaType === "financeira" ? (
                  <MoneyInput
                    id="granted_amount"
                    name="granted_amount"
                    defaultValue={editing ? Number(editing.granted_amount) : ""}
                    required
                  />
                ) : (
                  <LitersInput
                    id="granted_amount"
                    name="granted_amount"
                    defaultValue={editing ? Number(editing.granted_amount) : ""}
                    required
                  />
                )}
              </div>
              <div>
                <Label htmlFor="valid_from">Vigência inicial *</Label>
                <Input
                  id="valid_from"
                  name="valid_from"
                  type="date"
                  defaultValue={editing?.valid_from ?? new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="valid_to">Vigência final</Label>
                <Input id="valid_to" name="valid_to" type="date" defaultValue={editing?.valid_to ?? ""} />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch id="active" checked={active} onCheckedChange={setActive} />
                <Label htmlFor="active">Cota ativa</Label>
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" defaultValue={editing?.notes ?? ""} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar cota"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!suppOf} onOpenChange={(o) => !o && setSuppOf(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Suplementação — {suppOf?.name}</DialogTitle>
          </DialogHeader>
          {suppOf && (
            <>
              <div className="grid gap-3 rounded-md border bg-muted/40 p-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Concedido</p>
                  <p className="font-medium">{amountOf(suppOf, Number(suppOf.granted_amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reservado</p>
                  <p className="font-medium">{amountOf(suppOf, Number(suppOf.reserved_amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Consumido</p>
                  <p className="font-medium">{amountOf(suppOf, Number(suppOf.consumed_amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="font-medium">{amountOf(suppOf, Number(suppOf.balance_amount ?? 0))}</p>
                </div>
              </div>

              {canManageFinance && (
                <form onSubmit={onSupplement} className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="amount">
                      {suppOf.quota_type === "financeira" ? "Valor a suplementar (R$)" : "Quantidade a suplementar"}
                    </Label>
                    {suppOf.quota_type === "financeira" ? (
                      <MoneyInput id="amount" name="amount" required />
                    ) : (
                      <LitersInput id="amount" name="amount" required />
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="reason">Justificativa</Label>
                    <Input id="reason" name="reason" required minLength={5} />
                  </div>
                  <div className="sm:col-span-3 flex justify-end">
                    <Button type="submit" disabled={saving} className="gap-2">
                      <TrendingUp className="size-4" /> Registrar suplementação
                    </Button>
                  </div>
                </form>
              )}

              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <History className="size-4" /> Histórico de suplementações
                </p>
                {supplements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma suplementação registrada para esta cota.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Valor/Qtd.</TableHead>
                        <TableHead>Justificativa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplements.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{dateTimeBR(s.created_at)}</TableCell>
                          <TableCell className="text-right">{amountOf(suppOf, Number(s.amount))}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
