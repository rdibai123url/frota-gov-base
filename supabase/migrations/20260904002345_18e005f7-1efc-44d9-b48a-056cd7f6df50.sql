-- ============================================================
-- FASE 10 — BLOCOS 5 e 6
-- ============================================================

-- Enums --------------------------------------------------------------------
CREATE TYPE public.market_value_origin AS ENUM ('manual','importada','api');
CREATE TYPE public.integration_kind AS ENUM ('detran','siafic','ldap_sso','fipe','webhook','api');
CREATE TYPE public.integration_status AS ENUM ('nao_configurado','configurado','ativo','erro','desativado');
CREATE TYPE public.integration_environment AS ENUM ('homologacao','producao');
CREATE TYPE public.integration_log_status AS ENUM ('sucesso','parcial','erro');
CREATE TYPE public.webhook_delivery_status AS ENUM ('pendente','entregue','falha','descartada');

-- 1. Valor de mercado / FIPE ------------------------------------------------
CREATE TABLE public.asset_market_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  value numeric NOT NULL CHECK (value >= 0),
  source text NOT NULL DEFAULT 'fipe' CHECK (source IN ('fipe','avaliacao','nota_fiscal','leilao','seguradora','outro')),
  origin public.market_value_origin NOT NULL DEFAULT 'manual',
  fipe_code text,
  source_reference text,
  notes text,
  import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.asset_market_values TO authenticated;
GRANT ALL ON public.asset_market_values TO service_role;
ALTER TABLE public.asset_market_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read market values in org" ON public.asset_market_values
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY "insert market values in org" ON public.asset_market_values
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE POLICY "update market values in org" ON public.asset_market_values
  FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_fleet())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE INDEX idx_market_values_vehicle ON public.asset_market_values(vehicle_id, reference_date DESC);
CREATE INDEX idx_market_values_org ON public.asset_market_values(organization_id, reference_date DESC);
CREATE TRIGGER set_updated_at_asset_market_values BEFORE UPDATE ON public.asset_market_values
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- garante que o veículo pertence ao mesmo órgão
CREATE OR REPLACE FUNCTION public.guard_market_value()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = NEW.vehicle_id AND v.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Ativo de outro órgão.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_asset_market_values BEFORE INSERT OR UPDATE ON public.asset_market_values
  FOR EACH ROW EXECUTE FUNCTION public.guard_market_value();

-- 2. Conectores de integração ----------------------------------------------
CREATE TABLE public.integration_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.integration_kind NOT NULL,
  status public.integration_status NOT NULL DEFAULT 'nao_configurado',
  environment public.integration_environment NOT NULL DEFAULT 'homologacao',
  provider text,
  base_url text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_name text,
  has_secret boolean NOT NULL DEFAULT false,
  documentation_url text,
  last_sync_at timestamptz,
  last_attempt_at timestamptz,
  last_result text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, kind)
);
GRANT SELECT, INSERT, UPDATE ON public.integration_connectors TO authenticated;
GRANT ALL ON public.integration_connectors TO service_role;
ALTER TABLE public.integration_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read connectors in org" ON public.integration_connectors
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY "insert connectors in org" ON public.integration_connectors
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "update connectors in org" ON public.integration_connectors
  FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_users())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE TRIGGER set_updated_at_integration_connectors BEFORE UPDATE ON public.integration_connectors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Logs de integração -----------------------------------------------------
CREATE TABLE public.integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid REFERENCES public.integration_connectors(id) ON DELETE SET NULL,
  kind public.integration_kind NOT NULL,
  operation text NOT NULL,
  direction text NOT NULL DEFAULT 'saida' CHECK (direction IN ('entrada','saida','teste')),
  status public.integration_log_status NOT NULL,
  message text,
  records_total integer NOT NULL DEFAULT 0,
  records_ok integer NOT NULL DEFAULT 0,
  records_error integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ref_table text,
  ref_id uuid,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT ON public.integration_logs TO authenticated;
GRANT ALL ON public.integration_logs TO service_role;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read integration logs in org" ON public.integration_logs
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "insert integration logs in org" ON public.integration_logs
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id());
CREATE INDEX idx_integration_logs_org ON public.integration_logs(organization_id, created_at DESC);
CREATE INDEX idx_integration_logs_kind ON public.integration_logs(kind, created_at DESC);

-- 4. Mapeamentos / layouts (SIAFIC e afins) --------------------------------
CREATE TABLE public.integration_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid REFERENCES public.integration_connectors(id) ON DELETE CASCADE,
  name text NOT NULL,
  entity text NOT NULL CHECK (entity IN ('empenhos','contratos','contratos_itens','centros_de_custo','dotacoes','liquidacoes','pagamentos','veiculos','abastecimentos','manutencoes')),
  format text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','json','api')),
  direction text NOT NULL DEFAULT 'exportacao' CHECK (direction IN ('exportacao','importacao')),
  delimiter text NOT NULL DEFAULT ';',
  field_map jsonb NOT NULL DEFAULT '[]'::jsonb,
  incremental boolean NOT NULL DEFAULT true,
  last_exported_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.integration_mappings TO authenticated;
GRANT ALL ON public.integration_mappings TO service_role;
ALTER TABLE public.integration_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read mappings in org" ON public.integration_mappings
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY "insert mappings in org" ON public.integration_mappings
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "update mappings in org" ON public.integration_mappings
  FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_users())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE TRIGGER set_updated_at_integration_mappings BEFORE UPDATE ON public.integration_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Consultas DETRAN -------------------------------------------------------
