/**
 * FrotaGov — campos da proposta de cotação.
 *
 * O mesmo formulário atende o lançamento manual (tela de Cotações) e a
 * resposta pública do fornecedor por link, mudando conforme o tipo da cotação
 * (serviços, peças ou serviços e peças).
 */
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { DecimalInput, IntegerInput, MoneyInput } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL } from "@/lib/format";
import {
  draftTotals,
  hasParts,
  hasServices,
  itemTotal,
  newItemDraft,
  type DiscountMode,
  type ProposalDraft,
  type ProposalItemDraft,
  type QuotationKind,
} from "@/lib/cotacoes";

const NO_LINK = "__none__";

type QItem = { id: string; sequence: number; description: string; measure_unit?: string | null };

export function PropostaFields({
  kind,
  quotationItems,
  draft,
  onChange,
  disabled,
}: {
  kind: QuotationKind;
  quotationItems: QItem[];
  draft: ProposalDraft;
  onChange: (patch: Partial<ProposalDraft>) => void;
  disabled?: boolean;
}) {
  const totals = draftTotals(draft, kind);

  const setItem = (key: string, patch: Partial<ProposalItemDraft>) =>
    onChange({ items: draft.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="validDays">Validade da proposta (dias)</Label>
          <IntegerInput
            id="validDays"
            maxDigits={4}
            value={draft.validDays}
            onValueChange={(v) => onChange({ validDays: v })}
            disabled={disabled}
          />
        </div>
        {hasServices(kind) && (
          <>
            <div>
              <Label htmlFor="executionDays">Prazo de execução do serviço (dias)</Label>
              <IntegerInput
                id="executionDays"
                maxDigits={4}
                value={draft.executionDays}
                onValueChange={(v) => onChange({ executionDays: v })}
                disabled={disabled}
              />
            </div>
            <div>
              <Label htmlFor="warrantyDays">Garantia do serviço (dias)</Label>
              <IntegerInput
                id="warrantyDays"
                maxDigits={4}
                value={draft.warrantyDays}
                onValueChange={(v) => onChange({ warrantyDays: v })}
                disabled={disabled}
              />
            </div>
          </>
        )}
        <div className={hasServices(kind) ? "sm:col-span-3" : "sm:col-span-2"}>
          <Label htmlFor="paymentTerms">Condição de pagamento</Label>
          <Input
            id="paymentTerms"
            value={draft.paymentTerms}
            maxLength={120}
            onChange={(e) => onChange({ paymentTerms: e.target.value })}
            disabled={disabled}
          />
        </div>
      </section>

      {hasServices(kind) && (
        <section className="space-y-3 rounded-md border p-3">
          <h3 className="text-sm font-medium">Serviços / mão de obra</h3>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="laborHours">Quantidade de horas</Label>
              <DecimalInput
                id="laborHours"
                decimals={2}
                value={draft.laborHours}
                onValueChange={(v) => onChange({ laborHours: v })}
                disabled={disabled}
              />
            </div>
            <div>
              <Label htmlFor="laborHourValue">Valor da hora/homem (R$)</Label>
              <MoneyInput
                id="laborHourValue"
                value={draft.laborHourValue}
                onValueChange={(v) => onChange({ laborHourValue: v })}
                disabled={disabled}
              />
            </div>
            <div>
              <Label>Total da mão de obra</Label>
              <Input readOnly tabIndex={-1} value={formatBRL(totals.laborValue)} className="bg-muted/50" />
            </div>
            <div>
              <Label htmlFor="servicesValue">Valor global dos demais serviços (R$)</Label>
              <MoneyInput
                id="servicesValue"
                value={draft.servicesValue}
                onValueChange={(v) => onChange({ servicesValue: v })}
                disabled={disabled}
              />
            </div>
          </div>
        </section>
      )}

      {hasParts(kind) && (
        <section className="space-y-3 rounded-md border p-3">
          <h3 className="text-sm font-medium">Peças / itens</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">Item cotado</TableHead>
                  <TableHead className="w-40">Vínculo com o solicitado</TableHead>
                  <TableHead className="w-28">Marca</TableHead>
                  <TableHead className="w-28">Nº / código</TableHead>
                  <TableHead className="w-24">Qtd.</TableHead>
                  <TableHead className="w-24">Garantia (dias)</TableHead>
                  <TableHead className="w-32">Unitário</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                      Nenhum item na proposta.
                    </TableCell>
                  </TableRow>
                )}
                {draft.items.map((i) => (
                  <TableRow key={i.key}>
                    <TableCell>
                      <Input
                        value={i.description}
                        onChange={(e) => setItem(i.key, { description: e.target.value })}
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={i.quotationItemId ?? NO_LINK}
                        onValueChange={(v) => setItem(i.key, { quotationItemId: v === NO_LINK ? null : v })}
                        disabled={!!disabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_LINK}>Sem vínculo</SelectItem>
                          {quotationItems.map((q) => (
                            <SelectItem key={q.id} value={q.id}>
                              {q.sequence}. {q.description.slice(0, 30)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input value={i.brand} onChange={(e) => setItem(i.key, { brand: e.target.value })} disabled={disabled} />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={i.partNumber}
                        onChange={(e) => setItem(i.key, { partNumber: e.target.value })}
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>
                      <DecimalInput
                        decimals={2}
                        value={i.quantity}
                        onValueChange={(v) => setItem(i.key, { quantity: v })}
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>
                      <IntegerInput
                        maxDigits={4}
                        value={i.warrantyDays}
                        onValueChange={(v) => setItem(i.key, { warrantyDays: v })}
                        disabled={disabled}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyInput value={i.unitValue} onValueChange={(v) => setItem(i.key, { unitValue: v })} disabled={disabled} />
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatBRL(itemTotal(i))}</TableCell>
                    <TableCell>
                      {!disabled && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remover item"
                          onClick={() => onChange({ items: draft.items.filter((x) => x.key !== i.key) })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => onChange({ items: [...draft.items, newItemDraft()] })}
            >
              <Plus className="size-3" /> Adicionar item
            </Button>
          )}
        </section>
      )}

      <section className="grid gap-4 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
        <div>
          <Label>Tipo de desconto</Label>
          <Select
            value={draft.discountMode}
            onValueChange={(v) => onChange({ discountMode: v as DiscountMode })}
            disabled={!!disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="amount">R$ (valor)</SelectItem>
              <SelectItem value="percent">% (percentual)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="discountInput">Desconto informado</Label>
          <DecimalInput
            id="discountInput"
            decimals={2}
            value={draft.discountInput}
            onValueChange={(v) => onChange({ discountInput: v })}
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Valor do desconto</Label>
          <Input readOnly tabIndex={-1} value={formatBRL(totals.discount)} className="bg-background" />
        </div>

        <dl className="grid gap-1 text-sm sm:col-span-3 sm:grid-cols-2">
          {hasServices(kind) && (
            <div className="flex justify-between border-b py-1">
              <dt className="text-muted-foreground">Subtotal de serviços</dt>
              <dd>{formatBRL(totals.servicesSubtotal)}</dd>
            </div>
          )}
          {hasParts(kind) && (
            <div className="flex justify-between border-b py-1">
              <dt className="text-muted-foreground">Subtotal de peças</dt>
              <dd>{formatBRL(totals.partsSubtotal)}</dd>
            </div>
          )}
          <div className="flex justify-between border-b py-1">
            <dt className="text-muted-foreground">Total bruto</dt>
            <dd>{formatBRL(totals.gross)}</dd>
          </div>
          <div className="flex justify-between border-b py-1">
            <dt className="text-muted-foreground">Desconto</dt>
            <dd>− {formatBRL(totals.discount)}</dd>
          </div>
          <div className="flex justify-between py-1 text-base font-semibold sm:col-span-2">
            <dt>Valor líquido final</dt>
            <dd>{formatBRL(totals.net)}</dd>
          </div>
        </dl>
      </section>

      <div>
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          rows={2}
          maxLength={800}
          value={draft.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export default PropostaFields;
