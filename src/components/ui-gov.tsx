/**
 * FrotaGov — biblioteca de apresentação própria (identidade de ERP público).
 *
 * Aqui vive apenas apresentação: nenhum destes componentes conhece regra de
 * negócio, consulta banco ou decide permissão. O objetivo é dar às telas
 * autenticadas um vocabulário visual único — estados operacionais, faixa de
 * filtros, tabelas densas, indicadores clicáveis e estados de carregamento,
 * vazio e erro.
 */
import { type ReactNode } from "react";
import { AlertTriangle, Filter, Inbox, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Estados operacionais                                                */
/* ------------------------------------------------------------------ */

export type StatusTone = "ok" | "info" | "warn" | "danger" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "border-status-ok/35 bg-status-ok/12 text-status-ok",
  info: "border-status-info/35 bg-status-info/12 text-status-info",
  warn: "border-status-warn/40 bg-status-warn/15 text-status-warn",
  danger: "border-status-danger/35 bg-status-danger/12 text-status-danger",
  neutral: "border-border bg-muted text-muted-foreground",
};

/**
 * Vocabulário único de estados do sistema. A chave é o texto já usado nas
 * telas (em português), para que a mesma situação tenha sempre a mesma cor.
 */
const TONE_BAR: Record<StatusTone, string> = {
  ok: "bg-status-ok",
  info: "bg-status-info",
  warn: "bg-status-warn",
  danger: "bg-status-danger",
  neutral: "bg-border",
};

const STATUS_TONE: Record<string, StatusTone> = {
  // Frota
  ativo: "ok",
  disponivel: "ok",
  "disponível": "ok",
  reservado: "info",
  "em viagem": "info",
  "em uso": "info",
  autorizada: "info",
  solicitada: "warn",
  manutencao: "warn",
  "manutenção": "warn",
  "em manutencao": "warn",
  "em manutenção": "warn",
  sinistrado: "danger",
  indisponivel: "danger",
  "indisponível": "danger",
  bloqueado: "danger",
  inativo: "neutral",
  baixado: "neutral",
  cedido: "info",
  // Prazos e saldos
  vigente: "ok",
  "em dia": "ok",
  regular: "ok",
  "a vencer": "warn",
  "proximo do vencimento": "warn",
  "próximo do vencimento": "warn",
  vencido: "danger",
  vencida: "danger",
  "saldo critico": "danger",
  "saldo crítico": "danger",
  encerrado: "neutral",
  encerrada: "neutral",
  suspenso: "warn",
  cancelado: "neutral",
  cancelada: "neutral",
  rejeitada: "danger",
  concluida: "ok",
  "concluída": "ok",
  paga: "ok",
  pendente: "warn",
  rascunho: "neutral",
};

/** Descobre o tom de um estado escrito em português; cai em neutro se não conhecer. */
export function statusTone(value: string | null | undefined): StatusTone {
  if (!value) return "neutral";
  const key = value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  return STATUS_TONE[key] ?? "neutral";
}

export function StatusBadge({
  label,
  tone,
  title,
  className,
}: {
  label: string;
  /** Sobrepõe o tom deduzido do próprio texto. */
  tone?: StatusTone;
  title?: string;
  className?: string;
}) {
  const t = tone ?? statusTone(label);
  return (
    <span
      title={title ?? label}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        TONE_CLASS[t],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Indicadores                                                         */
/* ------------------------------------------------------------------ */

export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string | undefined;
  tone?: StatusTone | undefined;
  icon?: ReactNode | undefined;
  /** Quando informado, o card vira atalho para a lista correspondente. */
  onClick?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="gov-label truncate" title={label}>
          {label}
        </p>
        {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
      </div>
      <p className="gov-title mt-1 text-lg leading-tight tabular-nums xl:text-xl">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 h-[3px] rounded-b-lg",
          TONE_BAR[tone],
        )}
      />
    </>
  );

  const base =
    "relative overflow-hidden rounded-lg border bg-card px-3 pb-3 pt-2.5 text-left shadow-card";

  if (!onClick) return <div className={cn(base, className)}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {body}
    </button>
  );
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6", className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Faixa de filtros                                                    */
/* ------------------------------------------------------------------ */

export function FilterBar({
  children,
  extra,
  showExtra,
  onToggleExtra,
  onApply,
  onClear,
  className,
}: {
  /** Filtros sempre visíveis. */
  children: ReactNode;
  /** Filtros adicionais mostrados por "Mais filtros". */
  extra?: ReactNode;
  showExtra?: boolean;
  onToggleExtra?: () => void;
  onApply?: () => void;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <section className={cn("gov-band mb-4 px-3 py-2.5", className)} aria-label="Filtros">
      <div className="flex flex-wrap items-end gap-2.5">
        {children}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {extra && onToggleExtra ? (
            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onToggleExtra}>
              <Filter className="size-3.5" />
              {showExtra ? "Menos filtros" : "Mais filtros"}
            </Button>
          ) : null}
          {onClear ? (
            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onClear}>
              <X className="size-3.5" /> Limpar
            </Button>
          ) : null}
          {onApply ? (
            <Button type="button" size="sm" onClick={onApply}>
              Aplicar
            </Button>
          ) : null}
        </div>
      </div>
      {extra && showExtra ? (
        <div className="mt-2.5 flex flex-wrap items-end gap-2.5 border-t pt-2.5">{extra}</div>
      ) : null}
    </section>
  );
}

/** Campo compacto da faixa de filtros (rótulo curto + controle). */
export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-[9rem] flex-col gap-1", className)}>
      <span className="gov-label">{label}</span>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Tabelas densas                                                      */
/* ------------------------------------------------------------------ */

/**
 * Moldura de tabela densa com cabeçalho fixo. Recebe o `<table>` já pronto
 * da tela — não impõe colunas nem ordenação.
 */
export function TableFrame({
  children,
  maxHeight = "60vh",
  className,
}: {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("overflow-auto rounded-lg border bg-card shadow-card", className)}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}

/** Coluna de ações compacta: ícones com tooltip, sem quebrar a linha. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-1 whitespace-nowrap">{children}</div>;
}

export function IconAction({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* Estados de carregamento, vazio e erro                               */
/* ------------------------------------------------------------------ */

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-card" aria-busy="true">
      <div className="mb-3 flex gap-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <div className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="gov-title mt-3 text-base">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Não foi possível carregar estas informações",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <div className="mx-auto grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <p className="gov-title mt-3 text-base">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {description ?? "Tente novamente em instantes. Se persistir, avise o administrador do órgão."}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onRetry}>
          <RotateCcw className="size-3.5" /> Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Blocos de conteúdo                                                  */
/* ------------------------------------------------------------------ */

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card shadow-card", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2.5">
        <div className="min-w-0">
          <h2 className="gov-title truncate text-sm">{title}</h2>
          {description ? (
            <p className="truncate text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-1.5">{action}</div> : null}
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}
