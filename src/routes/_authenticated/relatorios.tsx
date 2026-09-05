import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart, Printer } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  supabase,
  useBrasaoUrl,
  useDrivers,
  useOrganization,
  useProfile,
  useUnits,
  useVehicles,
  useContractObjectKinds,
  objectKindLabel,
  CONTRACT_OBJECT_KIND_FALLBACK,
} from "@/lib/frotagov";
import { formatMoney, formatLiters, formatNumberBR, formatCPF, parseBRNumber } from "@/lib/format";
import { DIARY_STATUS } from "@/lib/diarias";
import { logEvent } from "@/lib/platform";
import { exportReportCsv, exportXlsx, printReport, type ReportMeta } from "@/lib/reports";
import {
  COST_CATEGORIES,
  DEVIATION_LABEL,
  ECONOMICITY_LABEL,
  aggregateConsumption,
  catValue,
  classifyDeviation,
  costsByAsset,
  costsByMonth,
  detectAnomalies,
  economicity,
  matchParameter,
  monthLabel,
  periodDays,
  type ConsumptionSegment,
  type CostRow,
  type DeviationClass,
  type DowntimeRow,
} from "@/lib/inteligencia";


export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios avançados — FrotaGov" },
      {
        name: "description",
        content:
          "Relatórios gerenciais de frota, abastecimento, manutenção, utilização, contratos e custos por veículo, com exportação em CSV, Excel e PDF.",
      },
      { property: "og:title", content: "Relatórios avançados — FrotaGov" },
      { property: "og:description", content: "Consolide custos, consumo e utilização da frota e exporte os resultados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Relatorios,
});

const REPORTS = [
  { value: "frota", label: "Frota — situação dos veículos" },
  { value: "abastecimento", label: "Abastecimentos por veículo" },
  { value: "manutencao", label: "Manutenções e custos" },
  { value: "utilizacao", label: "Utilização de veículos" },
  { value: "custo_veiculo", label: "Custo total por veículo" },
  { value: "contratos", label: "Contratos, empenhos e saldos" },
  { value: "legal", label: "Multas, sinistros e obrigações" },
  { value: "patrimonio", label: "Movimentação patrimonial" },
  { value: "diarias", label: "Diárias — requisições e comprovações" },
  { value: "limpeza", label: "Limpeza da frota" },
  { value: "cotas_servidor", label: "Cotas de combustível de servidor" },
  { value: "cred_capturas", label: "Credenciados — capturas operacionais" },
  { value: "cred_cartoes", label: "Credenciados — cartões virtuais e usos" },
  { value: "ofp", label: "Ordens de fornecimento de peças (OFP)" },
  { value: "estoque_mov", label: "Almoxarifado — movimentações de estoque" },
  { value: "estoque_saldo", label: "Almoxarifado — saldos por peça" },
  { value: "int_consumo", label: "Inteligência — consumo e eficiência por ativo" },
  { value: "int_ranking", label: "Inteligência — ranking de consumo" },
  { value: "int_desvios", label: "Inteligência — desvios e anomalias" },
  { value: "int_despesas", label: "Inteligência — evolução de despesas" },
  { value: "int_tco", label: "Inteligência — custo total por ativo (TCO)" },
  { value: "int_economicidade", label: "Inteligência — economicidade do ativo" },
] as const;

type ReportKey = (typeof REPORTS)[number]["value"];

/**
 * Filtros suportados por relatório. Um filtro só é habilitado quando a origem
 * de dados possui a coluna correspondente — nunca exibimos filtro que não filtra.
 */
const CAPS: Record<ReportKey, { date: boolean; unit: boolean; vehicle: boolean; driver: boolean }> = {
  frota: { date: false, unit: true, vehicle: true, driver: false },
  abastecimento: { date: true, unit: true, vehicle: true, driver: true },
  manutencao: { date: true, unit: true, vehicle: true, driver: false },
  utilizacao: { date: true, unit: true, vehicle: true, driver: true },
  custo_veiculo: { date: true, unit: true, vehicle: true, driver: false },
  contratos: { date: true, unit: false, vehicle: false, driver: false },
  legal: { date: true, unit: true, vehicle: true, driver: true },
  patrimonio: { date: true, unit: true, vehicle: true, driver: false },
  diarias: { date: true, unit: true, vehicle: false, driver: true },
  limpeza: { date: true, unit: true, vehicle: true, driver: false },
  cotas_servidor: { date: true, unit: true, vehicle: true, driver: false },
  cred_capturas: { date: true, unit: false, vehicle: true, driver: false },
  cred_cartoes: { date: false, unit: true, vehicle: true, driver: false },
  ofp: { date: true, unit: true, vehicle: true, driver: false },
  estoque_mov: { date: true, unit: false, vehicle: true, driver: false },
  estoque_saldo: { date: false, unit: false, vehicle: false, driver: false },
  int_consumo: { date: true, unit: true, vehicle: true, driver: true },
  int_ranking: { date: true, unit: true, vehicle: true, driver: true },
  int_desvios: { date: true, unit: true, vehicle: true, driver: true },
  int_despesas: { date: true, unit: true, vehicle: true, driver: false },
  int_tco: { date: true, unit: true, vehicle: true, driver: false },
  int_economicidade: { date: true, unit: true, vehicle: true, driver: false },
};


