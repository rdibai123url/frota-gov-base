import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { zipSync, strToU8 } from "fflate";
import { Download, PackageOpen } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DATASETS, type Dataset } from "@/lib/prestacao";
import { useOrganization, usePerms } from "@/lib/frotagov";
import {
  exportReportCsv,
  exportReportXml,
  exportXlsx,
  reportCsvText,
  reportXmlText,
  type ReportMeta,
  type ReportRow,
} from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/prestacao-contas")({
  head: () => ({
    meta: [
      { title: "Prestação de contas — Dibai Fleet" },
      {
        name: "description",
        content:
          "Pacotes de dados do exercício (bens, abastecimentos, manutenções, contratos, empenhos, multas e sinistros) para o Tribunal de Contas e a controladoria.",
      },
    ],
  }),
  component: PrestacaoContas,
});

function PrestacaoContas() {
  const now = new Date().getFullYear();
  const [year, setYear] = useState(String(now));
  const [busy, setBusy] = useState<string | null>(null);
  const { data: org } = useOrganization();
  const { userName } = usePerms();

  const meta = (ds: Dataset, count: number): ReportMeta => ({
    title: `Prestação de contas ${year} — ${ds.label}`,
    organization: org?.legal_name ?? "Dibai Fleet",
    subtitle: org?.short_name ?? null,
    unit: "Todas",
    period: `Exercício ${year}`,
    issuedBy: userName,
    filters: [{ label: "Registros", value: String(count) }],
  });

  async function load(ds: Dataset): Promise<ReportRow[]> {
    return ds.fetch(Number(year));
  }

  async function one(ds: Dataset, kind: "csv" | "xml" | "xlsx") {
    setBusy(`${ds.key}:${kind}`);
    try {
      const rows = await load(ds);
      if (rows.length === 0) {
        toast.info("Não há registros neste exercício.");
        return;
      }
      const name = `prestacao-${year}-${ds.key}`;
      const m = meta(ds, rows.length);
      if (kind === "csv") exportReportCsv(name, ds.columns, rows, m);
      else if (kind === "xml") exportReportXml(name, ds.columns, rows, m);
      else exportXlsx(name, ds.columns, rows, ds.label.slice(0, 28), m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o arquivo.");
    } finally {
      setBusy(null);
    }
  }

  async function all() {
    setBusy("zip");
    try {
      const files: Record<string, Uint8Array> = {};
      const resumo: string[] = [];
      for (const ds of DATASETS) {
        const rows = await load(ds);
        resumo.push(`${ds.label}: ${rows.length} registro(s)`);
        if (rows.length === 0) continue;
        const m = meta(ds, rows.length);
        files[`${ds.key}.csv`] = strToU8(reportCsvText(ds.columns, rows, m));
        files[`${ds.key}.xml`] = strToU8(reportXmlText(ds.columns, rows, m));
      }
      files["LEIAME.txt"] = strToU8(
        [
          `Prestação de contas — exercício ${year}`,
          `Órgão: ${org?.legal_name ?? ""}`,
          `Gerado em ${new Date().toLocaleString("pt-BR")} por ${userName}`,
          "",
          "Conteúdo (cada conjunto em CSV, separado por ponto e vírgula, e em XML):",
          ...resumo.map((r) => `- ${r}`),
          "",
          "Valores em reais, datas no formato AAAA-MM-DD. Este é o leiaute padrão do Dibai Fleet;",
          "quando o Tribunal de Contas exigir leiaute próprio, o mapeamento é feito sobre estes campos.",
        ].join("\n"),
      );
      const zip = zipSync(files, { level: 6 });
      const blob = new Blob([zip as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prestacao-de-contas-${year}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Pacote gerado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o pacote.");
    } finally {
      setBusy(null);
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => String(now - i));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prestação de contas"
        description="Baixe os dados do exercício em arquivos prontos para o Tribunal de Contas, a controladoria ou a auditoria."
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-40 space-y-1.5">
          <Label>Exercício (ano)</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={all} disabled={busy !== null} className="gap-2">
          <PackageOpen className="size-4" />{" "}
          {busy === "zip" ? "Gerando…" : "Baixar pacote completo (ZIP)"}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {DATASETS.map((ds) => (
          <div key={ds.key} className="rounded-lg border bg-card p-4 shadow-card">
            <h2 className="text-sm font-semibold">{ds.label}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{ds.description}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Campos: {ds.columns.map((c) => c.label).join(", ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["csv", "xml", "xlsx"] as const).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={busy !== null}
                  onClick={() => one(ds, k)}
                >
                  <Download className="size-3.5" /> {k === "xlsx" ? "Excel" : k.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">
        Cada Tribunal de Contas tem seu leiaute oficial. Este pacote usa o leiaute padrão do Dibai
        Fleet; se o seu órgão for obrigado a um leiaute específico, o mapeamento é feito sobre estes
        mesmos campos.
      </p>
    </div>
  );
}
