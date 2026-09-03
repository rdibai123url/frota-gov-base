import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Pencil, ShieldAlert, Plus, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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
import {
  ROLE_LABELS,
  supabase,
  useInvalidate,
  useOrgUsers,
  useProfile,
  useUnits,
  type AppRole,
} from "@/lib/frotagov";
import { maskCPF, isValidCPF, onlyDigits } from "@/lib/format";
import { createOrgUser, resetOrgUserAccess } from "@/lib/platform.functions";
import { CredentialDialog } from "@/routes/_authenticated/plataforma";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários e permissões — FrotaGov" },
      {
        name: "description",
        content:
          "Gestão dos usuários do órgão e dos perfis de acesso: administrador, gestor de frota, responsável de unidade, operador e fiscal.",
      },
      { property: "og:title", content: "Usuários e permissões — FrotaGov" },
      { property: "og:description", content: "Controle os acessos e perfis dos usuários do órgão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Usuarios,
});

const NONE = "__none__";

/** Perfis atribuíveis pelo Administrador do Órgão (super_admin é exclusivo da plataforma). */
const ASSIGNABLE_ROLES: AppRole[] = [
  "org_admin",
  "fleet_manager",
  "unit_manager",
  "operator",
  "auditor",
];

const schema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome").max(150),
  job_title: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
});

type OrgUser = ReturnType<typeof useOrgUsers>["data"] extends (infer T)[] | undefined ? T : never;

