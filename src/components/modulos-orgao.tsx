/** Bloco 6.1 — Super Admin habilita/desabilita módulos do Dibai Fleet por órgão. */
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LicencaOrgao } from "@/components/licenca-orgao";
import { dbMessage, supabase, useInvalidate } from "@/lib/frotagov";
import { useAllOrganizations } from "@/lib/platform";
import {
  DEFAULT_DISABLED,
  FEATURES,
  MODULE_PRESETS,
  MODULES,
  featureModuleKey,
  MODULE_GROUPS,
  buildModuleMap,
  useOrganizationModules,
} from "@/lib/modulos";

export function ModulesTab() {
  const { data: orgs = [] } = useAllOrganizations();
  const [orgId, setOrgId] = useState<string>("");
  const { data: rows = [], isLoading } = useOrganizationModules(orgId || null);
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState<string | null>(null);

  const map = useMemo(
    () => buildModuleMap(orgId ? rows.filter((r) => r.organization_id === orgId) : []),
    [rows, orgId],
  );

  async function setEnabled(moduleKey: string, enabled: boolean) {
    if (!orgId) return;
    setBusy(moduleKey);
    const { error } = await supabase
      .from("organization_modules")
      .upsert(
        { organization_id: orgId, module_key: moduleKey, enabled },
        { onConflict: "organization_id,module_key" },
      );
    setBusy(null);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(
      enabled
        ? "Módulo habilitado para o órgão."
        : "Módulo desabilitado — os dados ficam preservados.",
    );
    invalidate(["organization-modules"]);
  }

  async function setFeature(key: string, enabled: boolean) {
    if (!orgId) return;
    const module_key = featureModuleKey(key);
    setBusy(module_key);
    const { error } = await supabase
      .from("organization_modules")
      .upsert(
        { organization_id: orgId, module_key, enabled },
        { onConflict: "organization_id,module_key" },
      );
    setBusy(null);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(enabled ? "Função ligada." : "Função desligada para este órgão.");
    invalidate(["organization-modules"]);
  }

  async function applyPreset(id: string) {
    const preset = MODULE_PRESETS.find((p) => p.id === id);
    if (!orgId || !preset) return;
    const list = MODULES.filter((m) => !m.essential).map((m) => ({
      organization_id: orgId,
      module_key: m.key,
      enabled: preset.groups.includes(m.group)
        ? DEFAULT_DISABLED.includes(m.key)
          ? !!map[m.key]
          : true
        : false,
    }));
    setBusy("preset");
    const { error } = await supabase
      .from("organization_modules")
      .upsert(list, { onConflict: "organization_id,module_key" });
    setBusy(null);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success(`Pacote “${preset.label}” aplicado.`);
    invalidate(["organization-modules"]);
  }

  async function setGroup(group: string, enabled: boolean) {
    if (!orgId) return;
    const keys = MODULES.filter((m) => m.group === group && !m.essential).map((m) => m.key);
    setBusy(group);
    const { error } = await supabase.from("organization_modules").upsert(
      keys.map((module_key) => ({ organization_id: orgId, module_key, enabled })),
      { onConflict: "organization_id,module_key" },
    );
    setBusy(null);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    invalidate(["organization-modules"]);
  }

  return (
    <div className="space-y-5">
      <div className="max-w-md">
        <Label>Órgão</Label>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o órgão para configurar" />
          </SelectTrigger>
          <SelectContent>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.legal_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-xs text-muted-foreground">
          Desabilitar um módulo remove a aba do menu daquele órgão e bloqueia o acesso direto pela
          rota. Nenhum dado é apagado: ao reabilitar, tudo volta a ficar acessível. Toda alteração
          fica registrada na auditoria com autor, data e órgão.
        </p>
      </div>

      {orgId && <LicencaOrgao orgId={orgId} />}

      {orgId && !isLoading && (
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <p className="gov-title text-sm">Pacotes prontos</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Um clique liga só as abas do pacote e desliga as demais. Depois você ainda pode ajustar
            aba por aba e função por função. Nenhum dado é apagado.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODULE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy === "preset"}
                onClick={() => {
                  if (window.confirm(`Aplicar “${p.label}” a este órgão?`)) void applyPreset(p.id);
                }}
                className="rounded-lg border p-3 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"
              >
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block text-xs text-muted-foreground">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!orgId && (
        <p className="text-sm text-muted-foreground">
          Selecione um órgão para ver a matriz de módulos.
        </p>
      )}
      {orgId && isLoading && (
        <p className="text-sm text-muted-foreground">Carregando configuração…</p>
      )}

      {orgId &&
        !isLoading &&
        MODULE_GROUPS.map((group) => {
          const mods = MODULES.filter((m) => m.group === group);
          return (
            <div key={group} className="rounded-lg border bg-card shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <p className="gov-title text-sm">{group}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === group}
                    onClick={() => setGroup(group, true)}
                  >
                    Habilitar grupo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === group}
                    onClick={() => setGroup(group, false)}
                  >
                    Desabilitar grupo
                  </Button>
                </div>
              </div>
              <div className="divide-y">
                {mods.map((mod) => (
                  <div key={mod.key} className="pb-2">
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{mod.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {mod.essential
                            ? "Módulo estrutural — sempre disponível"
                            : DEFAULT_DISABLED.includes(mod.key)
                              ? "Desabilitado por padrão em novos órgãos"
                              : mod.routes[0]}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {map[mod.key] ? (
                          <Badge variant="secondary">Habilitado</Badge>
                        ) : (
                          <Badge variant="outline">Desabilitado</Badge>
                        )}
                        <Switch
                          checked={!!map[mod.key]}
                          disabled={mod.essential || busy === mod.key}
                          onCheckedChange={(v) => setEnabled(mod.key, v)}
                          aria-label={`Habilitar ${mod.label}`}
                        />
                      </div>
                    </div>
                    {FEATURES.filter((f) => f.module === mod.key).map((f) => (
                      <div
                        key={f.key}
                        className={`ml-4 flex items-center justify-between gap-3 border-l-2 border-primary/20 pl-4 pt-2 ${map[mod.key] ? "" : "opacity-50"}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm">Função: {f.label}</p>
                          <p className="text-xs text-muted-foreground">{f.hint}</p>
                        </div>
                        <Switch
                          checked={map[featureModuleKey(f.key)] !== false}
                          disabled={!map[mod.key] || busy === featureModuleKey(f.key)}
                          onCheckedChange={(v) => setFeature(f.key, v)}
                          aria-label={`Ligar função ${f.label}`}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