CREATE TABLE public.detran_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  connector_id uuid REFERENCES public.integration_connectors(id) ON DELETE SET NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'detran',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  divergences jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  applied_by uuid,
  applied_fields text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.detran_snapshots TO authenticated;
GRANT ALL ON public.detran_snapshots TO service_role;
ALTER TABLE public.detran_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read detran snapshots in org" ON public.detran_snapshots
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY "insert detran snapshots in org" ON public.detran_snapshots
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE POLICY "update detran snapshots in org" ON public.detran_snapshots
  FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_fleet())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE INDEX idx_detran_snapshots_vehicle ON public.detran_snapshots(vehicle_id, fetched_at DESC);

-- 6. Webhooks ---------------------------------------------------------------
CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret_name text,
  has_secret boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  max_retries integer NOT NULL DEFAULT 5 CHECK (max_retries BETWEEN 0 AND 20),
  timeout_ms integer NOT NULL DEFAULT 10000,
  description text,
  last_delivery_at timestamptz,
  last_status public.webhook_delivery_status,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read webhooks in org" ON public.webhook_endpoints
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "insert webhooks in org" ON public.webhook_endpoints
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "update webhooks in org" ON public.webhook_endpoints
  FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_users())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE TRIGGER set_updated_at_webhook_endpoints BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.webhook_delivery_status NOT NULL DEFAULT 'pendente',
  attempt integer NOT NULL DEFAULT 0,
  response_status integer,
  response_body text,
  error_message text,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read deliveries in org" ON public.webhook_deliveries
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "insert deliveries in org" ON public.webhook_deliveries
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "update deliveries in org" ON public.webhook_deliveries
  FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_users())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE INDEX idx_webhook_deliveries_endpoint ON public.webhook_deliveries(endpoint_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_pending ON public.webhook_deliveries(status, next_retry_at);
CREATE TRIGGER set_updated_at_webhook_deliveries BEFORE UPDATE ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Fatores de emissão (ESG) ----------------------------------------------
CREATE TABLE public.emission_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fuel_type_id uuid REFERENCES public.fuel_types(id) ON DELETE CASCADE,
  fuel_key text NOT NULL,
  label text NOT NULL,
  factor_kg_co2e_per_unit numeric NOT NULL CHECK (factor_kg_co2e_per_unit >= 0),
  unit text NOT NULL DEFAULT 'L',
  renewable_share_pct numeric NOT NULL DEFAULT 0 CHECK (renewable_share_pct >= 0 AND renewable_share_pct <= 100),
  source text NOT NULL,
  reference text,
  version text NOT NULL DEFAULT '1',
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.emission_factors TO authenticated;
GRANT ALL ON public.emission_factors TO service_role;
ALTER TABLE public.emission_factors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read emission factors in org" ON public.emission_factors
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY "insert emission factors in org" ON public.emission_factors
  FOR INSERT TO authenticated WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE POLICY "update emission factors in org" ON public.emission_factors
  FOR UPDATE TO authenticated USING (organization_id = public.current_org_id() AND public.can_manage_fleet())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE INDEX idx_emission_factors_org ON public.emission_factors(organization_id, active, valid_from DESC);
CREATE TRIGGER set_updated_at_emission_factors BEFORE UPDATE ON public.emission_factors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8. Geolocalização da rede -------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS geocoded_address text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
ALTER TABLE public.workshops
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS geocoded_address text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
ALTER TABLE public.accredited_partners
  ADD COLUMN IF NOT EXISTS geocoded_address text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

-- 9. Fatores de emissão padrão para os órgãos existentes --------------------
INSERT INTO public.emission_factors (organization_id, fuel_key, label, factor_kg_co2e_per_unit, unit, renewable_share_pct, source, reference, version, valid_from)
SELECT o.id, f.k, f.l, f.v, 'L', f.r, 'IPCC/MCTI — fatores de referência para inventários de GEE', 'Estimativa institucional; ajustar conforme inventário oficial do órgão', '1', DATE '2026-01-01'
FROM public.organizations o
CROSS JOIN (VALUES
  ('gasolina','Gasolina comum/aditivada', 2.21, 27),
  ('etanol','Etanol hidratado', 0.31, 100),
  ('diesel','Óleo diesel (S10/S500)', 2.60, 12),
  ('gnv','GNV', 1.85, 0),
  ('arla','Arla 32', 0.00, 0),
  ('eletrico','Energia elétrica (kWh)', 0.08, 85)
) AS f(k,l,v,r)
ON CONFLICT DO NOTHING;

-- 10. Conectores padrão (todos "não configurado") ---------------------------
INSERT INTO public.integration_connectors (organization_id, kind, status, environment, documentation_url)
SELECT o.id, k.kind, 'nao_configurado'::public.integration_status, 'homologacao'::public.integration_environment, NULL
FROM public.organizations o
CROSS JOIN (VALUES
  ('detran'::public.integration_kind),
  ('siafic'::public.integration_kind),
  ('ldap_sso'::public.integration_kind),
  ('fipe'::public.integration_kind),
  ('webhook'::public.integration_kind),
  ('api'::public.integration_kind)
) AS k(kind)
ON CONFLICT (organization_id, kind) DO NOTHING;