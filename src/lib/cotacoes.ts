/**
 * FrotaGov — regras compartilhadas do módulo de Cotações.
 *
 * Os mesmos cálculos são usados no lançamento manual, na resposta pública por
 * link e na conferência do servidor. O banco recalcula tudo antes de gravar
 * (gatilho `sync_proposal_value`), então estes helpers servem para a interface
 * e para a validação prévia — nunca como fonte única da verdade.
 */
import { parseBRNumber } from "@/lib/format";

export const QUOTATION_KINDS = [
  { value: "servicos", label: "Serviços" },
  { value: "pecas", label: "Peças" },
  { value: "servicos_pecas", label: "Serviços e peças" },
] as const;

export type QuotationKind = (typeof QUOTATION_KINDS)[number]["value"];

export const quotationKindLabel = (kind: string | null | undefined) =>
  QUOTATION_KINDS.find((k) => k.value === kind)?.label ?? "Serviços e peças";

export const asQuotationKind = (kind: string | null | undefined): QuotationKind =>
  kind === "servicos" || kind === "pecas" ? kind : "servicos_pecas";

/** A cotação pede serviços/mão de obra? */
export const hasServices = (kind: string | null | undefined) => asQuotationKind(kind) !== "pecas";
/** A cotação pede peças/itens? */
export const hasParts = (kind: string | null | undefined) => asQuotationKind(kind) !== "servicos";

export type ProposalSource = "manual" | "link";
export const proposalSourceLabel = (s: string | null | undefined) =>
  s === "link" ? "Link" : "Manual";

export type DiscountMode = "amount" | "percent";

export const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export type TotalsInput = {
  partsValue: number;
  laborHours: number;
  laborHourValue: number;
  servicesValue: number;
  discountMode: DiscountMode;
  discountInput: number;
  /** Mão de obra informada como valor fechado (propostas antigas). */
  laborValueOverride?: number;
};

export type Totals = {
  laborValue: number;
  servicesSubtotal: number;
  partsSubtotal: number;
  gross: number;
  discount: number;
  net: number;
};

export function computeTotals(input: TotalsInput): Totals {
  const hours = Math.max(0, input.laborHours || 0);
  const rate = Math.max(0, input.laborHourValue || 0);
  const laborValue =
    hours > 0 && rate > 0
      ? round2(hours * rate)
      : round2(Math.max(0, input.laborValueOverride ?? 0));
  const services = round2(Math.max(0, input.servicesValue || 0));
  const parts = round2(Math.max(0, input.partsValue || 0));
  const servicesSubtotal = round2(laborValue + services);
  const gross = round2(servicesSubtotal + parts);
  const raw = Math.max(0, input.discountInput || 0);
  const discount =
    input.discountMode === "percent"
      ? round2((gross * Math.min(raw, 100)) / 100)
      : round2(Math.min(raw, gross));
  return {
    laborValue,
    servicesSubtotal,
    partsSubtotal: parts,
    gross,
    discount,
    net: round2(gross - discount),
  };
}

/** Mensagem de bloqueio do desconto, ou `null` quando estiver válido. */
export function discountProblem(mode: DiscountMode, value: number, gross: number): string | null {
  if (!Number.isFinite(value) || value < 0) return "O desconto não pode ser negativo.";
  if (mode === "percent" && value > 100) return "O desconto percentual não pode passar de 100%.";
  if (mode === "amount" && value > gross + 0.005)
    return "O desconto em reais não pode ser maior que o valor bruto da proposta.";
  return null;
}

/* ------------------------ rascunho de proposta (UI) ---------------------- */

export type ProposalItemDraft = {
  key: string;
  quotationItemId: string | null;
  description: string;
  brand: string;
  partNumber: string;
  quantity: string;
  unitValue: string;
  /** Quantidade solicitada pelo órgão — bloqueada para o fornecedor no link público. */
  lockedQuantity?: boolean;
};

