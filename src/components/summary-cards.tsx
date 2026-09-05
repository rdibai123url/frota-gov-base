/**
 * Bloco 6.4 — cards de resumo compactos e responsivos (Contratos, Empenhos).
 * Mantém o padrão institucional vermelho/preto e apenas reorganiza a apresentação:
 * nenhum cálculo é feito aqui.
 */
import { cn } from "@/lib/utils";

export type SummaryCard = { label: string; value: string; hint?: string };

export function SummaryCards({ cards, className }: { cards: SummaryCard[]; className?: string }) {
  return (
    <div
      className={cn(
        "mb-5 grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
        className,
      )}
    >
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card px-3 py-2.5 shadow-card">
          <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground" title={c.label}>
            {c.label}
          </p>
          <p
            className="gov-title mt-1 text-base leading-tight tabular-nums sm:text-lg xl:text-xl break-words"
            title={c.value}
          >
            {c.value}
          </p>
          {c.hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{c.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
