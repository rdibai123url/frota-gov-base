/**
 * Bloco C — Importação e migração em massa.
 *
 * Assistente em etapas (módulo → modelo → arquivo → mapeamento → prévia →
 * validação → correção → importação definitiva → relatório), histórico de
 * lotes por órgão e rotina de saldos iniciais / posição de abertura.
 *
 * A simulação nunca grava dados operacionais: as linhas ficam no lote até que
 * o usuário confirme a importação definitiva, executada em transação única
 * pela rotina `commit_import_batch` do banco.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  ListOrdered,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination, usePaged } from "@/components/list-pagination";
import { MoneyInput } from "@/components/form-fields";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatNumberBR, parseBRNumber } from "@/lib/format";
import { usePerms, useInvalidate } from "@/lib/frotagov";
import { useIsSuperAdmin } from "@/lib/platform";
import {
  BATCH_STATUS_LABELS,
  DUPLICATE_STRATEGIES,
  IMPORT_MODULES,
  OPENING_BALANCE_KINDS,
  downloadIssues,
  downloadTemplate,
  fieldHint,
  moduleById,
  parseImportFile,
  suggestMapping,
  summarize,
  validateRows,
  type ImportModule,
  type Lookups,
  type LookupItem,
  type ValidatedRow,
} from "@/lib/import";

const NONE = "__none__";

const statusTone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  rascunho: "outline",
  em_validacao: "secondary",
  com_erros: "destructive",
  pronto: "default",
  importando: "secondary",
  concluido: "default",
  cancelado: "secondary",
  anulado: "destructive",
};

/* ------------------------------ dados de apoio ------------------------------ */

