import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Truck,
  Wrench,
  Building2,
  Users,
  CircleCheck,
  Landmark,
  ArrowRight,
  Fuel,
  Droplets,
  Banknote,
  BellRing,
  Store,
  IdCard,
  Plane,
  Ticket,
  CalendarClock,
  FileText,
  Wallet,
  PiggyBank,
  Coins,
  ClipboardList,
  CircleDot,
  Cog,
  Building2 as Building,
  FileSearch,
  FileCheck2,
  FileWarning,
  AlertTriangle,
  ShieldCheck,
  ArrowLeftRight,
} from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { useDiaries, diaryIndicators } from "@/lib/diarias";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  authorizationBalance,
  brl,
  cnhState,
  contractTotals,
  daysUntil,
  num,
  quotaPercent,
  useAuthorizations,
  useCommitments,
  useContracts,
  useDrivers,
  useFuelingAlerts,
  useFuelings,
  useOrgUsers,
  useOrganization,
  useQuotas,
  useUnits,
  useVehicles,
  maintenanceTotal,
  planDue,
  useMaintenanceLead,
  useMaintenancePlans,
  useMaintenanceRecords,
  useVehicleCleanings,
  useMaintenanceRequests,
  useTires,
  MIN_PROPOSALS,
  useQuotations,
  useServiceOrders,
  useWorkshops,
  DISPOSAL_KINDS,
  useAccidents,
  useAssetMovements,
  useInsurancePolicies,
  useTrafficFines,
  useVehicleObligations,
  onlyFuelRows,
  useFuelTypes,
} from "@/lib/frotagov";


export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — FrotaGov" },
      { name: "description", content: "Visão geral da frota, unidades e usuários do órgão." },
      { property: "og:title", content: "Painel — FrotaGov" },
      { property: "og:description", content: "Indicadores iniciais da frota do órgão público." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Painel,
});

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: typeof Truck;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-secondary text-secondary-foreground";
  return (
    <div className="rounded-lg border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={`flex size-9 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="gov-title mt-3 text-3xl">{value}</p>
    </div>
  );
}

const SHORTCUTS = [
  { to: "/abastecimentos", label: "Abastecimentos", text: "Registrar e consultar abastecimentos", icon: Fuel },
  { to: "/veiculos", label: "Veículos", text: "Cadastrar e consultar a frota", icon: Truck },
  { to: "/condutores", label: "Condutores", text: "Habilitação e vínculo dos condutores", icon: IdCard },
  { to: "/utilizacao", label: "Utilização e reservas", text: "Reservas, saídas e retornos de veículos", icon: CalendarClock },
  { to: "/autorizacoes", label: "Autorizações", text: "Autorizar abastecimentos antes da compra", icon: Ticket },
  { to: "/contratos", label: "Contratos", text: "Contratos, itens e saldos contratuais", icon: FileText },
  { to: "/empenhos", label: "Empenhos", text: "Empenhos e saldos orçamentários", icon: Wallet },
  { to: "/cotas", label: "Cotas e saldos", text: "Cotas financeiras e quantitativas", icon: PiggyBank },
  { to: "/centros-custo", label: "Centros de Custo", text: "Centros de custo do órgão e das unidades", icon: Coins },
  { to: "/fornecedores", label: "Fornecedores / Postos", text: "Postos habilitados para o órgão", icon: Store },
  { to: "/combustiveis", label: "Combustíveis", text: "Tipos de combustível do órgão", icon: Droplets },
  { to: "/unidades", label: "Secretarias / Unidades", text: "Estrutura administrativa do órgão", icon: Building2 },
  { to: "/usuarios", label: "Usuários", text: "Perfis e permissões de acesso", icon: Users },
  { to: "/multas", label: "Multas e infrações", text: "Autos de infração, defesa e responsabilidade", icon: FileWarning },
  { to: "/sinistros", label: "Acidentes e sinistros", text: "Ocorrências, seguradora e indisponibilidade", icon: AlertTriangle },
  { to: "/seguros", label: "Seguros", text: "Apólices, vigências e veículos cobertos", icon: ShieldCheck },
  { to: "/obrigacoes", label: "Obrigações legais", text: "Licenciamento, IPVA, inspeções e ANTT", icon: FileCheck2 },
  { to: "/patrimonio", label: "Movimentação patrimonial", text: "Cessões, remanejamentos, baixas e leilões", icon: ArrowLeftRight },
  { to: "/orgao", label: "Dados do Órgão", text: "Identificação institucional e brasão", icon: Landmark },
] as const;

