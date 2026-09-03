import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Fuel, Upload, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { ListPagination, usePaged } from "@/components/list-pagination";
import { LitersInput, MoneyInput, CpfInput } from "@/components/form-fields";
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
  SERVER_QUOTA_PERIODS,
  SERVER_QUOTA_STATUS,
  brl,
  dateBR,
  formatCPF,
  formatLiters,
  isValidCPF,
  label,
  num,
  onlyDigits,
  parseBRNumber,
  serverQuotaUsage,
  supabase,
  useFuelTypes,
  useInvalidate,
  usePerms,
  useServerFuelQuotas,
  useServerQuotaFuelings,
  useUnits,
  useVehicles,
  type ServerFuelQuotaRow,
  type ServerQuotaPeriod,
  type ServerQuotaStatus,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/cotas-servidor")({
  head: () => ({
    meta: [
      { title: "Cotas de combustível de servidor — FrotaGov" },
      {
        name: "description",
        content:
          "Cotas de combustível concedidas a veículos particulares de servidores: beneficiário, periodicidade, consumo do ciclo e saldo restante.",
      },
      { property: "og:title", content: "Cotas de combustível de servidor — FrotaGov" },
      {
        property: "og:description",
        content: "Controle de cotas semanais e mensais de combustível para veículos particulares de servidores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CotasServidor,
});

const ALL = "__all__";
const NONE = "__none__";

const schema = z.object({
  beneficiary_name: z.string().trim().min(3, "Informe o nome do servidor").max(160),
  beneficiary_cpf: z.string().trim().min(11, "Informe o CPF do servidor"),
  registration_code: z.string().trim().max(40).optional(),
  job_title: z.string().trim().max(120).optional(),
  quota_quantity: z.string().optional(),
  quota_value: z.string().optional(),
  start_date: z.string().min(1, "Informe o início da vigência"),
  end_date: z.string().optional(),
  justification: z.string().trim().max(600).optional(),
  notes: z.string().trim().max(600).optional(),
});

function StatusBadge({ status }: { status: ServerQuotaStatus }) {
  return (
    <Badge variant={status === "ativa" ? "default" : status === "suspensa" ? "destructive" : "secondary"}>
      {label(SERVER_QUOTA_STATUS, status)}
    </Badge>
  );
}

function CotasServidor() {
  const { data: quotas = [], isLoading } = useServerFuelQuotas();
  const { data: fuelings = [] } = useServerQuotaFuelings();
  const { data: vehicles = [] } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: fuels = [] } = useFuelTypes();
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServerFuelQuotaRow | null>(null);
  const [vehicleId, setVehicleId] = useState(NONE);
  const [unitId, setUnitId] = useState(NONE);
  const [fuelId, setFuelId] = useState(NONE);
  const [period, setPeriod] = useState<ServerQuotaPeriod>("mensal");
  const [status, setStatus] = useState<ServerQuotaStatus>("ativa");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [fStatus, setFStatus] = useState(ALL);
  const [search, setSearch] = useState("");

  const serverVehicles = useMemo(() => vehicles.filter((v) => v.is_private_server_vehicle), [vehicles]);

  const rows = useMemo(
    () =>
      quotas
        .map((q) => ({ q, usage: serverQuotaUsage(q, fuelings) }))
        .filter(({ q }) => {
          if (fStatus !== ALL && q.status !== fStatus) return false;
          const s = search.trim().toLowerCase();
          return (
            !s ||
            `${q.beneficiary_name} ${q.beneficiary_cpf} ${q.registration_code ?? ""} ${q.vehicle?.plate ?? ""}`
              .toLowerCase()
              .includes(s)
          );
        }),
    [quotas, fuelings, fStatus, search],
  );

  const totals = useMemo(
    () => ({
      ativas: rows.filter((r) => r.q.status === "ativa").length,
      litros: rows.reduce((s, r) => s + r.usage.used, 0),
      valor: rows.reduce((s, r) => s + r.usage.value, 0),
      criticas: rows.filter((r) => r.usage.exhausted || r.usage.nearLimit).length,
    }),
    [rows],
  );

  function openNew() {
    setEditing(null);
    setVehicleId(NONE);
    setUnitId(NONE);
    setFuelId(NONE);
    setPeriod("mensal");
    setStatus("ativa");
    setFile(null);
    setOpen(true);
  }

  function openEdit(q: ServerFuelQuotaRow) {
    setEditing(q);
    setVehicleId(q.vehicle_id);
    setUnitId(q.unit_id ?? NONE);
    setFuelId(q.fuel_type_id ?? NONE);
    setPeriod(q.period);
    setStatus(q.status);
    setFile(null);
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
    if (vehicleId === NONE) {
      toast.error("Selecione o veículo particular do servidor.");
      return;
    }
    if (!isValidCPF(d.beneficiary_cpf)) {
      toast.error("CPF do servidor inválido.");
      return;
    }
    const qty = parseBRNumber(d.quota_quantity);
    const val = parseBRNumber(d.quota_value);
    if (!(qty > 0) && !(val > 0)) {
      toast.error("Informe a quantidade da cota (ou o valor máximo do ciclo).");
      return;
    }
    if (d.end_date && d.end_date < d.start_date) {
      toast.error("O fim da vigência deve ser posterior ao início.");
      return;
    }

    setSaving(true);
    let attachment = editing?.attachment_path ?? null;
    if (file) {
      const path = `${orgId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("contratos").upload(path, file, { upsert: false });
      if (up.error) {
        setSaving(false);
        toast.error("Não foi possível enviar o arquivo do ato de concessão.");
        return;
      }
      attachment = path;
    }

    const payload = {
      vehicle_id: vehicleId,
      unit_id: unitId === NONE ? null : unitId,
      fuel_type_id: fuelId === NONE ? null : fuelId,
      beneficiary_name: d.beneficiary_name,
      beneficiary_cpf: onlyDigits(d.beneficiary_cpf),
      registration_code: d.registration_code || null,
      job_title: d.job_title || null,
      period,
      quota_quantity: qty,
      quota_value: val > 0 ? val : null,
      start_date: d.start_date,
      end_date: d.end_date || null,
      status,
      justification: d.justification || null,
      attachment_path: attachment,
      notes: d.notes || null,
    };

    const { error } = editing
      ? await supabase.from("server_fuel_quotas").update(payload).eq("id", editing.id)
      : await supabase.from("server_fuel_quotas").insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Não foi possível salvar a cota.");
      return;
    }
    toast.success(editing ? "Cota atualizada." : "Cota cadastrada.");
    invalidate(["server-fuel-quotas", "server-quota-fuelings", "vehicles"]);
    setOpen(false);
  }

  async function openAttachment(path: string) {
    const { data } = await supabase.storage.from("contratos").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else toast.error("Não foi possível abrir o arquivo.");
  }

  const paged = usePaged(rows);

  return (
    <>
      <PageHeader
        title="Cotas de combustível de servidor"
        description="Concessões de combustível a veículos particulares de servidores, com controle de consumo por ciclo."
        action={
          canManageFleet && orgId ? (
            <Button onClick={openNew} className="gap-2" disabled={serverVehicles.length === 0}>
              <Plus className="size-4" /> Nova cota
            </Button>
          ) : undefined
        }
      />

      {serverVehicles.length === 0 && (
        <div className="mb-6 rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-card">
          Nenhum veículo está marcado como “particular de servidor com cota de combustível”. Marque o veículo em Frota →
          Veículos para poder conceder a cota.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Cotas ativas", value: String(totals.ativas) },
          { label: "Consumo do ciclo", value: `${formatLiters(totals.litros)} L` },
          { label: "Valor no ciclo", value: brl(totals.valor) },
          { label: "Cotas em alerta", value: String(totals.criticas) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Label>Buscar</Label>
          <Input
            placeholder="Servidor, CPF, matrícula ou placa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {SERVER_QUOTA_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && rows.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground shadow-card">
          <Fuel className="mx-auto mb-2 size-6 opacity-50" />
          Nenhuma cota encontrada com os filtros aplicados.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servidor</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Periodicidade</TableHead>
                <TableHead className="text-right">Cota do ciclo</TableHead>
                <TableHead className="text-right">Consumido</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.rows.map(({ q, usage }) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <span className="font-medium">{q.beneficiary_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      CPF {formatCPF(q.beneficiary_cpf)}
                      {q.registration_code ? ` · Matrícula ${q.registration_code}` : ""}
                      {q.job_title ? ` · ${q.job_title}` : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {q.unit?.name ?? "Sem unidade"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {q.vehicle?.plate ?? "—"}
                    <span className="block text-xs text-muted-foreground">
                      {[q.vehicle?.brand, q.vehicle?.model].filter(Boolean).join(" ") || "—"}
                      {q.fuel ? ` · ${q.fuel.name}` : " · qualquer combustível"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {label(SERVER_QUOTA_PERIODS, q.period)}
                    <span className="block text-xs text-muted-foreground">
                      Ciclo {dateBR(usage.cycleStart.toISOString().slice(0, 10))} a{" "}
                      {dateBR(new Date(usage.cycleEnd.getTime() - 86400000).toISOString().slice(0, 10))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatLiters(usage.total)} L
                    {q.quota_value != null && (
                      <span className="block text-xs text-muted-foreground">até {brl(Number(q.quota_value))}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatLiters(usage.used)} L
                    <span className="block text-xs text-muted-foreground">{brl(usage.value)}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatLiters(usage.balance)} L
                    <span className="block text-xs text-muted-foreground">{num(usage.percent, 1)}% usado</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {dateBR(q.start_date)} a {q.end_date ? dateBR(q.end_date) : "indeterminado"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={q.status} />
                    {(usage.exhausted || usage.nearLimit) && q.status === "ativa" && (
                      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <AlertTriangle className="size-3" />
                        {usage.exhausted ? "Cota esgotada no ciclo" : "Próxima do limite"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {q.attachment_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Abrir ato de concessão"
                          onClick={() => openAttachment(q.attachment_path!)}
                        >
                          <ExternalLink className="size-4" />
                        </Button>
                      )}
                      {canManageFleet && (
                        <Button variant="ghost" size="icon" aria-label="Editar cota" onClick={() => openEdit(q)}>
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
      )}
      <ListPagination state={paged} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cota de servidor" : "Nova cota de servidor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="beneficiary_name">Servidor beneficiário *</Label>
                <Input
                  id="beneficiary_name"
                  name="beneficiary_name"
                  defaultValue={editing?.beneficiary_name ?? ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="beneficiary_cpf">CPF *</Label>
                <CpfInput id="beneficiary_cpf" name="beneficiary_cpf" defaultValue={editing?.beneficiary_cpf ?? ""} />
              </div>
              <div>
                <Label htmlFor="registration_code">Matrícula</Label>
                <Input
                  id="registration_code"
                  name="registration_code"
                  defaultValue={editing?.registration_code ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="job_title">Cargo / função</Label>
                <Input id="job_title" name="job_title" defaultValue={editing?.job_title ?? ""} />
              </div>
              <div>
                <Label>Secretaria / unidade</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
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
              <div className="sm:col-span-2">
                <Label>Veículo particular do servidor *</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o veículo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Selecione</SelectItem>
                    {serverVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate} — {[v.brand, v.model].filter(Boolean).join(" ") || "sem modelo"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Combustível autorizado</Label>
                <Select value={fuelId} onValueChange={setFuelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Qualquer combustível</SelectItem>
                    {fuels.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Periodicidade *</Label>
                <Select value={period} onValueChange={(v) => setPeriod(v as ServerQuotaPeriod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVER_QUOTA_PERIODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quota_quantity">Quantidade por ciclo (L) *</Label>
                <LitersInput
                  id="quota_quantity"
                  name="quota_quantity"
                  defaultValue={editing ? Number(editing.quota_quantity) : ""}
                />
              </div>
              <div>
                <Label htmlFor="quota_value">Valor máximo por ciclo (R$)</Label>
                <MoneyInput
                  id="quota_value"
                  name="quota_value"
                  defaultValue={editing?.quota_value != null ? Number(editing.quota_value) : ""}
                />
              </div>
              <div>
                <Label htmlFor="start_date">Início da vigência *</Label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  defaultValue={editing?.start_date ?? new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="end_date">Fim da vigência</Label>
                <Input id="end_date" name="end_date" type="date" defaultValue={editing?.end_date ?? ""} />
              </div>
              <div>
                <Label>Situação *</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ServerQuotaStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVER_QUOTA_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="justification">Justificativa / ato de concessão</Label>
                <Textarea id="justification" name="justification" rows={2} defaultValue={editing?.justification ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="file">Anexo do ato (PDF)</Label>
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
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O saldo da cota não acumula entre ciclos: a cada nova semana ou mês o servidor volta a dispor do total
              concedido. Autorizações e abastecimentos acima da cota são bloqueados; a liberação excepcional exige
              justificativa de gestor de frota e fica registrada na auditoria.
            </p>
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
    </>
  );
}
