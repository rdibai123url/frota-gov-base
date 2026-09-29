# Relatório de testes — FrotaGov (ambiente de teste)

Testado em 29/09/2026, órgão "Prefeitura Teste", banco FrotaGov-Teste. Cadastros feitos pela interface, com dados fictícios.

## Achados (a corrigir)

| # | Tela | Problema | Gravidade |
|---|------|----------|-----------|
| 1 | Utilização | Mesmo condutor aceito em dois veículos no mesmo horário (só o conflito de veículo é checado) | Alta |
| 2 | Empenhos | Valor anulado maior que o empenhado é aceito; saldo fica negativo e entra na soma do painel | Alta |
| 3 | Veículos | Ano do modelo menor que o ano de fabricação é aceito | Média |
| 4 | Veículos | Renavam com menos de 11 dígitos é aceito | Média |
| 5 | Abastecimento | Data futura (31/12/2027) aceita e registrada; atualizou o hodômetro | Média |
| 6 | Utilização | Ao bloquear (CNH vencida, retorno antes da saída) a tela não mostra o motivo | Média |
| 7 | Contratos | Contrato salvo sem empresa contratada | Média |
| 8 | Contratos | Contrato criado como "Vigente" com assinatura nasce travado para itens; falta aviso | Média |
| 9 | Condutores | E-mail inválido aceito | Baixa |
| 10 | Pessoas e Empresas | CNPJ repetido mostra mensagem técnica em inglês (`duplicate key value ...`) | Baixa |
| 11 | Combustíveis | Duplicidade diferencia maiúsculas ("Gasolina comum" x "Gasolina Comum") | Baixa |
| 12 | Empenhos | Exercício 1900 aceito | Baixa |
| 13 | Abastecimento | Posto só aparece com contrato vigente; falta dica na tela | Baixa |
| 14 | Manutenção | Solicitação sem descrição não salva, mas não mostra mensagem | Baixa |
| 15 | **Vários** | **Salvar apólice, transferência de estoque, proposta OFP, alteração de perfil de usuário e resposta pública de cotação falhavam** (`this` perdido em `supabase.rpc`: erro "reading 'rest'"). **CORRIGIDO** (`.bind`) em 5 arquivos | **Alta** |
| 16 | Manutenção | Saída anterior à entrada aceita | Média |
| 17 | Multas | Data futura e desconto maior que o valor da multa aceitos | Média |
| 18 | Sinistros | Data futura aceita (e o veículo já fica "Indisponível") | Média |
| 19 | Seguros | Número de apólice repetido aceito; apólice sem nenhum veículo aceita | Média |
| 20 | Obrigações | IPVA duplicado (mesmo veículo/exercício); "Quitada" sem valor pago/data; valor pago absurdo aceito | Média |
| 21 | Ordens de serviço | Fluxo depende de cotação aprovada (cotação → convite → proposta → aprovação); não testado | — |
| 22 | Diárias | Requisição com valor e quantidade zero aceita | Média |
| 23 | Almoxarifado | Depósito com nome repetido mostra mensagem técnica em inglês (`duplicate key ...`) — mesmo padrão do #10; vale tratar em um só lugar | Baixa |
| 24 | Contratos/Almoxarifado | Cadeia contrato → OFP → recebimento → estoque exige itens do tipo "peça"; item de outro tipo (lubrificante) não aparece na OFP, sem explicação na tela | Baixa |
| 25 | Contratos | Ao editar para "Vigente" sem data de assinatura, o formulário não salva e o aviso do navegador pode passar despercebido | Baixa |

## Situação das correções (branch local, nada enviado)

Corrigidos na tela e conferidos no navegador: #1, #2, #3, #4, #5, #9, #10/#23, #11, #12, #13, #15, #17, #18, #19, #20, #22.
Corrigidos no código (regra simples, sem conferência na tela): #7 (contrato vigente exige empresa) e #16 (saída anterior à entrada).
Regras também no banco (migrations 20260929000200 e 20260929000300): #1, #2, #5, #3, #16, #17 (data futura e desconto), #18, #20 (quitada exige valor e data). Todas com NOT VALID / gatilhos que só disparam ao gravar.

Retirados após revisão do código (eram falsos alarmes do teste):
- #6: os avisos de bloqueio da utilização aparecem na lista de avisos do formulário.
- #14: a solicitação de manutenção já mostra "Descreva o problema ou serviço".
- #25: o contrato já avisa "informe a data de assinatura"; o teste não capturou o aviso.

Não tratados (baixa gravidade, sem alteração de código): #8 (aviso ao criar contrato já vigente), #21 e #24 (fluxo de OS/OFP não testado).

## Autorizações de abastecimento (OK)
- Regra de combustível compatível com o cadastro do veículo funciona.
- Veículo em manutenção/indisponível exige justificativa.
- Autorização só vale dentro da vigência; cota fora da vigência é recusada.
- Abastecimento acima do saldo autorizado é bloqueado; dentro do limite baixa o saldo (30 → 5 L) e marca "Utilizada".

## Varredura de telas (abrem sem erro)
pneus, patrimônio, usuários, relatórios, exportação, integrações, inteligência, transparência, sustentabilidade, mapa-rede, rede-credenciada, cotações, planos-manutenção, limpeza, disponibilidade, equipamentos, migração, chaves-api, alertas, painel. Falta testar o conteúdo/funcionamento dessas telas.

## Correções já feitas no código (branch local, nada enviado)
- #1 condutor em dois veículos: validação na tela + gatilho no banco (migration 20260929000200).
- #2 empenho anulado > empenhado e #12 exercício fora de 2000–2100: validação na tela + CHECK NOT VALID (mesma migration).
- #15 `rpc.bind` em 5 arquivos.
- Segurança da auditoria: SSRF (safe-fetch), limite de frequência no login, comparação de chave em tempo constante, erros de TypeScript.

## Validações que funcionaram
- CNPJ/CPF inválidos e repetidos, matrícula repetida, placa repetida, KM negativo.
- Hodômetro só avança (abastecimento e manutenção), capacidade do tanque, quantidade e preço zero.
- Conflito de agenda do veículo, retorno antes da saída.
- Empenho duplicado e valor zero, cota com vigência invertida ou valor zero.
- Cálculos de totais e saldos (abastecimento, item de contrato, cota).

## Dados de teste "lixo" a apagar
- Veículos JKL4M56 e QRS6T78; condutores "Carlos CNH Vencida" e "Email Ruim".
- Abastecimento de 31/12/2027 (alterou o hodômetro da Sprinter).
- Empenhos 2026NE000102 e 2026NE000104; contrato CT-002/2026 sem empresa.
- Solicitação de manutenção MNT-2026-00002 (teste).

- Multas MUL-2026-00002/00003, sinistro SIN-2026-00002 (data 2031), apólices APO-2026-0001 (2ª) e APO-2026-0003, obrigações duplicadas/quitadas sem pagamento.

## Módulos testados
Base, Frota, Operação (parte 1), Contratos e Orçamento, Manutenção (solicitação e execução), Multas, Sinistros, Seguros, Obrigações.
Pendentes: OS/cotações, autorizações, diárias, almoxarifado/peças/pneus, patrimônio, relatórios, exportação, integrações, transparência, usuários e perfis.
