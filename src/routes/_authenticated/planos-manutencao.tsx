import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ClipboardList, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  DUE_LABELS,
  MAINTENANCE_SERVICE_TYPES,
  VEHICLE_TYPES,
  dateBR,
  dbMessage,
  num,
  planDue,
  supabase,
  useInvalidate,
  useMaintenanceLead,
  useMaintenancePlanItems,
  useMaintenancePlans,
  usePerms,
  useVehicles,
  type MaintenancePlanRow,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/planos-manutencao")({
  head: () => ({
    meta: [
      { title: "Planos de manutenção preventiva — FrotaGov" },
      {
        name: "description",
        content:
          "Planos preventivos por veículo ou tipo de veículo, com periodicidade por quilometragem, horímetro e meses, tolerâncias e situação de vencimento.",
      },
      { property: "og:title", content: "Planos de manutenção preventiva — FrotaGov" },
      { property: "og:description", content: "Periodicidade preventiva da frota por KM, horímetro e prazo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Planos,
});

const ALL = "__all__";
const NONE = "__none__";

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome do plano").max(120),
  description: z.string().trim().max(600).optional(),
  interval_km: z.string().optional(),
  interval_hours: z.string().optional(),
  interval_months: z.string().optional(),
  tolerance_km: z.string().optional(),
  tolerance_hours: z.string().optional(),
  tolerance_days: z.string().optional(),
  last_done_at: z.string().optional(),
  last_done_km: z.string().optional(),
  notes: z.string().trim().max(600).optional(),
});

const numOrNull = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};

const DUE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ok: "secondary",
  proximo: "default",
  vencido: "destructive",
  sem_criterio: "outline",
};

