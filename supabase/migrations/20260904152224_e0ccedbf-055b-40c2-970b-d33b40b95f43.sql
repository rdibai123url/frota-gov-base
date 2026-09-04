ALTER TYPE public.integration_kind ADD VALUE IF NOT EXISTS 'serpro';
ALTER TYPE public.integration_kind ADD VALUE IF NOT EXISTS 'oidc';
ALTER TYPE public.integration_kind ADD VALUE IF NOT EXISTS 'saml';
ALTER TYPE public.integration_kind ADD VALUE IF NOT EXISTS 'ldap';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS fipe_kind text,
  ADD COLUMN IF NOT EXISTS fipe_brand_code text,
  ADD COLUMN IF NOT EXISTS fipe_brand_name text,
  ADD COLUMN IF NOT EXISTS fipe_model_code text,
  ADD COLUMN IF NOT EXISTS fipe_model_name text,
  ADD COLUMN IF NOT EXISTS fipe_year_code text,
  ADD COLUMN IF NOT EXISTS fipe_code text,
  ADD COLUMN IF NOT EXISTS fipe_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS fipe_reference_label text,
  ADD COLUMN IF NOT EXISTS fipe_reference_date date,
  ADD COLUMN IF NOT EXISTS fipe_last_query_at timestamptz,
  ADD COLUMN IF NOT EXISTS fipe_last_status text,
  ADD COLUMN IF NOT EXISTS fipe_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS official_source text,
  ADD COLUMN IF NOT EXISTS official_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS official_source_timestamp timestamptz;

ALTER TABLE public.asset_market_values
  ADD COLUMN IF NOT EXISTS reference_label text,
  ADD COLUMN IF NOT EXISTS provider text;

CREATE UNIQUE INDEX IF NOT EXISTS asset_market_values_month_unique
  ON public.asset_market_values (
    vehicle_id,
    origin,
    ((date_trunc('month', reference_date::timestamp))::date)
  );

ALTER TABLE public.integration_connectors
  ADD COLUMN IF NOT EXISTS auto_sync boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_interval_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS next_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

