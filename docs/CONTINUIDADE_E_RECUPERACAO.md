# Dibai Fleet — Continuidade do serviço e recuperação de dados

Este documento descreve, em linguagem simples, como os dados do órgão são protegidos e o que fazer
em caso de falha. Ele serve de apoio em licitações, auditorias e no dia a dia do órgão.

## 1. Onde ficam os dados

- Os dados de cada órgão ficam em um banco de dados na nuvem (Supabase), separados por órgão: um
  órgão nunca enxerga os dados de outro.
- Os arquivos anexados (fotos, documentos) ficam em armazenamento privado.

## 2. Cópias de segurança (três camadas)

| Camada | Quem faz | Frequência | Onde fica |
|---|---|---|---|
| Cópia do provedor do banco | Automática, conforme o plano contratado no provedor | Diária (planos pagos) | Provedor (Supabase) |
| Backup externo do Dibai Fleet | Automática, configurada pelo Super Admin | Diária | Destino externo do órgão (SFTP ou S3) e/ou plataforma |
| **Cópia completa baixada pelo órgão** | O próprio órgão, no botão *Exportar dados* | Quando quiser (recomendado: mensal) | Computador ou servidor do órgão |

A cópia completa contém todos os módulos em planilhas (CSV) e arquivos JSON, um **manifesto** com a
contagem de registros e um **LEIA-ME**. Nenhuma senha, token ou chave é incluída.

## 3. Como conferir se a cópia baixada está boa (teste de restauração)

1. Entre em **Cadastros → Exportar dados** e clique em **Exportar todos os dados**. Anote a *soma de
   verificação (SHA-256)* mostrada na tela.
2. Guarde o arquivo em, pelo menos, dois lugares (por exemplo, computador e um disco externo).
3. Na mesma tela, use **Conferir uma cópia já baixada**: escolha o arquivo e cole a soma anotada.
   O sistema confere, no seu computador, que o arquivo abre, que todos os arquivos do manifesto estão
   presentes e que a soma é a mesma.
4. Repita a conferência sempre que copiar o arquivo para outro lugar e, pelo menos, a cada trimestre.

## 4. Metas de recuperação (valores propostos — confirmar antes de assumir em contrato)

- **Perda máxima de dados aceitável (RPO):** até 24 horas (última cópia diária).
- **Tempo para voltar a operar (RTO):** até 1 dia útil, com a restauração feita pela equipe da
  plataforma a partir do backup externo ou do provedor.

## 5. Se houver uma falha

1. Avise a Administração da Plataforma (Super Admin) informando data e hora aproximadas do problema.
2. A plataforma restaura o banco a partir da cópia mais recente, **em um ambiente de teste primeiro**,
   confere as contagens e só então troca o ambiente oficial. Restaurações em produção exigem
   autorização expressa.
3. Se a plataforma estiver indisponível, o órgão continua com a sua cópia completa (item 3): as
   planilhas permitem consultar e conferir os dados fora do sistema.

## 6. Responsabilidades

- **Órgão:** baixar e guardar a cópia completa, conferir a integridade e manter o cadastro de
  usuários atualizado.
- **Plataforma:** manter o backup diário, monitorar falhas (o sistema gera alertas de backup
  atrasado ou com erro) e executar a restauração.
