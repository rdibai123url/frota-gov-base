/**
 * Página pública de resposta à cotação (link do convite).
 *
 * Não exige login: o acesso é validado pelo token do convite, que expira no
 * prazo da cotação. Reutiliza o módulo de propostas já existente — a resposta
 * cria uma proposta normal, visível na tela de Cotações do órgão.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { PropostaFields } from "@/components/proposta-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getQuotationByToken,
  submitProposalByToken,
  type PublicQuotation,
} from "@/lib/cotacoes-convites.functions";
import { formatCNPJ } from "@/lib/format";
import {
  asQuotationKind,
  discountProblem,
  draftToPayload,
  emptyProposalDraft,
  hasParts,
  type ProposalDraft,
} from "@/lib/cotacoes";

const HEADER_TITLE: Record<string, string> = {
  pecas: "Cotação de Peças",
  servicos: "Cotação de Serviços",
  servicos_pecas: "Cotação de Peças e Serviços",
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const Route = createFileRoute("/cotacao/$token")({
  head: () => ({
    meta: [
      { title: "Responder cotação — FrotaGov" },
      {
        name: "description",
        content: "Página segura para o fornecedor apresentar proposta em cotação de órgão público.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Responder cotação — FrotaGov" },
      { property: "og:description", content: "Envio de proposta por fornecedor convidado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResponderCotacao,
});

function ResponderCotacao() {
  const { token } = Route.useParams();
  const [state, setState] = useState<PublicQuotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<ProposalDraft>(() => emptyProposalDraft());

  useEffect(() => {
    let alive = true;
    getQuotationByToken({ data: { token } })
      .then((res) => {
        if (!alive) return;
        setState(res);
        const kind = asQuotationKind(res.quotation?.quotation_kind);
        setDraft(emptyProposalDraft(hasParts(kind) ? (res.items ?? []) : [], true));
      })
      .catch(() => setState({ ok: false, message: "Não foi possível abrir a cotação." }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const kind = asQuotationKind(state?.quotation?.quotation_kind);
  const expired = Boolean(state?.expired);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (expired) {
      toast.error("O prazo para envio da proposta está encerrado.");
      return;
    }
    const payload = draftToPayload(draft, kind);
    const problem = discountProblem(
      payload.discountMode,
      payload.discountInput,
      payload.totals.gross,
    );
    if (problem) {
      toast.error(problem);
      return;
    }
    if (payload.totals.gross <= 0) {
      toast.error("Informe ao menos um valor de serviço ou de peça.");
      return;
    }
    if (hasParts(kind) && payload.items.length === 0) {
      toast.error("Esta cotação exige ao menos um item de peça na proposta.");
      return;
    }
    setSending(true);
    try {
      const res = await submitProposalByToken({
        data: {
          token,
          companyName: String(fd.get("companyName") ?? ""),
          cnpj: String(fd.get("cnpj") ?? ""),
          contactName: String(fd.get("contactName") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          executionDays: payload.executionDays,
          warrantyDays: payload.warrantyDays,
          partsWarrantyDays: payload.partsWarrantyDays,
          validDays: payload.validDays,
          paymentTerms: payload.paymentTerms,
          laborHours: payload.laborHours,
          laborHourValue: payload.laborHourValue,
          servicesValue: payload.servicesValue,
          discountMode: payload.discountMode,
          discountInput: payload.discountInput,
          notes: payload.notes,
          items: payload.items,
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
            {state?.message ?? "Este link não é válido."} Procure o órgão responsável para receber
            um novo convite.
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
            Sua proposta para a cotação {state.quotation?.code} foi registrada. O órgão fará a
            análise e comunicará o resultado.
          </p>
        </div>
      </main>
    );
  }

  const q = state.quotation!;
  const uf = [q.org_city, q.org_state].filter(Boolean).join(" / ");
  return (
    <main className="min-h-screen bg-muted/30 py-8">
      <div className="mx-auto w-full max-w-4xl px-4">
        <header className="flex items-start gap-4 rounded-t-lg bg-foreground px-6 py-5 text-background">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-background/10">
            {q.org_logo_url ? (
              <img
                src={q.org_logo_url}
                alt={`Brasão de ${q.organization}`}
                className="size-16 object-contain"
              />
            ) : (
              <Building2 className="size-8 opacity-70" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="gov-title text-xl leading-tight">{q.organization}</h1>
            <p className="text-xs opacity-80">
              {q.org_cnpj ? `CNPJ ${formatCNPJ(q.org_cnpj)}` : "CNPJ não informado"}
              {uf ? ` · ${uf}` : ""}
            </p>
            <p className="mt-2 text-sm font-medium uppercase tracking-wide">
              {HEADER_TITLE[q.quotation_kind] ?? HEADER_TITLE["servicos_pecas"]} — nº {q.code}
            </p>
          </div>
        </header>
        <div className="space-y-6 rounded-b-lg border border-t-0 bg-card p-6 shadow-card">
          {expired && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              Prazo para envio da proposta encerrado em{" "}
              {q.deadline_at ? dateTime(q.deadline_at) : "—"}.
            </p>
          )}
          <section className="grid gap-2 rounded-md border bg-muted/40 p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Objeto: </span>
              {q.description}
            </p>
            {q.vehicle && (
              <p>
                <span className="text-muted-foreground">Veículo/Bem: </span>
                {q.vehicle}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">
                Prazo final para recebimento da proposta:{" "}
              </span>
              {q.deadline_at ? dateTime(q.deadline_at) : "sem prazo definido"}
            </p>
            {q.notes && (
              <p>
                <span className="text-muted-foreground">Observações: </span>
                {q.notes}
              </p>
            )}
          </section>

          <form onSubmit={submit} className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="companyName">Razão social *</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  required
                  defaultValue={state.invitation?.company ?? ""}
                  maxLength={160}
                  disabled={expired}
                />
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  name="cnpj"
                  maxLength={20}
                  placeholder="00.000.000/0000-00"
                  disabled={expired}
                />
              </div>
              <div>
                <Label htmlFor="contactName">Responsável</Label>
                <Input
                  id="contactName"
                  name="contactName"
                  defaultValue={state.invitation?.contact_name ?? ""}
                  maxLength={120}
                  disabled={expired}
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" maxLength={30} disabled={expired} />
              </div>
            </section>

            <section>
              <h2 className="gov-title mb-2 text-sm uppercase tracking-wider text-muted-foreground">
                Proposta da empresa
              </h2>
              <PropostaFields
                kind={kind}
                quotationItems={state.items ?? []}
                draft={draft}
                onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                disabled={expired}
                lockItems
              />
            </section>

            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={sending || expired}>
                {expired ? "Prazo encerrado" : sending ? "Enviando…" : "Enviar proposta"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
