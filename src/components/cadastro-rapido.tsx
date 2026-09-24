/**
 * Cadastros rápidos reutilizáveis (botão "+" ao lado do campo).
 * Bloco 5.7 — tipos de serviço de manutenção.
 * Bloco 6.3 — dotação orçamentária, fonte de recurso e elemento de despesa.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

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
import {
  BUDGET_REFERENCE_LABELS,
  MAINTENANCE_SERVICE_TYPES,
  dbMessage,
  supabase,
  useBudgetReferences,
  useInvalidate,
  useMaintenanceServiceTypes,
  usePerms,
  type BudgetReferenceKind,
} from "@/lib/frotagov";

function QuickAddDialog({
  open,
  onOpenChange,
  title,
  fieldLabel,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  fieldLabel: string;
  saving: boolean;
  onSave: (value: string, description: string) => void;
}) {
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setValue("");
          setDescription("");
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="quick-value">{fieldLabel} *</Label>
            <Input
              id="quick-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="quick-desc">Descrição (opcional)</Label>
            <Input
              id="quick-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving || value.trim().length < 2}
            onClick={() => onSave(value.trim(), description.trim())}
          >
            {saving ? "Salvando…" : "Salvar e selecionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bloco 5.7 — tipo de serviço do plano preventivo, com cadastro rápido no mesmo fluxo. */
export function ServiceTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: types = [] } = useMaintenanceServiceTypes();
  const { orgId, canWrite } = usePerms();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const options = Array.from(
    new Set([...types.map((t) => t.name), ...MAINTENANCE_SERVICE_TYPES, value].filter(Boolean)),
  );

  async function save(name: string, description: string) {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase
      .from("maintenance_service_types")
      .insert({ organization_id: orgId, name, description: description || null });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    await invalidate(["maintenance-service-types"]);
    onChange(name);
    setOpen(false);
    toast.success("Tipo de serviço cadastrado e selecionado.");
  }

  return (
    <div className="flex gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {options.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canWrite && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Cadastrar tipo de serviço"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" />
        </Button>
      )}
      <QuickAddDialog
        open={open}
        onOpenChange={setOpen}
        title="Novo tipo de serviço"
        fieldLabel="Tipo de serviço"
        saving={saving}
        onSave={save}
      />
    </div>
  );
}

/** Bloco 6.3 — dotação, fonte e elemento reutilizáveis no órgão. */
export function BudgetReferenceSelect({
  kind,
  value,
  onChange,
}: {
  kind: BudgetReferenceKind;
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: refs = [] } = useBudgetReferences();
  const { orgId, canWrite } = usePerms();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const options = Array.from(
    new Set([...refs.filter((r) => r.kind === kind).map((r) => r.value), value].filter(Boolean)),
  );

  async function save(newValue: string, description: string) {
    if (!orgId) return;
    if (options.some((o) => o.toLowerCase() === newValue.toLowerCase())) {
      toast.error("Este registro já existe no órgão.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("budget_references")
      .insert({ organization_id: orgId, kind, value: newValue, description: description || null });
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    await invalidate(["budget-references"]);
    onChange(newValue);
    setOpen(false);
    toast.success(`${BUDGET_REFERENCE_LABELS[kind]} cadastrada e selecionada.`);
  }

  return (
    <div className="flex gap-2">
      <Select
        value={value || "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Não informar</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canWrite && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Cadastrar ${BUDGET_REFERENCE_LABELS[kind]}`}
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" />
        </Button>
      )}
      <QuickAddDialog
        open={open}
        onOpenChange={setOpen}
        title={`Nova ${BUDGET_REFERENCE_LABELS[kind].toLowerCase()}`}
        fieldLabel={BUDGET_REFERENCE_LABELS[kind]}
        saving={saving}
        onSave={save}
      />
    </div>
  );
}
