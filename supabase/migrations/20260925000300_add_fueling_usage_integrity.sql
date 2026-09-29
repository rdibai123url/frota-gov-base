-- FrotaGov: revisão de consolidação. Aplicação remota exige autorização.
BEGIN;

ALTER TABLE public.vehicle_usages ADD CONSTRAINT vehicle_usages_id_org_vehicle_key UNIQUE (id, organization_id, vehicle_id);
ALTER TABLE public.fuelings
  ADD COLUMN usage_id uuid,
  ADD COLUMN full_tank boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT fuelings_usage_org_vehicle_fkey FOREIGN KEY (usage_id, organization_id, vehicle_id)
    REFERENCES public.vehicle_usages(id, organization_id, vehicle_id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX idx_fuelings_usage ON public.fuelings (organization_id, usage_id) WHERE usage_id IS NOT NULL;

CREATE FUNCTION public.guard_fueling_usage_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE u public.vehicle_usages%ROWTYPE; start_at timestamptz; end_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Não é permitido transferir abastecimento entre órgãos';
  END IF;
  IF NEW.usage_id IS NULL THEN RETURN NEW; END IF;
  -- FOR SHARE serializa contra alteração das datas da viagem, sem interferir nos triggers financeiros.
  SELECT * INTO u FROM public.vehicle_usages WHERE id = NEW.usage_id
    AND organization_id = NEW.organization_id AND vehicle_id = NEW.vehicle_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilização inválida para órgão e veículo'; END IF;
  start_at := COALESCE(u.actual_departure, u.planned_departure);
  end_at := COALESCE(u.actual_return, u.planned_return);
  IF start_at IS NULL OR NEW.fueled_at IS NULL OR NEW.fueled_at < start_at - interval '12 hours'
    OR NEW.fueled_at > COALESCE(end_at, now()) + interval '12 hours' THEN
    RAISE EXCEPTION 'Abastecimento fora do período da utilização';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_fueling_usage_link() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_zz_fueling_usage_link BEFORE INSERT OR UPDATE ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.guard_fueling_usage_link();

CREATE FUNCTION public.guard_usage_linked_fuelings()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Não é permitido transferir utilização entre órgãos';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fuelings f WHERE f.usage_id = NEW.id AND
    (COALESCE(NEW.actual_departure, NEW.planned_departure) IS NULL OR
     f.fueled_at < COALESCE(NEW.actual_departure, NEW.planned_departure) - interval '12 hours' OR
     f.fueled_at > COALESCE(NEW.actual_return, NEW.planned_return, now()) + interval '12 hours')) THEN
    RAISE EXCEPTION 'Alteração da viagem invalidaria abastecimentos vinculados';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_usage_linked_fuelings() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_zz_usage_linked_fuelings BEFORE UPDATE ON public.vehicle_usages
FOR EACH ROW EXECUTE FUNCTION public.guard_usage_linked_fuelings();

CREATE OR REPLACE FUNCTION public.guard_fueling_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'cancelado' THEN
    RAISE EXCEPTION 'Abastecimento cancelado não pode ser alterado';
  END IF;
  IF NEW.status = 'cancelado' THEN
    IF NEW.cancel_reason IS NULL OR length(btrim(NEW.cancel_reason)) < 5 THEN
      RAISE EXCEPTION 'Informe o motivo do cancelamento';
    END IF;
    IF NOT public.can_cancel_fueling() THEN
      RAISE EXCEPTION 'Sem permissão para cancelar abastecimentos';
    END IF;
    NEW.cancelled_at = now();
    NEW.cancelled_by = auth.uid();
    -- preserva os dados originais do lançamento
    NEW.vehicle_id = OLD.vehicle_id;
    NEW.usage_id = OLD.usage_id;
    NEW.full_tank = OLD.full_tank;
    NEW.quantity = OLD.quantity;
    NEW.unit_price = OLD.unit_price;
    NEW.odometer_km = OLD.odometer_km;
    NEW.hour_meter = OLD.hour_meter;
    NEW.fueled_at = OLD.fueled_at;
  END IF;
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END; $$;

COMMIT;
