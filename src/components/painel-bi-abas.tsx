/**
 * Gráficos (BI) das abas Abastecimento, Manutenção, Financeiro e Administrativo do Dashboard.
 * Usam os mesmos dados já carregados pelo restante do sistema.
 */
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  BI_COLORS,
  BI_PIE,
  ChartCard,
  EmptyChart,
  GRID,
  axisMoney,
  humanize,
  money,
  monthKey,
  monthKeys,
  monthLabel,
  topBy,
} from "@/components/bi-common";
import { formatNumberBR } from "@/lib/format";
import {
  cnhState,
  contractTotals,
  daysUntil,
  maintenanceTotal,
  onlyFuelRows,
  quotaPercent,
  useCommitments,
  useContracts,
  useDrivers,
  useFuelTypes,
  useFuelings,
  useMaintenanceRecords,
  useQuotas,
  useServiceOrders,
  useTrafficFines,
  useVehicleObligations,
  useAccidents,
  useVehicles,
} from "@/lib/frotagov";
import { useDiaries } from "@/lib/diarias";

const grid = "grid gap-4 lg:grid-cols-2 min-[1700px]:grid-cols-3";

function PieBox({ data }: { data: { name: string; value: number }[] }) {
  const list = data.filter((d) => d.value > 0);
  if (list.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={list} dataKey="value" nameKey="name" outerRadius={95} label={(e) => e.name}>
          {list.map((_, i) => (
            <Cell key={i} fill={BI_PIE[i % BI_PIE.length]!} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function HBar({
  data,
  color = BI_COLORS.navy,
  money: isMoney = true,
  label = "Valor",
}: {
  data: { name: string; value: number }[];
  color?: string;
  money?: boolean;
  label?: string;
}) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis type="number" fontSize={12} tickFormatter={isMoney ? axisMoney : (v) => String(v)} />
        <YAxis type="category" dataKey="name" fontSize={12} width={100} />
        <Tooltip formatter={isMoney ? money : (v) => String(v)} />
        <Bar dataKey="value" name={label} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MonthBar({
  data,
  keyName,
  color = BI_COLORS.navy,
  label,
  isMoney = true,
}: {
  data: { mes: string }[];
  keyName: string;
  color?: string;
  label: string;
  isMoney?: boolean;
}) {
  if (data.every((d) => Number((d as Record<string, unknown>)[keyName]) === 0))
    return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="mes" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={isMoney ? axisMoney : (v) => String(v)} />
        <Tooltip formatter={isMoney ? money : (v) => formatNumberBR(Number(v), 0)} />
        <Bar dataKey={keyName} name={label} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------ Abastecimento ------------------------------ */

export function BiAbastecimento({ months }: { months: number }) {
  const { data: fuelings = [] } = useFuelings();
  const { data: products = [] } = useFuelTypes();
  const { data: drivers = [] } = useDrivers();

  const v = useMemo(() => {
    const keys = monthKeys(months);
    const valid = fuelings.filter(
      (f) => f.status === "valido" && keys.includes(monthKey(f.fueled_at)),
    );
    const fuelRows = onlyFuelRows(valid, products);
    const monthly = keys.map((k) => {
      const list = valid.filter((f) => monthKey(f.fueled_at) === k);
      const fl = fuelRows.filter((f) => monthKey(f.fueled_at) === k);
      const litros = fl.reduce((s, f) => s + Number(f.quantity ?? 0), 0);
      const valorFuel = fl.reduce((s, f) => s + Number(f.total_value ?? 0), 0);
      return {
        mes: monthLabel(k),
        litros: Math.round(litros * 100) / 100,
        gasto: list.reduce((s, f) => s + Number(f.total_value ?? 0), 0),
        preco: litros > 0 ? Number((valorFuel / litros).toFixed(3)) : null,
      };
    });
    const porCombustivel = topBy(
      valid,
      (f) => f.fuel?.name ?? "Sem produto",
      (f) => Number(f.total_value ?? 0),
      6,
    );
    const topVeic = topBy(
      valid,
      (f) => f.vehicle?.plate ?? f.vehicle?.asset_code ?? "—",
      (f) => Number(f.total_value ?? 0),
      10,
    );
    const cnh: Record<string, number> = { ok: 0, a_vencer: 0, vencida: 0, sem_registro: 0 };
    for (const d of drivers.filter((x) => x.active))
      cnh[cnhState(d.license_expiry)] = (cnh[cnhState(d.license_expiry)] ?? 0) + 1;
    const cnhData = [
      { name: "Em dia", value: cnh["ok"] ?? 0 },
      { name: "A vencer (30 dias)", value: cnh["a_vencer"] ?? 0 },
      { name: "Vencida", value: cnh["vencida"] ?? 0 },
      { name: "Sem registro", value: cnh["sem_registro"] ?? 0 },
    ];
    return { monthly, porCombustivel, topVeic, cnhData };
  }, [fuelings, products, drivers, months]);

  return (
    <div className={`${grid} mt-6`}>
      <ChartCard title="Gasto com abastecimento por mês" helpKey="custoMes">
        <MonthBar data={v.monthly} keyName="gasto" label="Gasto" />
      </ChartCard>
      <ChartCard title="Litros abastecidos por mês" helpKey="litrosMes">
        <MonthBar
          data={v.monthly}
          keyName="litros"
          label="Litros"
          color={BI_COLORS.blue}
          isMoney={false}
        />
      </ChartCard>
      <ChartCard title="Preço médio do litro (R$)" helpKey="precoLitro">
        {v.monthly.every((m) => m.preco === null) ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={v.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="mes" fontSize={12} />
              <YAxis fontSize={12} domain={["auto", "auto"]} />
              <Tooltip
                formatter={(x) => (x === null ? "—" : `R$ ${formatNumberBR(Number(x), 3)}`)}
              />
              <Line
                type="monotone"
                dataKey="preco"
                name="Preço médio"
                stroke={BI_COLORS.navy}
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <ChartCard title="Gasto por tipo de combustível" helpKey="porCombustivel">
        <PieBox data={v.porCombustivel} />
      </ChartCard>
      <ChartCard title="Veículos que mais gastaram com combustível" helpKey="topAbastecimento">
        <HBar data={v.topVeic} />
      </ChartCard>
      <ChartCard title="Habilitação dos condutores" helpKey="cnhSituacao">
        <PieBox data={v.cnhData} />
      </ChartCard>
    </div>
  );
}

/* -------------------------------- Manutenção -------------------------------- */

export function BiManutencao({ months }: { months: number }) {
  const { data: records = [] } = useMaintenanceRecords();
  const { data: orders = [] } = useServiceOrders();

  const v = useMemo(() => {
    const keys = monthKeys(months);
    const valid = records.filter(
      (r) => r.status !== "cancelada" && keys.includes(monthKey(r.entry_at)),
    );
    const monthly = keys.map((k) => {
      const list = valid.filter((r) => monthKey(r.entry_at) === k);
      const days = list
        .filter((r) => r.exit_at)
        .map(
          (r) =>
            (new Date(r.exit_at as string).getTime() - new Date(r.entry_at).getTime()) / 86400000,
        )
        .filter((d) => d >= 0);
      return {
        mes: monthLabel(k),
        custo: list.reduce((s, r) => s + maintenanceTotal(r), 0),
        dias: days.length
          ? Number((days.reduce((s, d) => s + d, 0) / days.length).toFixed(1))
          : null,
      };
    });
    const porTipo = topBy(
      valid,
      (r) => humanize(String(r.kind ?? "outros")),
      (r) => maintenanceTotal(r),
      8,
    );
    const topVeic = topBy(
      valid,
      (r) => r.vehicle?.plate ?? r.vehicle?.asset_code ?? "—",
      (r) => maintenanceTotal(r),
      10,
    );
    const os = topBy(
      orders,
      (o) => humanize(o.status),
      () => 1,
      8,
    );
    return { monthly, porTipo, topVeic, os };
  }, [records, orders, months]);

  return (
    <div className={`${grid} mt-6`}>
      <ChartCard title="Custo de manutenção por mês" helpKey="manutMes">
        <MonthBar data={v.monthly} keyName="custo" label="Custo" color={BI_COLORS.blue} />
      </ChartCard>
      <ChartCard title="Gasto por tipo de manutenção" helpKey="manutTipo">
        <PieBox data={v.porTipo} />
      </ChartCard>
      <ChartCard title="Tempo médio na oficina (dias)" helpKey="tempoReparo">
        {v.monthly.every((m) => m.dias === null) ? (
          <EmptyChart text="Nenhuma manutenção concluída no período." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={v.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="mes" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip
                formatter={(x) => (x === null ? "—" : `${formatNumberBR(Number(x), 1)} dias`)}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="dias"
                name="Dias"
                stroke={BI_COLORS.navy}
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <ChartCard title="Ordens de serviço por situação" helpKey="osStatus">
        <HBar data={v.os} money={false} label="Ordens" color={BI_COLORS.royal} />
      </ChartCard>
      <ChartCard title="Veículos que mais gastaram com manutenção" helpKey="topManutencao">
        <HBar data={v.topVeic} color={BI_COLORS.blue} />
      </ChartCard>
    </div>
  );
}

/* --------------------------------- Financeiro --------------------------------- */

export function BiFinanceiro() {
  const { data: contracts = [] } = useContracts();
  const { data: commitments = [] } = useCommitments();
  const { data: quotas = [] } = useQuotas();

  const v = useMemo(() => {
    const vigentes = contracts.filter((c) => c.status === "vigente");
    const uso = vigentes
      .map((c) => {
        const t = contractTotals(c);
        return {
          name: c.number,
          consumido: t.consumed,
          reservado: t.reserved,
          saldo: Math.max(0, t.balance),
        };
      })
      .sort((a, b) => b.consumido + b.reservado + b.saldo - (a.consumido + a.reservado + a.saldo))
      .slice(0, 8);
    const faixas = [
      { name: "Até 30 dias", value: 0 },
      { name: "31 a 60 dias", value: 0 },
      { name: "61 a 90 dias", value: 0 },
      { name: "Mais de 90 dias", value: 0 },
    ];
    for (const c of vigentes) {
      const d = daysUntil(c.valid_to);
      if (d === null || d < 0) continue;
      const i = d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3;
      faixas[i]!.value += 1;
    }
    const empenhos = commitments
      .filter((c) => c.status === "ativo")
      .map((c) => ({
        name: c.number,
        disponivel: Number(c.available_value ?? 0),
        usado: Math.max(0, Number(c.committed_value ?? 0) - Number(c.available_value ?? 0)),
      }))
      .sort((a, b) => b.disponivel + b.usado - (a.disponivel + a.usado))
      .slice(0, 8);
    const cotas = quotas
      .filter((q) => q.active && Number(q.granted_amount) > 0)
      .map((q) => ({ name: q.name, value: Math.min(100, Math.round(quotaPercent(q))) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    return { uso, faixas, empenhos, cotas };
  }, [contracts, commitments, quotas]);

  return (
    <div className={`${grid} mt-6`}>
      <ChartCard title="Uso dos contratos vigentes" helpKey="contratosUso">
        {v.uso.length === 0 ? (
          <EmptyChart text="Nenhum contrato vigente." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, v.uso.length * 34 + 60)}>
            <BarChart data={v.uso} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis type="number" fontSize={12} tickFormatter={axisMoney} />
              <YAxis type="category" dataKey="name" fontSize={12} width={90} />
              <Tooltip formatter={money} />
              <Legend />
              <Bar dataKey="consumido" name="Consumido" stackId="a" fill={BI_COLORS.navy} />
              <Bar dataKey="reservado" name="Reservado" stackId="a" fill={BI_COLORS.blue} />
              <Bar dataKey="saldo" name="Saldo" stackId="a" fill={BI_COLORS.sky} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <ChartCard title="Contratos por tempo até vencer" helpKey="contratosPrazo">
        <HBar data={v.faixas} money={false} label="Contratos" color={BI_COLORS.royal} />
      </ChartCard>
      <ChartCard title="Empenhos ativos" helpKey="empenhosSaldo">
        {v.empenhos.length === 0 ? (
          <EmptyChart text="Nenhum empenho ativo." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, v.empenhos.length * 34 + 60)}>
            <BarChart data={v.empenhos} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis type="number" fontSize={12} tickFormatter={axisMoney} />
              <YAxis type="category" dataKey="name" fontSize={12} width={90} />
              <Tooltip formatter={money} />
              <Legend />
              <Bar dataKey="usado" name="Já usado" stackId="a" fill={BI_COLORS.navy} />
              <Bar dataKey="disponivel" name="Disponível" stackId="a" fill={BI_COLORS.sky} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
      <ChartCard title="Uso das cotas (%)" helpKey="cotasUso">
        <HBar data={v.cotas} money={false} label="% usado" color={BI_COLORS.amber} />
      </ChartCard>
    </div>
  );
}

/* ------------------------------- Administrativo ------------------------------- */

export function BiAdministrativo({ months }: { months: number }) {
  const { data: fines = [] } = useTrafficFines();
  const { data: obligations = [] } = useVehicleObligations();
  const { data: accidents = [] } = useAccidents();
  const { data: diaries = [] } = useDiaries();
  const { data: vehicles = [] } = useVehicles();

  const v = useMemo(() => {
    const keys = monthKeys(months);
    const monthly = keys.map((k) => ({
      mes: monthLabel(k),
      multas: fines
        .filter((f) => monthKey(f.occurred_at) === k)
        .reduce((s, f) => s + Number(f.amount ?? 0), 0),
      sinistros: accidents.filter((a) => monthKey(a.occurred_at) === k).length,
      diarias: diaries
        .filter(
          (d) =>
            d.status !== "cancelada" && d.status !== "rejeitada" && monthKey(d.departure_at) === k,
        )
        .reduce((s, d) => s + Number(d.total_value ?? 0), 0),
    }));
    return {
      monthly,
      multasStatus: topBy(
        fines,
        (f) => humanize(f.status),
        () => 1,
        8,
      ),
      obrigacoes: topBy(
        obligations,
        (o) => humanize(o.status),
        () => 1,
        8,
      ),
      frota: topBy(
        vehicles,
        (x) => humanize(x.status),
        () => 1,
        8,
      ),
    };
  }, [fines, obligations, accidents, diaries, vehicles, months]);

  return (
    <div className={`${grid} mt-6`}>
      <ChartCard title="Valor das multas por mês" helpKey="multasMes">
        <MonthBar data={v.monthly} keyName="multas" label="Multas" color={BI_COLORS.red} />
      </ChartCard>
      <ChartCard title="Multas por situação" helpKey="multasStatus">
        <PieBox data={v.multasStatus} />
      </ChartCard>
      <ChartCard title="Obrigações legais por situação" helpKey="obrigacoesStatus">
        <PieBox data={v.obrigacoes} />
      </ChartCard>
      <ChartCard title="Acidentes e ocorrências por mês" helpKey="sinistrosMes">
        <MonthBar
          data={v.monthly}
          keyName="sinistros"
          label="Ocorrências"
          color={BI_COLORS.amber}
          isMoney={false}
        />
      </ChartCard>
      <ChartCard title="Valor de diárias por mês" helpKey="diariasMes">
        <MonthBar data={v.monthly} keyName="diarias" label="Diárias" color={BI_COLORS.blue} />
      </ChartCard>
      <ChartCard title="Situação da frota" helpKey="situacaoFrota">
        <PieBox data={v.frota} />
      </ChartCard>
    </div>
  );
}
