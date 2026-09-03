import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Cog, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  MEASURE_UNITS,
  PART_CATEGORIES,
  brl,
  dateBR,
  dbMessage,
  num,
  supabase,
  useInvalidate,
  useMaintenanceParts,
  usePartsCatalog,
  usePerms,
  useVehicles,
  type PartCatalog,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/pecas")({
  head: () => ({
    meta: [
      { title: "Peças e acessórios — FrotaGov" },
      {
        name: "description",
        content:
          "Catálogo de peças e acessórios do órgão e histórico de aplicação por veículo, com quantidade, valores, fornecedor e garantia.",
      },
      { property: "og:title", content: "Peças e acessórios — FrotaGov" },
      { property: "og:description", content: "Catálogo e histórico de peças aplicadas na frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pecas,
});

const ALL = "__all__";

const schema = z.object({
  internal_code: z.string().trim().max(40).optional(),
  description: z.string().trim().min(1, "Informe a descrição da peça").max(200),
  brand: z.string().trim().max(80).optional(),
  reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(600).optional(),
});

function Pecas() {
  const { data: parts = [], isLoading } = usePartsCatalog();
  const { data: applied = [] } = useMaintenanceParts();
  const { data: vehicles = [] } = useVehicles();
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PartCatalog | null>(null);
  const [category, setCategory] = useState(PART_CATEGORIES[0]!);
  const [measure, setMeasure] = useState("unidade");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [fVehicle, setFVehicle] = useState(ALL);

  const plateOf = useMemo(() => new Map(vehicles.map((v) => [v.id, (v.plate ?? v.asset_code)])), [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter(
      (p) => !q || `${p.internal_code ?? ""} ${p.description} ${p.brand ?? ""} ${p.reference ?? ""}`.toLowerCase().includes(q),
    );
  }, [parts, search]);

  const history = useMemo(
    () => applied.filter((a) => fVehicle === ALL || a.vehicle_id === fVehicle),
    [applied, fVehicle],
  );

  function openNew() {
    setEditing(null);
    setCategory(PART_CATEGORIES[0]!);
    setMeasure("unidade");
    setActive(true);
    setOpen(true);
  }

  function openEdit(p: PartCatalog) {
    setEditing(p);
    setCategory(p.category ?? PART_CATEGORIES[0]!);
    setMeasure(p.measure_unit);
    setActive(p.active);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const d = parsed.data;
    setSaving(true);
    const payload = {
      internal_code: d.internal_code || null,
      description: d.description,
      brand: d.brand || null,
      reference: d.reference || null,
      category,
      measure_unit: measure,
      active,
      notes: d.notes || null,
    };
    const { error } = editing
      ? await supabase.from("parts_catalog").update({ ...payload, updated_by: userId }).eq("id", editing.id)
      : await supabase.from("parts_catalog").insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? "Já existe uma peça com esse código." : dbMessage(error));
      return;
    }
    toast.success(editing ? "Peça atualizada." : "Peça cadastrada.");
    invalidate(["parts-catalog"]);
    setOpen(false);
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Peças e acessórios"
        description="Catálogo padronizado do órgão e histórico de aplicação por veículo."
        action={
          canManageFleet && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Nova peça
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="catalogo">
        <TabsList className="mb-4">
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="historico">Histórico por veículo</TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo">
          <div className="mb-4 max-w-sm">
            <Label>Buscar</Label>
            <Input placeholder="Código, descrição, marca" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Marca / referência</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-12" />
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
                      <Cog className="mx-auto mb-2 size-6 opacity-50" />
                      Nenhuma peça cadastrada.
                    </TableCell>
                  </TableRow>
                )}
                {paged.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.internal_code || "—"}</TableCell>
                    <TableCell>{p.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.brand || "—"}
                      <span className="block text-xs">{p.reference || ""}</span>
                    </TableCell>
                    <TableCell>{p.category || "—"}</TableCell>
                    <TableCell>{p.measure_unit}</TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativa" : "Inativa"}</Badge>
                    </TableCell>
                    <TableCell>
                      {canManageFleet && (
                        <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(p)}>
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
        </TabsContent>

        <TabsContent value="historico">
          <div className="mb-4 max-w-sm">
            <Label>Veículo</Label>
            <Select value={fVehicle} onValueChange={setFVehicle}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {(v.plate ?? v.asset_code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Peça</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Valor unitário</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Garantia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Nenhuma peça aplicada registrada.
                    </TableCell>
                  </TableRow>
                )}
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{dateBR(h.installed_at)}</TableCell>
                    <TableCell>{plateOf.get(h.vehicle_id) ?? "—"}</TableCell>
                    <TableCell>
                      {h.description}
                      <span className="block text-xs text-muted-foreground">
                        {h.odometer_km ? `${num(Number(h.odometer_km), 0)} km` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{num(Number(h.quantity), 2)}</TableCell>
                    <TableCell className="text-right">{brl(Number(h.unit_value))}</TableCell>
                    <TableCell className="text-right font-medium">{brl(Number(h.total_value))}</TableCell>
                    <TableCell>{h.warranty_until ? `até ${dateBR(h.warranty_until)}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar peça ${editing.description}` : "Nova peça"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="internal_code">Código interno</Label>
                <Input id="internal_code" name="internal_code" defaultValue={editing?.internal_code ?? ""} />
              </div>
              <div>
                <Label htmlFor="description">Descrição *</Label>
                <Input id="description" name="description" defaultValue={editing?.description ?? ""} required />
              </div>
              <div>
                <Label htmlFor="brand">Marca</Label>
                <Input id="brand" name="brand" defaultValue={editing?.brand ?? ""} />
              </div>
              <div>
                <Label htmlFor="reference">Referência</Label>
                <Input id="reference" name="reference" defaultValue={editing?.reference ?? ""} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PART_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade de medida</Label>
                <Select value={measure} onValueChange={setMeasure}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unidade">unidade</SelectItem>
                    {MEASURE_UNITS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3">
                <Switch id="active" checked={active} onCheckedChange={setActive} />
                <Label htmlFor="active">Peça ativa</Label>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar peça"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
