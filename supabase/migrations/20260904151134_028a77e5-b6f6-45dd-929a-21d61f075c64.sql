ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS geocode_source text,
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS geocode_precision text;

ALTER TABLE public.workshops
  ADD COLUMN IF NOT EXISTS geocode_source text,
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS geocode_precision text;

ALTER TABLE public.accredited_partners
  ADD COLUMN IF NOT EXISTS geocode_source text,
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS geocode_precision text;

ALTER TABLE public.external_entities
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS geocoded_address text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocode_source text,
  ADD COLUMN IF NOT EXISTS geocode_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS geocode_precision text;

CREATE TABLE IF NOT EXISTS public.geocode_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL UNIQUE,
  latitude numeric,
  longitude numeric,
  display_name text,
  precision text,
  provider text NOT NULL DEFAULT 'nominatim',
  found boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.geocode_cache TO authenticated;
GRANT ALL ON public.geocode_cache TO service_role;

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem o cache de geocodificacao"
  ON public.geocode_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados gravam no cache de geocodificacao"
  ON public.geocode_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados atualizam o cache de geocodificacao"
  ON public.geocode_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_geocode_cache_updated_at
  BEFORE UPDATE ON public.geocode_cache
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();