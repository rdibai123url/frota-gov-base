/** API pública versionada do FrotaGov — leitura autenticada por chave do órgão. */
import { createFileRoute } from "@tanstack/react-router";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

export const Route = createFileRoute("/api/public/v1/frota")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) return json({ error: "Chave de API ausente." }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const prefix = apiKey.split(".")[0] ?? "";
        const { data: key } = await supabaseAdmin
          .from("org_api_keys")
          .select("id, organization_id, key_hash, scopes, expires_at, revoked_at")
          .eq("prefix", prefix)
          .maybeSingle();

        if (!key || key.revoked_at) return json({ error: "Chave inválida ou revogada." }, 401);
        if (key.expires_at && new Date(key.expires_at) < new Date())
          return json({ error: "Chave expirada." }, 401);
        if ((await sha256(apiKey)) !== key.key_hash) return json({ error: "Chave inválida." }, 401);

        const scopes = (key.scopes as string[] | null) ?? [];
        if (scopes.length && !scopes.includes("frota:read") && !scopes.includes("*"))
          return json({ error: "Chave sem permissão para o recurso de frota." }, 403);

        const url = new URL(request.url);
        const page = Math.max(1, Number(url.searchParams.get("pagina") ?? url.searchParams.get("page") ?? 1) || 1);
        const requested = Number(url.searchParams.get("por_pagina") ?? url.searchParams.get("page_size") ?? DEFAULT_PAGE_SIZE);
        const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested || DEFAULT_PAGE_SIZE));
        const status = url.searchParams.get("situacao");
        const fromIndex = (page - 1) * pageSize;

        let q = supabaseAdmin
          .from("vehicles")
          .select("id, asset_code, vehicle_type, brand, model, year_model, status, fuel_type", { count: "exact" })
          .eq("organization_id", key.organization_id)
          .order("asset_code")
          .range(fromIndex, fromIndex + pageSize - 1);
        if (status) q = q.eq("status", status as never);

        const { data: vehicles, count, error } = await q;
        if (error) return json({ error: "Não foi possível consultar a frota." }, 500);

        await supabaseAdmin
          .from("org_api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", key.id);

        const total = count ?? vehicles?.length ?? 0;
        return json({
          version: "v1",
          generated_at: new Date().toISOString(),
          pagination: {
            page,
            page_size: pageSize,
            total,
            total_pages: Math.max(1, Math.ceil(total / pageSize)),
            has_next: fromIndex + (vehicles?.length ?? 0) < total,
          },
          count: vehicles?.length ?? 0,
          data: vehicles ?? [],
        });
      },
    },
  },
});
