/**
 * Fase 9 — exportações padronizadas dos relatórios do FrotaGov.
 * CSV (Excel pt-BR), XLSX nativo e impressão/PDF com cabeçalho institucional.
 *
 * Todo relatório (tela, impressão e exportações) carrega o mesmo cabeçalho:
 * brasão, órgão, secretaria/unidade filtrada, nome do relatório, período,
 * filtros aplicados, data/hora de emissão, usuário emissor e total de registros.
 */
import * as XLSX from "xlsx";

export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, unknown>;

export type ReportMeta = {
  /** Nome do relatório exibido no cabeçalho. */
  title: string;
  /** Nome do órgão / plataforma. */
  organization?: string | null;
  /** URL (assinada ou pública) do brasão do órgão. */
  logoUrl?: string | null;
  subtitle?: string | null;
  /** Secretaria/unidade filtrada, quando houver. */
  unit?: string | null;
  /** Período coberto pelo relatório, já formatado em pt-BR. */
  period?: string | null;
  /** Usuário que emitiu o relatório (nome e/ou e-mail). */
  issuedBy?: string | null;
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

/** Linhas do cabeçalho institucional usadas em CSV e XLSX. */
export function headerLines(meta: ReportMeta, total: number): [string, string][] {
  const lines: [string, string][] = [
    ["Órgão", meta.organization || "FrotaGov"],
    ["Relatório", meta.title],
  ];
  if (meta.subtitle) lines.push(["Descrição", meta.subtitle]);
  lines.push(["Secretaria / Unidade", meta.unit || "Todas"]);
  lines.push(["Período", meta.period || "Posição atual"]);
  for (const f of meta.filters ?? []) if (f.value) lines.push([`Filtro — ${f.label}`, f.value]);
  lines.push(["Emitido em", stamp()]);
  lines.push(["Usuário emissor", meta.issuedBy || "—"]);
  lines.push(["Total de registros", String(total)]);
  return lines;
}

/** Exporta em planilha Excel nativa (.xlsx) com cabeçalho institucional. */
export function exportXlsx(
  filename: string,
  columns: ReportColumn[],
  rows: ReportRow[],
  sheetName = "Dados",
  meta?: ReportMeta,
) {
  const head: unknown[][] = meta ? [...headerLines(meta, rows.length).map(([k, v]) => [k, v]), []] : [];
  const aoa: unknown[][] = [
    ...head,
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

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Exporta CSV (separador ";", compatível com Excel pt-BR) com cabeçalho institucional. */
export function exportReportCsv(
  filename: string,
  columns: ReportColumn[],
  rows: ReportRow[],
  meta?: ReportMeta,
) {
  const parts: string[] = [];
  if (meta) {
    for (const [k, v] of headerLines(meta, rows.length)) parts.push(`${csvCell(k)};${csvCell(v)}`);
    parts.push("");
  }
  parts.push(columns.map((c) => csvCell(c.label)).join(";"));
  for (const r of rows) parts.push(columns.map((c) => csvCell(r[c.key])).join(";"));

  const blob = new Blob(["\uFEFF" + parts.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName(filename)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const escapeHtml = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Abre a janela de impressão do navegador com o relatório formatado
 * (brasão, cabeçalho institucional, filtros, emissor e data/hora).
 * O usuário pode salvar em PDF pela própria caixa de impressão.
 */
export function printReport(meta: ReportMeta, columns: ReportColumn[], rows: ReportRow[]) {
  const filters = (meta.filters ?? []).filter((f) => f.value);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>${escapeHtml(meta.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Source Sans 3", Arial, Helvetica, sans-serif; color: #12203a; margin: 0; }
  header { border-bottom: 2px solid #12203a; padding-bottom: 10px; margin-bottom: 14px; }
  .top { display: flex; align-items: flex-start; gap: 12px; }
  .brasao { width: 62px; height: 62px; object-fit: contain; flex: none; }
  h1 { font-size: 15pt; margin: 0 0 2px; }
  h2 { font-size: 11pt; font-weight: 600; margin: 0 0 4px; color: #3b4a66; }
  .meta { font-size: 8.5pt; color: #48566f; }
  .grid { margin-top: 6px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 16px; font-size: 8.5pt; color: #48566f; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th, td { border: 1px solid #c9d2e0; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eef2f8; font-weight: 600; }
  thead { display: table-header-group; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  footer { margin-top: 12px; font-size: 8pt; color: #6b7890; }
</style></head><body>
<header>
  <div class="top">
    ${meta.logoUrl ? `<img class="brasao" src="${escapeHtml(meta.logoUrl)}" alt="Brasão do órgão" />` : ""}
    <div>
      <h1>${escapeHtml(meta.organization || "FrotaGov")}</h1>
      <h2>${escapeHtml(meta.title)}</h2>
      ${meta.subtitle ? `<div class="meta">${escapeHtml(meta.subtitle)}</div>` : ""}
    </div>
  </div>
  <div class="grid">
    <div><strong>Secretaria / Unidade:</strong> ${escapeHtml(meta.unit || "Todas")}</div>
    <div><strong>Período:</strong> ${escapeHtml(meta.period || "Posição atual")}</div>
    <div><strong>Total de registros:</strong> ${rows.length}</div>
    <div><strong>Emitido em:</strong> ${escapeHtml(stamp())}</div>
    <div style="grid-column: span 2"><strong>Usuário emissor:</strong> ${escapeHtml(meta.issuedBy || "—")}</div>
    ${filters.length ? `<div style="grid-column: span 3"><strong>Filtros aplicados:</strong> ${filters.map((f) => `${escapeHtml(f.label)}: ${escapeHtml(f.value)}`).join(" · ")}</div>` : ""}
  </div>
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
<script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
</body></html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