export type ProposalDraft = {
  executionDays: string;
  validDays: string;
  /** Garantia dos serviços (dias). */
  warrantyDays: string;
  /** Garantia das peças (dias). */
  partsWarrantyDays: string;
  laborHours: string;
  laborHourValue: string;
  servicesValue: string;
  paymentTerms: string;
  discountMode: DiscountMode;
  discountInput: string;
  notes: string;
  items: ProposalItemDraft[];
};

export const newItemDraft = (seed: Partial<ProposalItemDraft> = {}): ProposalItemDraft => ({
  key: Math.random().toString(36).slice(2),
  quotationItemId: null,
  description: "",
  brand: "",
  partNumber: "",
  quantity: "1",
  unitValue: "",
  ...seed,
});

export function emptyProposalDraft(
  quotationItems: { id: string; description: string; quantity: number | string }[] = [],
  /** Trava as quantidades no que o órgão solicitou (resposta pública do fornecedor). */
  lockQuantities = false,
): ProposalDraft {
  return {
    executionDays: "",
    validDays: "",
    warrantyDays: "",
    partsWarrantyDays: "",
    laborHours: "",
    laborHourValue: "",
    servicesValue: "",
    paymentTerms: "",
    discountMode: "amount",
    discountInput: "",
    notes: "",
    items: quotationItems.map((i) =>
      newItemDraft({
        quotationItemId: i.id,
        description: i.description,
        quantity: String(i.quantity).replace(".", ","),
        lockedQuantity: lockQuantities,
      }),
    ),
  };
}

export const itemTotal = (i: ProposalItemDraft) =>
  round2(parseBRNumber(i.quantity || "0") * parseBRNumber(i.unitValue || "0"));

export function draftTotals(draft: ProposalDraft, kind: QuotationKind): Totals {
  const partsValue = hasParts(kind)
    ? round2(draft.items.filter((i) => i.description.trim()).reduce((s, i) => s + itemTotal(i), 0))
    : 0;
  return computeTotals({
    partsValue,
    laborHours: hasServices(kind) ? parseBRNumber(draft.laborHours || "0") : 0,
    laborHourValue: hasServices(kind) ? parseBRNumber(draft.laborHourValue || "0") : 0,
    servicesValue: hasServices(kind) ? parseBRNumber(draft.servicesValue || "0") : 0,
    discountMode: draft.discountMode,
    discountInput: parseBRNumber(draft.discountInput || "0"),
  });
}

/** Payload normalizado, pronto para gravar (manual ou por link). */
export function draftToPayload(draft: ProposalDraft, kind: QuotationKind) {
  const totals = draftTotals(draft, kind);
  const int = (v: string) => (v.trim() ? Math.max(0, Math.round(parseBRNumber(v))) : null);
  return {
    executionDays: int(draft.executionDays),
    validDays: int(draft.validDays),
    warrantyDays: int(draft.warrantyDays),
    partsWarrantyDays: int(draft.partsWarrantyDays),
    laborHours: hasServices(kind) ? parseBRNumber(draft.laborHours || "0") : 0,
    laborHourValue: hasServices(kind) ? parseBRNumber(draft.laborHourValue || "0") : 0,
    servicesValue: hasServices(kind) ? parseBRNumber(draft.servicesValue || "0") : 0,
    paymentTerms: draft.paymentTerms.trim(),
    discountMode: draft.discountMode,
    discountInput: parseBRNumber(draft.discountInput || "0"),
    notes: draft.notes.trim(),
    items: hasParts(kind)
      ? draft.items
          .filter((i) => i.description.trim())
          .map((i) => ({
            quotationItemId: i.quotationItemId,
            description: i.description.trim(),
            brand: i.brand.trim(),
            partNumber: i.partNumber.trim(),
            quantity: parseBRNumber(i.quantity || "1") || 1,
            unitValue: parseBRNumber(i.unitValue || "0"),
          }))
      : [],
    totals,
  };
}

export type ProposalPayload = ReturnType<typeof draftToPayload>;
