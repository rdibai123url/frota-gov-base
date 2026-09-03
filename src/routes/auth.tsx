import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  // Renderização apenas no cliente: evita divergência de hidratação causada pelo
  // formulário controlado (ids gerados) e por extensões de navegador que alteram o DOM.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acesso ao sistema — FrotaGov" },
      { name: "description", content: "Entre no FrotaGov ou cadastre seu órgão público para gerir a frota." },
      { property: "og:title", content: "Acesso ao sistema — FrotaGov" },
      { property: "og:description", content: "Autenticação segura para gestores de frota de órgãos públicos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const signInSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(255),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres").max(72),
});

const emailSchema = z.string().trim().email("Informe um e-mail válido").max(255);

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "recuperar">("login");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate({ to: "/redefinir-senha", replace: true });
        return;
      }
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/painel", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleRecover(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = emailSchema.safeParse(form.get("email"));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "E-mail inválido");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setSending(false);
    if (error) {
      toast.error("Não foi possível enviar o e-mail de recuperação. Tente novamente em instantes.");
      return;
    }
    setSent(true);
    toast.success("Se o e-mail estiver cadastrado, enviaremos o link de recuperação.");
  }


  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar: verifique e-mail e senha.");
      return;
    }
    navigate({ to: "/painel", replace: true });
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Falha ao entrar com Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
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
            {mode === "login" ? (
              <>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="in-email">E-mail institucional</Label>
                    <Input id="in-email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="in-pass">Senha</Label>
                    <Input id="in-pass" name="password" type="password" autoComplete="current-password" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Entrar
                  </Button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setMode("recuperar");
                  }}
                  className="mt-3 w-full text-center text-xs text-primary underline-offset-4 hover:underline"
                >
                  Esqueci minha senha
                </button>

                <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
                </div>
                <Button variant="outline" className="w-full" onClick={handleGoogle}>
                  Continuar com Google
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="gov-title text-lg">Recuperar acesso</h2>
                  <p className="text-xs text-muted-foreground">
                    Informe seu e-mail institucional para receber o link de redefinição de senha.
                  </p>
                </div>
                {sent ? (
                  <p className="rounded-md bg-secondary/60 p-3 text-sm text-muted-foreground">
                    Se o e-mail informado estiver cadastrado, o link de redefinição foi enviado. Verifique
                    também a caixa de spam. O link tem validade limitada.
                  </p>
                ) : (
                  <form onSubmit={handleRecover} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="rec-email">E-mail institucional</Label>
                      <Input id="rec-email" name="email" type="email" autoComplete="email" required />
                    </div>
                    <Button type="submit" className="w-full" disabled={sending}>
                      Enviar link de recuperação
                    </Button>
                  </form>
                )}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="w-full text-center text-xs text-primary underline-offset-4 hover:underline"
                >
                  Voltar ao login
                </button>
              </div>
            )}
          </div>


          <p className="mt-4 text-center text-xs text-muted-foreground">
            Acesso restrito a servidores e gestores autorizados. O cadastro de órgãos e do
            administrador principal é feito pela administração da plataforma; novos usuários são
            cadastrados pelo administrador do próprio órgão.
          </p>
        </div>
      </div>
    </div>
  );
}
