import { createFileRoute } from "@tanstack/react-router";
import { SignatureButton } from "@/components/signature-button";
import { useMemo, useState } from "react";
import { Gauge, Plus, Printer } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { parseBRNumber } from "@/lib/format";
import {
  brl,
  dateBR,
  dateTimeBR,
  dbMessage,
  supabase,
  useContracts,
  useInvalidate,
  useOrganization,
  usePerms,
} from "@/lib/frotagov";
import {
  AUTHOR_ROLES,
  IMR_BLOCKS,
  IMR_TEMPLATE,
  OCCURRENCE_KINDS,
  OCCURRENCE_STATUS,
  blockLabel,
  imrBand,
  kindLabel,
  monthStart,
  roleLabel,
  useContractOccurrences,
  useInvoices,
  useServiceLevelIndicators,
  useServiceLevelResults,
  type ServiceLevelIndicator,
} from "@/lib/faturamento";
import { printReport } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/gestao-contrato")({
  head: () => ({
    meta: [
      { title: "Gestão do contrato — FrotaGov" },
      {
        name: "description",
        content:
          "Histórico de ocorrências do contrato, indicadores de nível de serviço (IMR) com nota mensal e relatório final de execução.",
      },
    ],
  }),
  component: GestaoContrato,
});

const NONE = "__none__";

