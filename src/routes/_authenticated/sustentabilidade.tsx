/**
 * Fase 10 — Bloco 6: Sustentabilidade da Frota (ESG).
 *
 * Todos os indicadores partem dos abastecimentos efetivamente registrados.
 * As emissões são ESTIMATIVAS calculadas com fatores parametrizáveis por
 * órgão (tabela `emission_factors`) — nunca medição real.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Leaf, Download, FileSpreadsheet, Printer, Plus, Pencil } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import {
  supabase,
  useCostCenters,
  useInvalidate,
  useOrganization,
  usePerms,
  useUnits,
} from "@/lib/frotagov";
import { formatNumberBR } from "@/lib/format";
import { exportReportCsv, exportXlsx, printReport } from "@/lib/reports";
import {
  computeEsg,
  fuelKeyOf,
  useEmissionFactors,
  type EmissionFactor,
  type EsgInput,
} from "@/lib/integracoes";

export const Route = createFileRoute("/_authenticated/sustentabilidade")({
  head: () => ({
    meta: [
      { title: "Sustentabilidade da Frota — FrotaGov" },
      {
        name: "description",
        content:
          "Painel ESG do órgão: litros por combustível, evolução mensal, participação de renováveis e estimativa de emissões de CO2e com fatores parametrizáveis.",
      },
      { property: "og:title", content: "Sustentabilidade da Frota — FrotaGov" },
      {
        property: "og:description",
        content: "Indicadores ambientais da frota pública com estimativa de CO2e por combustível.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Sustentabilidade,
});

const today = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

type FuelingEsgRow = {
  fueled_at: string;
  quantity: number;
  unit_id: string | null;
  cost_center_id: string | null;
  fuel_types: { name: string; category: string } | null;
  vehicles: { asset_class: string } | null;
};

function useEsgFuelings(
  from: string,
  to: string,
  unitId: string,
  costCenterId: string,
  assetClass: string,
) {
  return useQuery({
    queryKey: ["esg-fuelings", from, to, unitId, costCenterId, assetClass],
    queryFn: async () => {
      let q = supabase
        .from("fuelings")
        .select(
          "fueled_at, quantity, unit_id, cost_center_id, fuel_types(name, category), vehicles(asset_class)",
        )
        .eq("status", "valido")
        .gte("fueled_at", `${from}T00:00:00`)
        .lte("fueled_at", `${to}T23:59:59`)
        .limit(20000);
      if (unitId !== "todas") q = q.eq("unit_id", unitId);
      if (costCenterId !== "todos") q = q.eq("cost_center_id", costCenterId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as FuelingEsgRow[];
      return rows.filter(
        (r) =>
          (r.fuel_types?.category ?? "combustivel") === "combustivel" &&
          (assetClass === "todas" || r.vehicles?.asset_class === assetClass),
      );
    },
  });
}

function Sustentabilidade() {
  const { canManageFleet, orgId, userId, userName } = usePerms();
  const { data: org } = useOrganization();
  const { data: units = [] } = useUnits();
  const { data: costCenters = [] } = useCostCenters();
  const { data: factors = [] } = useEmissionFactors();
  const invalidate = useInvalidate();

  const [from, setFrom] = useState(monthsAgo(12));
  const [to, setTo] = useState(today());
  const [unitId, setUnitId] = useState("todas");
  const [costCenterId, setCostCenterId] = useState("todos");
  const [assetClass, setAssetClass] = useState("todas");

  const { data: rows = [], isLoading } = useEsgFuelings(from, to, unitId, costCenterId, assetClass);

  /** Período imediatamente anterior, de mesma duração, para comparação. */
  const previous = useMemo(() => {
    const days = Math.max(
      1,
      Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000),
    );
    const prevTo = new Date(new Date(from).getTime() - 86400000).toISOString().slice(0, 10);
    const prevFrom = new Date(new Date(prevTo).getTime() - days * 86400000)
      .toISOString()
      .slice(0, 10);
    return { prevFrom, prevTo };
  }, [from, to]);
  const { data: prevRows = [] } = useEsgFuelings(
    previous.prevFrom,
    previous.prevTo,
    unitId,
    costCenterId,
    assetClass,
  );

  const toInput = (r: FuelingEsgRow): EsgInput => ({
    fueledAt: r.fueled_at,
    fuelKey: fuelKeyOf(r.fuel_types?.name),
    quantity: Number(r.quantity ?? 0),
  });

  const esg = useMemo(() => computeEsg(rows.map(toInput), factors), [rows, factors]);
  const esgPrev = useMemo(() => computeEsg(prevRows.map(toInput), factors), [prevRows, factors]);

  const variation =
    esgPrev.totalCo2e > 0 ? ((esg.totalCo2e - esgPrev.totalCo2e) / esgPrev.totalCo2e) * 100 : null;

  const meta = {
    title: "Sustentabilidade da Frota — estimativa de emissões",
    organization: org?.legal_name ?? null,
    subtitle:
      "Estimativa de CO2e calculada a partir dos litros abastecidos e dos fatores de emissão do órgão.",
    unit: unitId === "todas" ? "Todas" : (units.find((u) => u.id === unitId)?.name ?? null),
    period: `${new Date(from).toLocaleDateString("pt-BR")} a ${new Date(to).toLocaleDateString("pt-BR")}`,
    issuedBy: userName,
  };

  const columns = [
    { key: "combustivel", label: "Combustível" },
    { key: "litros", label: "Litros" },
    { key: "fator", label: "Fator (kg CO2e/L)" },
    { key: "co2e", label: "CO2e estimado (kg)" },
    { key: "participacao", label: "Participação (%)" },
  ];
  const reportRows = esg.byFuel.map((f) => ({
    combustivel: f.label,
    litros: formatNumberBR(f.liters, 2),
    fator: f.factor === null ? "sem fator cadastrado" : formatNumberBR(f.factor, 3),
    co2e: formatNumberBR(f.co2e, 2),
    participacao: formatNumberBR(esg.totalLiters ? (f.liters / esg.totalLiters) * 100 : 0, 1),
  }));

  return (
    <>
      <PageHeader
        title="Sustentabilidade da Frota"
        description="Indicadores ambientais calculados sobre os abastecimentos registrados. As emissões são estimativas, obtidas com fatores parametrizáveis por órgão — não representam medição direta."
      />

      <Tabs defaultValue="painel" className="space-y-4">
        <TabsList>
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="fatores">Fatores de emissão</TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-card md:grid-cols-5">
            <div>
              <Label htmlFor="from">De</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to">Até</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Centro de custo</Label>
              <Select value={costCenterId} onValueChange={setCostCenterId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {costCenters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Classe do ativo</Label>
              <Select value={assetClass} onValueChange={setAssetClass}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="veiculo">Veículos</SelectItem>
                  <SelectItem value="equipamento">Máquinas e equipamentos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {esg.missingFactors.length > 0 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Sem fator de emissão vigente para: {esg.missingFactors.join(", ")}. Os litros entram
              nos totais, mas não geram estimativa de CO2e enquanto o fator não for cadastrado.
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-4">
            <Kpi title="Litros de combustível" value={`${formatNumberBR(esg.totalLiters, 2)} L`} />
            <Kpi
              title="CO2e estimado"
              value={`${formatNumberBR(esg.totalCo2e, 2)} kg`}
              hint={
                variation === null
                  ? "Sem período anterior comparável"
                  : `${variation >= 0 ? "+" : ""}${formatNumberBR(variation, 1)}% vs. período anterior`
              }
            />
            <Kpi
              title="Participação de renováveis"
              value={`${formatNumberBR(esg.renewablePct, 1)} %`}
            />
            <Kpi
              title="Abastecimentos considerados"
              value={String(rows.length)}
              hint="Somente combustíveis; lubrificantes e fluidos ficam fora."
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Leaf className="size-4" /> Consumo e emissões por combustível
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportReportCsv("sustentabilidade", columns, reportRows, meta)}
                >
                  <Download className="size-4" /> CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportXlsx("sustentabilidade", columns, reportRows, "ESG", meta)}
                >
                  <FileSpreadsheet className="size-4" /> XLSX
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => printReport(meta, columns, reportRows)}
                >
                  <Printer className="size-4" /> PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((c) => (
                        <TableHead key={c.key}>{c.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          Carregando…
                        </TableCell>
                      </TableRow>
                    )}
                    {!isLoading && reportRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          Nenhum abastecimento no período.
                        </TableCell>
                      </TableRow>
                    )}
                    {reportRows.map((r) => (
                      <TableRow key={r.combustivel}>
                        <TableCell className="font-medium">{r.combustivel}</TableCell>
                        <TableCell>{r.litros}</TableCell>
                        <TableCell>{r.fator}</TableCell>
                        <TableCell>{r.co2e}</TableCell>
                        <TableCell>{r.participacao}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evolução mensal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competência</TableHead>
                      <TableHead>Litros</TableHead>
                      <TableHead>CO2e estimado (kg)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {esg.byMonth.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                          Sem dados no período.
                        </TableCell>
                      </TableRow>
                    )}
                    {esg.byMonth.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell>{m.month.split("-").reverse().join("/")}</TableCell>
                        <TableCell>{formatNumberBR(m.liters, 2)}</TableCell>
                        <TableCell>{formatNumberBR(m.co2e, 2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fatores">
          <FactorsPanel
            factors={factors}
            canEdit={canManageFleet}
            orgId={orgId}
            userId={userId}
            onSaved={() => invalidate(["emission-factors"])}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function FactorsPanel({
  factors,
  canEdit,
  orgId,
  userId,
  onSaved,
}: {
  factors: EmissionFactor[];
  canEdit: boolean;
  orgId: string | null;
  userId: string | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmissionFactor | null>(null);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  function openNew() {
    setEditing(null);
    setActive(true);
    setOpen(true);
  }
  function openEdit(f: EmissionFactor) {
    setEditing(f);
    setActive(f.active);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      fuel_key: String(form.get("fuel_key") ?? "")
        .trim()
        .toLowerCase(),
      label: String(form.get("label") ?? "").trim(),
      factor_kg_co2e_per_unit: Number(String(form.get("factor") ?? "0").replace(",", ".")),
      unit: String(form.get("unit") ?? "L"),
      renewable_share_pct: Number(String(form.get("renewable") ?? "0").replace(",", ".")),
      source: String(form.get("source") ?? "").trim(),
      reference: String(form.get("reference") ?? "").trim() || null,
      version: String(form.get("version") ?? "1"),
      valid_from: String(form.get("valid_from") ?? today()),
      valid_to: String(form.get("valid_to") ?? "") || null,
      active,
    };
    if (!payload.fuel_key || !payload.label || !payload.source) {
      toast.error("Preencha combustível, descrição e fonte.");
      return;
    }
    setBusy(true);
    const { error } = editing
      ? await supabase.from("emission_factors").update(payload).eq("id", editing.id)
      : await supabase
          .from("emission_factors")
          .insert({ ...payload, organization_id: orgId!, created_by: userId });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível salvar o fator.");
      return;
    }
    toast.success("Fator de emissão salvo.");
    onSaved();
    setOpen(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Fatores de emissão</CardTitle>
          <p className="text-sm text-muted-foreground">
            Parametrizáveis por órgão, com fonte, versão e vigência. Alterar um fator não reescreve
            o passado: cada abastecimento usa o fator vigente na data em que ocorreu.
          </p>
        </div>
        <Button size="sm" onClick={openNew} disabled={!canEdit}>
          <Plus className="size-4" /> Novo fator
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Combustível</TableHead>
                <TableHead>Fator</TableHead>
                <TableHead>Renovável (%)</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {factors.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.label}</TableCell>
                  <TableCell>
                    {formatNumberBR(Number(f.factor_kg_co2e_per_unit), 3)} kg CO2e/{f.unit}
                  </TableCell>
                  <TableCell>{formatNumberBR(Number(f.renewable_share_pct), 0)}</TableCell>
                  <TableCell className="max-w-72 truncate">{f.source}</TableCell>
                  <TableCell>{f.version}</TableCell>
                  <TableCell>
                    {new Date(f.valid_from).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                    {f.valid_to
                      ? ` a ${new Date(f.valid_to).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
                      : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.active ? "default" : "secondary"}>
                      {f.active ? "Vigente" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(f)}
                      disabled={!canEdit}
                      aria-label="Editar"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar fator de emissão" : "Novo fator de emissão"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="fuel_key">Chave do combustível *</Label>
                <Input
                  id="fuel_key"
                  name="fuel_key"
                  placeholder="gasolina"
                  defaultValue={editing?.fuel_key ?? ""}
                  required
                />
              </div>
              <div>
                <Label htmlFor="label">Descrição *</Label>
                <Input id="label" name="label" defaultValue={editing?.label ?? ""} required />
              </div>
              <div>
                <Label htmlFor="factor">Fator (kg CO2e por unidade) *</Label>
                <Input
                  id="factor"
                  name="factor"
                  defaultValue={String(editing?.factor_kg_co2e_per_unit ?? "")}
                  required
                />
              </div>
              <div>
                <Label htmlFor="unit">Unidade</Label>
                <Input id="unit" name="unit" defaultValue={editing?.unit ?? "L"} />
              </div>
              <div>
                <Label htmlFor="renewable">Participação renovável (%)</Label>
                <Input
                  id="renewable"
                  name="renewable"
                  defaultValue={String(editing?.renewable_share_pct ?? 0)}
                />
              </div>
              <div>
                <Label htmlFor="version">Versão</Label>
                <Input id="version" name="version" defaultValue={editing?.version ?? "1"} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="source">Fonte *</Label>
                <Input id="source" name="source" defaultValue={editing?.source ?? ""} required />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="reference">Referência / observação</Label>
                <Input id="reference" name="reference" defaultValue={editing?.reference ?? ""} />
              </div>
              <div>
                <Label htmlFor="valid_from">Vigente de *</Label>
                <Input
                  id="valid_from"
                  name="valid_from"
                  type="date"
                  defaultValue={editing?.valid_from ?? today()}
                  required
                />
              </div>
              <div>
                <Label htmlFor="valid_to">Vigente até</Label>
                <Input
                  id="valid_to"
                  name="valid_to"
                  type="date"
                  defaultValue={editing?.valid_to ?? ""}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="factive" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="factive">Ativo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
