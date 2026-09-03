import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, History, Lock, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase, useActiveOrgId, useInvalidate, usePerms } from "@/lib/frotagov";
import { useTransparencySettings } from "@/lib/platform";
import { formatMoney, formatLiters } from "@/lib/format";
import {
  CHECKLIST_ITEMS,
  MODE_LABELS,
  REQUEST_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  checklistPending,
  competenceLabel,
  lastCompetences,
  useDeliveryAttempts,
  usePeriods,
  usePublications,
  useReopenRequests,
  type Checklist,
  type IntegrationMode,
  type PeriodStatus,
} from "@/lib/transparency";

export const Route = createFileRoute("/_authenticated/transparencia")({
  head: () => ({
    meta: [
      { title: "Portal da Transparência — FrotaGov" },
      {
        name: "description",
        content:
          "Fechamento mensal por competência, publicação versionada, chamados de reabertura e integração com o portal municipal.",
      },
      { property: "og:title", content: "Portal da Transparência — FrotaGov" },
      { property: "og:description", content: "Publicação mensal auditável de dados agregados da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Transparencia,
});

const DATASETS = [
  { key: "frota", label: "Frota (quantidade de veículos por situação)" },
  { key: "abastecimento", label: "Abastecimento (litros e valores agregados)" },
  { key: "manutencao", label: "Manutenção (quantidade e valores agregados)" },
  { key: "contratos", label: "Contratos (número, objeto e vigência)" },
];

const slugify = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

function StatusBadge({ status }: { status: PeriodStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function Transparencia() {
  const perms = usePerms();
  const canManage = perms.roles.includes("org_admin") || perms.roles.includes("super_admin");
  const isSupport = perms.roles.includes("super_admin");

  return (
    <>
      <PageHeader
        title="Portal da Transparência"
        description="Fechamento mensal por competência, publicação versionada e integração configurável com o portal do município."
      />

      {!canManage && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            Somente o Administrador do Órgão pode conferir, fechar competências e alterar a publicação de dados
            abertos. Os demais perfis têm acesso apenas para consulta.
          </p>
        </div>
      )}

      <Tabs defaultValue="publicacao">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="publicacao">Publicação mensal</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="reaberturas">Solicitações de reabertura</TabsTrigger>
          <TabsTrigger value="integracao">Integração externa</TabsTrigger>
        </TabsList>

        <TabsContent value="publicacao">
          <PublicacaoMensal canManage={canManage} />
        </TabsContent>
        <TabsContent value="historico">
          <Historico />
        </TabsContent>
        <TabsContent value="reaberturas">
          <Reaberturas canManage={canManage} isSupport={isSupport} />
        </TabsContent>
        <TabsContent value="integracao">
          <Integracao canManage={canManage} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ============================ PUBLICAÇÃO MENSAL ============================ */

function PublicacaoMensal({ canManage }: { canManage: boolean }) {
  const invalidate = useInvalidate();
  const { data: orgId } = useActiveOrgId();
  const competences = useMemo(() => lastCompetences(24), []);
  const [sel, setSel] = useState(() => {
    const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  });
  const [year, month] = sel.split("-").map(Number) as [number, number];

  const { data: periods = [] } = usePeriods();
  const period = periods.find((p) => p.year === year && p.month === month);
  const status: PeriodStatus = period?.status ?? "aberta";
  const closed = status === "fechada" || status === "erro_integracao";
  const locked = closed || status === "reabertura_solicitada";

  const [checklist, setChecklist] = useState<Checklist>({});
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    setChecklist(((period?.checklist as Checklist) ?? {}) as Checklist);
    setNotes(period?.closing_notes ?? "");
  }, [period?.id, period?.checklist, period?.closing_notes]);

  const pending = checklistPending(checklist);

  async function loadPreview() {
    if (!orgId) return;
    const { data, error } = await supabase.rpc("transparency_snapshot", {
      _org: orgId,
      _year: year,
      _month: month,
    });
    if (!error) setPreview(data as Record<string, any>);
  }

  function setEntry(key: string, patch: Partial<Checklist[string]>) {
    setChecklist((prev) => ({
      ...prev,
      [key]: { status: "pendente", ...prev[key], ...patch, at: new Date().toISOString() },
    }));
  }

  async function saveChecklist() {
    setBusy(true);
    const { error } = await supabase.rpc("save_transparency_checklist", {
      _year: year,
      _month: month,
      _checklist: checklist,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conferência salva.");
    invalidate(["transparency-periods"]);
  }

  async function openConfirm() {
    if (pending.length) {
      toast.error(
        `Checklist incompleto: ${pending.length} item(ns) pendente(s) — ${pending.map((p) => p.label).join("; ")}`,
      );
      return;
    }
    await loadPreview();
    setConfirm(true);
  }

  async function closePeriod() {
    setBusy(true);
    const { error } = await supabase.rpc("close_transparency_period", {
      _year: year,
      _month: month,
      _checklist: checklist,
      _notes: notes || "",
    });
    setBusy(false);
    setConfirm(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Competência ${competenceLabel(year, month)} fechada e publicada.`);
    invalidate(["transparency-periods", "transparency-publications"]);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Competência</Label>
          <Select value={sel} onValueChange={setSel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {competences.map((c) => (
                <SelectItem key={`${c.year}-${c.month}`} value={`${c.year}-${String(c.month).padStart(2, "0")}`}>
                  {competenceLabel(c.year, c.month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Situação</Label>
          <div className="pt-2"><StatusBadge status={status} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>Versão publicada</Label>
          <p className="pt-2 text-sm">
            {period?.current_version ? `Versão ${period.current_version} — ${dt(period.closed_at)}` : "Nenhuma"}
          </p>
        </div>
      </div>

      {locked && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>
            {status === "reabertura_solicitada"
              ? "Existe um chamado de reabertura em análise pelo suporte. A competência segue bloqueada."
              : "Competência fechada. Lançamentos, alterações, cancelamentos e exclusões deste mês estão bloqueados pelo banco de dados. A reabertura só pode ser autorizada pelo suporte da plataforma."}
          </p>
        </div>
      )}

      <div className="rounded-lg border bg-card p-5 shadow-card">
        <h2 className="gov-title text-base">Checklist obrigatório da competência</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Marque cada item como conferido ou como “Não se aplica” com justificativa. O fechamento só é liberado com
          todos os itens resolvidos.
        </p>

        <div className="mt-4 space-y-3">
          {CHECKLIST_ITEMS.map((item) => {
            const entry = checklist[item.key] ?? { status: "pendente" as const };
            return (
              <div key={item.key} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm">{item.label}</span>
                  <Select
                    value={entry.status}
                    onValueChange={(v) => setEntry(item.key, { status: v as "ok" | "na" | "pendente" })}
                    disabled={!canManage || locked}
                  >
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="ok">Conferido</SelectItem>
                      <SelectItem value="na">Não se aplica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {entry.status === "na" && (
                  <Textarea
                    className="mt-2"
                    rows={2}
                    placeholder="Justificativa obrigatória para “Não se aplica”"
                    value={entry.justification ?? ""}
                    onChange={(e) => setEntry(item.key, { justification: e.target.value })}
                    disabled={!canManage || locked}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-1.5">
          <Label>Observações do responsável</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canManage || locked} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={saveChecklist} disabled={!canManage || locked || busy}>
            Salvar conferência
          </Button>
          <Button onClick={openConfirm} disabled={!canManage || locked || busy}>
            <Send className="size-4" /> Fechar mês e enviar ao Portal da Transparência
          </Button>
          {pending.length > 0 && !locked && (
            <p className="flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle className="size-4" /> {pending.length} item(ns) pendente(s)
            </p>
          )}
          {pending.length === 0 && !locked && (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> Checklist completo
            </p>
          )}
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fechar a competência {competenceLabel(year, month)}?</DialogTitle>
            <DialogDescription>
              Confira o que será bloqueado e publicado. Esta ação não pode ser desfeita por usuários do órgão.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <p className="font-medium">Será bloqueado neste mês</p>
              <p className="mt-1">
                Inclusão, alteração, cancelamento e exclusão de abastecimentos, manutenções, utilizações, multas,
                sinistros, obrigações legais e movimentações patrimoniais com data dentro da competência.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-medium">Será publicado (dados agregados, sem dados pessoais)</p>
              {preview ? (
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>Frota: {preview['frota']?.total ?? 0} veículo(s)</li>
                  <li>
                    Abastecimentos: {preview['abastecimento']?.registros ?? 0} registro(s) ·{" "}
                    {formatLiters(preview['abastecimento']?.litros)} L · R${" "}
                    {formatMoney(preview['abastecimento']?.valor_total)}
                  </li>
                  <li>
                    Manutenções: {preview['manutencao']?.registros ?? 0} registro(s) · R${" "}
                    {formatMoney(preview['manutencao']?.valor_total)}
                  </li>
                  <li>Utilizações: {preview['utilizacao']?.registros ?? 0}</li>
                  <li>
                    Contratos vigentes: {preview['contratos']?.vigentes ?? 0} · R${" "}
                    {formatMoney(preview['contratos']?.valor_total)}
                  </li>
                  <li>
                    Multas: {preview['multas']?.registros ?? 0} · Sinistros: {preview['sinistros']?.registros ?? 0} ·
                    Obrigações: {preview['obrigacoes']?.registros ?? 0}
                  </li>
                  <li>Movimentações patrimoniais: {preview['patrimonio']?.movimentacoes ?? 0}</li>
                </ul>
              ) : (
                <p className="mt-2 text-muted-foreground">Calculando resumo...</p>
              )}
            </div>
            <p className="text-muted-foreground">
              A publicação gera a versão {(period?.current_version ?? 0) + 1}. Versões anteriores são preservadas para
              auditoria. Reabertura somente por chamado formal ao suporte da plataforma.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancelar</Button>
            <Button onClick={closePeriod} disabled={busy}>Confirmar fechamento e publicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ HISTÓRICO ============================ */

function Historico() {
  const { data: publications = [] } = usePublications();
  const { data: attempts = [] } = useDeliveryAttempts();

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <div className="flex items-center gap-2 border-b p-4">
          <History className="size-4 text-muted-foreground" />
          <h2 className="gov-title text-base">Publicações por competência (todas as versões preservadas)</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competência</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead>Publicada em</TableHead>
              <TableHead>Situação da versão</TableHead>
              <TableHead>Envio externo</TableHead>
              <TableHead>Resumo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {publications.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhuma competência publicada até o momento.
                </TableCell>
              </TableRow>
            )}
            {publications.map((p: any) => {
              const s = p.snapshot ?? {};
              return (
                <TableRow key={p.id}>
                  <TableCell>{p.period ? competenceLabel(p.period.year, p.period.month) : "—"}</TableCell>
                  <TableCell>Versão {p.version}</TableCell>
                  <TableCell>{dt(p.published_at)}</TableCell>
                  <TableCell>
                    {p.superseded_at ? (
                      <span className="text-xs text-muted-foreground">Substituída em {dt(p.superseded_at)}</span>
                    ) : (
                      <span className="text-xs font-medium text-emerald-700">Vigente</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{p.external_status}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    Frota {s.frota?.total ?? 0} · Abast. {s.abastecimento?.registros ?? 0} · Manut.{" "}
                    {s.manutencao?.registros ?? 0}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <div className="border-b p-4">
          <h2 className="gov-title text-base">Tentativas de envio ao portal do município</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/hora</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Mensagem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attempts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhuma tentativa registrada. Com a integração desativada, a publicação ocorre apenas no Portal
                  FrotaGov.
                </TableCell>
              </TableRow>
            )}
            {attempts.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{dt(a.attempted_at)}</TableCell>
                <TableCell>{a.mode}</TableCell>
                <TableCell className="max-w-xs truncate text-xs">{a.endpoint ?? "—"}</TableCell>
                <TableCell>{a.status}</TableCell>
                <TableCell className="max-w-md truncate text-xs text-muted-foreground">{a.message ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ============================ REABERTURAS ============================ */

function Reaberturas({ canManage, isSupport }: { canManage: boolean; isSupport: boolean }) {
  const invalidate = useInvalidate();
  const { data: periods = [] } = usePeriods();
  const { data: requests = [] } = useReopenRequests();
  const closedPeriods = periods.filter((p) => p.status === "fechada" || p.status === "erro_integracao");

  const [open, setOpen] = useState(false);
  const [periodSel, setPeriodSel] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const p = closedPeriods.find((x) => x.id === periodSel);
    if (!p) {
      toast.error("Selecione a competência fechada.");
      return;
    }
    if (!reason.trim() || !details.trim()) {
      toast.error("Motivo e descrição detalhada são obrigatórios.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("request_transparency_reopen", {
      _year: p.year,
      _month: p.month,
      _reason: reason,
      _details: details,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Chamado de reabertura enviado ao suporte da plataforma.");
    setOpen(false);
    setReason("");
    setDetails("");
    invalidate(["transparency-reopen", "transparency-periods"]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A reabertura de competência fechada depende de chamado formal e autorização do suporte da plataforma.
          Usuários do órgão não podem reabrir, desfazer ou excluir um fechamento.
        </p>
        <Button onClick={() => setOpen(true)} disabled={!canManage || closedPeriods.length === 0}>
          Solicitar reabertura
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Solicitado em</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Parecer do suporte</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhum chamado de reabertura registrado.
                </TableCell>
              </TableRow>
            )}
            {requests.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.protocol ?? "—"}</TableCell>
                <TableCell>{r.period ? competenceLabel(r.period.year, r.period.month) : "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                <TableCell>{dt(r.requested_at)}</TableCell>
                <TableCell>{REQUEST_LABELS[r.status as keyof typeof REQUEST_LABELS]}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                  {r.support_justification ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isSupport && (
        <p className="text-xs text-muted-foreground">
          Como suporte da plataforma, a análise e a efetivação das reaberturas de todos os órgãos ficam em
          Administração da Plataforma → Reaberturas.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar reabertura de competência</DialogTitle>
            <DialogDescription>
              O chamado é analisado pelo suporte da plataforma. Todo o trâmite fica registrado em auditoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Competência fechada</Label>
              <Select value={periodSel} onValueChange={setPeriodSel}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {closedPeriods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{competenceLabel(p.year, p.month)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo *</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: lançamento incorreto de abastecimento" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição detalhada *</Label>
              <Textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={busy}>Enviar chamado</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ INTEGRAÇÃO EXTERNA ============================ */

function Integracao({ canManage }: { canManage: boolean }) {
  const { data: settings } = useTransparencySettings();
  const { data: orgId } = useActiveOrgId();
  const invalidate = useInvalidate();

  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState("");
  const [headline, setHeadline] = useState("");
  const [datasets, setDatasets] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<IntegrationMode>("desativada");
  const [endpoint, setEndpoint] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [secretName, setSecretName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const s = settings as any;
    setEnabled(s.enabled);
    setSlug(s.slug ?? "");
    setHeadline(s.headline ?? "");
    setDatasets((s.datasets as Record<string, boolean>) ?? {});
    setMode((s.integration_mode as IntegrationMode) ?? "desativada");
    setEndpoint(s.integration_endpoint ?? "");
    setAuthHeader(s.integration_auth_header ?? "");
    setSecretName(s.integration_secret_name ?? "");
    setNotes(s.integration_notes ?? "");
  }, [settings]);

  async function save() {
    if (!orgId) return;
    if (enabled && !slug) {
      toast.error("Informe o endereço público (slug) para publicar o portal.");
      return;
    }
    if (mode !== "desativada" && !endpoint.trim() && mode !== "arquivo") {
      toast.error("Informe o endereço (URL) do portal municipal para o modo selecionado.");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("transparency_settings").upsert({
      organization_id: orgId,
      enabled,
      slug: slug || null,
      headline: headline || null,
      datasets,
      integration_mode: mode,
      integration_endpoint: endpoint || null,
      integration_auth_header: authHeader || null,
      integration_secret_name: secretName || null,
      integration_notes: notes || null,
      updated_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar as configurações do portal.");
      return;
    }
    toast.success("Portal da Transparência atualizado.");
    invalidate(["transparency-settings"]);
  }

  const s = settings as any;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="space-y-4 rounded-lg border bg-card p-5 shadow-card">
        <h2 className="gov-title text-base">Portal FrotaGov (publicação própria)</h2>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Publicação ativa</Label>
            <p className="text-xs text-muted-foreground">
              Enquanto desativada, nenhuma informação do órgão fica acessível publicamente.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canManage} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">Endereço público</Label>
          <div className="flex gap-2">
            <Input id="slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="prefeitura-exemplo" disabled={!canManage} />
            {slug && (
              <Button asChild variant="outline" size="icon">
                <a href={`/transparencia/${slug}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">/transparencia/{slug || "seu-endereco"}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="headline">Texto de apresentação</Label>
          <Textarea id="headline" rows={3} value={headline} onChange={(e) => setHeadline(e.target.value)} disabled={!canManage} />
        </div>

        <div className="space-y-2">
          <Label>Conjuntos de dados publicados</Label>
          {DATASETS.map((d) => (
            <div key={d.key} className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">{d.label}</span>
              <Switch
                checked={!!datasets[d.key]}
                onCheckedChange={(v) => setDatasets((prev) => ({ ...prev, [d.key]: v }))}
                disabled={!canManage}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Apenas números agregados são publicados. Placas, nomes de condutores, CPF, CNH e demais dados pessoais
            nunca são expostos.
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-5 shadow-card">
        <h2 className="gov-title text-base">Envio ao Portal da Transparência do município</h2>
        <p className="text-sm text-muted-foreground">
          Configuração por órgão. Com a integração desativada ou não configurada, o fechamento continua publicando
          normalmente no Portal FrotaGov.
        </p>

        <div className="space-y-1.5">
          <Label>Modo de integração</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as IntegrationMode)} disabled={!canManage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(MODE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {mode !== "desativada" && (
          <>
            <div className="space-y-1.5">
              <Label>Endereço (URL) de destino</Label>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://transparencia.municipio.gov.br/api/frota" disabled={!canManage} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Cabeçalho de autenticação</Label>
                <Input value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} placeholder="Authorization" disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <Label>Nome do segredo (credencial)</Label>
                <Input value={secretName} onChange={(e) => setSecretName(e.target.value)} placeholder="PORTAL_MUNICIPIO_TOKEN" disabled={!canManage} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A credencial em si nunca é gravada aqui nem exibida no sistema: informe apenas o nome do segredo, que é
              cadastrado com segurança pelo suporte da plataforma.
            </p>
            <div className="space-y-1.5">
              <Label>Observações do padrão exigido pelo município</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canManage} />
            </div>
          </>
        )}

        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">Status de sincronização</p>
          <p className="mt-1 text-muted-foreground">
            Última tentativa: {dt(s?.last_sync_at)} · Situação: {s?.last_sync_status ?? "sem envios"}
            {s?.last_sync_error ? ` · Erro: ${s.last_sync_error}` : ""}
          </p>
        </div>

        <Button onClick={save} disabled={!canManage || saving}>Salvar configurações</Button>
      </div>
    </div>
  );
}
