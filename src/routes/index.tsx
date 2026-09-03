import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Building2, Truck, Users, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FrotaGov — Gestão de frotas para órgãos públicos" },
      {
        name: "description",
        content:
          "Plataforma para prefeituras, câmaras, consórcios e autarquias gerirem veículos, secretarias e usuários com isolamento total de dados por órgão.",
      },
      { property: "og:title", content: "FrotaGov — Gestão de frotas para órgãos públicos" },
      {
        property: "og:description",
        content:
          "Cadastro do órgão, secretarias, veículos e permissões em um sistema multi-órgão seguro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Building2, title: "Estrutura administrativa", text: "Órgão, secretarias, departamentos e unidades organizados hierarquicamente." },
  { icon: Truck, title: "Frota cadastrada", text: "Veículos, máquinas e equipamentos com dados técnicos e situação operacional." },
  { icon: Users, title: "Perfis e permissões", text: "Administrador, gestor de frota, responsável de unidade, operador e controladoria." },
  { icon: Lock, title: "Isolamento por órgão", text: "Cada organização acessa exclusivamente os próprios dados, com trilha de auditoria." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <span className="gov-title text-lg">FrotaGov</span>
          </div>
          <Button asChild size="sm">
            <Link to="/auth">Acessar o sistema</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Software de gestão pública
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl">
          Gestão de frotas para prefeituras, câmaras, consórcios e autarquias
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          O FrotaGov centraliza o cadastro do órgão, das secretarias e da frota, com controle de
          acesso por perfil e isolamento total dos dados de cada organização.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth" search={{ modo: "cadastro" }}>
              Cadastrar meu órgão
            </Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-5 shadow-card">
              <f.icon className="size-5 text-accent" />
              <h2 className="gov-title mt-3 text-base">{f.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        FrotaGov · Fase 1 — base funcional para gestão de frotas públicas
      </footer>
    </div>
  );
}
