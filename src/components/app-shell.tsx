import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Truck,
  Building2,
  Landmark,
  Fuel,
  BellRing,
  FileText,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Wrench,
  ClipboardList,
  ChevronDown,
  FolderCog,
  FileBarChart,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelpButton } from "@/components/help-button";
import { cn } from "@/lib/utils";
import { supabase, useBrasaoUrl, useOrganization, useProfile, ROLE_LABELS } from "@/lib/frotagov";
import { useIsSuperAdmin, usePlatformSession, usePlatformContextActions } from "@/lib/platform";


type NavLeaf = { to: string; label: string };
type NavGroup = { id: string; label: string; icon: typeof Truck; to?: string; items?: NavLeaf[] };

const NAV: NavGroup[] = [
  { id: "painel", label: "Painel", icon: LayoutDashboard, to: "/painel" },
  {
    id: "frota",
    label: "Frota",
    icon: Truck,
    items: [
      { to: "/veiculos", label: "Veículos" },
      { to: "/equipamentos", label: "Máquinas e equipamentos" },
      { to: "/utilizacao", label: "Utilização e reservas" },
      { to: "/diarias", label: "Diárias" },
      { to: "/multas", label: "Multas e infrações" },
      { to: "/sinistros", label: "Acidentes e sinistros" },
      { to: "/seguros", label: "Seguros" },
      { to: "/obrigacoes", label: "Obrigações legais" },
      { to: "/patrimonio", label: "Movimentação patrimonial" },
      { to: "/historico-veiculo", label: "Histórico do veículo" },
    ],
  },

  {
    id: "abastecimento",
    label: "Abastecimento",
    icon: Fuel,
    items: [
      { to: "/autorizacoes", label: "Autorizações" },
      { to: "/abastecimentos", label: "Abastecimentos" },
      { to: "/combustiveis", label: "Combustíveis" },
      { to: "/cotas-servidor", label: "Cotas de servidor" },
      { to: "/fornecedores", label: "Fornecedores / Postos" },
    ],
  },
  {
    id: "manutencao",
    label: "Manutenção",
    icon: Wrench,
    items: [
      { to: "/manutencoes", label: "Manutenções" },
      { to: "/planos-manutencao", label: "Planos preventivos" },
      { to: "/limpeza", label: "Limpeza da frota" },
      { to: "/pecas", label: "Peças e acessórios" },
      { to: "/ofp", label: "Ordens de Fornecimento (OFP)" },
      { to: "/almoxarifado", label: "Almoxarifado" },
      { to: "/pneus", label: "Pneus" },
    ],
  },
  {
    id: "rede",
    label: "Rede credenciada e compras",
    icon: ClipboardList,
    items: [
      { to: "/rede-credenciada", label: "Oficinas e rede credenciada" },
      { to: "/credenciados", label: "Credenciados e cartão virtual" },
      { to: "/portal-credenciado", label: "Portal do credenciado" },
      { to: "/mapa-rede", label: "Mapa da rede" },
      { to: "/cotacoes", label: "Cotações" },
      { to: "/ordens-servico", label: "Ordens de Serviço" },
    ],
  },
  {
    id: "orcamento",
    label: "Contratos e Orçamento",
    icon: FileText,
    items: [
      { to: "/contratos", label: "Contratos" },
      { to: "/empenhos", label: "Empenhos" },
      { to: "/cotas", label: "Cotas e saldos" },
      { to: "/centros-custo", label: "Centros de Custo" },
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    icon: FolderCog,
    items: [
      { to: "/orgao", label: "Dados do Órgão" },
      { to: "/unidades", label: "Secretarias / Unidades" },
      { to: "/condutores", label: "Condutores / Motoristas" },
      { to: "/funcionarios", label: "Funcionários" },
      { to: "/entidades-externas", label: "Pessoas e Empresas Externas" },
      { to: "/usuarios", label: "Usuários e Permissões" },
      { to: "/migracao", label: "Migração de dados" },
      { to: "/exportacao", label: "Exportar dados" },
    ],
  },

  {
    id: "relatorios",
    label: "Relatórios e análises",
    icon: FileBarChart,
    items: [
      { to: "/inteligencia", label: "Inteligência da frota" },
      { to: "/relatorios", label: "Relatórios avançados" },
      { to: "/sustentabilidade", label: "Sustentabilidade da frota" },
    ],
  },
  {
    id: "integracoes",
    label: "Integrações e dados abertos",
    icon: Landmark,
    items: [
      { to: "/transparencia", label: "Portal da Transparência" },
      { to: "/integracoes", label: "Central de Integrações" },
      { to: "/chaves-api", label: "Chaves de API" },
    ],
  },

  { id: "alertas", label: "Alertas e inconsistências", icon: BellRing, to: "/alertas" },
];

const PLATFORM_NAV: NavGroup = {
  id: "plataforma",
  label: "Administração da Plataforma",
  icon: ShieldCheck,
  to: "/plataforma",
};


const EXTRA_MATCHES: Record<string, string[]> = {
  frota: ["/veiculo/"],
  rede: ["/cotacao/", "/ordem-servico/"],
};

function groupForPath(pathname: string) {
  for (const g of [PLATFORM_NAV, ...NAV]) {
    if (g.to && pathname.startsWith(g.to)) return g.id;
    if (g.items?.some((i) => pathname.startsWith(i.to))) return g.id;
    if (EXTRA_MATCHES[g.id]?.some((p) => pathname.startsWith(p))) return g.id;
  }
  return null;
}


export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentGroup = groupForPath(pathname);
  const [openGroup, setOpenGroup] = useState<string | null>(currentGroup);
  useEffect(() => {
    if (currentGroup) setOpenGroup(currentGroup);
  }, [currentGroup]);
  const { data: org } = useOrganization();
  const { data: me } = useProfile();
  const { data: brasao } = useBrasaoUrl(org?.logo_url);
  const { isSuperAdmin } = useIsSuperAdmin();
  const { data: platformSession } = usePlatformSession();
  const { exitOrg } = usePlatformContextActions();
  const navGroups = isSuperAdmin ? [PLATFORM_NAV, ...NAV] : NAV;


  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const primaryRole = me?.roles?.[0];
  const primaryRoleLabel = primaryRole ? ROLE_LABELS[primaryRole] : "Sem perfil atribuído";
  /** Órgãos de demonstração são identificados pelo próprio nome cadastrado. */
  const isDemoOrg = /demonstra|\bdemo\b/i.test(`${org?.legal_name ?? ""} ${org?.short_name ?? ""}`);

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <div className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <ShieldCheck className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="gov-title text-lg">FrotaGov</p>
          <p className="text-[11px] uppercase tracking-widest opacity-70">Gestão de frotas públicas</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {navGroups.map((group) => {
          if (group.to) {
            const active = pathname.startsWith(group.to);
            return (
              <Link
                key={group.id}
                to={group.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors",
                  active
                    ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary"
                    : "opacity-75 hover:bg-sidebar-accent/60 hover:opacity-100",
                )}
              >
                <group.icon className="size-4 shrink-0" />
                <span className="truncate">{group.label}</span>
              </Link>
            );
          }

          const expanded = openGroup === group.id;
          const inGroup = currentGroup === group.id;
          return (
            <div key={group.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpenGroup(expanded ? null : group.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors",
                  inGroup
                    ? "font-semibold text-sidebar-accent-foreground opacity-100"
                    : "opacity-75 hover:opacity-100",
                  "hover:bg-sidebar-accent/60",
                )}
              >
                <group.icon className="size-4 shrink-0" />
                <span className="flex-1 truncate text-left">{group.label}</span>
                <ChevronDown
                  className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")}
                />
              </button>
              {expanded && (
                <div className="mt-0.5 mb-1 space-y-0.5 border-l border-sidebar-border/70 pl-3 ml-5">
                  {group.items?.map((leaf) => {
                    const active = pathname.startsWith(leaf.to);
                    return (
                      <Link
                        key={leaf.to}
                        to={leaf.to}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "relative block truncate rounded-md px-3 py-1.5 text-[13px] transition-colors",
                          active
                            ? "bg-sidebar-primary/18 font-semibold text-sidebar-accent-foreground before:absolute before:inset-y-1 before:-left-[13px] before:w-[3px] before:rounded-full before:bg-sidebar-primary"
                            : "opacity-70 hover:bg-sidebar-accent/50 hover:opacity-100",
                        )}
                      >
                        {leaf.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>


      <div className="border-t border-sidebar-border px-4 py-4 text-xs">
        <p className="truncate font-medium">{me?.profile?.full_name || me?.email}</p>
        <p className="mt-0.5 truncate opacity-70">{primaryRoleLabel}</p>
        <Link
          to="/perfil"
          onClick={() => setOpen(false)}
          className={cn(
            "mt-3 flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-sidebar-accent",
            pathname.startsWith("/perfil")
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "opacity-85",
          )}
        >
          <UserRound className="size-4" /> Perfil e segurança
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="mt-1 w-full justify-start gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="size-4" /> Sair
        </Button>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex min-h-screen bg-background">

      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-72">{sidebar}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">{sidebar}</div>
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-4 top-4"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card px-4 py-3 shadow-card sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          {brasao ? (
            <img
              src={brasao}
              alt="Brasão do órgão"
              className="size-10 rounded-sm object-contain"
            />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-sm bg-secondary text-secondary-foreground">
              <Landmark className="size-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="gov-title truncate text-sm sm:text-base">
              {org?.legal_name ?? "Órgão não configurado"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[org?.short_name, org?.city, org?.state].filter(Boolean).join(" · ") ||
                "Complete os dados do órgão"}
            </p>
          </div>
        </header>

        {isDemoOrg && (
          <div className="border-b border-warning/40 bg-warning/20 px-4 py-2.5 text-sm font-medium text-foreground sm:px-6">
            AMBIENTE DE DEMONSTRAÇÃO — os dados exibidos são fictícios e destinados a apresentação
            comercial e treinamento. Não utilize para operação real.
          </div>
        )}



        {isSuperAdmin && platformSession?.organization_id && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-accent/15 px-4 py-2.5 text-sm sm:px-6">
            <p className="font-medium">
              Visualizando órgão: {platformSession.organization?.legal_name ?? org?.legal_name ?? "—"}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await exitOrg();
                navigate({ to: "/plataforma" });
              }}
            >
              Sair do órgão
            </Button>
          </div>
        )}
        {isSuperAdmin && !platformSession?.organization_id && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/40 bg-warning/20 px-4 py-2.5 text-sm sm:px-6">
            <p>
              <strong>Nenhum órgão em contexto.</strong> As ações de cadastro das telas do órgão
              ficam ocultas até você acessar um órgão.
            </p>
            <Button size="sm" onClick={() => navigate({ to: "/plataforma" })}>
              Acessar um órgão
            </Button>
          </div>
        )}


        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
    </TooltipProvider>
  );
}

/** Trilha de navegação (grupo do menu → página atual) derivada da rota. */
function useBreadcrumb(pathname: string) {
  const groupId = groupForPath(pathname);
  const group = [PLATFORM_NAV, ...NAV].find((g) => g.id === groupId);
  if (!group) return null;
  const leaf = group.items?.find((i) => pathname.startsWith(i.to));
  return { group: group.label, leaf: leaf?.label ?? null };
}

export function PageHeader({
  title,
  description,
  action,
  helpKey,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Chave alternativa de ajuda (ex.: aba interna). Por padrão usa a rota atual. */
  helpKey?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const trail = useBreadcrumb(pathname);

  return (
    <div className="mb-6 border-b pb-4">
      {trail && (
        <nav aria-label="Trilha de navegação" className="mb-1.5 text-xs text-muted-foreground">
          <span>{trail.group}</span>
          {trail.leaf && (
            <>
              <span aria-hidden className="mx-1.5 opacity-60">
                /
              </span>
              <span className="font-medium text-foreground">{trail.leaf}</span>
            </>
          )}
        </nav>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="gov-title min-w-0 truncate text-2xl">{title}</h1>
            <HelpButton pathname={pathname} {...(helpKey ? { topicKey: helpKey } : {})} />
          </div>
          {description && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

