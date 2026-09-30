-- Achados do teste de 29/09/2026:
--  1) o mesmo condutor podia ser designado a dois veículos no mesmo horário;
--  2) empenho aceitava valor anulado maior que o empenhado (saldo negativo).
-- As restrições de empenho usam NOT VALID: valem para novas gravações e edições,
-- sem falhar por causa de linhas antigas que ainda precisem de correção manual.

CREATE OR REPLACE FUNCTION public.guard_usage_driver_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ini timestamptz; fim timestamptz; c int;
BEGIN
  IF NEW.driver_id IS NULL OR NEW.status NOT IN ('solicitada','autorizada','em_uso') THEN
    RETURN NEW;
  END IF;

  ini := COALESCE(NEW.actual_departure, NEW.planned_departure);
  fim := COALESCE(NEW.actual_return, NEW.planned_return, ini + interval '1 hour');

  SELECT count(*) INTO c FROM public.vehicle_usages u
   WHERE u.organization_id = NEW.organization_id
     AND u.driver_id = NEW.driver_id
     AND u.id <> NEW.id
     AND u.status IN ('solicitada','autorizada','em_uso')
     AND tstzrange(COALESCE(u.actual_departure, u.planned_departure),
                   GREATEST(COALESCE(u.actual_return, u.planned_return,
                            COALESCE(u.actual_departure, u.planned_departure) + interval '1 hour'),
                            COALESCE(u.actual_departure, u.planned_departure) + interval '1 minute'), '[)')
         && tstzrange(ini, GREATEST(fim, ini + interval '1 minute'), '[)');

  IF c > 0 THEN
    RAISE EXCEPTION 'O condutor já possui reserva ou utilização de outro veículo no período informado';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_usage_driver_overlap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_usages_zz_driver_overlap ON public.vehicle_usages;
CREATE TRIGGER trg_usages_zz_driver_overlap BEFORE INSERT OR UPDATE ON public.vehicle_usages
FOR EACH ROW EXECUTE FUNCTION public.guard_usage_driver_overlap();

ALTER TABLE public.commitments
  ADD CONSTRAINT commitments_cancelled_within_committed
  CHECK (cancelled_value >= 0 AND cancelled_value <= committed_value) NOT VALID;

ALTER TABLE public.commitments
  ADD CONSTRAINT commitments_exercise_range
  CHECK (exercise BETWEEN 2000 AND 2100) NOT VALID;
