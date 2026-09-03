import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
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
  UNIT_TYPES,
  label,
  supabase,
  useInvalidate,
  useProfile,
  useUnits,
  WRITE_ROLES,
  type Unit,
  type UnitType,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/unidades")({
  head: () => ({
    meta: [
      { title: "Secretarias e Unidades — FrotaGov" },
      { name: "description", content: "Cadastro da estrutura administrativa do órgão: secretarias, departamentos, diretorias e unidades." },
      { property: "og:title", content: "Secretarias e Unidades — FrotaGov" },
      { property: "og:description", content: "Gerencie a estrutura administrativa vinculada ao órgão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Unidades,
});

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(150),
  acronym: z.string().trim().max(20).optional(),
  manager_name: z.string().trim().max(120).optional(),
  manager_role: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(255).optional(),
});

function Unidades() {
  const { data: units = [], isLoading } = useUnits();
  const { data: me } = useProfile();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [unitType, setUnitType] = useState<UnitType>("secretaria");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const canWrite = (me?.roles ?? []).some((r) => WRITE_ROLES.includes(r));

  function openNew() {
    setEditing(null);
    setUnitType("secretaria");
    setActive(true);
    setOpen(true);
  }

  function openEdit(unit: Unit) {
    setEditing(unit);
    setUnitType(unit.unit_type);
    setActive(unit.active);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);
    const payload = {
      name: parsed.data.name,
      acronym: parsed.data.acronym || null,
      manager_name: parsed.data.manager_name || null,
      manager_role: parsed.data.manager_role || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      unit_type: unitType,
      active,
    };

    if (editing) {
      const { error } = await supabase.from("units").update(payload).eq("id", editing.id);
      setSaving(false);
      if (error) {
        toast.error("Não foi possível salvar a unidade.");
        return;
      }
    } else {
      const orgId = me?.profile?.organization_id;
      if (!orgId) {
        setSaving(false);
        toast.error("Seu usuário não está vinculado a um órgão.");
        return;
      }
      const { error } = await supabase
        .from("units")
        .insert({ ...payload, organization_id: orgId, created_by: me?.profile?.id ?? null });
      setSaving(false);
      if (error) {
        toast.error("Não foi possível cadastrar a unidade.");
        return;
      }
    }
    toast.success("Unidade salva com sucesso.");
    setOpen(false);
    invalidate(["units"]);
  }

  return (
    <>
      <PageHeader
        title="Secretarias / Unidades"
        description="Estrutura administrativa vinculada ao órgão."
        action={
          canWrite ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Nova unidade
            </Button>
          ) : null
        }
      />

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Sigla</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && units.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhuma secretaria ou unidade cadastrada.
                </TableCell>
              </TableRow>
            )}
            {units.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.acronym || "—"}</TableCell>
                <TableCell>{label(UNIT_TYPES, u.unit_type)}</TableCell>
                <TableCell>
                  {u.manager_name || "—"}
                  {u.manager_role && (
                    <span className="block text-xs text-muted-foreground">{u.manager_role}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {u.phone || "—"}
                  {u.email && <span className="block text-xs text-muted-foreground">{u.email}</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={u.active ? "default" : "secondary"}>
                    {u.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && (
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acronym">Sigla</Label>
                <Input id="acronym" name="acronym" defaultValue={editing?.acronym ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={unitType} onValueChange={(v) => setUnitType(v as UnitType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manager_name">Responsável</Label>
                <Input id="manager_name" name="manager_name" defaultValue={editing?.manager_name ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manager_role">Cargo do responsável</Label>
                <Input id="manager_role" name="manager_role" defaultValue={editing?.manager_role ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" defaultValue={editing?.phone ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Unidade ativa</Label>
                <p className="text-xs text-muted-foreground">Unidades inativas não recebem novos veículos.</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
