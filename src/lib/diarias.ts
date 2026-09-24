import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/frotagov";
import type { Database } from "@/integrations/supabase/types";
import { formatMoney } from "@/lib/format";

export type Diary = Database["public"]["Tables"]["diaries"]["Row"];
export type DiaryProof = Database["public"]["Tables"]["diary_proofs"]["Row"];
export type DiaryStatus = Database["public"]["Enums"]["diary_status"];
export type DiaryProofStatus = Database["public"]["Enums"]["diary_proof_status"];

export type DiaryRow = Diary & {
  unit: { id: string; name: string; acronym: string | null } | null;
  vehicle: { id: string; plate: string | null; asset_code: string | null; status: string } | null;
  driver: { id: string; full_name: string } | null;
  usage: { id: string; code: string | null; destination: string | null } | null;
  proofs: DiaryProof[];
};

export const DIARY_STATUS: Record<DiaryStatus, string> = {
  rascunho: "Rascunho",
  solicitada: "Solicitada",
  em_analise: "Em análise",
  autorizada: "Autorizada",
  paga: "Paga / Concedida",
  viagem_realizada: "Viagem realizada",
  aguardando_comprovacao: "Aguardando comprovação",
  comprovada: "Comprovada / Encerrada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
};

export const DIARY_STATUS_STYLE: Record<DiaryStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  solicitada: "bg-muted text-muted-foreground",
  em_analise: "bg-primary/10 text-primary",
  autorizada: "bg-primary/15 text-primary",
  paga: "bg-success/15 text-success",
  viagem_realizada: "bg-warning/20 text-warning-foreground",
  aguardando_comprovacao: "bg-warning/25 text-warning-foreground",
  comprovada: "bg-success/15 text-success",
  rejeitada: "bg-destructive/10 text-destructive",
  cancelada: "bg-destructive/10 text-destructive",
};

export const DIARY_PROOF_STATUS: Record<DiaryProofStatus, string> = {
  em_elaboracao: "Em elaboração",
  entregue: "Entregue",
  em_conferencia: "Em conferência",
  aprovada: "Aprovada / Encerrada",
  rejeitada: "Rejeitada",
};

/** Sequência oficial de tramitação da RD. */
export const DIARY_FLOW: DiaryStatus[] = [
  "rascunho",
  "solicitada",
  "em_analise",
  "autorizada",
  "paga",
  "viagem_realizada",
  "aguardando_comprovacao",
  "comprovada",
];

export function nextDiaryStatus(s: DiaryStatus): DiaryStatus | null {
  const i = DIARY_FLOW.indexOf(s);
  if (i < 0 || i === DIARY_FLOW.length - 1) return null;
  return DIARY_FLOW[i + 1] ?? null;
}

export const DIARY_OPEN: DiaryStatus[] = [
  "rascunho",
  "solicitada",
  "em_analise",
  "autorizada",
  "paga",
  "viagem_realizada",
  "aguardando_comprovacao",
];

/* ------------------------------ valor por extenso ------------------------------ */