function Painel() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: users = [] } = useOrgUsers();
  const { data: org } = useOrganization();
  const { data: fuelings = [] } = useFuelings();
  const { data: alerts = [] } = useFuelingAlerts();
  const { data: drivers = [] } = useDrivers();
  const { data: auths = [] } = useAuthorizations();
  const { data: contracts = [] } = useContracts();
  const { data: commitments = [] } = useCommitments();
  const { data: quotas = [] } = useQuotas();
  const { data: diaries = [] } = useDiaries();
  const diariasKpi = useMemo(() => diaryIndicators(diaries), [diaries]);

  const financeiro = useMemo(() => {
    const vigentes = contracts.filter((c) => c.status === "vigente");
    const saldoContratual = vigentes.reduce((s, c) => s + contractTotals(c).balance, 0);
    const empenhosAtivos = commitments.filter((c) => c.status === "ativo");
    return {
      contratosVigentes: vigentes.length,
      saldoContratual,
      empenhosAtivos: empenhosAtivos.length,
      saldoEmpenhos: empenhosAtivos.reduce((s, c) => s + Number(c.available_value ?? 0), 0),
      cotasCriticas: quotas.filter(
        (q) => q.active && Number(q.granted_amount) > 0 && 100 - quotaPercent(q) <= 20,
      ).length,
      contratosAVencer: vigentes.filter((c) => {
        const d = daysUntil(c.valid_to);
        return d !== null && d >= 0 && d <= 60;
      }).length,
    };
  }, [contracts, commitments, quotas]);

  const ativos = vehicles.filter((v) => v.status === "ativo").length;
  const manutencao = vehicles.filter((v) => v.status === "manutencao").length;

  const { data: fuelProducts = [] } = useFuelTypes();

  const mes = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const list = fuelings.filter((f) => f.status === "valido" && new Date(f.fueled_at) >= start);
    return {
      count: list.length,
      // Somente itens categorizados como combustível entram no indicador de litros.
      quantity: onlyFuelRows(list, fuelProducts).reduce((s, f) => s + Number(f.quantity ?? 0), 0),
      total: list.reduce((s, f) => s + Number(f.total_value ?? 0), 0),
      vehicles: new Set(list.map((f) => f.vehicle_id)).size,
    };
  }, [fuelings, fuelProducts]);

  const abertos = alerts.filter((a) => a.status === "aberto").length;

  const condutoresAtivos = drivers.filter((d) => d.active).length;
  const cnhVencidas = drivers.filter((d) => cnhState(d.license_expiry) === "vencida").length;
  const cnhAVencer = drivers.filter((d) => cnhState(d.license_expiry) === "a_vencer").length;
  const autAbertas = auths.filter(
    (a) => ["autorizada", "pendente", "utilizada_parcial"].includes(a.status) && authorizationBalance(a) > 0,
  ).length;
  const autUsadasMes = useMemo(() => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return auths.filter(
      (a) => ["utilizada", "utilizada_parcial"].includes(a.status) && new Date(a.updated_at) >= start,
    ).length;
  }, [auths]);

  const { data: plans = [] } = useMaintenancePlans();
  const { data: mRequests = [] } = useMaintenanceRequests();
  const { data: mRecords = [] } = useMaintenanceRecords();
  const { data: cleanings = [] } = useVehicleCleanings();
  const { data: tires = [] } = useTires();
  const lead = useMaintenanceLead();
  const { data: quotations = [] } = useQuotations();
  const { data: orders = [] } = useServiceOrders();
  const { data: workshops = [] } = useWorkshops();

  const limpeza = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    const doneMonth = cleanings.filter(
      (c) => c.status === "realizada" && (c.performed_at ?? "").slice(0, 7) === month,
    );
    return {
      mes: doneMonth.length,
      valorMes: doneMonth.reduce((s, c) => s + Number(c.total_value ?? 0), 0),
      agendadas: cleanings.filter((c) => c.status === "agendada").length,
    };
  }, [cleanings]);

  const manut = useMemo(() => {
    const dues = plans
      .filter((p) => p.active)
      .flatMap((p) => {
        const targets = p.vehicle_id
          ? vehicles.filter((v) => v.id === p.vehicle_id)
          : vehicles.filter((v) => !p.vehicle_type || v.vehicle_type === p.vehicle_type);
        return targets.map((v) => planDue(p, v, lead).state);
      });
    const now = new Date();
    const custoMes = mRecords
      .filter((r) => {
        if (r.status !== "concluida") return false;
        const d = new Date(r.exit_at ?? r.entry_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s2, r) => s2 + maintenanceTotal(r), 0);
    return {
      vencidas: dues.filter((d) => d === "vencido").length,
      proximas: dues.filter((d) => d === "proximo").length,
      solicitacoesAbertas: mRequests.filter((r) => !["concluida", "cancelada"].includes(r.status)).length,
      emOficina: mRequests.filter((r) => r.status === "em_manutencao").length,
      custoMes,
      pneusInstalados: tires.filter((t) => t.status === "instalado").length,
      pneusEstoque: tires.filter((t) => t.status === "estoque").length,
    };
  }, [plans, vehicles, lead, mRecords, mRequests, tires]);

  const rede = useMemo(() => {
    const now = new Date();
    const emExecucao = orders.filter((o) => ["veiculo_recebido", "em_execucao", "aguardando_peca"].includes(o.status));
    return {
      cotacoesAbertas: quotations.filter((q) => ["aberta", "em_analise"].includes(q.status)).length,
      aguardandoPropostas: quotations.filter((q) => q.status === "aberta" && q.proposals_count === 0).length,
      poucasPropostas: quotations.filter(
        (q) => ["aberta", "em_analise"].includes(q.status) && q.valid_proposals_count < MIN_PROPOSALS,
      ).length,
      osAbertas: orders.filter((o) => !["concluida", "cancelada"].includes(o.status)).length,
      osEmExecucao: emExecucao.length,
      osAtrasadas: orders.filter(
        (o) =>
          !["concluida", "cancelada"].includes(o.status) &&
          o.deadline_at !== null &&
          new Date(`${o.deadline_at}T12:00:00`) < now,
      ).length,
      valorMes: orders
        .filter((o) => {
          const d = new Date(o.finished_at ?? o.issued_at);
          return o.status === "concluida" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .reduce((s2, o) => s2 + Number(o.executed_value ?? 0), 0),
      oficinasAtivas: workshops.filter((w) => w.status === "ativo").length,
    };
  }, [quotations, orders, workshops]);

  const { data: fines = [] } = useTrafficFines();
  const { data: accidents = [] } = useAccidents();
  const { data: policies = [] } = useInsurancePolicies();
  const { data: obligations = [] } = useVehicleObligations();
  const { data: movements = [] } = useAssetMovements();

  const admin = useMemo(() => {
    const now = new Date();
    const abertasStatus = ["recebida", "em_analise", "defesa_apresentada", "indeferida"];
    const multasAbertas = fines.filter((f) => abertasStatus.includes(f.status));
    const sinistrosAbertos = accidents.filter((a) => a.status !== "encerrado");
    return {
      multasAbertas: multasAbertas.length,
      multasValor: multasAbertas.reduce((s2, f) => s2 + Number(f.amount ?? 0), 0),
      obrigacoesVencidas: obligations.filter((o) => o.status === "vencida").length,
      segurosAVencer: policies.filter((p) => {
        if (p.status === "cancelada" || p.status === "vencida") return false;
        const d = daysUntil(p.valid_to);
        return d !== null && d >= 0 && d <= 60;
      }).length,
      sinistrosAbertos: sinistrosAbertos.length,
      veiculosPorSinistro: new Set(sinistrosAbertos.filter((a) => a.blocks_use).map((a) => a.vehicle_id)).size,
      movimentacoesMes: movements.filter((m) => {
        const d = new Date(`${m.moved_on}T12:00:00`);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
      baixas: movements.filter((m) => DISPOSAL_KINDS.includes(m.kind)).length,
    };
  }, [fines, accidents, policies, obligations, movements]);

  const ultimos6 = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() - (5 - i), 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const list = fuelings.filter((f) => {
        const t = new Date(f.fueled_at);
        return f.status === "valido" && t >= d && t < next;
      });
      return {
        label: d.toLocaleDateString("pt-BR", { month: "short" }),
        total: list.reduce((s, f) => s + Number(f.total_value ?? 0), 0),
        quantity: onlyFuelRows(list, fuelProducts).reduce((s, f) => s + Number(f.quantity ?? 0), 0),
      };
    });
  }, [fuelings, fuelProducts]);

  const maxTotal = Math.max(...ultimos6.map((m) => m.total), 0);

  return (
    <>
      <PageHeader
        title="Painel executivo"
        description={
          org?.legal_name
            ? `Visão geral da frota de ${org.short_name || org.legal_name}.`
            : "Visão geral da frota do órgão."
        }
      />

      <Tabs defaultValue="geral">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="abastecimento">Abastecimento</TabsTrigger>
          <TabsTrigger value="manutencao">Manutenção</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro / Contratual</TabsTrigger>
          <TabsTrigger value="administrativo">Administrativo / Legal</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="pt-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total de veículos" value={isLoading ? "—" : vehicles.length} icon={Truck} />
        <StatCard label="Veículos ativos" value={ativos} icon={CircleCheck} tone="success" />
        <StatCard label="Em manutenção" value={manutencao} icon={Wrench} tone="warning" />
        <StatCard label="Secretarias / Unidades" value={units.length} icon={Building2} />
        <StatCard label="Usuários" value={users.length} icon={Users} />
      </div>
        </TabsContent>

        <TabsContent value="abastecimento" className="pt-5">
      <h2 className="gov-title mb-4 text-lg">Abastecimento no mês</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Abastecimentos no mês" value={mes.count} icon={Fuel} />
        <StatCard label="Quantidade abastecida" value={num(mes.quantity, 2)} icon={Droplets} />
        <StatCard label="Valor gasto no mês" value={brl(mes.total)} icon={Banknote} />
        <StatCard label="Veículos abastecidos" value={mes.vehicles} icon={Truck} />
        <StatCard label="Alertas em aberto" value={abertos} icon={BellRing} tone={abertos > 0 ? "warning" : "default"} />
      </div>

      <h2 className="gov-title mt-10 mb-4 text-lg">Condutores e autorizações</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Condutores ativos" value={condutoresAtivos} icon={IdCard} />
        <StatCard label="CNHs vencidas" value={cnhVencidas} icon={IdCard} tone={cnhVencidas > 0 ? "warning" : "default"} />
        <StatCard label="CNHs a vencer (30 dias)" value={cnhAVencer} icon={IdCard} tone={cnhAVencer > 0 ? "warning" : "default"} />
        <StatCard label="Autorizações abertas" value={autAbertas} icon={Ticket} />
        <StatCard label="Autorizações utilizadas no mês" value={autUsadasMes} icon={Ticket} tone="success" />
      </div>
        </TabsContent>

        <TabsContent value="manutencao" className="pt-5">
      <h2 className="gov-title mb-4 text-lg">Manutenção, peças e pneus</h2>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Preventivas vencidas"
          value={manut.vencidas}
          icon={ClipboardList}
          tone={manut.vencidas > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Preventivas a vencer"
          value={manut.proximas}
          icon={ClipboardList}
          tone={manut.proximas > 0 ? "warning" : "default"}
        />
        <StatCard label="Solicitações em aberto" value={manut.solicitacoesAbertas} icon={Wrench} />
        <StatCard label="Veículos em oficina" value={manut.emOficina} icon={Wrench} tone={manut.emOficina > 0 ? "warning" : "default"} />
        <StatCard label="Custo de manutenção no mês" value={brl(manut.custoMes)} icon={Cog} />
        <StatCard label="Pneus instalados / estoque" value={`${manut.pneusInstalados} / ${manut.pneusEstoque}`} icon={CircleDot} />
      </div>

      <h2 className="gov-title mt-10 mb-4 text-lg">Limpeza da frota</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Limpezas no mês" value={limpeza.mes} icon={Droplets} />
        <StatCard label="Gasto com limpeza no mês" value={brl(limpeza.valorMes)} icon={Banknote} />
        <StatCard label="Limpezas agendadas" value={limpeza.agendadas} icon={Droplets} tone={limpeza.agendadas > 0 ? "warning" : "default"} />
      </div>

      <h2 className="gov-title mt-10 mb-4 text-lg">Rede credenciada, cotações e ordens de serviço</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cotações abertas" value={rede.cotacoesAbertas} icon={FileSearch} />
        <StatCard label="Aguardando propostas" value={rede.aguardandoPropostas} icon={FileSearch} />
        <StatCard
          label={`Processos com menos de ${MIN_PROPOSALS} propostas`}
          value={rede.poucasPropostas}
          icon={FileSearch}
          tone={rede.poucasPropostas > 0 ? "warning" : "default"}
        />
        <StatCard label="Oficinas credenciadas ativas" value={rede.oficinasAtivas} icon={Building} />
        <StatCard label="OS em aberto" value={rede.osAbertas} icon={FileCheck2} />
        <StatCard label="OS em execução" value={rede.osEmExecucao} icon={FileCheck2} />
        <StatCard
          label="OS atrasadas"
          value={rede.osAtrasadas}
          icon={FileCheck2}
          tone={rede.osAtrasadas > 0 ? "warning" : "default"}
        />
        <StatCard label="Valor em manutenção no mês" value={brl(rede.valorMes)} icon={Banknote} />
      </div>

        </TabsContent>

        <TabsContent value="financeiro" className="pt-5">
      <h2 className="gov-title mb-4 text-lg">Execução orçamentária</h2>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Contratos vigentes" value={financeiro.contratosVigentes} icon={FileText} />
        <StatCard label="Saldo contratual" value={brl(financeiro.saldoContratual)} icon={FileText} tone="success" />
        <StatCard label="Empenhos ativos" value={financeiro.empenhosAtivos} icon={Wallet} />
        <StatCard label="Saldo de empenhos" value={brl(financeiro.saldoEmpenhos)} icon={Wallet} tone="success" />
        <StatCard
          label="Cotas com saldo crítico"
          value={financeiro.cotasCriticas}
          icon={PiggyBank}
          tone={financeiro.cotasCriticas > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Contratos a vencer (60 dias)"
          value={financeiro.contratosAVencer}
          icon={Coins}
          tone={financeiro.contratosAVencer > 0 ? "warning" : "default"}
        />
      </div>

        </TabsContent>

        <TabsContent value="administrativo" className="pt-5">
      <h2 className="gov-title mb-4 text-lg">Gestão administrativa, legal e patrimonial</h2>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Multas em aberto"
          value={admin.multasAbertas}
          icon={FileWarning}
          tone={admin.multasAbertas > 0 ? "warning" : "default"}
        />
        <StatCard label="Valor de multas em aberto" value={brl(admin.multasValor)} icon={Banknote} />
        <StatCard
          label="Obrigações legais vencidas"
          value={admin.obrigacoesVencidas}
          icon={FileCheck2}
          tone={admin.obrigacoesVencidas > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Seguros a vencer (60 dias)"
          value={admin.segurosAVencer}
          icon={ShieldCheck}
          tone={admin.segurosAVencer > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Sinistros em aberto"
          value={admin.sinistrosAbertos}
          icon={AlertTriangle}
          tone={admin.sinistrosAbertos > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Veículos indisponíveis por sinistro"
          value={admin.veiculosPorSinistro}
          icon={Truck}
          tone={admin.veiculosPorSinistro > 0 ? "warning" : "default"}
        />
        <StatCard label="Movimentações patrimoniais no mês" value={admin.movimentacoesMes} icon={ArrowLeftRight} />
        <StatCard label="Baixas e alienações acumuladas" value={admin.baixas} icon={Landmark} />
      </div>

      <h2 className="gov-title mb-4 mt-8 text-lg">Diárias</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Solicitadas no mês" value={diariasKpi.requestedMonth} icon={Plane} />
        <StatCard label="Autorizadas" value={diariasKpi.authorized} icon={FileCheck2} tone="success" />
        <StatCard
          label="Aguardando comprovação"
          value={diariasKpi.awaitingProof}
          icon={FileWarning}
          tone={diariasKpi.awaitingProof > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Comprovações vencidas"
          value={diariasKpi.overdue}
          icon={AlertTriangle}
          tone={diariasKpi.overdue > 0 ? "warning" : "default"}
        />
        <StatCard label="Valor de diárias no mês" value={brl(diariasKpi.totalValue)} icon={Banknote} />
      </div>

        </TabsContent>
      </Tabs>

      <h2 className="gov-title mt-10 mb-4 text-lg">Gasto dos últimos 6 meses</h2>

      <div className="rounded-lg border bg-card p-5 shadow-card">
        {maxTotal === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Ainda não há abastecimentos registrados para exibir o histórico.
          </p>
        ) : (
          <div className="flex h-48 items-end gap-3">
            {ultimos6.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{m.total > 0 ? brl(m.total) : ""}</span>
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${Math.max(4, (m.total / maxTotal) * 140)}px` }}
                  title={`${num(m.quantity, 2)} abastecidos`}
                />
                <span className="text-xs capitalize text-muted-foreground">{m.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>


      <h2 className="gov-title mt-10 mb-4 text-lg">Atalhos</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {SHORTCUTS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="group flex items-center gap-4 rounded-lg border bg-card p-5 shadow-card transition-colors hover:border-accent"
          >
            <span className="flex size-10 items-center justify-center rounded-md bg-primary/8 text-primary">
              <s.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="gov-title block text-base">{s.label}</span>
              <span className="block text-sm text-muted-foreground">{s.text}</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
    </>
  );
}
