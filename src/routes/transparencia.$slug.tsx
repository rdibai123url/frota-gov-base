import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Landmark } from "lucide-react";

import { formatMoney, formatLiters } from "@/lib/format";

export const Route = createFileRoute("/transparencia/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Transparência da frota pública — ${params.slug} | FrotaGov` },
      {
        name: "description",
        content:
          "Dados abertos e agregados da frota do órgão público: quantidade de veículos, consumo de combustível, manutenções e contratos.",
      },
      { property: "og:title", content: "Transparência da frota pública — FrotaGov" },
      {
        property: "og:description",
        content: "Indicadores agregados da frota pública, sem dados pessoais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalTransparencia,
});

type PublishedSnapshot = {
  frota?: { total?: number };
  abastecimento?: { registros?: number; litros?: number; valor_total?: number };
  manutencao?: { registros?: number; valor_total?: number };
  utilizacao?: { registros?: number };
  contratos?: { vigentes?: number; valor_total?: number };
  multas?: { registros?: number };
  sinistros?: { registros?: number };
  obrigacoes?: { registros?: number };
  patrimonio?: { movimentacoes?: number };
};

type Payload = {
  orgao?: {
    legal_name: string;
    short_name: string | null;
    city: string | null;
    state: string | null;
  } | null;
  apresentacao?: string | null;
  atualizado_em?: string;
  conjuntos_disponiveis?: string[];
  competencias_publicadas?: {
    competencia: string;
    chave: string;
    versao: number;
    publicado_em: string;
  }[];
  frota?: {
    total: number;
    por_situacao: Record<string, number>;
    por_categoria: Record<string, number>;
  };
  abastecimento?: { registros: number; litros: number; valor_total: number };
  manutencao?: { registros: number; valor_total: number };
  limpeza?: { registros: number; valor_total: number };
  competencia?: string;
  versao?: number;
  publicado_em?: string;
  dados?: PublishedSnapshot;
  contratos?: {
    number: string;
    object: string | null;
    valid_from: string | null;
    valid_to: string | null;
    status: string;
    current_value: number | null;
  }[];
  error?: string;
};

const DATASET_LABELS: Record<string, string> = {
  frota: "Frota",
  abastecimento: "Abastecimento",
  limpeza: "Limpeza da frota",
  manutencao: "Manutenção",
  contratos: "Contratos",
};

