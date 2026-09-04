/**
 * Fase 10 — Bloco 5: Central de Integrações.
 * DETRAN, SIAFIC/contabilidade, LDAP/SSO, FIPE, Webhooks e API FrotaGov.
 * Segredos nunca são exibidos: guardamos apenas o nome do segredo do servidor.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Car,
  Landmark,
  KeyRound,
  Coins,
  Webhook as WebhookIcon,
  Plug,
  Plus,
  Pencil,
  Send,
  Download,
  RefreshCw,
} from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { supabase, useInvalidate, useOrganization, usePerms } from "@/lib/frotagov";
import { exportReportCsv } from "@/lib/reports";
import {
  CONNECTOR_META,
  DETRAN_FIELD_MAP,
  SIAFIC_ENTITIES,
  STATUS_LABELS,
  WEBHOOK_EVENTS,
  useConnectors,
  useIntegrationLogs,
  useIntegrationMappings,
  useWebhookDeliveries,
  useWebhookEndpoints,
  type Connector,
  type IntegrationKind,
  type IntegrationMapping,
  type WebhookEndpoint,
} from "@/lib/integracoes";
import { sendWebhookTest, testConnector } from "@/lib/integracoes.functions";

export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () => ({
    meta: [
      { title: "Central de Integrações — FrotaGov" },
      {
        name: "description",
        content:
          "Conectores do órgão para DETRAN, SIAFIC/contabilidade, LDAP/SSO, FIPE, webhooks e API do FrotaGov, com situação, ambiente, testes e histórico técnico.",
      },
      { property: "og:title", content: "Central de Integrações — FrotaGov" },
      {
        property: "og:description",
        content: "Conectores, mapeamentos e webhooks do órgão em uma única área.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Integracoes,
});

const ICONS: Record<IntegrationKind, typeof Car> = {
  detran: Car,
  siafic: Landmark,
  ldap_sso: KeyRound,
  fipe: Coins,
  webhook: WebhookIcon,
  api: Plug,
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ativo: "default",
  configurado: "outline",
  nao_configurado: "secondary",
  desativado: "secondary",
  erro: "destructive",
};

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

/** Entidades do SIAFIC → tabela de origem e coluna de alteração. */
const ENTITY_SOURCE: Record<string, { table: string; changed: string }> = {
  empenhos: { table: "commitments", changed: "updated_at" },
  contratos: { table: "contracts", changed: "updated_at" },
  contratos_itens: { table: "contract_items", changed: "updated_at" },
  centros_de_custo: { table: "cost_centers", changed: "updated_at" },
  dotacoes: { table: "quotas", changed: "updated_at" },
  liquidacoes: { table: "budget_movements", changed: "created_at" },
  pagamentos: { table: "budget_movements", changed: "created_at" },
  veiculos: { table: "vehicles", changed: "updated_at" },
  abastecimentos: { table: "fuelings", changed: "updated_at" },
  manutencoes: { table: "maintenance_records", changed: "updated_at" },
};

