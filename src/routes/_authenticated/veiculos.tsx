import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Search, History } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { LitersInput } from "@/components/form-fields";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  FUEL_TYPES,
  VEHICLE_STATUS,
  VEHICLE_TYPES,
  label,
  supabase,
  useInvalidate,
  useProfile,
  usePerms,
  useUnits,
  useVehicles,
  useContracts,
  useExternalEntities,
  dateBR,
  WRITE_ROLES,
  type Vehicle,
  type VehicleStatus,
  parseBRNumber,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/veiculos")({
  head: () => ({
    meta: [
      { title: "Veículos da frota — FrotaGov" },
      {
        name: "description",
        content:
          "Cadastro e consulta dos veículos e equipamentos da frota do órgão, com vínculo à secretaria responsável.",
      },
      { property: "og:title", content: "Veículos da frota — FrotaGov" },
      { property: "og:description", content: "Gerencie os veículos e equipamentos da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Veiculos,
});

const PAGE_SIZE = 10;
const NONE = "__none__";

const schema = z.object({
  plate: z.string().trim().min(5, "Informe a placa").max(10),
  asset_code: z.string().trim().max(40).optional(),
  renavam: z.string().trim().max(20).optional(),
  chassis: z.string().trim().max(30).optional(),
  invoice_number: z.string().trim().max(40).optional(),
  acquisition_date: z.string().trim().optional(),
  acquisition_value: z.string().trim().optional(),
  brand: z.string().trim().max(60).optional(),
  model: z.string().trim().max(80).optional(),
  year_manufacture: z.string().trim().optional(),
  year_model: z.string().trim().optional(),
  color: z.string().trim().max(40).optional(),
  tank_capacity: z.string().trim().optional(),
  current_km: z.string().trim().optional(),
  hour_meter: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const num = (v?: string) => {
  if (!v) return null;
  const n = parseBRNumber(v);
  return Number.isFinite(n) ? n : null;
};

const statusVariant = (s: VehicleStatus) =>
  s === "ativo" ? "default" : s === "manutencao" ? "secondary" : "outline";

function Veiculos() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: contracts = [] } = useContracts();
  const { data: entities = [] } = useExternalEntities();
  const { data: me } = useProfile();
  const perms = usePerms();
  const invalidate = useInvalidate();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [ownershipFilter, setOwnershipFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [status, setStatus] = useState<VehicleStatus>("ativo");
  const [unitId, setUnitId] = useState<string>(NONE);
  const [vehicleType, setVehicleType] = useState<string>(NONE);
  const [fuelType, setFuelType] = useState<string>(NONE);
  const [serverVehicle, setServerVehicle] = useState(false);
  // Bloco 4: forma de incorporação e estado do bem.
  const [acquisitionKind, setAcquisitionKind] = useState<"aquisicao" | "locado">("aquisicao");
  const [conditionState, setConditionState] = useState<"novo" | "usado">("novo");
  const [acquisitionEntity, setAcquisitionEntity] = useState<string>(NONE);
  const [leaseContract, setLeaseContract] = useState<string>(NONE);
  const [saving, setSaving] = useState(false);

  // Dados do contrato de locação exibidos automaticamente (sem redigitação).
  const leaseInfo = useMemo(() => {
    const c = contracts.find((x) => x.id === leaseContract);
    if (!c) return null;
    return {
      company: c.entity?.trade_name || c.entity?.name || c.supplier?.legal_name || "—",
      from: c.valid_from,
      to: c.valid_to,
    };
  }, [contracts, leaseContract]);

  const canWrite = Boolean(perms.orgId) && (me?.roles ?? []).some((r) => WRITE_ROLES.includes(r));
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (v.asset_class === "equipamento") return false;
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (unitFilter !== "all" && (v.unit_id ?? NONE) !== unitFilter) return false;
      if (ownershipFilter === "servidor" && !v.is_private_server_vehicle) return false;
      if (ownershipFilter === "oficial" && v.is_private_server_vehicle) return false;
      if (!q) return true;
      return [v.plate, v.asset_code, v.brand, v.model, v.renavam, v.chassis]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));
    });
  }, [vehicles, search, statusFilter, unitFilter, ownershipFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function openNew() {
    setEditing(null);
    setStatus("ativo");
    setUnitId(NONE);
    setVehicleType(NONE);
    setFuelType(NONE);
    setServerVehicle(false);
    setAcquisitionKind("aquisicao");
    setConditionState("novo");
    setAcquisitionEntity(NONE);
    setLeaseContract(NONE);
    setOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setStatus(v.status);
    setUnitId(v.unit_id ?? NONE);
    setVehicleType(v.vehicle_type ?? NONE);
    setFuelType(v.fuel_type ?? NONE);
    setServerVehicle(Boolean(v.is_private_server_vehicle));
    setAcquisitionKind((v.acquisition_kind as "aquisicao" | "locado") ?? "aquisicao");
    setConditionState((v.condition_state as "novo" | "usado") ?? "novo");
    setAcquisitionEntity(v.acquisition_entity_id ?? NONE);
    setLeaseContract(v.lease_contract_id ?? NONE);
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

    if (acquisitionKind === "locado" && leaseContract === NONE) {
      toast.error("Veículo locado exige contrato de locação vinculado.");
      return;
    }

    if (
      acquisitionKind === "locado" &&
      leaseContract !== NONE &&
      !contracts.some((c) => c.id === leaseContract)
    ) {
      toast.error("Selecione um contrato de locação válido.");
      return;
    }

    // Só permite vincular unidades do próprio órgão (lista já é filtrada por RLS).
    const safeUnitId = unitId !== NONE && units.some((u) => u.id === unitId) ? unitId : null;

    const currentKm = num(d.current_km);
    const hourMeter = num(d.hour_meter);

    if (currentKm !== null && currentKm < 0) {
      toast.error("A quilometragem não pode ser negativa.");
      return;
    }

    if (hourMeter !== null && hourMeter < 0) {
      toast.error("O horímetro não pode ser negativo.");
      return;
    }

    const payload = {
      asset_class: "veiculo",
      plate: d.plate.toUpperCase(),
      asset_code: d.asset_code || null,
      renavam: d.renavam || null,
      chassis: d.chassis || null,
      acquisition_kind: acquisitionKind,
      condition_state: conditionState,
      invoice_number: acquisitionKind === "aquisicao" ? d.invoice_number || null : null,
      acquisition_date: acquisitionKind === "aquisicao" ? d.acquisition_date || null : null,
      acquisition_value: acquisitionKind === "aquisicao" ? num(d.acquisition_value) : null,
      acquisition_entity_id: acquisitionKind === "aquisicao" && acquisitionEntity !== NONE ? acquisitionEntity : null,
      lease_contract_id: acquisitionKind === "locado" && leaseContract !== NONE ? leaseContract : null,
      brand: d.brand || null,
      model: d.model || null,
      year_manufacture: num(d.year_manufacture),
      year_model: num(d.year_model),
      color: d.color || null,
      vehicle_type: vehicleType === NONE ? null : vehicleType,
      fuel_type: fuelType === NONE ? null : fuelType,
      tank_capacity: num(d.tank_capacity),
      current_km: currentKm,
      hour_meter: hourMeter,
      // A unidade só muda pelo fluxo de movimentação patrimonial (Frota → Movimentação patrimonial).
      ...(editing ? {} : { unit_id: safeUnitId }),
      status,
      is_private_server_vehicle: serverVehicle,
      notes: d.notes || null,
    };

    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("vehicles").update(payload).eq("id", editing.id);
      setSaving(false);
      if (error) {
        toast.error(
          error.code === "23505"
            ? "Já existe um veículo com esta placa no órgão."
            : "Não foi possível salvar o veículo.",
        );
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
        toast.error(
          error.code === "23505"
            ? "Já existe um veículo com esta placa no órgão."
            : "Não foi possível cadastrar o veículo.",
        );
        return;
      }
    }
    toast.success("Veículo salvo com sucesso.");
    setOpen(false);
    invalidate(["vehicles"]);
  }

  return (
    <>
      <PageHeader
        title="Veículos"
        description="Frota de veículos e equipamentos vinculados ao órgão."
        action={
          canWrite ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo veículo
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
            placeholder="Buscar por placa, patrimônio, marca ou modelo"
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {VEHICLE_STATUS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ownershipFilter} onValueChange={(v) => { setOwnershipFilter(v); setPage(0); }}>
          <SelectTrigger>
            <SelectValue placeholder="Propriedade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Oficiais e de servidor</SelectItem>
            <SelectItem value="oficial">Somente frota oficial</SelectItem>
            <SelectItem value="servidor">Somente particulares de servidor</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={unitFilter}
          onValueChange={(v) => {
            setUnitFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Unidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as unidades</SelectItem>
            <SelectItem value={NONE}>Sem unidade</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Placa</TableHead>
              <TableHead>Patrimônio</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>KM</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {vehicles.length === 0
                    ? "Nenhum veículo cadastrado. Clique em “Novo veículo” para iniciar a frota."
                    : "Nenhum veículo encontrado com os filtros aplicados."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">
                  {v.plate}
                  {v.is_private_server_vehicle && (
                    <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                      Servidor · cota
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{v.asset_code || "—"}</TableCell>
                <TableCell>
                  {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                  {(v.year_manufacture || v.year_model) && (
                    <span className="block text-xs text-muted-foreground">
                      {v.year_manufacture ?? "—"}/{v.year_model ?? "—"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{v.vehicle_type || "—"}</TableCell>
                <TableCell className="text-sm">{unitName(v.unit_id)}</TableCell>
                <TableCell className="text-sm">
                  {v.current_km != null ? v.current_km.toLocaleString("pt-BR") : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(v.status)}>{label(VEHICLE_STATUS, v.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon" aria-label="Histórico do veículo">
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
          {filtered.length} veículo(s) · página {current + 1} de {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
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
            <DialogTitle>{editing ? "Editar veículo" : "Novo veículo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="plate">Placa *</Label>
                <Input id="plate" name="plate" defaultValue={editing?.plate ?? ""} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset_code">Prefixo / patrimônio</Label>
                <Input id="asset_code" name="asset_code" defaultValue={editing?.asset_code ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="renavam">Renavam</Label>
                <Input id="renavam" name="renavam" defaultValue={editing?.renavam ?? ""} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="chassis">Chassi / VIN</Label>
                <Input id="chassis" name="chassis" defaultValue={editing?.chassis ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>Forma de incorporação</Label>
                <Select value={acquisitionKind} onValueChange={(v) => setAcquisitionKind(v as "aquisicao" | "locado")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aquisicao">Aquisição</SelectItem>
                    <SelectItem value="locado">Locado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado do veículo</Label>
                <Select value={conditionState} onValueChange={(v) => setConditionState(v as "novo" | "usado")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="usado">Usado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {acquisitionKind === "aquisicao" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="invoice_number">N° da nota fiscal</Label>
                    <Input id="invoice_number" name="invoice_number" defaultValue={editing?.invoice_number ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acquisition_date">Data da aquisição</Label>
                    <Input
                      id="acquisition_date"
                      name="acquisition_date"
                      type="date"
                      defaultValue={editing?.acquisition_date ?? ""}
                    />
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
                    <Label>Fornecedor da aquisição</Label>
                    <Select value={acquisitionEntity} onValueChange={setAcquisitionEntity}>
                      <SelectTrigger>
                        <SelectValue placeholder="Empresa do cadastro mestre" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Não informar</SelectItem>
                        {entities.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.trade_name || e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Contrato de locação *</Label>
                  <Select value={leaseContract} onValueChange={setLeaseContract}>
                    <SelectTrigger aria-required="true">
                      <SelectValue placeholder="Selecione o contrato já cadastrado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE} disabled>
                        Selecione o contrato
                      </SelectItem>
                      {contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.number} — {c.object.slice(0, 40)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {leaseInfo ? (
                    <p className="text-xs text-muted-foreground">
                      Empresa contratada: {leaseInfo.company} · Vigência {dateBR(leaseInfo.from)} a{" "}
                      {dateBR(leaseInfo.to)}. O valor da locação vem do contrato e não é digitado aqui.
                    </p>
                  ) : null}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="brand">Marca</Label>
                <Input id="brand" name="brand" defaultValue={editing?.brand ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model">Modelo</Label>
                <Input id="model" name="model" defaultValue={editing?.model ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="year_manufacture">Ano de fabricação</Label>
                <Input
                  id="year_manufacture"
                  name="year_manufacture"
                  inputMode="numeric"
                  defaultValue={editing?.year_manufacture ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="year_model">Ano do modelo</Label>
                <Input
                  id="year_model"
                  name="year_model"
                  inputMode="numeric"
                  defaultValue={editing?.year_model ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="color">Cor</Label>
                <Input id="color" name="color" defaultValue={editing?.color ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo do veículo / equipamento</Label>
                <Select value={vehicleType} onValueChange={setVehicleType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {VEHICLE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Combustível</Label>
                <Select value={fuelType} onValueChange={setFuelType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {FUEL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tank_capacity">Capacidade do tanque (L)</Label>
                <LitersInput
                  id="tank_capacity"
                  name="tank_capacity"
                  defaultValue={editing?.tank_capacity ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="current_km">Quilometragem atual</Label>
                <Input
                  id="current_km"
                  name="current_km"
                  inputMode="decimal"
                  min="0"
                  defaultValue={editing?.current_km ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hour_meter">Horímetro (quando aplicável)</Label>
                <Input
                  id="hour_meter"
                  name="hour_meter"
                  inputMode="decimal"
                  min="0"
                  defaultValue={editing?.hour_meter ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Secretaria / unidade</Label>
                <Select value={unitId} onValueChange={setUnitId} disabled={!!editing}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem vínculo</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editing && (
                  <p className="text-xs text-muted-foreground">
                    A troca de secretaria/unidade é feita em Frota → Movimentação patrimonial, para preservar o
                    histórico do bem.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Situação</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as VehicleStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-2 rounded-md border p-3 sm:col-span-2 lg:col-span-3">
                <Checkbox
                  id="server_vehicle"
                  checked={serverVehicle}
                  onCheckedChange={(v) => setServerVehicle(v === true)}
                />
                <div>
                  <Label htmlFor="server_vehicle" className="cursor-pointer">
                    Veículo particular de servidor com cota de combustível
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    O abastecimento passa a exigir cota vigente do servidor, cadastrada em Abastecimento → Cotas de
                    servidor, e é bloqueado quando a cota do ciclo se esgota.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={3} defaultValue={editing?.notes ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
