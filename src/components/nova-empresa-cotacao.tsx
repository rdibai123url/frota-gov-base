/**
 * FrotaGov — cadastro rápido de empresa a partir da cotação.
 *
 * Grava no mesmo cadastro da Rede credenciada (public.workshops), respeitando
 * organization_id e RLS. Não cria base paralela.
 */
import * as React from "react";
import { toast } from "sonner";
import { z } from "zod";

import { CnpjInput, CpfInput } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  WORKSHOP_SPECIALTIES,
  dbMessage,
  isValidCNPJ,
  isValidCPF,
  onlyDigits,
  supabase,
  useInvalidate,
  type Workshop,
} from "@/lib/frotagov";

export const COMPANY_KINDS = [
  { value: "oficina", label: "Oficina" },
  { value: "loja", label: "Loja / autopeças" },
  { value: "fornecedor", label: "Fornecedor de serviços" },
];

const schema = z.object({
  legal_name: z.string().trim().min(3, "Informe a razão social ou o nome").max(160),
  trade_name: z.string().trim().max(160).optional(),
  document: z.string().trim().optional(),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional(),
});

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string | null;
  userId: string | null;
  userName?: string;
  /** Especialidade sugerida (a da cotação). */
  defaultSpecialty?: string | null;
  /** Cadastros já existentes no órgão, para bloquear duplicidade óbvia. */
  existing: Workshop[];
  /** Contexto para a auditoria. */
  quotationId?: string | null;
  onCreated: (workshopId: string) => void;
};

export function NovaEmpresaCotacaoDialog({
  open,
  onOpenChange,
  orgId,
  userId,
  userName,
  defaultSpecialty,
  existing,
  quotationId,
  onCreated,
}: Props) {
  const invalidate = useInvalidate();
  const [kind, setKind] = React.useState("oficina");
  const [docType, setDocType] = React.useState<"cnpj" | "cpf">("cnpj");
  const [specialty, setSpecialty] = React.useState<string>(defaultSpecialty || WORKSHOP_SPECIALTIES[0]!);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setKind("oficina");
      setDocType("cnpj");
      setSpecialty(defaultSpecialty || WORKSHOP_SPECIALTIES[0]!);
    }
  }, [open, defaultSpecialty]);

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(ev.currentTarget)));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const d = parsed.data;
    const doc = onlyDigits(d.document ?? "");
    if (doc) {
      if (docType === "cnpj" && !isValidCNPJ(doc)) {
        toast.error("CNPJ inválido.");
        return;
      }
      if (docType === "cpf" && !isValidCPF(doc)) {
        toast.error("CPF inválido.");
        return;
      }
    }

    const norm = (v: string) => v.trim().toLowerCase();
    const dupDoc = doc ? existing.find((w) => onlyDigits(w.cnpj ?? "") === doc) : undefined;
    if (dupDoc) {
      toast.error(`Já existe empresa cadastrada com este documento: ${dupDoc.trade_name || dupDoc.legal_name}.`);
      return;
    }
    const dupName = existing.find(
      (w) => norm(w.legal_name) === norm(d.legal_name) || (w.trade_name && norm(w.trade_name) === norm(d.legal_name)),
    );
    if (dupName) {
      toast.error(`Já existe empresa cadastrada com este nome: ${dupName.trade_name || dupName.legal_name}.`);
      return;
    }
    if (!orgId) {
      toast.error("Órgão não identificado.");
      return;
    }

    setSaving(true);
    try {
      const { data: saved, error } = await supabase
        .from("workshops")
        .insert({
          organization_id: orgId,
          company_kind: kind,
          legal_name: d.legal_name,
          trade_name: d.trade_name || null,
          cnpj: doc || null,
          email: d.email || null,
          phone: d.phone || null,
          address: d.address || null,
          city: d.city || null,
          state: d.state ? d.state.toUpperCase() : null,
          specialties: specialty ? [specialty] : [],
          status: "ativo",
          created_by: userId,
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;

      await supabase.from("activity_logs").insert({
        organization_id: orgId,
        actor_id: userId,
        actor_name: userName ?? null,
        event_type: "cadastro_rapido_empresa",
        area: "Cotações",
        screen: "Cotações › Propostas",
        route: "/cotacoes",
        entity: "workshops",
        record_id: saved?.id ?? null,
        action: "insert",
        summary: `Empresa "${d.trade_name || d.legal_name}" cadastrada a partir da cotação${
          quotationId ? ` ${quotationId}` : ""
        }.`,
        new_data: { company_kind: kind, legal_name: d.legal_name, cnpj: doc || null, quotation_id: quotationId ?? null },
      });

      invalidate(["workshops"]);
      toast.success("Empresa cadastrada e selecionada na proposta.");
      onOpenChange(false);
      if (saved?.id) onCreated(saved.id);
    } catch (err) {
      toast.error(dbMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar nova empresa</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          O cadastro entra na Rede credenciada do próprio órgão e fica disponível para as demais telas.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Especialidade / categoria</Label>
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
            <div className="sm:col-span-2">
              <Label htmlFor="legal_name">Razão social / nome *</Label>
              <Input id="legal_name" name="legal_name" required maxLength={160} />
            </div>
            <div>
              <Label htmlFor="trade_name">Nome fantasia</Label>
              <Input id="trade_name" name="trade_name" maxLength={160} />
            </div>
            <div>
              <Label>Documento</Label>
              <div className="flex gap-2">
                <Select value={docType} onValueChange={(v) => setDocType(v as "cnpj" | "cpf")}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="cpf">CPF</SelectItem>
                  </SelectContent>
                </Select>
                {docType === "cnpj" ? (
                  <CnpjInput id="document" name="document" className="flex-1" />
                ) : (
                  <CpfInput id="document" name="document" className="flex-1" />
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" maxLength={160} />
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" name="phone" maxLength={40} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" name="address" maxLength={200} />
            </div>
            <div>
              <Label htmlFor="city">Município</Label>
              <Input id="city" name="city" maxLength={120} />
            </div>
            <div>
              <Label htmlFor="state">UF</Label>
              <Input id="state" name="state" maxLength={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar e selecionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default NovaEmpresaCotacaoDialog;