ALTER TABLE public.detran_snapshots
  ADD COLUMN IF NOT EXISTS source_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS detran_snapshots_content_unique
  ON public.detran_snapshots (vehicle_id, source, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sso_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protocol text NOT NULL CHECK (protocol IN ('oidc','saml')),
  display_name text NOT NULL,
  issuer text,
  metadata_url text,
  client_id text,
  redirect_uri text,
  scopes text[] NOT NULL DEFAULT ARRAY['openid','email','profile'],
  certificate_fingerprint text,
  secret_name text,
  has_secret boolean NOT NULL DEFAULT false,
  jit_provisioning boolean NOT NULL DEFAULT false,
  default_role public.app_role NOT NULL DEFAULT 'operator',
  allowed_domains text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT false,
  status public.integration_status NOT NULL DEFAULT 'nao_configurado',
  last_test_at timestamptz,
  last_result text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sso_providers TO authenticated;
GRANT ALL ON public.sso_providers TO service_role;
ALTER TABLE public.sso_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read sso providers in org" ON public.sso_providers
  FOR SELECT TO authenticated USING (organization_id = current_org_id());
CREATE POLICY "insert sso providers in org" ON public.sso_providers
  FOR INSERT TO authenticated WITH CHECK (organization_id = current_org_id() AND can_manage_users());
CREATE POLICY "update sso providers in org" ON public.sso_providers
  FOR UPDATE TO authenticated USING (organization_id = current_org_id() AND can_manage_users())
  WITH CHECK (organization_id = current_org_id() AND can_manage_users());
CREATE POLICY "delete sso providers in org" ON public.sso_providers
  FOR DELETE TO authenticated USING (organization_id = current_org_id() AND can_manage_users());

CREATE TRIGGER update_sso_providers_updated_at BEFORE UPDATE ON public.sso_providers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.sso_claim_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.sso_providers(id) ON DELETE CASCADE,
  claim text NOT NULL,
  claim_value text NOT NULL,
  role public.app_role NOT NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (provider_id, claim, claim_value, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sso_claim_mappings TO authenticated;
GRANT ALL ON public.sso_claim_mappings TO service_role;
ALTER TABLE public.sso_claim_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read sso claim mappings in org" ON public.sso_claim_mappings
  FOR SELECT TO authenticated USING (organization_id = current_org_id());
CREATE POLICY "insert sso claim mappings in org" ON public.sso_claim_mappings
  FOR INSERT TO authenticated WITH CHECK (organization_id = current_org_id() AND can_manage_users());
CREATE POLICY "update sso claim mappings in org" ON public.sso_claim_mappings
  FOR UPDATE TO authenticated USING (organization_id = current_org_id() AND can_manage_users())
  WITH CHECK (organization_id = current_org_id() AND can_manage_users());
CREATE POLICY "delete sso claim mappings in org" ON public.sso_claim_mappings
  FOR DELETE TO authenticated USING (organization_id = current_org_id() AND can_manage_users());

CREATE TRIGGER update_sso_claim_mappings_updated_at BEFORE UPDATE ON public.sso_claim_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.ldap_directories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  host text,
  port integer NOT NULL DEFAULT 636,
  use_tls boolean NOT NULL DEFAULT true,
  base_dn text,
  bind_dn text,
  secret_name text,
  has_secret boolean NOT NULL DEFAULT false,
  user_filter text NOT NULL DEFAULT '(&(objectClass=person)(sAMAccountName={login}))',
  login_attribute text NOT NULL DEFAULT 'sAMAccountName',
  email_attribute text NOT NULL DEFAULT 'mail',
  name_attribute text NOT NULL DEFAULT 'displayName',
  group_attribute text NOT NULL DEFAULT 'memberOf',
  connectivity_mode text NOT NULL DEFAULT 'nao_definida'
    CHECK (connectivity_mode IN ('nao_definida','vpn','tunel','agente_local','endpoint_publico')),
  gateway_url text,
  sync_enabled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  status public.integration_status NOT NULL DEFAULT 'nao_configurado',
  last_test_at timestamptz,
  last_result text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ldap_directories TO authenticated;
GRANT ALL ON public.ldap_directories TO service_role;
ALTER TABLE public.ldap_directories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read ldap directories in org" ON public.ldap_directories
  FOR SELECT TO authenticated USING (organization_id = current_org_id());
CREATE POLICY "insert ldap directories in org" ON public.ldap_directories
  FOR INSERT TO authenticated WITH CHECK (organization_id = current_org_id() AND can_manage_users());
CREATE POLICY "update ldap directories in org" ON public.ldap_directories
  FOR UPDATE TO authenticated USING (organization_id = current_org_id() AND can_manage_users())
  WITH CHECK (organization_id = current_org_id() AND can_manage_users());
CREATE POLICY "delete ldap directories in org" ON public.ldap_directories
  FOR DELETE TO authenticated USING (organization_id = current_org_id() AND can_manage_users());

CREATE TRIGGER update_ldap_directories_updated_at BEFORE UPDATE ON public.ldap_directories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.ldap_group_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  directory_id uuid NOT NULL REFERENCES public.ldap_directories(id) ON DELETE CASCADE,
  group_dn text NOT NULL,
  role public.app_role NOT NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (directory_id, group_dn, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ldap_group_mappings TO authenticated;
GRANT ALL ON public.ldap_group_mappings TO service_role;
ALTER TABLE public.ldap_group_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read ldap group mappings in org" ON public.ldap_group_mappings
  FOR SELECT TO authenticated USING (organization_id = current_org_id());
CREATE POLICY "insert ldap group mappings in org" ON public.ldap_group_mappings
  FOR INSERT TO authenticated WITH CHECK (organization_id = current_org_id() AND can_manage_users());
CREATE POLICY "update ldap group mappings in org" ON public.ldap_group_mappings
  FOR UPDATE TO authenticated USING (organization_id = current_org_id() AND can_manage_users())
  WITH CHECK (organization_id = current_org_id() AND can_manage_users());
CREATE POLICY "delete ldap group mappings in org" ON public.ldap_group_mappings
  FOR DELETE TO authenticated USING (organization_id = current_org_id() AND can_manage_users());

CREATE TRIGGER update_ldap_group_mappings_updated_at BEFORE UPDATE ON public.ldap_group_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.auth_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  email text,
  method text NOT NULL DEFAULT 'senha' CHECK (method IN ('senha','oidc','saml','ldap','recuperacao')),
  provider_id uuid,
  success boolean NOT NULL,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.auth_login_events TO authenticated;
GRANT ALL ON public.auth_login_events TO service_role;
ALTER TABLE public.auth_login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read login events in org" ON public.auth_login_events
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id() AND (can_manage_users() OR has_role(auth.uid(), 'auditor')));
CREATE POLICY "insert own login events" ON public.auth_login_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS auth_login_events_org_idx ON public.auth_login_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vehicles_fipe_code_idx ON public.vehicles (organization_id, fipe_code);