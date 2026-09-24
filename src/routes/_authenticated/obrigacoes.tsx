import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileCheck2, Paperclip, Pencil, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { MoneyInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  OBLIGATION_STATUS,
  OBLIGATION_TYPES,
  brl,
  dateBR,
  daysUntil,
  dbMessage,
  label,
  openFleetFile,
  parseBRNumber,
  supabase,
  uploadFleetFile,
  useInvalidate,
  usePerms,
  useVehicleObligations,
  useVehicles,
  type ObligationStatus,
  type VehicleObligationRow,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/obrigacoes")({
  head: () => ({
    meta: [
      { title: "Obrigações Legais do Veículo — FrotaGov" },
      {
        name: "description",
        content:
          "Licenciamento, IPVA, inspeções, tacógrafo, ANTT e demais obrigações legais dos veículos, com vencimentos, valores e anexos.",
      },
      { property: "og:title", content: "Obrigações Legais do Veículo — FrotaGov" },
      {
        property: "og:description",
        content: "Documentos e obrigações legais da frota com alertas de vencimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Obrigacoes,
});

const ALL = "__all__";
const NONE = "__none__";

const schema = z.object({
  obligation_type: z.string().trim().min(2, "Informe o tipo de obrigação").max(120),
  document_number: z.string().trim().max(80).optional(),
  exercise: z.string().optional(),
  due_date: z.string().optional(),
  amount: z.string().optional(),
  paid_amount: z.string().optional(),
  paid_at: z.string().optional(),
  notes: z.string().trim().max(600).optional(),
});

const numOrNull = (v: string | undefined) => {
  const n = parseBRNumber(String(v ?? ""));
  return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

function Obrigacoes() {
  const { data: obligations = [], isLoading } = useVehicleObligations();
  const { data: vehicles = [] } = useVehicles();
  const { canRegister, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleObligationRow | null>(null);
  const [vehicleId, setVehicleId] = useState(NONE);
  const [type, setType] = useState(OBLIGATION_TYPES[0]!);
  const [customType, setCustomType] = useState("");
  const [status, setStatus] = useState<ObligationStatus>("pendente");
  const [notApplicable, setNotApplicable] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fVehicle, setFVehicle] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);

  const filtered = useMemo(
    () =>
      obligations.filter(
        (o) =>
          (fVehicle === ALL || o.vehicle_id === fVehicle) &&
          (fStatus === ALL || o.status === fStatus),
      ),
    [obligations, fVehicle, fStatus],
  );

  const totals = useMemo(() => {
    const ativos = obligations.filter((o) => !o.not_applicable && o.status !== "cancelada");
    return {
      vencidas: ativos.filter((o) => o.status === "vencida").length,
      aVencer: ativos.filter((o) => {
        const d = daysUntil(o.due_date);
        return o.status === "pendente" && d !== null && d >= 0 && d <= 30;
      }).length,
      pendentes: ativos.filter((o) => o.status === "pendente").length,
      valor: ativos
        .filter((o) => o.status !== "quitada")
        .reduce((s, o) => s + Number(o.amount ?? 0), 0),
    };
  }, [obligations]);

  function openNew() {
    setEditing(null);
    setVehicleId(NONE);
    setType(OBLIGATION_TYPES[0]!);
    setCustomType("");
    setStatus("pendente");
    setNotApplicable(false);
    setOpen(true);
  }

  function openEdit(o: VehicleObligationRow) {
    setEditing(o);
    setVehicleId(o.vehicle_id);
    const known = OBLIGATION_TYPES.includes(o.obligation_type);
    setType(known ? o.obligation_type : "Outra obrigação");
    setCustomType(known ? "" : o.obligation_type);
    setStatus(o.status);
    setNotApplicable(o.not_applicable);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = schema.safeParse({
      ...Object.fromEntries(new FormData(form)),
      obligation_type: type === "Outra obrigação" && customType ? customType : type,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (vehicleId === NONE) {
      toast.error("Selecione o veículo.");
      return;
    }
    const d = parsed.data;
    setSaving(true);
    let uploadedAttachment: string | null = null;
    try {
      const input = form.elements.namedItem("file") as HTMLInputElement | null;
      const file = input?.files?.[0];
      const path = file && orgId ? await uploadFleetFile(orgId, file, "obrigacoes") : null;
      uploadedAttachment = path;
      const payload = {
        vehicle_id: vehicleId,
        obligation_type: d.obligation_type,
        document_number: d.document_number || null,
        exercise: d.exercise ? Number(d.exercise) : null,
        due_date: d.due_date || null,
        amount: numOrNull(d.amount),
        paid_amount: numOrNull(d.paid_amount),
        paid_at: d.paid_at || null,
        notes: d.notes || null,
        not_applicable: notApplicable,
        status: notApplicable ? ("nao_aplicavel" as ObligationStatus) : status,
        ...(path ? { attachment_path: path } : {}),
      };
      const { error } = editing
        ? await supabase
            .from("vehicle_obligations")
            .update({ ...payload, updated_by: userId })
            .eq("id", editing.id)
        : await supabase
            .from("vehicle_obligations")
            .insert({ ...payload, organization_id: orgId!, created_by: userId });
      if (error) throw error;

      if (
        editing?.attachment_path &&
        uploadedAttachment &&
        editing.attachment_path !== uploadedAttachment
      ) {
        await supabase.storage.from("frota").remove([editing.attachment_path]);
      }

      toast.success(editing ? "Obrigação atualizada." : "Obrigação registrada.");
      invalidate(["vehicle-obligations", "fueling-alerts"]);
      setOpen(false);
    } catch (err) {
      if (uploadedAttachment) {
        await supabase.storage.from("frota").remove([uploadedAttachment]);
      }
      toast.error(dbMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Obrigações legais e documentos"
        description="Licenciamento/CRLV, IPVA, inspeções, tacógrafo, ANTT e outras obrigações configuráveis por veículo."
        action={
          canRegister && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Nova obrigação
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Obrigações vencidas", value: String(totals.vencidas) },
          { label: "A vencer em 30 dias", value: String(totals.aVencer) },
          { label: "Pendentes", value: String(totals.pendentes) },
          { label: "Valor pendente", value: brl(totals.valor) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  {v.plate ?? v.asset_code}
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
              {OBLIGATION_STATUS.map((s) => (
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
              <TableHead>Obrigação</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Exercício</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-20" />
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
                  <FileCheck2 className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma obrigação registrada.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((o) => {
              const d = daysUntil(o.due_date);
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.obligation_type}</TableCell>
                  <TableCell>{o.vehicle?.plate ?? o.vehicle?.asset_code ?? "—"}</TableCell>
                  <TableCell>{o.exercise ?? "—"}</TableCell>
                  <TableCell className="text-sm">{o.document_number ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {dateBR(o.due_date)}
                    {o.status === "pendente" && d !== null && d >= 0 && d <= 30 && (
                      <span className="block text-xs text-destructive">Vence em {d} dia(s)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{brl(Number(o.amount ?? 0))}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        o.status === "vencida"
                          ? "destructive"
                          : o.status === "quitada"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {label(OBLIGATION_STATUS, o.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {o.attachment_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Anexo"
                          onClick={() => void openFleetFile(o.attachment_path!)}
                        >
                          <Paperclip className="size-4" />
                        </Button>
                      )}
                      {canRegister && o.status !== "cancelada" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar"
                          onClick={() => openEdit(o)}
                        >
                          <Pencil className="size-4" />
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
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar obrigação" : "Nova obrigação legal"}</DialogTitle>
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
                        {v.plate ?? v.asset_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de obrigação *</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBLIGATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {type === "Outra obrigação" && (
                <div>
                  <Label htmlFor="custom">Descreva a obrigação</Label>
                  <Input
                    id="custom"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="exercise">Exercício</Label>
                <Input
                  id="exercise"
                  name="exercise"
                  inputMode="numeric"
                  defaultValue={editing?.exercise ?? new Date().getFullYear()}
                />
              </div>
              <div>
                <Label htmlFor="document_number">Documento / número</Label>
                <Input
                  id="document_number"
                  name="document_number"
                  defaultValue={editing?.document_number ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="due_date">Vencimento</Label>
                <Input
                  id="due_date"
                  name="due_date"
                  type="date"
                  defaultValue={editing?.due_date ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="amount">Valor (R$)</Label>
                <MoneyInput id="amount" name="amount" defaultValue={editing?.amount ?? ""} />
              </div>
              <div>
                <Label htmlFor="paid_amount">Valor pago (R$)</Label>
                <MoneyInput
                  id="paid_amount"
                  name="paid_amount"
                  defaultValue={editing?.paid_amount ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="paid_at">Data do pagamento</Label>
                <Input
                  id="paid_at"
                  name="paid_at"
                  type="date"
                  defaultValue={editing?.paid_at ?? ""}
                />
              </div>
              <div>
                <Label>Situação</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as ObligationStatus)}
                  disabled={notApplicable}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBLIGATION_STATUS.filter((s) => s.value !== "nao_aplicavel").map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="file" className="flex items-center gap-1">
                  <Upload className="size-3" /> Anexo
                </Label>
                <Input id="file" name="file" type="file" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="not_applicable"
                checked={notApplicable}
                onCheckedChange={setNotApplicable}
              />
              <Label htmlFor="not_applicable">Não aplicável a este veículo</Label>
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
    </>
  );
}
