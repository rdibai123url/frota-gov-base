-- Afastamento de motoristas (férias, licença, INSS, atestado de até 15 dias).
-- O motorista volta a ficar disponível sozinho na data de retorno: não há tarefa agendada,
-- a situação é sempre calculada pela data.

CREATE TABLE public.driver_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('ferias', 'licenca', 'inss', 'atestado')),
  start_date date NOT NULL DEFAULT current_date,
  expected_return date,
  returned_at date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_absences_return_after_start_chk
    CHECK (expected_return IS NULL OR expected_return > start_date),
  CONSTRAINT driver_absences_returned_after_start_chk
    CHECK (returned_at IS NULL OR returned_at >= start_date),
  -- atestado: prazo obrigatório e de no máximo 15 dias
  CONSTRAINT driver_absences_atestado_chk
    CHECK (reason <> 'atestado' OR (expected_return IS NOT NULL AND expected_return - start_date <= 15))
);
CREATE INDEX driver_absences_driver_idx ON public.driver_absences (driver_id, start_date DESC);
CREATE TRIGGER touch_driver_absences BEFORE UPDATE ON public.driver_absences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

/* O motorista está afastado nesta data? Retorna o motivo ou nulo. */
CREATE OR REPLACE FUNCTION public.driver_absence_on(_driver uuid, _date date)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT a.reason
    FROM public.driver_absences a
   WHERE a.driver_id = _driver
     AND _date >= a.start_date
     AND (a.returned_at IS NULL OR _date < a.returned_at)
     AND (a.expected_return IS NULL OR _date < a.expected_return)
   ORDER BY a.start_date DESC
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.driver_absence_on(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_absence_on(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.absence_label(_reason text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _reason WHEN 'ferias' THEN 'férias' WHEN 'licenca' THEN 'licença'
                      WHEN 'inss' THEN 'INSS' WHEN 'atestado' THEN 'atestado' ELSE _reason END;
$$;

/* Não escalar nem agendar motorista afastado. */
CREATE OR REPLACE FUNCTION public.guard_driver_absence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d date;
  r text;
BEGIN
  IF NEW.driver_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'vehicle_usages' THEN
    d := NEW.planned_departure::date;
  ELSIF TG_TABLE_NAME = 'fuel_authorizations' THEN
    d := NEW.valid_from::date;
  END IF;
  IF d IS NULL THEN RETURN NEW; END IF;
  r := public.driver_absence_on(NEW.driver_id, d);
  IF r IS NOT NULL THEN
    RAISE EXCEPTION 'O condutor está afastado (%) na data %', public.absence_label(r), to_char(d, 'DD/MM/YYYY')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_driver_absence() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_driver_absence_usage
  BEFORE INSERT OR UPDATE OF driver_id, planned_departure ON public.vehicle_usages
  FOR EACH ROW EXECUTE FUNCTION public.guard_driver_absence();
CREATE TRIGGER guard_driver_absence_authorization
  BEFORE INSERT OR UPDATE OF driver_id, valid_from ON public.fuel_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_driver_absence();

ALTER TABLE public.driver_absences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_absences TO authenticated;
GRANT ALL ON public.driver_absences TO service_role;
CREATE POLICY "read driver_absences" ON public.driver_absences FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert driver_absences" ON public.driver_absences FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "update driver_absences" ON public.driver_absences FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_write())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "delete driver_absences" ON public.driver_absences FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_finance());
