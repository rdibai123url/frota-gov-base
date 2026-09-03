import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Eye,
  Ban,
  AlertTriangle,
  CircleAlert,
  Info,
  Paperclip,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ALERT_TYPE_LABELS,
  EXPENSE_ORIGINS,
  authorizationBalance,
  authorizationUsable,
  brl,
  dateTimeBR,
  evaluateFueling,
  num,
  supabase,
  useAuthorizations,
  useComprovanteUrl,
  useDrivers,
  useFuelTypes,
  useFuelings,
  useInvalidate,
  usePerms,
  useSuppliers,
  useUnits,
  useVehicles,
  type AuthorizationRow,
  type FuelingRow,
  type RuleIssue,
  type Vehicle,
  parseBRNumber,
  formatLiters,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/abastecimentos")({
  head: () => ({
    meta: [
      { title: "Abastecimentos — FrotaGov" },
      {
        name: "description",
        content:
          "Registro e histórico de abastecimentos da frota pública, com validações automáticas, alertas e cancelamento auditado.",
      },
      { property: "og:title", content: "Abastecimentos — FrotaGov" },
      { property: "og:description", content: "Controle diário de abastecimentos da frota do órgão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Abastecimentos,
});

const NONE = "__none__";
const ALL = "__all__";
const PAGE_SIZE = 12;
/** Alertas que só podem prosseguir com justificativa de usuário autorizado. */
const JUSTIFY_TYPES = ["veiculo_manutencao", "combustivel_incompativel", "tanque_excedido"];
const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function IssueList({ issues }: { issues: RuleIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-2">
      {issues.map((i, idx) => {
        const style =
          i.level === "erro"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : i.level === "alerta"
              ? "border-warning/40 bg-warning/10 text-warning-foreground"
              : "border-border bg-muted text-muted-foreground";
        const Icon = i.level === "erro" ? CircleAlert : i.level === "alerta" ? AlertTriangle : Info;
        return (
          <div key={`${i.type}-${idx}`} className={`flex gap-2 rounded-md border p-3 text-sm ${style}`}>
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="uppercase">{i.level}:</strong> {i.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Abastecimentos() {
  const { data: fuelings = [], isLoading } = useFuelings();
  const { data: vehicles = [] } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: suppliers = [] } = useSuppliers();
  const { data: fuels = [] } = useFuelTypes();
  const perms = usePerms();
  const invalidate = useInvalidate();

  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fVehicle, setFVehicle] = useState(ALL);
  const [fUnit, setFUnit] = useState(ALL);
  const [fSupplier, setFSupplier] = useState(ALL);
  const [fFuel, setFFuel] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [page, setPage] = useState(1);

  const [openNew, setOpenNew] = useState(false);
  const [detail, setDetail] = useState<FuelingRow | null>(null);
  const [cancelling, setCancelling] = useState<FuelingRow | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return fuelings.filter((f) => {
      if (fVehicle !== ALL && f.vehicle_id !== fVehicle) return false;
      if (fUnit !== ALL && f.unit_id !== fUnit) return false;
      if (fSupplier !== ALL && f.supplier_id !== fSupplier) return false;
      if (fFuel !== ALL && f.fuel_type_id !== fFuel) return false;
      if (fStatus === "valido" && f.status !== "valido") return false;
      if (fStatus === "cancelado" && f.status !== "cancelado") return false;
      if (fStatus === "alerta" && (f.alert_flags ?? []).length === 0) return false;
      if (from && new Date(f.fueled_at) < new Date(`${from}T00:00:00`)) return false;
      if (to && new Date(f.fueled_at) > new Date(`${to}T23:59:59`)) return false;
      if (t) {
        const hay = [
          f.vehicle?.plate,
          f.vehicle?.asset_code,
          f.invoice_number,
          f.authorization_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [fuelings, q, from, to, fVehicle, fUnit, fSupplier, fFuel, fStatus]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Abastecimentos"
        description="Histórico completo dos abastecimentos da frota, com validações e trilha de auditoria."
        action={
          perms.canRegister ? (
            <Button className="gap-2" onClick={() => setOpenNew(true)}>
              <Plus className="size-4" /> Novo abastecimento
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2 xl:col-span-2">
          <Label className="text-xs">Busca (placa, patrimônio, nota ou autorização)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Buscar…" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Período inicial</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Período final</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Veículo</Label>
          <Select value={fVehicle} onValueChange={setFVehicle}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Unidade</Label>
          <Select value={fUnit} onValueChange={setFUnit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.acronym || u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Fornecedor</Label>
          <Select value={fSupplier} onValueChange={setFSupplier}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.trade_name || s.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Combustível</Label>
          <Select value={fFuel} onValueChange={setFFuel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {fuels.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              <SelectItem value="valido">Válido</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
              <SelectItem value="alerta">Com alerta / inconsistência</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data / hora</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Combustível</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="text-right">Preço unit.</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">KM / Hor.</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Registrado por</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">
                  Nenhum abastecimento encontrado para os filtros informados.
                </TableCell>
              </TableRow>
            )}
            {rows.map((f) => (
              <TableRow key={f.id} className={f.status === "cancelado" ? "opacity-60" : undefined}>
                <TableCell className="whitespace-nowrap">{dateTimeBR(f.fueled_at)}</TableCell>
                <TableCell className="font-medium">{f.vehicle?.plate ?? "—"}</TableCell>
                <TableCell>{f.unit?.acronym || f.unit?.name || "—"}</TableCell>
                <TableCell>{f.fuel?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{formatLiters(Number(f.quantity))}</TableCell>
                <TableCell className="text-right">{brl(Number(f.unit_price))}</TableCell>
                <TableCell className="text-right font-medium">{brl(Number(f.total_value))}</TableCell>
                <TableCell className="text-right">
                  {f.odometer_km != null ? `${num(Number(f.odometer_km), 0)} km` : ""}
                  {f.hour_meter != null ? ` ${num(Number(f.hour_meter), 1)} h` : ""}
                  {f.odometer_km == null && f.hour_meter == null ? "—" : ""}
                </TableCell>
                <TableCell>{f.supplier?.trade_name || f.supplier?.legal_name || "—"}</TableCell>
                <TableCell>{f.operator_name || "—"}</TableCell>
                <TableCell>
                  {f.status === "cancelado" ? (
                    <Badge variant="destructive">Cancelado</Badge>
                  ) : (f.alert_flags ?? []).length > 0 ? (
                    <Badge className="bg-warning text-warning-foreground">Com alerta</Badge>
                  ) : (
                    <Badge variant="default">Válido</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" aria-label="Detalhes" onClick={() => setDetail(f)}>
                      <Eye className="size-4" />
                    </Button>
                    {perms.canCancel && f.status === "valido" && (
                      <Button variant="ghost" size="icon" aria-label="Cancelar" onClick={() => setCancelling(f)}>
                        <Ban className="size-4" />
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
            {filtered.length} registro(s) · página {current} de {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      {openNew && (
        <NewFuelingDialog
          open={openNew}
          onOpenChange={setOpenNew}
          onSaved={() => invalidate(["fuelings", "fueling-alerts", "vehicles"])}
        />
      )}

      <DetailDialog fueling={detail} onClose={() => setDetail(null)} />

      <CancelDialog
        fueling={cancelling}
        onClose={() => setCancelling(null)}
        onDone={() => invalidate(["fuelings", "fueling-alerts"])}
      />
    </>
  );
}

/* ------------------------- Novo abastecimento ------------------------- */

function NewFuelingDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { data: vehicles = [] } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: suppliers = [] } = useSuppliers();
  const { data: fuels = [] } = useFuelTypes();
  const { data: history = [] } = useFuelings();
  const { data: auths = [] } = useAuthorizations();
  const { data: drivers = [] } = useDrivers();
  const perms = usePerms();

  const now = new Date();
  const [authId, setAuthId] = useState(NONE);
  const [driverId, setDriverId] = useState(NONE);
  const [noAuthReason, setNoAuthReason] = useState("");
  const [vehicleId, setVehicleId] = useState(NONE);
  const [supplierId, setSupplierId] = useState(NONE);
  const [fuelId, setFuelId] = useState(NONE);
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [time, setTime] = useState(now.toTimeString().slice(0, 5));
  const [driver, setDriver] = useState("");
  const [operator, setOperator] = useState(perms.userName);
  const [odometer, setOdometer] = useState("");
  const [hourMeter, setHourMeter] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [invoice, setInvoice] = useState("");
  const [authorization, setAuthorization] = useState("");
  const [notes, setNotes] = useState("");
  const [justification, setJustification] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const usableAuths = useMemo(() => auths.filter((a) => authorizationUsable(a)), [auths]);
  const selectedAuth: AuthorizationRow | null = usableAuths.find((a) => a.id === authId) ?? null;

  // Ao escolher a autorização, os dados já definidos são preenchidos automaticamente.
  useEffect(() => {
    if (!selectedAuth) return;
    setVehicleId(selectedAuth.vehicle_id);
    if (selectedAuth.fuel_type_id) setFuelId(selectedAuth.fuel_type_id);
    if (selectedAuth.supplier_id) setSupplierId(selectedAuth.supplier_id);
    if (selectedAuth.driver_id) setDriverId(selectedAuth.driver_id);
  }, [selectedAuth]);

  const vehicle: Vehicle | null = vehicles.find((v) => v.id === vehicleId) ?? null;
  const unit = units.find((u) => u.id === vehicle?.unit_id) ?? null;
  const fuel = fuels.find((f) => f.id === fuelId) ?? null;
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;

  const qty = parseBRNumber(quantity);
  const price = parseBRNumber(unitPrice);
  const total = qty * price;

  const issues = useMemo(
    () =>
      evaluateFueling(
        {
          vehicle,
          fuel,
          supplier,
          fueledAt: date && time ? new Date(`${date}T${time}:00`) : null,
          quantity: qty,
          unitPrice: price,
          odometer: odometer === "" ? null : Number(odometer.replace(",", ".")),
          hourMeter: hourMeter === "" ? null : Number(hourMeter.replace(",", ".")),
        },
        history,
      ),
    [vehicle, fuel, supplier, date, time, qty, price, odometer, hourMeter, history],
  );

  const authIssues: RuleIssue[] = [];
  if (selectedAuth) {
    const saldo = authorizationBalance(selectedAuth);
    if (qty > saldo + 0.001)
      authIssues.push({
        level: "erro",
        type: "acima_do_autorizado",
        message: `Quantidade (${formatLiters(qty)}) excede o saldo autorizado (${formatLiters(saldo)}).`,
      });
    if (selectedAuth.max_unit_price && price > Number(selectedAuth.max_unit_price) + 0.0001)
      authIssues.push({
        level: "erro",
        type: "acima_do_autorizado",
        message: `Preço unitário acima do máximo autorizado (${brl(selectedAuth.max_unit_price)}).`,
      });
    if (selectedAuth.max_value && total > Number(selectedAuth.max_value) + 0.01)
      authIssues.push({
        level: "erro",
        type: "acima_do_autorizado",
        message: `Valor total acima do máximo autorizado (${brl(selectedAuth.max_value)}).`,
      });
    if (new Date(`${date}T${time}:00`) > new Date(selectedAuth.valid_until))
      authIssues.push({
        level: "erro",
        type: "autorizacao_expirada",
        message: "A autorização selecionada já expirou para a data informada.",
      });
    if (vehicleId !== selectedAuth.vehicle_id)
      authIssues.push({
        level: "erro",
        type: "acima_do_autorizado",
        message: "O veículo deve ser o mesmo da autorização.",
      });
  } else {
    authIssues.push({
      level: "alerta",
      type: "abastecimento_sem_autorizacao",
      message: perms.canWrite
        ? "Abastecimento sem autorização prévia: exige justificativa e gera alerta na auditoria."
        : "Seu perfil só pode registrar abastecimentos vinculados a uma autorização válida.",
    });
  }

  const allIssues = [...issues, ...authIssues];
  const errors = allIssues.filter((i) => i.level === "erro");
  const alerts = allIssues.filter((i) => i.level === "alerta");
  const needsAuthReason = !selectedAuth;
  const needsJustification = alerts.some((a) => JUSTIFY_TYPES.includes(a.type));

  async function submit() {
    if (errors.length > 0) {
      toast.error("Corrija os erros antes de salvar.");
      return;
    }
    if (needsAuthReason && !perms.canWrite) {
      toast.error("Somente gestores podem registrar abastecimento sem autorização prévia.");
      return;
    }
    if (needsAuthReason && noAuthReason.trim().length < 10) {
      toast.error("Justifique o abastecimento sem autorização (mínimo de 10 caracteres).");
      return;
    }
    if (needsJustification && !perms.canWrite) {
      toast.error("Este abastecimento exige justificativa de usuário autorizado (gestor ou administrador).");
      return;
    }
    if (needsJustification && justification.trim().length < 10) {
      toast.error("Descreva a justificativa administrativa (mínimo de 10 caracteres).");
      return;
    }
    if (file) {
      if (file.size > MAX_FILE) {
        toast.error("O comprovante deve ter no máximo 10 MB.");
        return;
      }
      if (!ALLOWED_MIME.includes(file.type)) {
        toast.error("Formato de comprovante inválido. Use JPG, PNG, WEBP ou PDF.");
        return;
      }
    }

    setSaving(true);
    const orgId = perms.orgId;
    if (!orgId) {
      setSaving(false);
      toast.error("Seu usuário não está vinculado a um órgão.");
      return;
    }

    const { data, error } = await supabase
      .from("fuelings")
      .insert({
        organization_id: orgId,
        vehicle_id: vehicle!.id,
        unit_id: vehicle!.unit_id,
        supplier_id: supplier?.id ?? null,
        fuel_type_id: fuel!.id,
        fueled_at: new Date(`${date}T${time}:00`).toISOString(),
        driver_id: driverId === NONE ? null : driverId,
        driver_name: driverId === NONE ? driver || null : null,
        authorization_id: selectedAuth?.id ?? null,
        without_authorization_reason: needsAuthReason ? noAuthReason.trim() : null,
        operator_name: operator || perms.userName || null,
        odometer_km: odometer === "" ? null : Number(odometer.replace(",", ".")),
        hour_meter: hourMeter === "" ? null : Number(hourMeter.replace(",", ".")),
        quantity: qty,
        unit_price: price,
        invoice_number: invoice || null,
        authorization_number: selectedAuth?.code ?? (authorization || null),
        notes: notes || null,
        alert_flags: alerts.map((a) => a.type),
        alert_justification: needsJustification ? justification.trim() : null,
        created_by: perms.userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      setSaving(false);
      toast.error("Não foi possível registrar o abastecimento. Verifique suas permissões.");
      return;
    }

    if (alerts.length > 0) {
      await supabase.from("fueling_alerts").insert(
        alerts.map((a) => ({
          organization_id: orgId,
          fueling_id: data.id,
          vehicle_id: vehicle!.id,
          alert_type: a.type,
          severity: "alerta" as const,
          message: a.message,
          justification: JUSTIFY_TYPES.includes(a.type)
            ? justification.trim()
            : a.type === "abastecimento_sem_autorizacao"
              ? noAuthReason.trim()
              : null,
          created_by: perms.userId,
        })),
      );
    }

    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `${orgId}/${data.id}/comprovante-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("comprovantes")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        toast.warning("Abastecimento salvo, mas o comprovante não pôde ser anexado.");
      } else {
        await supabase.from("fuelings").update({ attachment_path: path }).eq("id", data.id);
      }
    }

    setSaving(false);
    toast.success(
      alerts.length > 0 ? "Abastecimento registrado com alertas." : "Abastecimento registrado.",
    );
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo abastecimento</DialogTitle>
          <DialogDescription>
            Preencha os dados da operação. As regras automáticas são verificadas antes de salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <Label>Autorização de abastecimento</Label>
            <Select value={authId} onValueChange={setAuthId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a autorização" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem autorização prévia (exige justificativa)</SelectItem>
                {usableAuths.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.vehicle?.plate} · saldo {formatLiters(authorizationBalance(a))} {a.fuel?.measure_unit ?? "L"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAuth && (
              <p className="mt-2 text-xs text-muted-foreground">
                Saldo disponível: <strong>{formatLiters(authorizationBalance(selectedAuth))}</strong> ·
                {selectedAuth.max_unit_price ? ` preço máx. ${brl(selectedAuth.max_unit_price)} ·` : ""}
                {selectedAuth.max_value ? ` valor máx. ${brl(selectedAuth.max_value)} ·` : ""} válida até {dateTimeBR(selectedAuth.valid_until)}
              </p>
            )}
            {needsAuthReason && (
              <div className="mt-3">
                <Label htmlFor="noauth">Justificativa da ausência de autorização *</Label>
                <Textarea id="noauth" rows={2} value={noAuthReason} onChange={(e) => setNoAuthReason(e.target.value)} />
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Veículo / equipamento *</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Selecione</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate} — {[v.brand, v.model].filter(Boolean).join(" ") || "sem modelo"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Secretaria / unidade</Label>
              <Input value={unit?.name ?? "—"} readOnly disabled />
            </div>
            <div>
              <Label>Fornecedor / posto</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.trade_name || s.legal_name}
                      {s.active ? "" : " (inativo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Combustível *</Label>
              <Select value={fuelId} onValueChange={setFuelId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Selecione</SelectItem>
                  {fuels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                      {f.active ? "" : " (inativo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date">Data *</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="time">Horário *</Label>
              <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="operator">Responsável pelo registro</Label>
              <Input id="operator" value={operator} onChange={(e) => setOperator(e.target.value)} />
            </div>
            <div>
              <Label>Condutor</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger><SelectValue placeholder="Selecione o condutor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id} disabled={!d.active}>
                      {d.full_name}{d.active ? "" : " (inativo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="odometer">Quilometragem atual (km)</Label>
              <Input
                id="odometer"
                inputMode="decimal"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder={vehicle?.current_km != null ? `Atual: ${num(Number(vehicle.current_km), 0)}` : ""}
              />
            </div>
            <div>
              <Label htmlFor="hour">Horímetro atual (h)</Label>
              <Input
                id="hour"
                inputMode="decimal"
                value={hourMeter}
                onChange={(e) => setHourMeter(e.target.value)}
                placeholder={vehicle?.hour_meter != null ? `Atual: ${num(Number(vehicle.hour_meter), 1)}` : ""}
              />
            </div>
            <div>
              <Label htmlFor="qty">Quantidade * ({fuel?.measure_unit ?? "litro"})</Label>
              <LitersInput id="qty" value={quantity} onValueChange={setQuantity} />
            </div>
            <div>
              <Label htmlFor="price">Preço unitário * (R$)</Label>
              <MoneyInput id="price" value={unitPrice} onValueChange={setUnitPrice} />
            </div>
            <div>
              <Label>Valor total</Label>
              <Input value={brl(total)} readOnly disabled />
            </div>
            <div>
              <Label htmlFor="invoice">Nota fiscal / documento</Label>
              <Input id="invoice" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="auth">Número da autorização</Label>
              <Input id="auth" value={authorization} onChange={(e) => setAuthorization(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="file">Comprovante (JPG, PNG, WEBP ou PDF · até 10 MB)</Label>
              <Input
                id="file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <IssueList issues={allIssues} />

          {needsJustification && (
            <div>
              <Label htmlFor="just">Justificativa administrativa *</Label>
              <Textarea
                id="just"
                rows={3}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Descreva o motivo que autoriza este abastecimento."
              />
              {!perms.canWrite && (
                <p className="mt-1 text-xs text-destructive">
                  Seu perfil não pode autorizar este abastecimento. Solicite a um gestor de frota.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || errors.length > 0}>
            {saving ? "Salvando…" : "Registrar abastecimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Detalhe ------------------------------- */

function Row({ label: l, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{l}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

function DetailDialog({ fueling, onClose }: { fueling: FuelingRow | null; onClose: () => void }) {
  const { data: comprovante } = useComprovanteUrl(fueling?.attachment_path);
  if (!fueling) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abastecimento — {fueling.vehicle?.plate}</DialogTitle>
          <DialogDescription>{dateTimeBR(fueling.fueled_at)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <Row label="Situação" value={fueling.status === "cancelado" ? "Cancelado" : "Válido"} />
          <Row label="Unidade" value={fueling.unit?.name} />
          <Row label="Fornecedor" value={fueling.supplier?.trade_name || fueling.supplier?.legal_name} />
          <Row label="Combustível" value={fueling.fuel?.name} />
          <Row label="Quantidade" value={`${formatLiters(Number(fueling.quantity))} ${fueling.fuel?.measure_unit ?? ""}`} />
          <Row label="Preço unitário" value={brl(Number(fueling.unit_price))} />
          <Row label="Valor total" value={brl(Number(fueling.total_value))} />
          <Row label="KM registrado" value={fueling.odometer_km != null ? num(Number(fueling.odometer_km), 0) : null} />
          <Row label="Horímetro" value={fueling.hour_meter != null ? num(Number(fueling.hour_meter), 1) : null} />
          <Row
            label="Condutor"
            value={
              fueling.driver?.full_name ??
              (fueling.driver_name ? `${fueling.driver_name} (condutor histórico não vinculado)` : "—")
            }
          />
          <Row
            label="Autorização"
            value={fueling.authorization?.code ?? (fueling.without_authorization_reason ? "Sem autorização prévia" : "—")}
          />
          <Row label="Justificativa (sem autorização)" value={fueling.without_authorization_reason ?? "—"} />
          <Row label="Registrado por" value={fueling.operator_name} />
          <Row label="Nota fiscal" value={fueling.invoice_number} />
          <Row label="Autorização" value={fueling.authorization_number} />
          <Row label="Atualizou o veículo" value={fueling.vehicle_updated ? "Sim" : "Não"} />
          <div className="sm:col-span-3 border-t pt-3">
            <p className="gov-title text-sm">Origem do recurso</p>
          </div>
          <Row label="Origem da despesa" value={EXPENSE_ORIGINS.find((o) => o.value === fueling.expense_origin)?.label ?? fueling.expense_origin} />
          <Row label="Contrato" value={fueling.contract?.number ?? "—"} />
          <Row label="Item contratual" value={fueling.contract_item?.description ?? "—"} />
          <Row label="Empenho" value={fueling.commitment ? `${fueling.commitment.number}/${fueling.commitment.exercise}` : "—"} />
          <Row label="Centro de custo" value={fueling.cost_center ? `${fueling.cost_center.code} — ${fueling.cost_center.name}` : "—"} />
          <Row label="Cota" value={fueling.quota?.name ?? "—"} />
          <Row label="Registrado em" value={dateTimeBR(fueling.created_at)} />
          <div className="sm:col-span-3">
            <Row label="Observações" value={fueling.notes} />
          </div>
          {(fueling.alert_flags ?? []).length > 0 && (
            <div className="sm:col-span-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Alertas gerados</p>
              <div className="flex flex-wrap gap-2">
                {fueling.alert_flags.map((a) => (
                  <Badge key={a} className="bg-warning text-warning-foreground">
                    {ALERT_TYPE_LABELS[a] ?? a}
                  </Badge>
                ))}
              </div>
              {fueling.alert_justification && (
                <p className="text-sm">
                  <strong>Justificativa:</strong> {fueling.alert_justification}
                </p>
              )}
            </div>
          )}
          {fueling.status === "cancelado" && (
            <div className="sm:col-span-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p><strong>Cancelado em:</strong> {dateTimeBR(fueling.cancelled_at)}</p>
              <p><strong>Motivo:</strong> {fueling.cancel_reason}</p>
            </div>
          )}
          <div className="sm:col-span-3">
            {fueling.attachment_path ? (
              comprovante ? (
                <a
                  href={comprovante}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary underline"
                >
                  <FileDown className="size-4" /> Abrir comprovante anexado
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">Carregando comprovante…</span>
              )
            ) : (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Paperclip className="size-4" /> Sem comprovante anexado
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Cancelamento ---------------------------- */

function CancelDialog({
  fueling,
  onClose,
  onDone,
}: {
  fueling: FuelingRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  if (!fueling) return null;

  async function confirm() {
    if (reason.trim().length < 5) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("fuelings")
      .update({ status: "cancelado", cancel_reason: reason.trim() })
      .eq("id", fueling!.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível cancelar. Verifique suas permissões.");
      return;
    }
    toast.success("Abastecimento cancelado. O registro permanece no histórico.");
    setReason("");
    onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancelar abastecimento</DialogTitle>
          <DialogDescription>
            O registro não é excluído: permanece no histórico com situação CANCELADO e trilha de auditoria.
            O KM/horímetro já aplicado ao veículo não é revertido.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="reason">Motivo do cancelamento *</Label>
          <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={saving}>
            {saving ? "Cancelando…" : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
