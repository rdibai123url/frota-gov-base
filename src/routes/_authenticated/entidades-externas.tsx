/**
 * Cadastro mestre de Pessoas e Empresas Externas.
 *
 * Pessoas físicas e jurídicas de fora do órgão, classificadas por categorias
 * reutilizáveis. A mesma entidade pode acumular categorias (fornecedor + oficina,
 * por exemplo) sem duplicar cadastro, e não precisa ter contrato para existir.
 */
import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { autoGeocode } from "@/lib/geocode";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { CnpjInput, CpfInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ENTITY_CATEGORIES, entityCategoryLabel, toggleValue } from "@/lib/pessoas";
import {
  ENTITY_KINDS,
  dbMessage,
  isValidCNPJ,
  isValidCPF,
  label,
  maskCNPJ,
  maskCPF,
  onlyDigits,
  supabase,
  useExternalEntities,
  useInvalidate,
  usePerms,
  type EntityKind,
  type ExternalEntity,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/entidades-externas")({
  head: () => ({
    meta: [
      { title: "Pessoas e Empresas Externas — FrotaGov" },
      {
        name: "description",
        content:
          "Cadastro mestre de pessoas físicas e jurídicas externas — fornecedores, postos, oficinas, lava-jatos, seguradoras, locadoras, terceiros e cedentes — reutilizado por toda a gestão da frota.",
      },
      { property: "og:title", content: "Pessoas e Empresas Externas — FrotaGov" },
      {
        property: "og:description",
        content: "Cadastro único de pessoas e empresas externas, com categorias reutilizáveis e sem duplicidade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Entidades,
});

const ALL = "__all__";

const schema = z.object({
  name: z.string().trim().min(3, "Informe o nome ou razão social").max(160),
  trade_name: z.string().trim().max(160).optional(),
  document: z.string().trim().optional(),
  address: z.string().trim().max(200).optional(),
  district: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional(),
  zip_code: z.string().trim().max(20).optional(),
  contact_name: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(600).optional(),
});

function Entidades() {
  const { data: entities = [], isLoading } = useExternalEntities();
  const { canRegister, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalEntity | null>(null);
  const [kind, setKind] = useState<EntityKind>("pj");
  const [categories, setCategories] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [search, setSearch] = useState("");
  const [fCategory, setFCategory] = useState(ALL);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entities.filter((e) => {
      if (fCategory !== ALL && !(e.categories ?? []).includes(fCategory)) return false;
      if (!q) return true;
      return `${e.name} ${e.trade_name ?? ""} ${e.document ?? ""} ${e.city ?? ""}`.toLowerCase().includes(q);
    });
  }, [entities, search, fCategory]);

  function openNew() {
    setEditing(null);
    setKind("pj");
    setCategories([]);
    setActive(true);
    setOpen(true);
  }

  function openEdit(e: ExternalEntity) {
    setEditing(e);
    setKind(e.kind);
    setCategories(e.categories ?? []);
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
    const doc = onlyDigits(d.document ?? "");
    if (doc) {
      if (kind === "pj" && !isValidCNPJ(doc)) {
        toast.error("CNPJ inválido.");
        return;
      }
      if (kind === "pf" && !isValidCPF(doc)) {
        toast.error("CPF inválido.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        kind,
        name: d.name,
        trade_name: d.trade_name || null,
        categories,
        document: doc || null,
        address: d.address || null,
        district: d.district || null,
        city: d.city || null,
        state: d.state ? d.state.toUpperCase() : null,
        zip_code: onlyDigits(d.zip_code ?? "") || null,
        contact_name: d.contact_name || null,
        phone: d.phone || null,
        email: d.email || null,
        notes: d.notes || null,
        active,
      };
      const before = editing
        ? { address: editing.address, city: editing.city, state: editing.state, zip_code: editing.zip_code }
        : null;
      const { data: saved, error } = editing
        ? await supabase
            .from("external_entities")
            .update({ ...payload, updated_by: userId })
            .eq("id", editing.id)
            .select("id")
            .maybeSingle()
        : await supabase
            .from("external_entities")
            .insert({ ...payload, organization_id: orgId!, created_by: userId })
            .select("id")
            .maybeSingle();
      if (error) throw error;
      toast.success(editing ? "Cadastro atualizado." : "Cadastro criado.");
      invalidate(["external-entities"]);
      setOpen(false);
      void autoGeocode("external_entities", saved?.id ?? editing?.id, payload, before).then(() =>
        invalidate(["external-entities"]),
      );
    } catch (err) {
      toast.error(dbMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Pessoas e empresas externas"
        description="Cadastro mestre de pessoas físicas e jurídicas de fora do órgão. A mesma entidade pode ter várias categorias e não precisa de contrato para existir aqui."
        action={
          canRegister && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Nova pessoa ou empresa
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Buscar</Label>
          <Input
            placeholder="Nome, nome fantasia, documento ou município"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label>Categoria</Label>
          <Select value={fCategory} onValueChange={setFCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as categorias</SelectItem>
              {ENTITY_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
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
              <TableHead>Nome / razão social</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Categorias</TableHead>
              <TableHead>Município / UF</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <Building className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhum cadastro encontrado.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">
                  {e.name}
                  {e.trade_name && <span className="block text-xs text-muted-foreground">{e.trade_name}</span>}
                </TableCell>
                <TableCell>{label(ENTITY_KINDS, e.kind)}</TableCell>
                <TableCell>{e.document ? (e.kind === "pj" ? maskCNPJ(e.document) : maskCPF(e.document)) : "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(e.categories ?? []).length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                    {(e.categories ?? []).map((c) => (
                      <Badge key={c} variant="secondary">
                        {entityCategoryLabel(c)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{[e.city, e.state].filter(Boolean).join(" / ") || "—"}</TableCell>
                <TableCell className="text-sm">
                  {[e.contact_name, e.phone, e.email].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={e.active ? "default" : "outline"}>{e.active ? "Ativa" : "Inativa"}</Badge>
                </TableCell>
                <TableCell>
                  {canRegister && (
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(e)}>
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cadastro" : "Nova pessoa ou empresa externa"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as EntityKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="document">{kind === "pj" ? "CNPJ" : "CPF"}</Label>
                {kind === "pj" ? (
                  <CnpjInput id="document" name="document" defaultValue={editing?.document ?? ""} />
                ) : (
                  <CpfInput id="document" name="document" defaultValue={editing?.document ?? ""} />
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="name">Nome / razão social *</Label>
                <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
              </div>
              {kind === "pj" && (
                <div className="sm:col-span-2">
                  <Label htmlFor="trade_name">Nome fantasia</Label>
                  <Input id="trade_name" name="trade_name" defaultValue={editing?.trade_name ?? ""} />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label>Categorias</Label>
                <div className="mt-1 grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                  {ENTITY_CATEGORIES.map((c) => (
                    <label key={c.value} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={categories.includes(c.value)}
                        onCheckedChange={() => setCategories((prev) => toggleValue(prev, c.value))}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Marque todas as categorias aplicáveis. A mesma empresa pode ser, por exemplo, fornecedor e oficina.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address">Endereço</Label>
                <Input id="address" name="address" defaultValue={editing?.address ?? ""} />
              </div>
              <div>
                <Label htmlFor="district">Bairro</Label>
                <Input id="district" name="district" defaultValue={editing?.district ?? ""} />
              </div>
              <div>
                <Label htmlFor="city">Município</Label>
                <Input id="city" name="city" defaultValue={editing?.city ?? ""} />
              </div>
              <div>
                <Label htmlFor="state">UF</Label>
                <Input id="state" name="state" maxLength={2} defaultValue={editing?.state ?? ""} />
              </div>
              <div>
                <Label htmlFor="zip_code">CEP</Label>
                <Input id="zip_code" name="zip_code" defaultValue={editing?.zip_code ?? ""} />
              </div>
              <div>
                <Label htmlFor="contact_name">Responsável</Label>
                <Input id="contact_name" name="contact_name" defaultValue={editing?.contact_name ?? ""} />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" defaultValue={editing?.phone ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="active" checked={active} onCheckedChange={setActive} />
                <Label htmlFor="active">Cadastro ativo</Label>
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
    </>
  );
}
