import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";

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

type Payload = {
  orgao?: { legal_name: string; short_name: string | null; city: string | null; state: string | null } | null;
  apresentacao?: string | null;
  atualizado_em?: string;
  frota?: { total: number; por_situacao: Record<string, number>; por_categoria: Record<string, number> };
  abastecimento?: { registros: number; litros: number; valor_total: number };
  manutencao?: { registros: number; valor_total: number };
  contratos?: { number: string; object: string | null; start_date: string | null; end_date: string | null; status: string; total_value: number | null }[];
  error?: string;
};

function PortalTransparencia() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["transparencia", slug],
    queryFn: async (): Promise<Payload> => {
      const response = await fetch(`/api/public/v1/transparencia/${slug}`);
      return (await response.json()) as Payload;
    },
  });

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">Carregando dados abertos...</p>;

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
              <Metric label="Valor total" value={`R$ ${formatMoney(data.abastecimento.valor_total)}`} />
            </div>
          </section>
        )}

        {data.manutencao && (
          <section className="rounded-lg border bg-card p-5 shadow-card">
            <h2 className="gov-title text-lg">Manutenção</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Metric label="Registros" value={String(data.manutencao.registros)} />
              <Metric label="Valor total" value={`R$ ${formatMoney(data.manutencao.valor_total)}`} />
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
                      {[c.start_date, c.end_date]
                        .filter(Boolean)
                        .map((d) => new Date(d as string).toLocaleDateString("pt-BR"))
                        .join(" a ") || "—"}
                    </td>
                    <td>R$ {formatMoney(c.total_value)}</td>
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