function Usuarios() {
  const { data: users = [], isLoading } = useOrgUsers();
  const { data: units = [] } = useUnits();
  const { data: me } = useProfile();
  const invalidate = useInvalidate();

  const [editing, setEditing] = useState<OrgUser | null>(null);
  const [role, setRole] = useState<string>(NONE);
  const [unitId, setUnitId] = useState<string>(NONE);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState<string>("operator");
  const [newUnit, setNewUnit] = useState<string>(NONE);
  const [newCpf, setNewCpf] = useState("");
  const [credential, setCredential] = useState<{ email: string; tempPassword: string } | null>(null);

  const myRoles = me?.roles ?? [];
  const canManage = myRoles.includes("org_admin") || myRoles.includes("super_admin");
  const isSuperAdmin = myRoles.includes("super_admin");

  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "—";

  function openEdit(u: OrgUser) {
    setEditing(u);
    const current = u.roles.find((r) => r !== "super_admin");
    setRole(current ?? NONE);
    setUnitId(u.unit_id ?? NONE);
    setActive(u.active);
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const full_name = String(form.get("full_name") || "").trim();
    const email = String(form.get("email") || "").trim();
    if (full_name.length < 3 || !email.includes("@")) {
      toast.error("Informe nome completo e e-mail válido.");
      return;
    }
    if (newCpf && !isValidCPF(newCpf)) {
      toast.error("CPF inválido.");
      return;
    }
    setSaving(true);
    try {
      const result = await createOrgUser({
        data: {
          full_name,
          email,
          cpf: onlyDigits(newCpf) || null,
          phone: String(form.get("phone") || "") || null,
          job_title: String(form.get("job_title") || "") || null,
          unit_id: newUnit === NONE ? null : newUnit,
          role: newRole,
        },
      });
      setCreating(false);
      setNewCpf("");
      setCredential({ email: result.email, tempPassword: result.tempPassword });
      invalidate(["org-users"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function onResetAccess(userId: string) {
    try {
      const result = await resetOrgUserAccess({ data: { userId } });
      setCredential({ email: result.email ?? "", tempPassword: result.tempPassword });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível redefinir o acesso.");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.full_name,
        job_title: parsed.data.job_title || null,
        phone: parsed.data.phone || null,
        unit_id: unitId === NONE ? null : unitId,
        active,
      })
      .eq("id", editing.id);

    if (profileError) {
      setSaving(false);
      toast.error("Não foi possível salvar os dados do usuário.");
      return;
    }

    // Papéis: nunca é possível conceder super_admin por esta tela (bloqueado também no banco).
    const currentRoles: AppRole[] = editing.roles.filter((r) => r !== "super_admin");
    const desired: AppRole[] = role === NONE ? [] : [role as AppRole];
    const toRemove = currentRoles.filter((r) => !desired.includes(r));
    const toAdd = desired.filter((r) => !currentRoles.includes(r));

    for (const r of toRemove) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", editing.id)
        .eq("role", r);
      if (error) {
        setSaving(false);
        toast.error("Não foi possível remover o perfil anterior.");
        return;
      }
    }
    for (const r of toAdd) {
      const { error } = await supabase.from("user_roles").insert({
        user_id: editing.id,
        role: r,
        organization_id: me?.profile?.organization_id ?? null,
      });
      if (error) {
        setSaving(false);
        toast.error("Não foi possível conceder o perfil informado.");
        return;
      }
    }

    setSaving(false);
    toast.success("Usuário atualizado com sucesso.");
    setEditing(null);
    invalidate(["org-users", "profile"]);
  }

  return (
    <>
      <PageHeader
        title="Usuários e permissões"
        description="Usuários vinculados ao órgão e seus perfis de acesso."
        action={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Novo usuário
            </Button>
          ) : undefined
        }
      />

      {!canManage && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            Você tem acesso somente para consulta. A gestão de usuários é exclusiva do Administrador
            do Órgão.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Secretaria / unidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhum usuário encontrado neste órgão.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.full_name || "—"}
                  {u.job_title && (
                    <span className="block text-xs text-muted-foreground">{u.job_title}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{u.email || "—"}</TableCell>
                <TableCell className="space-x-1">
                  {u.roles.length === 0 && <span className="text-muted-foreground">Sem perfil</span>}
                  {u.roles.map((r) => (
                    <Badge key={r} variant={r === "super_admin" ? "destructive" : "secondary"}>
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell className="text-sm">{unitName(u.unit_id)}</TableCell>
                <TableCell>
                  <Badge variant={u.active ? "default" : "outline"}>
                    {u.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManage && u.id !== me?.profile?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Redefinir acesso"
                      onClick={() => onResetAccess(u.id)}
                    >
                      <KeyRound className="size-4" />
                    </Button>
                  )}
                  {(canManage || u.id === me?.profile?.id) && (
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        O perfil Super Admin é exclusivo da plataforma e não pode ser concedido pelo órgão. Fiscal /
        Controladoria possui acesso somente de consulta nesta fase.
      </p>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="full_name">Nome *</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    defaultValue={editing.full_name ?? ""}
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>E-mail</Label>
                  <Input value={editing.email ?? ""} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job_title">Cargo</Label>
                  <Input id="job_title" name="job_title" defaultValue={editing.job_title ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" name="phone" defaultValue={editing.phone ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>Perfil de acesso</Label>
                  <Select value={role} onValueChange={setRole} disabled={!canManage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem perfil</SelectItem>
                      {ASSIGNABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editing.roles.includes("super_admin") && (
                    <p className="text-xs text-muted-foreground">
                      Este usuário possui perfil de Super Admin da plataforma, que não é alterado por
                      aqui.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Secretaria / unidade</Label>
                  <Select value={unitId} onValueChange={setUnitId} disabled={!canManage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem vínculo</SelectItem>
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Usuário ativo</Label>
                  <p className="text-xs text-muted-foreground">
                    Usuários inativos permanecem no histórico, sem operar o sistema.
                  </p>
                </div>
                <Switch checked={active} onCheckedChange={setActive} disabled={!canManage} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo usuário do órgão</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new_full_name">Nome completo *</Label>
                <Input id="new_full_name" name="full_name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_email">E-mail institucional *</Label>
                <Input id="new_email" name="email" type="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_cpf">CPF</Label>
                <Input
                  id="new_cpf"
                  value={newCpf}
                  onChange={(e) => setNewCpf(maskCPF(e.target.value))}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_job">Cargo</Label>
                <Input id="new_job" name="job_title" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new_phone">Telefone</Label>
                <Input id="new_phone" name="phone" />
              </div>
              <div className="space-y-1.5">
                <Label>Perfil de acesso *</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Secretaria / unidade</Label>
                <Select value={newUnit} onValueChange={setNewUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem vínculo</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Uma senha temporária será gerada e exibida uma única vez; a troca é obrigatória no
              primeiro acesso.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>Criar usuário</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CredentialDialog credential={credential} onClose={() => setCredential(null)} />

      {isSuperAdmin && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sessão com perfil Super Admin da plataforma.
        </p>
      )}
    </>
  );
}
