import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, UserRound } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, useProfile, ROLE_LABELS } from "@/lib/frotagov";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil e segurança — FrotaGov" },
      {
        name: "description",
        content: "Consulte seus dados de acesso e altere a senha da sua conta no FrotaGov.",
      },
      { property: "og:title", content: "Perfil e segurança — FrotaGov" },
      { property: "og:description", content: "Dados do usuário e alteração de senha no FrotaGov." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const { data: me } = useProfile();
  const [saving, setSaving] = useState(false);

  const roleLabel = me?.roles?.[0] ? ROLE_LABELS[me.roles[0]] : "Sem perfil atribuído";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const current = String(form.get("current") || "");
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");

    if (!current) {
      toast.error("Informe a senha atual.");
      return;
    }
    if (password.length < 8) {
      toast.error("A nova senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (password === current) {
      toast.error("A nova senha deve ser diferente da atual.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      password,
      current_password: current,
    } as never);
    setSaving(false);
    if (error) {
      const msg = /current password|invalid|credentials/i.test(error.message)
        ? "A senha atual informada está incorreta."
        : "Não foi possível alterar a senha.";
      toast.error(msg);
      return;
    }
    formEl.reset();
    toast.success("Senha alterada com sucesso.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfil e segurança"
        description="Consulte seus dados de acesso e mantenha sua senha atualizada."
      />

      <section className="rounded-lg border bg-card p-6 shadow-panel">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <UserRound className="size-5" />
          </div>
          <h2 className="gov-title text-lg">Meus dados</h2>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Nome</dt>
            <dd className="text-sm">{me?.profile?.full_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">E-mail</dt>
            <dd className="text-sm">{me?.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Cargo</dt>
            <dd className="text-sm">{me?.profile?.job_title || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Perfil de acesso
            </dt>
            <dd className="text-sm">{roleLabel}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-panel">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h2 className="gov-title text-lg">Alterar senha</h2>
            <p className="text-xs text-muted-foreground">
              Por segurança, confirme a senha atual antes de definir a nova.
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pf-current">Senha atual</Label>
            <Input
              id="pf-current"
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-pass">Nova senha</Label>
            <Input
              id="pf-pass"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="text-[11px] text-muted-foreground">Mínimo de 8 caracteres.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-confirm">Confirmar nova senha</Label>
            <Input
              id="pf-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" disabled={saving}>
            Alterar senha
          </Button>
        </form>
      </section>
    </div>
  );
}
