import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { alertGuidance, RESOLUTION_LABEL } from "@/lib/alertas-ajuda";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { useDiaries, diaryAlerts } from "@/lib/diarias";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  ALERT_CATEGORIES,
  alertLabel,
  dateTimeBR,
  label,
  supabase,
  useFuelingAlerts,
  useInvalidate,
  usePerms,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/alertas")({
  head: () => ({
    meta: [
      { title: "Alertas e Inconsistências — FrotaGov" },
      {
        name: "description",
        content:
          "Ocorrências detectadas nos abastecimentos: combustível incompatível, tanque excedido, duplicidades e abastecimentos próximos.",
      },
      { property: "og:title", content: "Alertas e Inconsistências — FrotaGov" },
      {
        property: "og:description",
        content: "Acompanhe as inconsistências de abastecimento do órgão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Alertas,
});

const ALL = "__all__";

/** Situações do histórico: nunca apagamos alerta, apenas saímos da visão de abertos. */
const VIEWS = [
  { value: "aberto", label: "Abertos" },
  { value: "auto", label: "Resolvidos automaticamente" },
  { value: "correcao", label: "Resolvidos por correção" },
  { value: "usuario", label: "Resolvidos/ignorados pelo usuário" },
  { value: ALL, label: "Todos" },
];

function Alertas() {
  const { data: alerts = [], isLoading } = useFuelingAlerts();
  const perms = usePerms();
  const invalidate = useInvalidate();
  const [view, setView] = useState("aberto");
  const [type, setType] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [guide, setGuide] = useState<AlertLike | null>(null);
  const [dismissing, setDismissing] = useState<AlertLike | null>(null);

  useEffect(() => {
    void Promise.all([
      supabase.rpc("refresh_financial_alerts"),
      supabase.rpc("refresh_maintenance_alerts"),
      supabase.rpc("refresh_procurement_alerts"),
      supabase.rpc("refresh_fleet_alerts"),
      supabase.rpc("refresh_intelligence_alerts"),
      // Fecha sozinho as inconsistências corretivas cuja causa já não existe.
      supabase.rpc("resolve_stale_alerts"),
    ]).then(() => invalidate(["fueling-alerts", "fueling-alerts-open-count"]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () =>
      alerts.filter((a) => {
        const kindOk =
          view === ALL ||
          (view === "aberto"
            ? a.status === "aberto"
            : a.status !== "aberto" && (a.resolution_kind ?? "auto") === view);
        return (
          kindOk &&
          (type === ALL || a.alert_type === type) &&
          (category === ALL || (a.category ?? "abastecimento") === category)
        );
      }),
    [alerts, view, type, category],
  );

  const types = useMemo(() => Array.from(new Set(alerts.map((a) => a.alert_type))), [alerts]);

  const { data: diaries = [] } = useDiaries();
  const diaryIssues = useMemo(() => diaryAlerts(diaries), [diaries]);

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Alertas e inconsistências"
        description="Avisos orientativos e inconsistências que dependem de correção de dado, geradas pelas regras do órgão."
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-3">
        <div>
          <Label className="text-xs">Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {ALERT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Situação</Label>
          <Select value={view} onValueChange={setView}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIEWS.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tipo de ocorrência</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {alertLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {diaryIssues.length > 0 && (
        <div className="mb-4 rounded-lg border bg-card p-4 shadow-card">
          <h2 className="gov-title mb-3 text-base">Diárias — pendências</h2>
          <ul className="space-y-2">
            {diaryIssues.map((i, idx) => (
              <li key={`${i.kind}-${idx}`} className="flex items-start gap-2 text-sm">
                <AlertTriangle
                  className={`mt-0.5 size-4 ${i.severity === "alta" ? "text-destructive" : "text-warning"}`}
                />
                <span>{i.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ocorrência</TableHead>
              <TableHead>Tratamento</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Detalhe</TableHead>
              <TableHead>Registrado em</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-40" />
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
                  Nenhum registro nesta visão.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((a) => {
              const g = alertGuidance(a.alert_type);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <AlertTriangle className="size-4 text-warning" />
                      {alertLabel(a.alert_type)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {g.kind === "orientativo" ? "Orientativo" : "Corretivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {label(ALERT_CATEGORIES, a.category ?? "abastecimento")}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.vehicle?.plate ?? a.vehicle?.asset_code ?? "—"}</TableCell>
                  <TableCell className="max-w-sm text-sm text-muted-foreground">
                    {a.message}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{dateTimeBR(a.created_at)}</TableCell>
                  <TableCell>
                    {a.status === "aberto" ? (
                      <Badge variant="destructive">Aberto</Badge>
                    ) : (
                      <Badge variant="secondary">
                        {RESOLUTION_LABEL[a.resolution_kind ?? "auto"] ?? "Resolvido"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Como tratar este alerta"
                        onClick={() => setGuide(a)}
                      >
                        <Info className="size-4" />
                      </Button>
                      {perms.canManageFleet &&
                        a.status === "aberto" &&
                        g.kind === "orientativo" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => setDismissing(a)}
                          >
                            <CheckCircle2 className="size-4" /> Resolver
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

      {guide && <GuideDialog alert={guide} onClose={() => setGuide(null)} />}
      {dismissing && (
        <DismissDialog
          alert={dismissing}
          onClose={() => setDismissing(null)}
          onSaved={() => invalidate(["fueling-alerts", "fueling-alerts-open-count"])}
        />
      )}
    </>
  );
}

type AlertLike = {
  id: string;
  alert_type: string;
  message: string | null;
  status: string;
  resolution_kind?: string | null;
  resolution_reason?: string | null;
  justification?: string | null;
};

function GuideDialog({ alert, onClose }: { alert: AlertLike; onClose: () => void }) {
  const g = alertGuidance(alert.alert_type);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{alertLabel(alert.alert_type)}</DialogTitle>
          <DialogDescription>
            {g.kind === "orientativo"
              ? "Aviso orientativo: pode ser encerrado com justificativa, sem alterar o dado de origem."
              : "Inconsistência corretiva: sai da lista sozinha quando o dado for corrigido."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p>
            <span className="font-medium">O que significa: </span>
            {g.meaning}
          </p>
          <p>
            <span className="font-medium">Por que foi gerada: </span>
            {alert.message ?? "—"}
          </p>
          <p>
            <span className="font-medium">Impacto: </span>
            {g.impact}
          </p>
          <div>
            <p className="mb-1 font-medium">
              {g.kind === "corretivo" ? "Passos de correção pendentes" : "Passos recomendados"}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              {g.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          {alert.resolution_reason && (
            <p className="rounded-md bg-muted px-3 py-2">
              <span className="font-medium">Justificativa registrada: </span>
              {alert.resolution_reason}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DismissDialog({
  alert,
  onClose,
  onSaved,
}: {
  alert: AlertLike;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (reason.trim().length < 5) {
      toast.error("Informe uma justificativa curta para o encerramento.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("dismiss_alert", {
      _id: alert.id,
      _reason: reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Alerta encerrado por decisão do usuário e registrado no histórico.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolver / ignorar alerta</DialogTitle>
          <DialogDescription>
            O dado de origem não é alterado. O alerta sai dos abertos e fica no histórico com seu
            nome, data e justificativa.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Justificativa do encerramento"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Registrando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
