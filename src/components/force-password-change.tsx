import { useState, type ReactNode } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, useInvalidate, useProfile } from "@/lib/frotagov";
import { confirmPasswordChanged } from "@/lib/platform.functions";

/** Bloqueia o sistema até a troca da senha temporária no primeiro acesso. */
export function ForcePasswordChange({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useProfile();
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);

  if (isLoading || !me?.profile?.must_change_password) return <>{children}</>;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");
    if (password.length < 8) {
      toast.error("A nova senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSaving(false);
      toast.error("Não foi possível alterar a senha.");
      return;
    }
    try {
      await confirmPasswordChanged();
    } catch {
      /* o registro do evento não impede o acesso */
    }
    setSaving(false);
    toast.success("Senha alterada com sucesso.");
    invalidate(["profile"]);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-10">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-panel">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h1 className="gov-title text-lg">Troca de senha obrigatória</h1>
            <p className="text-xs text-muted-foreground">
              Defina uma senha pessoal para concluir o primeiro acesso.
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Nova senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmar nova senha</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            Salvar nova senha
          </Button>
        </form>
      </div>
    </div>
  );
}
