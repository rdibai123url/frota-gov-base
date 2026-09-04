/**
 * Página pública de resposta à cotação (link do convite).
 *
 * Não exige login: o acesso é validado pelo token do convite, que expira no
 * prazo da cotação. Reutiliza o módulo de propostas já existente — a resposta
 * cria uma proposta normal, visível na tela de Cotações do órgão.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getQuotationByToken, submitProposalByToken, type PublicQuotation } from "@/lib/cotacoes-convites.functions";
import { parseBRNumber } from "@/lib/format";

export const Route = createFileRoute("/cotacao/$token")({
  head: () => ({
    meta: [
      { title: "Responder cotação — FrotaGov" },
      { name: "description", content: "Página segura para o fornecedor apresentar proposta em cotação de órgão público." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Responder cotação — FrotaGov" },
      { property: "og:description", content: "Envio de proposta por fornecedor convidado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResponderCotacao,
});

type ItemForm = { quotationItemId: string | null; description: string; brand: string; quantity: string; unitValue: string };

function ResponderCotacao() {
  const { token } = Route.useParams();
  const [state, setState] = useState<PublicQuotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [itemForms, setItemForms] = useState<ItemForm[]>([]);

  useEffect(() => {
    let alive = true;
    getQuotationByToken({ data: { token } })
      .then((res) => {
        if (!alive) return;
        setState(res);
        setItemForms(
          (res.items ?? []).map((i) => ({
            quotationItemId: i.id,
            description: i.description,
            brand: "",
            quantity: String(i.quantity).replace(".", ","),
            unitValue: "",
          })),
        );
      })
      .catch(() => setState({ ok: false, message: "Não foi possível abrir a cotação." }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const total = useMemo(
    () => itemForms.reduce((sum, i) => sum + parseBRNumber(i.quantity || "0") * parseBRNumber(i.unitValue || "0"), 0),
    [itemForms],
  );

  function setItem(idx: number, patch: Partial<ItemForm>) {
    setItemForms((prev) => prev.map((i, n) => (n === idx ? { ...i, ...patch } : i)));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSending(true);
    try {
      const res = await submitProposalByToken({
        data: {
          token,
          companyName: String(fd.get("companyName") ?? ""),
          cnpj: String(fd.get("cnpj") ?? ""),
          contactName: String(fd.get("contactName") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          executionDays: fd.get("executionDays") ? Number(fd.get("executionDays")) : null,
          warrantyDays: fd.get("warrantyDays") ? Number(fd.get("warrantyDays")) : null,
          validUntil: (fd.get("validUntil") as string) || null,
          paymentTerms: String(fd.get("paymentTerms") ?? ""),
          laborValue: parseBRNumber(String(fd.get("laborValue") ?? "0")),
          discountValue: parseBRNumber(String(fd.get("discountValue") ?? "0")),
          notes: String(fd.get("notes") ?? ""),
          items: itemForms.map((i) => ({
            quotationItemId: i.quotationItemId,
            description: i.description,
            brand: i.brand,
            quantity: parseBRNumber(i.quantity || "1") || 1,
            unitValue: parseBRNumber(i.unitValue || "0"),
          })),
        },
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setDone(true);
    } catch {
      toast.error("Não foi possível enviar a proposta. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6 text-muted-foreground">
        <p className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Abrindo cotação…
        </p>
      </main>
    );
  }

  if (!state?.ok) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <div className="max-w-md rounded-lg border bg-card p-8 text-center shadow-card">
          <ShieldAlert className="mx-auto mb-3 size-8 text-destructive" />
          <h1 className="gov-title text-lg">Link indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {state?.message ?? "Este link não é válido."} Procure o órgão responsável para receber um novo convite.
          </p>
        </div>
      </main>
    );
  }

  if (done || state.reason === "respondido") {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <div className="max-w-md rounded-lg border bg-card p-8 text-center shadow-card">
          <CheckCircle2 className="mx-auto mb-3 size-8 text-primary" />
          <h1 className="gov-title text-lg">Proposta recebida</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua proposta para a cotação {state.quotation?.code} foi registrada. O órgão fará a análise e comunicará o
            resultado.
          </p>
        </div>
      </main>
    );
  }

  const q = state.quotation!;
  return (
    <main className="min-h-screen bg-muted/30 py-8">
      <div className="mx-auto w-full max-w-4xl px-4">
        <header className="rounded-t-lg bg-foreground px-6 py-5 text-background">
          <p className="text-xs uppercase tracking-widest opacity-80">{q.organization}</p>
          <h1 className="gov-title text-xl">Cotação {q.code}</h1>
        </header>
        <div className="space-y-6 rounded-b-lg border border-t-0 bg-card p-6 shadow-card">
          <section className="grid gap-2 rounded-md border bg-muted/40 p-4 text-sm sm:grid-cols-2">
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Objeto: </span>
              {q.description}
            </p>
            {q.vehicle && (
              <p>
                <span className="text-muted-foreground">Veículo/bem: </span>
                {q.vehicle}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Prazo final: </span>
              {q.deadline_at ? new Date(q.deadline_at).toLocaleString("pt-BR") : "sem prazo definido"}
            </p>
            {q.notes && (
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Observações: </span>
                {q.notes}
              </p>
            )}
          </section>

          <form onSubmit={submit} className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="companyName">Razão social *</Label>
                <Input id="companyName" name="companyName" required defaultValue={state.invitation?.company ?? ""} maxLength={160} />
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input id="cnpj" name="cnpj" maxLength={20} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <Label htmlFor="contactName">Responsável</Label>
                <Input id="contactName" name="contactName" defaultValue={state.invitation?.contact_name ?? ""} maxLength={120} />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" maxLength={30} />
              </div>
            </section>

            <section>
              <h2 className="gov-title mb-2 text-sm uppercase tracking-wider text-muted-foreground">Itens / serviços</h2>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-28">Marca</TableHead>
                      <TableHead className="w-24">Qtd.</TableHead>
                      <TableHead className="w-32">Valor unit. (R$)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemForms.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                          Sem itens detalhados — informe os valores no resumo abaixo.
                        </TableCell>
                      </TableRow>
                    )}
                    {itemForms.map((i, idx) => (
                      <TableRow key={i.quotationItemId ?? idx}>
                        <TableCell className="text-sm">{i.description}</TableCell>
                        <TableCell>
                          <Input value={i.brand} onChange={(e) => setItem(idx, { brand: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input value={i.quantity} inputMode="decimal" onChange={(e) => setItem(idx, { quantity: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input value={i.unitValue} inputMode="decimal" onChange={(e) => setItem(idx, { unitValue: e.target.value })} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-right text-sm text-muted-foreground">
                Soma dos itens:{" "}
                <strong className="text-foreground">
                  {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </strong>
              </p>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="laborValue">Mão de obra (R$)</Label>
                <Input id="laborValue" name="laborValue" inputMode="decimal" defaultValue="0" />
              </div>
              <div>
                <Label htmlFor="discountValue">Desconto (R$)</Label>
                <Input id="discountValue" name="discountValue" inputMode="decimal" defaultValue="0" />
              </div>
              <div>
                <Label htmlFor="executionDays">Prazo de execução (dias)</Label>
                <Input id="executionDays" name="executionDays" type="number" min={0} />
              </div>
              <div>
                <Label htmlFor="warrantyDays">Garantia (dias)</Label>
                <Input id="warrantyDays" name="warrantyDays" type="number" min={0} />
              </div>
              <div>
                <Label htmlFor="validUntil">Validade da proposta</Label>
                <Input id="validUntil" name="validUntil" type="date" />
              </div>
              <div>
                <Label htmlFor="paymentTerms">Condição de pagamento</Label>
                <Input id="paymentTerms" name="paymentTerms" maxLength={120} />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" name="notes" rows={3} maxLength={800} />
              </div>
            </section>

            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={sending}>
                {sending ? "Enviando…" : "Enviar proposta"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
