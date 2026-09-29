import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * No celular a tabela vira uma lista de cartões: cada linha mostra "COLUNA: valor".
 * Os rótulos são copiados do cabeçalho para cada célula (e refeitos quando as linhas mudam).
 */
function useMobileLabels(table: React.RefObject<HTMLTableElement | null>) {
  React.useEffect(() => {
    const el = table.current;
    if (!el) return;
    const apply = () => {
      const labels = Array.from(el.querySelectorAll("thead th")).map(
        (th) => th.textContent?.trim() ?? "",
      );
      el.querySelectorAll("tbody tr").forEach((tr) => {
        let col = 0;
        Array.from(tr.children).forEach((cell) => {
          const span = Number((cell as HTMLTableCellElement).colSpan || 1);
          const text = span === 1 ? labels[col] : "";
          if (text) cell.setAttribute("data-label", text);
          else cell.removeAttribute("data-label");
          col += span;
        });
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [table]);
}

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => {
    const inner = React.useRef<HTMLTableElement | null>(null);
    useMobileLabels(inner);
    return (
      <div className="relative w-full overflow-auto">
        <table
          ref={(node) => {
            inner.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLTableElement | null>).current = node;
          }}
          className={cn("responsive-table w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("[&_tr]:border-b bg-surface-strong [&_tr]:hover:bg-transparent", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border/55 transition-colors hover:bg-accent data-[state=selected]:bg-accent",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-9 whitespace-nowrap px-3 text-left align-middle text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-3 py-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
