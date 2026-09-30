/**
 * Afastamento de condutor: registra férias, licença, INSS ou atestado (até 15 dias) e a
 * previsão de retorno. Na data de retorno o motorista volta a ficar disponível sozinho.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  ABSENCE_REASONS,
  currentAbsence,
  dateBR,
  dbMessage,
  useInvalidate,
  usePerms,
  type DriverRow,
} from "@/lib/frotagov";

const reasonLabel = (v: string) => ABSENCE_REASONS.find((r) => r.value === v)?.label ?? v;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function AfastamentoDialog({ driver, onClose }: { driver: DriverRow; onClose: () => void }) {
  const { orgId, userId, canWrite } = usePerms();
  const invalidate = useInvalidate();
  const [reason, setReason] = useState("ferias");
  const [start, setStart] = useState(today());
  const [back, setBack] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const active = currentAbsence(driver.absences);
  const history = [...(driver.absences ?? [])].sort((a, b) =>
    b.start_date.localeCompare(a.start_date),
  );

  async function save() {
    if (!orgId) return;
    if (reason === "atestado") {
      if (!back) {
        toast.error("Informe a data de retorno do atestado.");
        return;
      }
      if (back > addDays(start, 15)) {
        toast.error("Atestado tem no máximo 15 dias. Para prazo maior, escolha Licença ou INSS.");
        return;
      }
    }
    if (back && back <= start) {
      toast.error("A data de retorno deve ser depois da data de início.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("driver_absences").insert({
      organization_id: orgId,
      driver_id: driver.id,
      reason,
      start_date: start,
      expected_return: back || null,
      notes: notes.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Afastamento registrado.");
    invalidate(["drivers"]);
    setBack("");
    setNotes("");
  }

  async function returnNow(id: string) {
    const { error } = await supabase
      .from("driver_absences")
      .update({ returned_at: today() })
      .eq("id", id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Retorno registrado. O condutor está disponível.");
    invalidate(["drivers"]);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Afastamento — {driver.full_name}</DialogTitle>
          <DialogDescription>
            Enquanto estiver afastado, o condutor não aparece para viagens e autorizações e não
            entra na escala. Ele volta sozinho na data de retorno.
          </DialogDescription>
        </DialogHeader>

        {active && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <div>
              <p className="font-medium">Afastado agora: {reasonLabel(active.reason)}</p>
              <p className="text-muted-foreground">
                Desde {dateBR(active.start_date)}
                {active.expected_return
                  ? ` · retorno previsto em ${dateBR(active.expected_return)}`
                  : " · sem data de retorno informada"}
              </p>
            </div>
            {canWrite && (
              <Button size="sm" variant="outline" onClick={() => returnNow(active.id)}>
                Registrar retorno agora
              </Button>
            )}
          </div>
        )}

        {canWrite && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-semibold">Novo afastamento</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Motivo</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="af-inicio">Início do afastamento</Label>
                <Input
                  id="af-inicio"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="af-retorno">
                  Previsão de retorno{reason === "atestado" ? " *" : ""}
                </Label>
                <Input
                  id="af-retorno"
                  type="date"
                  value={back}
                  min={addDays(start, 1)}
                  max={reason === "atestado" ? addDays(start, 15) : undefined}
                  onChange={(e) => setBack(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="af-obs">Observações</Label>
                <Textarea
                  id="af-obs"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {back
                ? "Na data de retorno o condutor volta a ficar disponível automaticamente."
                : "Sem data de retorno, o condutor continua afastado até você registrar o retorno."}
            </p>
            <Button onClick={save} disabled={saving}>
              Registrar afastamento
            </Button>
          </div>
        )}

        <div>
          <p className="mb-1 text-sm font-semibold">Histórico</p>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum afastamento registrado.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {history.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span>
                    {reasonLabel(a.reason)} · {dateBR(a.start_date)}
                    {a.expected_return ? ` a ${dateBR(a.expected_return)}` : ""}
                  </span>
                  {a.returned_at ? (
                    <Badge variant="secondary">Retornou em {dateBR(a.returned_at)}</Badge>
                  ) : currentAbsence([a]) ? (
                    <Badge variant="outline">Em andamento</Badge>
                  ) : (
                    <Badge variant="secondary">Encerrado</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
