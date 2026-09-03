import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Paperclip, Pencil, Plus, Upload } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ACCIDENT_KINDS,
  ACCIDENT_STATUS,
  brl,
  dateTimeBR,
  dbMessage,
  label,
  openFleetFile,
  parseBRNumber,
  suggestDriverForMoment,
  supabase,
  uploadFleetFile,
  useAccidents,
  useDrivers,
  useExternalEntities,
  useInsurancePolicies,
  useInvalidate,
  usePerms,
  useUnits,
  useVehicleUsages,
  useVehicles,
  type AccidentKind,
  type AccidentRow,
  type AccidentStatus,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/sinistros")({
  head: () => ({
    meta: [
      { title: "Acidentes e Sinistros — FrotaGov" },
      {
        name: "description",
        content:
          "Registro de acidentes e sinistros da frota pública: boletim de ocorrência, terceiros, vítimas, seguradora, franquia e reparos.",
      },
      { property: "og:title", content: "Acidentes e Sinistros — FrotaGov" },
      { property: "og:description", content: "Apuração de sinistros com indisponibilidade e vínculo a manutenções." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Sinistros,
});

const ALL = "__all__";
const NONE = "__none__";

const schema = z.object({
  occurred_at: z.string().min(1, "Informe a data e hora"),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().min(3, "Descreva o ocorrido").max(1000),
  third_parties: z.string().trim().max(600).optional(),
  victims_notes: z.string().trim().max(600).optional(),
  police_report_number: z.string().trim().max(80).optional(),
  police_report_agency: z.string().trim().max(120).optional(),
  damages: z.string().trim().max(600).optional(),
  deductible_value: z.string().optional(),
  expenses_value: z.string().optional(),
  reporter_name: z.string().trim().max(120).optional(),
  investigator_name: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(600).optional(),
});

const numOrNull = (v: string | undefined) => {
  const n = parseBRNumber(String(v ?? ""));
  return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

function Sinistros() {
  const { data: accidents = [], isLoading } = useAccidents();
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: units = [] } = useUnits();
  const { data: usages = [] } = useVehicleUsages();
  const { data: policies = [] } = useInsurancePolicies();
  const { data: entities = [] } = useExternalEntities();
  const { canRegister, canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccidentRow | null>(null);
  const [vehicleId, setVehicleId] = useState(NONE);
  const [unitId, setUnitId] = useState(NONE);
  const [driverId, setDriverId] = useState(NONE);
  const [usageId, setUsageId] = useState(NONE);
  const [policyId, setPolicyId] = useState(NONE);
  const [entityId, setEntityId] = useState(NONE);
  const [kind, setKind] = useState<AccidentKind>("colisao");
  const [status, setStatus] = useState<AccidentStatus>("registrado");
  const [occurredAt, setOccurredAt] = useState("");
  const [blocksUse, setBlocksUse] = useState(true);
  const [hasVictims, setHasVictims] = useState(false);
  const [needsTow, setNeedsTow] = useState(false);
  const [suggestion, setSuggestion] = useState<{ driverId: string; usageId: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [fStatus, setFStatus] = useState(ALL);
  const [fVehicle, setFVehicle] = useState(ALL);

  useEffect(() => {
    if (!occurredAt || vehicleId === NONE) {
      setSuggestion(null);
      return;
    }
    const u = suggestDriverForMoment(usages, vehicleId, new Date(occurredAt));
    setSuggestion(
      u?.driver_id
        ? {
            driverId: u.driver_id,
            usageId: u.id,
            text: `${u.driver?.full_name ?? "Condutor"} — utilização ${u.code ?? ""}`,
          }
        : null,
    );
  }, [occurredAt, vehicleId, usages]);

  const filtered = useMemo(
    () =>
      accidents.filter(
        (a) => (fStatus === ALL || a.status === fStatus) && (fVehicle === ALL || a.vehicle_id === fVehicle),
      ),
    [accidents, fStatus, fVehicle],
  );

  const totals = useMemo(() => {
    const abertos = accidents.filter((a) => a.status !== "encerrado");
    return {
      abertos: abertos.length,
      bloqueados: abertos.filter((a) => a.blocks_use).length,
      perdaTotal: accidents.filter((a) => a.kind === "perda_total").length,
      despesas: accidents.reduce((s, a) => s + Number(a.expenses_value ?? 0), 0),
    };
  }, [accidents]);

  function openNew() {
    setEditing(null);
    setVehicleId(NONE);
    setUnitId(NONE);
    setDriverId(NONE);
    setUsageId(NONE);
    setPolicyId(NONE);
    setEntityId(NONE);
    setKind("colisao");
    setStatus("registrado");
    setOccurredAt("");
    setBlocksUse(true);
    setHasVictims(false);
    setNeedsTow(false);
    setOpen(true);
  }

  function openEdit(a: AccidentRow) {
    setEditing(a);
    setVehicleId(a.vehicle_id);
    setUnitId(a.unit_id ?? NONE);
    setDriverId(a.driver_id ?? NONE);
    setUsageId(a.usage_id ?? NONE);
    setPolicyId(a.policy_id ?? NONE);
    setEntityId(a.third_party_entity_id ?? NONE);
    setKind(a.kind);
    setStatus(a.status);
    setOccurredAt(a.occurred_at.slice(0, 16));
    setBlocksUse(a.blocks_use);
    setHasVictims(a.has_victims);
    setNeedsTow(a.needs_tow);
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
      toast.error("Selecione o veículo envolvido.");
      return;
    }
    const d = parsed.data;
    setSaving(true);
    try {
      const input = form.elements.namedItem("files") as HTMLInputElement | null;
      const uploaded: string[] = [];
      for (const file of Array.from(input?.files ?? [])) {
        if (orgId) uploaded.push(await uploadFleetFile(orgId, file, "sinistros"));
      }
      const payload = {
        vehicle_id: vehicleId,
        unit_id: unitId === NONE ? null : unitId,
        driver_id: driverId === NONE ? null : driverId,
        usage_id: usageId === NONE ? null : usageId,
        policy_id: policyId === NONE ? null : policyId,
        third_party_entity_id: entityId === NONE ? null : entityId,
        kind,
        status,
        occurred_at: new Date(d.occurred_at).toISOString(),
        location: d.location || null,
        description: d.description,
        third_parties: d.third_parties || null,
        has_victims: hasVictims,
        victims_notes: d.victims_notes || null,
        police_report_number: d.police_report_number || null,
        police_report_agency: d.police_report_agency || null,
        damages: d.damages || null,
        needs_tow: needsTow,
        blocks_use: blocksUse,
        deductible_value: numOrNull(d.deductible_value),
        expenses_value: numOrNull(d.expenses_value),
        reporter_name: d.reporter_name || null,
        investigator_name: d.investigator_name || null,
        notes: d.notes || null,
        closed_at: status === "encerrado" ? new Date().toISOString() : null,
        attachment_paths: [...(editing?.attachment_paths ?? []), ...uploaded],
      };
      const { error } = editing
        ? await supabase.from("accidents").update({ ...payload, updated_by: userId }).eq("id", editing.id)
        : await supabase.from("accidents").insert({ ...payload, organization_id: orgId!, created_by: userId });
      if (error) throw error;
      toast.success(
        editing
          ? "Sinistro atualizado."
          : blocksUse
            ? "Sinistro registrado. O veículo foi colocado como indisponível."
            : "Sinistro registrado.",
      );
      invalidate(["accidents", "vehicles", "vehicle-status-history", "fueling-alerts"]);
      setOpen(false);
    } catch (err) {
      toast.error(dbMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Acidentes e sinistros"
        description="Ocorrências com veículos do órgão, apuração, acionamento de seguradora e reflexos na disponibilidade da frota."
        action={
          canRegister && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo sinistro
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Sinistros em aberto", value: String(totals.abertos) },
          { label: "Veículos indisponíveis", value: String(totals.bloqueados) },
          { label: "Perdas totais", value: String(totals.perdaTotal) },
          { label: "Despesas registradas", value: brl(totals.despesas) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {ACCIDENT_STATUS.map((s) => (
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
              <TableHead>Código</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Ocorrência</TableHead>
              <TableHead>Condutor</TableHead>
              <TableHead>Seguradora</TableHead>
              <TableHead className="text-right">Despesas</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-24" />
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
                  <AlertTriangle className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhum sinistro registrado.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.code ?? "—"}</TableCell>
                <TableCell>
                  {(a.vehicle?.plate ?? a.vehicle?.asset_code ?? "—")}
                  {a.blocks_use && a.status !== "encerrado" && (
                    <span className="block text-xs text-destructive">Indisponível</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <span className="block truncate text-sm">
                    {label(ACCIDENT_KINDS, a.kind)} · {a.description}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {dateTimeBR(a.occurred_at)} {a.location ? `· ${a.location}` : ""}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{a.driver?.full_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{a.policy?.insurer_name ?? "—"}</TableCell>
                <TableCell className="text-right">{brl(Number(a.expenses_value ?? 0))}</TableCell>
                <TableCell>
                  <Badge variant={a.status === "encerrado" ? "outline" : "default"}>
                    {label(ACCIDENT_STATUS, a.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {(a.attachment_paths ?? []).length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Anexos"
                        onClick={() => void openFleetFile(a.attachment_paths[0]!)}
                      >
                        <Paperclip className="size-4" />
                      </Button>
                    )}
                    {canRegister && (a.status !== "encerrado" || canManageFleet) && (
                      <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(a)}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Sinistro ${editing.code ?? ""}` : "Novo sinistro"}</DialogTitle>
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
                <Label htmlFor="occurred_at">Data e hora *</Label>
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
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as AccidentKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCIDENT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as AccidentStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCIDENT_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
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
                        {u.acronym ?? u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Descrição do ocorrido *</Label>
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
                <Label>Apólice acionada</Label>
                <Select value={policyId} onValueChange={setPolicyId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem seguro</SelectItem>
                    {policies.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.policy_number} · {p.insurer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Terceiro envolvido (entidade)</Label>
                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {entities.map((en) => (
                      <SelectItem key={en.id} value={en.id}>
                        {en.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="police_report_number">Boletim de ocorrência</Label>
                <Input
                  id="police_report_number"
                  name="police_report_number"
                  defaultValue={editing?.police_report_number ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="police_report_agency">Órgão do BO</Label>
                <Input
                  id="police_report_agency"
                  name="police_report_agency"
                  defaultValue={editing?.police_report_agency ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="deductible_value">Franquia (R$)</Label>
                <MoneyInput id="deductible_value" name="deductible_value" defaultValue={editing?.deductible_value ?? ""} />
              </div>
              <div>
                <Label htmlFor="expenses_value">Despesas (R$)</Label>
                <MoneyInput id="expenses_value" name="expenses_value" defaultValue={editing?.expenses_value ?? ""} />
              </div>
              <div>
                <Label htmlFor="reporter_name">Comunicante</Label>
                <Input id="reporter_name" name="reporter_name" defaultValue={editing?.reporter_name ?? ""} />
              </div>
              <div>
                <Label htmlFor="investigator_name">Responsável pela apuração</Label>
                <Input id="investigator_name" name="investigator_name" defaultValue={editing?.investigator_name ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="files" className="flex items-center gap-1">
                  <Upload className="size-3" /> Fotos e documentos
                </Label>
                <Input id="files" name="files" type="file" multiple />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="third_parties">Terceiros envolvidos</Label>
                <Textarea id="third_parties" name="third_parties" rows={2} defaultValue={editing?.third_parties ?? ""} />
              </div>
              <div>
                <Label htmlFor="damages">Danos apurados</Label>
                <Textarea id="damages" name="damages" rows={2} defaultValue={editing?.damages ?? ""} />
              </div>
              <div>
                <Label htmlFor="victims_notes">Vítimas</Label>
                <Textarea id="victims_notes" name="victims_notes" rows={2} defaultValue={editing?.victims_notes ?? ""} />
              </div>
              <div>
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch id="blocks_use" checked={blocksUse} onCheckedChange={setBlocksUse} />
                <Label htmlFor="blocks_use">Impede o uso do veículo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="has_victims" checked={hasVictims} onCheckedChange={setHasVictims} />
                <Label htmlFor="has_victims">Houve vítimas</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="needs_tow" checked={needsTow} onCheckedChange={setNeedsTow} />
                <Label htmlFor="needs_tow">Necessitou guincho</Label>
              </div>
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
    </>
  );
}
