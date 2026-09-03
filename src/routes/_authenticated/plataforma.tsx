import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LogIn, Plus, RefreshCw, ShieldAlert, Download, Copy } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReopenReviewTab } from "@/components/reopen-review";
import { exportXlsx } from "@/lib/reports";
import { DocsTab, MatrixTab } from "@/components/homologacao";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase, useInvalidate, ROLE_LABELS, type AppRole } from "@/lib/frotagov";
import { maskCNPJ, maskCPF, formatCNPJ, onlyDigits, isValidCPF, isValidCNPJ } from "@/lib/format";
import {
  useAllOrganizations,
  useIsSuperAdmin,
  usePlatformSession,
  usePlatformContextActions,
  useActivityLogs,
  usePlatformSettings,
  exportCsv,
  LOG_EVENT_TYPES,
} from "@/lib/platform";
import { createOrganizationWithAdmin, bootstrapSuperAdmin } from "@/lib/platform.functions";
import { CredentialDialog } from "@/components/credential-dialog";

export const Route = createFileRoute("/_authenticated/plataforma")({
  head: () => ({
    meta: [
      { title: "Administração da Plataforma — FrotaGov" },
      {
        name: "description",
        content:
          "Área exclusiva do Super Admin: órgãos cadastrados, administradores globais, logs de auditoria e configurações da plataforma.",
      },
      { property: "og:title", content: "Administração da Plataforma — FrotaGov" },
      { property: "og:description", content: "Gestão multi-órgão, logs globais e configurações do FrotaGov." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Plataforma,
});

const ORG_TYPES = ["prefeitura", "camara", "consorcio", "autarquia", "fundacao", "secretaria", "outro"];
const PAGE_SIZE = 25;

const orgSchema = z.object({
  legal_name: z.string().trim().min(3, "Informe o nome oficial do órgão").max(180),
  short_name: z.string().trim().max(80).optional(),
  cnpj: z.string().trim().optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional(),
  full_name: z.string().trim().min(3, "Informe o nome do administrador").max(150),
  email: z.string().trim().email("E-mail inválido").max(255),
  cpf: z.string().trim().optional(),
  job_title: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
});

function Plataforma() {
  const { isSuperAdmin, isLoading } = useIsSuperAdmin();

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!isSuperAdmin) {
    return (
      <>
        <PageHeader title="Administração da Plataforma" />
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-3">
            <p>Área restrita ao Super Admin da plataforma.</p>
            <BootstrapSuperAdmin />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Administração da Plataforma"
        description="Órgãos, administradores globais, logs de auditoria e configurações gerais."
      />
      <Tabs defaultValue="orgaos">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="orgaos">Órgãos</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários globais</TabsTrigger>
          <TabsTrigger value="logs">Logs globais</TabsTrigger>
          <TabsTrigger value="reaberturas">Reaberturas</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
          <TabsTrigger value="documentacao">Documentação / Homologação</TabsTrigger>
          <TabsTrigger value="matriz">Matriz de funcionalidades</TabsTrigger>
        </TabsList>
        <TabsContent value="orgaos" className="pt-5">
          <OrgsTab />
        </TabsContent>
        <TabsContent value="usuarios" className="pt-5">
          <GlobalUsersTab />
        </TabsContent>
        <TabsContent value="logs" className="pt-5">
          <LogsTab />
        </TabsContent>
        <TabsContent value="reaberturas" className="pt-5">
          <ReopenReviewTab />
        </TabsContent>
        <TabsContent value="config" className="pt-5">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="documentacao" className="pt-5">
          <DocsTab
            environment={[
              { label: "Ambiente", value: typeof window === "undefined" ? "—" : window.location.host },
              { label: "Rotinas automáticas", value: "Alertas e expiração a cada hora; limpeza de logs às 03:20" },
            ]}
          />
        </TabsContent>
        <TabsContent value="matriz" className="pt-5">
          <MatrixTab organization="FrotaGov" />
        </TabsContent>
      </Tabs>

    </>
  );
}

/**
 * Primeiro acesso da plataforma: enquanto não existir nenhum Super Admin, o
 * usuário autenticado pode assumir o papel. Depois disso a ação é rejeitada
 * pelo servidor. Não há senha mestre fixa em nenhum ponto do sistema.
 */
function BootstrapSuperAdmin() {
  const [running, setRunning] = useState(false);
  const invalidate = useInvalidate();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={running}
      onClick={async () => {
        setRunning(true);
        try {
          await bootstrapSuperAdmin();
          toast.success("Perfil Super Admin concedido a esta conta.");
          invalidate(["profile"]);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Ação indisponível.");
        } finally {
          setRunning(false);
        }
      }}
    >
      Assumir Super Admin (somente se a plataforma ainda não tiver um)
    </Button>
  );
}

/* ------------------------------- Órgãos -------------------------------- */

function OrgsTab() {
  const { data: orgs = [], isLoading } = useAllOrganizations();
  const { data: session } = usePlatformSession();
  const { enterOrg } = usePlatformContextActions();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgType, setOrgType] = useState("prefeitura");
  const [cnpj, setCnpj] = useState("");
  const [cpf, setCpf] = useState("");
  const [credential, setCredential] = useState<{ email: string; tempPassword: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = orgSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (cnpj && !isValidCNPJ(cnpj)) {
      toast.error("CNPJ inválido.");
      return;
    }
    if (cpf && !isValidCPF(cpf)) {
      toast.error("CPF do administrador inválido.");
      return;
    }
    setSaving(true);
    try {
      const result = await createOrganizationWithAdmin({
        data: {
          legal_name: parsed.data.legal_name,
          short_name: parsed.data.short_name ?? null,
          cnpj: onlyDigits(cnpj) || null,
          org_type: orgType,
          city: parsed.data.city ?? null,
          state: (parsed.data.state || "").toUpperCase() || null,
          admin: {
            full_name: parsed.data.full_name,
            email: parsed.data.email,
            cpf: onlyDigits(cpf) || null,
            phone: parsed.data.phone ?? null,
            job_title: parsed.data.job_title ?? null,
          },
        },
      });
      setOpen(false);
      setCnpj("");
      setCpf("");
      setCredential({ email: result.email, tempPassword: result.tempPassword });
      invalidate(["all-organizations"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o órgão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Novo órgão
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Órgão</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Município / UF</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && orgs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum órgão cadastrado. Use "Novo órgão" para iniciar o onboarding.
                </TableCell>
              </TableRow>
            )}
            {orgs.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">
                  {o.legal_name}
                  {o.short_name && <span className="block text-xs text-muted-foreground">{o.short_name}</span>}
                </TableCell>
                <TableCell className="text-sm">{formatCNPJ(o.cnpj)}</TableCell>
                <TableCell className="text-sm">{[o.city, o.state].filter(Boolean).join(" / ") || "—"}</TableCell>
                <TableCell>
                  {session?.organization_id === o.id ? (
                    <Badge>Em contexto</Badge>
                  ) : (
                    <Badge variant="outline">Ativo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await enterOrg(o.id);
                        toast.success(`Visualizando órgão: ${o.legal_name}`);
                      } catch {
                        toast.error("Não foi possível entrar no órgão.");
                      }
                    }}
                  >
                    <LogIn className="size-4" /> Acessar órgão
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo órgão e administrador principal</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="legal_name">Nome oficial *</Label>
                <Input id="legal_name" name="legal_name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="short_name">Nome curto</Label>
                <Input id="short_name" name="short_name" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de órgão</Label>
                <Select value={orgType} onValueChange={setOrgType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">Município</Label>
                <Input id="city" name="city" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">UF</Label>
                <Input id="state" name="state" maxLength={2} />
              </div>
            </div>

            <div className="rounded-md border p-4">
              <p className="mb-3 text-sm font-medium">Administrador principal do órgão</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Nome completo *</Label>
                  <Input id="full_name" name="full_name" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input id="cpf" value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail institucional *</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" name="phone" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="job_title">Cargo</Label>
                  <Input id="job_title" name="job_title" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Uma senha temporária será gerada e exibida uma única vez. O administrador deverá
                trocá-la obrigatoriamente no primeiro acesso.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                Criar órgão
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CredentialDialog credential={credential} onClose={() => setCredential(null)} />
    </>
  );
}

/* --------------------------- Usuários globais --------------------------- */

function GlobalUsersTab() {
  const { data: orgs = [] } = useAllOrganizations();
  const { data, isLoading, refetch } = useGlobalUsers();
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.legal_name ?? "Sem órgão";

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="size-4" /> Atualizar
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Órgão</TableHead>
              <TableHead>Perfis</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            )}
            {(data ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                <TableCell className="text-sm">{u.email || "—"}</TableCell>
                <TableCell className="text-sm">{orgName(u.organization_id)}</TableCell>
                <TableCell className="space-x-1">
                  {u.roles.length === 0 && <span className="text-muted-foreground">Sem perfil</span>}
                  {u.roles.map((r) => (
                    <Badge key={r} variant={r === "super_admin" ? "destructive" : "secondary"}>
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell>
                  <Badge variant={u.active ? "default" : "outline"}>{u.active ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        A criação de usuários de um órgão é feita pelo administrador do próprio órgão, em Cadastros →
        Usuários e Permissões.
      </p>
    </>
  );
}

function useGlobalUsers() {
  const { isSuperAdmin } = useIsSuperAdmin();
  return useQueryGlobalUsers(isSuperAdmin);
}

import { useQuery } from "@tanstack/react-query";

function useQueryGlobalUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["global-users", enabled],
    enabled,
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      }));
    },
  });
}

