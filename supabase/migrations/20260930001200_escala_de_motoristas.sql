-- Escala de motoristas por unidade de plantão (ex.: SAMU unidade X). A escala é montada por mês:
-- cada turno tem motorista, dia, horário de início e carga horária (8, 12 ou 24 horas).

CREATE TABLE public.duty_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX duty_units_name_uidx ON public.duty_units (organization_id, lower(trim(name)));
CREATE TRIGGER touch_duty_units BEFORE UPDATE ON public.duty_units
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.duty_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  duty_unit_id uuid NOT NULL REFERENCES public.duty_units(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  hours smallint NOT NULL CHECK (hours IN (8, 12, 24)),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX duty_shifts_unit_date_idx ON public.duty_shifts (duty_unit_id, shift_date);
CREATE INDEX duty_shifts_driver_date_idx ON public.duty_shifts (driver_id, shift_date);

/* Regras do turno: motorista não pode estar afastado nem em dois turnos ao mesmo tempo. */
CREATE OR REPLACE FUNCTION public.guard_duty_shift()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  s timestamp := NEW.shift_date + NEW.start_time;
  e timestamp := NEW.shift_date + NEW.start_time + make_interval(hours => NEW.hours);
  r text;
BEGIN
  r := public.driver_absence_on(NEW.driver_id, NEW.shift_date);
  IF r IS NOT NULL THEN
    RAISE EXCEPTION 'O condutor está afastado (%) em %', public.absence_label(r), to_char(NEW.shift_date, 'DD/MM/YYYY')
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.duty_shifts o
     WHERE o.driver_id = NEW.driver_id
       AND o.id IS DISTINCT FROM NEW.id
       AND (o.shift_date + o.start_time) < e
       AND (o.shift_date + o.start_time + make_interval(hours => o.hours)) > s
  ) THEN
    RAISE EXCEPTION 'O condutor já tem outro turno neste horário (%)', to_char(NEW.shift_date, 'DD/MM/YYYY')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_duty_shift() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_duty_shift BEFORE INSERT OR UPDATE ON public.duty_shifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_duty_shift();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['duty_units', 'duty_shifts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format($p$CREATE POLICY "read %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()))$p$, t);
    EXECUTE format($p$CREATE POLICY "insert %1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (organization_id = public.current_org_id() AND public.can_write())$p$, t);
    EXECUTE format($p$CREATE POLICY "update %1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (organization_id = public.current_org_id() AND public.can_write())
      WITH CHECK (organization_id = public.current_org_id() AND public.can_write())$p$, t);
    EXECUTE format($p$CREATE POLICY "delete %1$s" ON public.%1$I FOR DELETE TO authenticated
      USING (organization_id = public.current_org_id() AND public.can_write())$p$, t);
  END LOOP;
END $$;
