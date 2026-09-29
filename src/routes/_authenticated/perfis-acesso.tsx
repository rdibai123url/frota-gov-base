import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AcessoPorUsuario } from "@/components/acesso-por-usuario";
import { EmbeddedContext } from "@/components/embedded";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ROLE_LABELS,
  dbMessage,
  supabase,
  useInvalidate,
  usePerms,
  type AppRole,
} from "@/lib/frotagov";
import { MODULES, useAccessOverrides, useModuleMap } from "@/lib/modulos";
import { ALWAYS_OPEN, defaultAllows } from "@/lib/permissoes";

export const Route = createFileRoute("/_authenticated/perfis-acesso")({
  head: () => ({
    meta: [
      { title: "Perfis de acesso — Dibai Fleet" },
      {
        name: "description",
        content: "Escolha quais telas cada perfil de usuário pode abrir no seu órgão.",
      },
    ],
  }),
  component: PerfisAcessoPagina,
});

/** Perfis ajustáveis (o administrador do órgão sempre tem acesso). */
const ROLES: AppRole[] = ["fleet_manager", "unit_manager", "operator", "auditor"];

function PorPerfil() {
  const { data: overrides = {} } = useAccessOverrides();
  const { map: enabled } = useModuleMap();
  const { orgId, userId, roles } = usePerms();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<string | null>(null);
  const isAdmin = roles.includes("org_admin") || roles.includes("super_admin");

  const list = MODULES.filter((m) => enabled[m.key] !== false && !ALWAYS_OPEN.includes(m.key));

  async function toggle(moduleKey: string, role: AppRole, current: boolean) {
    if (!orgId || !isAdmin) return;
    const cellId = `${moduleKey}:${role}`;
    setBusy(cellId);
    const next = !current;
    const sameAsDefault = next === defaultAllows(moduleKey, role);
    const q = sameAsDefault
      ? supabase.from("org_role_access").delete().eq("module_key", moduleKey).eq("role", role)
      : supabase.from("org_role_access").upsert(
          {
            organization_id: orgId,
            module_key: moduleKey,
            role,
            allowed: next,
            updated_by: userId,
          },
          { onConflict: "organization_id,module_key,role" },
        );
    const { error } = await q;
    setBusy(null);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    invalidate(["org-role-access"]);
  }

  async function reset() {
    if (!orgId) return;
    const { error } = await supabase.from("org_role_access").delete().eq("organization_id", orgId);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Voltou ao padrão do sistema.");
    invalidate(["org-role-access"]);
  }

  const groups = Array.from(new Set(list.map((m) => m.group)));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Perfis de acesso"
        description="Escolha quais telas cada perfil pode abrir. O administrador do órgão sempre tem acesso a tudo."
        action={
          isAdmin ? (
            <Button variant="outline" onClick={reset}>
              Voltar ao padrão
            </Button>
          ) : undefined
        }
      />
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground shadow-card">
        Marque a caixa para liberar a tela ao perfil. Desmarcar esconde a tela do menu e impede
        abrir pelo endereço. O que cada perfil pode <strong>gravar</strong> continua limitado pelas
        regras de segurança do sistema, mesmo que a tela esteja liberada.
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tela</TableHead>
              {ROLES.map((r) => (
                <TableHead key={r} className="text-center">
                  {ROLE_LABELS[r]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <>
                <TableRow key={`g-${g}`} className="bg-muted/40">
                  <TableCell
                    colSpan={ROLES.length + 1}
                    className="text-xs font-semibold uppercase tracking-wide"
                  >
                    {g}
                  </TableCell>
                </TableRow>
                {list
                  .filter((m) => m.group === g)
                  .map((m) => (
                    <TableRow key={m.key}>
                      <TableCell>{m.label}</TableCell>
                      {ROLES.map((r) => {
                        const value = overrides[m.key]?.[r] ?? defaultAllows(m.key, r);
                        const changed = overrides[m.key]?.[r] !== undefined;
                        return (
                          <TableCell key={r} className="text-center">
                            <input
                              type="checkbox"
                              aria-label={`${m.label} para ${ROLE_LABELS[r]}`}
                              checked={value}
                              disabled={!isAdmin || busy === `${m.key}:${r}`}
                              onChange={() => toggle(m.key, r, value)}
                            />
                            {changed && (
                              <span
                                className="ml-1 text-[0.625rem] text-primary"
                                title="Ajustado pelo administrador"
                              >
                                ●
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PerfisAcessoPagina() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Perfis de acesso"
        description="Escolha quais telas cada perfil e cada usuário pode abrir. O administrador do órgão sempre tem acesso a tudo."
      />
      <Tabs defaultValue="perfil" className="space-y-4">
        <TabsList>
          <TabsTrigger value="perfil">Por perfil</TabsTrigger>
          <TabsTrigger value="usuario">Por usuário</TabsTrigger>
        </TabsList>
        <TabsContent value="perfil" className="mt-0">
          <EmbeddedContext.Provider value={true}>
            <PorPerfil />
          </EmbeddedContext.Provider>
        </TabsContent>
        <TabsContent value="usuario" className="mt-0">
          <AcessoPorUsuario />
        </TabsContent>
      </Tabs>
    </div>
  );
}
