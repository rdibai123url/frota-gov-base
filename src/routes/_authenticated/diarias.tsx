import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Printer, Eye, Ban, CheckCircle2, FileCheck2, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ListPagination, usePaged } from "@/components/list-pagination";
import { CpfInput, DecimalInput, MoneyInput } from "@/components/form-fields";
import {
  supabase,
  useBrasaoUrl,
  useDrivers,
  useInvalidate,
  useOrganization,
  usePerms,
  useUnits,
  useVehicleUsages,
  useVehicles,
} from "@/lib/frotagov";
import { useCostCenters, useCommitments } from "@/lib/frotagov";
import { useEmployees, useLegalProvisions } from "@/lib/pessoas";
import { formatCPF, formatMoney, formatNumberBR, onlyDigits, parseBRNumber, isValidCPF } from "@/lib/format";
import {
  DIARY_PROOF_STATUS,
  DIARY_STATUS,
  DIARY_STATUS_STYLE,
  moneyInWords,
  useDiaries,
  type DiaryRow,
  type DiaryStatus,
} from "@/lib/diarias";

export const Route = createFileRoute("/_authenticated/diarias")({
  head: () => ({
    meta: [
      { title: "Diárias — FrotaGov" },
      {
        name: "description",
        content:
          "Requisição de Diária (RD) e Comprovação de Diária (CD) de servidores em viagem oficial, com autorização, valor por extenso e prestação de contas.",
      },
      { property: "og:title", content: "Diárias — FrotaGov" },
      { property: "og:description", content: "Controle de diárias e prestação de contas da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Diarias,
});

const ALL = "__all__";
const NONE = "__none__";

const esc = (v: unknown) =>
  String(v ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const dt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function Diarias() {
  const { data: diaries = [], isLoading } = useDiaries();
  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: usages = [] } = useVehicleUsages();
  const { data: costCenters = [] } = useCostCenters();
  const { data: commitments = [] } = useCommitments();
  const { data: org } = useOrganization();
  const { data: brasao } = useBrasaoUrl(org?.logo_url);
  const perms = usePerms();
  const { data: employees = [] } = useEmployees();
  const { data: provisions = [] } = useLegalProvisions();
  const activeEmployees = employees.filter((e) => e.active);
  const invalidate = useInvalidate();

  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState(ALL);
  const [fUnit, setFUnit] = useState(ALL);
  const [openNew, setOpenNew] = useState(false);
  const [detail, setDetail] = useState<DiaryRow | null>(null);
  const [proofOf, setProofOf] = useState<DiaryRow | null>(null);
  const [reasonOf, setReasonOf] = useState<{ row: DiaryRow; kind: "rejeitada" | "cancelada" } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return diaries.filter((d) => {
      if (fStatus !== ALL && d.status !== fStatus) return false;
      if (fUnit !== ALL && d.unit_id !== fUnit) return false;
      if (t) {
        const hay = [d.code, d.beneficiary_name, d.destination_city, d.purpose, (d.vehicle?.plate ?? d.vehicle?.asset_code ?? "")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [diaries, q, fStatus, fUnit]);

  const paged = usePaged(filtered);

  async function setStatus(row: DiaryRow, status: DiaryStatus, extra: Record<string, unknown> = {}) {
    const patch = { status, updated_by: perms.userId, ...extra } as Record<string, unknown>;
    if (status === "solicitada" && !row.requested_at) patch['requested_at'] = new Date().toISOString();
    if (status === "autorizada") {
      patch['authorized_at'] = new Date().toISOString();
      patch['authorized_by'] = perms.userId;
      patch['authorized_by_name'] = perms.userName;
    }
    if (status === "paga") patch['paid_at'] = new Date().toISOString();
    if (status === "comprovada") {
      patch['closed_at'] = new Date().toISOString();
      patch['closed_by'] = perms.userId;
      patch['closed_by_name'] = perms.userName;
    }
    const { error } = await supabase.from("diaries").update(patch as never).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Diária ${row.code} — ${DIARY_STATUS[status]}.`);
    invalidate(["diaries"]);
    setDetail(null);
  }

  function printRD(d: DiaryRow) {
    const total = Number(d.total_value || 0);
    const line = (l: string, v: unknown) =>
      `<div class="f"><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>RD ${esc(d.code)}</title>
<style>
@page { size: A4 portrait; margin: 14mm; }
body { font-family: "Source Sans 3", Arial, sans-serif; color:#12203a; margin:0; }
header { display:flex; gap:12px; align-items:flex-start; border-bottom:2px solid #12203a; padding-bottom:10px; }
.brasao { width:64px; height:64px; object-fit:contain; }
h1 { font-size:14pt; margin:0 0 2px; } h2 { font-size:11pt; margin:0; color:#3b4a66; }
section { margin-top:14px; } .t { font-weight:700; font-size:10pt; border-bottom:1px solid #c9d2e0; margin-bottom:6px; }
.g { display:grid; grid-template-columns:1fr 1fr; gap:4px 18px; font-size:9.5pt; }
.f span { color:#48566f; } .f strong { margin-left:4px; }
.full { grid-column: span 2; }
.sig { margin-top:36px; display:grid; grid-template-columns:1fr 1fr; gap:28px; font-size:9pt; text-align:center; }
.sig div { border-top:1px solid #12203a; padding-top:4px; }
footer { margin-top:18px; font-size:8pt; color:#6b7890; }
</style></head><body>
<header>${brasao ? `<img class="brasao" src="${esc(brasao)}" alt="Brasão" />` : ""}
<div><h1>${esc(org?.legal_name || "FrotaGov")}</h1><h2>Requisição de Diária — ${esc(d.code)} / Exercício ${esc(d.exercise)}</h2></div></header>
<section><div class="t">Beneficiário</div><div class="g">
${line("Nome", d.beneficiary_name)}${line("Cargo / função", d.beneficiary_role)}
${line("CPF", d.beneficiary_cpf ? formatCPF(d.beneficiary_cpf) : "—")}${line("Unidade requisitante", d.unit?.name)}
${line("Solicitante", d.requester_name)}${line("Situação", DIARY_STATUS[d.status])}</div></section>
<section><div class="t">Viagem</div><div class="g">
${line("Origem", [d.origin_city, d.origin_state].filter(Boolean).join("/"))}
${line("Destino", [d.destination_city, d.destination_state].filter(Boolean).join("/"))}
${line("Saída", dt(d.departure_at))}${line("Retorno", dt(d.return_at))}
${line("Veículo", (d.vehicle?.plate ?? d.vehicle?.asset_code ?? ""))}${line("Utilização vinculada", d.usage?.code)}
${line("Evento / atividade", d.event_name)}${line("Local do evento", d.event_location)}
<div class="full">${line("Finalidade / motivo", d.purpose)}</div></div></section>
<section><div class="t">Valores</div><div class="g">
${line("Quantidade de diárias", formatNumberBR(d.quantity, 2))}${line("Valor unitário", formatMoney(d.unit_value))}
<div class="full">${line("Valor total", `${formatMoney(total)} (${moneyInWords(total)})`)}</div>
${line("Centro de custo", costCenters.find((c) => c.id === d.cost_center_id)?.name)}
${line("Empenho", commitments.find((c) => c.id === d.commitment_id)?.number)}
<div class="full">${line("Dispositivo legal / norma", d.legal_basis)}</div>
<div class="full">${line("Prazo / período de aplicação", d.application_period)}</div>
<div class="full">${line("Observações", d.notes)}</div></div></section>
<div class="sig"><div>Servidor beneficiário</div><div>Autoridade concedente</div></div>
<footer>Documento gerado eletronicamente pelo FrotaGov em ${esc(new Date().toLocaleString("pt-BR"))}. Autorização registrada por ${esc(d.authorized_by_name || "—")} em ${esc(dt(d.authorized_at))}.</footer>
<script>window.onload=function(){setTimeout(function(){window.print()},350)}</script></body></html>`;
    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w) { toast.error("Permita janelas pop-up para imprimir a RD."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  async function createDiary(form: HTMLFormElement) {
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const cpf = onlyDigits(get("beneficiary_cpf"));
    if (cpf && !isValidCPF(cpf)) { toast.error("CPF do beneficiário inválido."); return; }
    const departure = get("departure_at");
    if (!departure) { toast.error("Informe a data/hora de saída."); return; }
    const ret = get("return_at");
    if (ret && new Date(ret) < new Date(departure)) { toast.error("O retorno não pode ser anterior à saída."); return; }

    const driverId = get("beneficiary_driver_id");
    const driver = drivers.find((d) => d.id === driverId);
    setSaving(true);
    const { error } = await supabase.from("diaries").insert({
      organization_id: perms.orgId!,
      unit_id: get("unit_id") === NONE ? null : get("unit_id") || null,
      requester_employee_id: get("requester_employee_id") === NONE ? null : get("requester_employee_id") || null,
      beneficiary_employee_id: get("beneficiary_employee_id") === NONE ? null : get("beneficiary_employee_id") || null,
      approver_employee_id: get("approver_employee_id") === NONE ? null : get("approver_employee_id") || null,
      legal_provision_id: get("legal_provision_id") === NONE ? null : get("legal_provision_id") || null,
      requester_name: get("requester_name") || perms.userName,
      requester_id: perms.userId,
      beneficiary_driver_id: driverId === NONE ? null : driverId || null,
      beneficiary_name: get("beneficiary_name") || driver?.full_name || "",
      beneficiary_role: get("beneficiary_role") || null,
      beneficiary_cpf: cpf || null,
      vehicle_id: get("vehicle_id") === NONE ? null : get("vehicle_id") || null,
      usage_id: get("usage_id") === NONE ? null : get("usage_id") || null,
      origin_city: get("origin_city") || null,
      origin_state: get("origin_state") || null,
      destination_city: get("destination_city"),
      destination_state: get("destination_state") || null,
      departure_at: new Date(departure).toISOString(),
      return_at: ret ? new Date(ret).toISOString() : null,
      quantity: parseBRNumber(get("quantity")) || 1,
      unit_value: parseBRNumber(get("unit_value")),
      purpose: get("purpose"),
      event_name: get("event_name") || null,
      event_location: get("event_location") || null,
      legal_basis: get("legal_basis") || null,
      application_period: get("application_period") || null,
      notes: get("notes") || null,
      cost_center_id: get("cost_center_id") === NONE ? null : get("cost_center_id") || null,
      commitment_id: get("commitment_id") === NONE ? null : get("commitment_id") || null,
      status: "solicitada",
      requested_at: new Date().toISOString(),
      created_by: perms.userId,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Requisição de diária registrada.");
    setOpenNew(false);
    invalidate(["diaries"]);
  }

  const linkedUsages = usages.filter((u) => u.status !== "cancelada");

  return (
    <div>
      <PageHeader
        title="Diárias"
        description="Requisição de Diária (RD), autorização e Comprovação de Diária (CD) com prestação de contas."
        action={
          perms.canWrite ? (
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova requisição de diária
            </Button>
          ) : null
        }
      />

      <div className="gov-card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Código, beneficiário, destino…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="w-56">
          <Label className="text-xs">Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {Object.entries(DIARY_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-64">
          <Label className="text-xs">Secretaria / Unidade</Label>
          <Select value={fUnit} onValueChange={setFUnit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="gov-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Beneficiário</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead className="text-right">Qtde</TableHead>
              <TableHead className="text-right">Valor total</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9}>Carregando…</TableCell></TableRow>
            )}
            {!isLoading && paged.rows.length === 0 && (
              <TableRow><TableCell colSpan={9}>Nenhuma diária encontrada.</TableCell></TableRow>
            )}
            {paged.rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.code}</TableCell>
                <TableCell>
                  {d.beneficiary_name}
                  <div className="text-xs text-muted-foreground">{d.beneficiary_cpf ? formatCPF(d.beneficiary_cpf) : "—"}</div>
                </TableCell>
                <TableCell>{d.unit?.acronym || d.unit?.name || "—"}</TableCell>
                <TableCell>{[d.destination_city, d.destination_state].filter(Boolean).join("/")}</TableCell>
                <TableCell>{dt(d.departure_at)}</TableCell>
                <TableCell className="text-right">{formatNumberBR(d.quantity, 2)}</TableCell>
                <TableCell className="text-right">{formatMoney(d.total_value)}</TableCell>
                <TableCell><Badge className={DIARY_STATUS_STYLE[d.status]}>{DIARY_STATUS[d.status]}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Detalhes" onClick={() => setDetail(d)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Imprimir RD" onClick={() => printRD(d)}>
                      <Printer className="h-4 w-4" />
                    </Button>
                    {perms.canWrite && (
                      <Button size="icon" variant="ghost" title="Comprovação (CD)" onClick={() => setProofOf(d)}>
                        <FileCheck2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ListPagination state={paged} />
      </div>

      {/* -------- nova RD -------- */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Requisição de Diária</DialogTitle>
            <DialogDescription>O código RD e o exercício são gerados automaticamente.</DialogDescription>
          </DialogHeader>
          <form
            id="rd-form"
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void createDiary(e.currentTarget);
            }}
          >
            <div>
              <Label>Unidade requisitante</Label>
              <Select name="unit_id" defaultValue={perms.unitId ?? NONE}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informada</SelectItem>
                  {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Solicitante (cadastro de pessoas)</Label>
              <Select name="requester_employee_id" defaultValue={NONE}>
                <SelectTrigger><SelectValue placeholder="Não vincular" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não vincular</SelectItem>
                  {activeEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome do solicitante</Label>
              <Input name="requester_name" defaultValue={perms.userName} />
            </div>
            <div>
              <Label>Beneficiário (cadastro de pessoas)</Label>
              <Select name="beneficiary_employee_id" defaultValue={NONE}>
                <SelectTrigger><SelectValue placeholder="Não vincular" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não vincular</SelectItem>
                  {activeEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Autoridade concedente (cadastro de pessoas)</Label>
              <Select name="approver_employee_id" defaultValue={NONE}>
                <SelectTrigger><SelectValue placeholder="Não vincular" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não vincular</SelectItem>
                  {activeEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Beneficiário — condutor cadastrado</Label>
              <Select name="beneficiary_driver_id" defaultValue={NONE}>
                <SelectTrigger><SelectValue placeholder="Outro servidor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Outro servidor (informar abaixo)</SelectItem>
                  {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome do beneficiário *</Label>
              <Input name="beneficiary_name" required />
            </div>
            <div>
              <Label>Cargo / função</Label>
              <Input name="beneficiary_role" />
            </div>
            <div>
              <Label>CPF do beneficiário</Label>
              <CpfInput name="beneficiary_cpf" />
            </div>
            <div>
              <Label>Veículo vinculado</Label>
              <Select name="vehicle_id" defaultValue={NONE}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem veículo</SelectItem>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{(v.plate ?? v.asset_code)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Utilização / reserva vinculada</Label>
              <Select name="usage_id" defaultValue={NONE}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem vínculo</SelectItem>
                  {linkedUsages.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.code} — {(u.vehicle?.plate ?? u.vehicle?.asset_code ?? "")} — {u.destination}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cidade de origem</Label><Input name="origin_city" /></div>
            <div><Label>UF de origem</Label><Input name="origin_state" maxLength={2} /></div>
            <div><Label>Cidade de destino *</Label><Input name="destination_city" required /></div>
            <div><Label>UF de destino</Label><Input name="destination_state" maxLength={2} /></div>
            <div><Label>Data/hora de saída *</Label><Input type="datetime-local" name="departure_at" required /></div>
            <div><Label>Data/hora de retorno</Label><Input type="datetime-local" name="return_at" /></div>
            <div><Label>Quantidade de diárias</Label><DecimalInput decimals={2} name="quantity" defaultValue={1} /></div>
            <div><Label>Valor unitário (R$)</Label><MoneyInput name="unit_value" /></div>
            <div className="sm:col-span-2"><Label>Finalidade / motivo *</Label><Textarea name="purpose" required rows={2} /></div>
            <div><Label>Evento / atividade</Label><Input name="event_name" /></div>
            <div><Label>Local do evento</Label><Input name="event_location" /></div>
            <div>
              <Label>Dispositivo legal / norma (cadastro)</Label>
              <Select name="legal_provision_id" defaultValue={NONE}>
                <SelectTrigger><SelectValue placeholder="Selecione a norma cadastrada" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não vincular</SelectItem>
                  {provisions
                    .filter((p) => p.active)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code ? `${p.code} — ` : ""}
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Dispositivo legal (texto livre)</Label><Input name="legal_basis" placeholder="Ex.: Decreto Municipal nº 000/0000" /></div>
            <div><Label>Prazo / período de aplicação</Label><Input name="application_period" /></div>
            <div>
              <Label>Centro de custo</Label>
              <Select name="cost_center_id" defaultValue={NONE}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem vínculo</SelectItem>
                  {costCenters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empenho</Label>
              <Select name="commitment_id" defaultValue={NONE}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem vínculo</SelectItem>
                  {commitments.map((c) => <SelectItem key={c.id} value={c.id}>{c.number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Observações</Label><Textarea name="notes" rows={2} /></div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button type="submit" form="rd-form" disabled={saving}>Registrar RD</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------- detalhes / tramitação -------- */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Diária {detail.code}</DialogTitle>
                <DialogDescription>
                  Exercício {detail.exercise} — {DIARY_STATUS[detail.status]}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Field l="Beneficiário" v={detail.beneficiary_name} />
                <Field l="CPF" v={detail.beneficiary_cpf ? formatCPF(detail.beneficiary_cpf) : "—"} />
                <Field l="Cargo / função" v={detail.beneficiary_role} />
                <Field l="Unidade" v={detail.unit?.name} />
                <Field l="Destino" v={[detail.destination_city, detail.destination_state].filter(Boolean).join("/")} />
                <Field l="Veículo" v={(detail.vehicle?.plate ?? detail.vehicle?.asset_code ?? "")} />
                <Field l="Utilização vinculada" v={detail.usage?.code} />
                <Field l="Saída" v={dt(detail.departure_at)} />
                <Field l="Retorno" v={dt(detail.return_at)} />
                <Field l="Quantidade" v={formatNumberBR(detail.quantity, 2)} />
                <Field l="Valor unitário" v={formatMoney(detail.unit_value)} />
                <Field l="Valor total" v={`${formatMoney(detail.total_value)} (${moneyInWords(Number(detail.total_value))})`} />
                <Field l="Autorizado por" v={detail.authorized_by_name} />
                <Field l="Autorizado em" v={dt(detail.authorized_at)} />
                <Field l="Encerrado por" v={detail.closed_by_name} />
                <Field l="Encerrado em" v={dt(detail.closed_at)} />
                {detail.reject_reason && <Field l="Motivo da rejeição" v={detail.reject_reason} />}
                {detail.cancel_reason && <Field l="Motivo do cancelamento" v={detail.cancel_reason} />}
              </dl>

              {detail.proofs.length > 0 && (
                <div className="rounded-md border p-3 text-sm">
                  <p className="mb-2 font-medium">Comprovações (CD)</p>
                  {detail.proofs.map((p) => (
                    <div key={p.id} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0">
                      <span>{p.code}</span>
                      <span>Recebido {formatMoney(p.received_total)} · Utilizado {formatMoney(p.used_total)}</span>
                      <span>
                        Saldo {formatMoney(Math.abs(Number(p.balance_value)))}{" "}
                        {Number(p.balance_value) > 0 ? "a restituir" : Number(p.balance_value) < 0 ? "a receber" : ""}
                      </span>
                      <Badge variant="outline">{DIARY_PROOF_STATUS[p.status]}</Badge>
                    </div>
                  ))}
                </div>
              )}

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" onClick={() => printRD(detail)}>
                  <Printer className="mr-2 h-4 w-4" /> Imprimir RD
                </Button>
                {perms.canWrite && detail.status === "rascunho" && (
                  <Button onClick={() => void setStatus(detail, "solicitada")}>Solicitar</Button>
                )}
                {perms.canWrite && detail.status === "solicitada" && (
                  <Button onClick={() => void setStatus(detail, "em_analise")}>Enviar para análise</Button>
                )}
                {perms.canManageFleet && ["solicitada", "em_analise"].includes(detail.status) && (
                  <>
                    <Button onClick={() => void setStatus(detail, "autorizada")}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Autorizar
                    </Button>
                    <Button variant="destructive" onClick={() => { setReason(""); setReasonOf({ row: detail, kind: "rejeitada" }); }}>
                      Rejeitar
                    </Button>
                  </>
                )}
                {perms.canManageFleet && detail.status === "autorizada" && (
                  <Button onClick={() => void setStatus(detail, "paga")}>Registrar pagamento</Button>
                )}
                {perms.canWrite && detail.status === "paga" && (
                  <Button onClick={() => void setStatus(detail, "viagem_realizada")}>Viagem realizada</Button>
                )}
                {perms.canWrite && detail.status === "viagem_realizada" && (
                  <Button onClick={() => void setStatus(detail, "aguardando_comprovacao")}>Aguardar comprovação</Button>
                )}
                {perms.canCancel && !["cancelada", "comprovada"].includes(detail.status) && (
                  <Button variant="outline" onClick={() => { setReason(""); setReasonOf({ row: detail, kind: "cancelada" }); }}>
                    <Ban className="mr-2 h-4 w-4" /> Cancelar
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* -------- motivo obrigatório -------- */}
      <Dialog open={!!reasonOf} onOpenChange={(o) => !o && setReasonOf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonOf?.kind === "rejeitada" ? "Rejeitar diária" : "Cancelar diária"}</DialogTitle>
            <DialogDescription>O motivo é obrigatório e fica registrado na auditoria.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonOf(null)}>Voltar</Button>
            <Button
              onClick={() => {
                if (!reasonOf) return;
                if (reason.trim().length < 5) { toast.error("Informe o motivo (mínimo 5 caracteres)."); return; }
                void setStatus(
                  reasonOf.row,
                  reasonOf.kind,
                  reasonOf.kind === "rejeitada" ? { reject_reason: reason.trim() } : { cancel_reason: reason.trim() },
                );
                setReasonOf(null);
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {proofOf && <ProofDialog diary={proofOf} onClose={() => setProofOf(null)} />}
    </div>
  );
}

function Field({ l, v }: { l: string; v: unknown }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{l}</dt>
      <dd className="font-medium">{v ? String(v) : "—"}</dd>
    </div>
  );
}

/* ------------------------- Comprovação de Diária (CD) ------------------------- */

function ProofDialog({ diary, onClose }: { diary: DiaryRow; onClose: () => void }) {
  const perms = usePerms();
  const invalidate = useInvalidate();
  const existing = diary.proofs[0] ?? null;

  const [receivedQty, setReceivedQty] = useState(String(existing?.received_quantity ?? diary.quantity));
  const [receivedUnit, setReceivedUnit] = useState(String(existing?.received_unit_value ?? diary.unit_value));
  const [usedQty, setUsedQty] = useState(String(existing?.used_quantity ?? ""));
  const [report, setReport] = useState(existing?.activity_report ?? "");
  const [resolved, setResolved] = useState(existing?.restitution_resolved ?? false);
  const [saving, setSaving] = useState(false);

  const rq = parseBRNumber(receivedQty);
  const ru = parseBRNumber(receivedUnit);
  const uq = parseBRNumber(usedQty);
  const receivedTotal = Math.round(rq * ru * 100) / 100;
  const usedTotal = Math.round(uq * ru * 100) / 100;
  const balance = Math.round((receivedTotal - usedTotal) * 100) / 100;

  async function save(form: HTMLFormElement, finalize: boolean) {
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    if (finalize && report.trim().length < 10) {
      { toast.error("O relatório de atividades é obrigatório para encerrar a comprovação."); return; }
    }
    if (finalize && balance > 0 && !resolved) {
      { toast.error("Existe saldo a restituir. Confirme a devolução antes de encerrar."); return; }
    }
    const payload = {
      organization_id: perms.orgId!,
      diary_id: diary.id,
      beneficiary_name: diary.beneficiary_name,
      beneficiary_role: diary.beneficiary_role,
      beneficiary_cpf: diary.beneficiary_cpf,
      actual_departure_at: get("actual_departure_at") ? new Date(get("actual_departure_at")).toISOString() : null,
      actual_return_at: get("actual_return_at") ? new Date(get("actual_return_at")).toISOString() : null,
      received_quantity: rq,
      received_unit_value: ru,
      used_quantity: uq,
      used_total: usedTotal,
      purpose: diary.purpose,
      purpose_complement: get("purpose_complement") || null,
      activity_report: report.trim() || null,
      settlement_date: get("settlement_date") || null,
      reviewer_name: get("reviewer_name") || perms.userName,
      reviewer_id: perms.userId,
      reviewed_at: finalize ? new Date().toISOString() : null,
      restitution_resolved: resolved,
      restitution_note: get("restitution_note") || null,
      status: finalize ? ("aprovada" as const) : ("em_elaboracao" as const),
      notes: get("notes") || null,
      updated_by: perms.userId,
    };
    setSaving(true);
    const { error } = existing
      ? await supabase.from("diary_proofs").update(payload).eq("id", existing.id)
      : await supabase.from("diary_proofs").insert({ ...payload, created_by: perms.userId });
    if (!error && finalize) {
      await supabase
        .from("diaries")
        .update({
          status: "comprovada",
          closed_at: new Date().toISOString(),
          closed_by: perms.userId,
          closed_by_name: perms.userName,
        })
        .eq("id", diary.id);
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(finalize ? "Comprovação encerrada." : "Comprovação salva.");
    invalidate(["diaries"]);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comprovação de Diária — RD {diary.code}</DialogTitle>
          <DialogDescription>
            {diary.beneficiary_name} · {diary.beneficiary_cpf ? formatCPF(diary.beneficiary_cpf) : "CPF não informado"} ·
            Exercício {diary.exercise}
          </DialogDescription>
        </DialogHeader>
        <form id="cd-form" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <div>
            <Label>Partida efetiva</Label>
            <Input type="datetime-local" name="actual_departure_at" defaultValue={toLocalInput(existing?.actual_departure_at ?? diary.departure_at)} />
          </div>
          <div>
            <Label>Retorno efetivo</Label>
            <Input type="datetime-local" name="actual_return_at" defaultValue={toLocalInput(existing?.actual_return_at ?? diary.return_at)} />
          </div>
          <div><Label>Diárias recebidas (qtde)</Label><DecimalInput decimals={2} value={receivedQty} onValueChange={setReceivedQty} /></div>
          <div><Label>Valor unitário recebido</Label><MoneyInput value={receivedUnit} onValueChange={setReceivedUnit} /></div>
          <div><Label>Diárias utilizadas (qtde)</Label><DecimalInput decimals={2} value={usedQty} onValueChange={setUsedQty} /></div>
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p>Total recebido: <strong>{formatMoney(receivedTotal)}</strong></p>
            <p>Total utilizado: <strong>{formatMoney(usedTotal)}</strong></p>
            <p>
              Saldo:{" "}
              <strong>
                {formatMoney(Math.abs(balance))}{" "}
                {balance > 0 ? "a restituir" : balance < 0 ? "a receber" : "(sem saldo)"}
              </strong>
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label>Motivo herdado da RD</Label>
            <Input value={diary.purpose} readOnly />
          </div>
          <div className="sm:col-span-2"><Label>Complemento justificado do motivo</Label><Textarea name="purpose_complement" rows={2} defaultValue={existing?.purpose_complement ?? ""} /></div>
          <div className="sm:col-span-2">
            <Label>Relatório de atividades *</Label>
            <Textarea rows={4} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Descreva as atividades realizadas na viagem" />
          </div>
          <div><Label>Data da prestação de contas</Label><Input type="date" name="settlement_date" defaultValue={existing?.settlement_date ?? ""} /></div>
          <div><Label>Conferente / aprovador</Label><Input name="reviewer_name" defaultValue={existing?.reviewer_name ?? perms.userName} /></div>
          {balance > 0 && (
            <>
              <div className="flex items-center gap-2 sm:col-span-2">
                <input id="resolved" type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} />
                <Label htmlFor="resolved">Saldo a restituir devidamente resolvido / devolvido</Label>
              </div>
              <div className="sm:col-span-2"><Label>Observação da restituição</Label><Input name="restitution_note" defaultValue={existing?.restitution_note ?? ""} /></div>
            </>
          )}
          <div className="sm:col-span-2 text-xs text-muted-foreground">
            <Paperclip className="mr-1 inline h-3 w-3" />
            Anexos de comprovação podem ser adicionados ao registro da diária pelo módulo de documentos do órgão.
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => void save(document.getElementById("cd-form") as HTMLFormElement, false)}
          >
            Salvar rascunho
          </Button>
          <Button
            disabled={saving}
            onClick={() => void save(document.getElementById("cd-form") as HTMLFormElement, true)}
          >
            Encerrar comprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
