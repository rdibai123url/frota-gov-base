-- FrotaGov: revisão de consolidação. Aplicação remota exige autorização.
BEGIN;

ALTER TABLE public.vehicle_usages
  ADD COLUMN round_trip boolean NOT NULL DEFAULT false,
  ADD COLUMN estimated_distance_km numeric(12,2),
  ADD COLUMN estimated_duration_min integer,
  ADD COLUMN route_geometry jsonb,
  ADD COLUMN route_provider text,
  ADD COLUMN route_calculated_at timestamptz,
  ADD COLUMN distance_source text NOT NULL DEFAULT 'nao_calculada',
  ADD COLUMN estimated_consumption_kmpl numeric(8,2),
  ADD COLUMN consumption_source text,
  ADD COLUMN estimated_liters numeric(12,2),
  ADD COLUMN fuel_price_used numeric(12,4),
  ADD COLUMN estimated_cost numeric(14,2),
  ADD CONSTRAINT vehicle_usages_distance_source_check CHECK (distance_source IN ('nao_calculada','rota','manual')),
  ADD CONSTRAINT vehicle_usages_consumption_source_check CHECK (consumption_source IN ('historico','parametro','manual')),
  ADD CONSTRAINT vehicle_usages_estimates_check CHECK (
    (estimated_distance_km IS NULL OR estimated_distance_km >= 0 AND estimated_distance_km < 'Infinity'::numeric) AND
    (estimated_duration_min IS NULL OR estimated_duration_min >= 0) AND
    (estimated_consumption_kmpl IS NULL OR estimated_consumption_kmpl > 0 AND estimated_consumption_kmpl < 'Infinity'::numeric) AND
    (estimated_liters IS NULL OR estimated_liters >= 0 AND estimated_liters < 'Infinity'::numeric) AND
    (fuel_price_used IS NULL OR fuel_price_used >= 0 AND fuel_price_used < 'Infinity'::numeric) AND
    (estimated_cost IS NULL OR estimated_cost >= 0 AND estimated_cost < 'Infinity'::numeric)),
  ADD CONSTRAINT vehicle_usages_geometry_check CHECK (route_geometry IS NULL OR
    (jsonb_typeof(route_geometry) = 'object' AND route_geometry ? 'type' AND route_geometry ? 'coordinates'
     AND route_geometry->>'type' = 'LineString' AND jsonb_typeof(route_geometry->'coordinates') = 'array'));

CREATE TABLE public.route_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  cache_key text NOT NULL,
  origin_lat numeric(10,6) NOT NULL CHECK (origin_lat BETWEEN -90 AND 90),
  origin_lon numeric(10,6) NOT NULL CHECK (origin_lon BETWEEN -180 AND 180),
  destination_lat numeric(10,6) NOT NULL CHECK (destination_lat BETWEEN -90 AND 90),
  destination_lon numeric(10,6) NOT NULL CHECK (destination_lon BETWEEN -180 AND 180),
  distance_km numeric(12,2) CHECK (distance_km >= 0 AND distance_km < 'Infinity'::numeric),
  duration_min integer CHECK (duration_min >= 0),
  geometry jsonb,
  provider text NOT NULL,
  found boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, cache_key),
  CHECK (NOT found OR distance_km IS NOT NULL),
  CHECK (geometry IS NULL OR (jsonb_typeof(geometry) = 'object' AND geometry ? 'type' AND geometry ? 'coordinates'
    AND geometry->>'type' = 'LineString' AND jsonb_typeof(geometry->'coordinates') = 'array'))
);
ALTER TABLE public.route_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.route_cache FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.route_cache TO service_role;
-- O servidor autentica o usuário e deriva organization_id, nunca o recebe como autorização do browser.
-- Não reutilizar entradas legadas que puderam ser alteradas por usuários autenticados.
-- Os consumidores usarão chaves com namespace de versão; nenhum dado antigo é removido.
REVOKE ALL ON public.geocode_cache FROM PUBLIC, anon, authenticated;
DROP POLICY "Autenticados leem o cache de geocodificacao" ON public.geocode_cache;
DROP POLICY "Autenticados gravam no cache de geocodificacao" ON public.geocode_cache;
DROP POLICY "Autenticados atualizam o cache de geocodificacao" ON public.geocode_cache;
GRANT SELECT, INSERT, UPDATE ON public.geocode_cache TO service_role;

COMMIT;