const UNI = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ10 = [
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZ = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CEM = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function trio(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  const parts: string[] = [];
  if (c) parts.push(CEM[c] as string);
  if (d === 1) parts.push(DEZ10[u] as string);
  else {
    if (d) parts.push(DEZ[d] as string);
    if (u) parts.push(UNI[u] as string);
  }
  return parts.join(" e ");
}

/** Valor monetário por extenso em português (para impressão da RD). */
export function moneyInWords(value: number): string {
  const v = Math.round((Number(value) || 0) * 100);
  const reais = Math.floor(v / 100);
  const centavos = v % 100;
  const chunks: string[] = [];
  const scale = [
    { div: 1_000_000_000, s: "bilhão", p: "bilhões" },
    { div: 1_000_000, s: "milhão", p: "milhões" },
    { div: 1_000, s: "mil", p: "mil" },
  ];
  let rest = reais;
  for (const sc of scale) {
    const q = Math.floor(rest / sc.div);
    rest = rest % sc.div;
    if (q > 0)
      chunks.push(
        `${sc.div === 1000 && q === 1 ? "" : trio(q) + " "}${q === 1 ? sc.s : sc.p}`.trim(),
      );
  }
  if (rest > 0) chunks.push(trio(rest));
  let out = chunks.length ? chunks.join(" e ") : "zero";
  out += reais === 1 ? " real" : " reais";
  if (centavos > 0) out += ` e ${trio(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export const moneyWithWords = (v: number) => `${formatMoney(v)} (${moneyInWords(v)})`;

/* ---------------------------------- hooks ---------------------------------- */

export function useDiaries() {
  return useQuery({
    queryKey: ["diaries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diaries")
        .select(
          "*, unit:units(id, name, acronym), vehicle:vehicles(id, plate,asset_code, status), driver:drivers(id, full_name), usage:vehicle_usages(id, code, destination), proofs:diary_proofs(*)",
        )
        .order("departure_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as DiaryRow[];
    },
  });
}

export type DiaryIndicators = {
  requestedMonth: number;
  authorized: number;
  awaitingProof: number;
  overdue: number;
  totalValue: number;
};

/** Indicadores do Painel e base dos alertas de diárias. */
export function diaryIndicators(rows: DiaryRow[], ref = new Date()): DiaryIndicators {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const inMonth = (iso: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  };
  const active = rows.filter((r) => r.status !== "cancelada" && r.status !== "rejeitada");
  return {
    requestedMonth: active.filter((r) => inMonth(r.requested_at ?? r.created_at)).length,
    authorized: active.filter((r) => ["autorizada", "paga"].includes(r.status)).length,
    awaitingProof: active.filter((r) => r.status === "aguardando_comprovacao").length,
    overdue: active.filter((r) => isProofOverdue(r)).length,
    totalValue: active
      .filter((r) => inMonth(r.departure_at))
      .reduce((s, r) => s + Number(r.total_value || 0), 0),
  };
}

/** Comprovação vencida: 30 dias após o retorno sem prestação de contas aprovada. */
export function isProofOverdue(r: DiaryRow, days = 30) {
  if (r.status === "comprovada" || r.status === "cancelada" || r.status === "rejeitada")
    return false;
  const base = r.return_at ?? r.departure_at;
  if (!base) return false;
  const limit = new Date(base).getTime() + days * 86400000;
  const approved = (r.proofs ?? []).some((p) => p.status === "aprovada");
  return !approved && Date.now() > limit;
}

export type DiaryAlert = {
  kind: string;
  severity: "alta" | "media";
  message: string;
  diary: DiaryRow;
};

export function diaryAlerts(rows: DiaryRow[]): DiaryAlert[] {
  const out: DiaryAlert[] = [];
  for (const r of rows) {
    if (r.status === "cancelada" || r.status === "rejeitada") continue;
    if (
      r.vehicle_id &&
      new Date(r.departure_at).getTime() < Date.now() &&
      ["rascunho", "solicitada", "em_analise"].includes(r.status)
    ) {
      out.push({
        kind: "viagem_sem_autorizacao",
        severity: "alta",
        message: `Diária ${r.code}: viagem iniciada sem autorização.`,
        diary: r,
      });
    }
    if (isProofOverdue(r)) {
      out.push({
        kind: "comprovacao_vencida",
        severity: "alta",
        message: `Diária ${r.code}: comprovação vencida (mais de 30 dias do retorno).`,
        diary: r,
      });
    }
    const debt = (r.proofs ?? []).find(
      (p) => Number(p.balance_value) > 0 && !p.restitution_resolved,
    );
    if (debt) {
      out.push({
        kind: "saldo_restituir",
        severity: "media",
        message: `Diária ${r.code}: saldo a restituir de ${formatMoney(debt.balance_value)}.`,
        diary: r,
      });
    }
  }
  return out;
}
