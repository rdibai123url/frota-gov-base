import type { ReactNode } from "react";

import { InfoTip } from "@/components/info-tip";
import { CHART_HELP } from "@/lib/ajuda-dashboard";
import { formatNumberBR } from "@/lib/format";
import { brl } from "@/lib/frotagov";

export const BI_COLORS = {
  navy: "#0b2545",
  blue: "#3b82f6",
  royal: "#1d4ed8",
  sky: "#93c5fd",
  amber: "#b7791f",
  slate: "#64748b",
  red: "#c53030",
  green: "#2e7d32",
};
export const BI_PIE = [
  BI_COLORS.navy,
  BI_COLORS.royal,
  BI_COLORS.blue,
  BI_COLORS.sky,
  BI_COLORS.amber,
  BI_COLORS.slate,
];
export const GRID = "#d6e0ee";

export const money = (v: unknown) => brl(Number(v));

export const axisMoney = (v: unknown) => {
  const n = Number(v);
  return n >= 1000 ? `${formatNumberBR(n / 1000, 1)} mil` : String(Math.round(n));
};

const ACCENTS: Record<string, string> = {
  manutencao: "manutenção",
  analise: "análise",
  concluida: "concluída",
  execucao: "execução",
  emissao: "emissão",
  autorizacao: "autorização",
  comprovacao: "comprovação",
  preventiva: "preventiva",
  vencida: "vencida",
  nao: "não",
  aplicavel: "aplicável",
  indeferida: "indeferida",
  peca: "peça",
  pecas: "peças",
  ocorrencia: "ocorrência",
  publica: "pública",
  inservivel: "inservível",
  alienacao: "alienação",
  cessao: "cessão",
};

/** Transforma o código do sistema (ex.: em_analise) em texto legível (Em análise). */
export const humanize = (s: string) => {
  const t = s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => ACCENTS[w] ?? w)
    .join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Últimos N meses no formato AAAA-MM, do mais antigo ao atual. */
export function monthKeys(months: number) {
  const base = new Date();
  base.setDate(1);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export const monthKey = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : "");

export const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
};

export function ChartCard({
  title,
  helpKey,
  children,
}: {
  title: string;
  helpKey: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <InfoTip help={CHART_HELP[helpKey]} />
      </div>
      {children}
    </div>
  );
}

export function EmptyChart({ text = "Sem dados no período." }: { text?: string }) {
  return <p className="py-14 text-center text-sm text-muted-foreground">{text}</p>;
}

/** Junta valores por chave e devolve as maiores entradas. */
export function topBy<T>(
  rows: T[],
  key: (r: T) => string,
  value: (r: T) => number,
  limit = 10,
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + value(r));
  return [...map.entries()]
    .map(([name, v]) => ({ name, value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
