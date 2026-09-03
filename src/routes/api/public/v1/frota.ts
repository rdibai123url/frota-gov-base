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

        const { data: vehicles } = await supabaseAdmin
          .from("vehicles")
          .select("id, asset_code, vehicle_type, brand, model, year_model, status, fuel_type")
          .eq("organization_id", key.organization_id)
          .order("asset_code");

        await supabaseAdmin
          .from("org_api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", key.id);

        return json({
          version: "v1",
          generated_at: new Date().toISOString(),
          count: vehicles?.length ?? 0,
          data: vehicles ?? [],
        });
      },
    },
  },
});
