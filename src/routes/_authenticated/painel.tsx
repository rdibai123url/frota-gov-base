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
} from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import {
  brl,
  num,
  useFuelingAlerts,
  useFuelings,
  useOrgUsers,
  useOrganization,
  useUnits,
  useVehicles,
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
  { to: "/fornecedores", label: "Fornecedores / Postos", text: "Postos habilitados para o órgão", icon: Store },
  { to: "/combustiveis", label: "Combustíveis", text: "Tipos de combustível do órgão", icon: Droplets },
  { to: "/unidades", label: "Secretarias / Unidades", text: "Estrutura administrativa do órgão", icon: Building2 },
  { to: "/usuarios", label: "Usuários", text: "Perfis e permissões de acesso", icon: Users },
  { to: "/orgao", label: "Dados do Órgão", text: "Identificação institucional e brasão", icon: Landmark },
] as const;

function Painel() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: users = [] } = useOrgUsers();
  const { data: org } = useOrganization();
  const { data: fuelings = [] } = useFuelings();
  const { data: alerts = [] } = useFuelingAlerts();

  const ativos = vehicles.filter((v) => v.status === "ativo").length;
  const manutencao = vehicles.filter((v) => v.status === "manutencao").length;

  const mes = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const list = fuelings.filter((f) => f.status === "valido" && new Date(f.fueled_at) >= start);
    return {
      count: list.length,
      quantity: list.reduce((s, f) => s + Number(f.quantity ?? 0), 0),
      total: list.reduce((s, f) => s + Number(f.total_value ?? 0), 0),
      vehicles: new Set(list.map((f) => f.vehicle_id)).size,
    };
  }, [fuelings]);

  const abertos = alerts.filter((a) => a.status === "aberto").length;

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
        quantity: list.reduce((s, f) => s + Number(f.quantity ?? 0), 0),
      };
    });
  }, [fuelings]);

  const maxTotal = Math.max(...ultimos6.map((m) => m.total), 0);

  return (
    <>
      <PageHeader
        title="Painel"
        description={
          org?.legal_name
            ? `Visão geral da frota de ${org.short_name || org.legal_name}.`
            : "Visão geral da frota do órgão."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total de veículos" value={isLoading ? "—" : vehicles.length} icon={Truck} />
        <StatCard label="Veículos ativos" value={ativos} icon={CircleCheck} tone="success" />
        <StatCard label="Em manutenção" value={manutencao} icon={Wrench} tone="warning" />
        <StatCard label="Secretarias / Unidades" value={units.length} icon={Building2} />
        <StatCard label="Usuários" value={users.length} icon={Users} />
      </div>

      <h2 className="gov-title mt-10 mb-4 text-lg">Abastecimento no mês</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Abastecimentos no mês" value={mes.count} icon={Fuel} />
        <StatCard label="Quantidade abastecida" value={num(mes.quantity, 2)} icon={Droplets} />
        <StatCard label="Valor gasto no mês" value={brl(mes.total)} icon={Banknote} />
        <StatCard label="Veículos abastecidos" value={mes.vehicles} icon={Truck} />
        <StatCard label="Alertas em aberto" value={abertos} icon={BellRing} tone={abertos > 0 ? "warning" : "default"} />
      </div>

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
