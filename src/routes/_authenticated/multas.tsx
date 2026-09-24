import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Ban, FileWarning, Paperclip, Pencil, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { MoneyInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  FINE_LIABILITY,
  FINE_STATUS,
  brl,
  dateBR,
  dateTimeBR,
  dbMessage,
  dueState,
  label,
  openFleetFile,
  parseBRNumber,
  suggestDriverForMoment,
  supabase,
  uploadFleetFile,
  useDrivers,
  useInvalidate,
  usePerms,
  useTrafficFines,
  useUnits,
  useVehicleUsages,
  useVehicles,
  type FineStatus,
  type TrafficFineRow,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/multas")({
  head: () => ({
    meta: [
      { title: "Multas e Infrações — FrotaGov" },
      {
        name: "description",
        content:
          "Controle de autos de infração da frota pública: órgão autuador, enquadramento, valores, defesa, responsabilidade e anexos.",
      },
      { property: "og:title", content: "Multas e Infrações — FrotaGov" },
      { property: "og:description", content: "Gestão de multas de trânsito dos veículos do órgão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Multas,
});

const ALL = "__all__";
const NONE = "__none__";

const schema = z.object({
  notice_number: z.string().trim().min(1, "Informe o número do auto de infração").max(60),
  issuing_authority: z.string().trim().min(1, "Informe o órgão autuador").max(120),
  infraction_code: z.string().trim().max(40).optional(),
  description: z.string().trim().min(3, "Descreva a infração").max(600),
  occurred_at: z.string().min(1, "Informe a data e hora da infração"),
  location: z.string().trim().max(200).optional(),
  amount: z.string().optional(),
  discount_amount: z.string().optional(),
  due_date: z.string().optional(),
  defense_protocol: z.string().trim().max(80).optional(),
  responsible_name: z.string().trim().max(120).optional(),
  points: z.string().optional(),
  notes: z.string().trim().max(600).optional(),
});

const numOrNull = (v: string | undefined) => {
  const n = parseBRNumber(String(v ?? ""));
  return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

const OPEN_STATUS: FineStatus[] = ["recebida", "em_analise", "defesa_apresentada", "indeferida"];

function Multas() {
  const { data: fines = [], isLoading } = useTrafficFines();
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: units = [] } = useUnits();
  const { data: usages = [] } = useVehicleUsages();
  const { canRegister, canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrafficFineRow | null>(null);
  const [vehicleId, setVehicleId] = useState(NONE);
  const [unitId, setUnitId] = useState(NONE);
  const [driverId, setDriverId] = useState(NONE);
  const [usageId, setUsageId] = useState(NONE);
  const [status, setStatus] = useState<FineStatus>("recebida");
  const [liability, setLiability] = useState("nao_definida");
  const [occurredAt, setOccurredAt] = useState("");
  const [suggestion, setSuggestion] = useState<{ driverId: string; usageId: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [canceling, setCanceling] = useState<TrafficFineRow | null>(null);

  const [fStatus, setFStatus] = useState(ALL);
  const [fVehicle, setFVehicle] = useState(ALL);
  const [search, setSearch] = useState("");

  // Sugestão automática de condutor a partir das utilizações registradas
  useEffect(() => {
    if (!occurredAt || vehicleId === NONE) {
      setSuggestion(null);
      return;
    }
    const u = suggestDriverForMoment(usages, vehicleId, new Date(occurredAt));
    if (!u || !u.driver_id) {
      setSuggestion(null);
      return;
    }
    setSuggestion({
      driverId: u.driver_id,
      usageId: u.id,
      text: `${u.driver?.full_name ?? "Condutor"} — utilização ${u.code ?? ""} (${dateTimeBR(
        u.actual_departure ?? u.planned_departure,
      )})`,
    });
  }, [occurredAt, vehicleId, usages]);

  const filtered = useMemo(
    () =>
      fines.filter((f) => {
        if (fStatus !== ALL && f.status !== fStatus) return false;
        if (fVehicle !== ALL && f.vehicle_id !== fVehicle) return false;
        const q = search.trim().toLowerCase();
        return (
          !q ||
          `${f.code ?? ""} ${f.notice_number} ${f.issuing_authority} ${f.description} ${(f.vehicle?.plate ?? f.vehicle?.asset_code ?? "")}`
            .toLowerCase()
            .includes(q)
        );
      }),
    [fines, fStatus, fVehicle, search],
  );

  const totals = useMemo(() => {
    const abertas = fines.filter((f) => OPEN_STATUS.includes(f.status));
    return {
      abertas: abertas.length,
      valor: abertas.reduce((s, f) => s + Number(f.amount ?? 0), 0),
      vencidas: abertas.filter((f) => dueState(f.due_date) === "vencido").length,
      pagas: fines.filter((f) => f.status === "paga").length,
    };
  }, [fines]);

  function openNew() {
    setEditing(null);
    setVehicleId(NONE);
    setUnitId(NONE);
    setDriverId(NONE);
    setUsageId(NONE);
    setStatus("recebida");
    setLiability("nao_definida");
    setOccurredAt("");
    setSuggestion(null);
    setOpen(true);
  }

  function openEdit(f: TrafficFineRow) {
    setEditing(f);
    setVehicleId(f.vehicle_id);
    setUnitId(f.unit_id ?? NONE);
    setDriverId(f.driver_id ?? NONE);
    setUsageId(f.usage_id ?? NONE);
    setStatus(f.status);
    setLiability(f.liability);
    setOccurredAt(f.occurred_at.slice(0, 16));
    setSuggestion(null);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (vehicleId === NONE) {
      toast.error("Selecione o veículo autuado.");
      return;
    }
    const d = parsed.data;
    setSaving(true);
    const uploadedPaths: string[] = [];
    try {
      const files = ["notification", "defense", "decision", "payment"] as const;
      const paths: Record<string, string | null> = {};
      for (const key of files) {
        const input = form.elements.namedItem(`file_${key}`) as HTMLInputElement | null;
        const file = input?.files?.[0];
        paths[key] = file && orgId ? await uploadFleetFile(orgId, file, "multas") : null;
        if (paths[key]) uploadedPaths.push(paths[key]!);
      }
      const payload = {
        vehicle_id: vehicleId,
        unit_id: unitId === NONE ? null : unitId,
        driver_id: driverId === NONE ? null : driverId,
        usage_id: usageId === NONE ? null : usageId,
        notice_number: d.notice_number,
        issuing_authority: d.issuing_authority,
        infraction_code: d.infraction_code || null,
        description: d.description,
        occurred_at: new Date(d.occurred_at).toISOString(),
        location: d.location || null,
        amount: numOrNull(d.amount) ?? 0,
        discount_amount: numOrNull(d.discount_amount),
        due_date: d.due_date || null,
        status,
        liability: liability as TrafficFineRow["liability"],
        defense_protocol: d.defense_protocol || null,
        responsible_name: d.responsible_name || null,
        driver_confirmed: driverId !== NONE,
        points: d.points ? Number(d.points) : null,
        notes: d.notes || null,
        ...(paths["notification"] ? { notification_path: paths["notification"] } : {}),
        ...(paths["defense"] ? { defense_path: paths["defense"] } : {}),
        ...(paths["decision"] ? { decision_path: paths["decision"] } : {}),
        ...(paths["payment"] ? { payment_path: paths["payment"] } : {}),
      };
      const { error } = editing
        ? await supabase.from("traffic_fines").update({ ...payload, updated_by: userId }).eq("id", editing.id)
        : await supabase.from("traffic_fines").insert({ ...payload, organization_id: orgId!, created_by: userId });
      if (error) throw error;

      if (editing) {
        const replacedOldPaths = [
          paths["notification"] ? editing.notification_path : null,
          paths["defense"] ? editing.defense_path : null,
          paths["decision"] ? editing.decision_path : null,
          paths["payment"] ? editing.payment_path : null,
        ].filter((path): path is string => Boolean(path));

        if (replacedOldPaths.length > 0) {
          await supabase.storage.from("frota").remove(replacedOldPaths);
        }
      }

      toast.success(editing ? "Multa atualizada." : "Multa registrada.");
      invalidate(["traffic-fines", "fueling-alerts"]);
      setOpen(false);
    } catch (err) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("frota").remove(uploadedPaths);
      }
      const e2 = err as { code?: string };
      toast.error(e2.code === "23505" ? "Já existe multa com esse número de auto." : dbMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onCancel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canceling) return;
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    if (!reason) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    const { error } = await supabase
      .from("traffic_fines")
      .update({ status: "cancelada", cancel_reason: reason, updated_by: userId })
      .eq("id", canceling.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Multa cancelada. O registro permanece no histórico.");
    invalidate(["traffic-fines"]);
    setCancelOpen(false);
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Multas e infrações"
        description="Autos de infração dos veículos do órgão, com defesa, responsabilidade e comprovantes. Registros nunca são excluídos."
        action={
          canRegister && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Nova multa
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Multas em aberto", value: String(totals.abertas) },
          { label: "Valor em aberto", value: brl(totals.valor) },
          { label: "Vencidas", value: String(totals.vencidas) },
          { label: "Pagas", value: String(totals.pagas) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Buscar</Label>
          <Input placeholder="Auto, órgão, placa" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {FINE_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Veículo</Label>
          <Select value={fVehicle} onValueChange={setFVehicle}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {(v.plate ?? v.asset_code)}
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
              <TableHead>Código / auto</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Infração</TableHead>
              <TableHead>Condutor</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <FileWarning className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma multa registrada.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((f) => {
              const due = dueState(f.due_date, 15);
              const attachments = [
                { path: f.notification_path, label: "Notificação" },
                { path: f.defense_path, label: "Defesa" },
                { path: f.decision_path, label: "Decisão" },
                { path: f.payment_path, label: "Pagamento" },
              ].filter((a) => a.path);
              return (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">
                    {f.code ?? "—"}
                    <span className="block text-xs text-muted-foreground">{f.notice_number}</span>
                  </TableCell>
                  <TableCell>
                    {(f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—")}
                    <span className="block text-xs text-muted-foreground">{f.unit?.acronym ?? ""}</span>
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    <span className="block truncate text-sm">{f.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      {f.issuing_authority} · {dateTimeBR(f.occurred_at)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {f.driver?.full_name ?? "Não identificado"}
                    <span className="block text-xs text-muted-foreground">{label(FINE_LIABILITY, f.liability)}</span>
                  </TableCell>
                  <TableCell className="text-right">{brl(Number(f.amount ?? 0))}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {dateBR(f.due_date)}
                    {OPEN_STATUS.includes(f.status) && due !== "sem_criterio" && due !== "ok" && (
                      <span className="block text-xs text-destructive">
                        {due === "vencido" ? "Vencida" : "A vencer"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.status === "cancelada" ? "outline" : f.status === "paga" ? "secondary" : "default"}>
                      {label(FINE_STATUS, f.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {attachments.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Anexos"
                          onClick={() => void openFleetFile(attachments[0]!.path!)}
                        >
                          <Paperclip className="size-4" />
                        </Button>
                      )}
                      {canRegister && f.status !== "cancelada" && (
                        <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(f)}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {canManageFleet && f.status !== "cancelada" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cancelar"
                          onClick={() => {
                            setCanceling(f);
                            setCancelOpen(true);
                          }}
                        >
                          <Ban className="size-4" />
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
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar multa ${editing.code ?? ""}` : "Nova multa"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Veículo *</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Selecione</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {(v.plate ?? v.asset_code)} — {v.brand ?? ""} {v.model ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="occurred_at">Data e hora da infração *</Label>
                <Input
                  id="occurred_at"
                  name="occurred_at"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="location">Local</Label>
                <Input id="location" name="location" defaultValue={editing?.location ?? ""} />
              </div>
              <div>
                <Label htmlFor="notice_number">Número do auto *</Label>
                <Input id="notice_number" name="notice_number" defaultValue={editing?.notice_number ?? ""} required />
              </div>
              <div>
                <Label htmlFor="issuing_authority">Órgão autuador *</Label>
                <Input
                  id="issuing_authority"
                  name="issuing_authority"
                  placeholder="DETRAN, PRF, Prefeitura…"
                  defaultValue={editing?.issuing_authority ?? ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="infraction_code">Código / enquadramento</Label>
                <Input id="infraction_code" name="infraction_code" defaultValue={editing?.infraction_code ?? ""} />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Descrição da infração *</Label>
              <Textarea id="description" name="description" rows={2} defaultValue={editing?.description ?? ""} required />
            </div>

            {suggestion && driverId === NONE && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="font-medium">Condutor sugerido pela utilização registrada</p>
                <p className="text-muted-foreground">{suggestion.text}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setDriverId(suggestion.driverId);
                    setUsageId(suggestion.usageId);
                    toast.success("Condutor confirmado a partir da utilização.");
                  }}
                >
                  Confirmar condutor sugerido
                </Button>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Condutor</Label>
                <Select value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não identificado</SelectItem>
                    {drivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Utilização vinculada</Label>
                <Select value={usageId} onValueChange={setUsageId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem vínculo</SelectItem>
                    {usages
                      .filter((u) => vehicleId === NONE || u.vehicle_id === vehicleId)
                      .slice(0, 100)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.code ?? "—"} · {dateTimeBR(u.planned_departure)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade responsável</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.acronym ?? u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="amount">Valor da multa (R$)</Label>
                <MoneyInput id="amount" name="amount" defaultValue={editing?.amount ?? ""} />
              </div>
              <div>
                <Label htmlFor="discount_amount">Valor com desconto (R$)</Label>
                <MoneyInput id="discount_amount" name="discount_amount" defaultValue={editing?.discount_amount ?? ""} />
              </div>
              <div>
                <Label htmlFor="due_date">Vencimento</Label>
                <Input id="due_date" name="due_date" type="date" defaultValue={editing?.due_date ?? ""} />
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as FineStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINE_STATUS.filter((s) => s.value !== "cancelada").map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Responsabilidade</Label>
                <Select value={liability} onValueChange={setLiability}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINE_LIABILITY.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="points">Pontos na CNH</Label>
                <Input id="points" name="points" inputMode="numeric" defaultValue={editing?.points ?? ""} />
              </div>
              <div>
                <Label htmlFor="defense_protocol">Protocolo de defesa/recurso</Label>
                <Input id="defense_protocol" name="defense_protocol" defaultValue={editing?.defense_protocol ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="responsible_name">Responsável pela apuração</Label>
                <Input id="responsible_name" name="responsible_name" defaultValue={editing?.responsible_name ?? ""} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { key: "notification", label: "Notificação" },
                { key: "defense", label: "Defesa" },
                { key: "decision", label: "Decisão" },
                { key: "payment", label: "Comprovante de pagamento" },
              ].map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`file_${f.key}`} className="flex items-center gap-1">
                    <Upload className="size-3" /> {f.label}
                  </Label>
                  <Input id={`file_${f.key}`} name={`file_${f.key}`} type="file" />
                </div>
              ))}
            </div>

            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
            </div>

            <DialogFooter>
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

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar multa {canceling?.code ?? ""}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCancel} className="space-y-4">
            <div>
              <Label htmlFor="reason">Motivo do cancelamento *</Label>
              <Textarea id="reason" name="reason" rows={3} required />
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
    </>
  );
}
