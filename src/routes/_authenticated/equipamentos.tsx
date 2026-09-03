/** Fase 10 — Bloco 1: cadastro de máquinas e equipamentos da frota. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Search, History } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ASSET_OWNERSHIP,
  FUEL_TYPES,
  METER_KINDS,
  VEHICLE_STATUS,
  label,
  parseBRNumber,
  supabase,
  useCostCenters,
  useEquipmentTypes,
  useInvalidate,
  usePerms,
  useProfile,
  useUnits,
  useVehicles,
  WRITE_ROLES,
  type Vehicle,
  type VehicleStatus,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/equipamentos")({
  head: () => ({
    meta: [
      { title: "Máquinas e equipamentos — FrotaGov" },
      {
        name: "description",
        content:
          "Cadastro de máquinas pesadas, tratores, implementos, geradores e demais equipamentos do órgão, com horímetro, patrimônio e forma de propriedade.",
      },
      { property: "og:title", content: "Máquinas e equipamentos — FrotaGov" },
      {
        property: "og:description",
        content: "Controle patrimonial e operacional de máquinas e equipamentos da frota pública.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Equipamentos,
});

const PAGE_SIZE = 10;
const NONE = "__none__";

const schema = z.object({
  asset_code: z.string().trim().min(1, "Informe o patrimônio ou a identificação interna").max(40),
  plate: z.string().trim().max(10).optional(),
  chassis: z.string().trim().max(30).optional(),
  serial_number: z.string().trim().max(40).optional(),
  engine_number: z.string().trim().max(40).optional(),
  manufacturer: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(60).optional(),
  model: z.string().trim().max(80).optional(),
  year_manufacture: z.string().trim().optional(),
  tank_capacity: z.string().trim().optional(),
  current_km: z.string().trim().optional(),
  hour_meter: z.string().trim().optional(),
  power_hp: z.string().trim().optional(),
  capacity_desc: z.string().trim().max(120).optional(),
  acquisition_date: z.string().trim().optional(),
  acquisition_value: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const num = (v?: string) => {
  if (!v) return null;
  const n = parseBRNumber(v);
  return Number.isFinite(n) ? n : null;
};

const statusVariant = (s: VehicleStatus) =>
  s === "ativo" ? "default" : s === "manutencao" ? "secondary" : "outline";

function Equipamentos() {
  const { data: assets = [], isLoading } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: costCenters = [] } = useCostCenters();
  const { data: types = [] } = useEquipmentTypes();
  const { data: me } = useProfile();
  const perms = usePerms();
  const invalidate = useInvalidate();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [page, setPage] = useState(0);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [status, setStatus] = useState<VehicleStatus>("ativo");
  const [unitId, setUnitId] = useState(NONE);
  const [costCenterId, setCostCenterId] = useState(NONE);
  const [equipmentType, setEquipmentType] = useState(NONE);
  const [meterKind, setMeterKind] = useState("horimetro");
  const [ownership, setOwnership] = useState("proprio");
  const [fuelType, setFuelType] = useState(NONE);
  const [saving, setSaving] = useState(false);

  const canWrite = Boolean(perms.orgId) && (me?.roles ?? []).some((r) => WRITE_ROLES.includes(r));
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "—";

  const equipments = useMemo(() => assets.filter((a) => a.asset_class === "equipamento"), [assets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipments.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (unitFilter !== "all" && (v.unit_id ?? NONE) !== unitFilter) return false;
      if (ownershipFilter !== "all" && v.ownership !== ownershipFilter) return false;
      if (!q) return true;
      return [v.asset_code, v.plate, v.brand, v.model, v.manufacturer, v.serial_number, v.equipment_type]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));
    });
  }, [equipments, search, statusFilter, unitFilter, ownershipFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function openNew() {
    setEditing(null);
    setStatus("ativo");
    setUnitId(NONE);
    setCostCenterId(NONE);
    setEquipmentType(NONE);
    setMeterKind("horimetro");
    setOwnership("proprio");
    setFuelType(NONE);
    setOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setStatus(v.status);
    setUnitId(v.unit_id ?? NONE);
    setCostCenterId(v.cost_center_id ?? NONE);
    setEquipmentType(v.equipment_type ?? NONE);
    setMeterKind(v.meter_kind ?? "horimetro");
    setOwnership(v.ownership ?? "proprio");
    setFuelType(v.fuel_type ?? NONE);
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
    const safeUnitId = unitId !== NONE && units.some((u) => u.id === unitId) ? unitId : null;
    const safeCostCenter =
      costCenterId !== NONE && costCenters.some((c) => c.id === costCenterId) ? costCenterId : null;

    const payload = {
      asset_class: "equipamento",
      asset_code: d.asset_code,
      plate: d.plate ? d.plate.toUpperCase() : null,
      chassis: d.chassis || null,
      serial_number: d.serial_number || null,
      engine_number: d.engine_number || null,
      manufacturer: d.manufacturer || null,
      brand: d.brand || null,
      model: d.model || null,
      year_manufacture: num(d.year_manufacture),
      equipment_type: equipmentType === NONE ? null : equipmentType,
      vehicle_type: equipmentType === NONE ? null : equipmentType,
      fuel_type: fuelType === NONE ? null : fuelType,
      tank_capacity: num(d.tank_capacity),
      current_km: num(d.current_km),
      hour_meter: num(d.hour_meter),
      meter_kind: meterKind,
      power_hp: num(d.power_hp),
      capacity_desc: d.capacity_desc || null,
      ownership,
      cost_center_id: safeCostCenter,
      acquisition_date: d.acquisition_date || null,
      acquisition_value: num(d.acquisition_value),
      // A unidade só muda pelo fluxo de movimentação patrimonial.
      ...(editing ? {} : { unit_id: safeUnitId }),
      status,
      notes: d.notes || null,
    };

    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("vehicles").update(payload).eq("id", editing.id);
      setSaving(false);
      if (error) {
        toast.error(error.message || "Não foi possível salvar o equipamento.");
        return;
      }
    } else {
      const orgId = perms.orgId;
      if (!orgId) {
        setSaving(false);
        toast.error("Nenhum órgão em contexto. Acesse um órgão para cadastrar.");
        return;
      }
      const { error } = await supabase
        .from("vehicles")
        .insert({ ...payload, organization_id: orgId, created_by: me?.profile?.id ?? null });
      setSaving(false);
      if (error) {
        toast.error(error.message || "Não foi possível cadastrar o equipamento.");
        return;
      }
    }
    toast.success("Máquina/equipamento salvo com sucesso.");
    setOpen(false);
    invalidate(["vehicles"]);
  }

  const meterCell = (v: Vehicle) => {
    const parts: string[] = [];
    if (v.meter_kind !== "horimetro" && v.current_km != null)
      parts.push(`${v.current_km.toLocaleString("pt-BR")} km`);
    if (v.meter_kind !== "hodometro" && v.hour_meter != null)
      parts.push(`${v.hour_meter.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`);
    return parts.join(" · ") || "—";
  };

  return (
    <>
      <PageHeader
        title="Máquinas e equipamentos"
        description="Máquinas pesadas, tratores, implementos, rebocáveis, geradores e demais equipamentos do órgão. Integrados a abastecimentos, manutenção, contratos, patrimônio, histórico e relatórios."
        action={
          canWrite ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Nova máquina/equipamento
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar por patrimônio, série, marca, modelo ou tipo"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {VEHICLE_STATUS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownershipFilter} onValueChange={(v) => { setOwnershipFilter(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Propriedade / uso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as formas de uso</SelectItem>
            {ASSET_OWNERSHIP.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v); setPage(0); }}>
          <SelectTrigger><SelectValue placeholder="Unidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as unidades</SelectItem>
            <SelectItem value={NONE}>Sem unidade</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patrimônio</TableHead>
              <TableHead>Equipamento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Medidor</TableHead>
              <TableHead>Uso</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {equipments.length === 0
                    ? "Nenhuma máquina ou equipamento cadastrado. Clique em “Nova máquina/equipamento”."
                    : "Nenhum equipamento encontrado com os filtros aplicados."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">
                  {v.asset_code || "—"}
                  {v.plate && (
                    <span className="block text-xs text-muted-foreground">Placa {v.plate}</span>
                  )}
                </TableCell>
                <TableCell>
                  {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                  {(v.manufacturer || v.year_manufacture) && (
                    <span className="block text-xs text-muted-foreground">
                      {[v.manufacturer, v.year_manufacture].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{v.equipment_type || "—"}</TableCell>
                <TableCell className="text-sm">{unitName(v.unit_id)}</TableCell>
                <TableCell className="text-sm">{meterCell(v)}</TableCell>
                <TableCell className="text-sm">{label(ASSET_OWNERSHIP, v.ownership ?? "proprio")}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(v.status)}>{label(VEHICLE_STATUS, v.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon" aria-label="Histórico do equipamento">
                      <Link to="/veiculo/$id" params={{ id: v.id }}>
                        <History className="size-4" />
                      </Link>
                    </Button>
                    {canWrite && (
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(v)}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {filtered.length} máquina(s)/equipamento(s) · página {current + 1} de {pageCount}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar máquina/equipamento" : "Nova máquina/equipamento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset_code">Patrimônio / identificação *</Label>
                <Input id="asset_code" name="asset_code" defaultValue={editing?.asset_code ?? ""} required />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de equipamento</Label>
                <Select value={equipmentType} onValueChange={(v) => {
                  setEquipmentType(v);
                  const t = types.find((x) => x.name === v);
                  if (t) setMeterKind(t.default_meter_kind);
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plate">Placa (quando aplicável)</Label>
                <Input id="plate" name="plate" defaultValue={editing?.plate ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manufacturer">Fabricante</Label>
                <Input id="manufacturer" name="manufacturer" defaultValue={editing?.manufacturer ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand">Marca</Label>
                <Input id="brand" name="brand" defaultValue={editing?.brand ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model">Modelo</Label>
                <Input id="model" name="model" defaultValue={editing?.model ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="chassis">Chassi (quando houver)</Label>
                <Input id="chassis" name="chassis" defaultValue={editing?.chassis ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="serial_number">Número de série</Label>
                <Input id="serial_number" name="serial_number" defaultValue={editing?.serial_number ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="engine_number">Número do motor</Label>
                <Input id="engine_number" name="engine_number" defaultValue={editing?.engine_number ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="year_manufacture">Ano</Label>
                <Input
                  id="year_manufacture"
                  name="year_manufacture"
                  inputMode="numeric"
                  defaultValue={editing?.year_manufacture ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Combustível / produto</Label>
                <Select value={fuelType} onValueChange={setFuelType}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {FUEL_TYPES.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tank_capacity">Capacidade do tanque (L)</Label>
                <Input id="tank_capacity" name="tank_capacity" inputMode="decimal" defaultValue={editing?.tank_capacity ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>Medidor</Label>
                <Select value={meterKind} onValueChange={setMeterKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METER_KINDS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="current_km">Hodômetro (km)</Label>
                <Input id="current_km" name="current_km" inputMode="decimal" defaultValue={editing?.current_km ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hour_meter">Horímetro (h)</Label>
                <Input id="hour_meter" name="hour_meter" inputMode="decimal" defaultValue={editing?.hour_meter ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="power_hp">Potência (cv)</Label>
                <Input id="power_hp" name="power_hp" inputMode="decimal" defaultValue={editing?.power_hp ?? ""} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="capacity_desc">Peso / capacidade</Label>
                <Input
                  id="capacity_desc"
                  name="capacity_desc"
                  placeholder="Ex.: 12 t · caçamba 6 m³"
                  defaultValue={editing?.capacity_desc ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Propriedade / uso</Label>
                <Select value={ownership} onValueChange={setOwnership}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_OWNERSHIP.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Centro de custo</Label>
                <Select value={costCenterId} onValueChange={setCostCenterId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {costCenters.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!editing && (
                <div className="space-y-1.5">
                  <Label>Unidade / secretaria</Label>
                  <Select value={unitId} onValueChange={setUnitId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem unidade</SelectItem>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="acquisition_date">Data de aquisição</Label>
                <Input id="acquisition_date" name="acquisition_date" type="date" defaultValue={editing?.acquisition_date ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acquisition_value">Valor de aquisição (R$)</Label>
                <Input
                  id="acquisition_value"
                  name="acquisition_value"
                  inputMode="decimal"
                  defaultValue={editing?.acquisition_value ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Situação</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as VehicleStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VEHICLE_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" rows={3} defaultValue={editing?.notes ?? ""} />
            </div>
            {editing && (
              <p className="text-xs text-muted-foreground">
                A unidade responsável é alterada pelo fluxo de Frota → Movimentação patrimonial, preservando o
                histórico do bem.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
