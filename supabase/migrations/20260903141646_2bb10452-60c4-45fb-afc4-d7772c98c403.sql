CREATE OR REPLACE FUNCTION public.guard_fuel_authorization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v record; d record; breach text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'cancelada' THEN
    RAISE EXCEPTION 'Autorização cancelada não pode ser alterada';
  END IF;

  IF NEW.code IS NULL THEN
    NEW.code := public.next_org_code(NEW.organization_id, 'fuel_auth', 'AUT');
  END IF;
  IF NEW.security_code IS NULL THEN
    NEW.security_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT (NEW.max_quantity > 0) THEN
      RAISE EXCEPTION 'A quantidade máxima autorizada deve ser maior que zero';
    END IF;
    IF NEW.valid_until <= NEW.valid_from THEN
      RAISE EXCEPTION 'A validade final deve ser posterior à validade inicial';
    END IF;

    SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id AND organization_id = NEW.organization_id;
    IF v IS NULL THEN RAISE EXCEPTION 'Veículo inválido para este órgão'; END IF;
    IF NEW.unit_id IS NULL THEN NEW.unit_id := v.unit_id; END IF;
    IF v.status IN ('inativo','baixado') THEN
      RAISE EXCEPTION 'Veículo % está % e não pode ser autorizado', v.plate, v.status;
    END IF;
    IF v.status = 'manutencao' THEN
      IF COALESCE(btrim(NEW.justification), '') = '' THEN
        RAISE EXCEPTION 'Veículo em manutenção exige justificativa para autorização';
      END IF;
      IF NOT public.can_manage_fleet() THEN
        RAISE EXCEPTION 'Somente gestor de frota ou administrador pode autorizar veículo em manutenção';
      END IF;
    END IF;

    IF NEW.driver_id IS NOT NULL THEN
      SELECT * INTO d FROM public.drivers WHERE id = NEW.driver_id AND organization_id = NEW.organization_id;
      IF d IS NULL THEN RAISE EXCEPTION 'Condutor inválido para este órgão'; END IF;
      IF NOT d.active THEN RAISE EXCEPTION 'Condutor inativo não pode ser autorizado'; END IF;
      IF d.license_expiry IS NOT NULL AND d.license_expiry < current_date THEN
        RAISE EXCEPTION 'Condutor % está com a CNH vencida', d.full_name;
      END IF;
    END IF;

    breach := public.fuel_limit_breach(NEW.organization_id, NEW.vehicle_id, NEW.unit_id, NEW.max_quantity, NEW.valid_from);
    IF breach IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.fuel_limits fl
        WHERE fl.organization_id = NEW.organization_id AND fl.active AND fl.allow_exception
          AND ((fl.scope = 'organizacao')
            OR (fl.scope = 'unidade' AND fl.unit_id IS NOT DISTINCT FROM NEW.unit_id)
            OR (fl.scope = 'veiculo' AND fl.vehicle_id = NEW.vehicle_id))
      ) THEN
        RAISE EXCEPTION 'Limite de combustível excedido e exceção não permitida: %', breach;
      END IF;
      IF COALESCE(btrim(NEW.limit_exception_reason), '') = '' THEN
        RAISE EXCEPTION 'Exceção de limite exige justificativa: %', breach;
      END IF;
    END IF;
  END IF;

  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.guard_fuel_authorization() FROM PUBLIC, anon, authenticated;