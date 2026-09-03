import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Paperclip, Pencil, Plus, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { MoneyInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  INSURANCE_STATUS,
  brl,
  dateBR,
  daysUntil,
  dbMessage,
  label,
  openFleetFile,
  parseBRNumber,
  supabase,
  uploadFleetFile,
  useContracts,
  useInsurancePolicies,
  useInvalidate,
  usePerms,
  useSuppliers,
  useVehicles,
  type InsurancePolicyRow,
  type InsuranceStatus,
} from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/seguros")({
  head: () => ({
    meta: [
      { title: "Seguros da Frota — FrotaGov" },
      {
        name: "description",
        content:
          "Apólices de seguro da frota pública: seguradora, vigência, prêmio, franquias, coberturas, veículos cobertos e renovações.",
      },
      { property: "og:title", content: "Seguros da Frota — FrotaGov" },
      { property: "og:description", content: "Controle de apólices e alertas de vencimento de seguro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Seguros,
});

const NONE = "__none__";
const ALERT_LEADS = [60, 30, 15, 5];

const schema = z.object({
  insurer_name: z.string().trim().min(2, "Informe a seguradora").max(160),
  policy_number: z.string().trim().min(1, "Informe o número da apólice").max(80),
  valid_from: z.string().min(1, "Informe o início da vigência"),
  valid_to: z.string().min(1, "Informe o fim da vigência"),
  premium_value: z.string().optional(),
  deductible_value: z.string().optional(),
  coverages: z.string().trim().max(1000).optional(),
  limits_notes: z.string().trim().max(600).optional(),
  notes: z.string().trim().max(600).optional(),
});

const numOrNull = (v: string | undefined) => {
  const n = parseBRNumber(String(v ?? ""));
  return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

function Seguros() {
  const { data: policies = [], isLoading } = useInsurancePolicies();
  const { data: suppliers = [] } = useSuppliers();
  const { data: contracts = [] } = useContracts();
  const { data: vehicles = [] } = useVehicles();
  const { canManageFleet, orgId, userId } = usePerms();
  const invalidate = useInvalidate();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InsurancePolicyRow | null>(null);
  const [renewFrom, setRenewFrom] = useState<InsurancePolicyRow | null>(null);
  const [supplierId, setSupplierId] = useState(NONE);
  const [contractId, setContractId] = useState(NONE);
  const [status, setStatus] = useState<InsuranceStatus>("ativa");
  const [covered, setCovered] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const ativas = policies.filter((p) => p.status === "ativa" || p.status === "a_vencer");
    return {
      ativas: ativas.length,
      aVencer: ativas.filter((p) => {
        const d = daysUntil(p.valid_to);
        return d !== null && d >= 0 && d <= 60;
      }).length,
      vencidas: policies.filter((p) => p.status === "vencida").length,
      premio: ativas.reduce((s, p) => s + Number(p.premium_value ?? 0), 0),
    };
  }, [policies]);

  function openNew(base?: InsurancePolicyRow) {
    setEditing(null);
    setRenewFrom(base ?? null);
    setSupplierId(base?.supplier_id ?? NONE);
    setContractId(base?.contract_id ?? NONE);
    setStatus("ativa");
    setCovered(base ? (base.vehicles ?? []).map((v) => v.vehicle_id) : []);
    setOpen(true);
  }

  function openEdit(p: InsurancePolicyRow) {
    setEditing(p);
    setRenewFrom(null);
    setSupplierId(p.supplier_id ?? NONE);
    setContractId(p.contract_id ?? NONE);
    setStatus(p.status);
    setCovered((p.vehicles ?? []).map((v) => v.vehicle_id));
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const d = parsed.data;
    if (d.valid_to < d.valid_from) {
      toast.error("O fim da vigência deve ser posterior ao início.");
      return;
    }
    setSaving(true);
    try {
      const input = form.elements.namedItem("file") as HTMLInputElement | null;
      const file = input?.files?.[0];
      const path = file && orgId ? await uploadFleetFile(orgId, file, "seguros") : null;
      const payload = {
        insurer_name: d.insurer_name,
        policy_number: d.policy_number,
        supplier_id: supplierId === NONE ? null : supplierId,
        contract_id: contractId === NONE ? null : contractId,
        valid_from: d.valid_from,
        valid_to: d.valid_to,
        premium_value: numOrNull(d.premium_value) ?? 0,
        deductible_value: numOrNull(d.deductible_value),
        coverages: d.coverages || null,
        limits_notes: d.limits_notes || null,
        notes: d.notes || null,
        status,
        ...(path ? { attachment_path: path } : {}),
        ...(renewFrom ? { renewed_from_id: renewFrom.id } : {}),
      };
      let policyId = editing?.id ?? "";
      if (editing) {
        const { error } = await supabase
          .from("insurance_policies")
          .update({ ...payload, updated_by: userId })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("insurance_policies")
          .insert({ ...payload, organization_id: orgId!, created_by: userId })
          .select("id")
          .single();
        if (error) throw error;
        policyId = data.id;
      }

      await supabase.from("insurance_vehicles").delete().eq("policy_id", policyId);
      if (covered.length > 0) {
        const { error } = await supabase.from("insurance_vehicles").insert(
          covered.map((vehicle_id) => ({
            organization_id: orgId!,
            policy_id: policyId,
            vehicle_id,
            created_by: userId,
          })),
        );
        if (error) throw error;
      }
      toast.success(editing ? "Apólice atualizada." : "Apólice registrada.");
      invalidate(["insurance-policies", "fueling-alerts"]);
      setOpen(false);
    } catch (err) {
      const e2 = err as { code?: string };
      toast.error(e2.code === "23505" ? "Já existe apólice com esse número." : dbMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Seguros"
        description={`Apólices vinculadas aos veículos e a contratos administrativos. Alertas automáticos em ${ALERT_LEADS.join(", ")} dias antes do vencimento.`}
        action={
          canManageFleet && orgId ? (
            <Button onClick={() => openNew()} className="gap-2">
              <Plus className="size-4" /> Nova apólice
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Apólices vigentes", value: String(totals.ativas) },
          { label: "A vencer em 60 dias", value: String(totals.aVencer) },
          { label: "Vencidas", value: String(totals.vencidas) },
          { label: "Prêmio total vigente", value: brl(totals.premio) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="gov-title mt-2 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apólice</TableHead>
              <TableHead>Seguradora</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead className="text-right">Prêmio</TableHead>
              <TableHead className="text-right">Franquia</TableHead>
              <TableHead>Veículos</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-28" />
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
            {!isLoading && policies.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <ShieldCheck className="mx-auto mb-2 size-6 opacity-50" />
                  Nenhuma apólice cadastrada.
                </TableCell>
              </TableRow>
            )}
            {policies.map((p) => {
              const d = daysUntil(p.valid_to);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.policy_number}
                    {p.renewed_from_id && <span className="block text-xs text-muted-foreground">Renovação</span>}
                  </TableCell>
                  <TableCell>{p.insurer_name}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {dateBR(p.valid_from)} → {dateBR(p.valid_to)}
                    {d !== null && d >= 0 && d <= 60 && (
                      <span className="block text-xs text-destructive">Vence em {d} dia(s)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{brl(Number(p.premium_value ?? 0))}</TableCell>
                  <TableCell className="text-right">{brl(Number(p.deductible_value ?? 0))}</TableCell>
                  <TableCell>{(p.vehicles ?? []).length}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "vencida" ? "destructive" : p.status === "cancelada" ? "outline" : "default"}>
                      {label(INSURANCE_STATUS, p.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {p.attachment_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Anexo"
                          onClick={() => void openFleetFile(p.attachment_path!)}
                        >
                          <Paperclip className="size-4" />
                        </Button>
                      )}
                      {canManageFleet && (
                        <>
                          <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(p)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openNew(p)}>
                            Renovar
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Apólice ${editing.policy_number}` : renewFrom ? `Renovar apólice ${renewFrom.policy_number}` : "Nova apólice"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="insurer_name">Seguradora *</Label>
                <Input
                  id="insurer_name"
                  name="insurer_name"
                  defaultValue={editing?.insurer_name ?? renewFrom?.insurer_name ?? ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="policy_number">Número da apólice *</Label>
                <Input id="policy_number" name="policy_number" defaultValue={editing?.policy_number ?? ""} required />
              </div>
              <div>
                <Label>Fornecedor cadastrado</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não vincular</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.trade_name ?? s.legal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Contrato administrativo</Label>
                <Select value={contractId} onValueChange={setContractId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não vincular</SelectItem>
                    {contracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as InsuranceStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSURANCE_STATUS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="valid_from">Início da vigência *</Label>
                <Input id="valid_from" name="valid_from" type="date" defaultValue={editing?.valid_from ?? ""} required />
              </div>
              <div>
                <Label htmlFor="valid_to">Fim da vigência *</Label>
                <Input id="valid_to" name="valid_to" type="date" defaultValue={editing?.valid_to ?? ""} required />
              </div>
              <div>
                <Label htmlFor="premium_value">Prêmio (R$)</Label>
                <MoneyInput
                  id="premium_value"
                  name="premium_value"
                  defaultValue={editing?.premium_value ?? renewFrom?.premium_value ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="deductible_value">Franquia padrão (R$)</Label>
                <MoneyInput
                  id="deductible_value"
                  name="deductible_value"
                  defaultValue={editing?.deductible_value ?? renewFrom?.deductible_value ?? ""}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="file" className="flex items-center gap-1">
                  <Upload className="size-3" /> Anexo da apólice
                </Label>
                <Input id="file" name="file" type="file" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="coverages">Coberturas</Label>
                <Textarea id="coverages" name="coverages" rows={3} defaultValue={editing?.coverages ?? renewFrom?.coverages ?? ""} />
              </div>
              <div>
                <Label htmlFor="limits_notes">Limites</Label>
                <Textarea id="limits_notes" name="limits_notes" rows={3} defaultValue={editing?.limits_notes ?? ""} />
              </div>
            </div>

            <div>
              <Label>Veículos cobertos</Label>
              <div className="mt-2 grid max-h-52 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-3">
                {vehicles.map((v) => (
                  <label key={v.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={covered.includes(v.id)}
                      onCheckedChange={(c) =>
                        setCovered((prev) => (c ? [...prev, v.id] : prev.filter((id) => id !== v.id)))
                      }
                    />
                    {(v.plate ?? v.asset_code)}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
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