function PortalTransparencia() {
  const { slug } = Route.useParams();
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState({ from, to });
  const [competencia, setCompetencia] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["transparencia", slug, period.from, period.to],
    queryFn: async (): Promise<Payload> => {
      const response = await fetch(
        `/api/public/v1/transparencia/${slug}?de=${period.from}&ate=${period.to}`,
      );
      return (await response.json()) as Payload;
    },
  });

  const { data: fechamento } = useQuery({
    queryKey: ["transparencia-competencia", slug, competencia],
    enabled: !!competencia,
    queryFn: async (): Promise<Payload> => {
      const response = await fetch(
        `/api/public/v1/transparencia/${slug}?competencia=${competencia}`,
      );
      return (await response.json()) as Payload;
    },
  });

  if (isLoading)
    return <p className="p-10 text-center text-muted-foreground">Carregando dados abertos...</p>;

  if (!data || data.error) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <h1 className="gov-title text-2xl">Portal indisponível</h1>
        <p className="mt-3 text-muted-foreground">
          Este órgão não possui publicação de dados abertos ativa no FrotaGov.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-6">
          <div className="flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Landmark className="size-5" />
          </div>
          <div>
            <h1 className="gov-title text-xl">{data.orgao?.legal_name ?? "Órgão público"}</h1>
            <p className="text-xs text-muted-foreground">
              Portal da Transparência da frota ·{" "}
              {[data.orgao?.city, data.orgao?.state].filter(Boolean).join(" / ")}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-5 py-10">
        {data.apresentacao && <p className="text-muted-foreground">{data.apresentacao}</p>}

        <section className="rounded-lg border bg-card p-5 shadow-card">
          <h2 className="gov-title text-lg">Fechamento mensal publicado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulte os dados consolidados e conferidos pelo órgão em cada competência (mês/ano).
            Nenhum dado pessoal é publicado.
          </p>
          {(data.competencias_publicadas ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhuma competência foi fechada e publicada até o momento.
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Competência</span>
                  <select
                    value={competencia}
                    onChange={(e) => setCompetencia(e.target.value)}
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione o mês/ano</option>
                    {(data.competencias_publicadas ?? []).map((c) => (
                      <option key={c.chave} value={c.chave}>
                        Competência {c.competencia}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {fechamento?.dados && (
                <div className="mt-4 rounded-md border p-4 text-sm">
                  <p className="font-medium">Competência {fechamento.competencia}</p>
                  <p className="text-xs text-muted-foreground">
                    Versão {fechamento.versao} · Publicada em{" "}
                    {fechamento.publicado_em
                      ? new Date(fechamento.publicado_em).toLocaleString("pt-BR")
                      : "—"}
                  </p>
                  <ul className="mt-3 space-y-1 text-muted-foreground">
                    <li>Frota: {fechamento.dados["frota"]?.total ?? 0} veículo(s)</li>
                    <li>
                      Abastecimentos: {fechamento.dados["abastecimento"]?.registros ?? 0}{" "}
                      registro(s) · {formatLiters(fechamento.dados["abastecimento"]?.litros)} L · R${" "}
                      {formatMoney(fechamento.dados["abastecimento"]?.valor_total)}
                    </li>
                    <li>
                      Manutenções: {fechamento.dados["manutencao"]?.registros ?? 0} registro(s) · R${" "}
                      {formatMoney(fechamento.dados["manutencao"]?.valor_total)}
                    </li>
                    <li>Utilizações: {fechamento.dados["utilizacao"]?.registros ?? 0}</li>
                    <li>
                      Contratos vigentes: {fechamento.dados["contratos"]?.vigentes ?? 0} · R${" "}
                      {formatMoney(fechamento.dados["contratos"]?.valor_total)}
                    </li>
                    <li>
                      Multas: {fechamento.dados["multas"]?.registros ?? 0} · Sinistros:{" "}
                      {fechamento.dados["sinistros"]?.registros ?? 0} · Obrigações:{" "}
                      {fechamento.dados["obrigacoes"]?.registros ?? 0}
                    </li>
                    <li>
                      Movimentações patrimoniais:{" "}
                      {fechamento.dados["patrimonio"]?.movimentacoes ?? 0}
                    </li>
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <section className="rounded-lg border bg-card p-5 shadow-card">
          <h2 className="gov-title text-lg">Consulta por período e dados abertos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Os números de abastecimento, manutenção e contratos consideram o período informado.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">De</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Até</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => setPeriod({ from, to })}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Aplicar período
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(data.conjuntos_disponiveis ?? []).map((ds) => (
              <a
                key={ds}
                href={`/api/public/v1/transparencia/${slug}?formato=csv&conjunto=${ds}&de=${period.from}&ate=${period.to}`}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-secondary"
              >
                <Download className="size-4" /> {DATASET_LABELS[ds] ?? ds} (CSV)
              </a>
            ))}
          </div>
        </section>

        {data.frota && (
          <section className="rounded-lg border bg-card p-5 shadow-card">
            <h2 className="gov-title text-lg">Frota</h2>
            <p className="mt-2 text-3xl font-semibold">{data.frota.total}</p>
            <p className="text-sm text-muted-foreground">veículos cadastrados</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {Object.entries(data.frota.por_situacao).map(([k, v]) => (
                <div key={k} className="flex justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="capitalize">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.abastecimento && (
          <section className="rounded-lg border bg-card p-5 shadow-card">
            <h2 className="gov-title text-lg">Abastecimento</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Metric label="Registros" value={String(data.abastecimento.registros)} />
              <Metric label="Litros" value={formatLiters(data.abastecimento.litros)} />
              <Metric
                label="Valor total"
                value={`R$ ${formatMoney(data.abastecimento.valor_total)}`}
              />
            </div>
          </section>
        )}

        {data.manutencao && (
          <section className="rounded-lg border bg-card p-5 shadow-card">
            <h2 className="gov-title text-lg">Manutenção</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Metric label="Registros" value={String(data.manutencao.registros)} />
              <Metric
                label="Valor total"
                value={`R$ ${formatMoney(data.manutencao.valor_total)}`}
              />
            </div>
          </section>
        )}

        {data.limpeza && (
          <section className="rounded-lg border bg-card p-5 shadow-card">
            <h2 className="gov-title text-lg">Limpeza da frota</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Metric label="Serviços realizados" value={String(data.limpeza.registros)} />
              <Metric label="Valor total" value={`R$ ${formatMoney(data.limpeza.valor_total)}`} />
            </div>
          </section>
        )}

        {data.contratos && data.contratos.length > 0 && (
          <section className="overflow-x-auto rounded-lg border bg-card p-5 shadow-card">
            <h2 className="gov-title text-lg">Contratos</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2">Número</th>
                  <th>Objeto</th>
                  <th>Vigência</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.contratos.map((c) => (
                  <tr key={c.number} className="border-t">
                    <td className="py-2">{c.number}</td>
                    <td>{c.object ?? "—"}</td>
                    <td>
                      {[c.valid_from, c.valid_to]
                        .filter(Boolean)
                        .map((d) => new Date(d as string).toLocaleDateString("pt-BR"))
                        .join(" a ") || "—"}
                    </td>
                    <td>R$ {formatMoney(c.current_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          Dados agregados publicados voluntariamente pelo órgão. Nenhuma informação pessoal de
          condutores ou servidores é divulgada. Atualizado em{" "}
          {data.atualizado_em ? new Date(data.atualizado_em).toLocaleString("pt-BR") : "—"}.
        </p>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
