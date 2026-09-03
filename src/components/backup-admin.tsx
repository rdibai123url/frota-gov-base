/**
 * Bloco D — aba "Backup externo" da Administração da Plataforma.
 * Exclusiva do Super Admin: configuração por órgão, execução manual,
 * histórico com integridade, proteção contra expurgo e restauração assistida.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudUpload, Download, Lock, LockOpen, Play, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/frotagov";
import { useAllOrganizations } from "@/lib/platform";
import {
  saveBackupSettings,
  testBackupDestination,
  runBackupNow,
  verifyBackupIntegrity,
  downloadBackupLink,
  setBackupProtection,
  restoreBackup,
} from "@/lib/backup.functions";

const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Cuiaba", "America/Rio_Branco", "UTC"];

export const BACKUP_STATUS_LABELS: Record<string, string> = {
  agendado: "Agendado",
  em_execucao: "Em execução",
  concluido: "Concluído",
  concluido_com_aviso: "Concluído com aviso",
  falhou: "Falhou",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  concluido: "default",
  concluido_com_aviso: "secondary",
  em_execucao: "outline",
  agendado: "outline",
  falhou: "destructive",
};

const KIND_LABELS: Record<string, string> = {
  automatico: "Automático",
  manual: "Manual",
  teste: "Teste",
  restauracao: "Restauração",
};

function formatBytes(value: number | null) {
  if (!value) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[i]}`;
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`;
}

type SettingsState = {
  enabled: boolean;
  hour: number;
  minute: number;
  timezone: string;
  include_database: boolean;
  include_storage: boolean;
  retention_daily: number;
  retention_weekly: number;
  retention_monthly: number;
  destination_kind: "sftp" | "s3" | "plataforma";
  platform_copy: boolean;
  sftp_host: string;
  sftp_port: number;
  sftp_user: string;
  sftp_base_path: string;
  s3_endpoint: string;
  s3_region: string;
  s3_bucket: string;
  s3_prefix: string;
  credentials_secret_name: string;
  notes: string;
};

const EMPTY: SettingsState = {
  enabled: false,
  hour: 5,
  minute: 0,
  timezone: "America/Sao_Paulo",
  include_database: true,
  include_storage: true,
  retention_daily: 7,
  retention_weekly: 4,
  retention_monthly: 12,
  destination_kind: "plataforma",
  platform_copy: true,
  sftp_host: "",
  sftp_port: 22,
  sftp_user: "",
  sftp_base_path: "/frotagov",
  s3_endpoint: "",
  s3_region: "us-east-1",
  s3_bucket: "",
  s3_prefix: "frotagov",
  credentials_secret_name: "",
  notes: "",
};

export function BackupTab() {
  const qc = useQueryClient();
  const { data: orgs = [] } = useAllOrganizations();
  const [orgId, setOrgId] = useState<string>("");
  const [form, setForm] = useState<SettingsState>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreRun, setRestoreRun] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!orgId && orgs.length) setOrgId(orgs[0]!.id);
  }, [orgs, orgId]);

  const settingsQuery = useQuery({
    queryKey: ["backup-settings", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("backup_settings").select("*").eq("organization_id", orgId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const runsQuery = useQuery({
    queryKey: ["backup-runs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backup_runs")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const s = settingsQuery.data as Partial<SettingsState> | null | undefined;
    setForm(s ? ({ ...EMPTY, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null)) } as SettingsState) : EMPTY);
  }, [settingsQuery.data]);

  const nextRun = useMemo(() => {
    if (!form.enabled) return "Desativado";
    return `Todo dia às ${String(form.hour).padStart(2, "0")}:${String(form.minute).padStart(2, "0")} (${form.timezone})`;
  }, [form.enabled, form.hour, form.minute, form.timezone]);

  const lastOk = (runsQuery.data ?? []).find((r) => r.status === "concluido" || r.status === "concluido_com_aviso");

  function set<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(null);
    }
  }

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["backup-runs", orgId] });
    void qc.invalidateQueries({ queryKey: ["backup-settings", orgId] });
  };

  if (!orgs.length) return <p className="text-muted-foreground">Nenhum órgão cadastrado.</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 space-y-1.5">
          <Label>Órgão</Label>
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={refresh}>
          <RefreshCw className="mr-2 size-4" /> Atualizar
        </Button>
        <Button
          disabled={busy !== null || !orgId}
          onClick={() =>
            withBusy("run", async () => {
              const result = await runBackupNow({ data: { organizationId: orgId } });
              if (result.status === "falhou") toast.error(result.message);
              else toast.success(result.message);
              refresh();
            })
          }
        >
          <Play className="mr-2 size-4" /> Fazer backup agora
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Agendamento</CardTitle></CardHeader>
          <CardContent className="text-sm">{nextRun}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Último backup com sucesso</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {lastOk ? `${formatDateTime(lastOk.finished_at)} · ${formatBytes(lastOk.total_bytes)}` : "Nenhum registro."}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Teste de conexão</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {settingsQuery.data?.last_test_at
              ? `${settingsQuery.data.last_test_ok ? "OK" : "Falhou"} em ${formatDateTime(settingsQuery.data.last_test_at)}`
              : "Nunca testado."}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Configuração do backup externo</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Backup diário automático</p>
              <p className="text-xs text-muted-foreground">Quando ativo, a rotina roda sozinha no horário definido.</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input type="number" min={0} max={23} value={form.hour} onChange={(e) => set("hour", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Minuto</Label>
              <Input type="number" min={0} max={59} value={form.minute} onChange={(e) => set("minute", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Fuso horário</Label>
              <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <Switch checked={form.include_database} onCheckedChange={(v) => set("include_database", v)} />
              Incluir dados do banco (todos os módulos do órgão)
            </label>
            <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <Switch checked={form.include_storage} onCheckedChange={(v) => set("include_storage", v)} />
              Incluir anexos e arquivos privados do órgão
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Manter diários</Label>
              <Input type="number" min={0} max={60} value={form.retention_daily} onChange={(e) => set("retention_daily", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Manter semanais</Label>
              <Input type="number" min={0} max={52} value={form.retention_weekly} onChange={(e) => set("retention_weekly", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Manter mensais</Label>
              <Input type="number" min={0} max={120} value={form.retention_monthly} onChange={(e) => set("retention_monthly", Number(e.target.value))} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Destino</Label>
              <Select value={form.destination_kind} onValueChange={(v) => set("destination_kind", v as SettingsState["destination_kind"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="plataforma">Armazenamento privado da plataforma</SelectItem>
                  <SelectItem value="s3">Armazenamento compatível com S3</SelectItem>
                  <SelectItem value="sftp">Servidor próprio do órgão (SFTP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <Switch checked={form.platform_copy} onCheckedChange={(v) => set("platform_copy", v)} />
              Manter também uma cópia na plataforma
            </label>
          </div>

          {form.destination_kind === "s3" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Endpoint</Label><Input value={form.s3_endpoint} onChange={(e) => set("s3_endpoint", e.target.value)} placeholder="https://s3.sa-east-1.amazonaws.com" /></div>
              <div className="space-y-1.5"><Label>Região</Label><Input value={form.s3_region} onChange={(e) => set("s3_region", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Bucket</Label><Input value={form.s3_bucket} onChange={(e) => set("s3_bucket", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Pasta base</Label><Input value={form.s3_prefix} onChange={(e) => set("s3_prefix", e.target.value)} /></div>
            </div>
          )}

          {form.destination_kind === "sftp" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Host</Label><Input value={form.sftp_host} onChange={(e) => set("sftp_host", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Porta</Label><Input type="number" value={form.sftp_port} onChange={(e) => set("sftp_port", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label>Usuário</Label><Input value={form.sftp_user} onChange={(e) => set("sftp_user", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Pasta base</Label><Input value={form.sftp_base_path} onChange={(e) => set("sftp_base_path", e.target.value)} /></div>
              <p className="sm:col-span-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                O servidor da aplicação não abre conexões SSH. Com destino SFTP, o pacote é gerado e mantido na plataforma
                para coleta pelo agente instalado no servidor do órgão, e a execução é registrada como "concluída com aviso".
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nome do segredo com as credenciais</Label>
            <Input
              value={form.credentials_secret_name}
              onChange={(e) => set("credentials_secret_name", e.target.value)}
              placeholder="BACKUP_CREDENCIAIS_PREFEITURA"
            />
            <p className="text-xs text-muted-foreground">
              As credenciais ficam apenas nos segredos do projeto, em formato JSON. O sistema guarda somente o nome do segredo
              e nunca exibe seu conteúdo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy !== null}
              onClick={() =>
                withBusy("save", async () => {
                  await saveBackupSettings({ data: { organizationId: orgId, ...form } });
                  toast.success("Configuração salva.");
                  refresh();
                })
              }
            >
              <CloudUpload className="mr-2 size-4" /> Salvar configuração
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                withBusy("test", async () => {
                  const result = await testBackupDestination({ data: { organizationId: orgId } });
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.message);
                  refresh();
                })
              }
            >
              <ShieldCheck className="mr-2 size-4" /> Testar conexão
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de execuções</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Início</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Registros</TableHead>
                <TableHead>Integridade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runsQuery.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-muted-foreground">Nenhuma execução registrada.</TableCell></TableRow>
              )}
              {(runsQuery.data ?? []).map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(run.started_at ?? run.created_at)}</TableCell>
                  <TableCell>{KIND_LABELS[run.kind] ?? run.kind}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[run.status] ?? "outline"}>{BACKUP_STATUS_LABELS[run.status] ?? run.status}</Badge>
                    {run.error_summary && <p className="mt-1 max-w-80 text-xs text-muted-foreground">{run.error_summary}</p>}
                  </TableCell>
                  <TableCell>{formatDuration(run.duration_ms)}</TableCell>
                  <TableCell>{formatBytes(run.total_bytes)}</TableCell>
                  <TableCell>{run.record_count?.toLocaleString("pt-BR") ?? "—"}</TableCell>
                  <TableCell>
                    {run.integrity_valid === null ? "—" : run.integrity_valid ? "Verificada" : "Divergente"}
                    {run.is_protected && <Badge variant="outline" className="ml-2">Protegido</Badge>}
                  </TableCell>
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" title="Verificar integridade" disabled={busy !== null}
                      onClick={() => withBusy(run.id, async () => {
                        const result = await verifyBackupIntegrity({ data: { runId: run.id } });
                        if (result.ok) toast.success(result.message); else toast.error(result.message);
                        refresh();
                      })}>
                      <ShieldCheck className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title="Baixar cópia" disabled={busy !== null}
                      onClick={() => withBusy(run.id, async () => {
                        const result = await downloadBackupLink({ data: { runId: run.id } });
                        if (!result.url) { toast.error(result.message); return; }
                        window.open(result.url, "_blank", "noopener");
                      })}>
                      <Download className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" title={run.is_protected ? "Retirar proteção" : "Proteger contra expurgo"} disabled={busy !== null}
                      onClick={() => withBusy(run.id, async () => {
                        if (run.is_protected) {
                          await setBackupProtection({ data: { runId: run.id, protect: false } });
                          toast.success("Proteção retirada.");
                        } else {
                          const reason = window.prompt("Motivo da proteção (mínimo de 10 caracteres):") ?? "";
                          if (reason.trim().length < 10) { toast.error("Motivo obrigatório."); return; }
                          await setBackupProtection({ data: { runId: run.id, protect: true, reason } });
                          toast.success("Backup protegido contra expurgo.");
                        }
                        refresh();
                      })}>
                      {run.is_protected ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" title="Restaurar" disabled={busy !== null || !run.object_key}
                      onClick={() => { setRestoreRun(run.id); setJustification(""); setConfirmation(""); }}>
                      <RotateCcw className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!restoreRun} onOpenChange={(open) => !open && setRestoreRun(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Restauração assistida</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="rounded-md bg-muted/50 p-3 text-muted-foreground">
              A restauração reaplica os dados do pacote sobre o órgão selecionado. Antes de qualquer gravação o sistema gera
              automaticamente um backup de segurança da situação atual. A ação fica registrada com responsável e justificativa.
            </p>
            <div className="space-y-1.5">
              <Label>Justificativa (mínimo de 15 caracteres)</Label>
              <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Digite RESTAURAR para confirmar</Label>
              <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreRun(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={() =>
                withBusy("restore", async () => {
                  const result = await restoreBackup({ data: { runId: restoreRun!, justification, confirmation } });
                  toast.success(result.message);
                  setRestoreRun(null);
                  refresh();
                })
              }
            >
              Restaurar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
