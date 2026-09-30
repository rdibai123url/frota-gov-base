import { createFileRoute } from "@tanstack/react-router";
import { ManutencaoApoioHub } from "@/components/hubs";
import { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateBR } from "@/lib/frotagov";
import { useWarranties, type WarrantyRow } from "@/lib/manutencao-avancada";

export const Route = createFileRoute("/_authenticated/garantias")({
  head: () => ({
    meta: [
      { title: "Garantias — Dibai Fleet" },
      {
        name: "description",
        content:
          "Garantias vigentes de peças e serviços de manutenção, com a oficina responsável e o prazo de cada uma.",
      },
    ],
  }),
  component: GarantiasRoute,
});

const ALL = "__all__";

type Status = "vigente" | "vencendo" | "vencida";

const statusOf = (w: WarrantyRow): Status =>
  w.daysLeft < 0 ? "vencida" : w.daysLeft <= 30 ? "vencendo" : "vigente";

const STATUS_LABEL: Record<Status, string> = {
  vigente: "Vigente",
  vencendo: "Vence em até 30 dias",
  vencida: "Vencida há pouco",
};

export function GarantiasPanel() {
  const { data: rows = [], isLoading } = useWarranties();
  const [status, setStatus] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [term, setTerm] = useState("");

  const counts = useMemo(() => {
    const c = { vigente: 0, vencendo: 0, vencida: 0 };
    rows.forEach((r) => (c[statusOf(r)] += 1));
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== ALL && statusOf(r) !== status) return false;
      if (kind !== ALL && r.kind !== kind) return false;
      if (!t) return true;
      return [r.plate, r.description, r.supplierName, r.recordCode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t);
    });
  }, [rows, status, kind, term]);

  return (
    <div>
      <PageHeader
        title="Garantias"
        description="Peças e serviços ainda cobertos por garantia. Se o defeito aparecer no prazo, a oficina responsável deve corrigir sem custo."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" /> Garantias vigentes
          </div>
          <div className="mt-1 text-2xl font-semibold">{counts.vigente + counts.vencendo}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="size-4" /> Vencem em até 30 dias
          </div>
          <div className="mt-1 text-2xl font-semibold">{counts.vencendo}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldX className="size-4" /> Vencidas nos últimos 30 dias
          </div>
          <div className="mt-1 text-2xl font-semibold">{counts.vencida}</div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_200px]">
        <Input
          placeholder="Buscar por placa, item, oficina ou código da manutenção"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as situações</SelectItem>
            <SelectItem value="vigente">Vigente</SelectItem>
            <SelectItem value="vencendo">Vence em até 30 dias</SelectItem>
            <SelectItem value="vencida">Vencida há pouco</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger aria-label="Tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Peças e serviços</SelectItem>
            <SelectItem value="peca">Só peças</SelectItem>
            <SelectItem value="servico">Só serviços</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Veículo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Item ou serviço</TableHead>
              <TableHead>Oficina responsável</TableHead>
              <TableHead>Manutenção</TableHead>
              <TableHead>Garantia até</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma garantia encontrada. As garantias aparecem quando a manutenção ou a peça é
                  registrada com prazo de garantia.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((w) => {
              const s = statusOf(w);
              return (
                <TableRow key={`${w.kind}-${w.id}`}>
                  <TableCell className="font-medium">{w.plate ?? "—"}</TableCell>
                  <TableCell>{w.kind === "peca" ? "Peça" : "Serviço"}</TableCell>
                  <TableCell className="max-w-[320px] truncate" title={w.description}>
                    {w.description}
                  </TableCell>
                  <TableCell>{w.supplierName ?? "—"}</TableCell>
                  <TableCell>{w.recordCode ?? "—"}</TableCell>
                  <TableCell>{dateBR(w.until)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        s === "vencida" ? "outline" : s === "vencendo" ? "default" : "secondary"
                      }
                    >
                      {STATUS_LABEL[s]}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Esta tela agora aparece dentro de uma tela com abas. */
function GarantiasRoute() {
  return <ManutencaoApoioHub />;
}
