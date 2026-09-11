-- Inteligência de viagens: rota planejada, distância e consumo estimado.
-- Alterações apenas aditivas; nenhum campo existente é alterado ou removido.

ALTER TABLE public.vehicle_usages
  ADD COLUMN IF NOT EXISTS round_trip BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimated_distance_km NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS estimated_duration_min INTEGER,
  ADD COLUMN IF NOT EXISTS route_geometry JSONB,
  ADD COLUMN IF NOT EXISTS route_provider TEXT,
  ADD COLUMN IF NOT EXISTS route_calculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS distance_source TEXT NOT NULL DEFAULT 'nao_calculada',
  ADD COLUMN IF NOT EXISTS estimated_consumption_kmpl NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS consumption_source TEXT,
  ADD COLUMN IF NOT EXISTS estimated_liters NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fuel_price_used NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14,2);

-- Origem da distância: calculada por serviço de rotas, informada manualmente
-- pelo servidor, ou ainda não calculada.
ALTER TABLE public.vehicle_usages
  DROP CONSTRAINT IF EXISTS vehicle_usages_distance_source_check;
ALTER TABLE public.vehicle_usages
  ADD CONSTRAINT vehicle_usages_distance_source_check
  CHECK (distance_source IN ('nao_calculada', 'rota', 'manual'));

ALTER TABLE public.vehicle_usages
  DROP CONSTRAINT IF EXISTS vehicle_usages_consumption_source_check;
ALTER TABLE public.vehicle_usages
  ADD CONSTRAINT vehicle_usages_consumption_source_check
  CHECK (consumption_source IS NULL OR consumption_source IN ('historico', 'parametro', 'manual'));

-- Cache compartilhado de rotas por par de coordenadas, para não repetir
-- consultas ao provedor. Não contém dado de nenhum órgão.
CREATE TABLE IF NOT EXISTS public.route_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  origin_lat NUMERIC(10,6) NOT NULL,
  origin_lon NUMERIC(10,6) NOT NULL,
  destination_lat NUMERIC(10,6) NOT NULL,
  destination_lon NUMERIC(10,6) NOT NULL,
  distance_km NUMERIC(12,2),
  duration_min INTEGER,
  geometry JSONB,
  provider TEXT NOT NULL,
  found BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.route_cache TO authenticated;
GRANT ALL ON public.route_cache TO service_role;

ALTER TABLE public.route_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_cache_select" ON public.route_cache;
CREATE POLICY "route_cache_select" ON public.route_cache
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "route_cache_insert" ON public.route_cache;
CREATE POLICY "route_cache_insert" ON public.route_cache
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "route_cache_update" ON public.route_cache;
CREATE POLICY "route_cache_update" ON public.route_cache
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS route_cache_key_idx ON public.route_cache (cache_key);
