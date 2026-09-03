/**
 * Dados agregados do Portal da Transparência — somente órgãos com publicação ativa.
 * Aceita `de` e `ate` (AAAA-MM-DD) e `formato=csv` com `conjunto=frota|abastecimento|manutencao|contratos`
 * para download de dados abertos. Nenhum dado pessoal é publicado.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });

const csv = (filename: string, columns: string[], rows: (string | number)[][]) => {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [columns.map(cell).join(";"), ...rows.map((r) => r.map(cell).join(";"))].join("\n");
  return new Response("\uFEFF" + body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}.csv"`,
      "cache-control": "public, max-age=300",
    },
  });
};

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const monthOf = (v?: string | null) => (v ? String(v).slice(0, 7) : "não informado");

export const Route = createFileRoute("/api/public/v1/transparencia/$slug")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slug = String(params.slug || "").slice(0, 60);
        if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: "Endereço inválido." }, 400);

        const url = new URL(request.url);
        const format = url.searchParams.get("formato") === "csv" ? "csv" : "json";
        const dataset = url.searchParams.get("conjunto") ?? "frota";
        const fromParam = url.searchParams.get("de");
        const toParam = url.searchParams.get("ate");
        if ((fromParam && !isDate(fromParam)) || (toParam && !isDate(toParam)))
          return json({ error: "Período inválido. Use o formato AAAA-MM-DD." }, 400);
        const from = isDate(fromParam) ? fromParam : null;
        const to = isDate(toParam) ? toParam : null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("transparency_settings")
          .select("organization_id, enabled, headline, datasets, slug")
          .eq("slug", slug)
          .maybeSingle();

        if (!settings?.enabled) return json({ error: "Portal não disponível." }, 404);

        const orgId = settings.organization_id;
        const datasets = (settings.datasets as Record<string, boolean>) ?? {};
        const { data: org } = await supabaseAdmin
          .from("organizations")
          .select("legal_name, short_name, city, state")
          .eq("id", orgId)
          .maybeSingle();

        const periodo = { de: from, ate: to };

        // Competências fechadas e publicadas (fechamento mensal)
        const { data: pubs } = await supabaseAdmin
          .from("transparency_publications")
          .select("version, published_at, snapshot, superseded_at, period:transparency_periods(year, month)")
          .eq("organization_id", orgId)
          .is("superseded_at", null)
          .order("published_at", { ascending: false });

        const competencias = (pubs ?? [])
          .filter((p: any) => p.period)
          .map((p: any) => ({
            competencia: `${String(p.period.month).padStart(2, "0")}/${p.period.year}`,
            chave: `${p.period.year}-${String(p.period.month).padStart(2, "0")}`,
            versao: p.version,
            publicado_em: p.published_at,
          }));

        const compParam = url.searchParams.get("competencia");
        if (compParam) {
          if (!/^\d{4}-\d{2}$/.test(compParam)) return json({ error: "Competência inválida. Use AAAA-MM." }, 400);
          const found = (pubs ?? []).find(
            (p: any) => p.period && `${p.period.year}-${String(p.period.month).padStart(2, "0")}` === compParam,
          ) as any;
          if (!found) return json({ error: "Competência não publicada." }, 404);
          return json({
            orgao: org ?? null,
            apresentacao: settings.headline ?? null,
            competencia: `${String(found.period.month).padStart(2, "0")}/${found.period.year}`,
            versao: found.version,
            publicado_em: found.published_at,
            competencias_publicadas: competencias,
            dados: found.snapshot,
          });
        }

        async function loadVehicles() {
          const { data } = await supabaseAdmin
            .from("vehicles")
            .select("status, vehicle_type")
            .eq("organization_id", orgId);
          const porSituacao: Record<string, number> = {};
          const porCategoria: Record<string, number> = {};
          for (const v of data ?? []) {
            porSituacao[v.status] = (porSituacao[v.status] ?? 0) + 1;
            const cat = v.vehicle_type ?? "não informado";
            porCategoria[cat] = (porCategoria[cat] ?? 0) + 1;
          }
          return { total: data?.length ?? 0, por_situacao: porSituacao, por_categoria: porCategoria };
        }

        async function loadFuelings() {
          let q = supabaseAdmin
            .from("fuelings")
            .select("quantity, total_value, status, fueled_at")
            .eq("organization_id", orgId);
          if (from) q = q.gte("fueled_at", `${from}T00:00:00`);
          if (to) q = q.lte("fueled_at", `${to}T23:59:59`);
          const { data } = await q;
          const valid = (data ?? []).filter((f) => f.status !== "cancelado");
          const porMes = new Map<string, { litros: number; valor: number; registros: number }>();
          for (const f of valid) {
            const key = monthOf(f.fueled_at);
            const row = porMes.get(key) ?? { litros: 0, valor: 0, registros: 0 };
            row.litros += Number(f.quantity ?? 0);
            row.valor += Number(f.total_value ?? 0);
            row.registros += 1;
            porMes.set(key, row);
          }
          return {
            registros: valid.length,
            litros: valid.reduce((s, f) => s + Number(f.quantity ?? 0), 0),
            valor_total: valid.reduce((s, f) => s + Number(f.total_value ?? 0), 0),
            por_mes: Array.from(porMes, ([mes, v]) => ({ mes, ...v })).sort((a, b) => a.mes.localeCompare(b.mes)),
          };
        }

        async function loadMaintenance() {
          let q = supabaseAdmin
            .from("maintenance_records")
            .select("total_value, status, entry_at")
            .eq("organization_id", orgId);
          if (from) q = q.gte("entry_at", `${from}T00:00:00`);
          if (to) q = q.lte("entry_at", `${to}T23:59:59`);
          const { data } = await q;
          const valid = (data ?? []).filter((m) => m.status !== "cancelada");
          const porMes = new Map<string, { valor: number; registros: number }>();
          for (const m of valid) {
            const key = monthOf(m.entry_at);
            const row = porMes.get(key) ?? { valor: 0, registros: 0 };
            row.valor += Number(m.total_value ?? 0);
            row.registros += 1;
            porMes.set(key, row);
          }
          return {
            registros: valid.length,
            valor_total: valid.reduce((s, m) => s + Number(m.total_value ?? 0), 0),
            por_mes: Array.from(porMes, ([mes, v]) => ({ mes, ...v })).sort((a, b) => a.mes.localeCompare(b.mes)),
          };
        }

        async function loadContracts() {
          let q = supabaseAdmin
            .from("contracts")
            .select("number, object, modality, valid_from, valid_to, status, current_value")
            .eq("organization_id", orgId)
            .order("valid_from", { ascending: false });
          if (from) q = q.gte("valid_to", from);
          if (to) q = q.lte("valid_from", to);
          const { data } = await q;
          return data ?? [];
        }

        if (format === "csv") {
          const base = `dados-abertos-${slug}-${dataset}`;
          if (dataset === "frota" && datasets["frota"]) {
            const f = await loadVehicles();
            const rows: (string | number)[][] = [
              ...Object.entries(f.por_situacao).map(([k, v]) => ["situacao", k, v] as (string | number)[]),
              ...Object.entries(f.por_categoria).map(([k, v]) => ["categoria", k, v] as (string | number)[]),
            ];
            return csv(base, ["agrupamento", "valor", "quantidade_veiculos"], rows);
          }
          if (dataset === "abastecimento" && datasets["abastecimento"]) {
            const f = await loadFuelings();
            return csv(
              base,
              ["mes", "registros", "litros", "valor_total"],
              f.por_mes.map((m) => [m.mes, m.registros, m.litros.toFixed(4), m.valor.toFixed(2)]),
            );
          }
          if (dataset === "manutencao" && datasets["manutencao"]) {
            const m = await loadMaintenance();
            return csv(
              base,
              ["mes", "registros", "valor_total"],
              m.por_mes.map((r) => [r.mes, r.registros, r.valor.toFixed(2)]),
            );
          }
          if (dataset === "contratos" && datasets["contratos"]) {
            const c = await loadContracts();
            return csv(
              base,
              ["numero", "objeto", "modalidade", "vigencia_inicio", "vigencia_fim", "situacao", "valor_atual"],
              c.map((r) => [
                r.number ?? "",
                r.object ?? "",
                r.modality ?? "",
                r.valid_from ?? "",
                r.valid_to ?? "",
                r.status ?? "",
                Number(r.current_value ?? 0).toFixed(2),
              ]),
            );
          }
          return json({ error: "Conjunto de dados não publicado por este órgão." }, 404);
        }

        const payload: Record<string, unknown> = {
          orgao: org ?? null,
          apresentacao: settings.headline ?? null,
          periodo,
          atualizado_em: new Date().toISOString(),
          competencias_publicadas: competencias,
          conjuntos_disponiveis: Object.entries(datasets)
            .filter(([, v]) => v)
            .map(([k]) => k),
        };

        if (datasets["frota"]) payload["frota"] = await loadVehicles();
        if (datasets["abastecimento"]) payload["abastecimento"] = await loadFuelings();
        if (datasets["manutencao"]) payload["manutencao"] = await loadMaintenance();
        if (datasets["contratos"]) payload["contratos"] = await loadContracts();

        return json(payload);
      },
    },
  },
});
