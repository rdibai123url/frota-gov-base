# Dibai Fleet — API de leitura e Power BI

A API permite que outro sistema (ou o Power BI/Excel) leia os dados do órgão ou da empresa. É
**somente leitura**. Cada chave dá acesso apenas aos dados do órgão que a criou.

## 1. Criar a chave
Em **Integrações e dados abertos → Chaves de API** (tela liberada pelo administrador da plataforma),
crie uma chave, escolha os assuntos que ela pode ler (escopos) e copie o valor. **Ele aparece uma
única vez.**

## 2. Como consultar
Envie o cabeçalho `x-api-key: SUA_CHAVE` para:

`https://SEU-ENDERECO/api/public/v1/recursos/<recurso>`

Recursos: `veiculos`, `equipamentos`, `condutores`, `abastecimentos`, `autorizacoes`, `contratos`,
`contratos_itens`, `empenhos`, `manutencoes`, `ordens_servico`, `pecas`, `pneus`, `multas`,
`sinistros`, `seguros`, `obrigacoes`.

Parâmetros opcionais: `pagina`, `por_pagina` (até 200), `situacao`, `de` e `ate` (datas
AAAA-MM-DD) e `alterados_desde`. O limite é de 120 consultas por minuto por chave. CPF sai sempre
mascarado.

## 3. Power BI
1. **Obter dados → Web → Avançado**.
2. Em *Parâmetros de URL* coloque o endereço do recurso (ex.: `.../recursos/abastecimentos?por_pagina=200`).
3. Em *Cabeçalhos HTTP* adicione `x-api-key` com o valor da chave (os parâmetros `pagina` e `por_pagina` aparecem também como `page` e `page_size` na resposta).
4. O resultado é um JSON: clique em **Converter em Tabela** e expanda a coluna `data`.
5. Para mais de 200 linhas, repita a consulta variando `pagina` (ou use um parâmetro do Power Query).
6. **Atualização agendada:** publique o relatório e configure a atualização no serviço do Power BI
   usando a mesma chave.

## 4. Excel
**Dados → Obter Dados → De Outras Fontes → Da Web** e siga os mesmos passos de cabeçalho da chave.

## 5. Boas práticas
- Crie uma chave por sistema e revogue as que não são mais usadas.
- Nunca coloque a chave em planilhas compartilhadas abertas.
