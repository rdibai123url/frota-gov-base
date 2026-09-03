CREATE OR REPLACE FUNCTION public.fuel_limit_breach(_org uuid, _vehicle uuid, _unit uuid, _qty numeric, _at timestamp with time zone)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  day_start timestamptz := date_trunc('day', _at);
  day_end timestamptz := date_trunc('day', _at) + interval '1 day';
  month_start timestamptz := date_trunc('month', _at);
  month_end timestamptz := date_trunc('month', _at) + interval '1 month';
  used_day numeric; used_month numeric;
BEGIN
  FOR r IN
    SELECT * FROM public.fuel_limits
    WHERE organization_id = _org AND active
      AND ((scope = 'organizacao')
        OR (scope = 'unidade' AND unit_id IS NOT DISTINCT FROM _unit)
        OR (scope = 'veiculo' AND vehicle_id = _vehicle))
  LOOP
    SELECT COALESCE(SUM(f.quantity), 0) INTO used_day
      FROM public.fuelings f
     WHERE f.organization_id = _org AND f.status = 'valido'
       AND f.fueled_at >= day_start AND f.fueled_at < day_end
       AND (r.scope = 'organizacao'
         OR (r.scope = 'unidade' AND f.unit_id IS NOT DISTINCT FROM _unit)
         OR (r.scope = 'veiculo' AND f.vehicle_id = _vehicle));
    SELECT COALESCE(SUM(f.quantity), 0) INTO used_month
      FROM public.fuelings f
     WHERE f.organization_id = _org AND f.status = 'valido'
       AND f.fueled_at >= month_start AND f.fueled_at < month_end
       AND (r.scope = 'organizacao'
         OR (r.scope = 'unidade' AND f.unit_id IS NOT DISTINCT FROM _unit)
         OR (r.scope = 'veiculo' AND f.vehicle_id = _vehicle));
    IF r.daily_quantity IS NOT NULL AND used_day + _qty > r.daily_quantity THEN
      RETURN 'Limite diário de ' || r.daily_quantity || ' excedido (' || r.scope || '). Consumo do dia: ' || used_day || '.';
    END IF;
    IF r.monthly_quantity IS NOT NULL AND used_month + _qty > r.monthly_quantity THEN
      RETURN 'Limite mensal de ' || r.monthly_quantity || ' excedido (' || r.scope || '). Consumo do mês: ' || used_month || '.';
    END IF;
  END LOOP;
  RETURN NULL;
END; $function$;

REVOKE ALL ON FUNCTION public.fuel_limit_breach(uuid, uuid, uuid, numeric, timestamp with time zone) FROM PUBLIC, anon, authenticated;