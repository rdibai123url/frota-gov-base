/** Dados agregados do Portal da Transparência — somente órgãos com publicação ativa. */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });

export const Route = createFileRoute("/api/public/v1/transparencia/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = String(params.slug || "").slice(0, 60);
        if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: "Endereço inválido." }, 400);

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

        const payload: Record<string, unknown> = {
          orgao: org ?? null,
          apresentacao: settings.headline ?? null,
          atualizado_em: new Date().toISOString(),
        };

        if (datasets["frota"]) {
          const { data: vehicles } = await supabaseAdmin
            .from("vehicles")
            .select("status, vehicle_type")
            .eq("organization_id", orgId);
          const porSituacao: Record<string, number> = {};
          const porCategoria: Record<string, number> = {};
          for (const v of vehicles ?? []) {
            porSituacao[v.status] = (porSituacao[v.status] ?? 0) + 1;
            const cat = v.vehicle_type ?? "não informado";
            porCategoria[cat] = (porCategoria[cat] ?? 0) + 1;
          }
          payload["frota"] = { total: vehicles?.length ?? 0, por_situacao: porSituacao, por_categoria: porCategoria };
        }

        if (datasets["abastecimento"]) {
          const { data: fuelings } = await supabaseAdmin
            .from("fuelings")
            .select("quantity, total_value, status")
            .eq("organization_id", orgId);
          const valid = (fuelings ?? []).filter((f) => f.status !== "cancelado");
          payload["abastecimento"] = {
            registros: valid.length,
            litros: valid.reduce((s, f) => s + Number(f.quantity ?? 0), 0),
            valor_total: valid.reduce((s, f) => s + Number(f.total_value ?? 0), 0),
          };
        }

        if (datasets["manutencao"]) {
          const { data: maints } = await supabaseAdmin
            .from("maintenance_records")
            .select("total_value, status")
            .eq("organization_id", orgId);
          const valid = (maints ?? []).filter((m) => m.status !== "cancelada");
          payload["manutencao"] = {
            registros: valid.length,
            valor_total: valid.reduce((s, m) => s + Number(m.total_value ?? 0), 0),
          };
        }

        if (datasets["contratos"]) {
          const { data: contracts } = await supabaseAdmin
            .from("contracts")
            .select("number, object, start_date, end_date, status, total_value")
            .eq("organization_id", orgId)
            .order("start_date", { ascending: false });
          payload["contratos"] = contracts ?? [];
        }

        return json(payload);
      },
    },
  },
});
