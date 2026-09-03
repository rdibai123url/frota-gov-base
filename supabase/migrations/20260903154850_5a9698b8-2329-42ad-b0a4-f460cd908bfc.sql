CREATE OR REPLACE FUNCTION public.apply_service_order_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('veiculo_recebido','em_execucao','aguardando_peca') THEN
    UPDATE public.vehicles SET status = 'manutencao', updated_at = now()
     WHERE id = NEW.vehicle_id AND status = 'ativo';
  ELSIF NEW.status IN ('concluida','cancelada') THEN
    UPDATE public.vehicles SET status = 'ativo', updated_at = now()
     WHERE id = NEW.vehicle_id AND status = 'manutencao'
       AND NOT EXISTS (SELECT 1 FROM public.service_orders s
                        WHERE s.vehicle_id = NEW.vehicle_id AND s.id <> NEW.id
                          AND s.status IN ('veiculo_recebido','em_execucao','aguardando_peca'))
       AND NOT EXISTS (SELECT 1 FROM public.maintenance_requests r
                        WHERE r.vehicle_id = NEW.vehicle_id AND r.status = 'em_manutencao');
  END IF;

  IF NEW.status = 'concluida' AND (TG_OP = 'INSERT' OR OLD.status <> 'concluida') THEN
    IF NEW.odometer_km IS NOT NULL THEN
      UPDATE public.vehicles
         SET current_km = GREATEST(COALESCE(current_km, 0), NEW.odometer_km), updated_at = now()
       WHERE id = NEW.vehicle_id;
    END IF;
    IF NEW.hour_meter IS NOT NULL THEN
      UPDATE public.vehicles
         SET hour_meter = GREATEST(COALESCE(hour_meter, 0), NEW.hour_meter), updated_at = now()
       WHERE id = NEW.vehicle_id;
    END IF;
  END IF;

  RETURN NEW;
END; $function$;