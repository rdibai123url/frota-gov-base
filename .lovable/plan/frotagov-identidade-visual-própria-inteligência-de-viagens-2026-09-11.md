# FrotaGov — identidade visual própria + inteligência de viagens

Duas frentes grandes. Proponho executar em 4 entregas incrementais, sem tocar em regra de negócio, banco existente, RLS ou rotas atuais (salvo campos aditivos de viagem).

## Inventário (o que já existe e será reaproveitado)

- Menu lateral com grupos recolhíveis, filtro por módulos do órgão e barra superior com brasão — em `src/components/app-shell.tsx` (será redesenhado, não recriado).
- Painel com muitos indicadores já calculados a partir de hooks reais (`useVehicles`, `useContracts`, `useFuelings`, `useMaintenanceRecords`, `useQuotas`, `useCommitments`, etc.) — a lógica de cálculo é preservada; muda a apresentação.
- Cards de resumo compactos já existem (`src/components/summary-cards.tsx`).
- Geocodificação pública com cache, timeout e correção manual já existe (`src/lib/geocode.functions.ts`, `geocode.ts`, tabela `geocode_cache`) — a rota rodoviária reaproveita esse padrão.
- Mapa de prestadores por órgão já existe (`mapa-rede.tsx`, `rede-map.tsx`) — o mapa de rota reaproveita o mesmo componente base.
- Viagens já têm origem/destino (cidade/UF), km inicial/final, status e unidade em `vehicle_usages`; faltam distância, duração e estimativas.
- Ajuda contextual centralizada em `src/lib/ajuda.ts`.

Nada disso será duplicado.

## Entrega 1 — Design system próprio e estrutura de tela

- Novos tokens no `src/styles.css`: escala de densidade, superfícies de ERP (faixa de filtros, cabeçalho de tabela fixo), tokens de estado operacional (disponível, reservado, em manutenção, vencido, a vencer, bloqueado, saldo crítico, encerrado, inativo).
- Novos componentes de apresentação em `src/components/ui-gov/`:
  - `StatusBadge` — um único vocabulário visual de estados em todo o sistema.
  - `PageShell` (breadcrumb + título + ações compactas) e `PageTabs` para abas internas.
  - `FilterBar` — faixa compacta com "Mais filtros", "Aplicar" e "Limpar".
  - `DataTable` — cabeçalho fixo, densidade alta, coluna de ações compacta, painel lateral de detalhe.
  - `KpiCard` clicável (drill-down) e `EmptyState`, `TableSkeleton`, `ErrorState`.
- Menu lateral compacto: ícones consistentes, grupos recolhíveis, modo só-ícones no desktop com tooltip (preferência guardada no navegador).
- Barra superior funcional: órgão em contexto, pesquisa global de módulos/registros, alertas, ajuda e perfil.
- Aplicação inicial: painel, veículos, contratos, abastecimentos, manutenções, utilização. As demais telas herdam pelo `PageShell` sem reescrita.

## Entrega 2 — Painel gerencial e Central de Disponibilidade

- Painel reorganizado em faixa de filtros (período, unidade) + KPIs clicáveis + gráficos que respondem a uma pergunta: evolução mensal de custo, custo por natureza, custo por unidade, top veículos por custo, custo por km, desvio de consumo.
- Todos os números vêm dos hooks já existentes; nenhum gráfico decorativo; clicar leva à lista filtrada.
- Nova tela **Central de Disponibilidade da Frota** (`/disponibilidade`): mapa apenas com posições que existirem no banco (sem pin fictício, sem rastreamento ao vivo) + tabela por status com veículo, unidade, situação e motivo de indisponibilidade; filtros por unidade, tipo, status e veículo.

## Entrega 3 — Viagens: rota, distância e consumo estimado

Migração aditiva em `vehicle_usages` (todos os campos anuláveis, nada removido):
`round_trip`, `estimated_distance_km`, `estimated_duration_min`, `route_geometry`, `route_provider`, `route_calculated_at`, `distance_source` ('rota' | 'manual'), `estimated_consumption_kmpl`, `consumption_source` ('historico' | 'parametro'), `estimated_liters`, `estimated_cost`, `fuel_price_used`.
Mais uma tabela de cache `route_cache` (origem+destino normalizados → distância, duração, geometria), no mesmo padrão do `geocode_cache`.

- Serviço de roteamento com adaptador trocável (`src/lib/routing.functions.ts` + `routing.server.ts`): provedor inicial OSRM/OpenStreetMap, com cache, uma consulta por vez, timeout e limite de tentativas. Chaves nunca no frontend.
- Se o roteamento falhar, a viagem é salva normalmente e o usuário informa a distância manualmente — registrada como origem "manual".
- Distância rodoviária (não linha reta); "ida e volta" dobra o km estimado.
- Consumo estimado: média real do veículo pelo histórico de abastecimentos e km quando houver amostra suficiente; senão, o parâmetro cadastrado no veículo — sempre com a fonte visível.
- Custo estimado quando houver preço vigente de combustível em contrato/item ativo do órgão; nunca obrigatório.
- Viagem concluída: km real pelo odômetro, comparação estimado × real e desvio percentual apenas com dados confiáveis.
- Botão "Ver rota no mapa" em reserva, detalhe da viagem e histórico do veículo, abrindo modal com origem, destino e **rota planejada/estimada** (nunca "trajeto percorrido").
- Isolamento: veículo, funcionário e viagem do mesmo `organization_id`; nenhum endpoint público de viagem.

## Entrega 4 — Ajuda "i" e acabamento

- Novos textos em `src/lib/ajuda.ts` no padrão vigente ("Para que serve" + "Como ler/preencher" + selo) para: distância estimada, duração, ida e volta, consumo médio e sua fonte, litros estimados, custo estimado, km real, desvio e rota planejada.
- Ajuda da Central de Disponibilidade e dos novos KPIs/gráficos do painel.
- Revisão de empty states e mensagens de erro no vocabulário do produto (prestadores são sempre do próprio órgão).

## Detalhes técnicos

- Roteamento e geocodificação só em server functions autenticadas (`requireSupabaseAuth`), com cache em tabela e `organization_id` preservado.
- Migrações estritamente aditivas; nenhum dado legado alterado.
- `bunx tsgo --noEmit` limpo a cada entrega.
- O ambiente não permite login, então não haverá validação visual autenticada — isso será informado, não presumido.

## Como quer prosseguir

Posso começar já pela Entrega 1 e seguir na sequência, ou inverter a ordem se preferir a inteligência de viagens primeiro.
