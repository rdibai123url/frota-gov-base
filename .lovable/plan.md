# Checklist de viagem e disponibilidade da frota

## Objetivo
Entregar somente as duas funcionalidades solicitadas: checklists de saída/retorno integrados às utilizações e uma central de disponibilidade com estados derivados dos dados existentes.

## 1. Checklist de saída e retorno
- Criar tabelas aditivas para o checklist e suas fotos, vinculadas ao órgão, utilização, veículo e usuário responsável.
- Manter um registro por etapa (`saida` e `retorno`), sem exclusão física, com auditoria de inclusões e alterações.
- Validar no banco que utilização, veículo e órgão pertencem ao mesmo contexto; limitar gravação aos perfis que já podem operar utilizações.
- Criar armazenamento privado para fotos, com leitura e gravação restritas à pasta do órgão.
- Integrar o checklist à tela de Utilização e reservas:
  - saída disponível antes de iniciar a viagem;
  - retorno disponível durante o fechamento;
  - respostas `OK`, `Com problema` e `Não se aplica`;
  - observações, odômetro e múltiplas fotos;
  - comparação automática do retorno com a saída, sinalizando possíveis novas ocorrências sem atribuir culpa.
- Exibir os dois checklists no detalhe da utilização e na linha do tempo do veículo.
- Oferecer atalho para Manutenções com veículo, unidade, odômetro e descrição dos problemas pré-preenchidos; o usuário ainda confirma o registro.

## 2. Central de disponibilidade
- Criar a tela `Frota → Disponibilidade da Frota`, seguindo a identidade Cinza Institucional Público.
- Derivar o estado atual no cliente a partir das consultas protegidas já existentes, sem permitir edição manual.
- Adotar esta prioridade documentada: `Bloqueado/Indisponível` por situação cadastral ou obrigação crítica vencida → `Em manutenção` por situação, solicitação ou OS ativa impeditiva → `Em uso` → `Reservado` → `Disponível`.
- Considerar `baixado`, `inativo` e `cedido` como indisponíveis, preservando o motivo cadastral; obrigação vencida aparece como bloqueio documental.
- Mostrar identificação, modelo, unidade, motorista e destino atuais, próxima reserva, manutenção ativa e motivo principal.
- Incluir indicadores clicáveis e filtros por unidade, estado, classe/tipo e bem.
- Levar cada linha ao contexto mais relevante: utilização atual/reserva, manutenção, obrigação ou ficha do veículo.
- Não adicionar mapa nesta etapa, pois o sistema não possui coordenadas reais dos veículos; o mapa atual contém somente prestadores.

## 3. Ajuda, navegação e compatibilidade
- Adicionar a nova tela ao menu e à matriz de módulos por órgão.
- Atualizar as ajudas de Utilização, Histórico do veículo e Disponibilidade, explicando preenchimento, diferenças entre etapas e formação dos estados.
- Preservar regras atuais, isolamento por `organization_id`, RLS, permissões, rotas e integrações existentes.

## 4. Validação
- Rodar typecheck e testes das regras puras de comparação de checklist e prioridade de disponibilidade.
- Verificar rotas/importações e executar o linter de segurança do banco.
- Validar visualmente com sessão autenticada apenas se o ambiente permitir; caso contrário, registrar essa limitação explicitamente.

## Detalhes técnicos
- Migração aditiva com `vehicle_checklists` e `vehicle_checklist_photos`, constraints, índices, grants, RLS, gatilhos de validação e auditoria.
- Fotos no bucket privado `checklist-frota`, com caminho iniciado pelo `organization_id` e URLs temporárias.
- Componentes focados para formulário/comparação do checklist e função pura para derivar a disponibilidade.
