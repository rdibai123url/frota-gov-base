import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DashHelp } from "@/lib/ajuda-dashboard";
import { cn } from "@/lib/utils";

/**
 * Ícone "i" com explicação em linguagem simples: o que é, como é calculado e o que fazer.
 * Abre ao clicar (funciona também no celular).
 */
export function InfoTip({ help, className }: { help: DashHelp | undefined; className?: string }) {
  if (!help) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Explicação deste item"
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-sm leading-relaxed">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            O que é
          </p>
          <p>{help.what}</p>
        </div>
        {help.calc && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Como é calculado
            </p>
            <p>{help.calc}</p>
          </div>
        )}
        {help.action && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              O que fazer
            </p>
            <p>{help.action}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
