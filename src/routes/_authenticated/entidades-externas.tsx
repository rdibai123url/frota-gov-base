import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { CnpjInput, CpfInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
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
      { title: "Entidades Externas — FrotaGov" },
      {
        name: "description",
        content:
          "Cadastro reutilizável de pessoas físicas e jurídicas externas envolvidas em cessões, doações, leilões e sinistros da frota.",
      },
      { property: "og:title", content: "Entidades Externas — FrotaGov" },
      { property: "og:description", content: "Pessoas e entidades externas vinculadas à gestão patrimonial da frota." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Entidades,
});

const schema = z.object({
  name: z.string().trim().min(3, "Informe o nome ou razão social").max(160),
  document: z.string().trim().optional(),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional(),
  zip_code: z.string().trim().max(20).optional(),
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
  const [active, setActive] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entities.filter((e) => !q || `${e.name} ${e.document ?? ""} ${e.city ?? ""}`.toLowerCase().includes(q));
  }, [entities, search]);

  function openNew() {
    setEditing(null);
    setKind("pj");
    setActive(true);
    setOpen(true);
  }

  function openEdit(e: ExternalEntity) {
    setEditing(e);
    setKind(e.kind);
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
        document: doc || null,
        address: d.address || null,
        city: d.city || null,
        state: d.state ? d.state.toUpperCase() : null,
        zip_code: onlyDigits(d.zip_code ?? "") || null,
        phone: d.phone || null,
        email: d.email || null,
        notes: d.notes || null,
        active,
      };
      const { error } = editing
        ? await supabase.from("external_entities").update({ ...payload, updated_by: userId }).eq("id", editing.id)
        : await supabase
            .from("external_entities")
            .insert({ ...payload, organization_id: orgId!, created_by: userId });
      if (error) throw error;
      toast.success(editing ? "Entidade atualizada." : "Entidade cadastrada.");
      invalidate(["external-entities"]);
      setOpen(false);
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
        title="Entidades externas"
        description="Pessoas físicas e jurídicas de fora do órgão reutilizadas em cessões, doações, leilões, alienações e sinistros."
        action={
          canRegister && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Nova entidade
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-sm">
        <Label>Buscar</Label>
        <Input placeholder="Nome, documento ou município" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome / razão social</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Município / UF</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-16" />
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
                  <Building className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma entidade cadastrada.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell>{label(ENTITY_KINDS, e.kind)}</TableCell>
                <TableCell>{e.document ? (e.kind === "pj" ? maskCNPJ(e.document) : maskCPF(e.document)) : "—"}</TableCell>
                <TableCell>{[e.city, e.state].filter(Boolean).join(" / ") || "—"}</TableCell>
                <TableCell className="text-sm">{[e.phone, e.email].filter(Boolean).join(" · ") || "—"}</TableCell>
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
            <DialogTitle>{editing ? "Editar entidade" : "Nova entidade externa"}</DialogTitle>
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
              <div className="sm:col-span-2">
                <Label htmlFor="address">Endereço</Label>
                <Input id="address" name="address" defaultValue={editing?.address ?? ""} />
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
                <Label htmlFor="active">Entidade ativa</Label>
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
