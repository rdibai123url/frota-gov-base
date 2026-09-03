import { ListPagination, usePaged } from "@/components/list-pagination";
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
  MEASURE_UNITS,
  supabase,
  useFuelTypes,
  useInvalidate,
  usePerms,
  type FuelType,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/combustiveis")({
  head: () => ({
    meta: [
      { title: "Combustíveis — FrotaGov" },
      {
        name: "description",
        content: "Cadastro dos tipos de combustível utilizados pela frota do órgão, com unidade padrão e situação.",
      },
      { property: "og:title", content: "Combustíveis — FrotaGov" },
      { property: "og:description", content: "Tipos de combustível do órgão público." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Combustiveis,
});

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome do combustível").max(80),
  acronym: z.string().trim().max(10).optional(),
});

function Combustiveis() {
  const { data: fuels = [], isLoading } = useFuelTypes();
  const { canWrite, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FuelType | null>(null);
  const [unit, setUnit] = useState("litro");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setUnit("litro");
    setActive(true);
    setOpen(true);
  }

  function openEdit(f: FuelType) {
    setEditing(f);
    setUnit(f.measure_unit);
    setActive(f.active);
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
      name: parsed.data.name,
      acronym: parsed.data.acronym || null,
      measure_unit: unit,
      active,
    };
    const { error } = editing
      ? await supabase.from("fuel_types").update(payload).eq("id", editing.id)
      : await supabase
          .from("fuel_types")
          .insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "Já existe um combustível com esse nome." : "Não foi possível salvar.",
      );
      return;
    }
    toast.success(editing ? "Combustível atualizado." : "Combustível cadastrado.");
    invalidate(["fuel-types"]);
    setOpen(false);
  }

  const paged = usePaged(fuels);
  return (
    <>
      <PageHeader
        title="Combustíveis"
        description="Tipos de combustível disponíveis para os abastecimentos do órgão."
        action={
          canWrite && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo combustível
            </Button>
          ) : undefined
        }
      />

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Sigla</TableHead>
              <TableHead>Unidade padrão</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && fuels.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nenhum combustível cadastrado.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell>{f.acronym || "—"}</TableCell>
                <TableCell>{f.measure_unit}</TableCell>
                <TableCell>
                  <Badge variant={f.active ? "default" : "secondary"}>
                    {f.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canWrite && (
                    <Button variant="ghost" size="icon" onClick={() => openEdit(f)} aria-label="Editar">
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
            <DialogTitle>{editing ? "Editar combustível" : "Novo combustível"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" name="name" defaultValue={editing?.name ?? ""} required maxLength={80} />
              </div>
              <div>
                <Label htmlFor="acronym">Sigla</Label>
                <Input id="acronym" name="acronym" defaultValue={editing?.acronym ?? ""} maxLength={10} />
              </div>
              <div>
                <Label>Unidade padrão</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASURE_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
