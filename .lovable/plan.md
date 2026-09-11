# Fechamento de viagem, alertas com ajuda dinâmica e revisão da ajuda "i"

## 1. Resultado da viagem (Frota → Utilização e reservas)

No detalhe de uma utilização concluída, novo bloco **Resultado da viagem**, em duas colunas
**Planejado** x **Realizado**:

| Planejado | Realizado |
| --- | --- |
| Distância estimada da rota | Distância real (odômetro final − inicial) |
| Duração estimada | Diferença estimado x real, em km e % |
| Consumo de referência usado no planejamento (km/l) | Consumo efetivo km/l, quando confiável |
| Litros estimados | Litros abastecidos vinculados à viagem |
| Custo estimado | Valor gasto nos abastecimentos vinculados |

Também: odômetro inicial e final reais e botão **Ver rota no mapa** para a rota planejada
(usa a geometria já gravada na utilização).

### Regra do consumo efetivo (sem inventar telemetria)

Dois números distintos, nunca misturados:

- **Litros abastecidos na viagem** — fato: soma dos abastecimentos vinculados àquela utilização.
- **Consumo efetivo calculado** — só aparece quando a base é tecnicamente válida, isto é,
  quando existe abastecimento de **tanque cheio** no início e no fim do intervalo da viagem
  (medição tanque a tanque) e há odômetro em ambos. Nesse caso:
  `km percorridos entre os dois tanques cheios ÷ litros do segundo abastecimento`.

Sem essa base, a tela mostra **"Consumo efetivo indisponível"** com o motivo exato
(ex.: "nenhum abastecimento vinculado", "os abastecimentos não indicam tanque cheio",
"falta odômetro no abastecimento"). Nunca apresentar litros abastecidos como litros queimados.

### Vincular abastecimentos à viagem

No fechamento, botão **Vincular abastecimentos**: lista abastecimentos do mesmo órgão,
mesmo veículo e dentro do intervalo da viagem (saída real/planejada até retorno + margem),
ainda não vinculados a outra utilização. Marcação em caixa de seleção grava o vínculo.
Validação de órgão, veículo e intervalo no servidor (checagem em gatilho).

## 2. Alertas e inconsistências

- Cada ocorrência aberta ganha um ícone "i" com painel acessível: **O que significa**,
  **Por que foi gerada**, **Como corrigir**, **Onde corrigir** (com botão de atalho para a
  aba correta) e **Checklist** com cada passo marcado como Concluído ou Pendente.
- O checklist é recalculado a partir do estado atual dos dados (contrato, empenho, cota,
  cotação, obrigação, CNH, manutenção, seguro, multa, sinistro, autorização), não de um
  status manual. Corrigindo parte, só o que falta segue Pendente.
- Quando todas as condições somem, o alerta é marcado como resolvido e sai da lista de
  abertos automaticamente. Nada é apagado: a linha permanece com data/autor da resolução.
- Item de menu **Alertas e inconsistências** em âmbar com contador enquanto houver
  ocorrência aberta no órgão; volta ao grafite quando zerar.

Tipos que recebem orientação e checklist (todos os já existentes no sistema):
contrato 80/90/esgotado, contrato a vencer/vencido, empenho 20/10/zerado, cota 20/10/zerada,
bloqueio por saldo insuficiente, manutenção preventiva vencida/próxima, garantia a vencer,
prazo de propostas próximo/encerrado, menos de 3 propostas válidas, ordem de serviço atrasada,
credenciamento vencendo, multa a vencer/vencida, obrigação legal a vencer/vencida,
seguro a vencer/vencido, sinistro em aberto, perda total sem baixa, alertas de abastecimento
(combustível incompatível, tanque excedido, duplicidade, abastecimentos próximos, CNH vencida),
backup e inteligência (consumo fora do parâmetro, custo de manutenção elevado).

## 3. Revisão da ajuda "i"

Revisão de todos os tópicos de ajuda para o padrão: Para que serve · Quando usar ·
Como preencher / Como ler · Obrigatório · Automático/Calculado · O que gera alerta ou bloqueio ·
Exemplo curto. Abas internas com comportamento próprio recebem ajuda específica.

## Detalhes técnicos

- **Migração** (aditiva): `fuelings.usage_id uuid` (FK para `vehicle_usages`, nulo) e
  `fuelings.full_tank boolean default false`; índice por `usage_id`; gatilho de validação
  (mesmo órgão, mesmo veículo, data dentro do intervalo da utilização);
  função `resolve_stale_alerts()` (SECURITY DEFINER, escopo `current_org_id()`) que fecha
  alertas cuja condição de origem deixou de existir. Tipos regenerados.
- Novos módulos: `src/lib/viagem-resultado.ts` (cálculo do realizado e da confiabilidade do
  km/l), `src/lib/alertas-ajuda.ts` (registro de orientação + checklist dinâmico por tipo).
- Alterações: `src/routes/_authenticated/utilizacao.tsx`, `src/routes/_authenticated/alertas.tsx`,
  `src/components/app-shell.tsx` (destaque do menu), `src/lib/frotagov.ts` (hooks de
  abastecimentos por utilização e contagem de alertas abertos), `src/lib/ajuda.ts`.
- Tudo filtrado por `organization_id`, RLS preservada, nenhuma API externa alterada.
- Verificação: typecheck e testes das regras de resolução parcial/total dos alertas e da
  associação de abastecimentos. Validação visual autenticada só será afirmada se o login
  realmente funcionar no ambiente.
