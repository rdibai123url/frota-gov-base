
CREATE OR REPLACE FUNCTION public.alert_server_quota_fueling()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.server_fuel_quotas; usage numeric; pct numeric;
BEGIN
  IF NEW.server_quota_id IS NULL OR NEW.status <> 'valido' THEN RETURN NEW; END IF;
  SELECT * INTO q FROM public.server_fuel_quotas WHERE id = NEW.server_quota_id;
  IF q.id IS NULL OR q.quota_quantity <= 0 THEN RETURN NEW; END IF;
  usage := public.server_quota_usage(q.id, NEW.fueled_at);
  pct := usage / q.quota_quantity * 100;
  IF pct >= 100 - 0.0001 THEN
    INSERT INTO public.fueling_alerts (organization_id, fueling_id, vehicle_id, alert_type, severity, message, category, status)
    VALUES (NEW.organization_id, NEW.id, NEW.vehicle_id, 'cota_servidor_esgotada', 'erro',
      'Cota do servidor ' || q.beneficiary_name || ' esgotada no ciclo (' || q.quota_quantity || ').', 'abastecimento', 'aberto');
  ELSIF pct >= q.alert_threshold_percent THEN
    INSERT INTO public.fueling_alerts (organization_id, fueling_id, vehicle_id, alert_type, severity, message, category, status)
    VALUES (NEW.organization_id, NEW.id, NEW.vehicle_id, 'cota_servidor_proxima_limite', 'alerta',
      'Cota do servidor ' || q.beneficiary_name || ' atingiu ' || round(pct, 1) || '% do ciclo.', 'abastecimento', 'aberto');
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.alert_server_quota_fueling() FROM anon, authenticated, public;
