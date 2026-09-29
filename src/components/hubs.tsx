/**
 * Telas reunidas em abas: menos itens no menu, o mesmo conteúdo. Cada aba é a tela original
 * (carregada só quando aberta), e só aparece se o módulo estiver ligado para o órgão e o
 * perfil do usuário puder abri-lo.
 */
import { Suspense, lazy, useState, type ComponentType } from "react";

import { EmbeddedContext } from "@/components/embedded";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProfile, type AppRole } from "@/lib/frotagov";
import { useAccessOverrides, useModuleMap } from "@/lib/modulos";
import { roleCanOpen, type AccessOverrides } from "@/lib/permissoes";

type HubTab = { value: string; label: string; moduleKey: string; Panel: ComponentType };

/** Espera carregar o perfil do usuário antes de decidir quais abas mostrar. */
function TabHub(props: { tabs: HubTab[]; initial: string }) {
  const { data: me } = useProfile();
  const { isLoading } = useModuleMap();
  const { data: overrides, isLoading: loadingAccess } = useAccessOverrides();
  if (!me || isLoading || loadingAccess) return null;
  return <TabHubReady {...props} roles={me.roles ?? []} overrides={overrides ?? {}} />;
}

function TabHubReady({
  tabs,
  initial,
  roles,
  overrides,
}: {
  tabs: HubTab[];
  initial: string;
  roles: AppRole[];
  overrides: AccessOverrides;
}) {
  const { map } = useModuleMap();
  const isSuper = roles.includes("super_admin");

  const visible = tabs.filter(
    (t) => map[t.moduleKey] !== false && (isSuper || roleCanOpen(t.moduleKey, roles, overrides)),
  );
  const first = visible.find((t) => t.value === initial)?.value ?? visible[0]?.value ?? initial;
  const [tab, setTab] = useState(first);
  const current = visible.some((t) => t.value === tab) ? tab : first;

  if (visible.length === 0) return null;
  return (
    <Tabs value={current} onValueChange={setTab} className="space-y-4">
      {visible.length > 1 && (
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-surface p-1">
          {visible.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {visible.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-0">
          <EmbeddedContext.Provider value={visible.length > 1}>
            <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Carregando…</p>}>
              <t.Panel />
            </Suspense>
          </EmbeddedContext.Provider>
        </TabsContent>
      ))}
    </Tabs>
  );
}

const CotasPanel = lazy(() =>
  import("@/routes/_authenticated/cotas").then((m) => ({ default: m.CotasPanel })),
);
const CotasServidorPanel = lazy(() =>
  import("@/routes/_authenticated/cotas-servidor").then((m) => ({ default: m.CotasServidorPanel })),
);
const RedePanel = lazy(() =>
  import("@/routes/_authenticated/rede-credenciada").then((m) => ({
    default: m.RedeCredenciadaPanel,
  })),
);
const FornecedoresPanel = lazy(() =>
  import("@/routes/_authenticated/fornecedores").then((m) => ({ default: m.FornecedoresPanel })),
);
const GarantiasPanel = lazy(() =>
  import("@/routes/_authenticated/garantias").then((m) => ({ default: m.GarantiasPanel })),
);
const PrecosPanel = lazy(() =>
  import("@/routes/_authenticated/pesquisa-precos").then((m) => ({
    default: m.PesquisaPrecosPanel,
  })),
);
const RegrasPanel = lazy(() =>
  import("@/routes/_authenticated/regras-manutencao").then((m) => ({
    default: m.RegrasManutencaoPanel,
  })),
);

export function CotasHub({ initial = "cotas" }: { initial?: string }) {
  return (
    <TabHub
      initial={initial}
      tabs={[
        { value: "cotas", label: "Cotas e saldos", moduleKey: "cotas", Panel: CotasPanel },
        {
          value: "servidor",
          label: "Cotas de servidor",
          moduleKey: "cotas-servidor",
          Panel: CotasServidorPanel,
        },
      ]}
    />
  );
}

export function TerceirosHub({ initial = "oficinas" }: { initial?: string }) {
  return (
    <TabHub
      initial={initial}
      tabs={[
        {
          value: "oficinas",
          label: "Oficinas e prestadores",
          moduleKey: "rede-credenciada",
          Panel: RedePanel,
        },
        {
          value: "fornecedores",
          label: "Fornecedores e postos",
          moduleKey: "fornecedores",
          Panel: FornecedoresPanel,
        },
      ]}
    />
  );
}

export function ManutencaoApoioHub({ initial = "garantias" }: { initial?: string }) {
  return (
    <TabHub
      initial={initial}
      tabs={[
        { value: "garantias", label: "Garantias", moduleKey: "garantias", Panel: GarantiasPanel },
        {
          value: "precos",
          label: "Pesquisa de preços",
          moduleKey: "pesquisa-precos",
          Panel: PrecosPanel,
        },
        {
          value: "regras",
          label: "Regras de manutenção",
          moduleKey: "regras-manutencao",
          Panel: RegrasPanel,
        },
      ]}
    />
  );
}
