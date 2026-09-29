import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { DecimalInput, MoneyInput } from "@/components/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseBRNumber } from "@/lib/format";
import {
  VEHICLE_TYPES,
  dbMessage,
  supabase,
  useInvalidate,
  usePerms,
  useUnits,
  brl,
} from "@/lib/frotagov";
import {
  APPROVAL_ROLES,
  TIME_SOURCES,
  approvalRoleLabel,
  useApprovalLimits,
  useCleaningRules,
  useLaborTimeStandards,
  useMaintenanceDeadlines,
  useMaintenanceSettingsFull,
  type ApprovalLimit,
  type CleaningRule,
  type LaborTimeStandard,
  type MaintenanceDeadline,
} from "@/lib/manutencao-avancada";

export const Route = createFileRoute("/_authenticated/regras-manutencao")({
  head: () => ({
    meta: [
      { title: "Regras de manutenção — FrotaGov" },
      {
        name: "description",
        content:
          "Alçadas financeiras, tempos padrão de reparo, prazos de devolução, limites de lavagem e preço máximo da mão de obra.",
      },
    ],
  }),
  component: RegrasManutencao,
});

const ALL = "__all__";

/* ------------------------------- utilitários ------------------------------- */

function Section({
  title,
  help,
  action,
  children,
}: {
  title: string;
  help: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">{help}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function RowActions({
  onEdit,
  onDelete,
  disabled,
}: {
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  if (disabled) return null;
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="ghost" aria-label="Editar" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Excluir" onClick={onDelete}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

const typeLabel = (v: string | null) => v ?? "Todos os tipos";

function VehicleTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todos os tipos de veículo</SelectItem>
        {VEHICLE_TYPES.map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useRuleTable(
  table: "approval_limits" | "labor_time_standards" | "maintenance_deadlines" | "cleaning_rules",
  key: string,
) {
  const { orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);

  async function save(id: string | null, payload: Record<string, unknown>) {
    if (!orgId) return false;
    setSaving(true);
    const q = id
      ? supabase
          .from(table)
          .update({ ...payload, updated_by: userId } as never)
          .eq("id", id)
      : supabase
          .from(table)
          .insert({ ...payload, organization_id: orgId, created_by: userId } as never);
    const { error } = await q;
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return false;
    }
    toast.success(id ? "Regra atualizada." : "Regra cadastrada.");
    invalidate([key]);
    return true;
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta regra?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Regra excluída.");
    invalidate([key]);
  }

  return { save, remove, saving };
}

/* --------------------------------- alçadas --------------------------------- */

function Alcadas({ canEdit }: { canEdit: boolean }) {
  const { data: rows = [] } = useApprovalLimits();
  const { data: units = [] } = useUnits();
  const { save, remove, saving } = useRuleTable("approval_limits", "approval-limits");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApprovalLimit | null>(null);
  const [role, setRole] = useState<string>("fleet_manager");
  const [unit, setUnit] = useState(ALL);
  const [scope, setScope] = useState("manutencao");
  const [active, setActive] = useState(true);

  function openDialog(r: ApprovalLimit | null) {
    setEditing(r);
    setRole(r?.role ?? "fleet_manager");
    setUnit(r?.unit_id ?? ALL);
    setScope(r?.scope ?? "manutencao");
    setActive(r?.active ?? true);
    setOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const max = parseBRNumber(String(fd.get("max_value") ?? ""));
    if (!(max >= 0) || String(fd.get("max_value") ?? "").trim() === "") {
      toast.error("Informe o valor limite (pode ser zero).");
      return;
    }
    const ok = await save(editing?.id ?? null, {
      role,
      unit_id: unit === ALL ? null : unit,
      scope,
      max_value: max,
      active,
      notes: String(fd.get("notes") ?? "").trim() || null,
    });
    if (ok) setOpen(false);
  }

  return (
    <Section
      title="Alçadas e limites financeiros"
      help="Define até quanto cada perfil pode autorizar em uma ordem de serviço. Enquanto nenhuma alçada estiver cadastrada, não há restrição. Perfis sem alçada cadastrada e o administrador do órgão autorizam sem limite."
      action={
        canEdit ? (
          <Button onClick={() => openDialog(null)} className="gap-2">
            <Plus className="size-4" /> Nova alçada
          </Button>
        ) : undefined
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Perfil</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead>Alcance</TableHead>
            <TableHead className="text-right">Limite por ordem</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                Nenhuma alçada cadastrada: as autorizações não têm limite de valor.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{approvalRoleLabel(r.role)}</TableCell>
              <TableCell>
                {units.find((u) => u.id === r.unit_id)?.name ?? "Todas as unidades"}
              </TableCell>
              <TableCell>{r.scope === "todos" ? "Todas as despesas" : "Manutenção"}</TableCell>
              <TableCell className="text-right">{brl(Number(r.max_value))}</TableCell>
              <TableCell>
                <Badge variant={r.active ? "secondary" : "outline"}>
                  {r.active ? "Ativa" : "Inativa"}
                </Badge>
              </TableCell>
              <TableCell>
                <RowActions
                  disabled={!canEdit}
                  onEdit={() => openDialog(r)}
                  onDelete={() => remove(r.id)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar alçada" : "Nova alçada"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROVAL_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unidade</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas as unidades</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Alcance</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="todos">Todas as despesas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max_value">Limite por ordem (R$) *</Label>
                <MoneyInput
                  id="max_value"
                  name="max_value"
                  defaultValue={editing?.max_value ?? ""}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" defaultValue={editing?.notes ?? ""} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="alcada-ativa" />
              <Label htmlFor="alcada-ativa">Alçada ativa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* ------------------------------- tempos padrão ------------------------------ */

function TemposPadrao({ canEdit }: { canEdit: boolean }) {
  const { data: rows = [] } = useLaborTimeStandards();
  const { save, remove, saving } = useRuleTable("labor_time_standards", "labor-time-standards");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LaborTimeStandard | null>(null);
  const [vtype, setVtype] = useState(ALL);
  const [source, setSource] = useState<string>("Interna");
  const [active, setActive] = useState(true);

  function openDialog(r: LaborTimeStandard | null) {
    setEditing(r);
    setVtype(r?.vehicle_type ?? ALL);
    setSource(r?.source ?? "Interna");
    setActive(r?.active ?? true);
    setOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("service_name") ?? "").trim();
    const hours = parseBRNumber(String(fd.get("standard_hours") ?? ""));
    if (name.length < 3) {
      toast.error("Informe o nome do serviço.");
      return;
    }
    if (!(hours > 0)) {
      toast.error("O tempo padrão deve ser maior que zero.");
      return;
    }
    const ok = await save(editing?.id ?? null, {
      service_name: name,
      vehicle_type: vtype === ALL ? null : vtype,
      standard_hours: hours,
      source,
      active,
      notes: String(fd.get("notes") ?? "").trim() || null,
    });
    if (ok) setOpen(false);
  }

  return (
    <Section
      title="Tabela de tempos padrão de reparo"
      help="Tempo de referência (em horas) de cada serviço, vindo de Audatex, Molicar, do fabricante ou de tabela própria. Nas cotações, o sistema avisa quando as horas da proposta passam do tempo padrão."
      action={
        canEdit ? (
          <Button onClick={() => openDialog(null)} className="gap-2">
            <Plus className="size-4" /> Novo tempo padrão
          </Button>
        ) : undefined
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Serviço</TableHead>
            <TableHead>Tipo de veículo</TableHead>
            <TableHead className="text-right">Horas</TableHead>
            <TableHead>Fonte</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                Nenhum tempo padrão cadastrado.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.service_name}</TableCell>
              <TableCell>{typeLabel(r.vehicle_type)}</TableCell>
              <TableCell className="text-right">
                {Number(r.standard_hours).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell>{r.source}</TableCell>
              <TableCell>
                <Badge variant={r.active ? "secondary" : "outline"}>
                  {r.active ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell>
                <RowActions
                  disabled={!canEdit}
                  onEdit={() => openDialog(r)}
                  onDelete={() => remove(r.id)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tempo padrão" : "Novo tempo padrão"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="service_name">Serviço *</Label>
              <Input
                id="service_name"
                name="service_name"
                defaultValue={editing?.service_name ?? ""}
                placeholder="Ex.: troca de pastilhas de freio"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="standard_hours">Horas *</Label>
                <DecimalInput
                  id="standard_hours"
                  name="standard_hours"
                  decimals={2}
                  defaultValue={editing?.standard_hours ?? ""}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Fonte</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label>Tipo de veículo</Label>
                <VehicleTypeSelect value={vtype} onChange={setVtype} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" defaultValue={editing?.notes ?? ""} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="tempo-ativo" />
              <Label htmlFor="tempo-ativo">Ativo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* --------------------------- preço da mão de obra --------------------------- */

function PrecoMaoDeObra({ canEdit }: { canEdit: boolean }) {
  const { data: settings } = useMaintenanceSettingsFull();
  const { orgId, userId } = usePerms();
  const invalidate = useInvalidate();
  const [block, setBlock] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const blockValue = block ?? settings?.block_above_max_hour_value ?? false;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    const raw = String(new FormData(e.currentTarget).get("max_labor_hour_value") ?? "").trim();
    const value = raw === "" ? null : parseBRNumber(raw);
    if (value !== null && !(value > 0)) {
      toast.error("O valor da hora deve ser maior que zero (ou deixe em branco).");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("maintenance_settings").upsert({
      organization_id: orgId,
      max_labor_hour_value: value,
      block_above_max_hour_value: blockValue,
      updated_by: userId,
    } as never);
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Parâmetro salvo.");
    invalidate(["maintenance-settings-full", "maintenance-settings"]);
  }

  return (
    <Section
      title="Preço máximo da hora de mão de obra"
      help="Valor máximo aceito por hora de serviço nas propostas. Se marcar para bloquear, propostas acima do valor não podem ser selecionadas; caso contrário, o sistema só avisa."
    >
      <form
        key={String(settings?.max_labor_hour_value ?? "")}
        onSubmit={submit}
        className="max-w-md space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="max_labor_hour_value">Valor máximo da hora (R$)</Label>
          <MoneyInput
            id="max_labor_hour_value"
            name="max_labor_hour_value"
            defaultValue={settings?.max_labor_hour_value ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="bloquear-hora"
            checked={blockValue}
            onCheckedChange={setBlock}
            disabled={!canEdit}
          />
          <Label htmlFor="bloquear-hora">Bloquear propostas acima do valor</Label>
        </div>
        {canEdit && (
          <Button type="submit" disabled={saving}>
            Salvar
          </Button>
        )}
      </form>
    </Section>
  );
}

/* --------------------------- prazos de devolução --------------------------- */

function Prazos({ canEdit }: { canEdit: boolean }) {
  const { data: rows = [] } = useMaintenanceDeadlines();
  const { save, remove, saving } = useRuleTable("maintenance_deadlines", "maintenance-deadlines");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceDeadline | null>(null);
  const [vtype, setVtype] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [active, setActive] = useState(true);

  function openDialog(r: MaintenanceDeadline | null) {
    setEditing(r);
    setVtype(r?.vehicle_type ?? ALL);
    setKind(r?.kind ?? ALL);
    setActive(r?.active ?? true);
    setOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const days = Number(new FormData(e.currentTarget).get("business_days"));
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      toast.error("Informe o prazo em dias úteis (0 a 365).");
      return;
    }
    const ok = await save(editing?.id ?? null, {
      vehicle_type: vtype === ALL ? null : vtype,
      kind: kind === ALL ? null : kind,
      business_days: days,
      active,
    });
    if (ok) setOpen(false);
  }

  return (
    <Section
      title="Prazos de devolução do veículo"
      help="Prazo máximo, em dias úteis, para a oficina devolver o veículo. Vale a regra mais específica (tipo de veículo + natureza) e, na falta dela, a mais geral. Ao registrar a manutenção, o prazo prometido é calculado sozinho."
      action={
        canEdit ? (
          <Button onClick={() => openDialog(null)} className="gap-2">
            <Plus className="size-4" /> Novo prazo
          </Button>
        ) : undefined
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo de veículo</TableHead>
            <TableHead>Natureza</TableHead>
            <TableHead className="text-right">Prazo (dias úteis)</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                Nenhum prazo cadastrado.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{typeLabel(r.vehicle_type)}</TableCell>
              <TableCell>
                {r.kind ? (r.kind === "preventiva" ? "Preventiva" : "Corretiva") : "Todas"}
              </TableCell>
              <TableCell className="text-right">{r.business_days}</TableCell>
              <TableCell>
                <Badge variant={r.active ? "secondary" : "outline"}>
                  {r.active ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell>
                <RowActions
                  disabled={!canEdit}
                  onEdit={() => openDialog(r)}
                  onDelete={() => remove(r.id)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar prazo" : "Novo prazo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Tipo de veículo</Label>
                <VehicleTypeSelect value={vtype} onChange={setVtype} />
              </div>
              <div className="space-y-1.5">
                <Label>Natureza</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas</SelectItem>
                    <SelectItem value="preventiva">Preventiva</SelectItem>
                    <SelectItem value="corretiva">Corretiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="business_days">Dias úteis *</Label>
                <Input
                  id="business_days"
                  name="business_days"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={editing?.business_days ?? ""}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="prazo-ativo" />
              <Label htmlFor="prazo-ativo">Ativo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* --------------------------------- lavagem --------------------------------- */

function Lavagem({ canEdit }: { canEdit: boolean }) {
  const { data: rows = [] } = useCleaningRules();
  const { save, remove, saving } = useRuleTable("cleaning_rules", "cleaning-rules");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CleaningRule | null>(null);
  const [vtype, setVtype] = useState(ALL);
  const [active, setActive] = useState(true);

  function openDialog(r: CleaningRule | null) {
    setEditing(r);
    setVtype(r?.vehicle_type ?? ALL);
    setActive(r?.active ?? true);
    setOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const interval = Number(fd.get("min_interval_days") || 0);
    const maxRaw = String(fd.get("max_per_month") ?? "").trim();
    const max = maxRaw === "" ? null : Number(maxRaw);
    if (!Number.isInteger(interval) || interval < 0) {
      toast.error("O intervalo mínimo deve ser um número inteiro de dias.");
      return;
    }
    if (max !== null && (!Number.isInteger(max) || max < 1)) {
      toast.error("O máximo por mês deve ser um número inteiro maior que zero.");
      return;
    }
    if (interval === 0 && max === null) {
      toast.error("Informe o intervalo mínimo, o máximo por mês, ou os dois.");
      return;
    }
    const ok = await save(editing?.id ?? null, {
      vehicle_type: vtype === ALL ? null : vtype,
      min_interval_days: interval,
      max_per_month: max,
      active,
    });
    if (ok) setOpen(false);
  }

  return (
    <Section
      title="Limites de lavagem"
      help="Evita lavagens em excesso: define o intervalo mínimo entre lavagens de um mesmo veículo e/ou o máximo por mês. O banco recusa a lavagem que ultrapassar o limite."
      action={
        canEdit ? (
          <Button onClick={() => openDialog(null)} className="gap-2">
            <Plus className="size-4" /> Novo limite
          </Button>
        ) : undefined
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo de veículo</TableHead>
            <TableHead className="text-right">Intervalo mínimo (dias)</TableHead>
            <TableHead className="text-right">Máximo por mês</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                Nenhum limite cadastrado: as lavagens não têm restrição.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{typeLabel(r.vehicle_type)}</TableCell>
              <TableCell className="text-right">{r.min_interval_days || "—"}</TableCell>
              <TableCell className="text-right">{r.max_per_month ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={r.active ? "secondary" : "outline"}>
                  {r.active ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell>
                <RowActions
                  disabled={!canEdit}
                  onEdit={() => openDialog(r)}
                  onDelete={() => remove(r.id)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar limite" : "Novo limite de lavagem"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Tipo de veículo</Label>
                <VehicleTypeSelect value={vtype} onChange={setVtype} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="min_interval_days">Intervalo mínimo (dias)</Label>
                <Input
                  id="min_interval_days"
                  name="min_interval_days"
                  type="number"
                  min={0}
                  defaultValue={editing?.min_interval_days ?? 0}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max_per_month">Máximo por mês</Label>
                <Input
                  id="max_per_month"
                  name="max_per_month"
                  type="number"
                  min={1}
                  defaultValue={editing?.max_per_month ?? ""}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="lav-ativo" />
              <Label htmlFor="lav-ativo">Ativo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* ---------------------------------- página --------------------------------- */

function RegrasManutencao() {
  const { canManageFleet, orgId } = usePerms();
  const canEdit = canManageFleet && Boolean(orgId);

  return (
    <div>
      <PageHeader
        title="Regras de manutenção"
        description="Alçadas financeiras, tempos padrão de reparo, prazos de devolução, limites de lavagem e preço máximo da mão de obra."
      />
      <Tabs defaultValue="alcadas" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="alcadas">Alçadas</TabsTrigger>
          <TabsTrigger value="tempos">Tempos padrão</TabsTrigger>
          <TabsTrigger value="preco">Preço da mão de obra</TabsTrigger>
          <TabsTrigger value="prazos">Prazos de devolução</TabsTrigger>
          <TabsTrigger value="lavagem">Lavagem</TabsTrigger>
        </TabsList>
        <TabsContent value="alcadas">
          <Alcadas canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="tempos">
          <TemposPadrao canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="preco">
          <PrecoMaoDeObra canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="prazos">
          <Prazos canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="lavagem">
          <Lavagem canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
