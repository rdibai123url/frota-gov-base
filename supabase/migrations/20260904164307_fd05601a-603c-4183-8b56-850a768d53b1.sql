CREATE OR REPLACE FUNCTION public.validate_vehicle_plate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE p text;
BEGIN
  IF NEW.plate IS NULL OR btrim(NEW.plate) = '' THEN
    RETURN NEW;
  END IF;
  p := upper(regexp_replace(NEW.plate, '[^A-Za-z0-9]', '', 'g'));
  IF p !~ '^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$' THEN
    RAISE EXCEPTION 'Placa inválida: informe no padrão ABC1234 ou ABC1D23';
  END IF;
  NEW.plate := p;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_vehicle_plate ON public.vehicles;
CREATE TRIGGER trg_validate_vehicle_plate
BEFORE INSERT OR UPDATE OF plate ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_plate();