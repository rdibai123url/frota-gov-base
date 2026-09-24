import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  supabase,
  useCostCenters,
  useInvalidate,
  usePerms,
  useUnits,
  type CostCenterRow,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/centros-custo")({
  head: () => ({
    meta: [
      { title: "Centros de Custo — FrotaGov" },
      {
        name: "description",
        content:
          "Centros de custo do órgão vinculados às secretarias e unidades, base para empenhos, cotas e autorizações de abastecimento.",
      },
      { property: "og:title", content: "Centros de Custo — FrotaGov" },
      { property: "og:description", content: "Estrutura de centros de custo da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CentrosCusto,
});

const NONE = "__none__";
const ALL = "__all__";

const schema = z.object({
  code: z.string().trim().min(1, "Informe o código do centro de custo").max(30),
  name: z.string().trim().min(2, "Informe o nome do centro de custo").max(120),
  description: z.string().trim().max(400).optional(),
});

function CentrosCusto() {
  const { data: centers = [], isLoading } = useCostCenters();
  const { data: units = [] } = useUnits();
  const { canManageFinance, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenterRow | null>(null);
  const [unitId, setUnitId] = useState(NONE);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterUnit, setFilterUnit] = useState(ALL);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      centers.filter((c) => {
        if (filterUnit !== ALL && (c.unit_id ?? NONE) !== filterUnit) return false;
        const q = search.trim().toLowerCase();
        return !q || `${c.code} ${c.name}`.toLowerCase().includes(q);
      }),
    [centers, filterUnit, search],
  );

  function openNew() {
    setEditing(null);
    setUnitId(NONE);
    setActive(true);
    setOpen(true);
  }

  function openEdit(c: CostCenterRow) {
    setEditing(c);
    setUnitId(c.unit_id ?? NONE);
    setActive(c.active);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);
    const payload = {
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description || null,
      unit_id: unitId === NONE ? null : unitId,
      active,
    };
    const { error } = editing
      ? await supabase.from("cost_centers").update(payload).eq("id", editing.id)
      : await supabase
          .from("cost_centers")
          .insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Já existe um centro de custo com esse código."
          : "Não foi possível salvar o centro de custo.",
      );
      return;
    }
    toast.success(editing ? "Centro de custo atualizado." : "Centro de custo cadastrado.");
    invalidate(["cost-centers"]);
    setOpen(false);
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Centros de custo"
        description="Estrutura de apropriação da despesa por secretaria/unidade do órgão."
        action={
          canManageFinance && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo centro de custo
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label>Buscar</Label>
          <Input
            placeholder="Código ou nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label>Unidade</Label>
          <Select value={filterUnit} onValueChange={setFilterUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              <SelectItem value={NONE}>Sem unidade vinculada</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.acronym ? `${u.acronym} — ${u.name}` : u.name}
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
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Secretaria / unidade</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <Wallet className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhum centro de custo cadastrado. Crie o primeiro para vincular empenhos e cotas.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.code}</TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell>{c.unit ? (c.unit.acronym ?? c.unit.name) : "—"}</TableCell>
                <TableCell className="max-w-[280px] truncate text-muted-foreground">
                  {c.description || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={c.active ? "default" : "secondary"}>
                    {c.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canManageFinance && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(c)}
                      aria-label="Editar"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar centro de custo" : "Novo centro de custo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  name="code"
                  defaultValue={editing?.code ?? ""}
                  required
                  maxLength={30}
                />
              </div>
              <div>
                <Label>Secretaria / unidade</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não vincular</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.acronym ? `${u.acronym} — ${u.name}` : u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  required
                  maxLength={120}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editing?.description ?? ""}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="active" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="active">Ativo</Label>
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
    </>
  );
}
