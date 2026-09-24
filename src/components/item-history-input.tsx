/**
 * FrotaGov — campo de descrição de item/serviço com sugestões do histórico.
 *
 * Ao digitar, consulta o histórico do PRÓPRIO órgão (cotações, propostas,
 * catálogo de peças, ordens de serviço, manutenções, contratos e ordens de
 * fornecimento) e sugere descrições já utilizadas. A consulta é feita por uma
 * função do banco que filtra sempre pelo órgão do usuário conectado — nenhum
 * dado de outro órgão é retornado.
 *
 * A sugestão nunca bloqueia: o usuário pode digitar uma descrição inédita e
 * adicionar normalmente.
 */
import * as React from "react";
import { History, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type ItemHistorySuggestion = {
  description: string;
  measure_unit: string | null;
  uses: number;
  last_used: string | null;
  sources: string[] | null;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Recebe a sugestão escolhida (descrição + unidade usual, quando houver). */
  onPick?: (suggestion: ItemHistorySuggestion) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** Limite visual de sugestões. */
  limit?: number;
};

const MIN_CHARS = 2;

function relativo(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return "usado hoje";
  if (dias === 1) return "usado ontem";
  if (dias < 30) return `usado há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `usado há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  return `usado há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}

export function ItemHistoryInput({
  value,
  onChange,
  onPick,
  id,
  name,
  placeholder = "Ex.: Pneu 215/75 R17,5",
  disabled,
  required,
  className,
  limit = 10,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<ItemHistorySuggestion[]>([]);
  const [active, setActive] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const skip = React.useRef(false);

  React.useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_item_history", { _q: q, _limit: limit });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setItems([]);
        return;
      }
      setItems((data ?? []) as ItemHistorySuggestion[]);
      setActive(0);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, limit]);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(s: ItemHistorySuggestion) {
    skip.current = true;
    onChange(s.description);
    onPick?.(s);
    setOpen(false);
    setItems([]);
  }

  const visible = open && value.trim().length >= MIN_CHARS && (loading || items.length > 0);

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <Input
        id={id}
        name={name}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onChange={(e) => {
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!visible || items.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + items.length) % items.length);
          } else if (e.key === "Enter") {
            const item = items[active];
            if (item) {
              e.preventDefault();
              pick(item);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {visible && (
        <div
          role="listbox"
          aria-label="Sugestões do histórico do órgão"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {loading && items.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando no histórico…
            </div>
          ) : (
            items.map((s, i) => {
              const rel = relativo(s.last_used);
              return (
                <button
                  key={`${s.description}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  data-testid="item-history-option"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(s)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm",
                    i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                >
                  <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.description}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        s.measure_unit ? `Unidade ${s.measure_unit}` : null,
                        `${s.uses} ${s.uses === 1 ? "uso" : "usos"}`,
                        rel,
                        s.sources?.length ? s.sources.slice(0, 2).join(", ") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
