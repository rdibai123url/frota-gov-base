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
  { to: "/veiculos", label: "Veículos", text: "Cadastrar e consultar a frota", icon: Truck },
  { to: "/unidades", label: "Secretarias / Unidades", text: "Estrutura administrativa do órgão", icon: Building2 },
  { to: "/usuarios", label: "Usuários", text: "Perfis e permissões de acesso", icon: Users },
  { to: "/orgao", label: "Dados do Órgão", text: "Identificação institucional e brasão", icon: Landmark },
] as const;

function Painel() {
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: units = [] } = useUnits();
  const { data: users = [] } = useOrgUsers();
  const { data: org } = useOrganization();

  const ativos = vehicles.filter((v) => v.status === "ativo").length;
  const manutencao = vehicles.filter((v) => v.status === "manutencao").length;

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
