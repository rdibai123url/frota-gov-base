# Migração do FrotaGov para funcionamento independente do Lovable

## Substituir
- `package.json`
- `vite.config.ts`
- `drizzle.config.ts`
- `src/integrations/supabase/client.ts`
- `src/routes/__root.tsx`
- `README.md`

## Criar
- `.env.example`
- `vercel.json`

## Excluir
- `.env.exemple`
- `AGENTS.md`
- `.lovable/`
- `src/lib/lovable-error-reporting.ts`
- `src/integrations/supabase/previewAuthStorage.ts`

## Depois das alterações
1. Execute `npm install` para atualizar o lockfile.
2. Execute `npm run build`.
3. Execute `npm run lint` (recomendado).
4. Configure na Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Para rodar migrations fora da Vercel, configure `DATABASE_URL` apenas no ambiente seguro de administração/CI.
6. Não coloque `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ou senhas com prefixo `VITE_`.

## Observação
O banco permanece no Supabase. Este pacote remove dependências diretas do Lovable da camada de build, autenticação de preview e tratamento de erro.
