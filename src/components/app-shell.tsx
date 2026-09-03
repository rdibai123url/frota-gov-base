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
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
      { to: "/utilizacao", label: "Utilização e reservas" },
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
      { to: "/pecas", label: "Peças e acessórios" },
      { to: "/pneus", label: "Pneus" },
      { to: "/rede-credenciada", label: "Rede credenciada" },
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
      { to: "/entidades-externas", label: "Entidades externas" },
      { to: "/usuarios", label: "Usuários e Permissões" },
    ],
  },

  {
    id: "relatorios",
    label: "Relatórios e integrações",
    icon: FileBarChart,
    items: [
      { to: "/relatorios", label: "Relatórios avançados" },
      { to: "/transparencia", label: "Portal da Transparência" },
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
  manutencao: ["/cotacao/", "/ordem-servico/"],
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          if (group.to) {
            const active = pathname.startsWith(group.to);
            return (
              <Link
                key={group.id}
                to={group.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "opacity-80 hover:bg-sidebar-accent/60 hover:opacity-100",
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
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                  inGroup
                    ? "font-medium text-sidebar-accent-foreground opacity-100"
                    : "opacity-80 hover:opacity-100",
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
                          "block truncate rounded-md px-3 py-2 text-[13px] transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "opacity-75 hover:bg-sidebar-accent/50 hover:opacity-100",
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
          <div className="border-b bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground sm:px-6">
            Nenhum órgão em contexto. Selecione um órgão em Administração da Plataforma para operar
            as telas do órgão.
          </div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="gov-title text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
