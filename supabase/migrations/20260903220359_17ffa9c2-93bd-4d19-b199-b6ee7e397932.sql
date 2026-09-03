
-- ============ 1) TIPOS DE OBJETO DO CONTRATO ============
CREATE TABLE IF NOT EXISTS public.contract_object_kinds (
  code text PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contract_object_kinds TO authenticated;
GRANT SELECT ON public.contract_object_kinds TO anon;
GRANT ALL ON public.contract_object_kinds TO service_role;
ALTER TABLE public.contract_object_kinds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read contract object kinds" ON public.contract_object_kinds FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.contract_object_kinds (code, label, sort_order) VALUES
  ('seguros', 'Seguros', 10),
  ('combustivel_oleos', 'Combustível e óleos', 20),
  ('manutencao', 'Manutenção preventiva e corretiva', 30),
  ('pneus', 'Pneus', 40),
  ('pecas', 'Peças automotivas', 50),
  ('higienizacao', 'Higienização', 60)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS object_kind text,
  ADD COLUMN IF NOT EXISTS value_from_items boolean NOT NULL DEFAULT false;
UPDATE public.contracts SET object_kind = 'combustivel_oleos' WHERE object_kind IS NULL;
ALTER TABLE public.contracts
  ALTER COLUMN object_kind SET DEFAULT 'combustivel_oleos',
  ALTER COLUMN object_kind SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_object_kind_fkey FOREIGN KEY (object_kind)
    REFERENCES public.contract_object_kinds(code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS contracts_object_kind_idx ON public.contracts(organization_id, object_kind);

-- ============ 2) ITENS DO CONTRATO ============
ALTER TABLE public.contract_items
  ADD COLUMN IF NOT EXISTS item_number integer,
  ADD COLUMN IF NOT EXISTS origin_amendment_id uuid REFERENCES public.contract_amendments(id);

WITH n AS (
  SELECT id, row_number() OVER (PARTITION BY contract_id ORDER BY created_at, id) rn
  FROM public.contract_items
)
UPDATE public.contract_items ci SET item_number = n.rn FROM n WHERE n.id = ci.id AND ci.item_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contract_items_number_uidx
  ON public.contract_items(contract_id, item_number);

CREATE OR REPLACE FUNCTION public.contract_item_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.item_number IS NULL THEN
    SELECT COALESCE(MAX(item_number), 0) + 1 INTO NEW.item_number
      FROM public.contract_items WHERE contract_id = NEW.contract_id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_contract_item_number ON public.contract_items;
CREATE TRIGGER trg_contract_item_number BEFORE INSERT ON public.contract_items
FOR EACH ROW EXECUTE FUNCTION public.contract_item_number();

CREATE OR REPLACE FUNCTION public.guard_contract_item_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(OLD.reserved_quantity,0) > 0 OR COALESCE(OLD.consumed_quantity,0) > 0
     OR COALESCE(OLD.reserved_value,0) > 0 OR COALESCE(OLD.consumed_value,0) > 0 THEN
    RAISE EXCEPTION 'Item com movimentação não pode ser excluído. Inative o item.';
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS trg_contract_item_delete ON public.contract_items;
CREATE TRIGGER trg_contract_item_delete BEFORE DELETE ON public.contract_items
FOR EACH ROW EXECUTE FUNCTION public.guard_contract_item_delete();

CREATE OR REPLACE FUNCTION public.sync_contract_value_from_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _contract uuid; _total numeric;
BEGIN
  _contract := COALESCE(NEW.contract_id, OLD.contract_id);
  SELECT COALESCE(SUM(quantity * unit_price), 0) INTO _total
    FROM public.contract_items WHERE contract_id = _contract AND active;
  UPDATE public.contracts SET current_value = _total, updated_at = now()
   WHERE id = _contract AND value_from_items;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_contract_items_sync_value ON public.contract_items;
CREATE TRIGGER trg_contract_items_sync_value AFTER INSERT OR UPDATE OR DELETE ON public.contract_items
FOR EACH ROW EXECUTE FUNCTION public.sync_contract_value_from_items();

-- ============ 3) VEÍCULO PARTICULAR DE SERVIDOR COM COTA ============
DO $$ BEGIN CREATE TYPE public.server_quota_period AS ENUM ('semanal','mensal'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.server_quota_status AS ENUM ('ativa','inativa','suspensa'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS is_private_server_vehicle boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.server_fuel_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  beneficiary_name text NOT NULL,
  beneficiary_cpf text NOT NULL,
  registration_code text,
  job_title text,
  period public.server_quota_period NOT NULL DEFAULT 'mensal',
  quota_quantity numeric(14,3) NOT NULL DEFAULT 0,
  quota_value numeric(14,2),
  fuel_type_id uuid REFERENCES public.fuel_types(id),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  status public.server_quota_status NOT NULL DEFAULT 'ativa',
  justification text,
  attachment_path text,
  alert_threshold_percent numeric(5,2) NOT NULL DEFAULT 80,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  import_batch_id uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_fuel_quotas TO authenticated;
GRANT ALL ON public.server_fuel_quotas TO service_role;
ALTER TABLE public.server_fuel_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read server quotas in org" ON public.server_fuel_quotas FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "insert server quotas in org" ON public.server_fuel_quotas FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE POLICY "update server quotas in org" ON public.server_fuel_quotas FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_fleet())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE INDEX IF NOT EXISTS server_fuel_quotas_vehicle_idx ON public.server_fuel_quotas(organization_id, vehicle_id, status);

CREATE OR REPLACE FUNCTION public.touch_server_fuel_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id AND organization_id = NEW.organization_id;
  IF v IS NULL THEN RAISE EXCEPTION 'Veículo inválido para este órgão'; END IF;
  IF NEW.unit_id IS NULL THEN NEW.unit_id := v.unit_id; END IF;
  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.units u WHERE u.id = NEW.unit_id AND u.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Unidade inválida para este órgão';
  END IF;
  IF NEW.fuel_type_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fuel_types f WHERE f.id = NEW.fuel_type_id AND f.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Combustível inválido para este órgão';
  END IF;
  IF NEW.end_date IS NOT NULL AND NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'A data final da cota deve ser posterior à data de início';
  END IF;
  IF NOT (NEW.quota_quantity > 0 OR COALESCE(NEW.quota_value,0) > 0) THEN
    RAISE EXCEPTION 'Informe a quantidade (ou o valor) da cota';
  END IF;
  NEW.beneficiary_cpf := regexp_replace(COALESCE(NEW.beneficiary_cpf,''), '\D', '', 'g');
  IF length(NEW.beneficiary_cpf) <> 11 THEN RAISE EXCEPTION 'CPF do servidor inválido'; END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_server_fuel_quotas_touch ON public.server_fuel_quotas;
CREATE TRIGGER trg_server_fuel_quotas_touch BEFORE INSERT OR UPDATE ON public.server_fuel_quotas
FOR EACH ROW EXECUTE FUNCTION public.touch_server_fuel_quota();

-- ciclo da cota
CREATE OR REPLACE FUNCTION public.server_quota_cycle(_period public.server_quota_period, _at timestamptz)
RETURNS TABLE(cycle_start timestamptz, cycle_end timestamptz)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _period = 'semanal' THEN date_trunc('week', _at) ELSE date_trunc('month', _at) END,
         CASE WHEN _period = 'semanal' THEN date_trunc('week', _at) + interval '7 days'
              ELSE date_trunc('month', _at) + interval '1 month' END;
$$;

-- consumo + reserva aberta no ciclo
CREATE OR REPLACE FUNCTION public.server_quota_usage(_quota uuid, _at timestamptz, _ignore_auth uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q record; c record; used numeric := 0; held numeric := 0;
BEGIN
  SELECT * INTO q FROM public.server_fuel_quotas WHERE id = _quota;
  IF q IS NULL THEN RETURN 0; END IF;
  SELECT * INTO c FROM public.server_quota_cycle(q.period, _at);
  SELECT COALESCE(SUM(f.quantity), 0) INTO used FROM public.fuelings f
   WHERE f.vehicle_id = q.vehicle_id AND f.organization_id = q.organization_id
     AND f.status = 'valido' AND f.fueled_at >= c.cycle_start AND f.fueled_at < c.cycle_end;
  SELECT COALESCE(SUM(GREATEST(a.max_quantity - a.consumed_quantity, 0)), 0) INTO held
    FROM public.fuel_authorizations a
   WHERE a.vehicle_id = q.vehicle_id AND a.organization_id = q.organization_id
     AND a.status = 'autorizada'
     AND a.valid_from >= c.cycle_start AND a.valid_from < c.cycle_end
     AND (_ignore_auth IS NULL OR a.id <> _ignore_auth);
  RETURN used + held;
END; $$;

CREATE OR REPLACE FUNCTION public.active_server_quota(_vehicle uuid, _at timestamptz)
RETURNS public.server_fuel_quotas LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.server_fuel_quotas
   WHERE vehicle_id = _vehicle
     AND start_date <= _at::date
     AND (end_date IS NULL OR end_date >= _at::date)
   ORDER BY (status = 'ativa') DESC, start_date DESC
   LIMIT 1;
$$;

ALTER TABLE public.fuel_authorizations
  ADD COLUMN IF NOT EXISTS server_quota_id uuid REFERENCES public.server_fuel_quotas(id),
  ADD COLUMN IF NOT EXISTS server_quota_override_reason text;
ALTER TABLE public.fuelings
  ADD COLUMN IF NOT EXISTS server_quota_id uuid REFERENCES public.server_fuel_quotas(id);

-- validação na autorização
CREATE OR REPLACE FUNCTION public.guard_server_quota_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; q public.server_fuel_quotas; usage numeric;
BEGIN
  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id AND organization_id = NEW.organization_id;
  IF v IS NULL OR NOT v.is_private_server_vehicle THEN RETURN NEW; END IF;

  q := public.active_server_quota(NEW.vehicle_id, NEW.valid_from);
  IF q.id IS NULL THEN
    RAISE EXCEPTION 'Veículo particular de servidor sem cota de combustível vigente na data da autorização';
  END IF;
  IF q.status <> 'ativa' THEN
    RAISE EXCEPTION 'A cota de combustível do servidor está % e não permite nova autorização', q.status;
  END IF;
  IF q.fuel_type_id IS NOT NULL AND NEW.fuel_type_id IS DISTINCT FROM q.fuel_type_id THEN
    RAISE EXCEPTION 'Combustível diferente do autorizado na cota do servidor';
  END IF;

  NEW.server_quota_id := q.id;
  usage := public.server_quota_usage(q.id, NEW.valid_from, NEW.id);
  IF usage + NEW.max_quantity > q.quota_quantity + 0.001 THEN
    IF COALESCE(btrim(NEW.server_quota_override_reason), '') = '' OR NOT public.can_manage_fleet() THEN
      RAISE EXCEPTION 'Cota do servidor esgotada no ciclo (cota %, utilizada/reservada %). Liberação exige justificativa de gestor de frota.',
        q.quota_quantity, usage;
    END IF;
    PERFORM public.log_event('cota_servidor_excecao', 'abastecimento', 'Autorização de abastecimento', '/autorizacoes',
      'fuel_authorizations', NEW.id, 'override',
      'Liberação acima da cota do servidor ' || q.beneficiary_name || ' — ' || NEW.server_quota_override_reason,
      NULL, NULL);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_server_quota_auth ON public.fuel_authorizations;
CREATE TRIGGER trg_server_quota_auth BEFORE INSERT ON public.fuel_authorizations
FOR EACH ROW EXECUTE FUNCTION public.guard_server_quota_authorization();

-- validação e alertas no abastecimento
CREATE OR REPLACE FUNCTION public.guard_server_quota_fueling()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; q public.server_fuel_quotas; usage numeric;
BEGIN
  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id AND organization_id = NEW.organization_id;
  IF v IS NULL OR NOT v.is_private_server_vehicle THEN RETURN NEW; END IF;

  q := public.active_server_quota(NEW.vehicle_id, NEW.fueled_at);
  IF q.id IS NULL THEN
    RAISE EXCEPTION 'Veículo particular de servidor sem cota de combustível vigente na data do abastecimento';
  END IF;
  NEW.server_quota_id := q.id;
  IF NEW.authorization_id IS NOT NULL OR NEW.import_batch_id IS NOT NULL OR NEW.legacy_source IS NOT NULL THEN
    RETURN NEW; -- a cota já foi verificada e reservada na autorização
  END IF;
  IF q.status <> 'ativa' THEN
    RAISE EXCEPTION 'A cota de combustível do servidor está % e não permite abastecimento', q.status;
  END IF;
  usage := public.server_quota_usage(q.id, NEW.fueled_at);
  IF usage + NEW.quantity > q.quota_quantity + 0.001 THEN
    RAISE EXCEPTION 'Cota do servidor esgotada no ciclo (cota %, utilizada %).', q.quota_quantity, usage;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_server_quota_fueling ON public.fuelings;
CREATE TRIGGER trg_server_quota_fueling BEFORE INSERT ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.guard_server_quota_fueling();

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
    INSERT INTO public.fueling_alerts (organization_id, fueling_id, vehicle_id, alert_type, severity, message, category)
    VALUES (NEW.organization_id, NEW.id, NEW.vehicle_id, 'cota_servidor_esgotada', 'critico',
      'Cota do servidor ' || q.beneficiary_name || ' esgotada no ciclo (' || q.quota_quantity || ').', 'abastecimento');
  ELSIF pct >= q.alert_threshold_percent THEN
    INSERT INTO public.fueling_alerts (organization_id, fueling_id, vehicle_id, alert_type, severity, message, category)
    VALUES (NEW.organization_id, NEW.id, NEW.vehicle_id, 'cota_servidor_proxima_limite', 'alerta',
      'Cota do servidor ' || q.beneficiary_name || ' atingiu ' || round(pct, 1) || '% do ciclo.', 'abastecimento');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_server_quota_alert ON public.fuelings;
CREATE TRIGGER trg_server_quota_alert AFTER INSERT ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.alert_server_quota_fueling();
