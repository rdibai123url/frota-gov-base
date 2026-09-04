import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ClipboardList, FileSearch, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { ConvitesCotacao } from "@/components/convites-cotacao";
import { EntitySelect } from "@/components/entity-select";
import { ItemHistoryInput } from "@/components/item-history-input";
import { NovaEmpresaCotacaoDialog } from "@/components/nova-empresa-cotacao";
import { PropostaFields } from "@/components/proposta-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseBRNumber } from "@/lib/format";
import {
  QUOTATION_KINDS,
  asQuotationKind,
  discountProblem,
  draftToPayload,
  emptyProposalDraft,
  hasParts,
  proposalSourceLabel,
  quotationKindLabel,
  type ProposalDraft,
  type QuotationKind,
} from "@/lib/cotacoes";

import {
  MIN_PROPOSALS,
  PROPOSAL_STATUS,
  QUOTATION_STATUS,
  WORKSHOP_SPECIALTIES,
  brl,
  dateTimeBR,
  dbMessage,
  labelOf,
  num,
  supabase,
  useInvalidate,
  useMaintenanceRequests,
  usePerms,
  useProposalItems,
  useQuotationInvitations,
  useQuotationItems,
  useQuotationProposals,
  useQuotations,
  useUnits,
  useVehicles,
  useWorkshops,
  type InvitationStatus,
  type ProposalRow,
  type QuotationRow,
  type QuotationStatus,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/cotacoes")({
  head: () => ({
    meta: [
      { title: "Cotações de manutenção — FrotaGov" },
      {
        name: "description",
        content:
          "Processos eletrônicos de cotação com oficinas credenciadas, recebimento de propostas, mapa comparativo e aprovação auditada.",
      },
      { property: "og:title", content: "Cotações de manutenção — FrotaGov" },
      { property: "og:description", content: "Cotação eletrônica de serviços de manutenção da frota pública." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cotacoes,
});

const ALL = "__all__";
const NONE = "__none__";

const newSchema = z.object({
  description: z.string().trim().min(1, "Descreva o problema ou serviço").max(1000),
  deadline_at: z.string().optional(),
  notes: z.string().trim().max(800).optional(),
});

function Cotacoes() {
  const { data: quotations = [], isLoading } = useQuotations();
  const { data: vehicles = [] } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: requests = [] } = useMaintenanceRequests();
  const { canManageFleet, canManageUsers, orgId, userId, userName } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [requestId, setRequestId] = useState(NONE);
  const [unitId, setUnitId] = useState(NONE);
  const [specialty, setSpecialty] = useState(WORKSHOP_SPECIALTIES[0]!);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<QuotationRow | null>(null);
  const [fStatus, setFStatus] = useState(ALL);
  const [search, setSearch] = useState("");

  const current = useMemo(
    () => quotations.find((q) => q.id === detail?.id) ?? null,
    [quotations, detail],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotations.filter(
      (c) =>
        (fStatus === ALL || c.status === fStatus) &&
        (!q ||
          `${c.code ?? ""} ${c.description} ${(c.vehicle?.plate ?? c.vehicle?.asset_code ?? "")}`.toLowerCase().includes(q)),
    );
  }, [quotations, fStatus, search]);

  async function createQuotation(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = newSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (!vehicleId) {
      toast.error("Selecione o veículo.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("quotations").insert({
      organization_id: orgId!,
      vehicle_id: vehicleId,
      request_id: requestId === NONE ? null : requestId,
      unit_id: unitId === NONE ? null : unitId,
      description: parsed.data.description,
      specialty,
      deadline_at: parsed.data.deadline_at ? new Date(parsed.data.deadline_at).toISOString() : null,
      notes: parsed.data.notes || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Processo de cotação criado.");
    invalidate(["quotations"]);
    setOpen(false);
  }

  async function changeStatus(q: QuotationRow, status: QuotationStatus) {
    let cancel_reason: string | null = null;
    if (status === "cancelada") {
      cancel_reason = window.prompt("Informe o motivo do cancelamento do processo:") ?? "";
      if (!cancel_reason.trim()) {
        toast.error("O cancelamento exige motivo.");
        return;
      }
    }
    const { error } = await supabase
      .from("quotations")
      .update({ status, cancel_reason, updated_by: userId })
      .eq("id", q.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Situação atualizada.");
    invalidate(["quotations"]);
  }

  const paged = usePaged(filtered);
  return (
    <>
      <PageHeader
        title="Cotações"
        description="Processos eletrônicos de cotação junto à rede credenciada, com meta de no mínimo 3 propostas válidas."
        action={
          canManageFleet && orgId ? (
            <Button
              onClick={() => {
                setVehicleId("");
                setRequestId(NONE);
                setUnitId(NONE);
                setSpecialty(WORKSHOP_SPECIALTIES[0]!);
                setOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="size-4" /> Nova cotação
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Buscar</Label>
          <Input placeholder="Código, veículo, descrição" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label>Situação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {QUOTATION_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
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
              <TableHead>Processo</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead className="text-right">Convites / propostas</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-32" />
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
                  <FileSearch className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhum processo de cotação.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="font-medium">
                  {q.code || "—"}
                  <span className="block text-xs text-muted-foreground">{q.specialty || ""}</span>
                </TableCell>
                <TableCell>{(q.vehicle?.plate ?? q.vehicle?.asset_code ?? "—")}</TableCell>
                <TableCell className="max-w-[260px] truncate">{q.description}</TableCell>
                <TableCell className="text-sm">{q.deadline_at ? dateTimeBR(q.deadline_at) : "—"}</TableCell>
                <TableCell className="text-right text-sm">
                  {q.invited_count} / {q.valid_proposals_count}
                  {q.valid_proposals_count < MIN_PROPOSALS && q.status !== "cancelada" && (
                    <AlertTriangle className="ml-1 inline size-3 text-destructive" />
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={q.status === "encerrada" ? "default" : "secondary"}>
                    {labelOf(QUOTATION_STATUS, q.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setDetail(q)}>
                    Abrir
                  </Button>
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
            <DialogTitle>Novo processo de cotação</DialogTitle>
          </DialogHeader>
          <form onSubmit={createQuotation} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Veículo *</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {(v.plate ?? v.asset_code)} — {v.brand} {v.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Solicitação de manutenção</Label>
                <Select value={requestId} onValueChange={setRequestId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem vínculo</SelectItem>
                    {requests
                      .filter((r) => !vehicleId || r.vehicle_id === vehicleId)
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.code} — {r.description.slice(0, 40)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informada</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Especialidade necessária</Label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKSHOP_SPECIALTIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="deadline_at">Prazo limite para propostas</Label>
                <Input id="deadline_at" name="deadline_at" type="datetime-local" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Descrição do problema / serviço *</Label>
                <Textarea id="description" name="description" rows={3} required />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Criar processo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!current} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          {current && (
            <QuotationDetail
              quotation={current}
              canManage={canManageFleet}
              canManageUsers={canManageUsers}
              userId={userId}
              userName={userName}
              orgId={orgId}
              onChangeStatus={changeStatus}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuotationDetail({
  quotation,
  canManage,
  canManageUsers,
  userId,
  userName,
  orgId,
  onChangeStatus,
}: {
  quotation: QuotationRow;
  canManage: boolean;
  canManageUsers: boolean;
  userId: string | null;
  userName: string;
  orgId: string | null;
  onChangeStatus: (q: QuotationRow, s: QuotationStatus) => void;
}) {
  const { data: items = [] } = useQuotationItems(quotation.id);
  const { data: invites = [] } = useQuotationInvitations(quotation.id);
  const { data: proposals = [] } = useQuotationProposals(quotation.id);
  const { data: proposalItems = [] } = useProposalItems(quotation.id);
  const { data: workshops = [] } = useWorkshops();
  const invalidate = useInvalidate();

  const [inviteWorkshop, setInviteWorkshop] = useState("");
  const [proposalWorkshop, setProposalWorkshop] = useState("");
  const [selected, setSelected] = useState(quotation.selected_proposal_id ?? "");
  const [analysis, setAnalysis] = useState(quotation.technical_analysis ?? "");
  const [choiceJust, setChoiceJust] = useState(quotation.choice_justification ?? "");
  const [fewJust, setFewJust] = useState(quotation.few_proposals_justification ?? "");
  const [busy, setBusy] = useState(false);
  const [itemDescription, setItemDescription] = useState("");
  const [itemUnit, setItemUnit] = useState("UN");
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"todas" | "manual" | "link">("todas");

  const kind = asQuotationKind(quotation.quotation_kind);
  const [draft, setDraft] = useState<ProposalDraft>(() => emptyProposalDraft());

  /** Ao trocar de processo, o rascunho parte dos itens solicitados. */
  const seededFor = useRef<string>("");
  useEffect(() => {
    const signature = `${quotation.id}:${items.map((i) => i.id).join(",")}`;
    if (seededFor.current === signature) return;
    seededFor.current = signature;
    setDraft(emptyProposalDraft(hasParts(kind) ? items : []));
  }, [quotation.id, items, kind]);

  const netOf = (p: ProposalRow) => Number(p.net_value ?? p.total_value);
  const countBySource = (s: string) => proposals.filter((p) => (p.source ?? "manual") === s).length;
  const shownProposals = proposals.filter(
    (p) => sourceFilter === "todas" || (p.source ?? "manual") === sourceFilter,
  );

  const closed = quotation.status === "encerrada" || quotation.status === "cancelada";
  const valid = proposals.filter((p) => p.status !== "desclassificada");
  const lowest = valid.length ? Math.min(...valid.map((p) => netOf(p))) : 0;

  const eligible = workshops.filter(
    (w) =>
      w.status === "ativo" &&
      (!quotation.specialty || (w.specialties ?? []).includes(quotation.specialty)) &&
      !invites.some((i) => i.workshop_id === w.id),
  );


  /** Empresas selecionáveis na proposta: convidadas + qualquer empresa ativa do órgão. */
  const proposalCompanyOptions = useMemo(() => {
    const used = new Set(proposals.map((p) => p.workshop_id).filter(Boolean) as string[]);
    return workshops
      .filter((w) => w.status === "ativo" && !used.has(w.id))
      .map((w) => {
        const invited = invites.some((i) => i.workshop_id === w.id);
        return {
          value: w.id,
          label: w.trade_name || w.legal_name,
          description: [w.legal_name, (w.specialties ?? []).join(", "), [w.city, w.state].filter(Boolean).join("/")]
            .filter(Boolean)
            .join(" · "),
          keywords: [w.cnpj, w.email, w.phone],
          hint: invited ? null : "sem convite",
        };
      });
  }, [workshops, proposals, invites]);


  function refresh() {
    invalidate([
      "quotations",
      "quotation-items",
      "quotation-invitations",
      "quotation-proposals",
      "proposal-items",
    ]);
  }

  async function addItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const description = itemDescription.trim();
    if (!description) { toast.error("Informe a descrição do item."); return; }
    setBusy(true);
    const { error } = await supabase.from("quotation_items").insert({
      organization_id: orgId!,
      quotation_id: quotation.id,
      sequence: items.length + 1,
      description,
      measure_unit: itemUnit.trim() || "UN",
      quantity: parseBRNumber(String(fd.get("quantity") ?? "1")) || 1,
      created_by: userId,
    });
    setBusy(false);
    if (error) { toast.error(dbMessage(error)); return; }
    form.reset();
    setItemDescription("");
    setItemUnit("UN");
    refresh();
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("quotation_items").delete().eq("id", id);
    if (error) { toast.error(dbMessage(error)); return; }
    refresh();
  }

  async function invite() {
    if (!inviteWorkshop) { toast.error("Selecione uma oficina credenciada."); return; }
    setBusy(true);
    const { error } = await supabase.from("quotation_invitations").insert({
      organization_id: orgId!,
      quotation_id: quotation.id,
      workshop_id: inviteWorkshop,
      created_by: userId,
    });
    setBusy(false);
    if (error) { toast.error(dbMessage(error)); return; }
    setInviteWorkshop("");
    toast.success("Oficina convidada.");
    refresh();
  }

  async function setInviteStatus(id: string, status: InvitationStatus) {
    const { error } = await supabase
      .from("quotation_invitations")
      .update({ status, responded_at: new Date().toISOString(), updated_by: userId })
      .eq("id", id);
    if (error) { toast.error(dbMessage(error)); return; }
    refresh();
  }

  async function addProposal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!proposalWorkshop) { toast.error("Selecione a empresa da proposta."); return; }
    const payload = draftToPayload(draft, kind);
    const problem = discountProblem(payload.discountMode, payload.discountInput, payload.totals.gross);
    if (problem) { toast.error(problem); return; }
    if (payload.totals.gross <= 0) {
      toast.error("Informe ao menos um valor de serviço ou de peça na proposta.");
      return;
    }
    if (hasParts(kind) && payload.items.length === 0) {
      toast.error("Cotação de peças exige ao menos um item na proposta.");
      return;
    }
    setBusy(true);

    // Lançamento manual: empresa sem convite recebe convite interno (sem envio de e-mail).
    let inviteId = invites.find((i) => i.workshop_id === proposalWorkshop)?.id ?? null;
    let manual = false;
    if (!inviteId) {
      manual = true;
      const { data: created, error: invError } = await supabase
        .from("quotation_invitations")
        .insert({
          organization_id: orgId!,
          quotation_id: quotation.id,
          workshop_id: proposalWorkshop,
          is_manual: true,
          created_by: userId,
        })
        .select("id")
        .maybeSingle();
      if (invError) { setBusy(false); toast.error(dbMessage(invError)); return; }
      inviteId = created?.id ?? null;
    }

    const { data: proposal, error } = await supabase
      .from("quotation_proposals")
      .insert({
        organization_id: orgId!,
        quotation_id: quotation.id,
        workshop_id: proposalWorkshop,
        source: "manual",
        execution_days: payload.executionDays,
        valid_days: payload.validDays,
        warranty_days: payload.warrantyDays,
        payment_terms: payload.paymentTerms || null,
        labor_hours: payload.laborHours,
        labor_hour_value: payload.laborHourValue,
        labor_value: payload.totals.laborValue,
        services_value: payload.servicesValue,
        discount_mode: payload.discountMode,
        discount_input: payload.discountInput,
        notes: payload.notes || null,
        created_by: userId,
      })
      .select("id")
      .maybeSingle();
    if (error) { setBusy(false); toast.error(dbMessage(error)); return; }

    if (proposal?.id && payload.items.length) {
      const { error: itemsError } = await supabase.from("quotation_proposal_items").insert(
        payload.items.map((i) => ({
          organization_id: orgId!,
          proposal_id: proposal.id,
          quotation_item_id: i.quotationItemId,
          description: i.description,
          brand: i.brand || null,
          part_number: i.partNumber || null,
          quantity: i.quantity,
          warranty_days: i.warrantyDays,
          unit_value: i.unitValue,
          created_by: userId,
        })),
      );
      if (itemsError) { setBusy(false); toast.error(dbMessage(itemsError)); refresh(); return; }
    }

    setBusy(false);
    if (inviteId) await setInviteStatus(inviteId, "respondida");

    await supabase.from("activity_logs").insert({
      organization_id: orgId!,
      actor_id: userId,
      actor_name: userName,
      event_type: "proposta_lancada_manualmente",
      area: "Cotações",
      screen: "Cotações › Lançar proposta",
      route: "/cotacoes",
      entity: "quotation_proposals",
      record_id: proposal?.id ?? null,
      action: "insert",
      summary: manual
        ? "Proposta lançada manualmente; convite interno criado automaticamente, sem envio de e-mail."
        : "Proposta lançada manualmente para empresa já convidada.",
      new_data: {
        quotation_id: quotation.id,
        workshop_id: proposalWorkshop,
        invite_created: manual,
        gross_value: payload.totals.gross,
        discount_value: payload.totals.discount,
        net_value: payload.totals.net,
      },
    });

    setProposalWorkshop("");
    setDraft(emptyProposalDraft(hasParts(kind) ? items : []));
    toast.success("Proposta registrada.");
    refresh();
  }


  async function disqualify(p: ProposalRow) {
    const reason = window.prompt("Motivo da desclassificação:") ?? "";
    if (!reason.trim()) { toast.error("Informe o motivo da desclassificação."); return; }
    const { error } = await supabase
      .from("quotation_proposals")
      .update({ status: "desclassificada", disqualify_reason: reason, updated_by: userId })
      .eq("id", p.id);
    if (error) { toast.error(dbMessage(error)); return; }
    refresh();
  }

  async function approve() {
    if (!selected) { toast.error("Selecione a proposta vencedora."); return; }
    setBusy(true);
    const { error } = await supabase
      .from("quotations")
      .update({
        selected_proposal_id: selected,
        technical_analysis: analysis || null,
        choice_justification: choiceJust || null,
        few_proposals_justification: fewJust || null,
        approved_by_name: userName,
        updated_by: userId,
      })
      .eq("id", quotation.id);
    setBusy(false);
    if (error) { toast.error(dbMessage(error)); return; }
    toast.success("Proposta aprovada. Emita a ordem de serviço.");
    refresh();
  }

  async function rejectAll() {
    const reason = window.prompt("Motivo da rejeição de todas as propostas:") ?? "";
    if (!reason.trim()) { toast.error("Informe o motivo."); return; }
    const { error } = await supabase
      .from("quotations")
      .update({ status: "cancelada", cancel_reason: reason, reject_reason: reason, updated_by: userId })
      .eq("id", quotation.id);
    if (error) { toast.error(dbMessage(error)); return; }
    toast.success("Processo encerrado sem contratação.");
    refresh();
  }

  const itemsByProposal = (pid: string) => proposalItems.filter((i) => i.proposal_id === pid);
  const lowestByItem = (quotationItemId: string) => {
    const vals = proposalItems
      .filter((i) => i.quotation_item_id === quotationItemId)
      .filter((i) => valid.some((p) => p.id === i.proposal_id))
      .map((i) => Number(i.unit_value));
    return vals.length ? Math.min(...vals) : null;
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          Processo {quotation.code}
          <Badge variant={quotation.status === "encerrada" ? "default" : "secondary"}>
            {labelOf(QUOTATION_STATUS, quotation.status)}
          </Badge>
          {quotation.valid_proposals_count < MIN_PROPOSALS && (
            <Badge variant="destructive">Menos de {MIN_PROPOSALS} propostas</Badge>
          )}
        </DialogTitle>
      </DialogHeader>

      <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
        <p>
          <span className="text-muted-foreground">Veículo:</span> {(quotation.vehicle?.plate ?? quotation.vehicle?.asset_code ?? "—")}
        </p>
        <p>
          <span className="text-muted-foreground">Solicitação:</span> {quotation.request?.code ?? "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Prazo:</span>{" "}
          {quotation.deadline_at ? dateTimeBR(quotation.deadline_at) : "—"}
        </p>
        <p className="sm:col-span-3">
          <span className="text-muted-foreground">Serviço:</span> {quotation.description}
        </p>
        <p className="sm:col-span-3 text-xs text-muted-foreground">
          Convidadas: {quotation.invited_count} · Propostas: {quotation.proposals_count} · Válidas:{" "}
          {quotation.valid_proposals_count} · Recusas: {quotation.refusals_count} · Sem resposta:{" "}
          {quotation.no_response_count}
        </p>
      </div>

      {canManage && !closed && (
        <div className="flex flex-wrap gap-2">
          {quotation.status === "rascunho" && (
            <Button size="sm" onClick={() => onChangeStatus(quotation, "aberta")}>
              Abrir para propostas
            </Button>
          )}
          {quotation.status === "aberta" && (
            <Button size="sm" onClick={() => onChangeStatus(quotation, "em_analise")}>
              Encerrar prazo e analisar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onChangeStatus(quotation, "cancelada")}>
            Cancelar processo
          </Button>
        </div>
      )}

      <Tabs defaultValue="itens" className="mt-2">
        <TabsList className="flex-wrap">
          <TabsTrigger value="itens">Itens solicitados</TabsTrigger>
          <TabsTrigger value="oficinas">Convites</TabsTrigger>
          <TabsTrigger value="propostas">Propostas recebidas</TabsTrigger>
          <TabsTrigger value="lancar">Lançar proposta</TabsTrigger>
          <TabsTrigger value="mapa">Mapa comparativo</TabsTrigger>
        </TabsList>


        <TabsContent value="itens" className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhum item cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.sequence}</TableCell>
                  <TableCell>{i.description}</TableCell>
                  <TableCell>{i.measure_unit}</TableCell>
                  <TableCell className="text-right">{num(Number(i.quantity), 2)}</TableCell>
                  <TableCell>
                    {canManage && !closed && (
                      <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => removeItem(i.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {canManage && !closed && (
            <form onSubmit={addItem} className="grid items-end gap-2 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <Label htmlFor="description">Item / serviço</Label>
                <ItemHistoryInput
                  id="description"
                  name="description"
                  value={itemDescription}
                  onChange={setItemDescription}
                  onPick={(s) => { if (s.measure_unit) setItemUnit(s.measure_unit); }}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Sugestões vêm do histórico do próprio órgão; itens novos podem ser digitados livremente.
                </p>
              </div>
              <div>
                <Label htmlFor="measure_unit">Unidade</Label>
                <Input
                  id="measure_unit"
                  name="measure_unit"
                  value={itemUnit}
                  onChange={(e) => setItemUnit(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="quantity">Qtd.</Label>
                  <Input id="quantity" name="quantity" defaultValue="1" inputMode="decimal" />
                </div>
                <Button type="submit" disabled={busy} className="mt-6">
                  Adicionar
                </Button>
              </div>
            </form>
          )}
        </TabsContent>

        <TabsContent value="oficinas" className="space-y-4">
          <ConvitesCotacao
            quotationId={quotation.id}
            invites={invites as never}
            canManage={canManage}
            canConfigure={canManageUsers}
            closed={closed}
            specialty={quotation.specialty}
          />

          {canManage && !closed && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
              <div className="min-w-64 flex-1">
                <Label>Convidar oficina credenciada apta ({quotation.specialty || "qualquer especialidade"})</Label>
                <Select value={inviteWorkshop} onValueChange={setInviteWorkshop}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.trade_name || w.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={invite} disabled={busy}>
                Registrar convite sem e-mail
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="propostas" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
            <span className="text-muted-foreground">Mostrar:</span>
            {(
              [
                { value: "todas", label: `Todas (${proposals.length})` },
                { value: "manual", label: `Lançadas manualmente (${countBySource("manual")})` },
                { value: "link", label: `Recebidas por link (${countBySource("link")})` },
              ] as const
            ).map((f) => (
              <Button
                key={f.value}
                type="button"
                size="sm"
                variant={sourceFilter === f.value ? "default" : "outline"}
                onClick={() => setSourceFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {shownProposals.length === 0 && (
            <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              Nenhuma proposta neste filtro.
            </p>
          )}

          {shownProposals.map((p) => (
            <div key={p.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {p.workshop?.trade_name || p.workshop?.legal_name}
                    <Badge variant="outline">{proposalSourceLabel(p.source)}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Recebida em {dateTimeBR(p.received_at)} · Execução {p.execution_days ?? "—"} dia(s) · Garantia{" "}
                    {p.warranty_days ?? "—"} dia(s) · Validade {p.valid_days ?? "—"} dia(s) ·{" "}
                    {p.payment_terms || "condição não informada"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.status === "selecionada" ? "default" : "secondary"}>
                    {labelOf(PROPOSAL_STATUS, p.status)}
                  </Badge>
                  <span className="font-semibold">{brl(netOf(p))}</span>
                  {canManage && !closed && p.status === "recebida" && (
                    <Button variant="outline" size="sm" onClick={() => disqualify(p)}>
                      Desclassificar
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Peças {brl(Number(p.parts_value))} · Mão de obra {brl(Number(p.labor_value))}
                {Number(p.labor_hours) > 0
                  ? ` (${num(Number(p.labor_hours), 2)} h × ${brl(Number(p.labor_hour_value))})`
                  : ""}{" "}
                · Outros serviços {brl(Number(p.services_value))} · Bruto {brl(Number(p.total_value))} · Desconto{" "}
                {brl(Number(p.discount_value))}
                {p.discount_mode === "percent" ? ` (${num(Number(p.discount_input), 2)}%)` : ""} · Líquido{" "}
                <strong>{brl(netOf(p))}</strong>
                {p.disqualify_reason ? ` · Desclassificada: ${p.disqualify_reason}` : ""}
              </p>
              {itemsByProposal(p.id).length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Nº / código</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead className="text-right">Garantia</TableHead>
                      <TableHead className="text-right">Unitário</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsByProposal(p.id).map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.description}</TableCell>
                        <TableCell>{i.brand || "—"}</TableCell>
                        <TableCell>{i.part_number || "—"}</TableCell>
                        <TableCell className="text-right">{num(Number(i.quantity), 2)}</TableCell>
                        <TableCell className="text-right">{i.warranty_days ? `${i.warranty_days} d` : "—"}</TableCell>
                        <TableCell className="text-right">{brl(Number(i.unit_value))}</TableCell>
                        <TableCell className="text-right">{brl(Number(i.total_value))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {p.notes && <p className="mt-2 text-xs text-muted-foreground">Observações: {p.notes}</p>}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="lancar" className="space-y-4">
          {!canManage || closed ? (
            <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              O processo está encerrado ou você não tem permissão para lançar propostas.
            </p>
          ) : (
            <form onSubmit={addProposal} className="space-y-4 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Registrar proposta recebida fora do sistema</p>
                <p className="text-xs text-muted-foreground">
                  Use para propostas entregues em papel, e-mail ou WhatsApp. Empresas cadastradas no órgão podem ser
                  selecionadas mesmo sem convite prévio — o convite interno é criado automaticamente, sem envio de
                  e-mail. Cotação de <strong>{quotationKindLabel(quotation.quotation_kind)}</strong>.
                </p>
              </div>
              <div className="max-w-md">
                <Label>Oficina / loja / fornecedor *</Label>
                <EntitySelect
                  value={proposalWorkshop || null}
                  onChange={(v) => setProposalWorkshop(v ?? "")}
                  options={proposalCompanyOptions}
                  placeholder="Selecione"
                  searchPlaceholder="Buscar por nome ou CNPJ…"
                  emptyLabel="Nenhuma empresa cadastrada neste órgão."
                />
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-xs"
                  onClick={() => setNewCompanyOpen(true)}
                >
                  <Plus className="mr-1 size-3" /> Cadastrar nova empresa
                </Button>
              </div>

              <PropostaFields
                kind={kind}
                quotationItems={items}
                draft={draft}
                onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              />

              <Button type="submit" disabled={busy}>
                {busy ? "Registrando…" : "Registrar proposta"}
              </Button>
            </form>
          )}

          <NovaEmpresaCotacaoDialog
            open={newCompanyOpen}
            onOpenChange={setNewCompanyOpen}
            orgId={orgId}
            userId={userId}
            userName={userName}
            defaultSpecialty={quotation.specialty}
            existing={workshops}
            quotationId={quotation.id}
            onCreated={(id) => setProposalWorkshop(id)}
          />
        </TabsContent>




        <TabsContent value="mapa" className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item solicitado</TableHead>
                  {valid.map((p) => (
                    <TableHead key={p.id} className="text-right">
                      {p.workshop?.trade_name || p.workshop?.legal_name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const min = lowestByItem(it.id);
                  return (
                    <TableRow key={it.id}>
                      <TableCell>{it.description}</TableCell>
                      {valid.map((p) => {
                        const pi = proposalItems.find(
                          (i) => i.proposal_id === p.id && i.quotation_item_id === it.id,
                        );
                        const v = pi ? Number(pi.unit_value) : null;
                        return (
                          <TableCell
                            key={p.id}
                            className={`text-right ${v !== null && min !== null && v <= min ? "font-semibold text-primary" : ""}`}
                          >
                            {v === null ? "—" : brl(v)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell className="font-medium">Mão de obra</TableCell>
                  {valid.map((p) => (
                    <TableCell key={p.id} className="text-right">
                      {brl(Number(p.labor_value))}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Prazo / garantia / validade</TableCell>
                  {valid.map((p) => (
                    <TableCell key={p.id} className="text-right text-sm">
                      {p.execution_days ?? "—"} d / {p.warranty_days ?? "—"} d / {p.valid_days ?? "—"} d
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Desconto</TableCell>
                  {valid.map((p) => (
                    <TableCell key={p.id} className="text-right">
                      − {brl(Number(p.discount_value))}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Valor líquido final</TableCell>
                  {valid.map((p) => (
                    <TableCell
                      key={p.id}
                      className={`text-right font-semibold ${netOf(p) <= lowest ? "text-primary" : ""}`}
                    >
                      {brl(netOf(p))}
                      {netOf(p) <= lowest && <span className="block text-xs">menor valor</span>}
                    </TableCell>
                  ))}
                </TableRow>

              </TableBody>
            </Table>
          </div>

          {quotation.selected_proposal_id ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Proposta aprovada</p>
              <p>
                {valid.find((p) => p.id === quotation.selected_proposal_id)?.workshop?.trade_name ??
                  valid.find((p) => p.id === quotation.selected_proposal_id)?.workshop?.legal_name ??
                  "—"}{" "}
                — aprovada por {quotation.approved_by_name || "—"} em {dateTimeBR(quotation.approved_at)}
              </p>
              {quotation.choice_justification && <p className="mt-1">Justificativa: {quotation.choice_justification}</p>}
              {quotation.few_proposals_justification && (
                <p className="mt-1">Menos de {MIN_PROPOSALS} propostas: {quotation.few_proposals_justification}</p>
              )}
              {quotation.technical_analysis && <p className="mt-1">Análise técnica: {quotation.technical_analysis}</p>}
            </div>
          ) : (
            canManage &&
            !closed && (
              <div className="space-y-3 rounded-md border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardList className="size-4" /> Decisão do processo
                </p>
                <div>
                  <Label>Proposta vencedora</Label>
                  <Select value={selected} onValueChange={setSelected}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {valid.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {(p.workshop?.trade_name || p.workshop?.legal_name) ?? ""} — {brl(Number(p.total_value))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="analysis">Análise técnica</Label>
                  <Textarea id="analysis" rows={2} value={analysis} onChange={(e) => setAnalysis(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="choice">Justificativa da escolha (obrigatória fora do menor preço)</Label>
                  <Textarea id="choice" rows={2} value={choiceJust} onChange={(e) => setChoiceJust(e.target.value)} />
                </div>
                {valid.length < MIN_PROPOSALS && (
                  <div>
                    <Label htmlFor="few">
                      Justificativa formal para prosseguir com menos de {MIN_PROPOSALS} propostas
                    </Label>
                    <Textarea id="few" rows={2} value={fewJust} onChange={(e) => setFewJust(e.target.value)} />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={approve} disabled={busy}>
                    Aprovar proposta
                  </Button>
                  <Button variant="outline" onClick={rejectAll} disabled={busy}>
                    Rejeitar todas
                  </Button>
                </div>
              </div>
            )
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
