import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      { property: "og:description", content: "Acompanhe as inconsistências de abastecimento do órgão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Alertas,
});

const ALL = "__all__";

function Alertas() {
  const { data: alerts = [], isLoading } = useFuelingAlerts();
  const { canWrite, userId } = usePerms();
  const invalidate = useInvalidate();
  const [status, setStatus] = useState("aberto");
  const [type, setType] = useState(ALL);
  const [category, setCategory] = useState(ALL);

  useEffect(() => {
    void Promise.all([supabase.rpc("refresh_financial_alerts"), supabase.rpc("refresh_maintenance_alerts"),
      supabase.rpc("refresh_procurement_alerts"), supabase.rpc("refresh_fleet_alerts"),

    ]).then(() =>
      invalidate(["fueling-alerts"]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () =>
      alerts.filter(
        (a) =>
          (status === ALL || a.status === status) &&
          (type === ALL || a.alert_type === type) &&
          (category === ALL || (a.category ?? "abastecimento") === category),
      ),
    [alerts, status, type, category],
  );

  const types = useMemo(() => Array.from(new Set(alerts.map((a) => a.alert_type))), [alerts]);

  async function resolve(id: string) {
    const { error } = await supabase
      .from("fueling_alerts")
      .update({ status: "resolvido", resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq("id", id);
    if (error) {
      toast.error("Não foi possível resolver o alerta.");
      return;
    }
    toast.success("Alerta marcado como resolvido.");
    invalidate(["fueling-alerts"]);
  }

  const { data: diaries = [] } = useDiaries();
  const diaryIssues = useMemo(() => diaryAlerts(diaries), [diaries]);

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Alertas e inconsistências"
        description="Ocorrências geradas automaticamente pelas regras de validação dos abastecimentos."
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-3">
        <div>
          <Label className="text-xs">Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              <SelectItem value="aberto">Abertos</SelectItem>
              <SelectItem value="resolvido">Resolvidos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tipo de ocorrência</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
              <TableHead>Categoria</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Detalhe</TableHead>
              <TableHead>Justificativa</TableHead>
              <TableHead>Registrado em</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Nenhuma inconsistência registrada.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <AlertTriangle className="size-4 text-warning" />
                    {alertLabel(a.alert_type)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{label(ALERT_CATEGORIES, a.category ?? "abastecimento")}</Badge>
                </TableCell>
                <TableCell>{a.vehicle?.plate ?? "—"}</TableCell>
                <TableCell className="max-w-sm text-sm text-muted-foreground">{a.message}</TableCell>
                <TableCell className="max-w-xs text-sm">{a.justification || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{dateTimeBR(a.created_at)}</TableCell>
                <TableCell>
                  <Badge variant={a.status === "aberto" ? "destructive" : "secondary"}>
                    {a.status === "aberto" ? "Aberto" : "Resolvido"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canWrite && a.status === "aberto" && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => resolve(a.id)}>
                      <CheckCircle2 className="size-4" /> Resolver
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>
    </>
  );
}
