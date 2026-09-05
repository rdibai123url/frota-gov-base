import { ListPagination, usePaged } from "@/components/list-pagination";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ban, CheckCircle2, Cog, Pencil, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { MoneyInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpInlineButton } from "@/components/help-button";
import { Textarea } from "@/components/ui/textarea";
import { useEmployees } from "@/lib/pessoas";
import {
  MAINTENANCE_KINDS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_RECORD_STATUS,
  MAINTENANCE_REQUEST_STATUS,
  brl,
  dateBR,
  dateTimeBR,
  dbMessage,
  label,
  contractItemBalance,
  maintenanceTotal,
  num,
  parseBRNumber,
  supabase,
  useCommitments,
  useContracts,
  useCostCenters,
  useInvalidate,
  useMaintenancePlans,
  useMaintenanceRecords,
  useMaintenanceRequests,
  usePartsCatalog,
  usePerms,
  uploadMaintenanceFile,
  openMaintenanceFile,
  useQuotas,
  useSuppliers,
  useUnits,
  useVehicles,
  type MaintenanceKind,
  type MaintenancePriority,
  type MaintenanceRecordRow,
  type MaintenanceRequestRow,
  type MaintenanceRequestStatus,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/manutencoes")({
  head: () => ({
    meta: [
      { title: "Manutenções — FrotaGov" },
      {
        name: "description",
        content:
          "Solicitações e registros de manutenção preventiva e corretiva da frota, com oficina, peças, valores, garantia e origem do recurso.",
      },
      { property: "og:title", content: "Manutenções — FrotaGov" },
      { property: "og:description", content: "Controle de manutenções, custos e indisponibilidade de veículos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Manutencoes,
});

const ALL = "__all__";
const NONE = "__none__";

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseBRNumber(s);
  return Number.isFinite(n) ? n : null;
};

const REQ_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  aberta: "outline",
  em_analise: "outline",
  aprovada: "secondary",
  em_manutencao: "default",
  concluida: "secondary",
  cancelada: "destructive",
};

const requestSchema = z.object({
  description: z.string().trim().min(5, "Descreva o problema ou serviço").max(1000),
  odometer_km: z.string().optional(),
  hour_meter: z.string().optional(),
  notes: z.string().trim().max(600).optional(),
});

const recordSchema = z.object({
  services: z.string().trim().min(3, "Descreva os serviços executados").max(1000),
  entry_at: z.string().min(1, "Informe a data de entrada"),
  exit_at: z.string().optional(),
  odometer_km: z.string().optional(),
  hour_meter: z.string().optional(),
  labor_value: z.string().optional(),
  other_value: z.string().optional(),
  invoice_number: z.string().trim().max(60).optional(),
  warranty_days: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
});

function Manutencoes() {
  const { data: requests = [], isLoading } = useMaintenanceRequests();
  const { data: records = [] } = useMaintenanceRecords();
  const { data: vehicles = [] } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: centers = [] } = useCostCenters();
  const { data: suppliers = [] } = useSuppliers();
  const { data: plans = [] } = useMaintenancePlans();
  const { data: employees = [] } = useEmployees();
  const { data: contracts = [] } = useContracts();
  const { data: commitments = [] } = useCommitments();
  const { data: quotas = [] } = useQuotas();
  const { data: catalog = [] } = usePartsCatalog();
  const { canManageFleet, canWrite, orgId, userId, userName } = usePerms();
  const invalidate = useInvalidate();

  /* ---------------------------- solicitações ---------------------------- */
  const [reqOpen, setReqOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<MaintenanceRequestRow | null>(null);
  const [reqVehicle, setReqVehicle] = useState(NONE);
  const [reqUnit, setReqUnit] = useState(NONE);
  const [reqEmployee, setReqEmployee] = useState(NONE);
  const [reqPlan, setReqPlan] = useState(NONE);

  const [reqKind, setReqKind] = useState<MaintenanceKind>("corretiva");
  const [reqPriority, setReqPriority] = useState<MaintenancePriority>("normal");
  const [reqStatus, setReqStatus] = useState<MaintenanceRequestStatus>("aberta");
  const [savingReq, setSavingReq] = useState(false);
  const [reqFile, setReqFile] = useState<File | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MaintenanceRequestRow | null>(null);

  /* ----------------------------- manutenções ---------------------------- */
  const [recOpen, setRecOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<MaintenanceRecordRow | null>(null);
  const [recVehicle, setRecVehicle] = useState(NONE);
  const [recRequest, setRecRequest] = useState(NONE);
  const [recSupplier, setRecSupplier] = useState(NONE);
  const [recMode, setRecMode] = useState<"solicitacao" | "avulsa">("solicitacao");
  const [recOrigin, setRecOrigin] = useState<"contrato" | "compra_direta">("compra_direta");
  const [recContract, setRecContract] = useState(NONE);
  const [recItem, setRecItem] = useState(NONE);
  const [recLaborQty, setRecLaborQty] = useState("");
  const [recKind, setRecKind] = useState<MaintenanceKind>("corretiva");
  const [recCenter, setRecCenter] = useState(NONE);
  const [recCommitment, setRecCommitment] = useState(NONE);
  const [recQuota, setRecQuota] = useState(NONE);
  const [savingRec, setSavingRec] = useState(false);
  const [recFile, setRecFile] = useState<File | null>(null);

  const [partsOpen, setPartsOpen] = useState(false);
  const [partsTarget, setPartsTarget] = useState<MaintenanceRecordRow | null>(null);
  const [partId, setPartId] = useState(NONE);
  const [partItem, setPartItem] = useState(NONE);
  const [partQty, setPartQty] = useState("1");

  const [recCancelOpen, setRecCancelOpen] = useState(false);
  const [recCancelTarget, setRecCancelTarget] = useState<MaintenanceRecordRow | null>(null);

  const [fStatus, setFStatus] = useState(ALL);
  const [fVehicle, setFVehicle] = useState(ALL);
  const [search, setSearch] = useState("");

  const filteredReqs = useMemo(
    () =>
      requests.filter((r) => {
        if (fStatus !== ALL && r.status !== fStatus) return false;
        if (fVehicle !== ALL && r.vehicle_id !== fVehicle) return false;
        const q = search.trim().toLowerCase();
        return !q || `${r.code ?? ""} ${r.description} ${(r.vehicle?.plate ?? r.vehicle?.asset_code ?? "")}`.toLowerCase().includes(q);
      }),
    [requests, fStatus, fVehicle, search],
  );

  const filteredRecs = useMemo(
    () =>
      records.filter((r) => {
        if (fVehicle !== ALL && r.vehicle_id !== fVehicle) return false;
        const q = search.trim().toLowerCase();
        return !q || `${r.code ?? ""} ${r.services} ${(r.vehicle?.plate ?? r.vehicle?.asset_code ?? "")}`.toLowerCase().includes(q);
      }),
    [records, fVehicle, search],
  );

  const totals = useMemo(() => {
    const abertas = requests.filter((r) => !["concluida", "cancelada"].includes(r.status)).length;
    const emManutencao = requests.filter((r) => r.status === "em_manutencao").length;
    const concluidas = records.filter((r) => r.status === "concluida");
    const custo = concluidas.reduce((s, r) => s + maintenanceTotal(r), 0);
    return { abertas, emManutencao, concluidas: concluidas.length, custo };
  }, [requests, records]);

  /* ------------------------------- ações -------------------------------- */

  /** Bloco 5.6 — só planos preventivos cadastrados para o bem selecionado. */
  function plansForVehicle(vehicleId: string) {
    if (vehicleId === NONE) return [];
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    return plans.filter(
      (p) =>
        p.active !== false &&
        (p.vehicle_id === vehicleId || (!p.vehicle_id && (!p.vehicle_type || p.vehicle_type === vehicle?.vehicle_type))),
    );
  }

  /** Bloco 5.1 — ao escolher o solicitante, sugerir a unidade vinculada a ele. */
  function pickRequesterEmployee(id: string) {
    setReqEmployee(id);
    const emp = employees.find((e) => e.id === id);
    if (emp?.unit_id) setReqUnit(emp.unit_id);
  }

  function openNewReq() {
    setEditingReq(null);
    setReqVehicle(NONE);
    setReqUnit(NONE);
    setReqEmployee(NONE);
    setReqPlan(NONE);
    setReqKind("corretiva");
    setReqPriority("normal");
    setReqStatus("aberta");
    setReqOpen(true);
  }

  function openEditReq(r: MaintenanceRequestRow) {
    setEditingReq(r);
    setReqVehicle(r.vehicle_id);
    setReqUnit(r.unit_id ?? NONE);
    setReqEmployee(r.requester_employee_id ?? NONE);
    setReqPlan(r.plan_id ?? NONE);
    setReqKind(r.kind);
    setReqPriority(r.priority);
    setReqStatus(r.status);
    setReqOpen(true);
  }

  async function submitReq(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = requestSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (reqVehicle === NONE) {
      toast.error("Selecione o veículo.");
      return;
    }
    if (reqStatus === "cancelada") {
      toast.error("Use a ação de cancelamento para informar o motivo.");
      return;
    }
    const d = parsed.data;
    setSavingReq(true);
    let reqAttachment: string | null = null;
    if (reqFile) {
      try {
        reqAttachment = await uploadMaintenanceFile(orgId!, reqFile, "solicitacoes");
      } catch (err) {
        setSavingReq(false);
        toast.error(err instanceof Error ? err.message : "Falha ao enviar o anexo.");
        return;
      }
    }
    const payload = {
      vehicle_id: reqVehicle,
      unit_id: reqUnit === NONE ? null : reqUnit,
      requester_employee_id: reqEmployee === NONE ? null : reqEmployee,
      plan_id: reqPlan === NONE ? null : reqPlan,
      kind: reqKind,
      priority: reqPriority,
      status: reqStatus,
      description: d.description,
      odometer_km: numOrNull(d.odometer_km ?? null),
      hour_meter: numOrNull(d.hour_meter ?? null),
      notes: d.notes || null,
      ...(reqAttachment ? { attachment_path: reqAttachment } : {}),
    };
    const { error } = editingReq
      ? await supabase.from("maintenance_requests").update({ ...payload, updated_by: userId }).eq("id", editingReq.id)
      : await supabase.from("maintenance_requests").insert({
          ...payload,
          organization_id: orgId!,
          requester_id: userId,
          requester_name: userName,
          created_by: userId,
        });
    setSavingReq(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(editingReq ? "Solicitação atualizada." : "Solicitação registrada.");
    setReqFile(null);
    invalidate(["maintenance-requests", "vehicles", "vehicle-status-history"]);
    setReqOpen(false);
  }

  async function confirmCancelReq(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cancelTarget) return;
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    if (reason.length < 5) {
      toast.error("Informe o motivo do cancelamento (mínimo 5 caracteres).");
      return;
    }
    const { error } = await supabase
      .from("maintenance_requests")
      .update({ status: "cancelada", cancel_reason: reason, updated_by: userId })
      .eq("id", cancelTarget.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Solicitação cancelada.");
    invalidate(["maintenance-requests", "vehicles"]);
    setCancelOpen(false);
  }

  /** Solicitação vinculada ao registro em edição/criação (Bloco 5.2). */
  const selectedRequest = recRequest === NONE ? null : requests.find((r) => r.id === recRequest) ?? null;

  /** Bloco 5.2 — aproveita todos os dados já registrados na solicitação. */
  function pickRequest(id: string) {
    setRecRequest(id);
    const r = requests.find((x) => x.id === id);
    if (!r) return;
    setRecVehicle(r.vehicle_id);
    setRecKind(r.kind);
  }

  const contractsForMaintenance = contracts.filter(
    (c) => c.status === "vigente" && (c.items ?? []).some((i) => i.active !== false),
  );
  const itemsOfContract = (contractId: string) =>
    contractId === NONE
      ? []
      : (contracts.find((c) => c.id === contractId)?.items ?? []).filter((i) => i.active !== false);
  const selectedItem = itemsOfContract(recContract).find((i) => i.id === recItem) ?? null;
  const selectedPartItem =
    partsTarget?.contract_id ? itemsOfContract(partsTarget.contract_id).find((i) => i.id === partItem) ?? null : null;
  const laborUnitPrice = Number(selectedItem?.unit_price ?? 0);
  const laborQty = parseBRNumber(recLaborQty || "0") || 0;
  const laborTotal = laborUnitPrice * laborQty;

  function openNewRec(fromRequest?: MaintenanceRequestRow) {
    setEditingRec(null);
    setRecVehicle(fromRequest?.vehicle_id ?? NONE);
    setRecRequest(fromRequest?.id ?? NONE);
    setRecSupplier(NONE);
    setRecKind(fromRequest?.kind ?? "corretiva");
    setRecCenter(fromRequest?.cost_center_id ?? NONE);
    setRecCommitment(NONE);
    setRecQuota(NONE);
    setRecMode(fromRequest ? "solicitacao" : "solicitacao");
    setRecOrigin("compra_direta");
    setRecContract(NONE);
    setRecItem(NONE);
    setRecLaborQty("");
    setRecOpen(true);
  }

  function openEditRec(r: MaintenanceRecordRow) {
    setEditingRec(r);
    setRecVehicle(r.vehicle_id);
    setRecRequest(r.request_id ?? NONE);
    setRecSupplier(r.supplier_id ?? NONE);
    setRecKind(r.kind);
    setRecCenter(r.cost_center_id ?? NONE);
    setRecCommitment(r.commitment_id ?? NONE);
    setRecQuota(r.quota_id ?? NONE);
    setRecMode(r.request_id ? "solicitacao" : "avulsa");
    setRecOrigin(r.expense_origin === "contrato" ? "contrato" : "compra_direta");
    setRecContract(r.contract_id ?? NONE);
    setRecItem(r.contract_item_id ?? NONE);
    setRecLaborQty(r.labor_quantity ? String(r.labor_quantity) : "");
    setRecOpen(true);
  }

  async function submitRec(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = recordSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (recVehicle === NONE) {
      toast.error("Selecione o veículo.");
      return;
    }
    if (recOrigin === "contrato") {
      if (recContract === NONE || recItem === NONE) {
        toast.error("Selecione o contrato e o item de mão de obra/serviço.");
        return;
      }
      if (laborQty <= 0) {
        toast.error("Informe a quantidade de horas/serviços executados.");
        return;
      }
      if (selectedItem && laborQty > contractItemBalance(selectedItem) + Number(editingRec?.labor_quantity ?? 0)) {
        toast.error("Quantidade acima do saldo disponível no item do contrato.");
        return;
      }
    }
    const d = parsed.data;
    const req = recRequest === NONE ? null : requests.find((r) => r.id === recRequest) ?? null;
    if (req && req.vehicle_id !== recVehicle) {
      toast.error("A solicitação selecionada é de outro veículo.");
      return;
    }
    setSavingRec(true);
    let recAttachment: string | null = null;
    if (recFile) {
      try {
        recAttachment = await uploadMaintenanceFile(orgId!, recFile, "manutencoes");
      } catch (err) {
        setSavingRec(false);
        toast.error(err instanceof Error ? err.message : "Falha ao enviar o anexo.");
        return;
      }
    }
    const payload = {
      vehicle_id: recVehicle,
      request_id: recRequest === NONE ? null : recRequest,
      plan_id: req?.plan_id ?? null,
      unit_id: req?.unit_id ?? null,
      supplier_id: recSupplier === NONE ? null : recSupplier,
      kind: recKind,
      entry_at: new Date(d.entry_at).toISOString(),
      exit_at: d.exit_at ? new Date(d.exit_at).toISOString() : null,
      services: d.services,
      odometer_km: numOrNull(d.odometer_km ?? null),
      hour_meter: numOrNull(d.hour_meter ?? null),
      labor_value: recOrigin === "contrato" ? laborTotal : numOrNull(d.labor_value ?? null) ?? 0,
      contract_id: recOrigin === "contrato" && recContract !== NONE ? recContract : null,
      contract_item_id: recOrigin === "contrato" && recItem !== NONE ? recItem : null,
      labor_quantity: recOrigin === "contrato" ? laborQty : null,
      labor_unit_price: recOrigin === "contrato" ? laborUnitPrice : null,
      other_value: numOrNull(d.other_value ?? null) ?? 0,
      invoice_number: d.invoice_number || null,
      warranty_days: d.warranty_days ? Number(d.warranty_days) : null,
      notes: d.notes || null,
      /* Metadados financeiros derivados: mantidos para relatórios e integrações, sem digitação na tela operacional. */
      cost_center_id: recCenter === NONE ? null : recCenter,
      commitment_id: recCommitment === NONE ? null : recCommitment,
      quota_id: recQuota === NONE ? null : recQuota,
      expense_origin: recOrigin,
      ...(recAttachment ? { attachment_path: recAttachment } : {}),
    };
    const { error } = editingRec
      ? await supabase.from("maintenance_records").update({ ...payload, updated_by: userId }).eq("id", editingRec.id)
      : await supabase.from("maintenance_records").insert({ ...payload, organization_id: orgId!, created_by: userId });
    setSavingRec(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(editingRec ? "Manutenção atualizada." : "Manutenção registrada.");
    setRecFile(null);
    invalidate(["maintenance-records", "maintenance-requests", "vehicles", "contracts", "contract-items"]);
    setRecOpen(false);
  }

  async function concludeRec(r: MaintenanceRecordRow) {
    if (!confirm(`Concluir a manutenção ${r.code}? Os dados críticos ficarão imutáveis.`)) return;
    const { error } = await supabase
      .from("maintenance_records")
      .update({
        status: "concluida",
        exit_at: r.exit_at ?? new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", r.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    if (r.request_id) {
      await supabase.from("maintenance_requests").update({ status: "concluida" }).eq("id", r.request_id);
    }
    const plan = r.plan_id ? plans.find((p) => p.id === r.plan_id) : null;
    if (plan) {
      /* Bloco 5.6 — o histórico do plano é atualizado pelo próprio banco na transição para concluída
         (sem duplicar em reabertura/edição). Aqui apenas informamos a próxima ocorrência calculada. */
      const parts: string[] = [];
      if (plan.interval_km && r.odometer_km) parts.push(`${num(Number(r.odometer_km) + Number(plan.interval_km), 0)} km`);
      if (plan.interval_hours && r.hour_meter) parts.push(`${num(Number(r.hour_meter) + Number(plan.interval_hours), 1)} h`);
      if (plan.interval_months) {
        const d = new Date();
        d.setMonth(d.getMonth() + Number(plan.interval_months));
        parts.push(dateBR(d.toISOString()));
      }
      toast.success(
        parts.length
          ? `Manutenção concluída. Plano "${plan.name}" atualizado — próxima prevista em ${parts.join(" · ")}.`
          : `Manutenção concluída. Plano "${plan.name}" atualizado.`,
      );
    } else {
      toast.success("Manutenção concluída.");
    }
    invalidate(["maintenance-records", "maintenance-requests", "vehicles", "commitments", "quotas", "maintenance-plans"]);
  }

  async function confirmCancelRec(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!recCancelTarget) return;
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    if (reason.length < 5) {
      toast.error("Informe o motivo do cancelamento (mínimo 5 caracteres).");
      return;
    }
    const { error } = await supabase
      .from("maintenance_records")
      .update({ status: "cancelada", cancel_reason: reason, updated_by: userId })
      .eq("id", recCancelTarget.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Manutenção cancelada e saldo estornado quando aplicável.");
    invalidate(["maintenance-records", "commitments", "quotas"]);
    setRecCancelOpen(false);
  }

  async function addPart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!partsTarget) return;
    const form = new FormData(e.currentTarget);
    const byContract = !!partsTarget.contract_id;
    if (byContract && !selectedPartItem) {
      toast.error("Selecione a peça entre os itens do contrato.");
      return;
    }
    const description = byContract
      ? selectedPartItem!.description
      : partId === NONE
        ? String(form.get("description") ?? "").trim()
        : catalog.find((c) => c.id === partId)?.description ?? "";
    const quantity = byContract ? parseBRNumber(partQty || "0") || 0 : numOrNull(form.get("quantity")) ?? 0;
    const unitValue = byContract ? Number(selectedPartItem!.unit_price) : numOrNull(form.get("unit_value")) ?? 0;
    if (byContract && quantity > contractItemBalance(selectedPartItem!)) {
      toast.error("Quantidade acima do saldo disponível no item do contrato.");
      return;
    }
    if (!description) {
      toast.error("Informe a peça.");
      return;
    }
    if (quantity <= 0) {
      toast.error("A quantidade deve ser maior que zero.");
      return;
    }
    const { error } = await supabase.from("maintenance_parts").insert({
      organization_id: orgId!,
      maintenance_record_id: partsTarget.id,
      vehicle_id: partsTarget.vehicle_id,
      part_id: !partsTarget.contract_id && partId !== NONE ? partId : null,
      contract_item_id: partsTarget.contract_id ? partItem : null,
      description,
      quantity,
      unit_value: unitValue,
      odometer_km: partsTarget.odometer_km,
      warranty_days: form.get("warranty_days") ? Number(form.get("warranty_days")) : null,
      notes: String(form.get("notes") ?? "") || null,
      created_by: userId,
    });
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Peça registrada.");
    invalidate(["maintenance-records", "maintenance-parts", "contracts", "contract-items"]);
    setPartId(NONE);
    setPartItem(NONE);
    setPartQty("1");
    e.currentTarget.reset();
  }

  const openRequests = requests.filter((r) => !["concluida", "cancelada"].includes(r.status));

  const pagedReqs = usePaged(filteredReqs);
  const pagedRecs = usePaged(filteredRecs);
  return (
    <>
      <PageHeader
        title="Manutenções"
        description="Solicitações, execução, peças e custos — veículos em manutenção ficam indisponíveis para reservas e abastecimentos."
        action={
          canWrite && orgId ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={openNewReq} className="gap-2">
                <Plus className="size-4" /> Nova solicitação
              </Button>
              {canManageFleet && (
                <Button onClick={() => openNewRec()} className="gap-2">
                  <Wrench className="size-4" /> Registrar manutenção
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Solicitações em aberto", value: String(totals.abertas) },
          { label: "Veículos em manutenção", value: String(totals.emManutencao) },
          { label: "Manutenções concluídas", value: String(totals.concluidas) },
          { label: "Custo total concluído", value: brl(totals.custo) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Buscar</Label>
          <Input placeholder="Código, placa ou descrição" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label>Situação da solicitação</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {MAINTENANCE_REQUEST_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
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
      </div>

      <Tabs defaultValue="solicitacoes">
        <TabsList className="mb-4">
          <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
          <TabsTrigger value="execucoes">Manutenções executadas</TabsTrigger>
        </TabsList>

        <TabsContent value="solicitacoes">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <HelpInlineButton topicKey="/manutencoes/solicitacoes" />
            <span>Ajuda desta aba</span>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Tipo / prioridade</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Situação</TableHead>
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
                {!isLoading && filteredReqs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      <Wrench className="mx-auto mb-2 size-6 opacity-50" />
                      Nenhuma solicitação encontrada.
                    </TableCell>
                  </TableRow>
                )}
                {pagedReqs.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.code}
                      <span className="block text-xs text-muted-foreground">{dateTimeBR(r.requested_at)}</span>
                    </TableCell>
                    <TableCell>
                      {(r.vehicle?.plate ?? r.vehicle?.asset_code ?? "—")}
                      <span className="block text-xs text-muted-foreground">
                        {r.odometer_km ? `${num(Number(r.odometer_km), 0)} km` : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      {label(MAINTENANCE_KINDS, r.kind)}
                      <span className="block text-xs text-muted-foreground">
                        {label(MAINTENANCE_PRIORITIES, r.priority)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm">{r.description}</TableCell>
                    <TableCell className="text-sm">{r.unit?.acronym ?? r.unit?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={REQ_VARIANT[r.status] ?? "secondary"}>
                        {label(MAINTENANCE_REQUEST_STATUS, r.status)}
                      </Badge>
                      {r.cancel_reason && (
                        <span className="mt-1 block text-xs text-muted-foreground">{r.cancel_reason}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canWrite && !["concluida", "cancelada"].includes(r.status) && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEditReq(r)}>
                            <Pencil className="size-4" />
                          </Button>
                          {canManageFleet && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Registrar manutenção"
                              onClick={() => openNewRec(r)}
                            >
                              <Wrench className="size-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Cancelar"
                            onClick={() => {
                              setCancelTarget(r);
                              setCancelOpen(true);
                            }}
                          >
                            <Ban className="size-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination state={pagedReqs} />
          </div>
        </TabsContent>

        <TabsContent value="execucoes">
          <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Oficina / fornecedor</TableHead>
                  <TableHead>Entrada / saída</TableHead>
                  <TableHead className="text-right">Mão de obra</TableHead>
                  <TableHead className="text-right">Peças</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      <Wrench className="mx-auto mb-2 size-6 opacity-50" />
                      Nenhuma manutenção registrada.
                    </TableCell>
                  </TableRow>
                )}
                {pagedRecs.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.code}
                      <span className="block text-xs text-muted-foreground">{label(MAINTENANCE_KINDS, r.kind)}</span>
                    </TableCell>
                    <TableCell>
                      {(r.vehicle?.plate ?? r.vehicle?.asset_code ?? "—")}
                      <span className="block text-xs text-muted-foreground">
                        {r.odometer_km ? `${num(Number(r.odometer_km), 0)} km` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.supplier ? r.supplier.trade_name || r.supplier.legal_name : "—"}
                      <span className="block text-xs text-muted-foreground">
                        {r.invoice_number ? `NF ${r.invoice_number}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {dateTimeBR(r.entry_at)}
                      <span className="block text-xs text-muted-foreground">
                        {r.exit_at ? dateTimeBR(r.exit_at) : "em aberto"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{brl(Number(r.labor_value))}</TableCell>
                    <TableCell className="text-right">{brl(Number(r.parts_value))}</TableCell>
                    <TableCell className="text-right font-medium">
                      {brl(maintenanceTotal(r))}
                      <span className="block text-xs text-muted-foreground">
                        {r.commitment ? `Empenho ${r.commitment.number}` : r.quota ? `Cota ${r.quota.name}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "concluida" ? "secondary" : r.status === "cancelada" ? "destructive" : "default"}>
                        {label(MAINTENANCE_RECORD_STATUS, r.status)}
                      </Badge>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {r.warranty_until ? `Garantia até ${dateBR(r.warranty_until)}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      {canManageFleet && (
                        <div className="flex gap-1">
                          {r.status === "em_execucao" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Peças"
                                onClick={() => {
                                  setPartsTarget(r);
                                  setPartId(NONE);
                                  setPartsOpen(true);
                                }}
                              >
                                <Cog className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEditRec(r)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" aria-label="Concluir" onClick={() => concludeRec(r)}>
                                <CheckCircle2 className="size-4" />
                              </Button>
                            </>
                          )}
                          {r.status !== "cancelada" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Cancelar"
                              onClick={() => {
                                setRecCancelTarget(r);
                                setRecCancelOpen(true);
                              }}
                            >
                              <Ban className="size-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination state={pagedRecs} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Solicitação */}
      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReq ? `Editar solicitação ${editingReq.code}` : "Nova solicitação de manutenção"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitReq} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Veículo *</Label>
                <Select value={reqVehicle} onValueChange={setReqVehicle}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Selecione</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {(v.plate ?? v.asset_code)} — {v.model ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={reqKind} onValueChange={(v) => setReqKind(v as MaintenanceKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={reqPriority} onValueChange={(v) => setReqPriority(v as MaintenancePriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Funcionário solicitante</Label>
                <Select value={reqEmployee} onValueChange={pickRequesterEmployee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Não informar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {employees
                      .filter((e) => e.active)
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unidade solicitante</Label>
                <Select value={reqUnit} onValueChange={setReqUnit} disabled={!canManageFleet && reqEmployee !== NONE}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.acronym ?? u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preenchida automaticamente pela unidade do funcionário solicitante.
                </p>
              </div>
              <div>
                <Label>Plano preventivo</Label>
                <Select value={reqPlan} onValueChange={setReqPlan}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não vincular</SelectItem>
                    {plansForVehicle(reqVehicle).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reqVehicle === NONE ? (
                  <p className="mt-1 text-xs text-muted-foreground">Selecione o veículo para ver os planos do bem.</p>
                ) : plansForVehicle(reqVehicle).length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">Nenhum plano cadastrado para este bem.</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="odometer_km">KM atual</Label>
                <Input id="odometer_km" name="odometer_km" inputMode="numeric" defaultValue={editingReq?.odometer_km ?? ""} />
              </div>
              <div>
                <Label htmlFor="hour_meter">Horímetro</Label>
                <Input id="hour_meter" name="hour_meter" inputMode="numeric" defaultValue={editingReq?.hour_meter ?? ""} />
              </div>
              {editingReq && (
                <div>
                  <Label>Situação</Label>
                  <Select value={reqStatus} onValueChange={(v) => setReqStatus(v as MaintenanceRequestStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAINTENANCE_REQUEST_STATUS.filter((s) => s.value !== "cancelada").map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="sm:col-span-3">
                <Label htmlFor="description">Descrição do problema / serviço *</Label>
                <Textarea id="description" name="description" rows={3} defaultValue={editingReq?.description ?? ""} required />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editingReq?.notes ?? ""} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="req-file">Foto ou documento (opcional)</Label>
                <Input
                  id="req-file"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setReqFile(e.target.files?.[0] ?? null)}
                />
                {editingReq?.attachment_path && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => openMaintenanceFile(editingReq.attachment_path!)}
                  >
                    Ver anexo atual
                  </Button>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReqOpen(false)}>
                Fechar
              </Button>
              <Button type="submit" disabled={savingReq}>
                {savingReq ? "Salvando…" : "Salvar solicitação"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cancelamento da solicitação */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar solicitação {cancelTarget?.code}</DialogTitle>
          </DialogHeader>
          <form onSubmit={confirmCancelReq} className="space-y-4">
            <div>
              <Label htmlFor="reason">Motivo do cancelamento *</Label>
              <Textarea id="reason" name="reason" rows={3} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
                Voltar
              </Button>
              <Button type="submit" variant="destructive">
                Confirmar cancelamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manutenção */}
      <Dialog open={recOpen} onOpenChange={setRecOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRec ? `Editar manutenção ${editingRec.code}` : "Registrar manutenção"}</DialogTitle>
          </DialogHeader>
          <form key={`${editingRec?.id ?? "novo"}-${recRequest}`} onSubmit={submitRec} className="space-y-4">
            {!editingRec && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <Label>Como deseja registrar?</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={recMode === "solicitacao" ? "default" : "outline"}
                    onClick={() => setRecMode("solicitacao")}
                  >
                    Usar solicitação existente
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={recMode === "avulsa" ? "default" : "outline"}
                    onClick={() => {
                      setRecMode("avulsa");
                      setRecRequest(NONE);
                    }}
                  >
                    Registrar manutenção sem solicitação prévia
                  </Button>
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              {recMode === "solicitacao" && !editingRec && (
                <div className="sm:col-span-3">
                  <Label>Solicitação *</Label>
                  <Select value={recRequest} onValueChange={pickRequest}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a solicitação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Selecione</SelectItem>
                      {openRequests.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.code} — {(r.vehicle?.plate ?? r.vehicle?.asset_code ?? "")} — {r.description.slice(0, 40)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Os dados já registrados na solicitação são aproveitados automaticamente: bem, unidade, tipo, plano
                    preventivo, descrição, medições e observações.
                  </p>
                </div>
              )}
              <div>
                <Label>Veículo *</Label>
                <Select value={recVehicle} onValueChange={setRecVehicle}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Selecione</SelectItem>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {(v.plate ?? v.asset_code)} — {v.model ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={recKind} onValueChange={(v) => setRecKind(v as MaintenanceKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Oficina / fornecedor</Label>
                <Select value={recSupplier} onValueChange={setRecSupplier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informar</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.trade_name || s.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="entry_at">Entrada *</Label>
                <Input
                  id="entry_at"
                  name="entry_at"
                  type="datetime-local"
                  defaultValue={(editingRec?.entry_at ?? new Date().toISOString()).slice(0, 16)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="exit_at">Saída</Label>
                <Input
                  id="exit_at"
                  name="exit_at"
                  type="datetime-local"
                  defaultValue={editingRec?.exit_at ? editingRec.exit_at.slice(0, 16) : ""}
                />
              </div>
              <div>
                <Label htmlFor="odometer_km">KM na manutenção</Label>
                <Input
                  id="odometer_km"
                  name="odometer_km"
                  inputMode="numeric"
                  defaultValue={editingRec?.odometer_km ?? selectedRequest?.odometer_km ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="hour_meter">Horímetro</Label>
                <Input
                  id="hour_meter"
                  name="hour_meter"
                  inputMode="numeric"
                  defaultValue={editingRec?.hour_meter ?? selectedRequest?.hour_meter ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="invoice_number">Nota fiscal</Label>
                <Input id="invoice_number" name="invoice_number" defaultValue={editingRec?.invoice_number ?? ""} />
              </div>
              <div>
                <Label htmlFor="warranty_days">Garantia (dias)</Label>
                <Input id="warranty_days" name="warranty_days" inputMode="numeric" defaultValue={editingRec?.warranty_days ?? ""} />
              </div>
              <div>
                <Label htmlFor="other_value">Outros valores (R$)</Label>
                <MoneyInput id="other_value" name="other_value" defaultValue={editingRec?.other_value ?? ""} />
              </div>

              {/* Bloco 5.3 — mão de obra por contrato ou compra direta */}
              <div className="sm:col-span-3 rounded-lg border bg-muted/20 p-3">
                <Label>Execução do serviço</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={recOrigin === "contrato" ? "default" : "outline"}
                    onClick={() => setRecOrigin("contrato")}
                  >
                    Por contrato
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={recOrigin === "compra_direta" ? "default" : "outline"}
                    onClick={() => {
                      setRecOrigin("compra_direta");
                      setRecContract(NONE);
                      setRecItem(NONE);
                    }}
                  >
                    Compra direta / pronto pagamento
                  </Button>
                </div>

                {recOrigin === "contrato" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Contrato vigente *</Label>
                      <Select
                        value={recContract}
                        onValueChange={(v) => {
                          setRecContract(v);
                          setRecItem(NONE);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o contrato" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Selecione</SelectItem>
                          {contractsForMaintenance.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.number} — {c.supplier?.trade_name ?? c.supplier?.legal_name ?? c.entity?.name ?? ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Item de mão de obra / serviço *</Label>
                      <Select value={recItem} onValueChange={setRecItem} disabled={recContract === NONE}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o item do contrato" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Selecione</SelectItem>
                          {itemsOfContract(recContract).map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.item_number ? `Item ${i.item_number} — ` : ""}
                              {i.description} — {brl(Number(i.unit_price))}/{i.measure_unit ?? "un"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="labor_quantity">Quantidade executada (horas/serviços) *</Label>
                      <Input
                        id="labor_quantity"
                        inputMode="decimal"
                        value={recLaborQty}
                        onChange={(e) => setRecLaborQty(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <Label>Valor unitário do item (contratual)</Label>
                      <Input value={brl(laborUnitPrice)} readOnly disabled />
                    </div>
                    {selectedItem && (
                      <div className="sm:col-span-2 text-sm">
                        <p className="text-muted-foreground">
                          Saldo disponível do item: {num(contractItemBalance(selectedItem), 2)}{" "}
                          {selectedItem.measure_unit ?? "un"}
                        </p>
                        <p className="gov-title mt-1 text-lg">Total da mão de obra: {brl(laborTotal)}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 max-w-xs">
                    <Label htmlFor="labor_value">Mão de obra (R$)</Label>
                    <MoneyInput id="labor_value" name="labor_value" defaultValue={editingRec?.labor_value ?? ""} />
                  </div>
                )}
              </div>

              <div className="sm:col-span-3">
                <Label htmlFor="services">Serviços executados *</Label>
                <Textarea
                  id="services"
                  name="services"
                  rows={3}
                  defaultValue={editingRec?.services ?? selectedRequest?.description ?? ""}
                  required
                />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={2} defaultValue={editingRec?.notes ?? selectedRequest?.notes ?? ""} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="rec-file">Nota fiscal ou documento (opcional)</Label>
                <Input
                  id="rec-file"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setRecFile(e.target.files?.[0] ?? null)}
                />
                {editingRec?.attachment_path && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => openMaintenanceFile(editingRec.attachment_path!)}
                  >
                    Ver anexo atual
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              As peças são lançadas após salvar, pelo botão de peças na lista, e o valor é somado automaticamente ao total.
              Quando a execução é por contrato, o preço vem do item contratual e o consumo do saldo é registrado de forma
              auditável; centro de custo, empenho e cota são derivados da origem e não precisam ser digitados aqui.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRecOpen(false)}>
                Fechar
              </Button>
              <Button type="submit" disabled={savingRec}>
                {savingRec ? "Salvando…" : "Salvar manutenção"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Peças da manutenção */}
      <Dialog open={partsOpen} onOpenChange={setPartsOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Peças da manutenção {partsTarget?.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Peça</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Unitário</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Garantia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(records.find((r) => r.id === partsTarget?.id)?.parts ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        Nenhuma peça lançada.
                      </TableCell>
                    </TableRow>
                  )}
                  {(records.find((r) => r.id === partsTarget?.id)?.parts ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.description}</TableCell>
                      <TableCell className="text-right">{num(Number(p.quantity), 2)}</TableCell>
                      <TableCell className="text-right">{brl(Number(p.unit_value))}</TableCell>
                      <TableCell className="text-right">{brl(Number(p.total_value))}</TableCell>
                      <TableCell>{p.warranty_until ? dateBR(p.warranty_until) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <form onSubmit={addPart} className="grid gap-4 sm:grid-cols-3">
              {partsTarget?.contract_id ? (
                <>
                  {/* Bloco 5.4 — peças somente entre os itens do contrato da manutenção */}
                  <div className="sm:col-span-3">
                    <Label>Peça do contrato *</Label>
                    <Select value={partItem} onValueChange={setPartItem}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o item do contrato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Selecione</SelectItem>
                        {itemsOfContract(partsTarget.contract_id).map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.item_number ? `Item ${i.item_number} — ` : ""}
                            {i.description}
                            {i.item_code ? ` · ref. ${i.item_code}` : ""} — saldo {num(contractItemBalance(i), 2)}{" "}
                            {i.measure_unit ?? "un"} — {brl(Number(i.unit_price))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="quantity">Quantidade utilizada *</Label>
                    <Input
                      id="quantity"
                      name="quantity"
                      inputMode="decimal"
                      value={partQty}
                      onChange={(e) => setPartQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Valor unitário contratual</Label>
                    <Input value={brl(Number(selectedPartItem?.unit_price ?? 0))} readOnly disabled />
                  </div>
                  <div>
                    <Label>Total da linha</Label>
                    <Input
                      value={brl(Number(selectedPartItem?.unit_price ?? 0) * (parseBRNumber(partQty || "0") || 0))}
                      readOnly
                      disabled
                    />
                  </div>
                  {selectedPartItem && (
                    <p className="sm:col-span-3 text-xs text-muted-foreground">
                      Unidade {selectedPartItem.measure_unit ?? "un"} · saldo disponível{" "}
                      {num(contractItemBalance(selectedPartItem), 2)}. O consumo é registrado no item contratual de forma
                      auditável e não pode ultrapassar o saldo.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="sm:col-span-3">
                    <Label>Peça do catálogo</Label>
                    <Select value={partId} onValueChange={setPartId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Peça avulsa (descrever)</SelectItem>
                        {catalog
                          .filter((c) => c.active)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.internal_code ? `${c.internal_code} — ` : ""}
                              {c.description}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {partId === NONE && (
                    <div className="sm:col-span-3">
                      <Label htmlFor="description">Descrição da peça *</Label>
                      <Input id="description" name="description" />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="quantity">Quantidade *</Label>
                    <Input id="quantity" name="quantity" inputMode="decimal" defaultValue="1" />
                  </div>
                  <div>
                    <Label htmlFor="unit_value">Valor unitário (R$)</Label>
                    <MoneyInput id="unit_value" name="unit_value" />
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="warranty_days">Garantia (dias)</Label>
                <Input id="warranty_days" name="warranty_days" inputMode="numeric" />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Input id="notes" name="notes" />
              </div>
              <div className="sm:col-span-3 flex items-center justify-between">
                <p className="text-sm">
                  Total geral das peças:{" "}
                  <strong>
                    {brl(
                      (records.find((r) => r.id === partsTarget?.id)?.parts ?? []).reduce(
                        (s, p) => s + Number(p.total_value ?? 0),
                        0,
                      ),
                    )}
                  </strong>
                </p>
                <Button type="submit" className="gap-2">
                  <Plus className="size-4" /> Adicionar peça
                </Button>
              </div>
            </form>

          </div>
        </DialogContent>
      </Dialog>

      {/* Cancelamento da manutenção */}
      <Dialog open={recCancelOpen} onOpenChange={setRecCancelOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar manutenção {recCancelTarget?.code}</DialogTitle>
          </DialogHeader>
          <form onSubmit={confirmCancelRec} className="space-y-4">
            <div>
              <Label htmlFor="reason">Motivo do cancelamento *</Label>
              <Textarea id="reason" name="reason" rows={3} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRecCancelOpen(false)}>
                Voltar
              </Button>
              <Button type="submit" variant="destructive">
                Confirmar cancelamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
