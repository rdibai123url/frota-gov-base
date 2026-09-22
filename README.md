# FrotaGov: Gestão Pública

Crie a FASE 1 de um SaaS profissional chamado provisoriamente “FrotaGov”, voltado à gestão de frotas de órgãos públicos brasileiros. O sistema será futuramente licenciado para prefeituras, câmaras, consórcios públicos, autarquias e outros órgãos, inclusive por licitações e dispensas. Nesta fase, priorize arquitetura sólida, visual profissional e facilidade de evolução.

OBJETIVO DA FASE 1
Construir a base funcional do sistema com:
1) autenticação/login;
2) estrutura multi-organização (multi-tenant), isolando completamente os dados de cada órgão;
3) cadastro do órgão principal;
4) cadastro de secretarias/setores/unidades;
5) cadastro inicial de veículos;
6) dashboard inicial;
7) perfis e permissões básicos.

CADASTRO DO ÓRGÃO PRINCIPAL
Criar uma tela “Dados do Órgão” com os seguintes campos:
- Nome oficial do órgão;
- Nome abreviado/sigla;
- Tipo do órgão: Prefeitura, Câmara Municipal, Consórcio Público, Autarquia, Fundação, Secretaria, Outro;
- CNPJ;
- Município;
- UF;
- Endereço completo;
- CEP;
- Telefone;
- E-mail institucional;
- Site institucional;
- Upload do brasão/logomarca do órgão;
- Nome da autoridade atual;
- Cargo da autoridade atual, com opções: Prefeito(a), Secretário(a), Presidente, Diretor(a), Superintendente, Outro;
- CPF da autoridade (opcional, não exibir em telas públicas ou relatórios comuns);
- Data de início da gestão;
- Data prevista de término da gestão;
- Campo de observações.

O brasão deve aparecer no cabeçalho interno do sistema e, futuramente, poderá ser usado em relatórios PDF.

ESTRUTURA ADMINISTRATIVA
Tela “Secretarias / Unidades” com:
- nome;
- sigla;
- tipo (Secretaria, Departamento, Diretoria, Coordenação, Unidade, Outro);
- responsável;
- cargo do responsável;
- telefone;
- e-mail;
- status ativo/inativo.
Cada secretaria/unidade deve obrigatoriamente pertencer ao órgão atual.

VEÍCULOS — CADASTRO INICIAL
Criar tela de veículos com:
- placa;
- prefixo/patrimônio;
- Renavam;
- chassi;
- marca;
- modelo;
- ano fabricação;
- ano modelo;
- cor;
- tipo do veículo/equipamento;
- combustível;
- capacidade do tanque;
- quilometragem atual;
- horímetro, quando aplicável;
- secretaria/unidade vinculada;
- situação: Ativo, Em manutenção, Cedido, Inativo, Baixado;
- observações.

USUÁRIOS E PERMISSÕES
Criar perfis iniciais:
- Super Admin da plataforma;
- Administrador do órgão;
- Gestor de Frota;
- Secretário/Responsável de Unidade;
- Operador;
- Fiscal/Controladoria (somente consulta nesta fase).
O Super Admin pode administrar organizações. Usuários do órgão nunca podem acessar dados de outra organização.

DASHBOARD INICIAL
Após login, mostrar um painel limpo e institucional com:
- total de veículos;
- veículos ativos;
- veículos em manutenção;
- total de secretarias/unidades;
- total de usuários;
- cards de atalhos para Veículos, Secretarias, Usuários e Dados do Órgão.
Nesta fase, não inventar dados de abastecimento ainda.

ARQUITETURA E SEGURANÇA
- Construir como SaaS multi-tenant desde o início.
- Toda tabela de negócio deve ser vinculada a uma organization_id (ou equivalente).
- Preparar banco PostgreSQL/Supabase.
- Implementar autenticação segura.
- Criar trilha mínima de auditoria com created_at, created_by, updated_at, updated_by nas entidades principais.
- Usar boas práticas para que futuramente possamos adicionar logs detalhados e LGPD.
- Upload do brasão em armazenamento seguro.
- Interface responsiva para computador, tablet e smartphone.

VISUAL
Quero aparência de software público moderno e profissional, sem excesso de elementos. Use layout institucional, menu lateral, cabeçalho com brasão e nome do órgão, cards discretos, tabelas claras, tipografia legível e ótima usabilidade. Não usar aparência infantil ou de template genérico.

IMPORTANTE
Não construir ainda módulos de abastecimento, contratos, empenhos, manutenção, pneus ou relatórios avançados. Apenas preparar a arquitetura para recebê-los depois.

Ao final, entregue a aplicação funcional desta Fase 1 com navegação entre as telas e dados de demonstração apenas quando necessário para visualizar a interface. Estruture o código para facilitar evolução futura.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://frota-gov-base.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/20c34ed0-1c0b-415b-a333-52ae695d6767).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
