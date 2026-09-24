CREATE OR REPLACE FUNCTION public.guard_vehicle_meter_regression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_correction boolean;
BEGIN

  -- Não permite apagar hodômetro já existente
  IF OLD.current_km IS NOT NULL
     AND NEW.current_km IS NULL THEN
    RAISE EXCEPTION
      'O hodômetro não pode ser apagado diretamente. Registre uma correção/troca de medidor.';
  END IF;

  -- Não permite apagar horímetro já existente
  IF OLD.hour_meter IS NOT NULL
     AND NEW.hour_meter IS NULL THEN
    RAISE EXCEPTION
      'O horímetro não pode ser apagado diretamente. Registre uma correção/troca de medidor.';
  END IF;

  -- Hodômetro
  IF OLD.current_km IS NOT NULL
     AND NEW.current_km IS NOT NULL
     AND NEW.current_km < OLD.current_km THEN

    SELECT EXISTS (
      SELECT 1
      FROM public.meter_corrections mc
      WHERE mc.vehicle_id = NEW.id
        AND mc.organization_id = NEW.organization_id
        AND mc.meter = 'hodometro'
        AND mc.previous_value IS NOT DISTINCT FROM OLD.current_km
        AND mc.new_value IS NOT DISTINCT FROM NEW.current_km
        AND mc.created_at >= now() - interval '1 minute'
    )
    INTO v_has_correction;

    IF NOT v_has_correction THEN
      RAISE EXCEPTION
        'O hodômetro não pode ser reduzido diretamente. Registre uma correção/troca de medidor.';
    END IF;
  END IF;

  -- Horímetro
  IF OLD.hour_meter IS NOT NULL
     AND NEW.hour_meter IS NOT NULL
     AND NEW.hour_meter < OLD.hour_meter THEN

    SELECT EXISTS (
      SELECT 1
      FROM public.meter_corrections mc
      WHERE mc.vehicle_id = NEW.id
        AND mc.organization_id = NEW.organization_id
        AND mc.meter = 'horimetro'
        AND mc.previous_value IS NOT DISTINCT FROM OLD.hour_meter
        AND mc.new_value IS NOT DISTINCT FROM NEW.hour_meter
        AND mc.created_at >= now() - interval '1 minute'
    )
    INTO v_has_correction;

    IF NOT v_has_correction THEN
      RAISE EXCEPTION
        'O horímetro não pode ser reduzido diretamente. Registre uma correção/troca de medidor.';
    END IF;
  END IF;

  -- Nunca permite valores negativos
  IF NEW.current_km IS NOT NULL AND NEW.current_km < 0 THEN
    RAISE EXCEPTION 'A quilometragem não pode ser negativa.';
  END IF;

  IF NEW.hour_meter IS NOT NULL AND NEW.hour_meter < 0 THEN
    RAISE EXCEPTION 'O horímetro não pode ser negativo.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.guard_vehicle_meter_regression()
FROM PUBLIC, anon, authenticated;