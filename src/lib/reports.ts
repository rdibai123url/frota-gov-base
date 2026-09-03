/**
 * Fase 9 — exportações padronizadas dos relatórios do FrotaGov.
 * CSV (Excel pt-BR), XLSX nativo e impressão/PDF com cabeçalho institucional.
 */
import * as XLSX from "xlsx";
import { exportCsv } from "@/lib/platform";

export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, unknown>;

export type ReportMeta = {
  /** Nome do relatório exibido no cabeçalho. */
  title: string;
  /** Nome do órgão / plataforma. */
  organization?: string | null;
  subtitle?: string | null;
  /** Filtros aplicados, exibidos no cabeçalho da impressão. */
  filters?: { label: string; value: string }[];
};

const stamp = () => new Date().toLocaleString("pt-BR");

const safeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "relatorio";

/** Exporta em planilha Excel nativa (.xlsx). */
export function exportXlsx(
  filename: string,
  columns: ReportColumn[],
  rows: ReportRow[],
  sheetName = "Dados",
) {
  const aoa: unknown[][] = [
    columns.map((c) => c.label),
    ...rows.map((r) => columns.map((c) => (typeof r[c.key] === "object" ? JSON.stringify(r[c.key]) : (r[c.key] ?? "")))),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = columns.map((c) => ({
    wch: Math.min(
      48,
      Math.max(c.label.length + 2, ...rows.slice(0, 200).map((r) => String(r[c.key] ?? "").length + 2)),
    ),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, `${safeName(filename)}.xlsx`);
}

/** Exporta CSV (separador ";", compatível com Excel pt-BR). */
export function exportReportCsv(filename: string, columns: ReportColumn[], rows: ReportRow[]) {
  exportCsv(safeName(filename), columns, rows);
}

const escapeHtml = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Abre a janela de impressão do navegador com o relatório formatado
 * (cabeçalho institucional, filtros e data/hora). O usuário pode salvar em PDF.
 */
export function printReport(meta: ReportMeta, columns: ReportColumn[], rows: ReportRow[]) {
  const filters = (meta.filters ?? []).filter((f) => f.value);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>${escapeHtml(meta.title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Source Sans 3", Arial, Helvetica, sans-serif; color: #12203a; margin: 0; }
  header { border-bottom: 2px solid #12203a; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 16pt; margin: 0 0 2px; }
  h2 { font-size: 11pt; font-weight: 600; margin: 0 0 6px; color: #3b4a66; }
  .meta { font-size: 8.5pt; color: #48566f; }
  .filters { margin-top: 6px; font-size: 8.5pt; color: #48566f; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th, td { border: 1px solid #c9d2e0; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eef2f8; font-weight: 600; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  footer { margin-top: 12px; font-size: 8pt; color: #6b7890; }
</style></head><body>
<header>
  <h1>${escapeHtml(meta.organization || "FrotaGov")}</h1>
  <h2>${escapeHtml(meta.title)}</h2>
  ${meta.subtitle ? `<div class="meta">${escapeHtml(meta.subtitle)}</div>` : ""}
  <div class="meta">Emitido em ${escapeHtml(stamp())} — ${rows.length} registro(s)</div>
  ${filters.length ? `<div class="filters"><strong>Filtros:</strong> ${filters.map((f) => `${escapeHtml(f.label)}: ${escapeHtml(f.value)}`).join(" · ")}</div>` : ""}
</header>
<table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
<tbody>${
    rows.length
      ? rows
          .map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(r[c.key] ?? "—")}</td>`).join("")}</tr>`)
          .join("")
      : `<tr><td colspan="${Math.max(1, columns.length)}">Nenhum dado para os filtros informados.</td></tr>`
  }</tbody></table>
<footer>FrotaGov — Sistema de gestão de frotas públicas. Documento gerado eletronicamente.</footer>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