function Planos() {
  const { data: plans = [], isLoading } = useMaintenancePlans();
  const { data: vehicles = [] } = useVehicles();
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const lead = useMaintenanceLead();

  const [open, setOpen] = useState(false);
  const [itemsPlan, setItemsPlan] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<MaintenancePlanRow | null>(null);
  const [serviceType, setServiceType] = useState(MAINTENANCE_SERVICE_TYPES[0]!);
  const [vehicleId, setVehicleId] = useState(NONE);
  const [vehicleType, setVehicleType] = useState(NONE);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fState, setFState] = useState(ALL);
  const [search, setSearch] = useState("");

  const rows = useMemo(
    () =>
      plans.flatMap((p) => {
        const targets = p.vehicle_id
          ? vehicles.filter((v) => v.id === p.vehicle_id)
          : vehicles.filter((v) => !p.vehicle_type || v.vehicle_type === p.vehicle_type);
        const list = targets.length ? targets : [null];
        return list.map((v) => ({ plan: p, vehicle: v, due: planDue(p, v, lead) }));
      }),
    [plans, vehicles, lead],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (fState !== ALL && r.due.state !== fState) return false;
        const q = search.trim().toLowerCase();
        return !q || `${r.plan.name} ${r.vehicle?.plate ?? ""} ${r.plan.service_type ?? ""}`.toLowerCase().includes(q);
      }),
    [rows, fState, search],
  );

  const totals = useMemo(
    () => ({
      planos: plans.filter((p) => p.active).length,
      vencidos: rows.filter((r) => r.due.state === "vencido").length,
      proximos: rows.filter((r) => r.due.state === "proximo").length,
      ok: rows.filter((r) => r.due.state === "ok").length,
    }),
    [plans, rows],
  );

  function openNew() {
    setEditing(null);
    setServiceType(MAINTENANCE_SERVICE_TYPES[0]!);
    setVehicleId(NONE);
    setVehicleType(NONE);
    setActive(true);
    setOpen(true);
  }

  function openEdit(p: MaintenancePlanRow) {
    setEditing(p);
    setServiceType(p.service_type ?? MAINTENANCE_SERVICE_TYPES[0]!);
    setVehicleId(p.vehicle_id ?? NONE);
    setVehicleType(p.vehicle_type ?? NONE);
    setActive(p.active);
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
    const km = numOrNull(d.interval_km);
    const hours = numOrNull(d.interval_hours);
    const months = numOrNull(d.interval_months);
    if (!km && !hours && !months) {
      toast.error("Informe pelo menos um critério: KM, horímetro ou meses.");
      return;
    }
    setSaving(true);
    const payload = {
      name: d.name,
      description: d.description || null,
      service_type: serviceType,
      vehicle_id: vehicleId === NONE ? null : vehicleId,
      vehicle_type: vehicleId === NONE && vehicleType !== NONE ? vehicleType : null,
      interval_km: km,
      interval_hours: hours,
      interval_months: months,
      tolerance_km: numOrNull(d.tolerance_km) ?? 0,
      tolerance_hours: numOrNull(d.tolerance_hours) ?? 0,
      tolerance_days: numOrNull(d.tolerance_days) ?? 0,
      last_done_at: d.last_done_at || null,
      last_done_km: numOrNull(d.last_done_km),
      active,
      notes: d.notes || null,
    };
    const { error } = editing
      ? await supabase.from("maintenance_plans").update({ ...payload, updated_by: userId }).eq("id", editing.id)
      : await supabase.from("maintenance_plans").insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(editing ? "Plano atualizado." : "Plano cadastrado.");
    invalidate(["maintenance-plans"]);
    setOpen(false);
  }

  async function removePlan(p: MaintenancePlanRow) {
    if (!confirm(`Inativar o plano "${p.name}"?`)) return;
    const { error } = await supabase.from("maintenance_plans").update({ active: false }).eq("id", p.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Plano inativado.");
    invalidate(["maintenance-plans"]);
  }

  return (
    <>
      <PageHeader
        title="Planos de manutenção preventiva"
        description="Periodicidade por quilometragem, horímetro e prazo — o primeiro critério que vencer gera o alerta."
        action={
          canManageFleet && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo plano
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Planos ativos", value: String(totals.planos) },
          { label: "Manutenções vencidas", value: String(totals.vencidos) },
          { label: "Próximas do vencimento", value: String(totals.proximos) },
          { label: "Em dia", value: String(totals.ok) },
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
          <Input placeholder="Plano, placa ou serviço" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={fState} onValueChange={setFState}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {Object.entries(DUE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
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
              <TableHead>Plano</TableHead>
              <TableHead>Abrangência</TableHead>
              <TableHead>Periodicidade</TableHead>
              <TableHead>Última execução</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <ClipboardList className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhum plano encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={`${r.plan.id}-${r.vehicle?.id ?? "sem"}`}>
                <TableCell className="font-medium">
                  {r.plan.name}
                  <span className="block text-xs text-muted-foreground">{r.plan.service_type ?? "—"}</span>
                </TableCell>
                <TableCell>
                  {r.vehicle ? `${r.vehicle.plate} — ${r.vehicle.brand ?? ""} ${r.vehicle.model ?? ""}` : "Sem veículo aplicável"}
                  <span className="block text-xs text-muted-foreground">
                    {r.plan.vehicle_id ? "Plano do veículo" : r.plan.vehicle_type ?? "Todos os tipos"}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {[
                    r.plan.interval_km ? `${num(Number(r.plan.interval_km), 0)} km` : null,
                    r.plan.interval_hours ? `${num(Number(r.plan.interval_hours), 1)} h` : null,
                    r.plan.interval_months ? `${r.plan.interval_months} mes(es)` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </TableCell>
                <TableCell className="text-sm">
                  {r.plan.last_done_at ? dateBR(r.plan.last_done_at) : "—"}
                  <span className="block text-xs text-muted-foreground">
                    {r.plan.last_done_km ? `${num(Number(r.plan.last_done_km), 0)} km` : ""}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={DUE_VARIANT[r.due.state]}>{DUE_LABELS[r.due.state]}</Badge>
                  <span className="mt-1 block text-xs text-muted-foreground">{r.due.detail}</span>
                </TableCell>
                <TableCell>
                  {canManageFleet && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(r.plan)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Itens do plano"
                        onClick={() => setItemsPlan(r.plan)}
                      >
                        <ListChecks className="size-4" />
                      </Button>
                      {r.plan.active && (
                        <Button variant="ghost" size="icon" aria-label="Inativar" onClick={() => removePlan(r.plan)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!itemsPlan} onOpenChange={(v) => !v && setItemsPlan(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {itemsPlan && (
            <PlanItemsEditor plan={itemsPlan} canManage={canManageFleet} orgId={orgId} userId={userId} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar plano ${editing.name}` : "Novo plano preventivo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
              </div>
              <div>
                <Label>Tipo de serviço</Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_SERVICE_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Veículo específico</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Por tipo de veículo</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate} — {v.model ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de veículo</Label>
                <Select value={vehicleType} onValueChange={setVehicleType} disabled={vehicleId !== NONE}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Todos os tipos</SelectItem>
                    {VEHICLE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3">
                <Switch id="active" checked={active} onCheckedChange={setActive} />
                <Label htmlFor="active">Plano ativo</Label>
              </div>
              <div>
                <Label htmlFor="interval_km">A cada (KM)</Label>
                <Input id="interval_km" name="interval_km" inputMode="numeric" defaultValue={editing?.interval_km ?? ""} />
              </div>
              <div>
                <Label htmlFor="interval_hours">A cada (horímetro)</Label>
                <Input
                  id="interval_hours"
                  name="interval_hours"
                  inputMode="numeric"
                  defaultValue={editing?.interval_hours ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="interval_months">A cada (meses)</Label>
                <Input
                  id="interval_months"
                  name="interval_months"
                  inputMode="numeric"
                  defaultValue={editing?.interval_months ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="tolerance_km">Tolerância (KM)</Label>
                <Input id="tolerance_km" name="tolerance_km" inputMode="numeric" defaultValue={editing?.tolerance_km ?? 0} />
              </div>
              <div>
                <Label htmlFor="tolerance_hours">Tolerância (horas)</Label>
                <Input
                  id="tolerance_hours"
                  name="tolerance_hours"
                  inputMode="numeric"
                  defaultValue={editing?.tolerance_hours ?? 0}
                />
              </div>
              <div>
                <Label htmlFor="tolerance_days">Tolerância (dias)</Label>
                <Input
                  id="tolerance_days"
                  name="tolerance_days"
                  inputMode="numeric"
                  defaultValue={editing?.tolerance_days ?? 0}
                />
              </div>
              <div>
                <Label htmlFor="last_done_at">Última execução (data)</Label>
                <Input id="last_done_at" name="last_done_at" type="date" defaultValue={editing?.last_done_at ?? ""} />
              </div>
              <div>
                <Label htmlFor="last_done_km">Última execução (KM)</Label>
                <Input id="last_done_km" name="last_done_km" inputMode="numeric" defaultValue={editing?.last_done_km ?? ""} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="description">Descrição</Label>
                <Textarea id="description" name="description" rows={2} defaultValue={editing?.description ?? ""} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar plano"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlanItemsEditor({
  plan,
  canManage,
  orgId,
  userId,
}: {
  plan: { id: string; name: string };
  canManage: boolean;
  orgId: string | null;
  userId: string | null;
}) {
  const { data: items = [] } = useMaintenancePlanItems(plan.id);
  const invalidate = useInvalidate();

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const description = String(fd.get("description") ?? "").trim();
    if (!description) {
      toast.error("Informe a descrição do item.");
      return;
    }
    const { error } = await supabase.from("maintenance_plan_items").insert({
      organization_id: orgId!,
      plan_id: plan.id,
      description,
      service_type: (fd.get("service_type") as string) || null,
      sequence: items.length + 1,
      created_by: userId,
    });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    form.reset();
    invalidate(["maintenance-plan-items"]);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("maintenance_plan_items").delete().eq("id", id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    invalidate(["maintenance-plan-items"]);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Itens do plano {plan.name}</DialogTitle>
      </DialogHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Serviço / verificação</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                Nenhum item cadastrado neste plano.
              </TableCell>
            </TableRow>
          )}
          {items.map((i) => (
            <TableRow key={i.id}>
              <TableCell>{i.sequence}</TableCell>
              <TableCell>{i.description}</TableCell>
              <TableCell>{i.service_type || "—"}</TableCell>
              <TableCell>
                {canManage && (
                  <Button variant="ghost" size="icon" aria-label="Remover item" onClick={() => remove(i.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {canManage && (
        <form onSubmit={add} className="grid items-end gap-2 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="item-description">Serviço / verificação</Label>
            <Input id="item-description" name="description" />
          </div>
          <div>
            <Label htmlFor="item-type">Tipo de serviço</Label>
            <select
              id="item-type"
              name="service_type"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">—</option>
              {MAINTENANCE_SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Adicionar item</Button>
        </form>
      )}
    </>
  );
}
