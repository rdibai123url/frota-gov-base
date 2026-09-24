# FrotaGov

Software de gestão de frota e da execução/gestão dos contratos de peças, combustíveis e serviços para órgãos públicos brasileiros.

## Stack

- React 19
- TanStack Start / TanStack Router
- Vite
- Tailwind CSS
- Supabase (PostgreSQL, Auth, Storage e RLS)
- Drizzle ORM / Drizzle Kit

## Desenvolvimento local

Pré-requisitos: Node.js 20+ e npm.

```bash
npm install
npm run dev
```

Crie um `.env.local` a partir de `.env.example`.

## Variáveis de ambiente

Front-end:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Banco/migrations:

- `DATABASE_URL`

Nunca versione chaves privadas, service-role keys, senhas ou connection strings reais.

## Build

```bash
npm run build
```

## Deploy

O projeto está preparado para TanStack Start + Nitro em Vercel.

Importe o repositório na Vercel, configure as variáveis de ambiente e faça o deploy.

## Banco

O banco permanece no Supabase. As migrations ficam versionadas no repositório, enquanto os dados reais permanecem no PostgreSQL/Supabase.

## Desenvolvimento assistido por Codex

Este repositório está preparado para desenvolvimento assistido por Codex, com validação de lint e build antes do envio de alterações.
