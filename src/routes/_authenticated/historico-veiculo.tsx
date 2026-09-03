import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VEHICLE_STATUS, label, useVehicles } from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/historico-veiculo")({
  head: () => ({
    meta: [
      { title: "Histórico do veículo — FrotaGov" },
      {
        name: "description",
        content:
          "Selecione um veículo da frota para consultar utilizações, abastecimentos, autorizações, manutenções, peças, pneus e mudanças de situação.",
      },
      { property: "og:title", content: "Histórico do veículo — FrotaGov" },
      {
        property: "og:description",
        content: "Consulta do histórico completo de cada veículo da frota pública.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoricoVeiculoIndex,
});

function HistoricoVeiculoIndex() {
  const { data: vehicles = [] } = useVehicles();
  const [term, setTerm] = useState("");

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return vehicles;
    return vehicles.filter((v) =>
      [v.plate, v.brand, v.model, v.asset_code].filter(Boolean).join(" ").toLowerCase().includes(t),
    );
  }, [vehicles, term]);

  return (
    <div>
      <PageHeader
        title="Histórico do veículo"
        description="Escolha um veículo para ver a linha do tempo completa de uso, abastecimento e manutenção."
      />

      <div className="mb-4 flex max-w-sm items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar por placa, marca, modelo ou patrimônio"
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Placa</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum veículo encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.plate}</TableCell>
                <TableCell>{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{label(VEHICLE_STATUS, v.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/veiculo/$id" params={{ id: v.id }}>
                      <History className="size-4" /> Histórico
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
