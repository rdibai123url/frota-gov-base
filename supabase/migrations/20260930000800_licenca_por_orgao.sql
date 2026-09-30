-- Licença por órgão/empresa: plano contratado com limite de veículos e de usuários.
-- Sem linha cadastrada = sem limite. Só o Super Admin da plataforma altera.

CREATE TABLE public.organization_license (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_name text NOT NULL DEFAULT 'Personalizado',
  max_vehicles integer CHECK (max_vehicles IS NULL OR max_vehicles >= 1),
  max_users integer CHECK (max_users IS NULL OR max_users >= 1),
  valid_until date,
  notes text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_license ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_license TO authenticated;
GRANT ALL ON public.organization_license TO service_role;
CREATE POLICY "read organization_license" ON public.organization_license FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "write organization_license" ON public.organization_license FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

/* Bloqueia o cadastro além do limite do plano. */
CREATE OR REPLACE FUNCTION public.enforce_license_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lim integer;
  cur integer;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'vehicles' THEN
    SELECT max_vehicles INTO lim FROM public.organization_license WHERE organization_id = NEW.organization_id;
    IF lim IS NOT NULL THEN
      SELECT count(*) INTO cur FROM public.vehicles WHERE organization_id = NEW.organization_id;
      IF cur >= lim THEN
        RAISE EXCEPTION 'Limite de % veículo(s) do plano contratado atingido. Solicite ampliação da licença.', lim
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    SELECT max_users INTO lim FROM public.organization_license WHERE organization_id = NEW.organization_id;
    IF lim IS NOT NULL THEN
      SELECT count(*) INTO cur FROM public.profiles WHERE organization_id = NEW.organization_id;
      IF cur >= lim THEN
        RAISE EXCEPTION 'Limite de % usuário(s) do plano contratado atingido. Solicite ampliação da licença.', lim
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_license_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER vehicle_license_limit BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_license_limit();
CREATE TRIGGER profile_license_limit BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_license_limit();
