import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Database, Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { usePerms } from "@/lib/frotagov";
import { runFullExport, type FullExportResponse } from "@/lib/exportacao.functions";

export const Route = createFileRoute("/_authenticated/exportacao")({
  head: () => ({
    meta: [
      { title: "Exportar dados — FrotaGov" },
      {
        name: "description",
        content:
          "Exportação integral dos dados do órgão em um único arquivo ZIP com CSV e JSON, para migração, auditoria e integração com outros sistemas.",
      },
      { property: "og:title", content: "Exportar dados — FrotaGov" },
      {
        property: "og:description",
        content: "Baixe todos os dados do órgão em um único pacote, sem depender de suporte técnico.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Exportacao,
});

const MODULES_RESUMO = [
  "Dados do órgão, unidades, usuários e centros de custo",
  "Veículos, máquinas e equipamentos, condutores e histórico",
  "Abastecimentos, autorizações, cotas e limites",
  "Contratos, aditivos, empenhos e movimentações orçamentárias",
  "Manutenções, ordens de serviço, planos e oficinas",
  "Cotações e propostas",
  "Multas, acidentes e seguros",
  "Diárias e prestações de contas",
  "Rede credenciada, capturas e cartões virtuais",
  "Peças, almoxarifado, OFP, estoque e inventários",
  "Inteligência de consumo, alertas e transparência",
  "Migrações, backups e registros de auditoria",
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function Exportacao() {
  const { canExportData } = usePerms();
  const exportFn = useServerFn(runFullExport);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FullExportResponse | null>(null);

  async function handleExport() {
    setRunning(true);
    setResult(null);
    try {
      const data = await exportFn({});
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = data.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setResult(data);
      toast.success("Exportação concluída", {
        description: `${data.fileCount} arquivos e ${data.recordCount.toLocaleString("pt-BR")} registros no pacote.`,
      });
    } catch (err) {
      toast.error("Não foi possível concluir a exportação", {
        description: err instanceof Error ? err.message : "Tente novamente em alguns instantes.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Exportar dados"
        description="Baixe todos os dados do seu órgão em um único arquivo, para migração, auditoria ou integração com outros sistemas."
      />

      {!canExportData ? (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Acesso restrito</AlertTitle>
          <AlertDescription>
            A exportação completa é permitida apenas ao Super Admin, ao Administrador do órgão e à Auditoria /
            Controladoria. Solicite o arquivo a um desses perfis.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Exportação completa
              </CardTitle>
              <CardDescription>
                Um único arquivo compactado (.zip) com todos os módulos do FrotaGov: planilhas em CSV (Excel, LibreOffice
                e Google Planilhas) e arquivos JSON das estruturas mais complexas. Inclui registros ativos, inativos,
                históricos e cancelados, com os identificadores necessários para reconstruir os vínculos em outro
                sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ul className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                {MODULES_RESUMO.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span aria-hidden className="text-primary">
                      •
                    </span>
                    {m}
                  </li>
                ))}
              </ul>

              <Separator />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Em órgãos com muitos registros a geração pode levar alguns minutos. Mantenha esta página aberta.
                </p>
                <Button onClick={handleExport} disabled={running} size="lg" className="shrink-0">
                  {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {running ? "Preparando arquivo…" : "Exportar todos os dados"}
                </Button>
              </div>

              {result && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Arquivo gerado</AlertTitle>
                  <AlertDescription>
                    <span className="block break-all font-medium text-foreground">{result.fileName}</span>
                    {result.fileCount} arquivos • {result.recordCount.toLocaleString("pt-BR")} registros •{" "}
                    {formatBytes(result.bytes)}
                    <span className="mt-1 block break-all text-xs">SHA-256: {result.checksum}</span>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">O que vem no pacote</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Organização:</strong> pastas por área, um arquivo por conjunto de
                dados, com nomes em português.
              </p>
              <p>
                <strong className="text-foreground">Formatos:</strong> CSV em UTF-8 com BOM, separador ponto e vírgula,
                além de JSON para as estruturas relacionais.
              </p>
              <p>
                <strong className="text-foreground">Datas e documentos:</strong> valores originais em ISO 8601 e colunas
                auxiliares no formato brasileiro e só com dígitos.
              </p>
              <p>
                <strong className="text-foreground">Manifesto:</strong> arquivo com órgão, data/hora, responsável,
                versão, lista de arquivos e contagem de registros, mais um LEIA-ME explicativo.
              </p>
              <p>
                <strong className="text-foreground">Segurança:</strong> nenhuma senha, hash, token, código de segurança
                de cartão ou chave de API é incluída. Toda exportação fica registrada na auditoria.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
