import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, FileText, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";

import { autoGeocode } from "@/lib/geocode";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { CnpjInput } from "@/components/form-fields";
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
import { isValidCNPJ, onlyDigits, parseBRNumber } from "@/lib/format";
import {
  UF_LIST,
  WORKSHOP_SPECIALTIES,
  WORKSHOP_STATUS,
  dateBR,
  dbMessage,
  formatCNPJ,
  labelOf,
  num,
  openMaintenanceFile,
  supabase,
  uploadMaintenanceFile,
  usePerms,
  useWorkshops,
  type Workshop,
  type WorkshopStatus,
} from "@/lib/frotagov";
import { useInvalidate } from "@/lib/frotagov";
import { networkCategoryLabel, useNetworkCompanies, type NetworkCompany } from "@/lib/rede";
import { CompanyDialog } from "@/routes/_authenticated/fornecedores";

export const Route = createFileRoute("/_authenticated/rede-credenciada")({
  head: () => ({
    meta: [
      { title: "Oficinas e prestadores do órgão — FrotaGov" },
      {
        name: "description",
        content:
          "Cadastro próprio do órgão de oficinas e prestadores, com especialidades, marcas atendidas, vigência e documentos.",
      },
      { property: "og:title", content: "Oficinas e prestadores do órgão — FrotaGov" },
      { property: "og:description", content: "Oficinas e prestadores cadastrados pelo próprio órgão para manutenção da frota." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RedeCredenciada,
});

const ALL = "__all__";

const schema = z.object({
  legal_name: z.string().trim().min(1, "Informe a razão social").max(200),
  trade_name: z.string().trim().max(200).optional(),
  address: z.string().trim().max(200).optional(),
  district: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  zip_code: z.string().trim().max(12).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  contact_name: z.string().trim().max(120).optional(),
  brands: z.string().trim().max(300).optional(),
  coverage_area: z.string().trim().max(200).optional(),
  accredited_at: z.string().optional(),
  accredited_until: z.string().optional(),
  notes: z.string().trim().max(800).optional(),
  latitude: z.string().trim().max(24).optional(),
  longitude: z.string().trim().max(24).optional(),
});

function RedeCredenciada() {
  const { data: workshops = [], isLoading } = useWorkshops();
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Workshop | null>(null);
  const [status, setStatus] = useState<WorkshopStatus>("em_analise");
  const [uf, setUf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [radius, setRadius] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [urgency, setUrgency] = useState(false);
  const [weekend, setWeekend] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState(ALL);
  const [fSpecialty, setFSpecialty] = useState(ALL);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workshops.filter(
      (w) =>
        (!q || `${w.legal_name} ${w.trade_name ?? ""} ${w.cnpj ?? ""} ${w.city ?? ""}`.toLowerCase().includes(q)) &&
        (fStatus === ALL || w.status === fStatus) &&
        (fSpecialty === ALL || (w.specialties ?? []).includes(fSpecialty)),
    );
  }, [workshops, search, fStatus, fSpecialty]);


  function openEdit(w: Workshop) {
    setEditing(w);
    setStatus(w.status);
    setUf(w.state ?? "");
    setCnpj(w.cnpj ?? "");
    setRadius(w.service_radius_km ? String(w.service_radius_km).replace(".", ",") : "");
    setSpecialties(w.specialties ?? []);
    setUrgency(w.urgency_24h);
    setWeekend(w.weekend_service);
    setFile(null);
    setOpen(true);
  }

  function toggleSpecialty(s: string) {
    setSpecialties((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const digits = onlyDigits(cnpj);
    if (digits && !isValidCNPJ(digits)) {
      toast.error("CNPJ inválido.");
      return;
    }
    const d = parsed.data;
    setSaving(true);
    let attachment = editing?.attachment_path ?? null;
    try {
      if (file && orgId) attachment = await uploadMaintenanceFile(orgId, file, "credenciados");
    } catch (err) {
      setSaving(false);
      toast.error(dbMessage(err));
      return;
    }
    const payload = {
      legal_name: d.legal_name,
      trade_name: d.trade_name || null,
      cnpj: digits || null,
      address: d.address || null,
      district: d.district || null,
      city: d.city || null,
      state: uf || null,
      zip_code: d.zip_code || null,
      phone: d.phone || null,
      email: d.email || null,
      contact_name: d.contact_name || null,
      status,
      accredited_at: d.accredited_at || null,
      accredited_until: d.accredited_until || null,
      specialties,
      brands: (d.brands || "")
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean),
      service_radius_km: radius ? parseBRNumber(radius) : null,
      coverage_area: d.coverage_area || null,
      latitude: d.latitude ? Number(d.latitude.replace(",", ".")) : null,
      longitude: d.longitude ? Number(d.longitude.replace(",", ".")) : null,
      urgency_24h: urgency,
      weekend_service: weekend,
      attachment_path: attachment,
      notes: d.notes || null,
    };
    const before = editing
      ? { address: editing.address, district: editing.district, city: editing.city, state: editing.state, zip_code: editing.zip_code }
      : null;
    const { data: saved, error } = editing
      ? await supabase.from("workshops").update({ ...payload, updated_by: userId }).eq("id", editing.id).select("id").maybeSingle()
      : await supabase
          .from("workshops")
          .insert({ ...payload, organization_id: orgId!, created_by: userId })
          .select("id")
          .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(editing ? "Oficina atualizada." : "Oficina credenciada cadastrada.");
    invalidate(["workshops"]);
    setOpen(false);
    if (!payload.latitude || !payload.longitude) {
      void autoGeocode("workshops", saved?.id ?? editing?.id, payload, before).then(() => invalidate(["workshops"]));
    }
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Oficinas e prestadores do órgão"
        description="Lista formada apenas pelas empresas cadastradas pelo próprio órgão com contrato ou credenciamento vigente de manutenção e higienização. O FrotaGov não fornece prestadores; o cadastro da empresa é feito em Pessoas e Empresas Externas."
        action={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/entidades-externas">
              <Building2 className="size-4" /> Cadastro de empresas
            </Link>
          </Button>
        }
      />

      <NetworkFromContracts />

      <h2 className="mb-3 mt-8 text-lg font-semibold">Oficinas cadastradas anteriormente</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Registros históricos preservados. É possível corrigir endereço, contato e localização, mas novas oficinas passam
        a entrar pela via contratual.
      </p>


      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Buscar</Label>
          <Input
            placeholder="Razão social, CNPJ, município"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {WORKSHOP_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Especialidade</Label>
          <Select value={fSpecialty} onValueChange={setFSpecialty}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {WORKSHOP_SPECIALTIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
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
              <TableHead>Oficina</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Município / UF</TableHead>
              <TableHead>Especialidades</TableHead>
              <TableHead>Credenciamento</TableHead>
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
                  <Building2 className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma oficina cadastrada pelo órgão.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <span className="font-medium">{w.trade_name || w.legal_name}</span>
                  <span className="block text-xs text-muted-foreground">{w.legal_name}</span>
                  {w.attachment_path && (
                    <button
                      type="button"
                      className="text-xs text-primary underline"
                      onClick={() => openMaintenanceFile(w.attachment_path!).catch((e) => toast.error(dbMessage(e)))}
                    >
                      Ver documento
                    </button>
                  )}
                </TableCell>
                <TableCell>{formatCNPJ(w.cnpj)}</TableCell>
                <TableCell>{[w.city, w.state].filter(Boolean).join(" / ") || "—"}</TableCell>
                <TableCell className="max-w-[240px]">
                  <span className="text-xs text-muted-foreground">
                    {(w.specialties ?? []).join(", ") || "—"}
                  </span>
                  {w.urgency_24h && <Badge variant="secondary" className="ml-1">24h</Badge>}
                </TableCell>
                <TableCell className="text-sm">
                  {w.accredited_at ? dateBR(w.accredited_at) : "—"}
                  <span className="block text-xs text-muted-foreground">
                    {w.accredited_until ? `até ${dateBR(w.accredited_until)}` : "sem validade"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={w.status === "ativo" ? "default" : "secondary"}>
                    {labelOf(WORKSHOP_STATUS, w.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canManageFleet && (
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(w)}>
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
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${editing.legal_name}` : "Nova oficina credenciada"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="legal_name">Razão social *</Label>
                <Input id="legal_name" name="legal_name" defaultValue={editing?.legal_name ?? ""} required />
              </div>
              <div>
                <Label htmlFor="trade_name">Nome fantasia</Label>
                <Input id="trade_name" name="trade_name" defaultValue={editing?.trade_name ?? ""} />
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <CnpjInput id="cnpj" name="cnpj" value={cnpj} onValueChange={setCnpj} />
              </div>
              <div>
                <Label htmlFor="contact_name">Responsável</Label>
                <Input id="contact_name" name="contact_name" defaultValue={editing?.contact_name ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address">Endereço</Label>
                <Input id="address" name="address" defaultValue={editing?.address ?? ""} />
              </div>
              <div>
                <Label htmlFor="latitude">Latitude</Label>
                <Input id="latitude" name="latitude" placeholder="-23,5505" defaultValue={editing?.latitude ?? ""} />
              </div>
              <div>
                <Label htmlFor="longitude">Longitude</Label>
                <Input id="longitude" name="longitude" placeholder="-46,6333" defaultValue={editing?.longitude ?? ""} />
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
                <Label>UF</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
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
                <Input id="zip_code" name="zip_code" defaultValue={editing?.zip_code ?? ""} />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" defaultValue={editing?.phone ?? ""} />
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} />
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as WorkshopStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKSHOP_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="accredited_at">Credenciada em</Label>
                <Input id="accredited_at" name="accredited_at" type="date" defaultValue={editing?.accredited_at ?? ""} />
              </div>
              <div>
                <Label htmlFor="accredited_until">Validade do credenciamento</Label>
                <Input
                  id="accredited_until"
                  name="accredited_until"
                  type="date"
                  defaultValue={editing?.accredited_until ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="radius">Raio de atendimento (km)</Label>
                <Input
                  id="radius"
                  inputMode="decimal"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="coverage_area">Região de atendimento</Label>
                <Input id="coverage_area" name="coverage_area" defaultValue={editing?.coverage_area ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="brands">Marcas atendidas (separadas por vírgula)</Label>
                <Input id="brands" name="brands" defaultValue={(editing?.brands ?? []).join(", ")} />
              </div>
              <div className="sm:col-span-2">
                <Label>Especialidades atendidas</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {WORKSHOP_SPECIALTIES.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={specialties.includes(s)} onCheckedChange={() => toggleSpecialty(s)} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="urgency" checked={urgency} onCheckedChange={setUrgency} />
                <Label htmlFor="urgency">Atende urgência 24h</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="weekend" checked={weekend} onCheckedChange={setWeekend} />
                <Label htmlFor="weekend">Atende finais de semana</Label>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="file" className="flex items-center gap-2">
                  <Upload className="size-4" /> Documento do credenciamento (privado)
                </Label>
                <Input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Raio informado: {radius ? `${num(parseBRNumber(radius), 2)} km` : "—"}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar oficina"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Prestadores derivados dos contratos do próprio órgão: manutenção, higienização e credenciamento.
 * Uma empresa aparece uma única vez, mesmo com vários contratos.
 */
function NetworkFromContracts() {
  const { companies, isLoading } = useNetworkCompanies(["manutencao", "higienizacao"]);
  const [detail, setDetail] = useState<NetworkCompany | null>(null);
  const paged = usePaged(companies);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>CNPJ / CPF</TableHead>
              <TableHead>Município / UF</TableHead>
              <TableHead>Contato / responsável</TableHead>
              <TableHead>Atende</TableHead>
              <TableHead>Vínculo</TableHead>
              <TableHead className="w-28" />
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
            {!isLoading && companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <Building2 className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma empresa do órgão com contrato ou credenciamento vigente de manutenção ou higienização.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((c) => {
              const first = c.contracts[0];
              return (
                <TableRow key={c.key}>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.tradeName ? <span className="block text-xs text-muted-foreground">{c.tradeName}</span> : null}
                  </TableCell>
                  <TableCell>{formatCNPJ(c.document) || "—"}</TableCell>
                  <TableCell>{[c.city, c.state].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell>{[c.contactName, c.phone].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell className="space-x-1">
                    {c.categories.map((k) => (
                      <Badge key={k} variant="outline">
                        {networkCategoryLabel(k)}
                      </Badge>
                    ))}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.accredited ? <Badge>Credenciamento</Badge> : <Badge variant="secondary">Contrato</Badge>}
                    {first ? (
                      <span className="block text-xs text-muted-foreground">
                        {first.number} · até {dateBR(first.valid_to)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => setDetail(c)}>
                      <FileText className="size-4" /> Detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>
      <CompanyDialog company={detail} onClose={() => setDetail(null)} />
    </>
  );
}
