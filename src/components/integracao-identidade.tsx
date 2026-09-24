/**
 * Rodada 2 — Etapa 4: painéis de identidade corporativa (SSO e LDAP) e
 * histórico de acessos, dentro da Central de Integrações.
 *
 * Nenhum segredo é exibido ou salvo pelo navegador: guardamos apenas o NOME
 * do segredo cadastrado no servidor.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, ShieldCheck, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

import { supabase, useInvalidate, usePerms } from "@/lib/frotagov";
import { exportReportCsv } from "@/lib/reports";
import { STATUS_LABELS } from "@/lib/integracoes";
import {
  LOGIN_METHOD_LABEL,
  NO_CREDENTIALS_NOTICE,
  PROTOCOL_LABEL,
  useLdapDirectories,
  useLoginEvents,
  useSsoProviders,
  type LdapDirectory,
  type SsoProvider,
} from "@/lib/identidade";
import { testLdapDirectory, testSsoProvider } from "@/lib/identidade.functions";

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

/* ------------------------------- SSO ------------------------------------ */

export function SsoPanel() {
  const { canManageUsers, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const { data: providers = [], isLoading } = useSsoProviders();
  const [editing, setEditing] = useState<Partial<SsoProvider> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const runTest = useServerFn(testSsoProvider);

  async function test(id: string) {
    setBusy(id);
    try {
      const r = await runTest({ data: { providerId: id } });
      (r.ok ? toast.success : toast.error)(r.message);
      invalidate(["sso_providers", "integration_logs"]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no teste.");
    } finally {
      setBusy(null);
    }
  }

  async function save(form: Partial<SsoProvider>) {
    const payload = {
      organization_id: orgId!,
      display_name: form.display_name ?? "",
      protocol: form.protocol ?? "oidc",
      issuer: form.issuer || null,
      metadata_url: form.metadata_url || null,
      client_id: form.client_id || null,
      redirect_uri: form.redirect_uri || null,
      secret_name: form.secret_name || null,
      has_secret: Boolean(form.secret_name),
      allowed_domains: form.allowed_domains ?? [],
      scopes: form.scopes?.length ? form.scopes : ["openid", "email", "profile"],
      default_role: form.default_role ?? "operator",
      jit_provisioning: form.jit_provisioning ?? true,
      active: form.active ?? false,
      notes: form.notes || null,
      updated_by: userId,
    };
    const q = form.id
      ? supabase.from("sso_providers").update(payload).eq("id", form.id)
      : supabase.from("sso_providers").insert({ ...payload, created_by: userId });
    const { error } = await q;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Provedor salvo.");
    setEditing(null);
    invalidate(["sso_providers"]);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Login institucional (OIDC / SAML)</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            O login por e-mail e senha do FrotaGov continua sempre disponível. Sem credenciais
            cadastradas no servidor, o provedor fica desativado: {NO_CREDENTIALS_NOTICE}
          </p>
        </div>
        {canManageUsers && (
          <Button onClick={() => setEditing({ protocol: "oidc", active: false })}>
            <Plus className="mr-2 h-4 w-4" />
            Novo provedor
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provedor</TableHead>
              <TableHead>Protocolo</TableHead>
              <TableHead>Domínios</TableHead>
              <TableHead>Segredo</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Carregando…</TableCell>
              </TableRow>
            )}
            {!isLoading && providers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Nenhum provedor cadastrado.
                </TableCell>
              </TableRow>
            )}
            {providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.display_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.issuer ?? p.metadata_url ?? "—"}
                  </div>
                </TableCell>
                <TableCell>{PROTOCOL_LABEL[p.protocol] ?? p.protocol}</TableCell>
                <TableCell className="text-sm">
                  {(p.allowed_domains ?? []).join(", ") || "Todos"}
                </TableCell>
                <TableCell>
                  <Badge variant={p.has_secret ? "default" : "secondary"}>
                    {p.has_secret ? p.secret_name : "Não cadastrado"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      p.status === "ativo"
                        ? "default"
                        : p.status === "erro"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {STATUS_LABELS[p.status]}
                  </Badge>
                  <div className="text-xs text-muted-foreground">{dt(p.last_test_at)}</div>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  {canManageUsers && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void test(p.id)}
                        disabled={busy === p.id}
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Testar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {editing && <SsoDialog value={editing} onClose={() => setEditing(null)} onSave={save} />}
    </Card>
  );
}

function SsoDialog({
  value,
  onClose,
  onSave,
}: {
  value: Partial<SsoProvider>;
  onClose: () => void;
  onSave: (v: Partial<SsoProvider>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<SsoProvider>>(value);
  const set = (patch: Partial<SsoProvider>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Editar provedor" : "Novo provedor de login institucional"}
          </DialogTitle>
          <DialogDescription>
            Informe apenas o nome do segredo cadastrado no servidor. A senha/segredo nunca é
            digitada nesta tela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome exibido no login</Label>
            <Input
              value={form.display_name ?? ""}
              onChange={(e) => set({ display_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Protocolo</Label>
            <Select value={form.protocol ?? "oidc"} onValueChange={(v) => set({ protocol: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oidc">OpenID Connect (OIDC)</SelectItem>
                <SelectItem value="saml">SAML 2.0</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.protocol === "saml" ? (
            <div className="space-y-1">
              <Label>URL de metadados do provedor</Label>
              <Input
                value={form.metadata_url ?? ""}
                onChange={(e) => set({ metadata_url: e.target.value })}
              />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label>Issuer (URL base de descoberta)</Label>
                <Input
                  value={form.issuer ?? ""}
                  onChange={(e) => set({ issuer: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Client ID</Label>
                <Input
                  value={form.client_id ?? ""}
                  onChange={(e) => set({ client_id: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>Nome do segredo no servidor</Label>
            <Input
              placeholder="SSO_CLIENT_SECRET"
              value={form.secret_name ?? ""}
              onChange={(e) => set({ secret_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Domínios de e-mail aceitos (separados por vírgula)</Label>
            <Input
              value={(form.allowed_domains ?? []).join(", ")}
              onChange={(e) =>
                set({
                  allowed_domains: e.target.value
                    .split(",")
                    .map((d) => d.trim().replace(/^@/, ""))
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Criar usuário no primeiro acesso</div>
              <div className="text-xs text-muted-foreground">
                Perfil inicial: operador, ajustável depois.
              </div>
            </div>
            <Switch
              checked={form.jit_provisioning ?? true}
              onCheckedChange={(v) => set({ jit_provisioning: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Ativo no login</div>
              <div className="text-xs text-muted-foreground">
                Só ative após um teste bem-sucedido.
              </div>
            </div>
            <Switch checked={form.active ?? false} onCheckedChange={(v) => set({ active: v })} />
          </div>
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void onSave(form)} disabled={!form.display_name}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- LDAP ----------------------------------- */

export function LdapPanel() {
  const { canManageUsers, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const { data: dirs = [], isLoading } = useLdapDirectories();
  const [editing, setEditing] = useState<Partial<LdapDirectory> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const runTest = useServerFn(testLdapDirectory);

  async function test(id: string) {
    setBusy(id);
    try {
      const r = await runTest({ data: { directoryId: id } });
      (r.ok ? toast.success : toast.error)(r.message);
      invalidate(["ldap_directories", "integration_logs"]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no teste.");
    } finally {
      setBusy(null);
    }
  }

  async function save(form: Partial<LdapDirectory>) {
    const payload = {
      organization_id: orgId!,
      display_name: form.display_name ?? "",
      connectivity_mode: "gateway",
      gateway_url: form.gateway_url || null,
      host: form.host || null,
      port: form.port ?? 636,
      use_tls: form.use_tls ?? true,
      base_dn: form.base_dn || null,
      bind_dn: form.bind_dn || null,
      secret_name: form.secret_name || null,
      has_secret: Boolean(form.secret_name),
      user_filter: form.user_filter || "(objectClass=person)",
      login_attribute: form.login_attribute || "sAMAccountName",
      email_attribute: form.email_attribute || "mail",
      name_attribute: form.name_attribute || "displayName",
      group_attribute: form.group_attribute || "memberOf",
      sync_enabled: form.sync_enabled ?? false,
      active: form.active ?? false,
      notes: form.notes || null,
      updated_by: userId,
    };
    const q = form.id
      ? supabase.from("ldap_directories").update(payload).eq("id", form.id)
      : supabase.from("ldap_directories").insert({ ...payload, created_by: userId });
    const { error } = await q;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Diretório salvo.");
    setEditing(null);
    invalidate(["ldap_directories"]);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Diretório corporativo (LDAP / Active Directory)</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            O acesso ao diretório é feito por um gateway seguro publicado pelo órgão. Sem credencial
            cadastrada no servidor, o diretório permanece desativado: {NO_CREDENTIALS_NOTICE}
          </p>
        </div>
        {canManageUsers && (
          <Button onClick={() => setEditing({ port: 636, use_tls: true, active: false })}>
            <Plus className="mr-2 h-4 w-4" />
            Novo diretório
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Diretório</TableHead>
              <TableHead>Gateway</TableHead>
              <TableHead>Base DN</TableHead>
              <TableHead>Segredo</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Carregando…</TableCell>
              </TableRow>
            )}
            {!isLoading && dirs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Nenhum diretório cadastrado.
                </TableCell>
              </TableRow>
            )}
            {dirs.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.display_name}</TableCell>
                <TableCell className="text-sm">{d.gateway_url ?? "—"}</TableCell>
                <TableCell className="text-sm">{d.base_dn ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={d.has_secret ? "default" : "secondary"}>
                    {d.has_secret ? d.secret_name : "Não cadastrado"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      d.status === "ativo"
                        ? "default"
                        : d.status === "erro"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {STATUS_LABELS[d.status]}
                  </Badge>
                  <div className="text-xs text-muted-foreground">{dt(d.last_test_at)}</div>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  {canManageUsers && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void test(d.id)}
                        disabled={busy === d.id}
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Testar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {editing && <LdapDialog value={editing} onClose={() => setEditing(null)} onSave={save} />}
    </Card>
  );
}

function LdapDialog({
  value,
  onClose,
  onSave,
}: {
  value: Partial<LdapDirectory>;
  onClose: () => void;
  onSave: (v: Partial<LdapDirectory>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<LdapDirectory>>(value);
  const set = (patch: Partial<LdapDirectory>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar diretório" : "Novo diretório corporativo"}</DialogTitle>
          <DialogDescription>
            Informe apenas o nome do segredo cadastrado no servidor; a senha nunca é digitada nesta
            tela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input
              value={form.display_name ?? ""}
              onChange={(e) => set({ display_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Endereço do gateway seguro</Label>
            <Input
              placeholder="https://gateway.orgao.gov.br"
              value={form.gateway_url ?? ""}
              onChange={(e) => set({ gateway_url: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Base DN</Label>
              <Input
                value={form.base_dn ?? ""}
                onChange={(e) => set({ base_dn: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Usuário de leitura (bind DN)</Label>
              <Input
                value={form.bind_dn ?? ""}
                onChange={(e) => set({ bind_dn: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Nome do segredo no servidor</Label>
            <Input
              placeholder="LDAP_BIND_PASSWORD"
              value={form.secret_name ?? ""}
              onChange={(e) => set({ secret_name: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Atributo de login</Label>
              <Input
                value={form.login_attribute ?? "sAMAccountName"}
                onChange={(e) => set({ login_attribute: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Atributo de e-mail</Label>
              <Input
                value={form.email_attribute ?? "mail"}
                onChange={(e) => set({ email_attribute: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="text-sm font-medium">Ativo</div>
            <Switch checked={form.active ?? false} onCheckedChange={(v) => set({ active: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void onSave(form)} disabled={!form.display_name}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- acessos (auditoria) ------------------------- */

export function LoginEventsPanel() {
  const { data: events = [], isLoading } = useLoginEvents(300);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Histórico de acessos</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Registro das tentativas de entrada no sistema. Nunca guarda senhas, tokens ou códigos.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            exportReportCsv(
              "historico_de_acessos",
              [
                { key: "data", label: "Data e hora" },
                { key: "email", label: "E-mail" },
                { key: "forma", label: "Forma de entrada" },
                { key: "resultado", label: "Resultado" },
                { key: "motivo", label: "Motivo" },
              ],
              events.map((e) => ({
                data: dt(e.created_at),
                email: e.email ?? "",
                forma: LOGIN_METHOD_LABEL[e.method] ?? e.method,
                resultado: e.success ? "Sucesso" : "Recusado",
                motivo: e.reason ?? "",
              })),
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data e hora</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Forma de entrada</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5}>Carregando…</TableCell>
              </TableRow>
            )}
            {!isLoading && events.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Nenhum acesso registrado ainda.
                </TableCell>
              </TableRow>
            )}
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{dt(e.created_at)}</TableCell>
                <TableCell>{e.email ?? "—"}</TableCell>
                <TableCell>{LOGIN_METHOD_LABEL[e.method] ?? e.method}</TableCell>
                <TableCell>
                  <Badge variant={e.success ? "default" : "destructive"}>
                    {e.success ? "Sucesso" : "Recusado"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