function useLookups(orgId: string | null) {
  return useQuery({
    queryKey: ["import-lookups", orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<Lookups> => {
      const [units, vehicles, suppliers, drivers, fuels, contracts, costCenters] = await Promise.all([
        supabase.from("units").select("id,name,acronym").eq("organization_id", orgId!),
        supabase.from("vehicles").select("id,plate,renavam,chassis,asset_code").eq("organization_id", orgId!),
        supabase.from("suppliers").select("id,legal_name,trade_name,cnpj").eq("organization_id", orgId!),
        supabase.from("drivers").select("id,full_name,cpf,license_number").eq("organization_id", orgId!),
        supabase.from("fuel_types").select("id,name,acronym").eq("organization_id", orgId!),
        supabase.from("contracts").select("id,number").eq("organization_id", orgId!),
        supabase.from("cost_centers").select("id,code,name").eq("organization_id", orgId!),
      ]);
      const map = <T,>(rows: T[] | null, keys: (r: T) => (string | null)[], label: (r: T) => string, id: (r: T) => string): LookupItem[] =>
        (rows ?? []).map((r) => ({ id: id(r), keys: keys(r).filter(Boolean) as string[], label: label(r) }));
      return {
        unit: map(units.data, (u) => [u.name, u.acronym], (u) => u.name, (u) => u.id),
        vehicle: map(vehicles.data, (v) => [v.plate, v.renavam, v.chassis, v.asset_code], (v) => v.plate, (v) => v.id),
        supplier: map(suppliers.data, (s) => [s.cnpj, s.legal_name, s.trade_name], (s) => s.legal_name, (s) => s.id),
        driver: map(drivers.data, (d) => [d.cpf, d.full_name, d.license_number], (d) => d.full_name, (d) => d.id),
        fuel: map(fuels.data, (f) => [f.name, f.acronym], (f) => f.name, (f) => f.id),
        contract: map(contracts.data, (c) => [c.number], (c) => c.number, (c) => c.id),
        cost_center: map(costCenters.data, (c) => [c.code, c.name], (c) => c.name, (c) => c.id),
      };
    },
  });
}

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Índice de registros já existentes no órgão, usado para detectar duplicidade. */
async function loadExisting(mod: ImportModule, orgId: string) {
  const index = new Map<string, string>();
  const add = (key: string, value: string | null | undefined, id: string) => {
    if (value) index.set(`${key}:${norm(String(value))}`, id);
  };
  switch (mod.id) {
    case "unidades": {
      const { data } = await supabase.from("units").select("id,name,acronym").eq("organization_id", orgId);
      for (const r of data ?? []) {
        add("name", r.name, r.id);
        add("acronym", r.acronym, r.id);
      }
      break;
    }
    case "veiculos": {
      const { data } = await supabase.from("vehicles").select("id,plate,renavam,chassis,asset_code").eq("organization_id", orgId);
      for (const r of data ?? []) {
        add("plate", r.plate, r.id);
        add("renavam", r.renavam, r.id);
        add("chassis", r.chassis, r.id);
        add("asset_code", r.asset_code, r.id);
      }
      break;
    }
    case "condutores": {
      const { data } = await supabase.from("drivers").select("id,cpf,license_number").eq("organization_id", orgId);
      for (const r of data ?? []) {
        add("cpf", r.cpf, r.id);
        add("license_number", r.license_number, r.id);
      }
      break;
    }
    case "fornecedores": {
      const { data } = await supabase.from("suppliers").select("id,cnpj,legal_name").eq("organization_id", orgId);
      for (const r of data ?? []) {
        add("cnpj", r.cnpj, r.id);
        add("legal_name", r.legal_name, r.id);
      }
      break;
    }
    case "produtos": {
      const { data } = await supabase.from("fuel_types").select("id,name").eq("organization_id", orgId);
      for (const r of data ?? []) add("name", r.name, r.id);
      break;
    }
    case "centros_custo": {
      const { data } = await supabase.from("cost_centers").select("id,code").eq("organization_id", orgId);
      for (const r of data ?? []) add("code", r.code, r.id);
      break;
    }
    case "contratos": {
      const { data } = await supabase.from("contracts").select("id,number").eq("organization_id", orgId);
      for (const r of data ?? []) add("number", r.number, r.id);
      break;
    }
    case "empenhos": {
      const { data } = await supabase.from("commitments").select("id,number").eq("organization_id", orgId);
      for (const r of data ?? []) add("number", r.number, r.id);
      break;
    }
    case "multas": {
      const { data } = await supabase.from("traffic_fines").select("id,notice_number").eq("organization_id", orgId);
      for (const r of data ?? []) add("notice_number", r.notice_number, r.id);
      break;
    }
    case "seguros": {
      const { data } = await supabase.from("insurance_policies").select("id,policy_number").eq("organization_id", orgId);
      for (const r of data ?? []) add("policy_number", r.policy_number, r.id);
      break;
    }
    case "entidades": {
      const { data } = await supabase.from("external_entities").select("id,name,document").eq("organization_id", orgId);
      for (const r of data ?? []) {
        add("name", r.name, r.id);
        add("document", r.document, r.id);
      }
      break;
    }
    default:
      break;
  }
  return index;
}

/* ------------------------------- aba principal ------------------------------- */

export function ImportMigrationTab() {
  const { orgId } = usePerms();

  if (!orgId) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          Acesse um órgão na aba <strong>Órgãos</strong> para executar a importação e a migração de dados daquele órgão.
        </p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="assistente">
      <TabsList className="flex h-auto w-full flex-wrap justify-start">
        <TabsTrigger value="assistente">Assistente de importação</TabsTrigger>
        <TabsTrigger value="lotes">Lotes do órgão</TabsTrigger>
        <TabsTrigger value="abertura">Saldos iniciais / posição de abertura</TabsTrigger>
        <TabsTrigger value="ordem">Ordem recomendada</TabsTrigger>
      </TabsList>
      <TabsContent value="assistente" className="pt-5">
        <ImportWizard orgId={orgId} />
      </TabsContent>
      <TabsContent value="lotes" className="pt-5">
        <BatchesTab orgId={orgId} />
      </TabsContent>
      <TabsContent value="abertura" className="pt-5">
        <OpeningBalancesTab orgId={orgId} />
      </TabsContent>
      <TabsContent value="ordem" className="pt-5">
        <OrderTab />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------ ordem recomendada ------------------------------ */

function OrderTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <ListOrdered className="mt-0.5 size-4 shrink-0" />
        <p>
          Siga esta ordem para que cada arquivo encontre os cadastros que ele referencia. Um registro que aponte para
          um cadastro inexistente é bloqueado com a mensagem indicando qual módulo precisa ser importado antes.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Ordem</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Depende de</TableHead>
              <TableHead>Natureza</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...IMPORT_MODULES]
              .sort((a, b) => a.order - b.order)
              .map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.order}</TableCell>
                  <TableCell>
                    <p className="font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.depends.length ? m.depends.map((d) => moduleById(d)?.label ?? d).join(", ") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.legacy ? "secondary" : "outline"}>
                      {m.legacy ? "Histórico legado" : "Cadastro"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* --------------------------------- assistente --------------------------------- */

type WizardStep = 1 | 2 | 3 | 4 | 5;

function ImportWizard({ orgId }: { orgId: string }) {
  const invalidate = useInvalidate();
  const { data: lookups } = useLookups(orgId);
  const [moduleId, setModuleId] = useState<string>("unidades");
  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sourceSystem, setSourceSystem] = useState("");
  const [notes, setNotes] = useState("");
  const [strategy, setStrategy] = useState("ignorar");
  const [validated, setValidated] = useState<ValidatedRow[] | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ValidatedRow | null>(null);
  const [report, setReport] = useState<{ criados: number; atualizados: number; ignorados: number } | null>(null);

  const mod = moduleById(moduleId)!;
  const summary = validated ? summarize(validated) : null;
  const blocking = summary ? summary.error > 0 : false;

  function reset(keepModule = true) {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setFileRows([]);
    setMapping({});
    setValidated(null);
    setBatchId(null);
    setReport(null);
    setSourceSystem("");
    setNotes("");
    setStrategy("ignorar");
    if (!keepModule) setModuleId("unidades");
  }

  async function onFile(f: File) {
    setBusy(true);
    try {
      const parsed = await parseImportFile(f);
      if (!parsed.headers.length) {
        toast.error("Não foi possível ler o cabeçalho do arquivo.");
        return;
      }
      setFile(f);
      setHeaders(parsed.headers);
      setFileRows(parsed.rows);
      setMapping(suggestMapping(parsed.headers, mod));
      setValidated(null);
      setBatchId(null);
      setStep(3);
      toast.success(`${parsed.rows.length} linha(s) lidas de ${f.name}.`);
    } catch {
      toast.error("Arquivo inválido. Envie CSV ou XLSX.");
    } finally {
      setBusy(false);
    }
  }

  /** Etapa 8 e 9: valida tudo e grava apenas o lote de simulação. */
  async function runValidation(rows = fileRows) {
    if (!rows.length) {
      toast.error("O arquivo não possui linhas de dados.");
      return;
    }
    setBusy(true);
    try {
      const existing = await loadExisting(mod, orgId);
      const result = validateRows({
        mod,
        mapping,
        rows,
        lookups: lookups ?? {},
        existing,
        duplicateStrategy: strategy,
      });
      const s = summarize(result);
      const status = s.error > 0 ? "com_erros" : "pronto";

      let id = batchId;
      if (!id) {
        const { data, error } = await supabase
          .from("import_batches")
          .insert({
            organization_id: orgId,
            module: mod.id,
            status: "em_validacao",
            file_name: file?.name ?? null,
            file_type: file?.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx",
            source_system: sourceSystem || null,
            notes: notes || null,
            duplicate_strategy: strategy,
            headers,
            mapping,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
        setBatchId(id);
      }

      await supabase.from("import_rows").delete().eq("batch_id", id);
      const payload = result.map((r) => ({
        organization_id: orgId,
        batch_id: id!,
        row_number: r.rowNumber,
        raw: r.raw,
        normalized: r.normalized,
        status: r.status,
        issues: r.issues,
        duplicate_of: r.duplicateOf ?? null,
      }));
      for (let i = 0; i < payload.length; i += 400) {
        const { error } = await supabase.from("import_rows").insert(payload.slice(i, i + 400));
        if (error) throw error;
      }

      const { error: upErr } = await supabase
        .from("import_batches")
        .update({
          status,
          source_system: sourceSystem || null,
          notes: notes || null,
          duplicate_strategy: strategy,
          mapping,
          headers,
          total_rows: s.total,
          valid_rows: s.valid,
          warning_rows: s.warning,
          error_rows: s.error,
          duplicate_rows: s.duplicate,
        })
        .eq("id", id!);
      if (upErr) throw upErr;

      setValidated(result);
      setStep(5);
      invalidate(["import-batches"]);
      toast.success(
        s.error > 0
          ? `Simulação concluída com ${s.error} linha(s) com erro. Nada foi gravado.`
          : "Simulação concluída sem erros bloqueantes. Nada foi gravado ainda.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao validar o arquivo.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!batchId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("commit_import_batch_v2", { _batch: batchId });
      if (error) throw error;
      const result = data as unknown as { criados: number; atualizados: number; ignorados: number };
      setReport(result);
      invalidate(["import-batches"]);
      invalidate(["units", "vehicles", "drivers", "suppliers", "fuel-types", "contracts", "commitments"]);
      toast.success(`Importação concluída: ${result.criados + result.atualizados} registro(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na importação definitiva.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelBatch() {
    if (!batchId) return;
    const { error } = await supabase
      .from("import_batches")
      .update({ status: "cancelado", cancel_reason: "Cancelado pelo usuário antes da importação definitiva" })
      .eq("id", batchId);
    if (error) {
      toast.error("Não foi possível cancelar o lote.");
      return;
    }
    invalidate(["import-batches"]);
    toast.success("Lote cancelado. Nenhum dado operacional foi gravado.");
    reset();
  }

  const preview = fileRows.slice(0, 5);

  return (
    <div className="space-y-5">
      <Steps step={step} />

      {/* Etapa 1 e 2 — módulo e modelo */}
      <section className="rounded-lg border bg-card p-5 shadow-card">
        <h3 className="gov-title mb-3 text-base">1. Tipo de importação</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Módulo</Label>
            <Select
              value={moduleId}
              onValueChange={(v) => {
                setModuleId(v);
                reset();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...IMPORT_MODULES]
                  .sort((a, b) => a.order - b.order)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.order}. {m.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">{mod.description}</p>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadTemplate(mod)}>
              <Download className="size-4" /> Baixar modelo de planilha
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Upload className="size-4" /> Enviar arquivo CSV ou XLSX
              </span>
            </label>
          </div>
        </div>
        {mod.legacy && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              Migração histórica: os registros entram marcados como legado, com o sistema de origem informado, sem
              autorização eletrônica e <strong>sem consumir saldo</strong> de contrato, empenho ou cota.
            </p>
          </div>
        )}
      </section>

      {/* Etapa 3 e 4 — origem e mapeamento */}
      {file && (
        <section className="rounded-lg border bg-card p-5 shadow-card">
          <h3 className="gov-title mb-3 text-base">2. Origem e mapeamento das colunas</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="source">Sistema de origem</Label>
              <Input
                id="source"
                value={sourceSystem}
                onChange={(e) => setSourceSystem(e.target.value)}
                placeholder="Planilha da Secretaria, sistema anterior…"
              />
            </div>
            <div>
              <Label>Registros já existentes</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DUPLICATE_STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="obs">Observação</Label>
              <Input id="obs" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo do FrotaGov</TableHead>
                  <TableHead>Coluna do arquivo</TableHead>
                  <TableHead>Regra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mod.fields.map((f) => (
                  <TableRow key={f.key}>
                    <TableCell className="font-medium">
                      {f.label}
                      {f.required && <span className="text-destructive"> *</span>}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={mapping[f.key] ?? NONE}
                        onValueChange={(v) =>
                          setMapping((m) => {
                            const next = { ...m };
                            if (v === NONE) delete next[f.key];
                            else next[f.key] = v;
                            return next;
                          })
                        }
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Não importar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Não importar</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fieldHint(f) || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <h4 className="mb-2 text-sm font-medium">Prévia das primeiras linhas</h4>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => (
                        <TableCell key={h} className="whitespace-nowrap text-xs">
                          {r[h] || "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {fileRows.length} linha(s) no arquivo <strong>{file.name}</strong>.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void runValidation()} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Validar (simulação)
            </Button>
            <Button variant="outline" onClick={() => reset()} disabled={busy}>
              Recomeçar
            </Button>
          </div>
        </section>
      )}

      {/* Etapa 5 — resultado da simulação */}
      {validated && summary && (
        <section className="rounded-lg border bg-card p-5 shadow-card">
          <h3 className="gov-title mb-3 text-base">3. Resultado da simulação</h3>
          <div className="grid gap-3 sm:grid-cols-5">
            <Metric label="Recebidos" value={summary.total} />
            <Metric label="Válidos" value={summary.valid} tone="success" />
            <Metric label="Avisos" value={summary.warning} tone="warning" />
            <Metric label="Duplicados" value={summary.duplicate} tone="warning" />
            <Metric label="Erros" value={summary.error} tone="destructive" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => downloadIssues(mod, validated)}>
              <Download className="size-4" /> Baixar ocorrências
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => void runValidation()} disabled={busy}>
              <RotateCcw className="size-4" /> Revalidar
            </Button>
            {!report && (
              <Button
                className="gap-2"
                disabled={busy || blocking || !batchId || (strategy === "rejeitar" && summary.duplicate > 0)}
                onClick={() => void commit()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Importar
                definitivamente
              </Button>
            )}
            {!report && (
              <Button variant="ghost" className="text-destructive" onClick={() => void cancelBatch()} disabled={busy}>
                Cancelar lote
              </Button>
            )}
          </div>
          {blocking && (
            <p className="mt-3 text-xs text-destructive">
              Existem linhas com erro. Corrija o arquivo e reenvie, ou ajuste os campos diretamente abaixo e revalide.
            </p>
          )}

          {report && (
            <div className="mt-4 rounded-md border border-success/40 bg-success/10 p-4 text-sm">
              <p className="font-medium">Relatório final do lote</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>Registros criados: {report.criados}</li>
                <li>Cadastros atualizados: {report.atualizados}</li>
                <li>Linhas ignoradas (já existentes): {report.ignorados}</li>
                <li>Módulo: {mod.label}</li>
                <li>Sistema de origem: {sourceSystem || "não informado"}</li>
              </ul>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => reset()}>
                Iniciar novo lote
              </Button>
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Linha</TableHead>
                  <TableHead className="w-32">Situação</TableHead>
                  <TableHead>Ocorrências</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {validated.slice(0, 100).map((r) => (
                  <TableRow key={r.rowNumber}>
                    <TableCell>{r.rowNumber}</TableCell>
                    <TableCell>
                      <RowBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.issues.length
                        ? r.issues.map((i, k) => (
                            <p key={k}>
                              <strong>{i.label}</strong>: {i.reason}
                              {i.value ? ` (recebido: ${i.value})` : ""}
                            </p>
                          ))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {!report && (
                        <Button variant="ghost" size="icon" aria-label="Corrigir" onClick={() => setEditing(r)}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {validated.length > 100 && (
              <p className="border-t p-2 text-center text-xs text-muted-foreground">
                Exibindo as 100 primeiras linhas. Baixe as ocorrências para ver a lista completa.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Correção pontual na tela */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Corrigir linha {editing?.rowNumber}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const idx = editing.rowNumber - 2;
                const next = [...fileRows];
                const row = { ...(next[idx] ?? {}) };
                for (const h of headers) row[h] = String(form.get(`c_${h}`) ?? "");
                next[idx] = row;
                setFileRows(next);
                setEditing(null);
                void runValidation(next);
              }}
            >
              {headers.map((h) => (
                <div key={h}>
                  <Label htmlFor={`c_${h}`}>{h}</Label>
                  <Input id={`c_${h}`} name={`c_${h}`} defaultValue={editing.raw[h] ?? ""} />
                </div>
              ))}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar e revalidar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Steps({ step }: { step: WizardStep }) {
  const labels = ["Módulo e modelo", "Arquivo e mapeamento", "Simulação", "Correções", "Importação"];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 ${i + 1 <= step ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {i + 1}. {l}
          </span>
          {i < labels.length - 1 && <ArrowRight className="size-3" />}
        </li>
      ))}
    </ol>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "destructive" }) {
  const color =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function RowBadge({ status }: { status: string }) {
  if (status === "erro")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" /> Erro
      </Badge>
    );
  if (status === "duplicado") return <Badge variant="secondary">Duplicado</Badge>;
  if (status === "aviso") return <Badge variant="outline">Aviso</Badge>;
  return (
    <Badge className="gap-1">
      <CheckCircle2 className="size-3" /> Válido
    </Badge>
  );
}

/* ---------------------------------- lotes ---------------------------------- */

function useBatches(orgId: string) {
  return useQuery({
    queryKey: ["import-batches", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function BatchesTab({ orgId }: { orgId: string }) {
  const { data: batches = [], isLoading } = useBatches(orgId);
  const { isSuperAdmin } = useIsSuperAdmin();
  const invalidate = useInvalidate();
  const [annulling, setAnnulling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const paged = usePaged(batches);

  async function annul() {
    if (!annulling) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("annul_import_batch", { _batch: annulling, _reason: reason });
      if (error) throw error;
      toast.success("Lote anulado. Os registros foram cancelados/inativados e o histórico foi preservado.");
      setAnnulling(null);
      setReason("");
      invalidate(["import-batches"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível anular o lote.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Criado em</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Arquivo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Recebidos</TableHead>
              <TableHead className="text-right">Válidos</TableHead>
              <TableHead className="text-right">Erros</TableHead>
              <TableHead className="text-right">Importados</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && batches.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  Nenhum lote de importação neste órgão.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(b.created_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell>{moduleById(b.module)?.label ?? b.module}</TableCell>
                <TableCell className="max-w-52 truncate">{b.file_name || "—"}</TableCell>
                <TableCell>{b.source_system || "—"}</TableCell>
                <TableCell className="text-right">{b.total_rows}</TableCell>
                <TableCell className="text-right">{b.valid_rows}</TableCell>
                <TableCell className="text-right">{b.error_rows}</TableCell>
                <TableCell className="text-right">{b.imported_rows}</TableCell>
                <TableCell>
                  <Badge variant={statusTone[b.status] ?? "outline"}>
                    {BATCH_STATUS_LABELS[b.status] ?? b.status}
                  </Badge>
                  {b.annul_reason && <p className="mt-1 text-xs text-muted-foreground">{b.annul_reason}</p>}
                </TableCell>
                <TableCell>
                  {isSuperAdmin && b.status === "concluido" && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setAnnulling(b.id)}>
                      Anular
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <Dialog open={Boolean(annulling)} onOpenChange={(o) => !o && setAnnulling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular lote concluído</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Os registros criados por este lote serão cancelados ou inativados, com registro em auditoria. Nada é
            apagado do banco de dados.
          </p>
          <div>
            <Label htmlFor="annul-reason">Justificativa *</Label>
            <Textarea id="annul-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnulling(null)}>
              Voltar
            </Button>
            <Button variant="destructive" disabled={busy || reason.trim().length < 5} onClick={() => void annul()}>
              {busy ? "Anulando…" : "Anular lote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ----------------------------- saldos de abertura ----------------------------- */

function OpeningBalancesTab({ orgId }: { orgId: string }) {
  const invalidate = useInvalidate();
  const { canManageFinance } = usePerms();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("contrato");
  const [value, setValue] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["opening-balances", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opening_balances")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const paged = usePaged(rows);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const reference = String(form.get("reference") ?? "").trim();
    const baseDate = String(form.get("base_date") ?? "");
    const justification = String(form.get("justification") ?? "").trim();
    if (!reference || !baseDate || justification.length < 10) {
      toast.error("Informe referência, data-base e justificativa (mínimo 10 caracteres).");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("opening_balances").insert({
      organization_id: orgId,
      kind,
      reference_label: reference,
      base_date: baseDate,
      value: value ? parseBRNumber(value) : null,
      quantity: quantity ? parseBRNumber(quantity) : null,
      justification,
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível registrar a posição de abertura.");
      return;
    }
    toast.success("Posição de abertura registrada com data-base e justificativa.");
    setOpen(false);
    setValue("");
    setQuantity("");
    invalidate(["opening-balances"]);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Rotina exclusiva de implantação. Registra a posição de saldos na virada de sistema, com data-base e
            justificativa obrigatórias. Não é uma transação operacional e não substitui contratos, empenhos ou cotas.
          </p>
        </div>
        {canManageFinance && (
          <Button className="gap-2" onClick={() => setOpen(true)}>
            <FileSpreadsheet className="size-4" /> Registrar posição de abertura
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data-base</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Referência</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Quantidade</TableHead>
              <TableHead>Justificativa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhuma posição de abertura registrada.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{new Date(`${r.base_date}T12:00:00`).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{OPENING_BALANCE_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}</TableCell>
                <TableCell>{r.reference_label}</TableCell>
                <TableCell className="text-right">{r.value === null ? "—" : formatBRL(r.value)}</TableCell>
                <TableCell className="text-right">
                  {r.quantity === null ? "—" : formatNumberBR(r.quantity, 4)}
                </TableCell>
                <TableCell className="max-w-80 text-xs text-muted-foreground">{r.justification}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Posição de abertura</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENING_BALANCE_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reference">Referência *</Label>
              <Input id="reference" name="reference" placeholder="Contrato 012/2026, placa ABC1D23…" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="base_date">Data-base *</Label>
                <Input id="base_date" name="base_date" type="date" />
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <MoneyInput value={value} onValueChange={setValue} />
              </div>
              <div>
                <Label>Quantidade / KM</Label>
                <Input
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0,0000"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="justification">Justificativa *</Label>
              <Textarea id="justification" name="justification" rows={3} placeholder="Fundamento da posição de abertura" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const IMPORT_MODULE_COUNT = IMPORT_MODULES.length;

/** Usado também pela documentação de implantação. */
export const useImportModules = () => useMemo(() => IMPORT_MODULES, []);
