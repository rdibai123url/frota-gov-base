import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export const LIST_PAGE_SIZE = 25;

export type PagedState<T> = {
  rows: T[];
  page: number;
  pageCount: number;
  total: number;
  setPage: (p: number) => void;
};

/** Paginação em memória para listas operacionais. */
export function usePaged<T>(items: T[], size: number = LIST_PAGE_SIZE): PagedState<T> {
  const [page, setPage] = useState(0);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pageCount - 1);
  useEffect(() => {
    setPage(0);
  }, [total]);
  const rows = useMemo(
    () => items.slice(current * size, current * size + size),
    [items, current, size],
  );
  return { rows, page: current, pageCount, total, setPage };
}

export function ListPagination<T>({ state }: { state: PagedState<T> }) {
  if (state.total === 0) return null;
  const from = state.page * LIST_PAGE_SIZE + 1;
  const to = Math.min(state.total, (state.page + 1) * LIST_PAGE_SIZE);
  return (
    <div className="flex flex-col items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row">
      <span>
        Exibindo {from}–{to} de {state.total} registro{state.total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={state.page === 0}
          onClick={() => state.setPage(state.page - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {state.page + 1} de {state.pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={state.page + 1 >= state.pageCount}
          onClick={() => state.setPage(state.page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
