/** Super Admin define o plano de licença do órgão/empresa: limites de veículos e de usuários. */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { dbMessage, useInvalidate, usePerms } from "@/lib/frotagov";

const PLANOS = [
  { nome: "Até 10 veículos", veiculos: 10, usuarios: 2 },
  { nome: "Até 25 veículos", veiculos: 25, usuarios: 4 },
  { nome: "Até 50 veículos", veiculos: 50, usuarios: 8 },
  { nome: "Até 100 veículos", veiculos: 100, usuarios: 15 },
];

export function LicencaOrgao({ orgId }: { orgId: string }) {
  const { userId } = usePerms();
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<{
    plan: string;
    vehicles: string;
    users: string;
    until: string;
    notes: string;
  } | null>(null);

  const q = useQuery({
    queryKey: ["organization-license", orgId],
    queryFn: async () => {
      const [lic, veh, usr] = await Promise.all([
        supabase
          .from("organization_license")
          .select("*")
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("vehicles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
      ]);
      if (lic.error) throw lic.error;
      return { lic: lic.data, vehicles: veh.count ?? 0, users: usr.count ?? 0 };
    },
  });

  const lic = q.data?.lic ?? null;
  const f = fields ?? {
    plan: lic?.plan_name ?? "Personalizado",
    vehicles: lic?.max_vehicles?.toString() ?? "",
    users: lic?.max_users?.toString() ?? "",
    until: lic?.valid_until ?? "",
    notes: lic?.notes ?? "",
  };
  const set = (patch: Partial<typeof f>) => setFields({ ...f, ...patch });

  async function save() {
    const toInt = (t: string) => (t.trim() === "" ? null : Math.max(1, Math.round(Number(t))));
    setSaving(true);
    const { error } = await supabase.from("organization_license").upsert(
      {
        organization_id: orgId,
        plan_name: f.plan.trim() || "Personalizado",
        max_vehicles: toInt(f.vehicles),
        max_users: toInt(f.users),
        valid_until: f.until || null,
        notes: f.notes.trim() || null,
        updated_by: userId,
      },
      { onConflict: "organization_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(dbMessage(error));
      return;
    }
    toast.success("Licença salva.");
    setFields(null);
    invalidate(["organization-license"]);
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
      <h3 className="text-base font-semibold">Licença e plano</h3>
      <p className="text-[13px] text-muted-foreground">
        Deixe os limites em branco para não limitar. Ao atingir o limite, o sistema impede novos
        cadastros de veículos ou de usuários e avisa para solicitar ampliação.
      </p>
      {q.data && (
        <p className="text-sm">
          Uso atual: <strong>{q.data.vehicles}</strong> veículo(s) e <strong>{q.data.users}</strong>{" "}
          usuário(s).
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {PLANOS.map((p) => (
          <Button
            key={p.nome}
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              set({ plan: p.nome, vehicles: String(p.veiculos), users: String(p.usuarios) })
            }
          >
            {p.nome}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="lic-plano">Nome do plano</Label>
          <Input id="lic-plano" value={f.plan} onChange={(e) => set({ plan: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lic-veic">Máximo de veículos</Label>
          <Input
            id="lic-veic"
            inputMode="numeric"
            value={f.vehicles}
            onChange={(e) => set({ vehicles: e.target.value.replace(/\D/g, "") })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lic-usu">Máximo de usuários</Label>
          <Input
            id="lic-usu"
            inputMode="numeric"
            value={f.users}
            onChange={(e) => set({ users: e.target.value.replace(/\D/g, "") })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lic-ate">Licença válida até</Label>
          <Input
            id="lic-ate"
            type="date"
            value={f.until}
            onChange={(e) => set({ until: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lic-obs">Observações</Label>
        <Input id="lic-obs" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <Button onClick={save} disabled={saving}>
        Salvar licença
      </Button>
    </div>
  );
}
