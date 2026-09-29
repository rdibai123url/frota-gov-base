import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { brl, dateBR, supabase } from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/pesquisa-precos")({
  head: () => ({
    meta: [
      { title: "Pesquisa de preços — FrotaGov" },
      {
        name: "description",
        content:
          "Consulta o histórico de preços pagos por peças e serviços de manutenção, com menor, média e maior valor.",
      },
    ],
  }),
  component: PesquisaPrecos,
});

type PartHit = {
  id: string;
  description: string;
  unit_value: number;
  quantity: number;
  installed_at: string;
  vehicle: { plate: string | null } | null;
  maintenance_record: {
    code: string | null;
    supplier: { trade_name: string | null; legal_name: string | null } | null;
  } | null;
};

type ServiceHit = {
  id: string;
  code: string | null;
  services: string;
  labor_value: number;
  labor_quantity: number | null;
  labor_unit_price: number | null;
  entry_at: string;
  vehicle: { plate: string | null } | null;
  supplier: { trade_name: string | null; legal_name: string | null } | null;
};

const supplierName = (
  s: { trade_name: string | null; legal_name: string | null } | null | undefined,
) => s?.trade_name || s?.legal_name || "—";

/** Escapa caracteres especiais do filtro ilike. */
const likeTerm = (t: string) => `%${t.replace(/[%_\\,()]/g, " ").trim()}%`;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function PesquisaPrecos() {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");

  const parts = useQuery({
    queryKey: ["price-search-parts", term],
    enabled: term.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_parts")
        .select(
          "id, description, unit_value, quantity, installed_at, vehicle:vehicles(plate), maintenance_record:maintenance_records(code, supplier:suppliers(trade_name, legal_name))",
        )
        .ilike("description", likeTerm(term))
        .order("installed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as PartHit[];
    },
  });

  const services = useQuery({
    queryKey: ["price-search-services", term],
    enabled: term.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_records")
        .select(
          "id, code, services, labor_value, labor_quantity, labor_unit_price, entry_at, vehicle:vehicles(plate), supplier:suppliers(trade_name, legal_name)",
        )
        .ilike("services", likeTerm(term))
        .neq("status", "cancelada")
        .order("entry_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ServiceHit[];
    },
  });

  const partValues = (parts.data ?? []).map((p) => Number(p.unit_value)).filter((v) => v > 0);
  const laborValues = (services.data ?? []).map((s) => Number(s.labor_value)).filter((v) => v > 0);
  const stats = (vals: number[]) =>
    vals.length
      ? {
          min: Math.min(...vals),
          max: Math.max(...vals),
          avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        }
      : null;
  const ps = stats(partValues);
  const ls = stats(laborValues);

  function search(e: React.FormEvent) {
    e.preventDefault();
    setTerm(input.trim());
  }

  return (
    <div>
      <PageHeader
        title="Pesquisa de preços"
        description="Consulte quanto já foi pago por uma peça ou serviço para conferir se um orçamento está dentro do praticado."
      />

      <form onSubmit={search} className="mb-6 flex max-w-2xl gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite a peça ou o serviço (mínimo de 3 letras). Ex.: pastilha, alinhamento"
          aria-label="Peça ou serviço"
        />
        <Button type="submit" className="gap-2" disabled={input.trim().length < 3}>
          <Search className="size-4" /> Pesquisar
        </Button>
      </form>

      {term.length < 3 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground shadow-card">
          Digite pelo menos 3 letras e clique em Pesquisar.
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-base font-semibold">Peças (valor unitário)</h2>
            {ps && (
              <div className="mb-3 grid max-w-xl gap-3 sm:grid-cols-3">
                <Stat label="Menor valor" value={brl(ps.min)} />
                <Stat label="Valor médio" value={brl(ps.avg)} />
                <Stat label="Maior valor" value={brl(ps.max)} />
              </div>
            )}
            <div className="rounded-lg border bg-card shadow-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Peça</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Oficina</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Qtde.</TableHead>
                    <TableHead className="text-right">Valor unitário</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!parts.isLoading && (parts.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        Nenhuma peça encontrada para “{term}”.
                      </TableCell>
                    </TableRow>
                  )}
                  {(parts.data ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.description}</TableCell>
                      <TableCell>{p.vehicle?.plate ?? "—"}</TableCell>
                      <TableCell>{supplierName(p.maintenance_record?.supplier)}</TableCell>
                      <TableCell>{dateBR(p.installed_at)}</TableCell>
                      <TableCell className="text-right">{Number(p.quantity)}</TableCell>
                      <TableCell className="text-right">{brl(Number(p.unit_value))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">Serviços e mão de obra</h2>
            {ls && (
              <div className="mb-3 grid max-w-xl gap-3 sm:grid-cols-3">
                <Stat label="Menor valor de mão de obra" value={brl(ls.min)} />
                <Stat label="Valor médio" value={brl(ls.avg)} />
                <Stat label="Maior valor" value={brl(ls.max)} />
              </div>
            )}
            <div className="rounded-lg border bg-card shadow-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Oficina</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead className="text-right">Horas</TableHead>
                    <TableHead className="text-right">Valor da hora</TableHead>
                    <TableHead className="text-right">Mão de obra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!services.isLoading && (services.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                        Nenhum serviço encontrado para “{term}”.
                      </TableCell>
                    </TableRow>
                  )}
                  {(services.data ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-[280px] truncate font-medium" title={s.services}>
                        {s.services}
                      </TableCell>
                      <TableCell>{s.vehicle?.plate ?? "—"}</TableCell>
                      <TableCell>{supplierName(s.supplier)}</TableCell>
                      <TableCell>{dateBR(s.entry_at)}</TableCell>
                      <TableCell className="text-right">{s.labor_quantity ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {s.labor_unit_price ? brl(Number(s.labor_unit_price)) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{brl(Number(s.labor_value))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
