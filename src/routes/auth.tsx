import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { FleetIllustration } from "@/components/illustrations";
import { PasswordInput } from "@/components/password-input";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  checkLoginLock,
  listInstitutionalLogins,
  recordLoginEvent,
} from "@/lib/identidade.functions";

export const Route = createFileRoute("/auth")({
  // Renderização apenas no cliente: evita divergência de hidratação causada pelo
  // formulário controlado (ids gerados) e por extensões de navegador que alteram o DOM.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acesso ao sistema — Dibai Fleet" },
      {
        name: "description",
        content: "Entre no Dibai Fleet ou cadastre seu órgão público para gerir a frota.",
      },
      { property: "og:title", content: "Acesso ao sistema — Dibai Fleet" },
      {
        property: "og:description",
        content: "Autenticação segura para gestores de frota de órgãos públicos.",
      },
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
  const [institucionais, setInstitucionais] = useState<
    { id: string; name: string; protocol: string; domains: string[] }[]
  >([]);
  const listLogins = useServerFn(listInstitutionalLogins);
  const logLogin = useServerFn(recordLoginEvent);
  const lockCheck = useServerFn(checkLoginLock);

  // Logins institucionais ativos do órgão (quando houver). Sem provedor
  // configurado, apenas o acesso padrão é exibido.
  useEffect(() => {
    listLogins({ data: {} })
      .then(setInstitucionais)
      .catch(() => setInstitucionais([]));
  }, [listLogins]);

  async function entrarInstitucional(p: { name: string; protocol: string; domains: string[] }) {
    const domain = p.domains[0];
    if (p.protocol !== "saml" || !domain) {
      toast.info(
        `${p.name}: a entrada institucional é concluída pelo provedor do órgão. Enquanto a habilitação não estiver ativa, use e-mail e senha.`,
      );
      return;
    }
    const { data, error } = await supabase.auth.signInWithSSO({ domain });
    if (error || !data?.url) {
      await logLogin({
        data: {
          method: "saml",
          success: false,
          reason: error?.message ?? "Provedor não habilitado",
        },
      });
      toast.error("O login institucional ainda não está habilitado para este domínio.");
      return;
    }
    window.location.href = data.url;
  }

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
    try {
      const lock = await lockCheck({ data: { email: parsed.data.email } });
      if (lock.locked) {
        setLoading(false);
        toast.error(
          `Muitas tentativas com senha incorreta. Aguarde ${lock.minutes} minutos ou use "Esqueci minha senha".`,
        );
        return;
      }
    } catch {
      /* falha na verificação não impede o acesso legítimo */
    }
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      console.error("Erro de login Supabase:", error);
      logLogin({
        data: {
          email: parsed.data.email,
          method: "senha",
          success: false,
          reason: "senha incorreta",
        },
      }).catch(() => undefined);
      toast.error("E-mail ou senha incorretos.");
      return;
    }
    logLogin({ data: { email: parsed.data.email, method: "senha", success: true } }).catch(
      () => undefined,
    );
    navigate({ to: "/painel", replace: true });
  }

  async function handleGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/painel`,
      },
    });

    if (error) {
      toast.error("Falha ao entrar com Google.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40 lg:grid lg:grid-cols-[1.15fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0b2545] p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(600px_400px_at_10%_0%,rgba(47,109,246,0.45),transparent),radial-gradient(500px_400px_at_100%_100%,rgba(47,109,246,0.25),transparent)]"
        />
        <div className="relative flex items-center gap-3">
          <BrandMark className="size-11" />
          <p className="gov-title text-2xl">Dibai Fleet</p>
        </div>
        <FleetIllustration className="relative -mb-4 max-w-md opacity-95" />
        <div className="relative max-w-lg space-y-6">
          <h1 className="gov-title text-4xl leading-tight">
            Toda a sua frota sob controle, do abastecimento à prestação de contas.
          </h1>
          <ul className="space-y-3 text-[0.9375rem] text-white/85">
            {[
              "Abastecimento, manutenção, viagens e checklist em um só lugar",
              "Contratos, empenhos e cotas com bloqueio automático de saldo",
              "Dashboard com custo por km, alertas de vencimento e relatórios",
              "Portal da transparência e prestação de contas para o Tribunal de Contas",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#7fb0ff]" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">
          Dibai Soluções Integradas — tecnologia para gestão pública e privada.
        </p>
      </aside>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 flex items-center justify-center gap-3 lg:hidden">
            <BrandMark className="size-10" />
            <div>
              <p className="gov-title text-xl">Dibai Fleet</p>
              <p className="text-xs text-muted-foreground">Gestão de frotas e ativos</p>
            </div>
          </Link>

          <div className="rounded-xl border bg-card p-6 shadow-panel sm:p-8">
            {mode === "login" ? (
              <>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="in-email">E-mail institucional</Label>
                    <Input id="in-email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="in-pass">Senha</Label>
                    <PasswordInput
                      id="in-pass"
                      name="password"
                      autoComplete="current-password"
                      required
                    />
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
                  <span className="h-px flex-1 bg-border" /> ou{" "}
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button variant="outline" className="w-full" onClick={handleGoogle}>
                  Continuar com Google
                </Button>

                {institucionais.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {institucionais.map((p) => (
                      <Button
                        key={p.id}
                        variant="outline"
                        className="w-full"
                        onClick={() => void entrarInstitucional(p)}
                      >
                        Entrar com {p.name}
                      </Button>
                    ))}
                    <p className="text-center text-xs text-muted-foreground">
                      Login institucional configurado pelo seu órgão. O acesso por e-mail e senha
                      continua disponível.
                    </p>
                  </div>
                )}
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
                    Se o e-mail informado estiver cadastrado, o link de redefinição foi enviado.
                    Verifique também a caixa de spam. O link tem validade limitada.
                  </p>
                ) : (
                  <form onSubmit={handleRecover} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="rec-email">E-mail institucional</Label>
                      <Input
                        id="rec-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                      />
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
