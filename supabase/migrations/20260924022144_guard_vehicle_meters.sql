-- ============================================================
-- FrotaGov
-- Proteção de hodômetro e horímetro dos ativos
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Prepara e valida uma correção de medidor.
--    O valor anterior passa a ser sempre obtido do próprio veículo,
--    evitando que o usuário informe manualmente um histórico incorreto.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_meter_correction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vehicle public.vehicles%ROWTYPE;
BEGIN
  SELECT *
    INTO v_vehicle
    FROM public.vehicles
   WHERE id = NEW.vehicle_id
     AND organization_id = NEW.organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ativo não encontrado no órgão informado.';
  END IF;

  IF NEW.new_value IS NULL OR NEW.new_value < 0 THEN
    RAISE EXCEPTION 'O novo valor do medidor deve ser maior ou igual a zero.';
  END IF;

  IF NEW.reason IS NULL OR length(btrim(NEW.reason)) < 5 THEN
    RAISE EXCEPTION 'Informe uma justificativa válida para a correção do medidor.';
  END IF;

  IF NEW.meter = 'hodometro' THEN
    NEW.previous_value := v_vehicle.current_km;

    IF NEW.new_value IS NOT DISTINCT FROM v_vehicle.current_km THEN
      RAISE EXCEPTION 'O novo valor do hodômetro deve ser diferente do valor atual.';
    END IF;

  ELSIF NEW.meter = 'horimetro' THEN
    NEW.previous_value := v_vehicle.hour_meter;

    IF NEW.new_value IS NOT DISTINCT FROM v_vehicle.hour_meter THEN
      RAISE EXCEPTION 'O novo valor do horímetro deve ser diferente do valor atual.';
    END IF;

  ELSE
    RAISE EXCEPTION 'Tipo de medidor inválido.';
  END IF;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_prepare_meter_correction
ON public.meter_corrections;

CREATE TRIGGER trg_prepare_meter_correction
BEFORE INSERT ON public.meter_corrections
FOR EACH ROW
EXECUTE FUNCTION public.prepare_meter_correction();


-- ----------------------------------------------------------------
-- 2. Aplica a correção registrada ao veículo.
--    Este é o caminho oficial para reduzir/trocar um medidor.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_meter_correction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.meter = 'hodometro' THEN

    UPDATE public.vehicles
       SET current_km = NEW.new_value,
           updated_at = now(),
           updated_by = COALESCE(NEW.created_by, auth.uid())
     WHERE id = NEW.vehicle_id
       AND organization_id = NEW.organization_id;

  ELSIF NEW.meter = 'horimetro' THEN

    UPDATE public.vehicles
       SET hour_meter = NEW.new_value,
           updated_at = now(),
           updated_by = COALESCE(NEW.created_by, auth.uid())
     WHERE id = NEW.vehicle_id
       AND organization_id = NEW.organization_id;

  END IF;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_apply_meter_correction
ON public.meter_corrections;

CREATE TRIGGER trg_apply_meter_correction
AFTER INSERT ON public.meter_corrections
FOR EACH ROW
EXECUTE FUNCTION public.apply_meter_correction();


-- ----------------------------------------------------------------
-- 3. Bloqueia regressões feitas diretamente na tabela vehicles.
--    Uma redução só é aceita quando existe uma correção de medidor
--    recém-registrada para aquele ativo e para aquele valor.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_vehicle_meter_regression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_correction boolean;
BEGIN

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


  -- Não aceita valores negativos em nenhuma hipótese
  IF NEW.current_km IS NOT NULL AND NEW.current_km < 0 THEN
    RAISE EXCEPTION 'A quilometragem não pode ser negativa.';
  END IF;

  IF NEW.hour_meter IS NOT NULL AND NEW.hour_meter < 0 THEN
    RAISE EXCEPTION 'O horímetro não pode ser negativo.';
  END IF;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_guard_vehicle_meter_regression
ON public.vehicles;

CREATE TRIGGER trg_guard_vehicle_meter_regression
BEFORE UPDATE OF current_km, hour_meter
ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.guard_vehicle_meter_regression();