
CREATE TYPE public.app_role AS ENUM ('super_admin','org_admin','fleet_manager','unit_manager','operator','auditor');
CREATE TYPE public.org_type AS ENUM ('prefeitura','camara','consorcio','autarquia','fundacao','secretaria','outro');
CREATE TYPE public.unit_type AS ENUM ('secretaria','departamento','diretoria','coordenacao','unidade','outro');
CREATE TYPE public.vehicle_status AS ENUM ('ativo','manutencao','cedido','inativo','baixado');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  short_name text,
  org_type public.org_type NOT NULL DEFAULT 'prefeitura',
  cnpj text, city text, state text, address text, zip_code text,
  phone text, email text, website text, logo_url text,
  authority_name text, authority_role text, authority_cpf text,
  term_start date, term_end date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name text, email text, job_title text, phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, organization_id)
);

CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL, acronym text,
  unit_type public.unit_type NOT NULL DEFAULT 'secretaria',
  manager_name text, manager_role text, phone text, email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);

CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  plate text NOT NULL, asset_code text, renavam text, chassis text,
  brand text, model text, year_manufacture int, year_model int, color text,
  vehicle_type text, fuel_type text, tank_capacity numeric,
  current_km numeric, hour_meter numeric,
  status public.vehicle_status NOT NULL DEFAULT 'ativo', notes text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid,
  UNIQUE (organization_id, plate)
);

CREATE INDEX idx_units_org ON public.units(organization_id);
CREATE INDEX idx_vehicles_org ON public.vehicles(organization_id);
CREATE INDEX idx_profiles_org ON public.profiles(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_write()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin','org_admin','fleet_manager','unit_manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_org_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_units_updated BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.touch_profile_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_profile_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid;
  v_org_name text;
BEGIN
  v_org_name := NULLIF(NEW.raw_user_meta_data ->> 'org_name', '');
  IF v_org_name IS NOT NULL THEN
    INSERT INTO public.organizations (legal_name, short_name, created_by, updated_by)
    VALUES (v_org_name, NULLIF(NEW.raw_user_meta_data ->> 'org_short_name',''), NEW.id, NEW.id)
    RETURNING id INTO v_org_id;
  END IF;

  INSERT INTO public.profiles (id, organization_id, full_name, email)
  VALUES (NEW.id, v_org_id, NEW.raw_user_meta_data ->> 'full_name', NEW.email);

  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, organization_id, role) VALUES (NEW.id, v_org_id, 'org_admin');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read own org" ON public.organizations FOR SELECT TO authenticated
USING (id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "org admins update own org" ON public.organizations FOR UPDATE TO authenticated
USING ((id = public.current_org_id() AND (public.has_role(auth.uid(),'org_admin') OR public.has_role(auth.uid(),'fleet_manager'))) OR public.is_super_admin(auth.uid()))
WITH CHECK ((id = public.current_org_id() AND (public.has_role(auth.uid(),'org_admin') OR public.has_role(auth.uid(),'fleet_manager'))) OR public.is_super_admin(auth.uid()));
CREATE POLICY "super admins create orgs" ON public.organizations FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "read profiles in org" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_super_admin(auth.uid()))
WITH CHECK (id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "read roles in org" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "read units in org" ON public.units FOR SELECT TO authenticated
USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert units in org" ON public.units FOR INSERT TO authenticated
WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "update units in org" ON public.units FOR UPDATE TO authenticated
USING (organization_id = public.current_org_id() AND public.can_write())
WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "delete units in org" ON public.units FOR DELETE TO authenticated
USING (organization_id = public.current_org_id() AND public.can_write());

CREATE POLICY "read vehicles in org" ON public.vehicles FOR SELECT TO authenticated
USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert vehicles in org" ON public.vehicles FOR INSERT TO authenticated
WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "update vehicles in org" ON public.vehicles FOR UPDATE TO authenticated
USING (organization_id = public.current_org_id() AND public.can_write())
WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "delete vehicles in org" ON public.vehicles FOR DELETE TO authenticated
USING (organization_id = public.current_org_id() AND public.can_write());
