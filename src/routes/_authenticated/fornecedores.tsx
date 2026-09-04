import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Search, FileText } from "lucide-react";
import { toast } from "sonner";

import { autoGeocode } from "@/lib/geocode";
import { z } from "zod";

import { CnpjInput } from "@/components/form-fields";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  UF_LIST,
  isValidCNPJ,
  maskCEP,
  maskCNPJ,
  supabase,
  useInvalidate,
  usePerms,
  useSuppliers,
  type Supplier,
  formatCNPJ,
  onlyDigits,
  brl,
  dateBR,
  label as labelOf,
  CONTRACT_STATUS,
  useContracts,
  useSupplierContracts,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores e Postos — FrotaGov" },
      {
        name: "description",
        content: "Cadastro de fornecedores e postos de combustível utilizados pelo órgão público.",
      },
      { property: "og:title", content: "Fornecedores e Postos — FrotaGov" },
      { property: "og:description", content: "Gerencie os postos e fornecedores de combustível do órgão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Fornecedores,
});

const NONE = "__none__";

const schema = z.object({
  legal_name: z.string().trim().min(2, "Informe a razão social").max(150),
  trade_name: z.string().trim().max(150).optional(),
  cnpj: z.string().trim().max(20).optional(),
  state_registration: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  zip_code: z.string().trim().max(12).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(255).optional(),
  contact_name: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

function Fornecedores() {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const { canWrite, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [uf, setUf] = useState<string>(NONE);
  const [active, setActive] = useState(true);
  const [cnpj, setCnpj] = useState("");
  const [cep, setCep] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [linkFor, setLinkFor] = useState<Supplier | null>(null);
  const { data: links = [] } = useSupplierContracts();

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return suppliers;
    return suppliers.filter((s) =>
      [s.legal_name, s.trade_name, s.cnpj, s.city].some((v) => (v ?? "").toLowerCase().includes(t)),
    );
  }, [suppliers, q]);

  function openNew() {
    setEditing(null);
    setUf(NONE);
    setActive(true);
    setCnpj("");
    setCep("");
    setOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setUf(s.state || NONE);
    setActive(s.active);
    setCnpj(maskCNPJ(s.cnpj ?? ""));
    setCep(s.zip_code ?? "");
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (cnpj && !isValidCNPJ(cnpj)) {
      toast.error("CNPJ inválido.");
      return;
    }
    setSaving(true);
    const payload = {
      legal_name: parsed.data.legal_name,
      trade_name: parsed.data.trade_name || null,
      cnpj: onlyDigits(cnpj) || null,
      state_registration: parsed.data.state_registration || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      state: uf === NONE ? null : uf,
      zip_code: cep || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      contact_name: parsed.data.contact_name || null,
      notes: parsed.data.notes || null,
      active,
    };
    const before = editing
      ? { address: editing.address, city: editing.city, state: editing.state, zip_code: editing.zip_code }
      : null;
    const { data: saved, error } = editing
      ? await supabase.from("suppliers").update(payload).eq("id", editing.id).select("id").maybeSingle()
      : await supabase
          .from("suppliers")
          .insert({ ...payload, organization_id: orgId!, created_by: userId })
          .select("id")
          .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o fornecedor.");
      return;
    }
    toast.success(editing ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
    invalidate(["suppliers"]);
    setOpen(false);
    void autoGeocode("suppliers", saved?.id ?? editing?.id, payload, before).then(() => invalidate(["suppliers"]));
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Fornecedores / Postos"
        description="Postos e fornecedores de combustível habilitados para o órgão."
        action={
          canWrite && orgId ? (
            <Button onClick={openNew} className="gap-2">
              <Plus className="size-4" /> Novo fornecedor
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por razão social, CNPJ ou município"
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razão social</TableHead>
              <TableHead>Nome fantasia</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Município / UF</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Contratos</TableHead>
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
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Nenhum fornecedor cadastrado.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.legal_name}</TableCell>
                <TableCell>{s.trade_name || "—"}</TableCell>
                <TableCell>{formatCNPJ(s.cnpj)}</TableCell>
                <TableCell>{[s.city, s.state].filter(Boolean).join(" / ") || "—"}</TableCell>
                <TableCell>{s.contact_name || s.phone || "—"}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={() => setLinkFor(s)}
                    aria-label="Contratos vinculados"
                  >
                    <FileText className="size-4" />
                    {links.filter((l) => l.supplier_id === s.id && l.active).length}
                  </Button>
                </TableCell>
                <TableCell>
                  <Badge variant={s.active ? "default" : "secondary"}>
                    {s.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canWrite && (
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Editar">
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
            <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor / posto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="legal_name">Razão social *</Label>
                <Input id="legal_name" name="legal_name" defaultValue={editing?.legal_name ?? ""} required />
              </div>
              <div>
                <Label htmlFor="trade_name">Nome fantasia</Label>
                <Input id="trade_name" name="trade_name" defaultValue={editing?.trade_name ?? ""} />
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <CnpjInput id="cnpj" value={cnpj} onValueChange={setCnpj} />
              </div>
              <div>
                <Label htmlFor="state_registration">Inscrição estadual</Label>
                <Input
                  id="state_registration"
                  name="state_registration"
                  defaultValue={editing?.state_registration ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="contact_name">Responsável / contato</Label>
                <Input id="contact_name" name="contact_name" defaultValue={editing?.contact_name ?? ""} />
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
                <Label>UF</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {UF_LIST.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="zip_code">CEP</Label>
                <Input
                  id="zip_code"
                  value={cep}
                  onChange={(e) => setCep(maskCEP(e.target.value))}
                  placeholder="00000-000"
                  inputMode="numeric"
                />
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
                <Textarea id="notes" name="notes" rows={3} defaultValue={editing?.notes ?? ""} />
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

      <SupplierContractsDialog supplier={linkFor} onClose={() => setLinkFor(null)} />
    </>
  );
}

/* --------------------- vínculo fornecedor x contrato --------------------- */

function SupplierContractsDialog({
  supplier,
  onClose,
}: {
  supplier: Supplier | null;
  onClose: () => void;
}) {
  const { canWrite, orgId, userId } = usePerms();
  const { data: contracts = [] } = useContracts();
  const { data: links = [] } = useSupplierContracts();
  const invalidate = useInvalidate();
  const [contractId, setContractId] = useState("");
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);

  const mine = links.filter((l) => l.supplier_id === supplier?.id);
  const linkedIds = new Set(mine.filter((l) => l.active).map((l) => l.contract_id));
  const supplierDigits = onlyDigits(supplier?.cnpj ?? "");
  const selected = contracts.find((c) => c.id === contractId) ?? null;
  const sameCnpj = !!selected && !!supplierDigits && onlyDigits(selected.cnpj ?? "") === supplierDigits;
  const available = contracts.filter(
    (c) => !linkedIds.has(c.id) && ["vigente", "suspenso", "rascunho"].includes(c.status),
  );

  async function addLink() {
    if (!supplier || !contractId) return;
    if (!sameCnpj && justification.trim().length < 10) {
      toast.error("CNPJ divergente do contrato: informe a justificativa administrativa (mín. 10 caracteres).");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("supplier_contracts").insert({
      organization_id: orgId!,
      supplier_id: supplier.id,
      contract_id: contractId,
      justification: justification.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Não foi possível vincular o contrato.");
      return;
    }
    toast.success("Contrato vinculado ao fornecedor.");
    setContractId("");
    setJustification("");
    invalidate(["supplier-contracts"]);
  }

  async function toggleLink(id: string, active: boolean) {
    const { error } = await supabase
      .from("supplier_contracts")
      .update({ active, updated_by: userId })
      .eq("id", id);
    if (error) {
      toast.error("Não foi possível atualizar o vínculo.");
      return;
    }
    toast.success(active ? "Vínculo reativado." : "Vínculo desativado.");
    invalidate(["supplier-contracts"]);
  }

  return (
    <Dialog open={!!supplier} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contratos vinculados — {supplier?.legal_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Valor atual</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                      Nenhum contrato vinculado a este fornecedor.
                    </TableCell>
                  </TableRow>
                )}
                {mine.map((l) => (
                  <TableRow key={l.id} className={l.active ? "" : "opacity-50"}>
                    <TableCell className="font-medium">{l.contract?.number ?? "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{l.contract?.object ?? "—"}</TableCell>
                    <TableCell>
                      {dateBR(l.contract?.valid_from)} a {dateBR(l.contract?.valid_to)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.contract?.status === "vigente" ? "default" : "secondary"}>
                        {labelOf(CONTRACT_STATUS, l.contract?.status ?? null)}
                      </Badge>
                    </TableCell>
                    <TableCell>{brl(Number(l.contract?.current_value ?? 0))}</TableCell>
                    <TableCell>
                      <Badge variant={l.cnpj_match ? "default" : "outline"}>
                        {l.cnpj_match ? "Compatível" : "Divergente (justificado)"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canWrite && (
                        <Button variant="ghost" size="sm" onClick={() => toggleLink(l.id, !l.active)}>
                          {l.active ? "Desativar" : "Reativar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {canWrite && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <Label>Vincular novo contrato</Label>
              <Select value={contractId} onValueChange={setContractId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um contrato do órgão" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.number} · {c.object?.slice(0, 40)} · {dateBR(c.valid_from)}–{dateBR(c.valid_to)} ·{" "}
                      {labelOf(CONTRACT_STATUS, c.status)} · {brl(Number(c.current_value ?? 0))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && !sameCnpj && (
                <>
                  <p className="text-sm text-amber-700">
                    O CNPJ do contratado ({formatCNPJ(selected.cnpj)}) não corresponde ao do fornecedor (
                    {formatCNPJ(supplier?.cnpj ?? null)}). Justificativa administrativa obrigatória.
                  </p>
                  <Textarea
                    rows={2}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Justificativa administrativa do vínculo"
                  />
                </>
              )}
              <Button onClick={addLink} disabled={!contractId || saving} className="gap-2">
                <Plus className="size-4" /> Vincular contrato
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
