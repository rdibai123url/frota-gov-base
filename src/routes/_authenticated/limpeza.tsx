import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ban, Droplets, Paperclip, Pencil, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { MoneyInput } from "@/components/form-fields";
import { ListPagination, usePaged } from "@/components/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CLEANING_STATUS,
  brl,
  dateTimeBR,
  dbMessage,
  label,

  openMaintenanceFile,
  parseBRNumber,
  supabase,
  uploadMaintenanceFile,
  useCleaningTypes,
  useCommitments,
  useContracts,
  useCostCenters,
  useInvalidate,
  usePerms,
  useQuotas,
  useSuppliers,
  useUnits,
  useVehicleCleanings,
  useVehicles,
  type CleaningStatus,
  type CleaningType,
  type VehicleCleaningRow,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/limpeza")({
  head: () => ({
    meta: [
      { title: "Limpeza da frota — FrotaGov" },
      {
        name: "description",
        content:
          "Registro de lavagem e higienização de veículos oficiais, com tipos de serviço, fornecedor, contrato, empenho, cota, valores e comprovantes.",
      },
      { property: "og:title", content: "Limpeza da frota — FrotaGov" },
      { property: "og:description", content: "Controle dos serviços de limpeza e higienização dos veículos do órgão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Limpeza,
});

const ALL = "__all__";
const NONE = "__none__";

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseBRNumber(s);
  return Number.isFinite(n) ? n : null;
};

const STATUS_VARIANT: Record<CleaningStatus, "default" | "secondary" | "destructive" | "outline"> = {
  agendada: "outline",
  realizada: "secondary",
  cancelada: "destructive",
};

const cleaningSchema = z.object({
  performed_at: z.string().min(1, "Informe a data e hora do serviço"),
  odometer_km: z.string().optional(),
  invoice_number: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1000).optional(),
});

