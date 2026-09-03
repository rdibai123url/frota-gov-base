import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    modo: search["modo"] === "cadastro" ? "cadastro" : "entrar",
  }),
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

const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(3, "Informe seu nome completo").max(120),
  orgName: z.string().trim().min(3, "Informe o nome oficial do órgão").max(180),
});

function AuthPage() {
  const navigate = useNavigate();
  const { modo } = Route.useSearch();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/painel", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) return toast.error("Não foi possível entrar: verifique e-mail e senha.");
    navigate({ to: "/painel", replace: true });
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
      fullName: form.get("fullName"),
      orgName: form.get("orgName"),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: parsed.data.fullName, org_name: parsed.data.orgName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (!data.session) {
      toast.success("Cadastro realizado. Confirme o e-mail enviado para ativar o acesso.");
      return;
    }
    navigate({ to: "/painel", replace: true });
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) return toast.error("Falha ao entrar com Google.");
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
            <Tabs defaultValue={modo}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="entrar">Entrar</TabsTrigger>
                <TabsTrigger value="cadastro">Cadastrar órgão</TabsTrigger>
              </TabsList>

              <TabsContent value="entrar">
                <form onSubmit={handleSignIn} className="space-y-4 pt-4">
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
              </TabsContent>

              <TabsContent value="cadastro">
                <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="up-org">Nome oficial do órgão</Label>
                    <Input id="up-org" name="orgName" placeholder="Prefeitura Municipal de ..." required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="up-name">Seu nome completo</Label>
                    <Input id="up-name" name="fullName" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="up-email">E-mail institucional</Label>
                    <Input id="up-email" name="email" type="email" autoComplete="email" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="up-pass">Senha</Label>
                    <Input id="up-pass" name="password" type="password" autoComplete="new-password" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Criar órgão e conta de administrador
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" onClick={handleGoogle}>
              Continuar com Google
            </Button>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Acesso restrito a servidores e gestores autorizados do órgão.
          </p>
        </div>
      </div>
    </div>
  );
}
