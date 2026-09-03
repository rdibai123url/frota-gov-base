import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Landmark, AlertTriangle } from "lucide-react";
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
  COMMITMENT_KINDS,
  COMMITMENT_STATUS,
  brl,
  dateBR,
  label,
  num,
  pct,
  supabase,
  useCommitments,
  useContracts,
  useCostCenters,
  useInvalidate,
  usePerms,
  useSuppliers,
  useUnits,
  type CommitmentRow,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/empenhos")({
  head: () => ({
    meta: [
      { title: "Empenhos — FrotaGov" },
      {
        name: "description",
        content:
          "Empenhos orçamentários da frota: dotação, fonte de recurso, elemento de despesa, valor empenhado, consumido e saldo disponível.",
      },
      { property: "og:title", content: "Empenhos — FrotaGov" },
      { property: "og:description", content: "Controle de empenhos e saldos orçamentários do órgão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Empenhos,
});

const ALL = "__all__";
const NONE = "__none__";
const money = (v: string | undefined) => Number(String(v ?? "0").replace(/\./g, "").replace(",", ".")) || 0;

const schema = z.object({
  number: z.string().trim().min(1, "Informe o número do empenho").max(40),
  exercise: z.string().min(4, "Informe o exercício"),
  issued_at: z.string().min(1, "Informe a data do empenho"),
  budget_allocation: z.string().trim().max(120).optional(),
  resource_source: z.string().trim().max(120).optional(),
  expense_element: z.string().trim().max(120).optional(),
  committed_value: z.string().min(1, "Informe o valor empenhado"),
  cancelled_value: z.string().optional(),
  notes: z.string().trim().max(600).optional(),
});

function Empenhos() {
  const { data: commitments = [], isLoading } = useCommitments();
  const { data: contracts = [] } = useContracts();
  const { data: suppliers = [] } = useSuppliers();
  const { data: centers = [] } = useCostCenters();
  const { data: units = [] } = useUnits();
  const { canManageFinance, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CommitmentRow | null>(null);
  const [kind, setKind] = useState("estimativo");
  const [status, setStatus] = useState("ativo");
  const [contractId, setContractId] = useState(NONE);
  const [supplierId, setSupplierId] = useState(NONE);
  const [centerId, setCenterId] = useState(NONE);
  const [unitId, setUnitId] = useState(NONE);
  const [saving, setSaving] = useState(false);

  const [fExercise, setFExercise] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fUnit, setFUnit] = useState(ALL);
  const [fCenter, setFCenter] = useState(ALL);
  const [search, setSearch] = useState("");

  const exercises = useMemo(
    () => Array.from(new Set(commitments.map((c) => String(c.exercise)))).sort().reverse(),
    [commitments],
  );

  const filtered = useMemo(
    () =>
      commitments.filter((c) => {
        if (fExercise !== ALL && String(c.exercise) !== fExercise) return false;
        if (fStatus !== ALL && c.status !== fStatus) return false;
        if (fUnit !== ALL && (c.unit_id ?? NONE) !== fUnit) return false;
        if (fCenter !== ALL && (c.cost_center_id ?? NONE) !== fCenter) return false;
        const q = search.trim().toLowerCase();
        return !q || `${c.number} ${c.budget_allocation ?? ""} ${c.resource_source ?? ""}`.toLowerCase().includes(q);
      }),
    [commitments, fExercise, fStatus, fUnit, fCenter, search],
  );

  const totals = useMemo(
    () => ({
      ativos: filtered.filter((c) => c.status === "ativo").length,
      committed: filtered.reduce((s, c) => s + Number(c.committed_value), 0),
      consumed: filtered.reduce((s, c) => s + Number(c.consumed_value), 0),
      reserved: filtered.reduce((s, c) => s + Number(c.reserved_value), 0),
      available: filtered.reduce((s, c) => s + Number(c.available_value), 0),
    }),
    [filtered],
  );

  function openNew() {
    setEditing(null);
    setKind("estimativo");
    setStatus("ativo");
    setContractId(NONE);
    setSupplierId(NONE);
    setCenterId(NONE);
    setUnitId(NONE);
    setOpen(true);
  }

  function openEdit(c: CommitmentRow) {
    setEditing(c);
    setKind(c.kind);
    setStatus(c.status);
    setContractId(c.contract_id ?? NONE);
    setSupplierId(c.supplier_id ?? NONE);
    setCenterId(c.cost_center_id ?? NONE);
    setUnitId(c.unit_id ?? NONE);
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
    const committed = money(d.committed_value);
    const cancelled = money(d.cancelled_value);
    if (!(committed > 0)) {
      toast.error("O valor empenhado deve ser maior que zero.");
      return;
    }
    if (editing) {
      const used = Number(editing.consumed_value) + Number(editing.reserved_value);
      if (committed - cancelled < used) {
        toast.error(`O valor líquido não pode ficar abaixo do já reservado/consumido (${brl(used)}).`);
        return;
      }
    }
    setSaving(true);
    const payload = {
      number: d.number,
      exercise: Number(d.exercise),
      issued_at: d.issued_at,
      kind: kind as CommitmentRow["kind"],
      status: status as CommitmentRow["status"],
      contract_id: contractId === NONE ? null : contractId,
      supplier_id: supplierId === NONE ? null : supplierId,
      cost_center_id: centerId === NONE ? null : centerId,
      unit_id: unitId === NONE ? null : unitId,
      budget_allocation: d.budget_allocation || null,
      resource_source: d.resource_source || null,
      expense_element: d.expense_element || null,
      committed_value: committed,
      cancelled_value: cancelled,
      notes: d.notes || null,
    };
    const { error } = editing
      ? await supabase.from("commitments").update(payload).eq("id", editing.id)
      : await supabase.from("commitments").insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Já existe um empenho com esse número neste exercício."
          : "Não foi possível salvar o empenho.",
      );
      return;
    }
    toast.success(editing ? "Empenho atualizado." : "Empenho cadastrado.");
    invalidate(["commitments"]);
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="Empenhos"
        description="Empenhos orçamentários que sustentam as autorizações e os abastecimentos da frota."
        action={
          canManageFinance && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo empenho
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Empenhos ativos", value: String(totals.ativos) },
          { label: "Valor empenhado", value: brl(totals.committed) },
          { label: "Consumido", value: brl(totals.consumed) },
          { label: "Reservado", value: brl(totals.reserved) },
          { label: "Saldo disponível", value: brl(totals.available) },
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
          <Input placeholder="Número, dotação ou fonte" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label>Exercício</Label>
          <Select value={fExercise} onValueChange={setFExercise}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {exercises.map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {COMMITMENT_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
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
              <TableHead>Empenho</TableHead>
              <TableHead>Exercício / data</TableHead>
              <TableHead>Contrato / fornecedor</TableHead>
              <TableHead>Dotação / fonte</TableHead>
              <TableHead className="text-right">Empenhado</TableHead>
              <TableHead className="text-right">Consumido</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12" />
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
                  <Landmark className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhum empenho encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c) => {
              const liquido = Number(c.committed_value) - Number(c.cancelled_value);
              const restante = pct(Number(c.available_value), liquido);
              const baixo = c.status === "ativo" && restante <= 20;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.number}
                    <span className="block text-xs text-muted-foreground">{label(COMMITMENT_KINDS, c.kind)}</span>
                  </TableCell>
                  <TableCell>
                    {c.exercise}
                    <span className="block text-xs text-muted-foreground">{dateBR(c.issued_at)}</span>
                  </TableCell>
                  <TableCell>
                    {c.contract ? `Contrato ${c.contract.number}` : "Sem contrato"}
                    <span className="block text-xs text-muted-foreground">
                      {c.supplier ? c.supplier.trade_name || c.supplier.legal_name : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {c.budget_allocation || "—"}
                    <span className="block text-xs">{c.resource_source || ""}</span>
                  </TableCell>
                  <TableCell className="text-right">{brl(Number(c.committed_value))}</TableCell>
                  <TableCell className="text-right">{brl(Number(c.consumed_value))}</TableCell>
                  <TableCell className="text-right font-medium">
                    {brl(Number(c.available_value))}
                    <span className="block text-xs text-muted-foreground">{num(restante, 1)}%</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant={c.status === "ativo" ? "default" : "secondary"}>
                        {label(COMMITMENT_STATUS, c.status)}
                      </Badge>
                      {baixo && <AlertTriangle className="size-4 text-warning" aria-label="Saldo baixo" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManageFinance && (
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(c)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar empenho ${editing.number}` : "Novo empenho"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="number">Número *</Label>
                <Input id="number" name="number" defaultValue={editing?.number ?? ""} required />
              </div>
              <div>
                <Label htmlFor="exercise">Exercício *</Label>
                <Input
                  id="exercise"
                  name="exercise"
                  type="number"
                  defaultValue={editing?.exercise ?? new Date().getFullYear()}
                  required
                />
              </div>
              <div>
                <Label htmlFor="issued_at">Data *</Label>
                <Input
                  id="issued_at"
                  name="issued_at"
                  type="date"
                  defaultValue={editing?.issued_at ?? new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMITMENT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Contrato</Label>
                <Select value={contractId} onValueChange={setContractId}>
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
                <Label>Fornecedor</Label>
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
                <Label>Centro de custo</Label>
                <Select value={centerId} onValueChange={setCenterId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
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
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.acronym ? `${u.acronym} — ${u.name}` : u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMITMENT_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="budget_allocation">Dotação orçamentária</Label>
                <Input id="budget_allocation" name="budget_allocation" defaultValue={editing?.budget_allocation ?? ""} />
              </div>
              <div>
                <Label htmlFor="resource_source">Fonte de recurso</Label>
                <Input id="resource_source" name="resource_source" defaultValue={editing?.resource_source ?? ""} />
              </div>
              <div>
                <Label htmlFor="expense_element">Elemento de despesa</Label>
                <Input id="expense_element" name="expense_element" defaultValue={editing?.expense_element ?? ""} />
              </div>
              <div>
                <Label htmlFor="committed_value">Valor empenhado (R$) *</Label>
                <Input
                  id="committed_value"
                  name="committed_value"
                  inputMode="decimal"
                  defaultValue={editing ? String(editing.committed_value) : ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="cancelled_value">Valor anulado (R$)</Label>
                <Input
                  id="cancelled_value"
                  name="cancelled_value"
                  inputMode="decimal"
                  defaultValue={editing ? String(editing.cancelled_value) : ""}
                />
              </div>
              {editing && (
                <div>
                  <Label>Consumido / reservado</Label>
                  <p className="pt-2 text-sm">
                    {brl(Number(editing.consumed_value))} / {brl(Number(editing.reserved_value))}
                  </p>
                </div>
              )}
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
                {saving ? "Salvando…" : "Salvar empenho"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
