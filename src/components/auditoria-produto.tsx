/** Rodada 3 — Etapa 6: aba "Auditoria e lançamento" (exclusiva do Super Admin). */
import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  CLASSIFICATIONS,
  DECISIONS,
  LAUNCH_NAME,
  LAUNCH_REPORT,
  PRODUCT_AUDIT,
} from "@/lib/produto";
import { exportReportCsv, exportXlsx, printReport } from "@/lib/reports";
import { logEvent } from "@/lib/platform";

const COLUMNS = [
  { key: "area", label: "Área" },
  { key: "item", label: "Funcionalidade" },
  { key: "classification", label: "Classificação" },
  { key: "decision", label: "Decisão" },
  { key: "before", label: "Antes" },
  { key: "after", label: "Depois" },
];

export function AuditTab({ organization }: { organization?: string | null }) {
  const [classification, setClassification] = useState("todas");
  const [decision, setDecision] = useState("todas");

  const rows = useMemo(
    () =>
      PRODUCT_AUDIT.filter(
        (r) =>
          (classification === "todas" || r.classification === classification) &&
          (decision === "todas" || r.decision === decision),
      ),
    [classification, decision],
  );

  async function log(action: string) {
    await logEvent({
      eventType: "exportacao",
      area: "Administração da Plataforma",
      screen: "Auditoria e lançamento",
      route: "/plataforma",
      action,
      summary: `Auditoria funcional do produto (${rows.length} linhas)`,
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-5 shadow-card">
        <h3 className="gov-title text-base">{LAUNCH_NAME}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Auditoria funcional e de experiência: nenhuma informação ou histórico foi apagado. As
          decisões registradas são de manter, mover, consolidar, ocultar ou simplificar.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {LAUNCH_REPORT.map((s) => (
            <div key={s.title}>
              <p className="text-sm font-medium">{s.title}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Classificação</Label>
          <Select value={classification} onValueChange={setClassification}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {CLASSIFICATIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Decisão</Label>
          <Select value={decision} onValueChange={setDecision}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {DECISIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} de {PRODUCT_AUDIT.length} registros
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              exportReportCsv("auditoria-produto-frotagov", COLUMNS, rows);
              void log("CSV");
            }}
          >
            <Download className="size-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              exportXlsx("auditoria-produto-frotagov", COLUMNS, rows, "Auditoria");
              void log("XLSX");
            }}
          >
            <Download className="size-4" /> Excel (.xlsx)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              printReport(
                {
                  title: "Auditoria funcional e antes/depois — " + LAUNCH_NAME,
                  organization: organization || "FrotaGov",
                  subtitle: "Simplificação sem perda de aderência, controle ou auditoria",
                  filters: [
                    {
                      label: "Classificação",
                      value: classification === "todas" ? "Todas" : classification,
                    },
                    { label: "Decisão", value: decision === "todas" ? "Todas" : decision },
                  ],
                },
                COLUMNS,
                rows,
              );
              void log("Impressão");
            }}
          >
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Área</TableHead>
              <TableHead>Funcionalidade</TableHead>
              <TableHead>Classificação</TableHead>
              <TableHead>Decisão</TableHead>
              <TableHead>Antes</TableHead>
              <TableHead>Depois</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhum registro para os filtros informados.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.area + r.item}>
                <TableCell className="text-sm text-muted-foreground">{r.area}</TableCell>
                <TableCell className="text-sm font-medium">{r.item}</TableCell>
                <TableCell>
                  <Badge variant={r.classification === "Essencial" ? "default" : "secondary"}>
                    {r.classification}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{r.decision}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.before}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.after}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
