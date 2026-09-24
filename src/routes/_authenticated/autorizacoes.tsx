import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, QrCode, Ban, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

import { LitersInput, MoneyInput } from "@/components/form-fields";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AUTH_STATUS,
  EXPENSE_ORIGINS,
  LIMIT_SCOPES,
  authorizationBalance,
  brl,
  cnhState,
  dateTimeBR,
  dbMessage,
  driverEligible,
  fuelCompatible,
  label,
  logBudgetBlock,
  num,
  supabase,
  useAuthorizations,
  useCommitments,
  useContractItems,
  useContracts,
  useCostCenters,
  useDrivers,
  useFuelLimits,
  useFuelTypes,
  useInvalidate,
  usePerms,
  useQuotas,
  useSuppliers,
  useUnits,
  useVehicles,
  type AuthorizationRow,
  type ExpenseOrigin,
  type FuelAuthStatus,
  type LimitScope,
  parseBRNumber,
  formatLiters,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/autorizacoes")({
  head: () => ({
    meta: [
      { title: "Autorizações de abastecimento — FrotaGov" },
      {
        name: "description",
        content:
          "Emissão e controle de autorizações prévias de abastecimento com limites de litros e valor, validade, código de segurança e QR Code sem dados pessoais.",
      },
      { property: "og:title", content: "Autorizações de abastecimento — FrotaGov" },
      { property: "og:description", content: "Controle prévio do abastecimento da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Autorizacoes,
});

const ALL = "__all__";
const NONE = "__none__";
const PAGE_SIZE = 12;

const STATUS_STYLE: Record<FuelAuthStatus, string> = {
  pendente: "bg-muted text-muted-foreground",
  autorizada: "bg-primary/10 text-primary",
  utilizada_parcial: "bg-warning/20 text-warning-foreground",
  utilizada: "bg-success/15 text-success",
  expirada: "bg-destructive/10 text-destructive",
  cancelada: "bg-destructive/10 text-destructive",
};

function toLocalInput(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function Autorizacoes() {
  const { data: auths = [], isLoading } = useAuthorizations();
  const perms = usePerms();
  const invalidate = useInvalidate();

  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [openNew, setOpenNew] = useState(false);
  const [openLimits, setOpenLimits] = useState(false);
  const [detail, setDetail] = useState<AuthorizationRow | null>(null);
  const [cancelling, setCancelling] = useState<AuthorizationRow | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return auths.filter((a) => {
      if (fStatus !== ALL && a.status !== fStatus) return false;
      if (t) {
        const hay = [
          a.code,
          a.vehicle?.plate ?? a.vehicle?.asset_code ?? "",
          a.driver?.full_name,
          a.fuel?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [auths, q, fStatus]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Autorizações de abastecimento"
        description="Emita a autorização antes da compra, com limites de litros/valor, validade e QR Code de conferência."
        action={
          <div className="flex gap-2">
            {perms.canManageFleet && (
              <Button variant="outline" className="gap-2" onClick={() => setOpenLimits(true)}>
                <SlidersHorizontal className="size-4" /> Limites
              </Button>
            )}
            {perms.canRegister && (
              <Button className="gap-2" onClick={() => setOpenNew(true)}>
                <Plus className="size-4" /> Nova autorização
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label className="text-xs">Busca (código, placa, condutor, combustível)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
              placeholder="Buscar…"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {AUTH_STATUS.map((s) => (
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
              <TableHead>Código</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Condutor</TableHead>
              <TableHead>Combustível</TableHead>
              <TableHead className="text-right">Autorizado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Situação</TableHead>
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
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Nenhuma autorização emitida.
                </TableCell>
              </TableRow>
            )}
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">{a.code}</TableCell>
                <TableCell className="font-medium">
                  {a.vehicle?.plate ?? a.vehicle?.asset_code ?? "—"}
                </TableCell>
                <TableCell>{a.driver?.full_name ?? "—"}</TableCell>
                <TableCell>{a.fuel?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{formatLiters(a.max_quantity)}</TableCell>
                <TableCell className="text-right">
                  {formatLiters(authorizationBalance(a))}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {dateTimeBR(a.valid_until)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_STYLE[a.status]}>
                    {label(AUTH_STATUS, a.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Ver QR Code"
                      onClick={() => setDetail(a)}
                    >
                      <QrCode className="size-4" />
                    </Button>
                    {perms.canCancel && !["cancelada", "utilizada"].includes(a.status) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Cancelar"
                        onClick={() => setCancelling(a)}
                      >
                        <Ban className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {filtered.length} autorização(ões) · página {current} de {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {openNew && (
        <NewAuthorizationDialog
          onClose={() => setOpenNew(false)}
          onSaved={() => invalidate(["fuel-authorizations"])}
        />
      )}
      {openLimits && <LimitsDialog onClose={() => setOpenLimits(false)} />}
      {detail && <AuthorizationDetail auth={detail} onClose={() => setDetail(null)} />}
      {cancelling && (
        <CancelAuthDialog
          auth={cancelling}
          onClose={() => setCancelling(null)}
          onSaved={() => invalidate(["fuel-authorizations"])}
        />
      )}
    </>
  );
}

function NewAuthorizationDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: fuels = [] } = useFuelTypes();
  const { data: suppliers = [] } = useSuppliers();
  const { data: units = [] } = useUnits();
  const { data: centers = [] } = useCostCenters();
  const { data: contracts = [] } = useContracts();
  const { data: contractItems = [] } = useContractItems();
  const { data: commitments = [] } = useCommitments();
  const { data: quotas = [] } = useQuotas();
  const perms = usePerms();

  const now = new Date();
  const [vehicleId, setVehicleId] = useState(NONE);
  const [driverId, setDriverId] = useState(NONE);
  const [fuelId, setFuelId] = useState(NONE);
  const [supplierId, setSupplierId] = useState(NONE);
  const [maxQty, setMaxQty] = useState("");
  const [fillTank, setFillTank] = useState(false);
  const [maxValue, setMaxValue] = useState("");
  const [maxUnitPrice, setMaxUnitPrice] = useState("");
  const [odometer, setOdometer] = useState("");
  const [hourMeter, setHourMeter] = useState("");
  const [from, setFrom] = useState(toLocalInput(now));
  const [until, setUntil] = useState(toLocalInput(new Date(now.getTime() + 7 * 86400000)));
  const [purpose, setPurpose] = useState("");
  const [justification, setJustification] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [origin, setOrigin] = useState<ExpenseOrigin>("contrato");
  const [centerId, setCenterId] = useState(NONE);
  const [contractId, setContractId] = useState(NONE);
  const [itemId, setItemId] = useState(NONE);
  const [commitmentId, setCommitmentId] = useState(NONE);
  const [quotaId, setQuotaId] = useState(NONE);
  const [saving, setSaving] = useState(false);

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const driver = drivers.find((d) => d.id === driverId) ?? null;
  const fuel = fuels.find((f) => f.id === fuelId) ?? null;
  const unit = units.find((u) => u.id === vehicle?.unit_id) ?? null;
  const qty = parseBRNumber(maxQty);

  // verificação de limite diário/mensal no servidor
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!vehicle || !perms.orgId || !(qty > 0)) {
        setLimitMsg(null);
        return;
      }
      const { data } = await supabase.rpc("fuel_limit_breach", {
        _org: perms.orgId,
        _vehicle: vehicle.id,
        _unit: vehicle.unit_id as string,
        _qty: qty,
        _at: new Date(from).toISOString(),
      });
      if (!cancelled) setLimitMsg((data as string | null) ?? null);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [vehicle, qty, from, perms.orgId]);

  const issues: { level: "erro" | "alerta"; message: string }[] = [];
  if (!vehicle) issues.push({ level: "erro", message: "Selecione o veículo." });
  if (vehicle && ["inativo", "baixado"].includes(vehicle.status))
    issues.push({
      level: "erro",
      message: `Veículo ${vehicle.plate ?? vehicle.asset_code} está ${vehicle.status} e não pode ser autorizado.`,
    });
  if (vehicle?.status === "manutencao" && !perms.canManageFleet)
    issues.push({
      level: "erro",
      message: "Somente Gestor de Frota ou Administrador pode autorizar veículo em manutenção.",
    });
  if (vehicle?.status === "manutencao" && perms.canManageFleet)
    issues.push({ level: "alerta", message: "Veículo em manutenção: justificativa obrigatória." });
  if (!driver) issues.push({ level: "erro", message: "Selecione o condutor." });
  if (driver && !driver.active)
    issues.push({ level: "erro", message: "Condutor inativo não pode ser autorizado." });
  if (driver && cnhState(driver.license_expiry) === "vencida")
    issues.push({ level: "erro", message: "CNH do condutor está vencida." });
  if (driver && cnhState(driver.license_expiry) === "a_vencer")
    issues.push({ level: "alerta", message: "CNH do condutor vence nos próximos 30 dias." });
  if (!fuel)
    issues.push({ level: "erro", message: "Selecione o combustível/material autorizado." });
  if (vehicle && fuel && !fuelCompatible(vehicle.fuel_type, fuel.name))
    issues.push({
      level: "alerta",
      message: `Combustível ${fuel.name} incompatível com o cadastro do veículo (${vehicle.fuel_type}).`,
    });
  if (!(qty > 0))
    issues.push({ level: "erro", message: "A quantidade máxima deve ser maior que zero." });
  if (new Date(until) <= new Date(from))
    issues.push({ level: "erro", message: "A validade final deve ser posterior à inicial." });
  if (
    perms.roles.includes("unit_manager") &&
    !perms.canManageFleet &&
    vehicle &&
    vehicle.unit_id !== perms.unitId
  )
    issues.push({
      level: "erro",
      message: "Você só pode autorizar veículos da sua própria unidade.",
    });
  if (limitMsg)
    issues.push({
      level: "alerta",
      message: `Limite excedido: ${limitMsg}. Registre a exceção justificada.`,
    });

  const needsJust =
    vehicle?.status === "manutencao" ||
    (vehicle && fuel && !fuelCompatible(vehicle.fuel_type, fuel.name));
  const blocked = issues.some((i) => i.level === "erro");

  async function submit() {
    if (blocked || !perms.orgId || !vehicle || !driver || !fuel) return;
    if (needsJust && justification.trim().length < 10) {
      toast.error("Informe a justificativa (mínimo 10 caracteres).");
      return;
    }
    if (limitMsg && exceptionReason.trim().length < 10) {
      toast.error("Descreva a justificativa da exceção de limite.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("fuel_authorizations").insert({
      organization_id: perms.orgId,
      vehicle_id: vehicle.id,
      unit_id: vehicle.unit_id,
      driver_id: driver.id,
      fuel_type_id: fuel.id,
      supplier_id: supplierId === NONE ? null : supplierId,
      fill_tank: fillTank,
      max_quantity: qty,
      max_value: maxValue ? parseBRNumber(maxValue) : null,
      max_unit_price: maxUnitPrice ? parseBRNumber(maxUnitPrice) : null,
      odometer_km: odometer ? Number(odometer) : null,
      hour_meter: hourMeter ? Number(hourMeter) : null,
      valid_from: new Date(from).toISOString(),
      valid_until: new Date(until).toISOString(),
      purpose: purpose.trim() || null,
      justification: needsJust ? justification.trim() : null,
      limit_exception_reason: limitMsg ? exceptionReason.trim() : null,
      authorizer_id: perms.userId,
      authorizer_name: perms.userName,
      expense_origin: origin,
      cost_center_id: centerId === NONE ? null : centerId,
      contract_id: contractId === NONE ? null : contractId,
      contract_item_id: itemId === NONE ? null : itemId,
      commitment_id: commitmentId === NONE ? null : commitmentId,
      quota_id: quotaId === NONE ? null : quotaId,
      status: (perms.canWrite ? "autorizada" : "pendente") as FuelAuthStatus,
      created_by: perms.userId,
    });
    setSaving(false);
    if (error) {
      const msg = dbMessage(error) || error.message;
      toast.error(msg);
      if (/saldo|Saldo/.test(msg)) await logBudgetBlock(msg, "fuel_authorization", null);
      return;
    }
    toast.success("Autorização emitida.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova autorização de abastecimento</DialogTitle>
          <DialogDescription>
            O código e o código de segurança são gerados automaticamente pelo sistema. O QR Code
            contém apenas um token seguro, sem dados pessoais.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Veículo *</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecione</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem
                    key={v.id}
                    value={v.id}
                    disabled={["inativo", "baixado"].includes(v.status)}
                  >
                    {v.plate ?? v.asset_code} — {v.model ?? v.brand ?? "veículo"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Unidade (automática)</Label>
            <Input value={unit?.name ?? "—"} readOnly className="bg-muted/50" />
          </div>
          <div>
            <Label>Condutor *</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecione</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id} disabled={!driverEligible(d)}>
                    {d.full_name}
                    {!driverEligible(d) ? " (indisponível)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Combustível / material *</Label>
            <Select value={fuelId} onValueChange={setFuelId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Selecione</SelectItem>
                {fuels
                  .filter((f) => f.active)
                  .map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fornecedor / posto</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Livre (qualquer credenciado)</SelectItem>
                {suppliers
                  .filter((s) => s.active)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.trade_name || s.legal_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="mq">Quantidade máxima ({fuel?.measure_unit ?? "litros"}) *</Label>
            <LitersInput id="mq" value={maxQty} onValueChange={setMaxQty} />
            <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={fillTank}
                onChange={(e) => {
                  const on = e.target.checked;
                  setFillTank(on);
                  if (on && vehicle?.tank_capacity) setMaxQty(String(vehicle.tank_capacity));
                }}
              />
              Completar tanque (usa a capacidade cadastrada do veículo como teto)
            </label>
            {fillTank && !vehicle?.tank_capacity ? (
              <p className="mt-1 text-xs text-destructive">
                Veículo sem capacidade de tanque cadastrada: informe a quantidade máxima
                manualmente.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="mv">Valor máximo (R$)</Label>
            <MoneyInput id="mv" value={maxValue} onValueChange={setMaxValue} />
          </div>
          <div>
            <Label htmlFor="mup">Preço unitário máximo (R$)</Label>
            <MoneyInput id="mup" value={maxUnitPrice} onValueChange={setMaxUnitPrice} />
          </div>
          <div>
            <Label htmlFor="od">KM na autorização</Label>
            <Input
              id="od"
              type="number"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder={vehicle?.current_km ? String(vehicle.current_km) : ""}
            />
          </div>
          <div>
            <Label htmlFor="hm">Horímetro na autorização</Label>
            <Input
              id="hm"
              type="number"
              step="0.1"
              value={hourMeter}
              onChange={(e) => setHourMeter(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="vf">Validade inicial *</Label>
            <Input
              id="vf"
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="vu">Validade final *</Label>
            <Input
              id="vu"
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 mt-2 border-t pt-4">
            <p className="gov-title text-sm">Origem do recurso</p>
            <p className="text-xs text-muted-foreground">
              O saldo do contrato, do empenho e da cota é reservado no momento da autorização.
            </p>
          </div>
          <div>
            <Label>Origem da despesa</Label>
            <Select value={origin} onValueChange={(v) => setOrigin(v as ExpenseOrigin)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_ORIGINS.map((o) => (
                  <SelectItem key={o.value} value={o.value} disabled={!o.ready}>
                    {o.label}
                    {o.ready ? "" : " (em preparação)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Centro de custo</Label>
            <Select value={centerId} onValueChange={setCenterId}>
              <SelectTrigger>
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informar</SelectItem>
                {centers
                  .filter((c) => c.active)
                  .map((c) => (
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
              value={contractId}
              onValueChange={(v) => {
                setContractId(v);
                setItemId(NONE);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem contrato</SelectItem>
                {contracts
                  .filter((c) => c.status === "vigente")
                  .map((c) => (
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
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem item</SelectItem>
                {contractItems
                  .filter((i) => contractId === NONE || i.contract_id === contractId)
                  .filter((i) => fuelId === NONE || !i.fuel_type_id || i.fuel_type_id === fuelId)
                  .map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.description} · saldo{" "}
                      {formatLiters(
                        Number(i.quantity) -
                          Number(i.reserved_quantity) -
                          Number(i.consumed_quantity),
                      )}{" "}
                      {i.measure_unit}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Empenho</Label>
            <Select value={commitmentId} onValueChange={setCommitmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem empenho</SelectItem>
                {commitments
                  .filter((c) => c.status === "ativo")
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.number}/{c.exercise} · saldo {brl(Number(c.available_value ?? 0))}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cota</Label>
            <Select value={quotaId} onValueChange={setQuotaId}>
              <SelectTrigger>
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem cota</SelectItem>
                {quotas
                  .filter((q) => q.active)
                  .map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.name} · saldo{" "}
                      {q.quota_type === "financeira"
                        ? brl(Number(q.balance_amount ?? 0))
                        : `${formatLiters(Number(q.balance_amount ?? 0))} ${q.measure_unit}`}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pp">Finalidade</Label>
            <Input id="pp" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          {needsJust && (
            <div className="sm:col-span-2">
              <Label htmlFor="js">Justificativa administrativa *</Label>
              <Textarea
                id="js"
                rows={2}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
              />
            </div>
          )}
          {limitMsg && (
            <div className="sm:col-span-2">
              <Label htmlFor="ex">Justificativa da exceção de limite *</Label>
              <Textarea
                id="ex"
                rows={2}
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
              />
            </div>
          )}
        </div>

        {issues.length > 0 && (
          <ul className="space-y-1 rounded-md border p-3 text-sm">
            {issues.map((i, idx) => (
              <li
                key={idx}
                className={i.level === "erro" ? "text-destructive" : "text-warning-foreground"}
              >
                • {i.message}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || blocked}>
            {saving ? "Emitindo…" : "Emitir autorização"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuthorizationDetail({ auth, onClose }: { auth: AuthorizationRow; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // O QR Code carrega apenas o token opaco da autorização — nenhum dado pessoal.
    QRCode.toDataURL(`frotagov:auth:${auth.qr_token}`, { width: 240, margin: 1 })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {
        if (active) setQr(null);
      });
    return () => {
      active = false;
    };
  }, [auth.qr_token]);

  const items: [string, string][] = [
    ["Código", auth.code ?? "—"],
    ["Situação", label(AUTH_STATUS, auth.status)],
    ["Veículo", auth.vehicle?.plate ?? auth.vehicle?.asset_code ?? "—"],
    ["Unidade", auth.unit?.name ?? "—"],
    ["Condutor", auth.driver?.full_name ?? "—"],
    ["Combustível", auth.fuel?.name ?? "—"],
    ["Fornecedor", auth.supplier?.trade_name || auth.supplier?.legal_name || "Livre"],
    ["Quantidade autorizada", formatLiters(auth.max_quantity)],
    ["Consumido", formatLiters(auth.consumed_quantity)],
    ["Saldo", formatLiters(authorizationBalance(auth))],
    [
      "Reservado no orçamento",
      `${formatLiters(Number(auth.reserved_quantity ?? 0))}${auth.reserved_value != null ? ` · ${brl(Number(auth.reserved_value))}` : ""}`,
    ],
    ["Valor máximo", auth.max_value ? brl(auth.max_value) : "—"],
    ["Preço unitário máximo", auth.max_unit_price ? brl(auth.max_unit_price) : "—"],
    ["Válida de", dateTimeBR(auth.valid_from)],
    ["Válida até", dateTimeBR(auth.valid_until)],
    ["Autorizador", auth.authorizer_name ?? "—"],
    ["Finalidade", auth.purpose ?? "—"],
    ["Justificativa", auth.justification ?? "—"],
    ["Exceção de limite", auth.limit_exception_reason ?? "—"],
    ["Cota de servidor", auth.server_quota_id ? "Vinculada" : "—"],
    ["Exceção de cota de servidor", auth.server_quota_override_reason ?? "—"],
  ];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Autorização {auth.code}</DialogTitle>
          <DialogDescription>
            Apresente o QR Code e o código de segurança no posto. O QR Code não contém CPF, CNH ou
            dados pessoais.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
          {qr ? (
            <img src={qr} alt={`QR Code da autorização ${auth.code}`} className="size-48" />
          ) : (
            <div className="size-48 animate-pulse rounded bg-muted" />
          )}
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Código de segurança
            </p>
            <p className="font-mono text-2xl font-semibold tracking-widest">{auth.security_code}</p>
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {items.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={() => window.print()}>Imprimir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelAuthDialog({
  auth,
  onClose,
  onSaved,
}: {
  auth: AuthorizationRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (reason.trim().length < 5) {
      toast.error("Descreva o motivo do cancelamento.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("fuel_authorizations")
      .update({ status: "cancelada", cancel_reason: reason.trim() })
      .eq("id", auth.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Autorização cancelada.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar autorização {auth.code}</DialogTitle>
          <DialogDescription>
            O registro é preservado com o motivo informado, para auditoria.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo do cancelamento"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            Confirmar cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LimitsDialog({ onClose }: { onClose: () => void }) {
  const { data: limits = [] } = useFuelLimits();
  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();
  const perms = usePerms();
  const invalidate = useInvalidate();

  const [scope, setScope] = useState<LimitScope>("organizacao");
  const [unitId, setUnitId] = useState(NONE);
  const [vehicleId, setVehicleId] = useState(NONE);
  const [dailyQty, setDailyQty] = useState("");
  const [monthlyQty, setMonthlyQty] = useState("");
  const [dailyValue, setDailyValue] = useState("");
  const [monthlyValue, setMonthlyValue] = useState("");
  const [allowException, setAllowException] = useState("sim");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!perms.orgId) return;
    if (scope === "unidade" && unitId === NONE) {
      toast.error("Selecione a unidade.");
      return;
    }
    if (scope === "veiculo" && vehicleId === NONE) {
      toast.error("Selecione o veículo.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("fuel_limits").insert({
      organization_id: perms.orgId,
      scope,
      unit_id: scope === "unidade" ? unitId : null,
      vehicle_id: scope === "veiculo" ? vehicleId : null,
      daily_quantity: dailyQty ? parseBRNumber(dailyQty) : null,
      monthly_quantity: monthlyQty ? parseBRNumber(monthlyQty) : null,
      daily_value: dailyValue ? parseBRNumber(dailyValue) : null,
      monthly_value: monthlyValue ? parseBRNumber(monthlyValue) : null,
      allow_exception: allowException === "sim",
      created_by: perms.userId,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Limite cadastrado.");
    invalidate(["fuel-limits"]);
    setDailyQty("");
    setMonthlyQty("");
    setDailyValue("");
    setMonthlyValue("");
  }

  async function toggle(id: string, active: boolean) {
    const { error } = await supabase.from("fuel_limits").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message);
    else invalidate(["fuel-limits"]);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Limites de combustível</DialogTitle>
          <DialogDescription>
            Configure tetos diários e mensais por órgão, unidade ou veículo. Ao exceder, a emissão
            exige exceção justificada — ou é bloqueada quando a exceção não for permitida.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Abrangência</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as LimitScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_SCOPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scope === "unidade" && (
            <div>
              <Label className="text-xs">Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Selecione</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === "veiculo" && (
            <div>
              <Label className="text-xs">Veículo</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Selecione</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate ?? v.asset_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Litros/dia</Label>
            <LitersInput value={dailyQty} onValueChange={setDailyQty} />
          </div>
          <div>
            <Label className="text-xs">Litros/mês</Label>
            <LitersInput value={monthlyQty} onValueChange={setMonthlyQty} />
          </div>
          <div>
            <Label className="text-xs">R$/dia</Label>
            <MoneyInput value={dailyValue} onValueChange={setDailyValue} />
          </div>
          <div>
            <Label className="text-xs">R$/mês</Label>
            <MoneyInput value={monthlyValue} onValueChange={setMonthlyValue} />
          </div>
          <div>
            <Label className="text-xs">Permite exceção?</Label>
            <Select value={allowException} onValueChange={setAllowException}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim, com justificativa</SelectItem>
                <SelectItem value="nao">Não, bloquear</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={add} disabled={saving} className="w-full">
              Adicionar limite
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Abrangência</TableHead>
              <TableHead>Alvo</TableHead>
              <TableHead className="text-right">L/dia</TableHead>
              <TableHead className="text-right">L/mês</TableHead>
              <TableHead>Exceção</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {limits.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  Nenhum limite configurado.
                </TableCell>
              </TableRow>
            )}
            {limits.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{label(LIMIT_SCOPES, l.scope)}</TableCell>
                <TableCell>
                  {l.unit_id
                    ? units.find((u) => u.id === l.unit_id)?.name
                    : l.vehicle_id
                      ? vehicles.find((v) => v.id === l.vehicle_id)?.plate
                      : "Todo o órgão"}
                </TableCell>
                <TableCell className="text-right">
                  {l.daily_quantity ? formatLiters(l.daily_quantity) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {l.monthly_quantity ? formatLiters(l.monthly_quantity) : "—"}
                </TableCell>
                <TableCell>{l.allow_exception ? "Com justificativa" : "Bloqueia"}</TableCell>
                <TableCell>
                  {l.active ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => toggle(l.id, l.active)}>
                    {l.active ? "Desativar" : "Ativar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