const LABELS: Record<string, string> = {
  data: "Data",
  veiculo: "Veículo",
  unidade: "Unidade",
  litros: "Litros",
  valor: "Valor (R$)",
  situacao: "Situação",
  codigo: "Código",
  tipo: "Tipo",
  fornecedor: "Fornecedor",
  entrada: "Entrada",
  saida: "Saída",
  retorno: "Retorno",
  condutor: "Condutor",
  km: "KM percorrido",
  combustivel: "Combustível (R$)",
  manutencao: "Manutenção (R$)",
  servicos: "Serviços de limpeza",
  nota: "Nota fiscal",
  total: "Total (R$)",
  placa: "Placa",
  patrimonio: "Patrimônio",
  marca: "Marca",
  modelo: "Modelo",
  ano: "Ano",
  hodometro: "Hodômetro",
  numero: "Número",
  objeto: "Objeto",
  vigencia: "Vigência",
  contratado: "Contratado",
  empenhado: "Empenhado (R$)",
  saldo: "Saldo (R$)",
  registro: "Registro",
  vencimento: "Vencimento",
  responsavel: "Responsável",
  origem: "Origem",
  destino: "Destino",
  movimento: "Movimento",
  pecas: "Peças (R$)",
  mao_obra: "Mão de obra (R$)",
  valor_inicial: "Valor inicial (R$)",
  entidade: "Entidade externa",
  documento: "Documento/ato",
  descricao: "Descrição",
  finalidade: "Finalidade",
  preco_litro: "Preço/litro (R$)",
  combustivel_tipo: "Combustível",
  beneficiario: "Beneficiário",
  quantidade: "Quantidade",
  valor_unitario: "Valor unitário (R$)",
  valor_total: "Valor total (R$)",
  comprovacao: "Comprovação",
  objeto_tipo: "Tipo de contrato",
  servidor: "Servidor",
  cpf: "CPF",
  matricula: "Matrícula",
  cargo: "Cargo",
  periodicidade: "Periodicidade",
  cota: "Cota por ciclo",
  consumido: "Consumido no período",
  propriedade: "Propriedade",
  credenciado: "Credenciado",
  autorizado: "Autorizado",
  realizado: "Realizado",
  diferenca: "Diferença devolvida",
  tempo_resposta: "Tempo de resposta",
  usos: "Usos do cartão",
  emissao: "Emissão",
  revogacao: "Revogação",
  almoxarifado: "Almoxarifado",
  lote: "Lote",
  reservado: "Reservado",
  itens: "Itens",
  atendido: "Quantidade atendida",
};

const label = (k: string) => LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ");

const firstDayOfYear = () => `${new Date().getFullYear()}-01-01`;
const today = () => new Date().toISOString().slice(0, 10);
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const PAGE_SIZE = 50;

