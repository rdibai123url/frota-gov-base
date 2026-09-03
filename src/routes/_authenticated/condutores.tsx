import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Pencil, IdCard, Plane } from "lucide-react";
import { toast } from "sonner";

import { CpfInput } from "@/components/form-fields";
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
  DialogDescription,
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
  CNH_CATEGORIES,
  CNH_LABELS,
  DRIVER_BONDS,
  cnhState,
  dateBR,
  dateTimeBR,
  isValidCPF,
  label,
  maskCPF,
  supabase,
  useDrivers,
  useInvalidate,
  usePerms,
  useUnits,
  type DriverRow,
} from "@/lib/frotagov";
import { formatMoney } from "@/lib/format";
import { useDiaries, DIARY_STATUS } from "@/lib/diarias";

export const Route = createFileRoute("/_authenticated/condutores")({
  head: () => ({
    meta: [
      { title: "Condutores — FrotaGov" },
      {
        name: "description",
        content:
          "Cadastro estruturado de condutores do órgão, com matrícula funcional, vínculo, unidade e controle de validade da CNH.",
      },
      { property: "og:title", content: "Condutores — FrotaGov" },
      { property: "og:description", content: "Gestão de condutores habilitados da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Condutores,
});

const NONE = "__none__";
const ALL = "__all__";
const PAGE_SIZE = 12;

function CnhBadge({ expiry }: { expiry: string | null }) {
  const state = cnhState(expiry);
  if (state === "vencida") return <Badge variant="destructive">Vencida</Badge>;
  if (state === "a_vencer") return <Badge className="bg-warning text-warning-foreground">A vencer</Badge>;
  if (state === "sem_registro") return <Badge variant="outline">Sem validade</Badge>;
  return <Badge variant="secondary">Regular</Badge>;
}

function Condutores() {
  const { data: drivers = [], isLoading } = useDrivers();
  const { data: units = [] } = useUnits();
  const perms = usePerms();
  const invalidate = useInvalidate();

  const [q, setQ] = useState("");
  const [fUnit, setFUnit] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DriverRow | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [history, setHistory] = useState<string | null>(null);
  const { data: diaries = [] } = useDiaries();

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return drivers.filter((d) => {
      if (fUnit !== ALL && d.unit_id !== fUnit) return false;
      if (fStatus === "ativo" && !d.active) return false;
      if (fStatus === "inativo" && d.active) return false;
      if (fStatus === "cnh_vencida" && cnhState(d.license_expiry) !== "vencida") return false;
      if (fStatus === "cnh_a_vencer" && cnhState(d.license_expiry) !== "a_vencer") return false;
      if (t) {
        const hay = [d.full_name, d.registration_number, d.license_number, d.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [drivers, q, fUnit, fStatus]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const vencidas = drivers.filter((d) => cnhState(d.license_expiry) === "vencida").length;
  const aVencer = drivers.filter((d) => cnhState(d.license_expiry) === "a_vencer").length;

  return (
    <>
      <PageHeader
        title="Condutores"
        description="Cadastro estruturado dos condutores autorizados a operar a frota do órgão."
        action={
          perms.canWrite ? (
            <Button className="gap-2" onClick={() => setOpenNew(true)}>
              <Plus className="size-4" /> Novo condutor
            </Button>
          ) : undefined
        }
      />

      {(vencidas > 0 || aVencer > 0) && (
        <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <IdCard className="size-4 shrink-0" />
          <span>
            {vencidas > 0 && <strong>{vencidas} condutor(es) com CNH vencida. </strong>}
            {aVencer > 0 && <>{aVencer} condutor(es) com CNH a vencer nos próximos 30 dias.</>}
          </span>
        </div>
      )}

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2">
          <Label className="text-xs">Busca (nome, matrícula, CNH ou e-mail)</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Buscar…" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Unidade</Label>
          <Select value={fUnit} onValueChange={setFUnit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.acronym || u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
              <SelectItem value="cnh_vencida">CNH vencida</SelectItem>
              <SelectItem value="cnh_a_vencer">CNH a vencer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Matrícula</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Vínculo</TableHead>
              <TableHead>Categorias</TableHead>
              <TableHead>Validade CNH</TableHead>
              <TableHead>CNH</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Diárias</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  Nenhum condutor cadastrado para os filtros informados.
                </TableCell>
              </TableRow>
            )}
            {rows.map((d) => (
              <TableRow key={d.id} className={d.active ? undefined : "opacity-60"}>
                <TableCell className="font-medium">{d.full_name}</TableCell>
                <TableCell>{d.registration_number || "—"}</TableCell>
                <TableCell>{d.unit?.acronym || d.unit?.name || "—"}</TableCell>
                <TableCell>{label(DRIVER_BONDS, d.bond_type)}</TableCell>
                <TableCell>{(d.license_categories ?? []).join(", ") || "—"}</TableCell>
                <TableCell>{dateBR(d.license_expiry)}</TableCell>
                <TableCell><CnhBadge expiry={d.license_expiry} /></TableCell>
                <TableCell>
                  {d.active ? <Badge variant="default">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={() => setHistory(d.id)}
                    aria-label={`Diárias de ${d.full_name}`}
                  >
                    <Plane className="size-4" />
                    {diaries.filter((x) => x.beneficiary_driver_id === d.id).length}
                  </Button>
                </TableCell>
                <TableCell>
                  {perms.canWrite && (
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditing(d)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {filtered.length} condutor(es) · página {current} de {pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      {history && (
        <Dialog open onOpenChange={(v) => !v && setHistory(null)}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Histórico de diárias</DialogTitle>
              <DialogDescription>
                {drivers.find((d) => d.id === history)?.full_name ?? "Condutor"}
              </DialogDescription>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead>Retorno</TableHead>
                  <TableHead>Valor total</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diaries.filter((x) => x.beneficiary_driver_id === history).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Nenhuma diária registrada para este condutor.
                    </TableCell>
                  </TableRow>
                )}
                {diaries
                  .filter((x) => x.beneficiary_driver_id === history)
                  .map((x) => (
                    <TableRow key={x.id}>
                      <TableCell className="font-medium">{x.code ?? "—"}</TableCell>
                      <TableCell>
                        {[x.destination_city, x.destination_state].filter(Boolean).join("/") || "—"}
                      </TableCell>
                      <TableCell>{dateTimeBR(x.departure_at)}</TableCell>
                      <TableCell>{x.return_at ? dateTimeBR(x.return_at) : "—"}</TableCell>
                      <TableCell>{formatMoney(Number(x.total_value || 0))}</TableCell>
                      <TableCell>{DIARY_STATUS[x.status]}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>
      )}

      {(openNew || editing) && (
        <DriverDialog
          driver={editing}
          onClose={() => {
            setOpenNew(false);
            setEditing(null);
          }}
          onSaved={() => invalidate(["drivers"])}
        />
      )}
    </>
  );
}

function DriverDialog({
  driver,
  onClose,
  onSaved,
}: {
  driver: DriverRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: units = [] } = useUnits();
  const perms = usePerms();

  const [fullName, setFullName] = useState(driver?.full_name ?? "");
  const [cpf, setCpf] = useState(driver?.cpf ? maskCPF(driver.cpf) : "");
  const [registration, setRegistration] = useState(driver?.registration_number ?? "");
  const [unitId, setUnitId] = useState(driver?.unit_id ?? NONE);
  const [bond, setBond] = useState(driver?.bond_type ?? "efetivo");
  const [phone, setPhone] = useState(driver?.phone ?? "");
  const [email, setEmail] = useState(driver?.email ?? "");
  const [license, setLicense] = useState(driver?.license_number ?? "");
  const [categories, setCategories] = useState<string[]>(driver?.license_categories ?? []);
  const [expiry, setExpiry] = useState(driver?.license_expiry ?? "");
  const [firstIssue, setFirstIssue] = useState(driver?.license_first_issue ?? "");
  const [active, setActive] = useState(driver?.active ?? true);
  const [notes, setNotes] = useState(driver?.notes ?? "");
  const [saving, setSaving] = useState(false);

  function toggleCategory(c: string) {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function submit() {
    if (fullName.trim().length < 3) {
      toast.error("Informe o nome completo do condutor.");
      return;
    }
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits && !isValidCPF(cpfDigits)) {
      toast.error("CPF inválido.");
      return;
    }
    if (!perms.orgId) {
      toast.error("Seu usuário não está vinculado a um órgão.");
      return;
    }

    setSaving(true);
    const payload = {
      organization_id: perms.orgId,
      unit_id: unitId === NONE ? null : unitId,
      full_name: fullName.trim(),
      cpf: cpfDigits || null,
      registration_number: registration.trim() || null,
      bond_type: bond as typeof bond,
      phone: phone.trim() || null,
      email: email.trim() || null,
      license_number: license.trim() || null,
      license_categories: categories,
      license_expiry: expiry || null,
      license_first_issue: firstIssue || null,
      active,
      notes: notes.trim() || null,
    };

    const { error } = driver
      ? await supabase.from("drivers").update(payload).eq("id", driver.id)
      : await supabase.from("drivers").insert({ ...payload, created_by: perms.userId });

    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Já existe condutor com este CPF ou matrícula neste órgão."
          : "Não foi possível salvar. Verifique suas permissões.",
      );
      return;
    }
    toast.success(driver ? "Condutor atualizado." : "Condutor cadastrado.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{driver ? "Editar condutor" : "Novo condutor"}</DialogTitle>
          <DialogDescription>
            CPF e matrícula são únicos dentro do órgão. Dados pessoais são exibidos apenas nesta tela restrita.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name">Nome completo *</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cpf">CPF</Label>
            <CpfInput id="cpf" value={cpf} onValueChange={setCpf} />
          </div>
          <div>
            <Label htmlFor="reg">Matrícula funcional</Label>
            <Input id="reg" value={registration} onChange={(e) => setRegistration(e.target.value)} />
          </div>
          <div>
            <Label>Secretaria / unidade</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não vinculado</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vínculo *</Label>
            <Select value={bond} onValueChange={(v) => setBond(v as typeof bond)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DRIVER_BONDS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cnh">Número da CNH</Label>
            <Input id="cnh" value={license} onChange={(e) => setLicense(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="exp">Validade da CNH</Label>
            <Input id="exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="first">Primeira habilitação</Label>
            <Input id="first" type="date" value={firstIssue} onChange={(e) => setFirstIssue(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Categorias da CNH</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CNH_CATEGORIES.map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={categories.includes(c) ? "default" : "outline"}
                  onClick={() => toggleCategory(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A compatibilidade entre categoria e tipo de veículo é sinalizada como orientação; a validação
              bloqueante depende da classificação técnica da frota, prevista para a próxima fase.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-md border p-3 sm:col-span-2">
            <Switch id="active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="active" className="cursor-pointer">
              Condutor ativo (inativos não podem receber novas autorizações)
            </Label>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {expiry && cnhState(expiry) !== "ok" && (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            Atenção: CNH — {CNH_LABELS[cnhState(expiry)]}.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar condutor"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
