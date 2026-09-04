/**
 * FrotaGov — convites de cotação por e-mail.
 *
 * Permite selecionar oficinas e fornecedores já cadastrados (busca por nome,
 * CNPJ e e-mail), acrescentar e-mails avulsos, revisar a lista antes do envio
 * e acompanhar o histórico de cada convite. Todo o disparo acontece no
 * servidor; nenhuma credencial de e-mail trafega para o navegador.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Link2, Mail, Plus, RefreshCw, Send, Settings2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createInvites,
  getEmailProviderStatus,
  issueInviteLink,
  saveEmailSettings,
  sendInvites,
  type InviteTarget,
} from "@/lib/cotacoes-convites.functions";
import { dateTimeBR, dbMessage, supabase, useInvalidate, useSuppliers, useWorkshops } from "@/lib/frotagov";
import { NO_PUBLIC_BASE_MESSAGE, isPublicInviteLink } from "@/lib/link-publico";


type InviteRow = {
  id: string;
  email: string | null;
  contact_name: string | null;
  workshop_id: string | null;
  supplier_id: string | null;
  is_manual: boolean;
  send_status: string;
  status: string;
  attempts: number;
  sent_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  responded_at: string | null;
  token_expires_at: string | null;
  invited_at: string;
  provider: string | null;
  workshop?: { legal_name: string; trade_name: string | null } | null;
};

const SEND_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  enviado: { label: "Enviado", variant: "secondary" },
  erro: { label: "Erro no envio", variant: "destructive" },
  respondido: { label: "Respondido", variant: "default" },
  expirado: { label: "Prazo expirado", variant: "outline" },
};

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** Configuração de envio do órgão (sem segredo: apenas se existe credencial). */
function useEmailSettings() {
  return useQuery({
    queryKey: ["org-email-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("org_email_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Indica se a plataforma já tem chave Resend (painel de Integrações). */
function usePlatformProvider() {
  return useQuery({
    queryKey: ["email-provider-status"],
    queryFn: () => getEmailProviderStatus(),
  });
}

export function ConvitesCotacao({
  quotationId,
  invites,
  canManage,
  canConfigure,
  closed,
  specialty,
}: {
  quotationId: string;
  invites: InviteRow[];
  canManage: boolean;
  canConfigure: boolean;
  closed: boolean;
  specialty: string | null;
}) {
  const invalidate = useInvalidate();
  const { data: settings } = useEmailSettings();
  const { data: platform } = usePlatformProvider();
  const [openInvite, setOpenInvite] = useState(false);
  const [openConfig, setOpenConfig] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasCredential = Boolean(settings?.has_secret) || (settings?.provider === "resend" && Boolean(platform?.platformResend));
  const configured = Boolean(settings?.enabled && settings.provider !== "nenhum" && settings.from_email && hasCredential);

  function refresh() {
    invalidate(["quotations", "quotation-invitations", "quotation-proposals", "proposal-items", "org-email-settings"]);
  }

  async function resend(id: string) {
    if (!configured) {
      toast.error("Envio de e-mail não configurado. Use “Copiar link” para enviar manualmente.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendInvites({ data: { quotationId, invitationIds: [id] } });
      const item = res.results[0];
      if (item?.ok) toast.success("Convite reenviado.");
      else toast.error(item?.error ?? res.message ?? "Falha no reenvio.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no reenvio.");
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function copyLink(id: string) {
    try {
      const { link, isPublic, warning } = await issueInviteLink({ data: { invitationId: id } });
      // Segunda checagem, agora no navegador: link interno nunca vai para a
      // área de transferência.
      if (!isPublic || !link || !isPublicInviteLink(link)) {
        toast.error(warning ?? NO_PUBLIC_BASE_MESSAGE, { duration: 12000 });
        return;
      }
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado. Um novo link foi gerado e o anterior deixou de valer.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o link.");
    }
  }


  async function removeInvite(id: string) {
    const { error } = await supabase.from("quotation_invitations").delete().eq("id", id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-3">
      {!configured && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Envio de e-mail não configurado. Você pode convidar e copiar o link de cada empresa para enviar por outro meio.
          </span>
          {canConfigure && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpenConfig(true)}>
              <Settings2 className="size-3.5" /> Configurar envio
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {invites.length} convite(s) · {invites.filter((i) => i.send_status === "respondido").length} respondido(s)
        </p>
        <div className="flex gap-2">
          {canConfigure && configured && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpenConfig(true)}>
              <Settings2 className="size-3.5" /> Envio de e-mail
            </Button>
          )}
          {canManage && !closed && (
            <Button size="sm" className="gap-1" onClick={() => setOpenInvite(true)}>
              <Send className="size-3.5" /> Enviar convites
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Destinatário</TableHead>
              <TableHead>Histórico</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  Nenhum convite enviado.
                </TableCell>
              </TableRow>
            )}
            {invites.map((i) => {
              // O prazo vencido é mostrado mesmo antes de o convidado abrir o link.
              const expired =
                i.send_status !== "respondido" &&
                Boolean(i.token_expires_at) &&
                new Date(i.token_expires_at!).getTime() < Date.now();
              const key = expired ? "expirado" : i.send_status;
              const st = SEND_STATUS[key] ?? SEND_STATUS["pendente"]!;
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    <span className="block font-medium">
                      {i.workshop?.trade_name || i.workshop?.legal_name || i.contact_name || "Convidado por e-mail"}
                    </span>
                    <span className="block text-xs text-muted-foreground">{i.email ?? "sem e-mail"}</span>
                    {i.is_manual && <Badge variant="outline" className="mt-1 text-[10px]">E-mail avulso</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="block">Criado em {dateTimeBR(i.invited_at)}</span>
                    {i.sent_at && <span className="block">Enviado em {dateTimeBR(i.sent_at)}</span>}
                    {i.responded_at && <span className="block">Respondido em {dateTimeBR(i.responded_at)}</span>}
                    <span className="block">Tentativas: {i.attempts}</span>
                    {i.last_error && <span className="block text-destructive">Último erro: {i.last_error.slice(0, 120)}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && !closed && (
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="outline" size="sm" className="gap-1" disabled={busy} onClick={() => resend(i.id)}>
                          <RefreshCw className="size-3.5" /> Reenviar
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => copyLink(i.id)}>
                          <Link2 className="size-3.5" /> Copiar link
                        </Button>
                        {i.send_status !== "respondido" && (
                          <Button variant="ghost" size="icon" aria-label="Remover convite" onClick={() => removeInvite(i.id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <EnviarConvitesDialog
        open={openInvite}
        onOpenChange={setOpenInvite}
        quotationId={quotationId}
        specialty={specialty}
        alreadyInvited={invites}
        configured={configured}
        onDone={refresh}
      />
      <ConfiguracaoEmailDialog open={openConfig} onOpenChange={setOpenConfig} onDone={refresh} />
    </div>
  );
}

/* ------------------------- diálogo de envio -------------------------- */

type Recipient = InviteTarget & { label: string; detail?: string | null };

function EnviarConvitesDialog({
  open,
  onOpenChange,
  quotationId,
  specialty,
  alreadyInvited,
  configured,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quotationId: string;
  specialty: string | null;
  alreadyInvited: InviteRow[];
  configured: boolean;
  onDone: () => void;
}) {
  const { data: workshops = [] } = useWorkshops();
  const { data: suppliers = [] } = useSuppliers();
  const [search, setSearch] = useState("");
  const [manual, setManual] = useState("");
  const [manualName, setManualName] = useState("");
  const [list, setList] = useState<Recipient[]>([]);
  const [busy, setBusy] = useState(false);

  const invitedEmails = useMemo(
    () => new Set(alreadyInvited.map((i) => (i.email ?? "").toLowerCase()).filter(Boolean)),
    [alreadyInvited],
  );

  const candidates = useMemo<Recipient[]>(() => {
    const term = search.trim().toLowerCase();
    const fromWorkshops: Recipient[] = workshops
      .filter((w) => w.status === "ativo" && w.email)
      .map((w) => ({
        kind: "workshop" as const,
        id: w.id,
        email: String(w.email),
        contactName: w.contact_name ?? null,
        label: w.trade_name || w.legal_name,
        detail: [w.cnpj, w.email, (w.specialties ?? []).join(", ")].filter(Boolean).join(" · "),
      }));
    const fromSuppliers: Recipient[] = suppliers
      .filter((s) => s.email)
      .map((s) => ({
        kind: "supplier" as const,
        id: s.id,
        email: String(s.email),
        contactName: null,
        label: s.trade_name || s.legal_name,
        detail: [s.cnpj, s.email].filter(Boolean).join(" · "),
      }));
    const seen = new Set<string>();
    return [...fromWorkshops, ...fromSuppliers].filter((c) => {
      const key = c.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      if (invitedEmails.has(key)) return false;
      if (list.some((r) => r.email.toLowerCase() === c.email.toLowerCase())) return false;
      if (!term) return true;
      return `${c.label} ${c.detail ?? ""}`.toLowerCase().includes(term);
    });
  }, [workshops, suppliers, search, list, invitedEmails]);

  function addManual() {
    const email = manual.trim().toLowerCase();
    if (!isEmail(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (invitedEmails.has(email) || list.some((r) => r.email.toLowerCase() === email)) {
      toast.error("Este e-mail já está na lista.");
      return;
    }
    // Se o e-mail digitado corresponder a uma empresa cadastrada, o convite já
    // nasce vinculado a ela — sem perder o histórico.
    const workshopMatch = workshops.find((w) => String(w.email ?? "").toLowerCase() === email);
    const supplierMatch = suppliers.find((s) => String(s.email ?? "").toLowerCase() === email);
    const entry: Recipient = workshopMatch
      ? {
          kind: "workshop",
          id: workshopMatch.id,
          email,
          contactName: manualName || workshopMatch.contact_name || null,
          label: workshopMatch.trade_name || workshopMatch.legal_name,
          detail: "Vinculado à empresa cadastrada",
        }
      : supplierMatch
        ? {
            kind: "supplier",
            id: supplierMatch.id,
            email,
            contactName: manualName || null,
            label: supplierMatch.trade_name || supplierMatch.legal_name,
            detail: "Vinculado à empresa cadastrada",
          }
        : { kind: "manual", email, contactName: manualName || null, label: email, detail: "E-mail avulso" };
    setList((prev) => [...prev, entry]);
    setManual("");
    setManualName("");
  }

  async function submit() {
    if (list.length === 0) {
      toast.error("Escolha pelo menos um destinatário.");
      return;
    }
    setBusy(true);
    try {
      const res = await createInvites({
        data: {
          quotationId,
          targets: list.map((r) => ({ kind: r.kind, id: r.id ?? null, email: r.email, contactName: r.contactName ?? null })),
        },
      });
      res.skipped.forEach((s) => toast.error(`${s.email}: ${s.reason}`));
      if (res.created.length === 0) {
        setBusy(false);
        return;
      }
      if (!configured) {
        toast.warning(
          `Convite(s) registrado(s). Envio de e-mail não configurado — copie o link de cada convidado na lista.`,
        );
      } else {
        const send = await sendInvites({ data: { quotationId, invitationIds: res.created.map((c) => c.id) } });
        const ok = send.results.filter((r) => r.ok).length;
        const fail = send.results.length - ok;
        if (ok) toast.success(`${ok} convite(s) enviado(s) individualmente.`);
        if (fail) toast.error(`${fail} convite(s) com erro de envio. Veja o histórico.`);
      }
      setList([]);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar os convites.");
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4" /> Enviar convites da cotação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-2">
            <Label>Empresas cadastradas {specialty ? `(especialidade: ${specialty})` : ""}</Label>
            <Input
              placeholder="Buscar por nome, CNPJ ou e-mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {candidates.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">Nenhuma empresa disponível com e-mail cadastrado.</p>
              )}
              {candidates.map((c) => (
                <label
                  key={`${c.kind}-${c.id}`}
                  className="flex cursor-pointer items-start gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => setList((prev) => [...prev, c])}
                    aria-label={`Adicionar ${c.label}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{c.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="grid items-end gap-2 sm:grid-cols-[2fr_1.5fr_auto]">
            <div>
              <Label htmlFor="manual-email">E-mail avulso (empresa não cadastrada)</Label>
              <Input
                id="manual-email"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="empresa@exemplo.com.br"
              />
            </div>
            <div>
              <Label htmlFor="manual-name">Responsável (opcional)</Label>
              <Input id="manual-name" value={manualName} onChange={(e) => setManualName(e.target.value)} />
            </div>
            <Button type="button" variant="outline" className="gap-1" onClick={addManual}>
              <Plus className="size-4" /> Adicionar
            </Button>
          </section>

          <section className="space-y-2">
            <Label>Lista final ({list.length})</Label>
            <div className="rounded-md border">
              {list.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum destinatário selecionado.</p>}
              {list.map((r, idx) => (
                <div key={`${r.email}-${idx}`} className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.email} · {r.detail}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${r.email}`}
                    onClick={() => setList((prev) => prev.filter((_, n) => n !== idx))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cada empresa recebe uma mensagem individual, com link exclusivo. Ninguém vê os demais convidados.
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || list.length === 0}>
            {busy ? "Processando…" : configured ? "Revisar e enviar" : "Registrar convites (sem envio)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------- configuração do provedor ---------------------- */

function ConfiguracaoEmailDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { data: settings } = useEmailSettings();
  const { data: platform } = usePlatformProvider();
  const [provider, setProvider] = useState<string>("resend");
  const [enabled, setEnabled] = useState(true);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  // A configuração chega depois da primeira renderização: refletir o que está salvo.
  useEffect(() => {
    if (!open) return;
    setProvider(settings?.provider ?? "resend");
    setEnabled(settings?.enabled ?? true);
    setSecret("");
  }, [open, settings?.provider, settings?.enabled]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fromEmail = String(fd.get("fromEmail") ?? "").trim();
    const port = fd.get("smtpPort") ? Number(fd.get("smtpPort")) : null;
    if (provider !== "nenhum") {
      if (!fromEmail) {
        toast.error("Informe o e-mail remetente.");
        return;
      }
      const platformKey = provider === "resend" && Boolean(platform?.platformResend);
      if (!settings?.has_secret && !platformKey && !secret.trim()) {
        toast.error(provider === "smtp" ? "Informe a senha do usuário SMTP." : "Informe a chave de API do provedor.");
        return;
      }
      if (provider === "smtp" && !String(fd.get("smtpHost") ?? "").trim()) {
        toast.error("Informe o servidor SMTP.");
        return;
      }
    }
    setBusy(true);
    try {
      await saveEmailSettings({
        data: {
          provider: provider as "nenhum" | "smtp" | "resend" | "sendgrid",
          enabled,
          fromName: String(fd.get("fromName") ?? ""),
          fromEmail,
          replyTo: String(fd.get("replyTo") ?? ""),
          smtpHost: String(fd.get("smtpHost") ?? ""),
          smtpPort: port,
          // 465 usa TLS direto; 587/25 abrem em texto e sobem para TLS (STARTTLS).
          smtpSecure: port === 465,
          smtpUser: String(fd.get("smtpUser") ?? ""),
          publicBaseUrl: String(fd.get("publicBaseUrl") ?? ""),
          secret: secret.trim() || null,
        },
      });
      toast.success("Configuração de envio salva.");
      setSecret("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Envio de e-mail do órgão</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Provedor</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resend">Resend (recomendado)</SelectItem>
                  <SelectItem value="smtp">Servidor SMTP do órgão</SelectItem>
                  <SelectItem value="sendgrid">SendGrid</SelectItem>
                  <SelectItem value="nenhum">Não utilizar envio automático</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
              <Label htmlFor="enabled">Envio automático ativo</Label>
            </div>
            <div>
              <Label htmlFor="fromName">Nome do remetente</Label>
              <Input id="fromName" name="fromName" defaultValue={settings?.from_name ?? ""} maxLength={80} />
            </div>
            <div>
              <Label htmlFor="fromEmail">E-mail remetente *</Label>
              <Input id="fromEmail" name="fromEmail" type="email" defaultValue={settings?.from_email ?? ""} />
            </div>
            <div>
              <Label htmlFor="replyTo">Responder para</Label>
              <Input id="replyTo" name="replyTo" type="email" defaultValue={settings?.reply_to ?? ""} />
            </div>
            {provider === "smtp" && (
              <>
                <div>
                  <Label htmlFor="smtpHost">Servidor SMTP</Label>
                  <Input id="smtpHost" name="smtpHost" defaultValue={settings?.smtp_host ?? ""} />
                </div>
                <div>
                  <Label htmlFor="smtpPort">Porta</Label>
                  <Input id="smtpPort" name="smtpPort" type="number" defaultValue={settings?.smtp_port ?? 587} />
                </div>
                <div>
                  <Label htmlFor="smtpUser">Usuário</Label>
                  <Input id="smtpUser" name="smtpUser" defaultValue={settings?.smtp_user ?? ""} />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="publicBaseUrl">Endereço público do sistema</Label>
              <Input
                id="publicBaseUrl"
                name="publicBaseUrl"
                defaultValue={settings?.public_base_url ?? ""}
                placeholder="https://frota.seuorgao.gov.br"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                É o endereço usado no link enviado ao fornecedor. Precisa ser um endereço público (ex.:
                https://frota.seuorgao.gov.br). Endereços locais, de rede interna ou de pré-visualização do editor não
                são aceitos, porque exigem login e não abrem para quem está fora do órgão.
              </p>

            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="secret">{provider === "smtp" ? "Senha do usuário SMTP" : "Chave de API do provedor"}</Label>
              <Input
                id="secret"
                type="password"
                autoComplete="new-password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={
                  settings?.has_secret
                    ? "Credencial já cadastrada — preencha só para trocar"
                    : provider === "resend" && platform?.platformResend
                      ? "Chave da plataforma em uso — preencha só para usar uma chave própria"
                      : "Obrigatório"
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                A credencial fica guardada em área restrita do servidor. Ela nunca é exibida, exportada ou devolvida ao
                navegador.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className="gap-1">
              {busy ? "Salvando…" : "Salvar configuração"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ConvitesCotacao;
