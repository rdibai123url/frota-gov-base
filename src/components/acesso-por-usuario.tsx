/**
 * Acesso por usuário: o gestor escolhe uma pessoa e liga ou desliga cada tela só para ela.
 * Quem acabou de ser cadastrado começa com o acesso do perfil; aqui o gestor libera mais ou
 * menos telas para esse usuário em particular.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, dbMessage, useInvalidate, useOrgUsers, usePerms } from "@/lib/frotagov";
import { MODULES, useAccessOverrides, useModuleMap } from "@/lib/modulos";
import { ALWAYS_OPEN, roleCanOpen } from "@/lib/permissoes";

function useUserOverrides(userId: string) {
  return useQuery({
    queryKey: ["user-module-access", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_module_access")
        .select("module_key, allowed")
        .eq("user_id", userId);
      if (error) throw error;
      const out: Record<string, boolean> = {};
      for (const r of data ?? []) out[r.module_key] = r.allowed;
      return out;
    },
  });
}

export function AcessoPorUsuario() {
  const { orgId, userId: me, roles } = usePerms();
  const isAdmin = roles.includes("org_admin") || roles.includes("super_admin");
  const { data: users = [] } = useOrgUsers();
  const { data: orgOverrides = {} } = useAccessOverrides();
  const { map: enabled } = useModuleMap();
  const invalidate = useInvalidate();
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data: mine = {} } = useUserOverrides(userId);

  const user = users.find((u) => u.id === userId) ?? null;
  const list = useMemo(
    () => MODULES.filter((m) => enabled[m.key] !== false && !ALWAYS_OPEN.includes(m.key)),
    [enabled],
  );
  const groups = Array.from(new Set(list.map((m) => m.group)));
  const changed = Object.keys(mine).length;

  async function toggle(moduleKey: string, current: boolean) {
    if (!orgId || !user || !isAdmin) return;
    setBusy(moduleKey);
    const next = !current;
    // o que valeria sem a escolha para esta pessoa (perfil + regras do órgão)
    const baseline = roleCanOpen(moduleKey, user.roles, orgOverrides, {});
    const { error } =
      next === baseline
        ? await supabase
            .from("user_module_access")
            .delete()
            .eq("user_id", user.id)
            .eq("module_key", moduleKey)
        : await supabase.from("user_module_access").upsert(
            {
              organization_id: orgId,
              user_id: user.id,
              module_key: moduleKey,
              allowed: next,
              updated_by: me,
            },
            { onConflict: "user_id,module_key" },
          );
    setBusy(null);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    invalidate(["user-module-access", "my-module-access"]);
  }

  async function reset() {
    if (!user) return;
    const { error } = await supabase.from("user_module_access").delete().eq("user_id", user.id);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Este usuário voltou ao acesso do perfil.");
    invalidate(["user-module-access", "my-module-access"]);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground shadow-card">
        Escolha um usuário e ligue ou desligue cada tela só para ele. Quem acaba de ser cadastrado
        começa com o acesso do perfil (definido na aba “Por perfil”). Aqui você libera mais ou menos
        telas para essa pessoa, sem mudar o perfil dos demais.
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full max-w-sm space-y-1.5">
          <Label>Usuário</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o usuário" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name || u.email} —{" "}
                  {u.roles.map((r) => ROLE_LABELS[r]).join(", ") || "sem perfil"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {user && changed > 0 && isAdmin && (
          <Button variant="outline" onClick={reset}>
            Voltar ao acesso do perfil ({changed} ajuste{changed > 1 ? "s" : ""})
          </Button>
        )}
      </div>

      {!user && (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
          Selecione um usuário para ver e ajustar as telas dele.
        </p>
      )}

      {user && (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g} className="rounded-lg border bg-card shadow-card">
              <h3 className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g}
              </h3>
              <ul className="divide-y">
                {list
                  .filter((m) => m.group === g)
                  .map((m) => {
                    const value = roleCanOpen(m.key, user.roles, orgOverrides, mine);
                    const custom = mine[m.key] !== undefined;
                    return (
                      <li
                        key={m.key}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <span className="min-w-0 text-sm">
                          {m.label}
                          {custom && (
                            <Badge variant="outline" className="ml-2 text-[0.65rem]">
                              ajustado para este usuário
                            </Badge>
                          )}
                        </span>
                        <Switch
                          checked={value}
                          disabled={!isAdmin || busy === m.key}
                          onCheckedChange={() => toggle(m.key, value)}
                          aria-label={`${m.label} para ${user.full_name ?? user.email}`}
                        />
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
