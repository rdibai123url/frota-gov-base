import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — FrotaGov" },
      { name: "description", content: "Defina uma nova senha de acesso ao FrotaGov com segurança." },
      { property: "og:title", content: "Redefinir senha — FrotaGov" },
      { property: "og:description", content: "Página segura de redefinição de senha do FrotaGov." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

type State = "verificando" | "pronto" | "invalido" | "concluido";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("verificando");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) setState("pronto");
    });

    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const tokenHash = url.searchParams.get("token_hash");
      const code = url.searchParams.get("code");
      const errorDescription = hash.get("error_description") ?? url.searchParams.get("error_description");

      if (errorDescription) {
        if (active) setState("invalido");
        return;
      }

      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
        if (!active) return;
        setState(error ? "invalido" : "pronto");
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        setState(error ? "invalido" : "pronto");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setState(data.session ? "pronto" : "invalido");
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

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
    setSaving(false);
    if (error) {
      toast.error("Não foi possível redefinir a senha. Solicite um novo link de recuperação.");
      return;
    }
    await supabase.auth.signOut();
    setState("concluido");
    toast.success("Senha redefinida. Entre com a nova senha.");
    setTimeout(() => navigate({ to: "/auth", replace: true }), 1200);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="gov-title text-xl">FrotaGov</p>
            <p className="text-xs text-muted-foreground">Gestão de frotas públicas</p>
          </div>
        </Link>

        <div className="rounded-lg border bg-card p-6 shadow-panel">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <KeyRound className="size-5" />
            </div>
            <div>
              <h1 className="gov-title text-lg">Redefinir senha</h1>
              <p className="text-xs text-muted-foreground">
                Escolha uma nova senha de acesso ao sistema.
              </p>
            </div>
          </div>

          {state === "verificando" && (
            <p className="text-sm text-muted-foreground">Validando o link de recuperação…</p>
          )}

          {state === "invalido" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                O link de recuperação é inválido ou já expirou. Solicite um novo link na tela de acesso.
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Voltar ao login</Link>
              </Button>
            </div>
          )}

          {state === "concluido" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Senha redefinida com sucesso. Redirecionando para o login…
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Ir para o login</Link>
              </Button>
            </div>
          )}

          {state === "pronto" && (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rs-pass">Nova senha</Label>
                <Input
                  id="rs-pass"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <p className="text-[11px] text-muted-foreground">Mínimo de 8 caracteres.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rs-confirm">Confirmar nova senha</Label>
                <Input
                  id="rs-confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                Salvar nova senha
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
