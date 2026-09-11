import { useEffect, useMemo, useState } from "react";
import { Camera, ClipboardCheck, ExternalLink, TriangleAlert, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HelpInlineButton } from "@/components/help-button";
import {
  CHECKLIST_ANSWER_LABEL,
  CHECKLIST_ITEMS,
  checklistProblems,
  newReturnProblems,
  openChecklistPhoto,
  parseChecklistResponses,
  uploadChecklistPhoto,
  useUsageChecklists,
  type ChecklistAnswer,
  type ChecklistStage,
  type ChecklistWithPhotos,
} from "@/lib/checklists";
import { dateTimeBR, num, supabase, useInvalidate, usePerms, type UsageRow } from "@/lib/frotagov";

export function VehicleChecklistPanel({ usage, compact = false }: { usage: UsageRow; compact?: boolean }) {
  const { data: rows = [] } = useUsageChecklists(usage.id);
  const perms = usePerms();
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState<ChecklistStage | null>(null);
  const [maintenanceStage, setMaintenanceStage] = useState<ChecklistStage | null>(null);
  const departure = rows.find((x) => x.stage === "saida") ?? null;
  const returned = rows.find((x) => x.stage === "retorno") ?? null;
  const newProblems = newReturnProblems(departure, returned);

  async function createMaintenance() {
    const target = maintenanceStage === "saida" ? departure : returned;
    if (!target || !perms.orgId) return;
    const problems = checklistProblems(target);
    if (!problems.length) return;
    const description = `Problemas identificados no checklist de ${maintenanceStage}: ${problems.map((x) => x.label).join(", ")}.`;
    const { error } = await supabase.from("maintenance_requests").insert({
      organization_id: perms.orgId,
      vehicle_id: usage.vehicle_id,
      unit_id: usage.unit_id,
      requester_id: perms.userId,
      requester_name: perms.userName,
      kind: "corretiva",
      priority: "normal",
      description,
      odometer_km: target.odometer_km,
      notes: `Origem: checklist de ${maintenanceStage} da utilização ${usage.code ?? usage.id}. ${target.observations ?? ""}`.trim(),
      created_by: perms.userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Solicitação de manutenção registrada com os dados do checklist.");
    setMaintenanceStage(null);
    invalidate(["maintenance-requests", "vehicles", "vehicle-status-history"]);
  }

  const canDeparture = perms.canRegister && ["solicitada", "autorizada", "em_uso"].includes(usage.status);
  const canReturn = perms.canRegister && ["em_uso", "concluida"].includes(usage.status);
  return (
    <section className={compact ? "space-y-2" : "mt-4 space-y-3 rounded-lg border bg-card p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4" />
          <h3 className="gov-title text-sm">Checklists do veículo</h3>
          <HelpInlineButton topicKey="/utilizacao/checklist" />
        </div>
        <div className="flex flex-wrap gap-2">
          {canDeparture && <Button size="sm" variant={departure ? "outline" : "default"} onClick={() => setEditing("saida")}>{departure ? "Ver saída" : "Checklist de saída"}</Button>}
          {canReturn && <Button size="sm" variant={returned ? "outline" : "default"} onClick={() => setEditing("retorno")}>{returned ? "Ver retorno" : "Checklist de retorno"}</Button>}
        </div>
      </div>
      {!departure && !returned && <p className="text-sm text-muted-foreground">Nenhum checklist registrado nesta utilização.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {[departure, returned].filter(Boolean).map((row) => {
          if (!row) return null;
          const problems = checklistProblems(row);
          return <div key={row.id} className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2"><strong>{row.stage === "saida" ? "Saída" : "Retorno"}</strong><Badge variant={problems.length ? "destructive" : "secondary"}>{problems.length ? `${problems.length} problema(s)` : "Sem problemas"}</Badge></div>
            <p className="mt-1 text-muted-foreground">{dateTimeBR(row.completed_at)} · {row.completed_by_name ?? "Responsável não informado"}</p>
            <p>Odômetro: {row.odometer_km != null ? `${num(Number(row.odometer_km), 0)} km` : "—"}</p>
            {row.photos.length > 0 && <Button variant="ghost" size="sm" className="mt-1 px-0" onClick={() => openChecklistPhoto(row.photos[0]!.storage_path)}><Camera className="size-4" /> {row.photos.length} foto(s)</Button>}
            {problems.length > 0 && perms.canRegister && <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setMaintenanceStage(row.stage as ChecklistStage)}><Wrench className="size-4" /> Abrir solicitação de manutenção</Button>}
          </div>;
        })}
      </div>
      {newProblems.length > 0 && <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /><p><strong>Possível nova ocorrência:</strong> {newProblems.map((x) => x.label).join(", ")}. A diferença precisa ser analisada e não atribui responsabilidade automaticamente.</p></div>}
      {editing && <ChecklistDialog usage={usage} stage={editing} existing={editing === "saida" ? departure : returned} departure={departure} onClose={() => setEditing(null)} />}
      {maintenanceStage && <Dialog open onOpenChange={(open) => !open && setMaintenanceStage(null)}><DialogContent><DialogHeader><DialogTitle>Registrar solicitação de manutenção?</DialogTitle><DialogDescription>O veículo, a unidade, o odômetro e os itens com problema serão reaproveitados. A solicitação ficará aberta para análise.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setMaintenanceStage(null)}>Cancelar</Button><Button onClick={createMaintenance}>Registrar solicitação</Button></DialogFooter></DialogContent></Dialog>}
    </section>
  );
}

function ChecklistDialog({ usage, stage, existing, departure, onClose }: { usage: UsageRow; stage: ChecklistStage; existing: ChecklistWithPhotos | null; departure: ChecklistWithPhotos | null; onClose: () => void }) {
  const perms = usePerms();
  const invalidate = useInvalidate();
  const [responses, setResponses] = useState<Record<string, ChecklistAnswer>>(() => parseChecklistResponses(existing?.responses));
  const [observations, setObservations] = useState(existing?.observations ?? "");
  const [odometer, setOdometer] = useState(String(existing?.odometer_km ?? (stage === "saida" ? usage.start_km ?? "" : usage.end_km ?? "")));
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (stage === "retorno" && departure && Object.keys(responses).length === 0) setResponses(parseChecklistResponses(departure.responses)); }, [stage, departure, responses]);
  const problems = useMemo(() => CHECKLIST_ITEMS.filter((item) => responses[item.key] === "problema"), [responses]);

  async function save() {
    if (!perms.orgId) return;
    const missing = CHECKLIST_ITEMS.filter((item) => !responses[item.key]);
    if (missing.length) return toast.error(`Responda todos os itens (${missing.length} pendente(s)).`);
    if (problems.length && !observations.trim()) return toast.error("Descreva os problemas ou avarias nas observações.");
    setSaving(true);
    const payload = { organization_id: perms.orgId, usage_id: usage.id, vehicle_id: usage.vehicle_id, stage, responses, observations: observations.trim() || null, odometer_km: odometer ? Number(odometer) : null, completed_at: new Date().toISOString(), completed_by: perms.userId, completed_by_name: perms.userName, active: true };
    const result = existing
      ? await supabase.from("vehicle_checklists").update(payload).eq("id", existing.id).select("id").single()
      : await supabase.from("vehicle_checklists").insert(payload).select("id").single();
    if (result.error || !result.data) { setSaving(false); return toast.error(result.error?.message ?? "Não foi possível salvar o checklist."); }
    try {
      for (const file of files) {
        const path = await uploadChecklistPhoto(perms.orgId, usage.id, stage, file);
        const { error } = await supabase.from("vehicle_checklist_photos").insert({ organization_id: perms.orgId, checklist_id: result.data.id, storage_path: path, created_by: perms.userId });
        if (error) throw error;
      }
    } catch (error) { setSaving(false); return toast.error(error instanceof Error ? error.message : "Checklist salvo, mas uma foto não foi anexada."); }
    setSaving(false);
    toast.success(`Checklist de ${stage} salvo.`);
    invalidate(["vehicle-checklists", "vehicle-checklists-by-vehicle"]);
    onClose();
  }

  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[94vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Checklist de {stage}</DialogTitle><DialogDescription>{stage === "saida" ? "Registre as condições antes do início efetivo da utilização." : "Compare as condições no fechamento. Diferenças serão sinalizadas para análise, sem atribuição automática de responsabilidade."}</DialogDescription></DialogHeader><div className="grid gap-2 sm:grid-cols-2">{CHECKLIST_ITEMS.map((item) => <div key={item.key} className="rounded-md border p-3"><Label className="mb-2 block text-sm">{item.label}</Label><Select value={responses[item.key] ?? ""} onValueChange={(value) => setResponses((current) => ({ ...current, [item.key]: value as ChecklistAnswer }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{Object.entries(CHECKLIST_ANSWER_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>)}</div><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="check-km">Odômetro</Label><Input id="check-km" type="number" min="0" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></div><div><Label htmlFor="check-photo">Fotos</Label><Input id="check-photo" type="file" accept="image/*" multiple capture="environment" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /><p className="mt-1 text-xs text-muted-foreground">Até 10 MB por foto. Prefira fotografar itens com problema.</p></div></div><div><Label htmlFor="check-obs">Observações</Label><Textarea id="check-obs" rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} placeholder={problems.length ? "Descreva os problemas identificados" : "Informações adicionais (opcional)"} /></div>{existing?.photos?.length ? <div><p className="mb-2 text-sm font-medium">Fotos anexadas</p><div className="flex flex-wrap gap-2">{existing.photos.map((photo, index) => <Button key={photo.id} variant="outline" size="sm" onClick={() => openChecklistPhoto(photo.storage_path)}><ExternalLink className="size-4" /> Foto {index + 1}</Button>)}</div></div> : null}<DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar checklist"}</Button></DialogFooter></DialogContent></Dialog>;
}
