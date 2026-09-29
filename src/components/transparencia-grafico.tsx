/**
 * Gráfico do portal público de transparência: quanto a frota custou em cada mês.
 * Só usa números agregados já publicados (sem dados pessoais).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Mes = { mes: string; valor?: number; registros?: number };

const money = (v: unknown) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const label = (key: string) => {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
};

export function TransparenciaGrafico({
  abastecimento,
  manutencao,
  limpeza,
}: {
  abastecimento?: Mes[] | undefined;
  manutencao?: Mes[] | undefined;
  limpeza?: Mes[] | undefined;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const data = useMemo(() => {
    const keys = new Set<string>();
    for (const list of [abastecimento, manutencao, limpeza])
      for (const r of list ?? []) keys.add(r.mes);
    const pick = (list: Mes[] | undefined, k: string) =>
      Number((list ?? []).find((r) => r.mes === k)?.valor ?? 0);
    return [...keys].sort().map((k) => ({
      mes: label(k),
      Combustível: pick(abastecimento, k),
      Manutenção: pick(manutencao, k),
      Limpeza: pick(limpeza, k),
    }));
  }, [abastecimento, manutencao, limpeza]);

  if (data.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-5 shadow-card">
      <h2 className="gov-title text-lg">Quanto a frota custou, mês a mês</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Valores pagos com combustível, manutenção e limpeza no período consultado.
      </p>
      <div className="mt-4 h-72">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d6e0ee" />
              <XAxis dataKey="mes" fontSize={12} />
              <YAxis
                fontSize={12}
                tickFormatter={(v) =>
                  Number(v) >= 1000
                    ? `${(Number(v) / 1000).toLocaleString("pt-BR")} mil`
                    : String(v)
                }
              />
              <Tooltip formatter={money} />
              <Legend />
              <Bar dataKey="Combustível" stackId="a" fill="#0b2545" />
              <Bar dataKey="Manutenção" stackId="a" fill="#3b82f6" />
              <Bar dataKey="Limpeza" stackId="a" fill="#93c5fd" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