function Relatorios() {
  const [report, setReport] = useState<ReportKey>("frota");
  const [from, setFrom] = useState(firstDayOfYear());
  const [to, setTo] = useState(today());
  const [unitId, setUnitId] = useState("todas");
  const [vehicleId, setVehicleId] = useState("todos");
  const [driverId, setDriverId] = useState("todos");
  const [objectKind, setObjectKind] = useState("todos");
  const [contractId, setContractId] = useState("todos");
  const [page, setPage] = useState(1);

  const { data: units = [] } = useUnits();
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const { data: org } = useOrganization();
  const { data: me } = useProfile();
  const { data: logoUrl } = useBrasaoUrl(org?.logo_url);
  const { data: objectKinds = [] } = useContractObjectKinds();
  const kindOptions = objectKinds.length
    ? objectKinds.map((k) => ({ value: k.code, label: k.label }))
    : CONTRACT_OBJECT_KIND_FALLBACK;

  const caps = CAPS[report];

  const { data, isLoading } = useQuery({
    queryKey: ["report", report, from, to, unitId, vehicleId, driverId, objectKind, contractId],
    queryFn: async (): Promise<Record<string, unknown>[]> => {
      const unit = caps.unit && unitId !== "todas" ? unitId : null;
      const vehicle = caps.vehicle && vehicleId !== "todos" ? vehicleId : null;
      const driver = caps.driver && driverId !== "todos" ? driverId : null;
      // Bloco 6.6 — quando um contrato específico é escolhido, os relatórios cruzam apenas os
      // consumos/execuções vinculados a ele.
      const contract = contractId !== "todos" ? contractId : null;
      const start = `${from}T00:00:00`;

      const end = `${to}T23:59:59`;

      /* ===== Fase 10 / Bloco 2 — relatórios de inteligência ===== */
      if (report.startsWith("int_")) {
        const [{ data: segRaw }, { data: costRaw }, { data: downRaw }, { data: paramsRaw }, { data: cfg }] =
          await Promise.all([
            supabase.rpc("fleet_consumption_segments", {
              _from: from,
              _to: to,
              ...(unit ? { _unit: unit } : {}),
              ...(vehicle ? { _vehicle: vehicle } : {}),
              ...(driver ? { _driver: driver } : {}),
            }),
            supabase.rpc("fleet_cost_rows", {
              _from: from,
              _to: to,
              ...(unit ? { _unit: unit } : {}),
              ...(vehicle ? { _vehicle: vehicle } : {}),
            }),
            supabase.rpc("fleet_downtime", { _from: from, _to: to }),
            supabase.from("consumption_parameters").select("*"),
            supabase.from("intelligence_settings").select("*").maybeSingle(),
          ]);

        const segments = (segRaw ?? []) as ConsumptionSegment[];
        const costRows = (costRaw ?? []) as CostRow[];
        const downtime = (downRaw ?? []) as DowntimeRow[];
        const params = paramsRaw ?? [];
        const byAsset = aggregateConsumption(segments, "ativo");
        const assetCosts = costsByAsset(costRows);
        const devMap = new Map<string, DeviationClass>();
        const expectedMap = new Map<string, number | null>();
        const pctMap = new Map<string, number | null>();
        for (const a of byAsset) {
          const metric = a.km > 0 ? "km_l" : "l_h";
          const p = matchParameter(
            params,
            { vehicleId: a.vehicleId, assetClass: a.assetClass, category: a.category, brand: a.brand, model: a.model },
            metric,
          );
          const { klass, deviationPct } = classifyDeviation(metric === "km_l" ? a.kmL : a.lH, p);
          devMap.set(a.key, klass);
          expectedMap.set(a.key, p ? Number(p.expected_value) : null);
          pctMap.set(a.key, deviationPct);
        }

        if (report === "int_consumo" || report === "int_ranking") {
          const rowsOut = byAsset.map((a) => ({
            ativo: a.label,
            tipo: a.assetClass === "equipamento" ? "Equipamento" : "Veículo",
            litros: formatNumberBR(a.liters, 2),
            km: formatNumberBR(a.km, 0),
            horas: formatNumberBR(a.hours, 1),
            km_l: a.kmL != null ? formatNumberBR(a.kmL, 2) : "—",
            l_h: a.lH != null ? formatNumberBR(a.lH, 2) : "—",
            esperado: expectedMap.get(a.key) != null ? formatNumberBR(expectedMap.get(a.key)!, 2) : "—",
            desvio: pctMap.get(a.key) != null ? `${pctMap.get(a.key)!.toFixed(1)}%` : "—",
            classificacao: DEVIATION_LABEL[devMap.get(a.key) ?? "sem_parametro"],
            gasto: formatMoney(a.value),
            trechos: a.segments,
            descartados: a.invalidSegments,
          }));
          if (report === "int_ranking") {
            return rowsOut
              .filter((r) => r.km_l !== "—" || r.l_h !== "—")
              .sort((a, b) => (parseBRNumber(b.km_l) ?? 0) - (parseBRNumber(a.km_l) ?? 0));
          }
          return rowsOut;
        }

        if (report === "int_desvios") {
          return detectAnomalies(segments, cfg ?? null).map((a) => ({
            data: dt(a.at),
            ativo: a.asset,
            ocorrencia: a.type,
            detalhe: a.detail,
            severidade: a.severity === "critico" ? "Crítico" : "Atenção",
          }));
        }

        if (report === "int_despesas") {
          return costsByMonth(costRows).map((m) => {
            const row: Record<string, unknown> = { competencia: monthLabel(m.competencia) };
            for (const c of COST_CATEGORIES) row[c.value] = formatMoney(catValue(m.totals, c.value));
            row["total"] = formatMoney(m.totals.total);
            return row;
          });
        }

        if (report === "int_tco") {
          const totalFrota = assetCosts.reduce((s2, a) => s2 + a.totals.total, 0);
          return assetCosts.map((a) => {
            const cons = byAsset.find((c) => c.vehicleId === a.vehicleId);
            const row: Record<string, unknown> = { ativo: a.label, unidade: a.unitName ?? "—" };
            for (const c of COST_CATEGORIES) row[c.value] = formatMoney(catValue(a.totals, c.value));
            row["total"] = formatMoney(a.totals.total);
            row["km"] = formatNumberBR(cons?.km ?? 0, 0);
            row["horas"] = formatNumberBR(cons?.hours ?? 0, 1);
            row["custo_km"] = cons?.km ? formatMoney(a.totals.total / cons.km) : "—";
            row["custo_hora"] = cons?.hours ? formatMoney(a.totals.total / cons.hours) : "—";
            row["participacao"] = totalFrota ? `${((a.totals.total / totalFrota) * 100).toFixed(1)}%` : "—";
            return row;
          });
        }

        return economicity({
          costs: assetCosts,
          consumption: byAsset,
          downtime,
          vehicles,
          deviations: devMap,
          periodDays: periodDays(from, to),
        }).map((e) => ({
          ativo: e.label,
          idade: e.ageYears != null ? formatNumberBR(e.ageYears, 1) : "—",
          aquisicao: e.acquisitionValue ? formatMoney(e.acquisitionValue) : "—",
          custo_periodo: formatMoney(e.periodCost),
          manutencao: formatMoney(e.maintenanceCost),
          custo_km: e.costPerKm != null ? formatMoney(e.costPerKm) : "—",
          custo_hora: e.costPerHour != null ? formatMoney(e.costPerHour) : "—",
          indisponibilidade: formatNumberBR(e.downtimeDays, 1),
          consumo: DEVIATION_LABEL[e.deviation],
          pontuacao: formatNumberBR(e.score, 0),
          classificacao: ECONOMICITY_LABEL[e.klass],
          fatores: e.reasons.join(" ") || "Sem fatores relevantes.",
        }));
      }

      if (report === "frota") {
        let q = supabase
          .from("vehicles")
          .select(
            "id, plate, asset_code, brand, model, year_model, status, current_km, is_private_server_vehicle, unit:units(name)",
          )
          .order("asset_code");
        if (unit) q = q.eq("unit_id", unit);
        if (vehicle) q = q.eq("id", vehicle);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((v) => ({
          placa: v.plate ?? "—",
          patrimonio: v.asset_code ?? "—",
          marca: v.brand ?? "—",
          modelo: v.model ?? "—",
          ano: v.year_model ?? "—",
          unidade: v.unit?.name ?? "—",
          propriedade: v.is_private_server_vehicle ? "Particular de servidor (cota)" : "Frota oficial",
          hodometro: v.current_km ?? "—",
          situacao: v.status,
        }));
      }

      if (report === "abastecimento" || report === "custo_veiculo") {
        let q = supabase
          .from("fuelings")
          .select(
            "id, fueled_at, quantity, unit_price, total_value, status, odometer_km, vehicle:vehicles(id, plate, asset_code), unit:units(name), driver:drivers(full_name), fuel_type:fuel_types(name, category), supplier:suppliers(trade_name, legal_name)",
          )
          .gte("fueled_at", start)
          .lte("fueled_at", end)
          .order("fueled_at", { ascending: false });
        if (unit) q = q.eq("unit_id", unit);
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        if (driver) q = q.eq("driver_id", driver);
        if (contract) q = q.eq("contract_id", contract);
        const { data: fuelings, error } = await q;
        if (error) throw error;

        if (report === "abastecimento") {
          return (fuelings ?? []).map((f) => ({
            data: new Date(f.fueled_at).toLocaleDateString("pt-BR"),
            veiculo: f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—",
            unidade: f.unit?.name ?? "—",
            condutor: f.driver?.full_name ?? "—",
            combustivel_tipo: f.fuel_type?.name ?? "—",
            fornecedor: f.supplier?.trade_name ?? f.supplier?.legal_name ?? "—",
            hodometro: f.odometer_km ?? "—",
            litros: formatLiters(f.quantity),
            preco_litro: formatMoney(f.unit_price),
            valor: formatMoney(f.total_value),
            situacao: f.status,
          }));
        }

        let mq = supabase
          .from("maintenance_records")
          .select("id, total_value, vehicle:vehicles(id, plate, asset_code), unit:units(name), entry_at")
          .gte("entry_at", start)
          .lte("entry_at", end);
        if (unit) mq = mq.eq("unit_id", unit);
        if (vehicle) mq = mq.eq("vehicle_id", vehicle);
        if (contract) mq = mq.eq("contract_id", contract);
        const { data: maints } = await mq;

        type Acc = { veiculo: string; unidade: string; litros: number; combustivel: number; manutencao: number };
        const acc = new Map<string, Acc>();
        const blank = (veiculo: string, unidade: string): Acc => ({
          veiculo,
          unidade,
          litros: 0,
          combustivel: 0,
          manutencao: 0,
        });
        for (const f of fuelings ?? []) {
          if (f.status === "cancelado") continue;
          const key = f.vehicle?.id ?? "—";
          const row =
            acc.get(key) ?? blank(f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—", f.unit?.name ?? "—");
          // Óleos, fluidos e aditivos não entram no total de litros de combustível.
          if ((f.fuel_type?.category ?? "combustivel") === "combustivel") row.litros += Number(f.quantity ?? 0);
          row.combustivel += Number(f.total_value ?? 0);
          acc.set(key, row);
        }
        for (const m of maints ?? []) {
          const key = m.vehicle?.id ?? "—";
          const row =
            acc.get(key) ?? blank(m.vehicle?.plate ?? m.vehicle?.asset_code ?? "—", m.unit?.name ?? "—");
          row.manutencao += Number(m.total_value ?? 0);
          acc.set(key, row);
        }
        return Array.from(acc.values())
          .sort((a, b) => b.combustivel + b.manutencao - (a.combustivel + a.manutencao))
          .map((r) => ({
            veiculo: r.veiculo,
            unidade: r.unidade,
            litros: formatLiters(r.litros),
            combustivel: formatMoney(r.combustivel),
            manutencao: formatMoney(r.manutencao),
            total: formatMoney(r.combustivel + r.manutencao),
          }));
      }


      if (report === "manutencao") {
        let q = supabase
          .from("maintenance_records")
          .select(
            "id, code, kind, status, entry_at, exit_at, total_value, parts_value, labor_value, odometer_km, vehicle:vehicles(plate, asset_code), unit:units(name), supplier:suppliers(trade_name, legal_name)",
          )
          .gte("entry_at", start)
          .lte("entry_at", end)
          .order("entry_at", { ascending: false });
        if (unit) q = q.eq("unit_id", unit);
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        if (contract) q = q.eq("contract_id", contract);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((m) => ({
          codigo: m.code ?? "—",
          veiculo: m.vehicle?.plate ?? m.vehicle?.asset_code ?? "—",
          unidade: m.unit?.name ?? "—",
          tipo: m.kind,
          fornecedor: m.supplier?.trade_name ?? m.supplier?.legal_name ?? "—",
          entrada: day(m.entry_at),
          saida: day(m.exit_at),
          hodometro: m.odometer_km ?? "—",
          pecas: formatMoney(m.parts_value),
          mao_obra: formatMoney(m.labor_value),
          valor: formatMoney(m.total_value),
          situacao: m.status,
        }));
      }

      if (report === "limpeza") {
        let q = supabase
          .from("vehicle_cleanings")
          .select(
            "id, code, status, performed_at, odometer_km, total_value, invoice_number, service_types, vehicle:vehicles(plate, asset_code), unit:units(name), supplier:suppliers(trade_name, legal_name)",
          )
          .gte("performed_at", start)
          .lte("performed_at", end)
          .order("performed_at", { ascending: false });
        if (unit) q = q.eq("unit_id", unit);
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        if (contract) q = q.eq("contract_id", contract);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((c) => ({
          codigo: c.code ?? "—",
          veiculo: c.vehicle?.plate ?? c.vehicle?.asset_code ?? "—",
          unidade: c.unit?.name ?? "—",
          data: day(c.performed_at),
          servicos: (c.service_types ?? []).join(", ") || "—",
          fornecedor: c.supplier?.trade_name ?? c.supplier?.legal_name ?? "—",
          hodometro: c.odometer_km ?? "—",
          nota: c.invoice_number ?? "—",
          valor: formatMoney(c.total_value),
          situacao: c.status,
        }));
      }

      if (report === "contratos") {
        // Contratos não possuem unidade: filtramos pela vigência que intersecta o período.
        let cq = supabase
          .from("contracts")
          .select(
            "id, number, object, object_kind, modality, status, valid_from, valid_to, initial_value, current_value, supplier:suppliers(trade_name, legal_name)",
          )
          .lte("valid_from", to)
          .or(`valid_to.is.null,valid_to.gte.${from}`)
          .order("valid_from", { ascending: false });
        if (objectKind !== "todos") cq = cq.eq("object_kind", objectKind);
        if (contract) cq = cq.eq("id", contract);
        const { data: contracts, error } = await cq;
        if (error) throw error;
        const { data: commitments } = await supabase
          .from("commitments")
          .select("contract_id, committed_value, available_value");
        return (contracts ?? []).map((c) => {
          const mine = (commitments ?? []).filter((k) => k.contract_id === c.id);
          const empenhado = mine.reduce((s, k) => s + Number(k.committed_value ?? 0), 0);
          const saldo = mine.reduce((s, k) => s + Number(k.available_value ?? 0), 0);
          return {
            numero: c.number ?? "—",
            objeto_tipo: objectKindLabel(c.object_kind, objectKinds),
            objeto: c.object ?? "—",
            contratado: c.supplier?.trade_name ?? c.supplier?.legal_name ?? "—",
            tipo: c.modality ?? "—",
            vigencia: `${day(c.valid_from)} a ${day(c.valid_to)}`,
            valor_inicial: formatMoney(c.initial_value),
            valor: formatMoney(c.current_value),
            empenhado: formatMoney(empenhado),
            saldo: formatMoney(saldo),
            situacao: c.status,
          };
        });
      }

      if (report === "cotas_servidor") {
        let qq = supabase
          .from("server_fuel_quotas")
          .select(
            "id, beneficiary_name, beneficiary_cpf, registration_code, job_title, period, quota_quantity, quota_value, start_date, end_date, status, vehicle:vehicles(id, plate, asset_code), unit:units(name), fuel:fuel_types(name)",
          )
          .order("beneficiary_name");
        if (unit) qq = qq.eq("unit_id", unit);
        if (vehicle) qq = qq.eq("vehicle_id", vehicle);
        const { data: quotas, error } = await qq;
        if (error) throw error;

        let fq = supabase
          .from("fuelings")
          .select("server_quota_id, quantity, total_value, fueled_at, status")
          .not("server_quota_id", "is", null)
          .eq("status", "valido")
          .gte("fueled_at", start)
          .lte("fueled_at", end);
        if (vehicle) fq = fq.eq("vehicle_id", vehicle);
        const { data: consumo } = await fq;

        return (quotas ?? []).map((q) => {
          const mine = (consumo ?? []).filter((f) => f.server_quota_id === q.id);
          const litros = mine.reduce((s2, f) => s2 + Number(f.quantity ?? 0), 0);
          const valor = mine.reduce((s2, f) => s2 + Number(f.total_value ?? 0), 0);
          return {
            servidor: q.beneficiary_name,
            cpf: formatCPF(q.beneficiary_cpf),
            matricula: q.registration_code ?? "—",
            cargo: q.job_title ?? "—",
            veiculo: q.vehicle?.plate ?? q.vehicle?.asset_code ?? "—",
            unidade: q.unit?.name ?? "—",
            combustivel_tipo: q.fuel?.name ?? "Qualquer",
            periodicidade: q.period === "semanal" ? "Semanal" : "Mensal",
            cota: `${Number(q.quota_quantity ?? 0).toLocaleString("pt-BR")} L`,
            consumido: `${litros.toLocaleString("pt-BR")} L`,
            valor: formatMoney(valor),
            vigencia: `${day(q.start_date)} a ${q.end_date ? day(q.end_date) : "indeterminado"}`,
            situacao: q.status,
          };
        });
      }

      if (report === "legal") {
        // Obrigações legais não têm unidade/condutor próprios: quando o usuário
        // filtra por unidade, restringimos pelos veículos daquela unidade.
        const unitVehicleIds = unit
          ? vehicles.filter((v) => v.unit_id === unit).map((v) => v.id)
          : null;

        let fq = supabase
          .from("traffic_fines")
          .select(
            "code, occurred_at, status, amount, description, vehicle:vehicles(plate, asset_code), unit:units(name), driver:drivers(full_name)",
          )
          .gte("occurred_at", start)
          .lte("occurred_at", end);
        if (unit) fq = fq.eq("unit_id", unit);
        if (vehicle) fq = fq.eq("vehicle_id", vehicle);
        if (driver) fq = fq.eq("driver_id", driver);

        let aq = supabase
          .from("accidents")
          .select(
            "code, occurred_at, status, expenses_value, description, vehicle:vehicles(plate, asset_code), unit:units(name), driver:drivers(full_name)",
          )
          .gte("occurred_at", start)
          .lte("occurred_at", end);
        if (unit) aq = aq.eq("unit_id", unit);
        if (vehicle) aq = aq.eq("vehicle_id", vehicle);
        if (driver) aq = aq.eq("driver_id", driver);

        let oq = supabase
          .from("vehicle_obligations")
          .select("obligation_type, due_date, status, amount, notes, vehicle:vehicles(plate, asset_code, unit:units(name))")
          .gte("due_date", from)
          .lte("due_date", to);
        if (vehicle) oq = oq.eq("vehicle_id", vehicle);
        if (unitVehicleIds) oq = oq.in("vehicle_id", unitVehicleIds.length ? unitVehicleIds : [""]);

        // Obrigações não são atribuíveis a condutor — omitidas quando há filtro de condutor.
        const [fines, accidents, obligations] = await Promise.all([
          fq,
          aq,
          driver ? Promise.resolve({ data: [] as never[] }) : oq,
        ]);

        const rows: Record<string, unknown>[] = [];
        for (const f of fines.data ?? [])
          rows.push({
            registro: "Multa",
            codigo: f.code ?? "—",
            veiculo: f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—",
            unidade: f.unit?.name ?? "—",
            responsavel: f.driver?.full_name ?? "—",
            descricao: f.description ?? "—",
            data: day(f.occurred_at),
            valor: formatMoney(f.amount),
            situacao: f.status,
          });
        for (const a of accidents.data ?? [])
          rows.push({
            registro: "Sinistro",
            codigo: a.code ?? "—",
            veiculo: a.vehicle?.plate ?? a.vehicle?.asset_code ?? "—",
            unidade: a.unit?.name ?? "—",
            responsavel: a.driver?.full_name ?? "—",
            descricao: a.description ?? "—",
            data: day(a.occurred_at),
            valor: formatMoney(a.expenses_value),
            situacao: a.status,
          });
        for (const o of obligations.data ?? [])
          rows.push({
            registro: "Obrigação legal",
            codigo: o.obligation_type ?? "—",
            veiculo: o.vehicle?.plate ?? o.vehicle?.asset_code ?? "—",
            unidade: o.vehicle?.unit?.name ?? "—",
            responsavel: "—",
            descricao: o.notes ?? "—",
            data: day(o.due_date),
            valor: formatMoney(o.amount),
            situacao: o.status,
          });
        return rows.sort((a, b) => String(a['data']).localeCompare(String(b['data'])));
      }

      if (report === "diarias") {
        let q = supabase
          .from("diaries")
          .select(
            "code, beneficiary_name, destination_city, destination_state, departure_at, return_at, quantity, unit_value, total_value, status, unit:units(name), proofs:diary_proofs(status, balance_value)",
          )
          .gte("departure_at", start)
          .lte("departure_at", end)
          .order("departure_at", { ascending: false });
        if (unit) q = q.eq("unit_id", unit);
        if (driver) q = q.eq("beneficiary_driver_id", driver);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((d) => {
          const proofs = (d.proofs ?? []) as { status: string; balance_value: number }[];
          const approved = proofs.find((pr) => pr.status === "aprovada");
          return {
            codigo: d.code ?? "—",
            beneficiario: d.beneficiary_name,
            unidade: d.unit?.name ?? "—",
            destino: [d.destination_city, d.destination_state].filter(Boolean).join("/"),
            saida: dt(d.departure_at),
            retorno: d.return_at ? dt(d.return_at) : "—",
            quantidade: formatNumberBR(d.quantity, 2),
            valor_unitario: formatMoney(d.unit_value),
            valor_total: formatMoney(d.total_value),
            situacao: DIARY_STATUS[d.status as keyof typeof DIARY_STATUS] ?? d.status,
            comprovacao: approved
              ? `Aprovada (saldo ${formatMoney(Math.abs(Number(approved.balance_value)))})`
              : proofs.length
                ? "Em prestação de contas"
                : "Sem comprovação",
          };
        });
      }

      if (report === "patrimonio") {
        let q = supabase
          .from("asset_movements")
          .select(
            "code, kind, moved_on, from_unit_id, unit_id, to_status, act_number, notes, vehicle:vehicles(plate, asset_code), entity:external_entities!asset_movements_entity_id_fkey(name)",
          )
          .gte("moved_on", from)
          .lte("moved_on", to)
          .order("moved_on", { ascending: false });
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        if (unit) q = q.or(`unit_id.eq.${unit},from_unit_id.eq.${unit}`);
        const { data: rows, error } = await q;
        if (error) throw error;
        const unitName = (id?: string | null) => units.find((u) => u.id === id)?.name ?? "—";
        return (rows ?? []).map((m) => ({
          codigo: m.code ?? "—",
          veiculo: m.vehicle?.plate ?? m.vehicle?.asset_code ?? "—",
          movimento: m.kind,
          data: day(m.moved_on),
          origem: unitName(m.from_unit_id),
          destino: unitName(m.unit_id),
          entidade: m.entity?.name ?? "—",
          documento: m.act_number ?? "—",
          situacao: m.to_status ?? "—",
        }));
      }

      /* ===== Fase 10 / Bloco 3 — portal do credenciado ===== */
      if (report === "cred_capturas") {
        let q = supabase
          .from("partner_captures")
          .select(
            "captured_at, kind, status, authorized_quantity, captured_quantity, authorized_value, captured_value, document_number, response_minutes, ip, partner:accredited_partners(trade_name, legal_name, cnpj), vehicle:vehicles(plate, asset_code)",
          )
          .gte("captured_at", start)
          .lte("captured_at", end)
          .order("captured_at", { ascending: false });
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((c) => {
          const aq = c.authorized_quantity == null ? null : Number(c.authorized_quantity);
          const cq = c.captured_quantity == null ? null : Number(c.captured_quantity);
          return {
            data: dt(c.captured_at),
            credenciado: c.partner?.trade_name ?? c.partner?.legal_name ?? "—",
            cnpj: c.partner?.cnpj ?? "—",
            tipo: c.kind,
            veiculo: c.vehicle?.plate ?? c.vehicle?.asset_code ?? "—",
            documento: c.document_number ?? "—",
            autorizado: aq != null ? formatNumberBR(aq, 4) : "—",
            realizado: cq != null ? formatNumberBR(cq, 4) : "—",
            diferenca: aq != null && cq != null ? formatNumberBR(aq - cq, 4) : "—",
            valor: formatMoney(c.captured_value),
            tempo_resposta: c.response_minutes != null ? `${c.response_minutes} min` : "—",
            situacao: c.status,
          };
        });
      }

      if (report === "cred_cartoes") {
        let q = supabase
          .from("asset_cards")
          .select(
            "code, status, issued_at, revoked_at, revoke_reason, uses_count, vehicle:vehicles(plate, asset_code, unit_id, unit:units(name))",
          )
          .order("issued_at", { ascending: false });
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? [])
          .filter((c) => !unit || c.vehicle?.unit_id === unit)
          .map((c) => ({
            codigo: c.code,
            veiculo: c.vehicle?.plate ?? c.vehicle?.asset_code ?? "—",
            unidade: c.vehicle?.unit?.name ?? "—",
            emissao: dt(c.issued_at),
            situacao: c.status,
            usos: c.uses_count ?? 0,
            revogacao: c.revoked_at ? dt(c.revoked_at) : "—",
            descricao: c.revoke_reason ?? "—",
          }));
      }

      /* ===== Fase 10 / Bloco 4 — OFP e almoxarifado ===== */
      if (report === "ofp") {
        let q = supabase
          .from("supply_orders")
          .select(
            "code, status, issued_at, deadline_at, delivered_at, max_value, reserved_value, consumed_value, expense_origin, requester_name, unit:units(name), vehicle:vehicles(plate, asset_code), supplier:suppliers(trade_name, legal_name), items:supply_order_items(quantity, delivered_quantity)",
          )
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false });
        if (unit) q = q.eq("unit_id", unit);
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((o) => {
          const items = (o.items ?? []) as { quantity: number; delivered_quantity: number | null }[];
          const qt = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
          const dl = items.reduce((s, i) => s + Number(i.delivered_quantity ?? 0), 0);
          return {
            codigo: o.code,
            unidade: o.unit?.name ?? "—",
            veiculo: o.vehicle?.plate ?? o.vehicle?.asset_code ?? "—",
            fornecedor: o.supplier?.trade_name ?? o.supplier?.legal_name ?? "—",
            responsavel: o.requester_name ?? "—",
            origem: o.expense_origin ?? "—",
            emissao: o.issued_at ? dt(o.issued_at) : "—",
            vencimento: o.deadline_at ? dt(o.deadline_at) : "—",
            itens: items.length,
            quantidade: formatNumberBR(qt, 2),
            atendido: formatNumberBR(dl, 2),
            valor: formatMoney(o.max_value),
            total: formatMoney(o.consumed_value),
            situacao: o.status,
          };
        });
      }

      if (report === "estoque_mov") {
        let q = supabase
          .from("stock_movements")
          .select(
            "occurred_at, kind, quantity, unit_value, total_value, lot, document_number, expense_origin, reason, warehouse:warehouses!stock_movements_warehouse_id_fkey(name), part:parts_catalog(internal_code, reference, description, measure_unit), vehicle:vehicles(plate, asset_code)",
          )
          .gte("occurred_at", start)
          .lte("occurred_at", end)
          .order("occurred_at", { ascending: false });
        if (vehicle) q = q.eq("vehicle_id", vehicle);
        const { data: rows, error } = await q;
        if (error) throw error;
        return (rows ?? []).map((m) => ({
          data: dt(m.occurred_at),
          almoxarifado: m.warehouse?.name ?? "—",
          movimento: m.kind,
          codigo: m.part?.internal_code ?? m.part?.reference ?? "—",
          descricao: m.part?.description ?? "—",
          lote: m.lot ?? "—",
          quantidade: formatNumberBR(m.quantity, 4),
          valor_unitario: formatMoney(m.unit_value),
          total: formatMoney(m.total_value),
          veiculo: m.vehicle?.plate ?? m.vehicle?.asset_code ?? "—",
          origem: m.expense_origin ?? "—",
          documento: m.document_number ?? m.reason ?? "—",
        }));
      }

      if (report === "estoque_saldo") {
        const { data: rows, error } = await supabase
          .from("stock_balances")
          .select(
            "quantity, reserved_quantity, average_cost, min_quantity, lot, location, last_movement_at, warehouse:warehouses(name), part:parts_catalog(internal_code, reference, description, measure_unit)",
          )
          .order("quantity", { ascending: false });
        if (error) throw error;
        return (rows ?? []).map((b) => {
          const qt = Number(b.quantity ?? 0);
          const rv = Number(b.reserved_quantity ?? 0);
          const min = b.min_quantity == null ? null : Number(b.min_quantity);
          return {
            almoxarifado: b.warehouse?.name ?? "—",
            codigo: b.part?.internal_code ?? b.part?.reference ?? "—",
            descricao: b.part?.description ?? "—",
            lote: b.lot ?? "—",
            quantidade: formatNumberBR(qt, 4),
            reservado: formatNumberBR(rv, 4),
            saldo: formatNumberBR(qt - rv, 4),
            valor_unitario: formatMoney(b.average_cost),
            total: formatMoney(qt * Number(b.average_cost ?? 0)),
            situacao: min != null && qt - rv <= min ? "Abaixo do mínimo" : "Regular",
            data: b.last_movement_at ? dt(b.last_movement_at) : "—",
          };
        });
      }


      let q = supabase
        .from("vehicle_usages")
        .select(
          "id, code, status, planned_departure, actual_departure, actual_return, start_km, end_km, purpose, destination, vehicle:vehicles(plate, asset_code), driver:drivers(full_name), unit:units(name)",
        )
        .gte("planned_departure", start)
        .lte("planned_departure", end)
        .order("planned_departure", { ascending: false });
      if (unit) q = q.eq("unit_id", unit);
      if (vehicle) q = q.eq("vehicle_id", vehicle);
      if (driver) q = q.eq("driver_id", driver);
      const { data: rows, error } = await q;
      if (error) throw error;
      return (rows ?? []).map((u) => ({
        codigo: u.code ?? "—",
        veiculo: u.vehicle?.plate ?? u.vehicle?.asset_code ?? "—",
        condutor: u.driver?.full_name ?? "—",
        unidade: u.unit?.name ?? "—",
        finalidade: u.purpose ?? "—",
        destino: u.destination ?? "—",
        saida: new Date(u.actual_departure ?? u.planned_departure).toLocaleString("pt-BR"),
        retorno: u.actual_return ? new Date(u.actual_return).toLocaleString("pt-BR") : "—",
        km: u.start_km != null && u.end_km != null ? String(Number(u.end_km) - Number(u.start_km)) : "—",
        situacao: u.status,
      }));
    },
  });

  const rows = useMemo(() => data ?? [], [data]);
  const columns = useMemo(() => {
    const first = rows[0];
    if (!first) return [] as { key: string; label: string }[];
    return Object.keys(first).map((k) => ({ key: k, label: label(k) }));
  }, [rows]);

  useEffect(() => setPage(1), [report, from, to, unitId, vehicleId, driverId, objectKind, contractId]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const reportLabel = REPORTS.find((r) => r.value === report)?.label ?? "Relatório";
  const usesDate = caps.date;

  const unitName = unitId === "todas" ? "Todas" : (units.find((u) => u.id === unitId)?.name ?? "—");
  const vehicleName =
    vehicleId === "todos"
      ? "Todos"
      : (vehicles.find((v) => v.id === vehicleId)?.plate ??
        vehicles.find((v) => v.id === vehicleId)?.asset_code ??
        "—");
  const driverName = driverId === "todos" ? "Todos" : (drivers.find((d) => d.id === driverId)?.full_name ?? "—");
  const periodText = usesDate ? `${day(from)} a ${day(to)}` : "Posição atual";
  const issuedBy = [me?.profile?.full_name, me?.email].filter(Boolean).join(" — ") || "—";

  const filters = [
    { label: "Veículo", value: caps.vehicle ? vehicleName : "Não se aplica" },
    { label: "Condutor", value: caps.driver ? driverName : "Não se aplica" },
    {
      label: "Tipo de contrato",
      value:
        report !== "contratos"
          ? "Não se aplica"
          : objectKind === "todos"
            ? "Todos"
            : objectKindLabel(objectKind, objectKinds),
    },
  ];

  const meta: ReportMeta = {
    title: reportLabel,
    organization: org?.legal_name ?? "FrotaGov",
    logoUrl: logoUrl ?? null,
    subtitle: org?.short_name ?? null,
    unit: caps.unit ? unitName : "Não se aplica",
    period: periodText,
    issuedBy,
    filters,
  };

  async function handleExport(kind: "csv" | "xlsx" | "pdf") {
    const name = `relatorio-${report}-${from}-a-${to}`;
    if (kind === "csv") exportReportCsv(name, columns, rows, meta);
    else if (kind === "xlsx") exportXlsx(name, columns, rows, reportLabel.slice(0, 28), meta);
    else printReport(meta, columns, rows);
    await logEvent({
      eventType: "exportacao",
      area: "Relatórios",
      screen: "Relatórios avançados",
      route: "/relatorios",
      action: kind.toUpperCase(),
      summary: `Exportação do relatório "${reportLabel}" (${rows.length} linhas) — unidade: ${meta.unit}, período: ${periodText}`,
    });
  }


  return (
    <>
      <PageHeader
        title="Relatórios avançados"
        description="Consolidação gerencial por período, unidade e veículo, com exportação em CSV, Excel (.xlsx) e impressão/PDF."
      />

      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Relatório</Label>
          <Select value={report} onValueChange={(v) => setReport(v as ReportKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORTS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>De</Label>
          <Input type="date" value={from} disabled={!usesDate} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Até</Label>
          <Input type="date" value={to} disabled={!usesDate} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Secretaria / unidade</Label>
          <Select value={unitId} onValueChange={setUnitId} disabled={!caps.unit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Veículo</Label>
          <Select value={vehicleId} onValueChange={setVehicleId} disabled={!caps.vehicle}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.plate ?? v.asset_code ?? v.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Condutor / motorista</Label>
          <Select value={driverId} onValueChange={setDriverId} disabled={!caps.driver}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Objeto do contrato</Label>
          <Select value={objectKind} onValueChange={setObjectKind} disabled={report !== "contratos"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {kindOptions.map((k) => (
                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">
          Filtros desabilitados não se aplicam ao relatório selecionado.
        </p>
      </div>

      {/* Cabeçalho institucional — idêntico ao usado na impressão/PDF e nas exportações */}
      <div className="mb-4 rounded-lg border bg-card p-4 shadow-card">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt={`Brasão de ${meta.organization}`} className="size-14 shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide">{meta.organization}</p>
            {meta.subtitle ? <p className="text-xs text-muted-foreground">{meta.subtitle}</p> : null}
            <h2 className="mt-1 text-base font-semibold text-foreground">{reportLabel}</h2>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="inline font-medium">Secretaria/unidade: </dt><dd className="inline">{meta.unit}</dd></div>
              <div><dt className="inline font-medium">Período: </dt><dd className="inline">{periodText}</dd></div>
              {filters.map((f) => (
                <div key={f.label}>
                  <dt className="inline font-medium">{f.label}: </dt>
                  <dd className="inline">{f.value}</dd>
                </div>
              ))}
              <div><dt className="inline font-medium">Emitido em: </dt><dd className="inline">{new Date().toLocaleString("pt-BR")}</dd></div>
              <div><dt className="inline font-medium">Emitido por: </dt><dd className="inline">{issuedBy}</dd></div>
              <div><dt className="inline font-medium">Total de registros: </dt><dd className="inline">{rows.length}</dd></div>
            </dl>
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileBarChart className="size-4" /> {rows.length} linha(s)
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => handleExport("csv")}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => handleExport("xlsx")}>
            <Download className="size-4" /> Excel (.xlsx)
          </Button>
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => handleExport("pdf")}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>


      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
              {columns.length === 0 && <TableHead>Resultado</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={Math.max(1, columns.length)} className="py-10 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={Math.max(1, columns.length)} className="py-10 text-center text-muted-foreground">
                  Nenhum dado para os filtros informados.
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className="text-sm">
                    {String(r[c.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {rows.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
