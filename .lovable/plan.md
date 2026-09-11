# Fechamento de viagem, alertas orientativos x corretivos e revisão da ajuda "i"

## 1. Resultado da viagem (Frota → Utilização e reservas)

No detalhe de uma utilização concluída, novo bloco **Planejado x Realizado**, lado a lado:

| Planejado | Realizado |
| --- | --- |
| Origem e destino, rota planejada (botão **Ver rota no mapa**) | Odômetro de saída e de retorno |
| Distância planejada e duração estimada | Km percorridos = retorno − saída |
| Consumo de referência usado na estimativa (km/l) | Diferença planejado x realizado, em km e % |
| Litros estimados | Litros abastecidos vinculados à viagem |
| Custo estimado | Valor abastecido e preço médio por litro |

Comparação visual simples (barras) entre estimado e realizado para distância, litros e custo.

### Regra do consumo efetivo (sem inventar telemetria)

Dois números distintos, nunca misturados:

- **Litros abastecidos na viagem** — fato: soma dos abastecimentos vinculados àquela utilização.
- **Consumo efetivo calculado** — só quando a base é tecnicamente válida: abastecimento de
  **tanque cheio** no início e no fim do intervalo, com odômetro nos dois. Cálculo tanque a
  tanque: km entre os dois tanques cheios ÷ litros do segundo abastecimento.

Sem essa base: **"Consumo efetivo indisponível"** com o motivo curto (sem abastecimento
vinculado, sem marcação de tanque cheio, sem odômetro). A quilometragem oficial é sempre a
do odômetro real, nunca a da rota.

### Vincular abastecimentos à viagem

Botão **Vincular abastecimentos**: lista os abastecimentos do mesmo órgão e mesmo veículo
dentro do intervalo da viagem que ainda não pertencem a nenhuma utilização. Seleção grava o
vínculo; validação de órgão, veículo, data/hora e duplicidade também no banco.

## 2. Alertas: orientativo x corretivo

**Orientativo (não bloqueante)** — recomendação ou aviso que não depende de corrigir um dado.
Mostra "i" com o que significa, por que apareceu, impacto, onde revisar e passos recomendados,
e oferece **Resolver / Ignorar alerta** com confirmação e justificativa curta. Fica registrado
quem resolveu, quando, a justificativa e o estado do alerta. Sai dos abertos e permanece no
histórico como "Resolvido por decisão do usuário". O dado de origem não é alterado; se a
situação mudar materialmente, um novo alerta pode ser gerado.

**Corretivo (dependente de dado)** — campo obrigatório ausente, documento vencido, CNH vencida,
combustível incompatível, saldo/empenho necessário. Não permite ignorar. O "i" traz checklist
dinâmico lido do estado real do banco: cada passo aparece como Concluído ou Pendente e o
conteúdo se recalcula conforme o usuário corrige. Atendidos todos os requisitos, o alerta é
resolvido automaticamente e sai dos abertos.

**Cotação com menos de 3 propostas** é orientativo: o "i" explica as duas saídas — obter nova
proposta ou formalizar a justificativa prevista no fluxo. Havendo justificativa registrada no
processo, resolve sozinho; caso contrário permite Resolver/Ignorar com auditoria.

Resolver/ignorar exige perfil autorizado, reaproveitando a matriz de permissões existente
(sem criar exceção nova).

## 3. Menu e histórico

- **Alertas e inconsistências** em âmbar com contador enquanto houver ocorrência aberta no
  órgão; volta ao cinza institucional quando zerar. Resolvidos/ignorados não contam.
- Filtro de situação: Abertos · Resolvidos automaticamente · Resolvidos por correção ·
  Resolvidos/Ignorados pelo usuário · Todos. Nada é apagado.

Tipos com orientação e checklist (todos os existentes): contrato 80/90/esgotado e a
vencer/vencido, empenho 20/10/zerado, cota 20/10/zerada, bloqueio por saldo, manutenção
preventiva vencida/próxima, garantia a vencer, prazo de propostas próximo/encerrado, menos de
3 propostas, OS atrasada, credenciamento vencendo, multa, obrigação legal, seguro, sinistro em
aberto, perda total sem baixa, alertas de abastecimento (combustível incompatível, tanque
excedido, duplicidade, abastecimentos próximos, CNH vencida), backup e inteligência.

## 4. Revisão da ajuda "i"

Padrão em todos os tópicos: Para que serve · Quando usar · Como preencher / Como ler ·
Obrigatório · Automático/Calculado · O que gera alerta ou bloqueio · Exemplo curto. Abas
internas com comportamento próprio recebem ajuda específica.

## Detalhes técnicos

- **Migração** (aditiva): `fuelings.usage_id uuid` (FK `vehicle_usages`, nulo) e
  `fuelings.full_tank boolean default false`, índice por `usage_id`, gatilho de validação
  (mesmo órgão, mesmo veículo, data dentro do intervalo); em `fueling_alerts`, colunas
  `resolution_kind text` (auto | correcao | usuario) e `resolution_reason text`;
  função `resolve_stale_alerts()` (SECURITY DEFINER, escopo `current_org_id()`) que fecha
  alertas corretivos cuja condição de origem deixou de existir, e
  `dismiss_alert(_id, _reason)` que checa papel autorizado antes de encerrar um orientativo.
  Tipos regenerados.
- Novos módulos: `src/lib/viagem-resultado.ts` (realizado e confiabilidade do km/l) e
  `src/lib/alertas-ajuda.ts` (classificação, orientação e checklist dinâmico por tipo).
- Alterados: `src/routes/_authenticated/utilizacao.tsx`, `src/routes/_authenticated/alertas.tsx`,
  `src/components/app-shell.tsx`, `src/lib/frotagov.ts`, `src/lib/ajuda.ts`.
- Tudo filtrado por `organization_id`, RLS e permissões preservadas, nenhuma API externa
  alterada.
- Verificação: typecheck e testes das regras de resolução parcial/total e do vínculo de
  abastecimentos. Validação visual autenticada só será afirmada se o login funcionar.
