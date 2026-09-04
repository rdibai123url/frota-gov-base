import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CreditCard, Plus, QrCode, ShieldOff, Store, Users } from "lucide-react";
import { toast } from "sonner";

import { autoGeocode } from "@/lib/geocode";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { ListPagination, usePaged } from "@/components/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isValidCNPJ, onlyDigits } from "@/lib/format";
import {
  PARTNER_KINDS,
  PARTNER_STATUS,
  PARTNER_USER_ROLES,
  PARTNER_USER_STATUS,
  kindsLabel,
  labelFrom,
  qrImageUrl,
  useAssetCards,
  useCaptures,
  usePartnerUsers,
  usePartners,
  type Partner,
  type PartnerUser,
} from "@/lib/credenciados";
import {
  brl,
  dateTimeBR,
  dbMessage,
  formatCNPJ,
  num,
  supabase,
  useInvalidate,
  usePerms,
  useSuppliers,
  useVehicles,
  useWorkshops,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/credenciados")({
  head: () => ({
    meta: [
      { title: "Credenciados e cartão virtual — FrotaGov" },
      {
        name: "description",
        content:
          "Gestão da rede credenciada com acesso ao portal externo, usuários do credenciado, cartão virtual do ativo e capturas operacionais em posto e oficina.",
      },
      { property: "og:title", content: "Credenciados e cartão virtual — FrotaGov" },
      {
        property: "og:description",
        content: "Portal do credenciado, cartão virtual do ativo e captura eletrônica de abastecimento e manutenção.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Credenciados,
});

const ALL = "__all__";
const NONE = "__none__";

const partnerSchema = z.object({
  legal_name: z.string().trim().min(1, "Informe a razão social").max(200),
  trade_name: z.string().trim().max(200).optional(),
  cnpj: z.string().trim().optional(),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(2).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  contact_name: z.string().trim().max(120).optional(),
  coverage_area: z.string().trim().max(200).optional(),
});

type PartnerForm = {
  id?: string;
  legal_name: string;
  trade_name: string;
  cnpj: string;
  kinds: string[];
  status: string;
  supplier_id: string;
  workshop_id: string;
  address: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
  coverage_area: string;
  phone: string;
  email: string;
  contact_name: string;
};

const emptyPartner: PartnerForm = {
  legal_name: "",
  trade_name: "",
  cnpj: "",
  kinds: ["abastecimento"],
  status: "ativo",
  supplier_id: NONE,
  workshop_id: NONE,
  address: "",
  city: "",
  state: "",
  latitude: "",
  longitude: "",
  coverage_area: "",
  phone: "",
  email: "",
  contact_name: "",
};

function Credenciados() {
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const { data: partners = [], isLoading } = usePartners();
  const { data: users = [] } = usePartnerUsers();
  const { data: cards = [] } = useAssetCards();
  const { data: captures = [] } = useCaptures();
  const { data: vehicles = [] } = useVehicles();
  const { data: suppliers = [] } = useSuppliers();
  const { data: workshops = [] } = useWorkshops();

  const [tab, setTab] = useState("credenciados");
  const [form, setForm] = useState<PartnerForm | null>(null);
  const [saving, setSaving] = useState(false);

  const vehicleLabel = useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach((v) => map.set(v.id, v.plate ?? v.asset_code ?? "—"));
    return map;
  }, [vehicles]);
  const partnerLabel = useMemo(() => {
    const map = new Map<string, string>();
    partners.forEach((p) => map.set(p.id, p.trade_name || p.legal_name));
    return map;
  }, [partners]);

  const pagedPartners = usePaged(partners);
  const pagedCards = usePaged(cards);
  const pagedCaptures = usePaged(captures);

  async function savePartner() {
    if (!form || !orgId) return;
    const parsed = partnerSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados");
      return;
    }
    const cnpj = onlyDigits(form.cnpj);
    if (cnpj && !isValidCNPJ(cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }
    if (!form.kinds.length) {
      toast.error("Selecione ao menos um tipo de atendimento");
      return;
    }
    setSaving(true);
    const payload = {
      organization_id: orgId,
      legal_name: form.legal_name.trim(),
      trade_name: form.trade_name.trim() || null,
      cnpj: cnpj || null,
      kinds: form.kinds as Partner["kinds"],
      status: form.status as Partner["status"],
      supplier_id: form.supplier_id === NONE ? null : form.supplier_id,
      workshop_id: form.workshop_id === NONE ? null : form.workshop_id,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim().toUpperCase() || null,
      latitude: form.latitude ? Number(form.latitude.replace(",", ".")) : null,
      longitude: form.longitude ? Number(form.longitude.replace(",", ".")) : null,
      coverage_area: form.coverage_area.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      contact_name: form.contact_name.trim() || null,
      updated_by: userId,
    };
    const { data: saved, error } = form.id
      ? await supabase.from("accredited_partners").update(payload).eq("id", form.id).select("id").maybeSingle()
      : await supabase
          .from("accredited_partners")
          .insert({ ...payload, created_by: userId })
          .select("id")
          .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(form.id ? "Credenciado atualizado" : "Credenciado cadastrado");
    const savedId = saved?.id ?? form.id;
    setForm(null);
    invalidate(["accredited-partners"]);
    if (!payload.latitude || !payload.longitude) {
      void autoGeocode("accredited_partners", savedId, payload).then(() => invalidate(["accredited-partners"]));
    }
  }

  function edit(p: Partner) {
    setForm({
      id: p.id,
      legal_name: p.legal_name,
      trade_name: p.trade_name ?? "",
      cnpj: p.cnpj ?? "",
      kinds: p.kinds ?? [],
      status: p.status ?? "ativo",
      supplier_id: p.supplier_id ?? NONE,
      workshop_id: p.workshop_id ?? NONE,
      address: p.address ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      latitude: p.latitude != null ? String(p.latitude) : "",
      longitude: p.longitude != null ? String(p.longitude) : "",
      coverage_area: p.coverage_area ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      contact_name: p.contact_name ?? "",
    });
  }

  return (
    <div>
      <PageHeader
        title="Credenciados e cartão virtual"
        description="Rede credenciada com acesso ao portal externo, usuários operadores, cartão virtual do ativo e capturas realizadas em posto e oficina. O cartão virtual é identificação e autorização operacional — não é meio de pagamento."
        action={
          canManageFleet ? (
            <Button onClick={() => setForm({ ...emptyPartner })}>
              <Plus className="mr-2 h-4 w-4" /> Novo credenciado
            </Button>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="credenciados">
            <Store className="mr-2 h-4 w-4" /> Credenciados
          </TabsTrigger>
          <TabsTrigger value="usuarios">
            <Users className="mr-2 h-4 w-4" /> Usuários do credenciado
          </TabsTrigger>
          <TabsTrigger value="cartoes">
            <CreditCard className="mr-2 h-4 w-4" /> Cartão virtual do ativo
          </TabsTrigger>
          <TabsTrigger value="capturas">
            <QrCode className="mr-2 h-4 w-4" /> Capturas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="credenciados">
          <div className="gov-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credenciado</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Atendimentos</TableHead>
                  <TableHead>Município / UF</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6}>Carregando…</TableCell>
                  </TableRow>
                )}
                {!isLoading && partners.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Nenhum credenciado cadastrado.
                    </TableCell>
                  </TableRow>
                )}
                {pagedPartners.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.trade_name || p.legal_name}</div>
                      <div className="text-xs text-muted-foreground">{p.legal_name}</div>
                    </TableCell>
                    <TableCell>{p.cnpj ? formatCNPJ(p.cnpj) : "—"}</TableCell>
                    <TableCell className="max-w-[220px] text-sm">{kindsLabel(p.kinds)}</TableCell>
                    <TableCell>
                      {[p.city, p.state].filter(Boolean).join(" / ") || "—"}
                      {p.latitude != null && p.longitude != null && (
                        <div className="text-xs text-muted-foreground">
                          {num(p.latitude, 5)}, {num(p.longitude, 5)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "ativo" ? "default" : "secondary"}>
                        {labelFrom(PARTNER_STATUS, p.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManageFleet && (
                        <Button variant="outline" size="sm" onClick={() => edit(p)}>
                          Editar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination state={pagedPartners} />
          </div>
        </TabsContent>

        <TabsContent value="usuarios">
          <PartnerUsersPanel partners={partners} users={users} />
        </TabsContent>

        <TabsContent value="cartoes">
          <CardsPanel
            cards={cards}
            paged={pagedCards}
            vehicleLabel={vehicleLabel}
            vehicles={vehicles.map((v) => ({ id: v.id, label: v.plate ?? v.asset_code ?? "—" }))}
          />
        </TabsContent>

        <TabsContent value="capturas">
          <div className="gov-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Credenciado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Autorizado</TableHead>
                  <TableHead className="text-right">Capturado</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {captures.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      Nenhuma captura registrada.
                    </TableCell>
                  </TableRow>
                )}
                {pagedCaptures.rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{dateTimeBR(c.captured_at)}</TableCell>
                    <TableCell>{(c.partner_id ? partnerLabel.get(c.partner_id) : null) ?? "—"}</TableCell>
                    <TableCell>{c.kind}</TableCell>
                    <TableCell>{c.vehicle_id ? (vehicleLabel.get(c.vehicle_id) ?? "—") : "—"}</TableCell>
                    <TableCell className="text-right">
                      {c.authorized_quantity != null ? num(c.authorized_quantity, 4) : brl(c.authorized_value)}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.captured_quantity != null ? num(c.captured_quantity, 4) : brl(c.captured_value)}
                    </TableCell>
                    <TableCell>{c.document_number ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "rejeitada" ? "destructive" : "secondary"}>{c.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination state={pagedCaptures} />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(form)} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar credenciado" : "Novo credenciado"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Razão social *</Label>
                <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
              </div>
              <div>
                <Label>Nome fantasia</Label>
                <Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Habilitado para</Label>
                <div className="mt-2 flex flex-wrap gap-4">
                  {PARTNER_KINDS.map((k) => (
                    <label key={k.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.kinds.includes(k.value)}
                        onCheckedChange={(v) =>
                          setForm({
                            ...form,
                            kinds: v ? [...form.kinds, k.value] : form.kinds.filter((i) => i !== k.value),
                          })
                        }
                      />
                      {k.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTNER_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fornecedor / posto vinculado</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não vinculado</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.trade_name || s.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Oficina vinculada</Label>
                <Select value={form.workshop_id} onValueChange={(v) => setForm({ ...form, workshop_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não vinculada</SelectItem>
                    {workshops.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.trade_name || w.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Contato</Label>
                <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div>
                <Label>Município</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label>UF</Label>
                <Input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </div>
              <div>
                <Label>Latitude (opcional)</Label>
                <Input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
              </div>
              <div>
                <Label>Longitude (opcional)</Label>
                <Input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Área de abrangência</Label>
                <Textarea
                  rows={2}
                  value={form.coverage_area}
                  onChange={(e) => setForm({ ...form, coverage_area: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button onClick={savePartner} disabled={saving}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------- usuários do credenciado ------------------------- */

function PartnerUsersPanel({
  partners,
  users,
}: {
  partners: Partner[];
  users: ReturnType<typeof usePartnerUsers>["data"];
}) {
  const { canManageFleet, orgId } = usePerms();
  const invalidate = useInvalidate();
  const [filter, setFilter] = useState(ALL);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    partner_id: "",
    full_name: "",
    email: "",
    phone: "",
    role: "operador",
  });

  const list = (users ?? []).filter((u) => filter === ALL || u.partner_id === filter);
  const paged = usePaged(list);
  const label = useMemo(() => {
    const map = new Map<string, string>();
    partners.forEach((p) => map.set(p.id, p.trade_name || p.legal_name));
    return map;
  }, [partners]);

  async function save() {
    if (!orgId || !form.partner_id || !form.full_name.trim() || !form.email.trim()) {
      toast.error("Informe credenciado, nome e e-mail");
      return;
    }
    const { error } = await supabase.from("partner_users").insert({
      organization_id: orgId,
      partner_id: form.partner_id,
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      role: form.role as PartnerUser["role"],
    });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Usuário do credenciado cadastrado. O acesso é liberado no primeiro login com este e-mail.");
    setOpen(false);
    setForm({ partner_id: "", full_name: "", email: "", phone: "", role: "operador" });
    invalidate(["partner-users"]);
  }

  async function setStatus(id: string, status: string, reason?: string) {
    const { error } = await supabase
      .from("partner_users")
      .update({
        status: status as PartnerUser["status"],
        blocked_at: status === "bloqueado" ? new Date().toISOString() : null,
        blocked_reason: status === "bloqueado" ? (reason ?? "Bloqueio administrativo") : null,
      })
      .eq("id", id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(status === "bloqueado" ? "Acesso bloqueado" : "Acesso liberado");
    invalidate(["partner-users"]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>Credenciado</Label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {partners.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.trade_name || p.legal_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManageFleet && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo usuário
          </Button>
        )}
      </div>

      <div className="gov-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Credenciado</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name}</TableCell>
                <TableCell>{label.get(u.partner_id) ?? "—"}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{labelFrom(PARTNER_USER_ROLES, u.role)}</TableCell>
                <TableCell>{dateTimeBR(u.last_access_at)}</TableCell>
                <TableCell>
                  <Badge variant={u.status === "ativo" ? "default" : "destructive"}>
                    {labelFrom(PARTNER_USER_STATUS, u.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canManageFleet && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStatus(u.id, u.status === "ativo" ? "bloqueado" : "ativo")}
                    >
                      {u.status === "ativo" ? "Bloquear" : "Desbloquear"}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário do credenciado</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Credenciado *</Label>
              <Select value={form.partner_id} onValueChange={(v) => setForm({ ...form, partner_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.trade_name || p.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>E-mail *</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Perfil</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_USER_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------- cartão virtual ----------------------------- */

function CardsPanel({
  cards,
  paged,
  vehicleLabel,
  vehicles,
}: {
  cards: ReturnType<typeof useAssetCards>["data"];
  paged: ReturnType<typeof usePaged<NonNullable<ReturnType<typeof useAssetCards>["data"]>[number]>>;
  vehicleLabel: Map<string, string>;
  vehicles: { id: string; label: string }[];
}) {
  const { canManageFleet } = usePerms();
  const invalidate = useInvalidate();
  const [vehicle, setVehicle] = useState("");
  const [show, setShow] = useState<string | null>(null);

  async function issue() {
    if (!vehicle) {
      toast.error("Selecione o ativo");
      return;
    }
    const { error } = await supabase.rpc("asset_card_issue", { _vehicle: vehicle });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Cartão virtual emitido");
    setVehicle("");
    invalidate(["asset-cards"]);
  }

  async function revoke(id: string) {
    const reason = window.prompt("Motivo da invalidação:");
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("asset_card_revoke", { _card: id, _reason: reason.trim() });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Cartão invalidado");
    invalidate(["asset-cards"]);
  }

  const current = (cards ?? []).find((c) => c.id === show) ?? null;

  return (
    <div className="space-y-4">
      <div className="gov-card p-4 text-sm text-muted-foreground">
        O cartão virtual identifica o ativo na rede credenciada (órgão, ativo, placa ou patrimônio, situação,
        combustível e autorizações abertas). Não expõe dados pessoais e não é meio de pagamento.
      </div>
      {canManageFleet && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72">
            <Label>Ativo</Label>
            <Select value={vehicle} onValueChange={setVehicle}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o veículo ou equipamento" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={issue}>
            <CreditCard className="mr-2 h-4 w-4" /> Emitir / reemitir cartão
          </Button>
        </div>
      )}

      <div className="gov-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(cards ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Nenhum cartão emitido.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono">{c.code}</TableCell>
                <TableCell>{vehicleLabel.get(c.vehicle_id) ?? "—"}</TableCell>
                <TableCell>{dateTimeBR(c.issued_at)}</TableCell>
                <TableCell>{c.uses_count}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "ativo" ? "default" : "destructive"}>{c.status}</Badge>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => setShow(c.id)}>
                    <QrCode className="mr-1 h-4 w-4" /> Ver
                  </Button>
                  {canManageFleet && c.status === "ativo" && (
                    <Button variant="outline" size="sm" onClick={() => revoke(c.id)}>
                      <ShieldOff className="mr-1 h-4 w-4" /> Invalidar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      <Dialog open={Boolean(current)} onOpenChange={(o) => !o && setShow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cartão virtual {current?.code}</DialogTitle>
          </DialogHeader>
          {current && (
            <div className="space-y-3 text-center">
              <img
                src={qrImageUrl(current.qr_token)}
                alt={`QR Code do cartão virtual ${current.code}`}
                className="mx-auto h-56 w-56 rounded-md border border-border bg-white p-2"
                loading="lazy"
              />
              <div className="text-sm">
                <div className="font-medium">{vehicleLabel.get(current.vehicle_id) ?? "—"}</div>
                <div className="text-muted-foreground">
                  Código de segurança: <span className="font-mono">{current.security_code}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Identificação e autorização operacional. Não é meio de pagamento.
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
