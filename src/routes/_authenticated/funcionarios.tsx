/**
 * Funcionários do órgão — pessoas, com ou sem acesso ao sistema.
 *
 * Este cadastro é distinto de "Usuários e permissões": aqui ficam as pessoas do
 * órgão e suas funções institucionais (fiscal, gestor, autorizador…). O acesso ao
 * sistema só é criado por ação explícita, reaproveitando os dados do funcionário.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { IdCard, KeyRound, Pencil, Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { ListPagination, usePaged } from "@/components/list-pagination";
import { CredentialDialog } from "@/components/credential-dialog";
import { CpfInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPLOYEE_FUNCTIONS,
  employeeFunctionLabel,
  toggleValue,
  useEmployees,
  type EmployeeRow,
} from "@/lib/pessoas";
import { isValidCPF, maskCPF, onlyDigits } from "@/lib/format";
import { createOrgUser } from "@/lib/platform.functions";
import {
  ROLE_LABELS,
  supabase,
  useInvalidate,
  usePerms,
  useUnits,
  type AppRole,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  head: () => ({
    meta: [
      { title: "Funcionários do órgão — FrotaGov" },
      {
        name: "description",
        content:
          "Cadastro das pessoas do órgão e de suas funções institucionais — fiscal e gestor de contrato, autorizador, almoxarifado, direção e condutores — com ou sem acesso ao sistema.",
      },
      { property: "og:title", content: "Funcionários do órgão — FrotaGov" },
      {
        property: "og:description",
        content:
          "Pessoas do órgão e funções institucionais reutilizadas em contratos, autorizações e conferências.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Funcionarios,
});

const NONE = "__none__";
const ALL = "__all__";

const ASSIGNABLE_ROLES: AppRole[] = [
  "org_admin",
  "fleet_manager",
  "unit_manager",
  "operator",
  "auditor",
];

const schema = z.object({
  full_name: z.string().trim().min(3, "Informe o nome completo").max(150),
  cpf: z.string().trim().optional(),
  registration: z.string().trim().max(40).optional(),
  job_title: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(600).optional(),
});

function Funcionarios() {
  const { data: employees = [], isLoading } = useEmployees();
  const { data: units = [] } = useUnits();
  const { canWrite, canManageUsers, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [unitId, setUnitId] = useState(NONE);
  const [functions, setFunctions] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [fFunction, setFFunction] = useState(ALL);

  const [accessFor, setAccessFor] = useState<EmployeeRow | null>(null);
  const [accessRole, setAccessRole] = useState<string>("operator");
  const [credential, setCredential] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (fFunction !== ALL && !(e.functions ?? []).includes(fFunction)) return false;
      if (!q) return true;
      return `${e.full_name} ${e.cpf ?? ""} ${e.registration ?? ""} ${e.job_title ?? ""} ${e.email ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [employees, search, fFunction]);

  function openNew() {
    setEditing(null);
    setUnitId(NONE);
    setFunctions([]);
    setActive(true);
    setOpen(true);
  }

  function openEdit(e: EmployeeRow) {
    setEditing(e);
    setUnitId(e.unit_id ?? NONE);
    setFunctions(e.functions ?? []);
    setActive(e.active);
    setOpen(true);
  }

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(ev.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const d = parsed.data;
    const cpf = onlyDigits(d.cpf ?? "");
    if (cpf && !isValidCPF(cpf)) {
      toast.error("CPF inválido.");
      return;
    }
    setSaving(true);
    const payload = {
      full_name: d.full_name,
      cpf: cpf || null,
      registration: d.registration || null,
      job_title: d.job_title || null,
      phone: d.phone || null,
      email: d.email || null,
      unit_id: unitId === NONE ? null : unitId,
      functions,
      active,
      notes: d.notes || null,
    };
    const { error } = editing
      ? await supabase
          .from("employees")
          .update({ ...payload, updated_by: userId })
          .eq("id", editing.id)
      : await supabase
          .from("employees")
          .insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Já existe um funcionário com este CPF neste órgão."
          : "Não foi possível salvar o funcionário.",
      );
      return;
    }
    toast.success(editing ? "Funcionário atualizado." : "Funcionário cadastrado.");
    invalidate(["employees"]);
    setOpen(false);
  }

  async function onCreateAccess(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!accessFor) return;
    const email = String(new FormData(ev.currentTarget).get("email") ?? "").trim();
    if (!email.includes("@")) {
      toast.error("Informe um e-mail institucional válido.");
      return;
    }
    setSaving(true);
    try {
      const result = await createOrgUser({
        data: {
          full_name: accessFor.full_name,
          email,
          cpf: accessFor.cpf,
          phone: accessFor.phone,
          job_title: accessFor.job_title,
          unit_id: accessFor.unit_id,
          role: accessRole,
        },
      });
      // Vincula o acesso criado à pessoa já cadastrada, sem duplicar o funcionário.
      await supabase
        .from("employees")
        .update({ user_id: result.userId, email, updated_by: userId })
        .eq("id", accessFor.id);
      setAccessFor(null);
      setAccessRole("operator");
      setCredential({ email: result.email, tempPassword: result.tempPassword });
      invalidate(["employees", "org-users"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o acesso.");
    } finally {
      setSaving(false);
    }
  }

  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "—";
  const paged = usePaged(filtered);

  return (
    <>
      <PageHeader
        title="Funcionários"
        description="Pessoas do órgão e suas funções institucionais. O acesso ao sistema é opcional e criado separadamente, em Usuários e permissões."
        action={
          canWrite && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo funcionário
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Buscar</Label>
          <Input
            placeholder="Nome, CPF, matrícula ou cargo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label>Função institucional</Label>
          <Select value={fFunction} onValueChange={setFFunction}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as funções</SelectItem>
              {EMPLOYEE_FUNCTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF / matrícula</TableHead>
              <TableHead>Secretaria / unidade</TableHead>
              <TableHead>Funções institucionais</TableHead>
              <TableHead>Acesso ao sistema</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <IdCard className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhum funcionário cadastrado.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">
                  {e.full_name}
                  {e.job_title && (
                    <span className="block text-xs text-muted-foreground">{e.job_title}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {e.cpf ? maskCPF(e.cpf) : "—"}
                  {e.registration && (
                    <span className="block text-xs text-muted-foreground">
                      Mat. {e.registration}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{unitName(e.unit_id)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(e.functions ?? []).length === 0 && (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                    {(e.functions ?? []).map((f) => (
                      <Badge key={f} variant="secondary">
                        {employeeFunctionLabel(f)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {e.user ? (
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <UserCheck className="size-4" /> {e.user.email}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sem acesso</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={e.active ? "default" : "outline"}>
                    {e.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {canManageUsers && !e.user_id && e.active && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Criar acesso ao sistema para este funcionário"
                        aria-label="Criar acesso ao sistema"
                        onClick={() => setAccessFor(e)}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                    )}
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => openEdit(e)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Função institucional e perfil de acesso são coisas diferentes: a função descreve o papel da
        pessoa no órgão (fiscal, gestor, autorizador…), enquanto o perfil de acesso define o que o
        usuário pode fazer no sistema.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar ${editing.full_name}` : "Novo funcionário"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="full_name">Nome completo *</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  defaultValue={editing?.full_name ?? ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="cpf">CPF</Label>
                <CpfInput id="cpf" name="cpf" defaultValue={editing?.cpf ?? ""} />
              </div>
              <div>
                <Label htmlFor="registration">Matrícula</Label>
                <Input
                  id="registration"
                  name="registration"
                  defaultValue={editing?.registration ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="job_title">Cargo / função</Label>
                <Input id="job_title" name="job_title" defaultValue={editing?.job_title ?? ""} />
              </div>
              <div>
                <Label>Secretaria / unidade</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue />
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
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" defaultValue={editing?.phone ?? ""} />
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Label>Funções institucionais</Label>
                <div className="mt-1 grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                  {EMPLOYEE_FUNCTIONS.map((f) => (
                    <label key={f.value} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={functions.includes(f.value)}
                        onCheckedChange={() => setFunctions((prev) => toggleValue(prev, f.value))}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Selecione todas as funções exercidas. Não confundir com o perfil de acesso do
                  usuário.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="active" checked={active} onCheckedChange={setActive} />
                <Label htmlFor="active">Funcionário ativo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!accessFor} onOpenChange={(v) => !v && setAccessFor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar acesso ao sistema</DialogTitle>
          </DialogHeader>
          {accessFor && (
            <form onSubmit={onCreateAccess} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                O acesso será criado para <strong>{accessFor.full_name}</strong> reaproveitando CPF,
                telefone, cargo e unidade já cadastrados. A pessoa não é duplicada: o funcionário
                passa a ficar vinculado ao usuário.
              </p>
              <div>
                <Label htmlFor="access_email">E-mail institucional *</Label>
                <Input
                  id="access_email"
                  name="email"
                  type="email"
                  defaultValue={accessFor.email ?? ""}
                  required
                />
              </div>
              <div>
                <Label>Perfil de acesso *</Label>
                <Select value={accessRole} onValueChange={setAccessRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Uma senha temporária será gerada e exibida uma única vez; a troca é obrigatória no
                primeiro acesso.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAccessFor(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Criando…" : "Criar acesso"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <CredentialDialog credential={credential} onClose={() => setCredential(null)} />
    </>
  );
}
