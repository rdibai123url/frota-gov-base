/** Fase 9 — abas exclusivas do Super Admin: Documentação/Homologação e Matriz de Funcionalidades. */
import { useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, Download, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ACTIVE_MODULES,
  APP_STAGE,
  APP_VERSION,
  FEATURE_MATRIX,
  KNOWN_LIMITATIONS,
  TECH_CHECKLIST,
  VERSION_HISTORY,
} from "@/lib/homologacao";
import { exportReportCsv, exportXlsx, printReport } from "@/lib/reports";
import { logEvent } from "@/lib/platform";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-card">
      <h3 className="gov-title mb-3 text-base">{title}</h3>
      {children}
    </section>
  );
}

export function DocsTab({ environment }: { environment: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Versão e status">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Versão atual</dt>
            <dd className="font-medium">{APP_VERSION}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Etapa</dt>
            <dd className="font-medium">{APP_STAGE}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Módulos ativos</dt>
            <dd className="font-medium">{ACTIVE_MODULES.length}</dd>
          </div>
          {environment.map((e) => (
            <div key={e.label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{e.label}</dt>
              <dd className="max-w-[60%] truncate text-right font-medium">{e.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Nenhuma chave, senha ou segredo do ambiente é exibido nesta tela.
        </p>
      </Section>

      <Section title="Limitações conhecidas">
        <ul className="space-y-2 text-sm">
          {KNOWN_LIMITATIONS.map((l) => (
            <li key={l} className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Checklist técnico">
        <ul className="space-y-3 text-sm">
          {TECH_CHECKLIST.map((c) => (
            <li key={c.item} className="flex items-start gap-2">
              {c.status === "ok" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <span>
                <span className="font-medium">{c.item}</span>
                <span className="block text-muted-foreground">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Módulos ativos">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                <TableHead>Rota</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ACTIVE_MODULES.map((m) => (
                <TableRow key={m.route + m.module}>
                  <TableCell className="text-sm font-medium">
                    {m.module}
                    {m.note && <span className="block text-xs text-muted-foreground">{m.note}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.route}</TableCell>
                  <TableCell>
                    <Badge variant={m.status === "ativo" ? "default" : "secondary"}>
                      {m.status === "ativo" ? "Ativo" : "Parcial"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Histórico de versões">
        <ol className="space-y-3 text-sm">
          {VERSION_HISTORY.map((v) => (
            <li key={v.version} className="border-l-2 border-border pl-3">
              <p className="font-medium">
                {v.version} — {v.title}{" "}
                <span className="text-xs font-normal text-muted-foreground">({v.date})</span>
              </p>
              <p className="text-muted-foreground">{v.summary}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

const MATRIX_COLUMNS = [
  { key: "module", label: "Módulo" },
  { key: "feature", label: "Funcionalidade" },
  { key: "status", label: "Status" },
  { key: "note", label: "Observação / Limitação" },
  { key: "evidence", label: "Evidência / Tela" },
];

export function MatrixTab({ organization }: { organization?: string | null }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("todos");
  const [module, setModule] = useState("todos");

  const modules = useMemo(() => Array.from(new Set(FEATURE_MATRIX.map((r) => r.module))), []);
  const rows = useMemo(
    () =>
      FEATURE_MATRIX.filter((r) => {
        if (status !== "todos" && r.status !== status) return false;
        if (module !== "todos" && r.module !== module) return false;
        if (q) {
          const text = `${r.module} ${r.feature} ${r.note}`.toLowerCase();
          if (!text.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [q, status, module],
  );

  const counts = useMemo(
    () => ({
      sim: FEATURE_MATRIX.filter((r) => r.status === "Sim").length,
      parcial: FEATURE_MATRIX.filter((r) => r.status === "Parcial").length,
      nao: FEATURE_MATRIX.filter((r) => r.status === "Não").length,
    }),
    [],
  );

  async function log(action: string) {
    await logEvent({
      eventType: "exportacao",
      area: "Administração da Plataforma",
      screen: "Matriz de Funcionalidades",
      route: "/plataforma",
      action,
      summary: `Matriz de funcionalidades (${rows.length} linhas)`,
    });
  }

  return (
    <>
      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Busca</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Funcionalidade ou observação" />
        </div>
        <div className="space-y-1.5">
          <Label>Módulo</Label>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="Sim">Sim</SelectItem>
              <SelectItem value="Parcial">Parcial</SelectItem>
              <SelectItem value="Não">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} de {FEATURE_MATRIX.length} — Sim: {counts.sim} · Parcial: {counts.parcial} · Não: {counts.nao}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { exportReportCsv("matriz-funcionalidades-frotagov", MATRIX_COLUMNS, rows); void log("CSV"); }}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => { exportXlsx("matriz-funcionalidades-frotagov", MATRIX_COLUMNS, rows, "Matriz"); void log("XLSX"); }}>
            <Download className="size-4" /> Excel (.xlsx)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              printReport(
                {
                  title: "Matriz de Funcionalidades — FrotaGov " + APP_VERSION,
                  organization: organization || "FrotaGov",
                  subtitle: "Documento técnico de apoio a processos licitatórios",
                  filters: [
                    { label: "Módulo", value: module === "todos" ? "Todos" : module },
                    { label: "Status", value: status === "todos" ? "Todos" : status },
                  ],
                },
                MATRIX_COLUMNS,
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
              <TableHead>Módulo</TableHead>
              <TableHead>Funcionalidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Observação / Limitação</TableHead>
              <TableHead>Evidência</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhuma funcionalidade para os filtros informados.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.module + r.feature}>
                <TableCell className="text-sm text-muted-foreground">{r.module}</TableCell>
                <TableCell className="text-sm font-medium">{r.feature}</TableCell>
                <TableCell>
                  <Badge
                    variant={r.status === "Sim" ? "default" : r.status === "Parcial" ? "secondary" : "outline"}
                  >
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.note}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.evidence}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Este documento descreve as funcionalidades efetivamente entregues. A aderência a um edital
        específico depende da análise daquele edital.
      </p>
    </>
  );
}
