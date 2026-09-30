# FrotaGov - Regras de trabalho do Codex

## Fluxo Git

- Nunca desenvolver diretamente na branch main.
- Antes de qualquer alteração, confirmar que a árvore de trabalho está limpa.
- Criar uma branch específica para cada tarefa.
- Usar nomes claros, preferencialmente:
  - codex/feature-...
  - codex/fix-...
  - codex/refactor-...
  - codex/security-...
- Não fazer merge na main sem autorização expressa do usuário.
- Não usar force push.
- Não reescrever histórico publicado.
- Depois de alterações aprovadas e testes concluídos, pode fazer commit e push da branch.

## Antes de alterar

- Ler os arquivos relacionados à tarefa.
- Verificar o modelo de dados e migrations relacionadas quando houver alteração de banco.
- Preservar padrões e funcionalidades existentes.
- Não substituir arquivos inteiros desnecessariamente.
- Evitar mudanças fora do escopo solicitado.

## Validação obrigatória

Depois de qualquer alteração de código:

- executar npm run lint
- executar npm run build
- executar testes aplicáveis, quando existirem
- corrigir erros introduzidos pela alteração
- informar warnings relevantes

## Supabase e banco

- Nunca executar comandos destrutivos em produção sem autorização expressa.
- Nunca apagar dados reais.
- Nunca executar reset do banco de produção.
- Alterações estruturais devem ser feitas por migrations versionadas.
- Revisar RLS, isolamento por organization_id e permissões sempre que houver tabelas ou funções novas.
- SECURITY DEFINER deve ser usado somente quando necessário e com grants/revokes explícitos.
- Nunca expor SUPABASE_SERVICE_ROLE_KEY no frontend.
- Nunca colocar credenciais privadas em arquivos versionados.

## Segurança

- Nunca versionar .env ou credenciais reais.
- Não colocar secrets em arquivos com prefixo VITE_.
- Preservar isolamento entre órgãos.
- Considerar o FrotaGov um sistema multi-tenant para órgãos públicos.
- Mudanças de autorização, autenticação, RLS, storage e API devem receber atenção especial.

## Operações críticas

Pedir autorização expressa antes de:

- merge na main
- deploy manual em produção
- exclusão permanente de dados
- restauração de backup
- alteração destrutiva do banco
- rotação de chaves
- remoção de migrations já aplicadas
- alteração de histórico Git

## Uploads e Storage

- Evitar arquivos órfãos.
- Em substituições, só remover o arquivo anterior após sucesso do novo registro.
- Se a operação de banco falhar após upload, remover o novo arquivo.
- Manter buckets privados quando o conteúdo não for público.

## Qualidade

- Não usar any sem necessidade.
- Manter TypeScript tipado.
- Evitar duplicação.
- Preservar padrões de UI existentes.
- Não alterar regras de negócio sem solicitação.
- Para valores monetários, quilometragem, estoque e contratos, validar também no banco quando a regra for crítica.

## Relatório final da tarefa

Ao terminar uma tarefa, informar:

- branch utilizada
- arquivos alterados
- migrations criadas
- testes executados
- resultado do lint
- resultado do build
- riscos ou pendências
- commit criado
- push realizado
