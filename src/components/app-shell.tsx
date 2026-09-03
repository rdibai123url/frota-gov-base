import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Truck,
  Building2,
  Users,
  Landmark,
  Fuel,
  Store,
  Droplets,
  BellRing,
  IdCard,
  CalendarClock,
  Ticket,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase, useBrasaoUrl, useOrganization, useProfile, ROLE_LABELS } from "@/lib/frotagov";

const NAV = [
  { to: "/painel", label: "Painel", icon: LayoutDashboard },
  { to: "/veiculos", label: "Veículos", icon: Truck },
  { to: "/condutores", label: "Condutores", icon: IdCard },
  { to: "/utilizacao", label: "Utilização e reservas", icon: CalendarClock },
  { to: "/autorizacoes", label: "Autorizações", icon: Ticket },
  { to: "/abastecimentos", label: "Abastecimentos", icon: Fuel },
  { to: "/alertas", label: "Alertas e inconsistências", icon: BellRing },
  { to: "/fornecedores", label: "Fornecedores / Postos", icon: Store },
  { to: "/combustiveis", label: "Combustíveis", icon: Droplets },
  { to: "/unidades", label: "Secretarias / Unidades", icon: Building2 },
  { to: "/usuarios", label: "Usuários e permissões", icon: Users },
  { to: "/orgao", label: "Dados do Órgão", icon: Landmark },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: org } = useOrganization();
  const { data: me } = useProfile();
  const { data: brasao } = useBrasaoUrl(org?.logo_url);

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

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "opacity-80 hover:bg-sidebar-accent/60 hover:opacity-100",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4 text-xs">
        <p className="truncate font-medium">{me?.profile?.full_name || me?.email}</p>
        <p className="mt-0.5 truncate opacity-70">{primaryRoleLabel}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="mt-3 w-full justify-start gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent"
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