function Limpeza() {
  const { data: cleanings = [], isLoading } = useVehicleCleanings();
  const { data: types = [] } = useCleaningTypes();
  const { data: vehicles = [] } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: suppliers = [] } = useSuppliers();
  const { data: contracts = [] } = useContracts();
  const { data: commitments = [] } = useCommitments();
  const { data: quotas = [] } = useQuotas();
  const { data: centers = [] } = useCostCenters();
  const { canManageFleet, orgId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleCleaningRow | null>(null);
  const [vehicle, setVehicle] = useState(NONE);
  const [unit, setUnit] = useState(NONE);
  const [supplier, setSupplier] = useState(NONE);
  const [contract, setContract] = useState(NONE);
  const [commitment, setCommitment] = useState(NONE);
  const [quota, setQuota] = useState(NONE);
  const [center, setCenter] = useState(NONE);
  const [status, setStatus] = useState<CleaningStatus>("realizada");
  const [selected, setSelected] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<VehicleCleaningRow | null>(null);

  const [typesOpen, setTypesOpen] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [typeDescription, setTypeDescription] = useState("");

  const [fStatus, setFStatus] = useState(ALL);
  const [fVehicle, setFVehicle] = useState(ALL);
  const [fType, setFType] = useState(ALL);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      cleanings.filter((c) => {
        if (fStatus !== ALL && c.status !== fStatus) return false;
        if (fVehicle !== ALL && c.vehicle_id !== fVehicle) return false;
        if (fType !== ALL && !(c.service_type_ids ?? []).includes(fType)) return false;
        const q = search.trim().toLowerCase();
        return (
          !q ||
          `${c.code ?? ""} ${(c.vehicle?.plate ?? c.vehicle?.asset_code ?? "")} ${(c.service_types ?? []).join(" ")} ${c.supplier?.legal_name ?? ""}`
            .toLowerCase()
            .includes(q)
        );
      }),
    [cleanings, fStatus, fVehicle, fType, search],
  );

  const paged = usePaged(filtered);

  const totals = useMemo(() => {
    const done = cleanings.filter((c) => c.status === "realizada");
    const month = new Date().toISOString().slice(0, 7);
    const noMes = done.filter((c) => (c.performed_at ?? "").slice(0, 7) === month);
    return {
      total: done.length,
      valor: done.reduce((s, c) => s + Number(c.total_value ?? 0), 0),
      mes: noMes.length,
      valorMes: noMes.reduce((s, c) => s + Number(c.total_value ?? 0), 0),
      agendadas: cleanings.filter((c) => c.status === "agendada").length,
    };
  }, [cleanings]);

  function openNew() {
    setEditing(null);
    setVehicle(NONE);
    setUnit(NONE);
    setSupplier(NONE);
    setContract(NONE);
    setCommitment(NONE);
    setQuota(NONE);
    setCenter(NONE);
    setStatus("realizada");
    setSelected([]);
    setFile(null);
    setOpen(true);
  }

  function openEdit(c: VehicleCleaningRow) {
    setEditing(c);
    setVehicle(c.vehicle_id);
    setUnit(c.unit_id ?? NONE);
    setSupplier(c.supplier_id ?? NONE);
    setContract(c.contract_id ?? NONE);
    setCommitment(c.commitment_id ?? NONE);
    setQuota(c.quota_id ?? NONE);
    setCenter(c.cost_center_id ?? NONE);
    setStatus(c.status);
    setSelected(c.service_type_ids ?? []);
    setFile(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    const fd = new FormData(e.currentTarget);
    const parsed = cleaningSchema.safeParse({
      performed_at: String(fd.get("performed_at") ?? ""),
      odometer_km: String(fd.get("odometer_km") ?? ""),
      invoice_number: String(fd.get("invoice_number") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os campos");
      return;
    }
    if (vehicle === NONE) {
      toast.error("Selecione o veículo");
      return;
    }
    if (selected.length === 0) {
      toast.error("Selecione ao menos um tipo de serviço de limpeza");
      return;
    }

    setSaving(true);
    try {
      let attachment = editing?.attachment_path ?? null;
      if (file) attachment = await uploadMaintenanceFile(orgId, file, "limpeza");

      const payload = {
        organization_id: orgId,
        vehicle_id: vehicle,
        unit_id: unit === NONE ? null : unit,
        performed_at: new Date(parsed.data.performed_at).toISOString(),
        odometer_km: numOrNull(fd.get("odometer_km")),
        service_type_ids: selected,
        supplier_id: supplier === NONE ? null : supplier,
        contract_id: contract === NONE ? null : contract,
        commitment_id: commitment === NONE ? null : commitment,
        quota_id: quota === NONE ? null : quota,
        cost_center_id: center === NONE ? null : center,
        total_value: numOrNull(fd.get("total_value")) ?? 0,
        invoice_number: parsed.data.invoice_number || null,
        notes: parsed.data.notes || null,
        attachment_path: attachment,
        status,
      };

      const { error } = editing
        ? await supabase.from("vehicle_cleanings").update(payload).eq("id", editing.id)
        : await supabase.from("vehicle_cleanings").insert(payload);
      if (error) throw error;

      toast.success(editing ? "Serviço de limpeza atualizado." : "Serviço de limpeza registrado.");
      setOpen(false);
      invalidate(["vehicle-cleanings", "vehicles", "commitments", "quotas", "contracts"]);
    } catch (error) {
      toast.error(dbMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cancelTarget) return;
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    if (reason.length < 5) {
      toast.error("Descreva o motivo do cancelamento");
      return;
    }
    const { error } = await supabase
      .from("vehicle_cleanings")
      .update({ status: "cancelada", cancel_reason: reason })
      .eq("id", cancelTarget.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Serviço de limpeza cancelado; o saldo, quando consumido, foi estornado.");
    setCancelOpen(false);
    setCancelTarget(null);
    invalidate(["vehicle-cleanings", "commitments", "quotas", "contracts"]);
  }

  async function saveType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    const name = typeName.trim();
    if (name.length < 3) {
      toast.error("Informe o nome do tipo de limpeza");
      return;
    }
    const { error } = await supabase.from("cleaning_types").insert({
      organization_id: orgId,
      name,
      description: typeDescription.trim() || null,
      sort_order: (types.at(-1)?.sort_order ?? 0) + 10,
    });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    setTypeName("");
    setTypeDescription("");
    toast.success("Tipo de limpeza cadastrado.");
    invalidate(["cleaning-types"]);
  }

  async function toggleType(t: CleaningType, active: boolean) {
    const { error } = await supabase.from("cleaning_types").update({ active }).eq("id", t.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    invalidate(["cleaning-types"]);
  }

  const activeTypes = types.filter((t) => t.active || selected.includes(t.id));

  return (
    <div>
      <PageHeader
        title="Limpeza da frota"
        description="Lavagem e higienização dos veículos oficiais, com tipos de serviço, fornecedor, contrato, empenho ou cota, valores e comprovantes."
        action={
          canManageFleet ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setTypesOpen(true)}>
                <Settings2 className="mr-2 size-4" /> Tipos de limpeza
              </Button>
              <Button onClick={openNew}>
                <Plus className="mr-2 size-4" /> Novo serviço de limpeza
              </Button>
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Serviços realizados" value={String(totals.total)} hint="Todo o período" />
        <Card title="Gasto acumulado" value={brl(totals.valor)} hint="Serviços realizados" />
        <Card title="No mês corrente" value={`${totals.mes} · ${brl(totals.valorMes)}`} hint="Quantidade e valor" />
        <Card title="Agendados" value={String(totals.agendadas)} hint="Ainda não realizados" />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
        <Input
          placeholder="Buscar por código, placa, serviço ou fornecedor"
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as situações</SelectItem>
            {CLEANING_STATUS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fVehicle} onValueChange={setFVehicle}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Veículo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os veículos</SelectItem>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {(v.plate ?? v.asset_code)} — {v.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fType} onValueChange={setFType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Tipo de serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mx-4 mb-8 overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Serviços</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Carregando serviços de limpeza…
                </TableCell>
              </TableRow>
            ) : paged.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <Droplets className="mx-auto mb-2 size-6" />
                  Nenhum serviço de limpeza registrado com os filtros atuais.
                </TableCell>
              </TableRow>
            ) : (
              paged.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.code ?? "—"}</TableCell>
                  <TableCell>
                    {(c.vehicle?.plate ?? c.vehicle?.asset_code ?? "—")}
                    <div className="text-xs text-muted-foreground">{c.vehicle?.model ?? ""}</div>
                  </TableCell>
                  <TableCell>{dateTimeBR(c.performed_at)}</TableCell>
                  <TableCell className="max-w-64">
                    <div className="flex flex-wrap gap-1">
                      {(c.service_types ?? []).map((s) => (
                        <Badge key={s} variant="outline">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{c.supplier?.trade_name ?? c.supplier?.legal_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{brl(Number(c.total_value ?? 0))}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status]}>{label(CLEANING_STATUS, c.status)}</Badge>
                    {c.status === "cancelada" && c.cancel_reason ? (
                      <div className="text-xs text-muted-foreground">{c.cancel_reason}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.attachment_path ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Abrir comprovante"
                          onClick={() => openMaintenanceFile(c.attachment_path!).catch((e) => toast.error(dbMessage(e)))}
                        >
                          <Paperclip className="size-4" />
                        </Button>
                      ) : null}
                      {canManageFleet && c.status !== "cancelada" ? (
                        <>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(c)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Cancelar"
                            onClick={() => {
                              setCancelTarget(c);
                              setCancelOpen(true);
                            }}
                          >
                            <Ban className="size-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      {/* -------------------------- cadastro/edição -------------------------- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar limpeza ${editing.code ?? ""}` : "Novo serviço de limpeza"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Veículo</Label>
              <Select value={vehicle} onValueChange={setVehicle}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Selecione</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {(v.plate ?? v.asset_code)} — {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Unidade</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Herda do veículo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Herdar do veículo</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="performed_at">Data e hora do serviço</Label>
              <Input
                id="performed_at"
                name="performed_at"
                type="datetime-local"
                defaultValue={(editing?.performed_at ?? new Date().toISOString()).slice(0, 16)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="odometer_km">Quilometragem</Label>
              <Input
                id="odometer_km"
                name="odometer_km"
                inputMode="decimal"
                defaultValue={editing?.odometer_km != null ? String(editing.odometer_km) : ""}
                placeholder="Opcional"
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label>Tipos de serviço executados</Label>
              <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                {activeTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Cadastre um tipo de limpeza para começar.</p>
                ) : (
                  activeTypes.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selected.includes(t.id)}
                        onCheckedChange={(v) =>
                          setSelected((prev) => (v ? [...prev, t.id] : prev.filter((id) => id !== t.id)))
                        }
                      />
                      <span>{t.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Fornecedor / lava-jato</Label>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.trade_name ?? s.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Contrato</Label>
              <Select value={contract} onValueChange={setContract}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
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
            <div className="grid gap-2">
              <Label>Empenho</Label>
              <Select value={commitment} onValueChange={setCommitment}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem empenho</SelectItem>
                  {commitments.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Cota</Label>
              <Select value={quota} onValueChange={setQuota}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem cota</SelectItem>
                  {quotas.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Centro de custo</Label>
              <Select value={center} onValueChange={setCenter}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {centers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="total_value">Valor total</Label>
              <MoneyInput id="total_value" name="total_value" defaultValue={editing?.total_value ?? 0} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invoice_number">Nota fiscal</Label>
              <Input id="invoice_number" name="invoice_number" defaultValue={editing?.invoice_number ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label>Situação</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CleaningStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLEANING_STATUS.filter((s) => s.value !== "cancelada").map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" rows={3} defaultValue={editing?.notes ?? ""} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="file">Comprovante (opcional)</Label>
              <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ------------------------------ cancelar ----------------------------- */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar serviço de limpeza {cancelTarget?.code ?? ""}</DialogTitle>
          </DialogHeader>
          <form onSubmit={confirmCancel} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="reason">Motivo do cancelamento</Label>
              <Textarea id="reason" name="reason" rows={3} required />
              <p className="text-xs text-muted-foreground">
                O registro é mantido no histórico para auditoria e o saldo consumido é estornado automaticamente.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                Voltar
              </Button>
              <Button type="submit" variant="destructive">
                Confirmar cancelamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* --------------------------- tipos de limpeza ------------------------ */}
      <Dialog open={typesOpen} onOpenChange={setTypesOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tipos de limpeza</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="lista">
            <TabsList>
              <TabsTrigger value="lista">Cadastrados</TabsTrigger>
              <TabsTrigger value="novo">Novo tipo</TabsTrigger>
            </TabsList>
            <TabsContent value="lista" className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Ativo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.description ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={t.active}
                          disabled={!canManageFleet}
                          onCheckedChange={(v) => toggleType(t, v)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="novo" className="pt-4">
              <form onSubmit={saveType} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="type-name">Nome do tipo</Label>
                  <Input id="type-name" value={typeName} onChange={(e) => setTypeName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type-description">Descrição</Label>
                  <Input
                    id="type-description"
                    value={typeDescription}
                    onChange={(e) => setTypeDescription(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={!canManageFleet}>
                    Cadastrar tipo
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
