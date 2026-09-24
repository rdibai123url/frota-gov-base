/** Análise e efetivação de chamados de reabertura de competência (suporte da plataforma). */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase, useInvalidate } from "@/lib/frotagov";
import {
  REQUEST_LABELS,
  competenceLabel,
  useReopenRequests,
  type ReopenRequest,
} from "@/lib/transparency";

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
type ReopenReviewRow = ReopenRequest & {
  period: { year: number; month: number; status?: string | null } | null;
  organization: { legal_name: string; short_name: string | null } | null;
};

export function ReopenReviewTab() {
  const invalidate = useInvalidate();
  const { data: requests = [] } = useReopenRequests(true);
  const [current, setCurrent] = useState<ReopenReviewRow | null>(null);
  const [decision, setDecision] = useState<"em_analise" | "aprovado" | "rejeitado">("aprovado");
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);

  async function review() {
    if (!current) return;
    if (!justification.trim()) {
      toast.error("Informe o parecer do suporte.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("review_transparency_reopen", {
      _request: current.id,
      _decision: decision,
      _justification: justification,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Parecer registrado.");
    setCurrent(null);
    setJustification("");
    invalidate(["transparency-reopen", "transparency-periods"]);
  }

  async function execute(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc("execute_transparency_reopen", {
      _request: id,
      _justification: "Reabertura efetivada pelo suporte da plataforma.",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Competência reaberta. A versão publicada anterior foi preservada.");
    invalidate(["transparency-reopen", "transparency-periods", "transparency-publications"]);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Chamados de reabertura de competência de todos os órgãos. Apenas o suporte da plataforma
        pode aprovar e efetivar a reabertura; nenhuma versão publicada é apagada.
      </p>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead>Órgão</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Solicitado em</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhum chamado de reabertura registrado.
                </TableCell>
              </TableRow>
            )}
            {requests.map((r: ReopenReviewRow) => (
              <TableRow key={r.id}>
                <TableCell>{r.protocol ?? "—"}</TableCell>
                <TableCell>
                  {r.organization?.short_name ?? r.organization?.legal_name ?? "—"}
                </TableCell>
                <TableCell>
                  {r.period ? competenceLabel(r.period.year, r.period.month) : "—"}
                </TableCell>
                <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                <TableCell>{dt(r.requested_at)}</TableCell>
                <TableCell>{REQUEST_LABELS[r.status as keyof typeof REQUEST_LABELS]}</TableCell>
                <TableCell className="space-x-2 text-right">
                  {(r.status === "aberto" || r.status === "em_analise") && (
                    <Button size="sm" variant="outline" onClick={() => setCurrent(r)}>
                      Analisar
                    </Button>
                  )}
                  {r.status === "aprovado" && (
                    <Button size="sm" onClick={() => execute(r.id)} disabled={busy}>
                      Efetivar reabertura
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!current} onOpenChange={(v) => !v && setCurrent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Analisar chamado {current?.protocol}</DialogTitle>
            <DialogDescription>{current?.details}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Decisão</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as typeof decision)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_analise">Em análise</SelectItem>
                  <SelectItem value="aprovado">Aprovar reabertura</SelectItem>
                  <SelectItem value="rejeitado">Rejeitar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Parecer do suporte *</Label>
              <Textarea
                rows={4}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCurrent(null)}>
              Cancelar
            </Button>
            <Button onClick={review} disabled={busy}>
              Registrar parecer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