function GestaoContrato() {
  const { data: contracts = [] } = useContracts();
  const { canManageFinance, orgId } = usePerms();
  const [contractId, setContractId] = useState<string>(NONE);
  const contract = contracts.find((c) => c.id === contractId) ?? null;
  const canEdit = canManageFinance && Boolean(orgId);

  return (
    <div>
      <PageHeader
        title="Gestão do contrato"
        description="Acompanhe a execução do contrato: ocorrências e notificações dos fiscais, indicadores de nível de serviço com nota mensal (IMR) e o relatório final."
      />

      <div className="mb-6 max-w-xl space-y-1.5">
        <Label>Contrato</Label>
        <Select value={contractId} onValueChange={setContractId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um contrato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Selecione um contrato</SelectItem>
            {contracts.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.number} —{" "}
                {c.supplier?.trade_name || c.supplier?.legal_name || c.object.slice(0, 50)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!contract ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground shadow-card">
          Escolha um contrato para ver e registrar a gestão dele.
        </div>
      ) : (
        <Tabs defaultValue="ocorrencias" className="space-y-4">
          <TabsList>
            <TabsTrigger value="ocorrencias">Ocorrências</TabsTrigger>
            <TabsTrigger value="imr">Indicadores (IMR)</TabsTrigger>
            <TabsTrigger value="relatorio">Relatório final</TabsTrigger>
          </TabsList>
          <TabsContent value="ocorrencias">
            <Ocorrencias contractId={contract.id} canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="imr">
            <Imr contractId={contract.id} canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="relatorio">
            <RelatorioFinal contract={contract} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* -------------------------------- ocorrências -------------------------------- */

function Ocorrencias({ contractId, canEdit }: { contractId: string; canEdit: boolean }) {
  const { data: rows = [] } = useContractOccurrences(contractId);
  const { orgId, userId, userName } = usePerms();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("ocorrencia");
  const [role, setRole] = useState("fiscal_tecnico");
  const [saving, setSaving] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    const fd = new FormData(e.currentTarget);
    const description = String(fd.get("description") ?? "").trim();
    if (description.length < 5) {
      toast.error("Descreva a ocorrência (mínimo de 5 letras).");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("contract_occurrences").insert({
      organization_id: orgId,
      contract_id: contractId,
      kind,
      author_role: role,
      description,
      deadline_at: String(fd.get("deadline_at") ?? "") || null,
      created_by: userId,
      created_by_name: userName || null,
    });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Ocorrência registrada.");
    invalidate(["contract-occurrences"]);
    setOpen(false);
  }

  async function resolve(status: "atendida" | "encerrada") {
    if (!resolveId) return;
    if (resolution.trim().length < 3) {
      toast.error("Informe como foi resolvida.");
      return;
    }
    const { error } = await supabase
      .from("contract_occurrences")
      .update({
        status,
        resolution: resolution.trim(),
        resolved_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", resolveId);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Ocorrência atualizada.");
    invalidate(["contract-occurrences"]);
    setResolveId(null);
    setResolution("");
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Histórico de gerenciamento</h2>
          <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
            Todas as ocorrências, notificações, advertências e atestos do contrato, com prazo de
            correção e resolução.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="size-4" /> Nova ocorrência
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Registrado por</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Prazo</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                Nenhuma ocorrência registrada neste contrato.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const late = r.status === "aberta" && r.deadline_at && r.deadline_at < today;
            return (
              <TableRow key={r.id}>
                <TableCell>{dateTimeBR(r.occurred_at)}</TableCell>
                <TableCell>{kindLabel(r.kind)}</TableCell>
                <TableCell>
                  {roleLabel(r.author_role)}
                  {r.created_by_name && (
                    <span className="block text-xs text-muted-foreground">{r.created_by_name}</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[340px]">
                  {r.description}
                  {r.resolution && (
                    <span className="block text-xs text-muted-foreground">
                      Resolução: {r.resolution}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {r.deadline_at ? dateBR(r.deadline_at) : "—"}
                  {late && (
                    <span className="block text-xs font-medium text-destructive">vencido</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={r.status === "aberta" ? "default" : "secondary"}>
                    {OCCURRENCE_STATUS[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell className="space-x-1 whitespace-nowrap">
                  <SignatureButton
                    docType="contrato_ocorrencia"
                    docId={r.id}
                    title="este registro"
                    variant="ghost"
                  />
                  {canEdit && r.status === "aberta" && (
                    <Button size="sm" variant="outline" onClick={() => setResolveId(r.id)}>
                      Resolver
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova ocorrência</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCURRENCE_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Registrado como</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTHOR_ROLES.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Descrição *</Label>
              <Textarea id="description" name="description" rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline_at">Prazo para correção</Label>
              <Input id="deadline_at" name="deadline_at" type="date" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                Registrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={resolveId !== null} onOpenChange={(v) => !v && setResolveId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver ocorrência</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="resolution">Como foi resolvida *</Label>
            <Textarea
              id="resolution"
              rows={3}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => resolve("encerrada")}>
              Encerrar sem atendimento
            </Button>
            <Button onClick={() => resolve("atendida")}>Marcar como atendida</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------------- IMR ------------------------------------ */

function Imr({ contractId, canEdit }: { contractId: string; canEdit: boolean }) {
  const { data: indicators = [] } = useServiceLevelIndicators(contractId);
  const { data: results = [] } = useServiceLevelResults(contractId);
  const { orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const [month, setMonth] = useState(monthStart());
  const [editing, setEditing] = useState<ServiceLevelIndicator | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const active = indicators.filter((i) => i.active);
  const monthResults = results.filter((r) => r.reference_month === month);
  const grade = useQuery({
    queryKey: ["imr-final-grade", contractId, month, monthResults.map((r) => r.score).join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("imr_final_grade", {
        _contract: contractId,
        _month: month,
      });
      if (error) throw error;
      return data === null ? null : Number(data);
    },
  });

  const valueOf = (ind: ServiceLevelIndicator) => {
    if (values[ind.id] !== undefined) return values[ind.id] as string;
    const r = monthResults.find((x) => x.indicator_id === ind.id);
    return r ? String(r.measured_value).replace(".", ",") : "";
  };

  async function loadTemplate() {
    if (!orgId) return;
    setBusy(true);
    const { error } = await supabase.from("service_level_indicators").insert(
      IMR_TEMPLATE.map((t) => ({
        ...t,
        organization_id: orgId,
        contract_id: contractId,
        created_by: userId,
      })),
    );
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Indicadores-modelo criados. Ajuste metas e pesos se precisar.");
    invalidate(["service-level-indicators"]);
  }

  async function autoFill(ind: ServiceLevelIndicator) {
    if (ind.auto_metric === "nenhum") return;
    const { data, error } = await supabase.rpc("imr_auto_metric", {
      _metric: ind.auto_metric,
      _month: month,
    });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    if (data === null || data === undefined) {
      toast.info("Não há dados do sistema neste mês para calcular este indicador.");
      return;
    }
    setValues((v) => ({ ...v, [ind.id]: String(data).replace(".", ",") }));
    toast.success("Valor calculado a partir dos dados do sistema. Confira e salve.");
  }

  async function saveResults() {
    if (!orgId) return;
    const rows = active
      .map((ind) => ({ ind, text: valueOf(ind) }))
      .filter((x) => x.text.trim() !== "");
    if (rows.length === 0) {
      toast.error("Informe ao menos um resultado.");
      return;
    }
    setBusy(true);
    const payload = rows.map(({ ind, text }) => ({
      organization_id: orgId,
      contract_id: contractId,
      indicator_id: ind.id,
      reference_month: month,
      measured_value: parseBRNumber(text),
      source:
        ind.auto_metric !== "nenhum" && values[ind.id] !== undefined ? "automatico" : "manual",
      updated_by: userId,
      created_by: userId,
    }));
    const { error } = await supabase
      .from("service_level_results")
      .upsert(payload, { onConflict: "indicator_id,reference_month" });
    setBusy(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Resultados do mês salvos.");
    setValues({});
    invalidate(["service-level-results"]);
  }

  const band = imrBand(grade.data);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Gauge className="size-5" /> Indicadores de nível de serviço
            </h2>
            <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
              Cada indicador tem meta e peso. A nota do mês (0 a 10) é a média ponderada dos
              indicadores dentro de cada bloco e dos blocos entre si.
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              {indicators.length === 0 && (
                <Button variant="outline" onClick={loadTemplate} disabled={busy}>
                  Carregar modelo (IMR do DNIT)
                </Button>
              )}
              <Button onClick={() => setNewOpen(true)} className="gap-2">
                <Plus className="size-4" /> Novo indicador
              </Button>
            </div>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Indicador</TableHead>
              <TableHead>Bloco (peso)</TableHead>
              <TableHead className="text-right">Peso no bloco</TableHead>
              <TableHead className="text-right">Meta</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {indicators.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhum indicador. Use “Carregar modelo” para começar com os indicadores do IMR do
                  DNIT.
                </TableCell>
              </TableRow>
            )}
            {indicators.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.code}</TableCell>
                <TableCell>
                  {i.name}
                  {!i.active && (
                    <Badge variant="outline" className="ml-2">
                      Inativo
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {blockLabel(i.block)} ({Number(i.block_weight)}%)
                </TableCell>
                <TableCell className="text-right">{Number(i.weight_in_block)}%</TableCell>
                <TableCell className="text-right">
                  {i.kind === "ocorrencias_max" ? "0 ocorrências" : `${Number(i.target_value)}%`}
                </TableCell>
                <TableCell>
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
                      Editar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {active.length > 0 && (
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="imr-mes">Mês de apuração</Label>
              <Input
                id="imr-mes"
                type="month"
                value={month.slice(0, 7)}
                onChange={(e) => {
                  if (e.target.value) {
                    setMonth(e.target.value + "-01");
                    setValues({});
                  }
                }}
              />
            </div>
            <div className="rounded-lg border px-4 py-2 text-right">
              <div className="text-xs text-muted-foreground">Nota final do mês</div>
              <div className="text-2xl font-semibold">
                {grade.data == null
                  ? "—"
                  : grade.data.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <Badge
                variant={
                  band.tone === "bad"
                    ? "destructive"
                    : band.tone === "warn"
                      ? "outline"
                      : "secondary"
                }
              >
                {band.label}
              </Badge>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead>
                <TableHead>Meta</TableHead>
                <TableHead className="w-[180px]">Resultado apurado</TableHead>
                <TableHead className="text-right">Nota</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((ind) => {
                const saved = monthResults.find((r) => r.indicator_id === ind.id);
                return (
                  <TableRow key={ind.id}>
                    <TableCell className="font-medium">
                      {ind.code} — {ind.name}
                    </TableCell>
                    <TableCell>
                      {ind.kind === "ocorrencias_max"
                        ? "0 ocorrências"
                        : `${Number(ind.target_value)}%`}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Resultado de ${ind.code}`}
                        inputMode="decimal"
                        placeholder={
                          ind.kind === "ocorrencias_max" ? "Nº de ocorrências" : "% apurado"
                        }
                        value={valueOf(ind)}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [ind.id]: e.target.value.replace(/[^0-9,.]/g, ""),
                          }))
                        }
                        disabled={!canEdit}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {saved
                        ? Number(saved.score).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {canEdit && ind.auto_metric !== "nenhum" && (
                        <Button size="sm" variant="outline" onClick={() => autoFill(ind)}>
                          Calcular pelo sistema
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {canEdit && (
            <div className="mt-3">
              <Button onClick={saveResults} disabled={busy}>
                Salvar resultados do mês
              </Button>
            </div>
          )}
        </div>
      )}

      <IndicatorDialog
        open={newOpen || editing !== null}
        indicator={editing}
        onClose={() => {
          setNewOpen(false);
          setEditing(null);
        }}
        contractId={contractId}
      />
    </div>
  );
}

function IndicatorDialog({
  open,
  indicator,
  onClose,
  contractId,
}: {
  open: boolean;
  indicator: ServiceLevelIndicator | null;
  onClose: () => void;
  contractId: string;
}) {
  const { orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const [block, setBlock] = useState(indicator?.block ?? "manutencao");
  const [kind, setKind] = useState(indicator?.kind ?? "percent_min");
  const [auto, setAuto] = useState(indicator?.auto_metric ?? "nenhum");
  const [active, setActive] = useState(indicator?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") ?? "").trim();
    const name = String(fd.get("name") ?? "").trim();
    if (!code || name.length < 3) {
      toast.error("Informe o código e o nome do indicador.");
      return;
    }
    const payload = {
      code,
      name,
      block,
      block_weight: parseBRNumber(String(fd.get("block_weight") ?? "0")),
      weight_in_block: parseBRNumber(String(fd.get("weight_in_block") ?? "100")),
      target_value:
        kind === "ocorrencias_max" ? 0 : parseBRNumber(String(fd.get("target_value") ?? "0")),
      kind,
      auto_metric: auto,
      active,
      notes: String(fd.get("notes") ?? "").trim() || null,
    };
    setSaving(true);
    const { error } = indicator
      ? await supabase
          .from("service_level_indicators")
          .update({ ...payload, updated_by: userId })
          .eq("id", indicator.id)
      : await supabase.from("service_level_indicators").insert({
          ...payload,
          organization_id: orgId,
          contract_id: contractId,
          created_by: userId,
        });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(indicator ? "Indicador atualizado." : "Indicador criado.");
    invalidate(["service-level-indicators", "imr-final-grade"]);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent key={indicator?.id ?? "novo"}>
        <DialogHeader>
          <DialogTitle>{indicator ? "Editar indicador" : "Novo indicador"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">Código *</Label>
              <Input id="code" name="code" defaultValue={indicator?.code ?? ""} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" name="name" defaultValue={indicator?.name ?? ""} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Bloco</Label>
              <Select value={block} onValueChange={setBlock}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMR_BLOCKS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block_weight">Peso do bloco (%)</Label>
              <Input
                id="block_weight"
                name="block_weight"
                inputMode="decimal"
                defaultValue={String(indicator?.block_weight ?? 0).replace(".", ",")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight_in_block">Peso no bloco (%)</Label>
              <Input
                id="weight_in_block"
                name="weight_in_block"
                inputMode="decimal"
                defaultValue={String(indicator?.weight_in_block ?? 100).replace(".", ",")}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Como medir</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent_min">Percentual mínimo</SelectItem>
                  <SelectItem value="ocorrencias_max">Zero ocorrências</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target_value">Meta (%)</Label>
              <Input
                id="target_value"
                name="target_value"
                inputMode="decimal"
                disabled={kind === "ocorrencias_max"}
                defaultValue={String(indicator?.target_value ?? 90).replace(".", ",")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Apuração pelo sistema</Label>
              <Select value={auto} onValueChange={setAuto}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Manual</SelectItem>
                  <SelectItem value="prazo_cotacao">Prazo de cotação (24 h)</SelectItem>
                  <SelectItem value="cobertura_manutencao">Cobertura da manutenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Como é calculado</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={indicator?.notes ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{" "}
            Indicador ativo
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ relatório final ------------------------------ */

function RelatorioFinal({
  contract,
}: {
  contract: ReturnType<typeof useContracts>["data"] extends (infer T)[] | undefined ? T : never;
}) {
  const { data: invoices = [] } = useInvoices();
  const { data: occurrences = [] } = useContractOccurrences(contract.id);
  const { data: results = [] } = useServiceLevelResults(contract.id);
  const { data: org } = useOrganization();
  const { userName } = usePerms();

  const summary = useMemo(() => {
    const mine = invoices.filter((i) => i.contract_id === contract.id && i.status !== "cancelada");
    const byKind: Record<string, number> = {};
    occurrences.forEach((o) => (byKind[o.kind] = (byKind[o.kind] ?? 0) + 1));
    const months = [...new Set(results.map((r) => r.reference_month))];
    return {
      invoiceCount: mine.length,
      billed: mine.reduce((s, i) => s + Number(i.items_total), 0),
      glosa: mine.reduce((s, i) => s + Number(i.glosa_total), 0),
      fee: mine.reduce((s, i) => s + Number(i.admin_fee_value), 0),
      net: mine.reduce((s, i) => s + Number(i.net_total), 0),
      paid: mine.filter((i) => i.status === "paga").reduce((s, i) => s + Number(i.net_total), 0),
      openOccurrences: occurrences.filter((o) => o.status === "aberta").length,
      byKind,
      monthsMeasured: months.length,
    };
  }, [invoices, occurrences, results, contract.id]);

  function print() {
    const ok = printReport(
      {
        title: `Relatório final de execução — Contrato ${contract.number}`,
        organization: org?.legal_name ?? org?.short_name ?? null,
        subtitle: contract.object,
        period: `Vigência ${contract.valid_from ? dateBR(contract.valid_from) : "—"} a ${contract.valid_to ? dateBR(contract.valid_to) : "—"}`,
        issuedBy: userName,
        filters: [
          {
            label: "Contratada",
            value: contract.supplier?.trade_name || contract.supplier?.legal_name || "—",
          },
          { label: "Valor do contrato", value: brl(Number(contract.current_value)) },
          { label: "Faturas (sem canceladas)", value: String(summary.invoiceCount) },
          { label: "Faturado (bruto)", value: brl(summary.billed) },
          { label: "Glosas", value: brl(summary.glosa) },
          { label: "Taxa de administração", value: brl(summary.fee) },
          { label: "Líquido das faturas", value: brl(summary.net) },
          { label: "Pago", value: brl(summary.paid) },
          { label: "Ocorrências abertas", value: String(summary.openOccurrences) },
        ],
      },
      [
        { key: "date", label: "Data" },
        { key: "kind", label: "Tipo" },
        { key: "role", label: "Registrado como" },
        { key: "description", label: "Descrição" },
        { key: "status", label: "Situação" },
      ],
      occurrences.map((o) => ({
        date: dateBR(o.occurred_at),
        kind: kindLabel(o.kind),
        role: roleLabel(o.author_role),
        description: o.description + (o.resolution ? ` — Resolução: ${o.resolution}` : ""),
        status: OCCURRENCE_STATUS[o.status] ?? o.status,
      })),
    );
    if (!ok) toast.error("Permita a abertura de janelas para imprimir.");
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Relatório final de execução</h2>
          <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
            Resumo do contrato para o atesto: valores faturados, glosas, ocorrências e apurações do
            IMR.
          </p>
        </div>
        <Button variant="outline" onClick={print} className="gap-2">
          <Printer className="size-4" /> Imprimir
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Valor do contrato", brl(Number(contract.current_value))],
          ["Faturado (bruto)", brl(summary.billed)],
          ["Glosas", brl(summary.glosa)],
          ["Líquido das faturas", brl(summary.net)],
          ["Pago", brl(summary.paid)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="mt-0.5 text-lg font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Ocorrências abertas</div>
          <div className="mt-0.5 text-lg font-semibold">{summary.openOccurrences}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Meses apurados no IMR</div>
          <div className="mt-0.5 text-lg font-semibold">{summary.monthsMeasured}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Notificações e advertências</div>
          <div className="mt-0.5 text-lg font-semibold">
            {(summary.byKind["notificacao"] ?? 0) + (summary.byKind["advertencia"] ?? 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