function Integracoes() {
  const { canManageUsers, orgId, userId, userName } = usePerms();
  const { data: org } = useOrganization();
  const invalidate = useInvalidate();
  const { data: connectors = [], isLoading } = useConnectors();
  const readOnly = !canManageUsers;

  const [editing, setEditing] = useState<Connector | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const runTest = useServerFn(testConnector);

  async function onSaveConnector(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const form = new FormData(e.currentTarget);
    const meta = CONNECTOR_META[editing.kind];
    const config: Record<string, string> = {};
    for (const f of meta.fields) {
      const v = String(form.get(`cfg_${f.key}`) ?? "").trim();
      if (v) config[f.key] = v;
    }
    const baseUrl = String(form.get("base_url") ?? "").trim();
    const secretName = String(form.get("secret_name") ?? "").trim();
    const enabled = form.get("enabled") === "on";
    const configured = Boolean(baseUrl || Object.keys(config).length);

    setSaving(true);
    const { error } = await supabase
      .from("integration_connectors")
      .update({
        environment: (String(form.get("environment") ?? "homologacao") as Connector["environment"]),
        provider: String(form.get("provider") ?? "").trim() || null,
        base_url: baseUrl || null,
        documentation_url: String(form.get("documentation_url") ?? "").trim() || null,
        notes: String(form.get("notes") ?? "").trim() || null,
        secret_name: secretName || null,
        has_secret: Boolean(secretName),
        config: config as never,
        status: !configured ? "nao_configurado" : enabled ? "ativo" : "configurado",
        updated_by: userId,
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o conector.");
      return;
    }
    toast.success("Conector atualizado.");
    invalidate(["integration-connectors"]);
    setEditing(null);
  }

  async function onTest(c: Connector) {
    setTestingId(c.id);
    try {
      const r = await runTest({ data: { connectorId: c.id } });
      if (r.status === "sucesso") toast.success(r.message);
      else toast.error(r.message);
    } catch {
      toast.error("Não foi possível executar o teste.");
    }
    setTestingId(null);
    invalidate(["integration-connectors"]);
    invalidate(["integration-logs"]);
  }

  return (
    <>
      <PageHeader
        title="Central de Integrações"
        description="Conectores do órgão com sistemas externos. Nenhuma integração é presumida: enquanto não houver credencial e endereço configurados, o conector permanece como “não configurado”. Segredos nunca são exibidos depois de salvos."
      />

      <Tabs defaultValue="conectores" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="conectores">Conectores</TabsTrigger>
          <TabsTrigger value="detran">DETRAN</TabsTrigger>
          <TabsTrigger value="siafic">SIAFIC / Contabilidade</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="logs">Histórico técnico</TabsTrigger>
        </TabsList>

        {/* --------------------------- conectores --------------------------- */}
        <TabsContent value="conectores">
          {isLoading && <p className="text-muted-foreground">Carregando…</p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {connectors.map((c) => {
              const meta = CONNECTOR_META[c.kind];
              const Icon = ICONS[c.kind];
              return (
                <Card key={c.id} className="flex flex-col">
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="size-4" /> {meta.label}
                      </CardTitle>
                      <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>
                        {STATUS_LABELS[c.status]}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{meta.description}</p>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                      <span>Ambiente</span>
                      <span className="text-right text-foreground">
                        {c.environment === "producao" ? "Produção" : "Homologação"}
                      </span>
                      <span>Última sincronização</span>
                      <span className="text-right text-foreground">{dt(c.last_sync_at)}</span>
                      <span>Última tentativa</span>
                      <span className="text-right text-foreground">{dt(c.last_attempt_at)}</span>
                      <span>Segredo</span>
                      <span className="text-right text-foreground">
                        {c.has_secret ? "Cadastrado (oculto)" : "Não informado"}
                      </span>
                    </div>
                    {c.last_result && (
                      <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{c.last_result}</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" disabled={readOnly} onClick={() => setEditing(c)}>
                        <Pencil className="size-4" /> Configurar
                      </Button>
                      {meta.testable && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={readOnly || c.status === "nao_configurado" || testingId === c.id}
                          onClick={() => onTest(c)}
                        >
                          <RefreshCw className="size-4" />
                          {testingId === c.id ? "Testando…" : "Testar conexão"}
                        </Button>
                      )}
                      {c.documentation_url && (
                        <a
                          className="text-sm underline underline-offset-4"
                          href={c.documentation_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Documentação
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ----------------------------- DETRAN ----------------------------- */}
        <TabsContent value="detran" className="space-y-4">
          <DetranPanel connector={connectors.find((c) => c.kind === "detran")} />
        </TabsContent>

        {/* ----------------------------- SIAFIC ----------------------------- */}
        <TabsContent value="siafic" className="space-y-4">
          <SiaficPanel
            connector={connectors.find((c) => c.kind === "siafic")}
            readOnly={readOnly}
            orgId={orgId}
            userId={userId}
            orgName={org?.legal_name ?? null}
            userName={userName}
          />
        </TabsContent>

        {/* ---------------------------- webhooks ---------------------------- */}
        <TabsContent value="webhooks" className="space-y-4">
          <WebhooksPanel readOnly={readOnly} orgId={orgId} userId={userId} />
        </TabsContent>

        {/* ------------------------------ logs ------------------------------ */}
        <TabsContent value="logs">
          <LogsPanel />
        </TabsContent>
      </Tabs>

      {/* ------------------------ diálogo do conector ------------------------ */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Configurar {CONNECTOR_META[editing.kind].label}</DialogTitle>
                <DialogDescription>
                  Informe apenas o <strong>nome</strong> do segredo cadastrado no servidor. O FrotaGov nunca
                  armazena nem exibe o valor do segredo.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={onSaveConnector} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Ambiente</Label>
                    <Select name="environment" defaultValue={editing.environment}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="homologacao">Homologação</SelectItem>
                        <SelectItem value="producao">Produção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="provider">Fornecedor / provedor</Label>
                    <Input id="provider" name="provider" defaultValue={editing.provider ?? ""} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="base_url">Endereço do serviço (URL)</Label>
                    <Input
                      id="base_url"
                      name="base_url"
                      type="url"
                      placeholder="https://…"
                      defaultValue={editing.base_url ?? ""}
                    />
                  </div>
                  {CONNECTOR_META[editing.kind].fields.map((f) => (
                    <div key={f.key}>
                      <Label htmlFor={`cfg_${f.key}`}>{f.label}</Label>
                      <Input
                        id={`cfg_${f.key}`}
                        name={`cfg_${f.key}`}
                        placeholder={f.placeholder}
                        defaultValue={String((editing.config as Record<string, unknown>)?.[f.key] ?? "")}
                      />
                    </div>
                  ))}
                  <div>
                    <Label htmlFor="secret_name">Nome do segredo no servidor</Label>
                    <Input
                      id="secret_name"
                      name="secret_name"
                      placeholder={CONNECTOR_META[editing.kind].secretLabel ?? "NOME_DO_SEGREDO"}
                      defaultValue={editing.secret_name ?? ""}
                    />
                  </div>
                  <div>
                    <Label htmlFor="documentation_url">Documentação</Label>
                    <Input
                      id="documentation_url"
                      name="documentation_url"
                      type="url"
                      defaultValue={editing.documentation_url ?? ""}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea id="notes" name="notes" rows={2} defaultValue={editing.notes ?? ""} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="enabled" name="enabled" defaultChecked={editing.status === "ativo"} />
                  <Label htmlFor="enabled">Integração ativa</Label>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Salvando…" : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------- DETRAN --------------------------------- */

function DetranPanel({ connector }: { connector?: Connector }) {
  const configured = connector && connector.status !== "nao_configurado";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mapeamento de campos do DETRAN</CardTitle>
        <p className="text-sm text-muted-foreground">
          {configured
            ? "Conector configurado. A ação “Consultar DETRAN” fica disponível na ficha do veículo; divergências exigem confirmação e nada é sobrescrito automaticamente."
            : "Integração não configurada. O mapeamento abaixo já está pronto; a consulta só será habilitada após o convênio e as credenciais do DETRAN estadual serem informados."}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campo do DETRAN</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Campo no FrotaGov</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DETRAN_FIELD_MAP.map((f) => (
                <TableRow key={f.detran}>
                  <TableCell className="font-mono text-xs">{f.detran}</TableCell>
                  <TableCell>{f.label}</TableCell>
                  <TableCell>
                    {f.vehicle ? (
                      <span className="font-mono text-xs">{f.vehicle}</span>
                    ) : (
                      <Badge variant="outline">Guardado no histórico da consulta</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------- SIAFIC -------------------------------- */

function SiaficPanel({
  connector,
  readOnly,
  orgId,
  userId,
  orgName,
  userName,
}: {
  connector?: Connector;
  readOnly: boolean;
  orgId: string | null;
  userId: string | null;
  orgName: string | null;
  userName: string;
}) {
  const { data: mappings = [] } = useIntegrationMappings();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IntegrationMapping | null>(null);
  const [entity, setEntity] = useState<string>("empenhos");
  const [format, setFormat] = useState("csv");
  const [incremental, setIncremental] = useState(true);
  const [busy, setBusy] = useState(false);

  function openNew() {
    setEditing(null);
    setEntity("empenhos");
    setFormat("csv");
    setIncremental(true);
    setOpen(true);
  }

  function openEdit(m: IntegrationMapping) {
    setEditing(m);
    setEntity(m.entity);
    setFormat(m.format);
    setIncremental(m.incremental);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      toast.error("Informe o nome do layout.");
      return;
    }
    let fieldMap: unknown = [];
    const raw = String(form.get("field_map") ?? "").trim();
    if (raw) {
      try {
        fieldMap = JSON.parse(raw);
      } catch {
        toast.error("O mapeamento de campos deve ser um JSON válido.");
        return;
      }
    }
    setBusy(true);
    const payload = {
      name,
      entity,
      format,
      incremental,
      direction: String(form.get("direction") ?? "exportacao"),
      delimiter: String(form.get("delimiter") ?? ";") || ";",
      field_map: fieldMap as never,
      notes: String(form.get("notes") ?? "").trim() || null,
    };
    const { error } = editing
      ? await supabase.from("integration_mappings").update(payload).eq("id", editing.id)
      : await supabase.from("integration_mappings").insert({
          ...payload,
          organization_id: orgId!,
          connector_id: connector?.id ?? null,
          created_by: userId,
        });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível salvar o layout.");
      return;
    }
    toast.success("Layout salvo.");
    invalidate(["integration-mappings"]);
    setOpen(false);
  }

  /** Exportação incremental: apenas registros alterados desde a última remessa. */
  async function onExport(m: IntegrationMapping) {
    const src = ENTITY_SOURCE[m.entity];
    if (!src) {
      toast.error("Entidade sem origem de dados mapeada.");
      return;
    }
    setBusy(true);
    let q = supabase.from(src.table as never).select("*").limit(20000);
    if (m.incremental && m.last_exported_at) q = (q as never as typeof q).gte(src.changed, m.last_exported_at);
    const { data, error } = await q;
    if (error) {
      setBusy(false);
      toast.error("Não foi possível gerar a remessa.");
      await supabase.from("integration_logs").insert({
        organization_id: orgId!,
        connector_id: connector?.id ?? null,
        kind: "siafic",
        operation: `exportacao_${m.entity}`,
        status: "erro",
        message: error.message,
        created_by: userId,
      });
      invalidate(["integration-logs"]);
      return;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const map = Array.isArray(m.field_map) ? (m.field_map as { origem: string; destino: string }[]) : [];
    const columns = map.length
      ? map.map((f) => ({ key: f.origem, label: f.destino || f.origem }))
      : Object.keys(rows[0] ?? { id: "" }).map((k) => ({ key: k, label: k }));

    if (m.format === "json") {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `siafic_${m.entity}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      exportReportCsv(`siafic_${m.entity}`, columns, rows, {
        title: `Remessa SIAFIC — ${m.entity}`,
        organization: orgName,
        issuedBy: userName,
        period: m.incremental && m.last_exported_at ? `Alterados desde ${dt(m.last_exported_at)}` : "Base completa",
      });
    }

    const now = new Date().toISOString();
    await supabase.from("integration_mappings").update({ last_exported_at: now }).eq("id", m.id);
    await supabase.from("integration_logs").insert({
      organization_id: orgId!,
      connector_id: connector?.id ?? null,
      kind: "siafic",
      operation: `exportacao_${m.entity}`,
      status: "sucesso",
      message: `Remessa gerada com ${rows.length} registro(s).`,
      records_total: rows.length,
      records_ok: rows.length,
      created_by: userId,
    });
    setBusy(false);
    toast.success(`Remessa gerada com ${rows.length} registro(s).`);
    invalidate(["integration-mappings"]);
    invalidate(["integration-logs"]);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Layouts e remessas contábeis</CardTitle>
          <p className="text-sm text-muted-foreground">
            Layouts configuráveis por entidade e formato, com exportação incremental (“alterados desde”) e
            registro de cada remessa. Independente de fornecedor.
          </p>
        </div>
        <Button size="sm" onClick={openNew} disabled={readOnly}>
          <Plus className="size-4" /> Novo layout
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Layout</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Formato</TableHead>
                <TableHead>Sentido</TableHead>
                <TableHead>Incremental</TableHead>
                <TableHead>Última remessa</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nenhum layout cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.entity}</TableCell>
                  <TableCell className="uppercase">{m.format}</TableCell>
                  <TableCell>{m.direction === "importacao" ? "Importação" : "Exportação"}</TableCell>
                  <TableCell>{m.incremental ? "Sim" : "Não"}</TableCell>
                  <TableCell>{dt(m.last_exported_at)}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(m)} disabled={readOnly} aria-label="Editar">
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onExport(m)}
                      disabled={readOnly || busy || m.direction === "importacao"}
                      aria-label="Gerar remessa"
                    >
                      <Download className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar layout" : "Novo layout contábil"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Nome do layout *</Label>
                <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
              </div>
              <div>
                <Label>Entidade</Label>
                <Select value={entity} onValueChange={setEntity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIAFIC_ENTITIES.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Formato</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sentido</Label>
                <Select name="direction" defaultValue={editing?.direction ?? "exportacao"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exportacao">Exportação</SelectItem>
                    <SelectItem value="importacao">Importação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="delimiter">Delimitador (CSV)</Label>
                <Input id="delimiter" name="delimiter" maxLength={1} defaultValue={editing?.delimiter ?? ";"} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="field_map">Mapeamento de campos (JSON)</Label>
                <Textarea
                  id="field_map"
                  name="field_map"
                  rows={4}
                  placeholder='[{"origem":"number","destino":"NUM_EMPENHO"}]'
                  defaultValue={editing ? JSON.stringify(editing.field_map ?? [], null, 0) : ""}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="incremental" checked={incremental} onCheckedChange={setIncremental} />
              <Label htmlFor="incremental">Exportar somente registros alterados desde a última remessa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------- webhooks -------------------------------- */

function WebhooksPanel({
  readOnly,
  orgId,
  userId,
}: {
  readOnly: boolean;
  orgId: string | null;
  userId: string | null;
}) {
  const { data: endpoints = [] } = useWebhookEndpoints();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: deliveries = [] } = useWebhookDeliveries(selected);
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const send = useServerFn(sendWebhookTest);

  function openNew() {
    setEditing(null);
    setEvents([]);
    setActive(true);
    setOpen(true);
  }

  function openEdit(w: WebhookEndpoint) {
    setEditing(w);
    setEvents(w.events ?? []);
    setActive(w.active);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const url = String(form.get("url") ?? "").trim();
    if (!url.startsWith("https://")) {
      toast.error("Informe uma URL https válida.");
      return;
    }
    if (events.length === 0) {
      toast.error("Selecione ao menos um evento.");
      return;
    }
    const secretName = String(form.get("secret_name") ?? "").trim();
    setBusy(true);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      url,
      events,
      active,
      secret_name: secretName || null,
      has_secret: Boolean(secretName),
      max_retries: Number(form.get("max_retries") ?? 5) || 5,
      description: String(form.get("description") ?? "").trim() || null,
    };
    const { error } = editing
      ? await supabase.from("webhook_endpoints").update(payload).eq("id", editing.id)
      : await supabase
          .from("webhook_endpoints")
          .insert({ ...payload, organization_id: orgId!, created_by: userId });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível salvar o endpoint.");
      return;
    }
    toast.success("Endpoint salvo.");
    invalidate(["webhook-endpoints"]);
    setOpen(false);
  }

  async function onTest(w: WebhookEndpoint) {
    setBusy(true);
    try {
      const r = await send({ data: { endpointId: w.id } });
      if (r.status === "entregue") toast.success("Evento de teste entregue.");
      else toast.error(`Falha na entrega: ${r.errorMessage ?? "sem resposta"}`);
      if (r.warning) toast.warning(r.warning);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o teste.");
    }
    setBusy(false);
    setSelected(w.id);
    invalidate(["webhook-endpoints"]);
    invalidate(["webhook-deliveries"]);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Endpoints do órgão</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cada entrega é assinada com HMAC-SHA256 no cabeçalho <code>x-frotagov-signature</code>. Endpoints
              podem ser desativados sem apagar o histórico.
            </p>
          </div>
          <Button size="sm" onClick={openNew} disabled={readOnly}>
            <Plus className="size-4" /> Novo endpoint
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Segredo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Última entrega</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum endpoint cadastrado.
                    </TableCell>
                  </TableRow>
                )}
                {endpoints.map((w) => (
                  <TableRow key={w.id} className={selected === w.id ? "bg-muted/50" : undefined}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-xs">{w.url}</TableCell>
                    <TableCell>{w.events?.length ?? 0}</TableCell>
                    <TableCell>{w.has_secret ? "Cadastrado (oculto)" : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={w.active ? "default" : "secondary"}>{w.active ? "Ativo" : "Inativo"}</Badge>
                    </TableCell>
                    <TableCell>{dt(w.last_delivery_at)}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(w)} disabled={readOnly} aria-label="Editar">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onTest(w)}
                        disabled={readOnly || busy || !w.active}
                        aria-label="Enviar teste"
                      >
                        <Send className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(w.id)}>
                        Histórico
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de entregas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Tentativa</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        Sem entregas registradas.
                      </TableCell>
                    </TableRow>
                  )}
                  {deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{dt(d.created_at)}</TableCell>
                      <TableCell>{d.event}</TableCell>
                      <TableCell>{d.attempt}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === "entregue" ? "default" : d.status === "pendente" ? "outline" : "destructive"}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{d.response_status ?? "—"}</TableCell>
                      <TableCell className="max-w-72 truncate">{d.error_message ?? d.response_body ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar endpoint" : "Novo endpoint de webhook"}</DialogTitle>
            <DialogDescription>
              Informe o nome do segredo cadastrado no servidor; o valor nunca é exibido nem trafega para o
              navegador.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
              </div>
              <div>
                <Label htmlFor="max_retries">Tentativas máximas</Label>
                <Input
                  id="max_retries"
                  name="max_retries"
                  type="number"
                  min={0}
                  max={20}
                  defaultValue={editing?.max_retries ?? 5}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="url">URL (https) *</Label>
                <Input id="url" name="url" type="url" defaultValue={editing?.url ?? ""} required />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="secret_name">Nome do segredo (HMAC)</Label>
                <Input id="secret_name" name="secret_name" defaultValue={editing?.secret_name ?? ""} placeholder="WEBHOOK_ORGAO_SECRET" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea id="description" name="description" rows={2} defaultValue={editing?.description ?? ""} />
              </div>
            </div>
            <div>
              <Label>Eventos *</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={events.includes(ev.value)}
                      onCheckedChange={(c) =>
                        setEvents((prev) => (c ? [...prev, ev.value] : prev.filter((x) => x !== ev.value)))
                      }
                    />
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="wactive" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="wactive">Ativo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --------------------------------- logs ---------------------------------- */

function LogsPanel() {
  const [kind, setKind] = useState<string>("todos");
  const { data: logs = [] } = useIntegrationLogs(kind === "todos" ? null : (kind as IntegrationKind));
  const kinds = useMemo(() => Object.keys(CONNECTOR_META) as IntegrationKind[], []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Histórico técnico de integrações</CardTitle>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os conectores</SelectItem>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {CONNECTOR_META[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Conector</TableHead>
                <TableHead>Operação</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Registros</TableHead>
                <TableHead>Mensagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhum registro técnico.
                  </TableCell>
                </TableRow>
              )}
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{dt(l.created_at)}</TableCell>
                  <TableCell>{CONNECTOR_META[l.kind]?.label ?? l.kind}</TableCell>
                  <TableCell>{l.operation}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "sucesso" ? "default" : l.status === "parcial" ? "outline" : "destructive"}>
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {l.records_ok}/{l.records_total}
                    {l.records_error ? ` (${l.records_error} com erro)` : ""}
                  </TableCell>
                  <TableCell className="max-w-96 truncate">{l.message ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