/* ----------------------------- Logs globais ----------------------------- */

const LOG_COLUMNS = [
  { key: "created_at", label: "Data/hora" },
  { key: "organization", label: "Órgão" },
  { key: "actor", label: "Responsável" },
  { key: "as_super_admin", label: "Super Admin" },
  { key: "event_type", label: "Tipo" },
  { key: "area", label: "Área" },
  { key: "screen", label: "Tela" },
  { key: "entity", label: "Entidade" },
  { key: "action", label: "Ação" },
  { key: "summary", label: "Resumo" },
];

function LogsTab() {
  const { data: orgs = [] } = useAllOrganizations();
  const [q, setQ] = useState("");
  const [organizationId, setOrganizationId] = useState<string>("todos");
  const [eventType, setEventType] = useState<string>("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  const filters = {
    q: q || "",
    organizationId: organizationId === "todos" ? null : organizationId,
    eventType: eventType === "todos" ? null : eventType,
    from: from || null,
    to: to || null,
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isLoading } = useActivityLogs(filters);
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.legal_name ?? "—";

  const exportRows = rows.map((r) => ({
    created_at: new Date(r.created_at).toLocaleString("pt-BR"),
    organization: orgName(r.organization_id),
    actor: r.actor_email ?? r.actor_name ?? r.actor_id ?? "—",
    as_super_admin: r.as_super_admin ? "Sim" : "Não",
    event_type: r.event_type,
    area: r.area ?? "",
    screen: r.screen ?? "",
    entity: r.entity ?? "",
    action: r.action ?? "",
    summary: r.summary ?? "",
  }));

  return (
    <>
      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Busca</Label>
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Resumo, e-mail, entidade" />
        </div>
        <div className="space-y-1.5">
          <Label>Órgão</Label>
          <Select value={organizationId} onValueChange={(v) => { setOrganizationId(v); setPage(0); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.short_name || o.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={eventType} onValueChange={(v) => { setEventType(v); setPage(0); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {LOG_EVENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{total} registro(s)</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv("logs-globais", LOG_COLUMNS, exportRows)}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportXlsx("logs-globais", LOG_COLUMNS, exportRows, "Logs globais")}>
            <Download className="size-4" /> Excel
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/hora</TableHead>
              <TableHead>Órgão</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Resumo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhum registro para os filtros informados.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-sm">{orgName(r.organization_id)}</TableCell>
                <TableCell className="text-sm">
                  {r.actor_email ?? r.actor_name ?? "—"}
                  {r.as_super_admin && <Badge variant="destructive" className="ml-2">Super Admin</Badge>}
                </TableCell>
                <TableCell className="text-sm">{r.event_type}</TableCell>
                <TableCell className="text-sm">{[r.entity, r.action].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-sm">{r.summary ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          Página {page + 1} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={(page + 1) * PAGE_SIZE >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </>
  );
}

/* --------------------------- Configurações ------------------------------ */

function SettingsTab() {
  const { data: settings } = usePlatformSettings();
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const retention = Number(form.get("log_retention_days"));
    if (!Number.isFinite(retention) || retention < 30 || retention > 3650) {
      toast.error("A retenção deve estar entre 30 e 3650 dias.");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("platform_settings").upsert({
      id: true,
      log_retention_days: retention,
      platform_name: String(form.get("platform_name") || "FrotaGov"),
      support_email: String(form.get("support_email") || "") || null,
      updated_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar as configurações.");
      return;
    }
    toast.success("Configurações da plataforma atualizadas.");
    invalidate(["platform-settings"]);
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-lg border bg-card p-5 shadow-card">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="platform_name">Nome da plataforma</Label>
          <Input id="platform_name" name="platform_name" defaultValue={settings?.platform_name ?? "FrotaGov"} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="support_email">E-mail de suporte</Label>
          <Input id="support_email" name="support_email" type="email" defaultValue={settings?.support_email ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="log_retention_days">Retenção de logs (dias)</Label>
          <Input
            id="log_retention_days"
            name="log_retention_days"
            type="number"
            min={30}
            max={3650}
            defaultValue={settings?.log_retention_days ?? 365}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Observações operacionais</Label>
        <Textarea
          readOnly
          rows={3}
          value="Os logs globais são mantidos pelo período de retenção configurado. A limpeza é executada por rotina interna do banco, sem exclusão física de dados operacionais."
        />
      </div>
      <Button type="submit" disabled={saving}>Salvar configurações</Button>
    </form>
  );
}
