/**
 * FrotaGov — seleção pesquisável reutilizável.
 *
 * Substitui as listas suspensas longas por um campo com busca, descrição
 * secundária, estado de carregamento, estado vazio compreensível e atalho
 * opcional para cadastrar o registro que estiver faltando.
 *
 * A busca é local sobre a lista já carregada pelos hooks do sistema, que já
 * aplicam organização/RLS — nenhum dado de outro órgão é consultado aqui.
 */
import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type EntityOption = {
  /** Identificador gravado no banco. */
  value: string;
  /** Texto principal exibido. */
  label: string;
  /** Linha secundária (unidade, saldo, situação…). */
  description?: string | null;
  /** Texto adicional considerado na busca (placa, CPF, CNPJ, patrimônio…). */
  keywords?: (string | null | undefined)[];
  disabled?: boolean;
  /** Aviso curto exibido ao lado do rótulo. */
  hint?: string | null;
};

type Props = {
  options: EntityOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Texto exibido quando não há nenhum cadastro na lista. */
  emptyLabel?: string;
  /** Texto exibido quando a busca não encontra nada. */
  notFoundLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Permite limpar a seleção. */
  clearable?: boolean;
  /** Atalho para cadastrar o registro faltante (abre em nova aba). */
  createHref?: string;
  createLabel?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

function haystack(o: EntityOption) {
  return [o.label, o.description, ...(o.keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function EntitySelect({
  options,
  value,
  onChange,
  placeholder = "Selecione",
  searchPlaceholder = "Buscar…",
  emptyLabel = "Nenhum registro cadastrado.",
  notFoundLabel = "Nada encontrado para esta busca.",
  loading = false,
  disabled = false,
  clearable = true,
  createHref,
  createLabel = "Cadastrar novo",
  id,
  className,
  ...rest
}: Props) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={rest["aria-label"]}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate text-left">
            {selected ? selected.label : placeholder}
            {selected?.description ? (
              <span className="ml-2 text-xs text-muted-foreground">{selected.description}</span>
            ) : null}
          </span>
          <span className="flex items-center gap-1">
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {clearable && selected && !disabled && (
              <X
                className="size-4 opacity-60 hover:opacity-100"
                role="button"
                aria-label="Limpar seleção"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const opt = options.find((o) => o.value === itemValue);
            if (!opt) return 0;
            const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
            const hay = haystack(opt);
            return terms.every((t) => hay.includes(t)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            {loading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando registros…
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="space-y-2 p-3 text-sm text-muted-foreground">
                    <p>{options.length === 0 ? emptyLabel : notFoundLabel}</p>
                    {createHref && (
                      <a
                        className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                        href={createHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Plus className="size-3" /> {createLabel}
                      </a>
                    )}
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {options.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={o.value}
                      disabled={o.disabled}
                      onSelect={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 size-4", value === o.value ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {o.label}
                          {o.hint ? <span className="ml-2 text-xs text-warning-foreground">{o.hint}</span> : null}
                        </span>
                        {o.description ? (
                          <span className="block truncate text-xs text-muted-foreground">{o.description}</span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default EntitySelect;
