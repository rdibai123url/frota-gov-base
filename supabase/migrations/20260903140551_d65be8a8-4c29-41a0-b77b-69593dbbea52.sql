-- ============ ENUMS ============
CREATE TYPE public.driver_bond AS ENUM ('efetivo','comissionado','contratado','terceirizado','outro');
CREATE TYPE public.usage_status AS ENUM ('solicitada','autorizada','em_uso','concluida','cancelada');
CREATE TYPE public.fuel_auth_status AS ENUM ('pendente','autorizada','utilizada_parcial','utilizada','expirada','cancelada');
CREATE TYPE public.limit_scope AS ENUM ('organizacao','unidade','veiculo');

-- ============ CONTADORES DE CÓDIGO ============
CREATE TABLE public.org_counters (
  organization_id uuid NOT NULL,
  counter_key text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, counter_key)
);
GRANT ALL ON public.org_counters TO service_role;
ALTER TABLE public.org_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_org_code(_org uuid, _key text, _prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO public.org_counters (organization_id, counter_key, value)
  VALUES (_org, _key, 1)
  ON CONFLICT (organization_id, counter_key)
  DO UPDATE SET value = public.org_counters.value + 1
  RETURNING value INTO v;
  RETURN _prefix || '-' || to_char(now(), 'YYYY') || '-' || lpad(v::text, 5, '0');
END; $$;

-- ============ FUNÇÕES DE PERMISSÃO ============
CREATE OR REPLACE FUNCTION public.can_manage_fleet()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin','org_admin','fleet_manager'));
$$;

-- responsável de unidade só atua na própria unidade
CREATE OR REPLACE FUNCTION public.unit_scope_ok(_unit uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_fleet()
     OR (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'unit_manager')
         AND _unit IS NOT DISTINCT FROM public.my_unit_id());
$$;

CREATE OR REPLACE FUNCTION public.can_operate_usage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin','org_admin','fleet_manager','unit_manager','operator'));
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_fleet() TO authenticated;
GRANT EXECUTE ON FUNCTION public.unit_scope_ok(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_usage() TO authenticated;

-- ============ CONDUTORES ============
CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  user_id uuid,
  full_name text NOT NULL,
  cpf text,
  registration_number text,
  bond_type public.driver_bond NOT NULL DEFAULT 'efetivo',
  phone text,
  email text,
  license_number text,
  license_categories text[] NOT NULL DEFAULT '{}'::text[],
  license_expiry date,
  license_first_issue date,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX drivers_org_cpf_key ON public.drivers (organization_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX drivers_org_reg_key ON public.drivers (organization_id, registration_number) WHERE registration_number IS NOT NULL;
CREATE INDEX idx_drivers_org ON public.drivers (organization_id);
CREATE INDEX idx_drivers_unit ON public.drivers (unit_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read drivers in org" ON public.drivers FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert drivers in org" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write() AND public.unit_scope_ok(unit_id));
CREATE POLICY "update drivers in org" ON public.drivers FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_write() AND public.unit_scope_ok(unit_id))
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write() AND public.unit_scope_ok(unit_id));
CREATE POLICY "delete drivers in org" ON public.drivers FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users());

-- ============ UTILIZAÇÃO / RESERVA ============
CREATE TABLE public.vehicle_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  driver_id uuid REFERENCES public.drivers(id),
  requester_name text,
  requester_id uuid,
  authorizer_name text,
  authorizer_id uuid,
  planned_departure timestamptz NOT NULL,
  planned_return timestamptz,
  actual_departure timestamptz,
  actual_return timestamptz,
  origin text,
  destination text,
  purpose text,
  start_km numeric,
  end_km numeric,
  passengers text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  maintenance_justification text,
  status public.usage_status NOT NULL DEFAULT 'solicitada',
  cancel_reason text,
  vehicle_updated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_usages_org ON public.vehicle_usages (organization_id, planned_departure DESC);
CREATE INDEX idx_usages_vehicle ON public.vehicle_usages (vehicle_id, planned_departure);
CREATE INDEX idx_usages_driver ON public.vehicle_usages (driver_id);

GRANT SELECT, INSERT, UPDATE ON public.vehicle_usages TO authenticated;
GRANT ALL ON public.vehicle_usages TO service_role;
ALTER TABLE public.vehicle_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read usages in org" ON public.vehicle_usages FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert usages in org" ON public.vehicle_usages FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage() AND public.can_fuel_vehicle(vehicle_id));
CREATE POLICY "update usages in org" ON public.vehicle_usages FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_operate_usage() AND public.can_fuel_vehicle(vehicle_id))
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage() AND public.can_fuel_vehicle(vehicle_id));

-- ============ LIMITES DE COMBUSTÍVEL ============
CREATE TABLE public.fuel_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope public.limit_scope NOT NULL DEFAULT 'organizacao',
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  daily_quantity numeric,
  monthly_quantity numeric,
  daily_value numeric,
  monthly_value numeric,
  allow_exception boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_fuel_limits_org ON public.fuel_limits (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_limits TO authenticated;
GRANT ALL ON public.fuel_limits TO service_role;
ALTER TABLE public.fuel_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read fuel limits in org" ON public.fuel_limits FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert fuel limits in org" ON public.fuel_limits FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE POLICY "update fuel limits in org" ON public.fuel_limits FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_fleet())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_fleet());
CREATE POLICY "delete fuel limits in org" ON public.fuel_limits FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_fleet());

-- ============ AUTORIZAÇÕES DE ABASTECIMENTO ============
CREATE TABLE public.fuel_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  security_code text,
  qr_token uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  driver_id uuid REFERENCES public.drivers(id),
  fuel_type_id uuid REFERENCES public.fuel_types(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  max_quantity numeric NOT NULL,
  max_value numeric,
  max_unit_price numeric,
  odometer_km numeric,
  hour_meter numeric,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  purpose text,
  justification text,
  limit_exception_reason text,
  authorizer_id uuid,
  authorizer_name text,
  status public.fuel_auth_status NOT NULL DEFAULT 'autorizada',
  consumed_quantity numeric NOT NULL DEFAULT 0,
  consumed_value numeric NOT NULL DEFAULT 0,
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX fuel_auth_qr_token_key ON public.fuel_authorizations (qr_token);
CREATE INDEX idx_fuel_auth_org ON public.fuel_authorizations (organization_id, created_at DESC);
CREATE INDEX idx_fuel_auth_vehicle ON public.fuel_authorizations (vehicle_id);

GRANT SELECT, INSERT, UPDATE ON public.fuel_authorizations TO authenticated;
GRANT ALL ON public.fuel_authorizations TO service_role;
ALTER TABLE public.fuel_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read fuel auth in org" ON public.fuel_authorizations FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert fuel auth in org" ON public.fuel_authorizations FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write() AND public.can_fuel_vehicle(vehicle_id));
CREATE POLICY "update fuel auth in org" ON public.fuel_authorizations FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_write() AND public.can_fuel_vehicle(vehicle_id))
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write() AND public.can_fuel_vehicle(vehicle_id));

-- ============ VÍNCULOS NA FASE 2 ============
ALTER TABLE public.fuelings
  ADD COLUMN driver_id uuid REFERENCES public.drivers(id),
  ADD COLUMN authorization_id uuid REFERENCES public.fuel_authorizations(id),
  ADD COLUMN without_authorization_reason text;
CREATE INDEX idx_fuelings_authorization ON public.fuelings (authorization_id);

ALTER TABLE public.fueling_alerts
  ADD COLUMN driver_id uuid REFERENCES public.drivers(id),
  ADD COLUMN authorization_id uuid REFERENCES public.fuel_authorizations(id);

-- ============ LIMITES: AVALIAÇÃO ============
CREATE OR REPLACE FUNCTION public.fuel_limit_breach(_org uuid, _vehicle uuid, _unit uuid, _qty numeric, _at timestamptz)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  day_start timestamptz := date_trunc('day', _at);
  month_start timestamptz := date_trunc('month', _at);
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
     WHERE f.organization_id = _org AND f.status = 'valido' AND f.fueled_at >= day_start
       AND (r.scope = 'organizacao'
            OR (r.scope = 'unidade' AND f.unit_id IS NOT DISTINCT FROM _unit)
            OR (r.scope = 'veiculo' AND f.vehicle_id = _vehicle));
    SELECT COALESCE(SUM(f.quantity), 0) INTO used_month
      FROM public.fuelings f
     WHERE f.organization_id = _org AND f.status = 'valido' AND f.fueled_at >= month_start
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
END; $$;
GRANT EXECUTE ON FUNCTION public.fuel_limit_breach(uuid, uuid, uuid, numeric, timestamptz) TO authenticated;

-- ============ TRIGGER: UTILIZAÇÃO ============
CREATE OR REPLACE FUNCTION public.guard_vehicle_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; d record; c int; ini timestamptz; fim timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('cancelada','concluida') AND NEW.status = OLD.status
     AND (NEW.* IS DISTINCT FROM OLD.*) AND OLD.status = 'cancelada' THEN
    RAISE EXCEPTION 'Utilização cancelada não pode ser alterada';
  END IF;

  IF NEW.code IS NULL THEN
    NEW.code := public.next_org_code(NEW.organization_id, 'vehicle_usage', 'UTL');
  END IF;

  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id AND organization_id = NEW.organization_id;
  IF v IS NULL THEN RAISE EXCEPTION 'Veículo inválido para este órgão'; END IF;
  IF NEW.unit_id IS NULL THEN NEW.unit_id := v.unit_id; END IF;

  IF NEW.status <> 'cancelada' THEN
    IF v.status IN ('inativo','baixado') THEN
      RAISE EXCEPTION 'Veículo % está % e não pode ser utilizado', v.plate, v.status;
    END IF;
    IF v.status = 'manutencao' AND COALESCE(btrim(NEW.maintenance_justification), '') = '' THEN
      RAISE EXCEPTION 'Veículo em manutenção exige justificativa registrada para utilização';
    END IF;
  END IF;

  IF NEW.driver_id IS NOT NULL AND NEW.status <> 'cancelada' THEN
    SELECT * INTO d FROM public.drivers WHERE id = NEW.driver_id AND organization_id = NEW.organization_id;
    IF d IS NULL THEN RAISE EXCEPTION 'Condutor inválido para este órgão'; END IF;
    IF NOT d.active THEN RAISE EXCEPTION 'Condutor inativo não pode ser designado'; END IF;
    IF d.license_expiry IS NOT NULL AND d.license_expiry < current_date THEN
      RAISE EXCEPTION 'CNH do condutor está vencida (%).', d.license_expiry;
    END IF;
  END IF;

  IF NEW.end_km IS NOT NULL AND NEW.start_km IS NOT NULL AND NEW.end_km < NEW.start_km THEN
    RAISE EXCEPTION 'KM final não pode ser inferior ao KM inicial';
  END IF;
  IF NEW.status = 'concluida' AND NEW.actual_return IS NULL THEN
    NEW.actual_return := now();
  END IF;

  IF NEW.status IN ('solicitada','autorizada','em_uso') THEN
    ini := COALESCE(NEW.actual_departure, NEW.planned_departure);
    fim := COALESCE(NEW.actual_return, NEW.planned_return, ini + interval '1 hour');
    SELECT count(*) INTO c FROM public.vehicle_usages u
     WHERE u.vehicle_id = NEW.vehicle_id
       AND u.id <> NEW.id
       AND u.status IN ('solicitada','autorizada','em_uso')
       AND tstzrange(COALESCE(u.actual_departure, u.planned_departure),
                     GREATEST(COALESCE(u.actual_return, u.planned_return,
                              COALESCE(u.actual_departure, u.planned_departure) + interval '1 hour'),
                              COALESCE(u.actual_departure, u.planned_departure) + interval '1 minute'), '[)')
           && tstzrange(ini, GREATEST(fim, ini + interval '1 minute'), '[)');
    IF c > 0 THEN
      RAISE EXCEPTION 'Já existe reserva ou utilização deste veículo no período informado';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_usages_guard BEFORE INSERT OR UPDATE ON public.vehicle_usages
FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_usage();

CREATE OR REPLACE FUNCTION public.apply_usage_km()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'concluida' AND NEW.end_km IS NOT NULL THEN
    UPDATE public.vehicles
       SET current_km = NEW.end_km, updated_at = now()
     WHERE id = NEW.vehicle_id AND organization_id = NEW.organization_id
       AND COALESCE(current_km, 0) < NEW.end_km;
    IF FOUND THEN
      UPDATE public.vehicle_usages SET vehicle_updated = true WHERE id = NEW.id AND vehicle_updated = false;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_usages_km AFTER INSERT OR UPDATE OF status, end_km ON public.vehicle_usages
FOR EACH ROW EXECUTE FUNCTION public.apply_usage_km();

-- ============ TRIGGER: AUTORIZAÇÃO ============
CREATE OR REPLACE FUNCTION public.guard_fuel_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; d record; breach text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'cancelada' THEN
    RAISE EXCEPTION 'Autorização cancelada não pode ser alterada';
  END IF;

  IF NEW.code IS NULL THEN
    NEW.code := public.next_org_code(NEW.organization_id, 'fuel_auth', 'AUT');
  END IF;
  IF NEW.security_code IS NULL THEN
    NEW.security_code := upper(encode(gen_random_bytes(4), 'hex'));
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
        RAISE EXCEPTION 'CNH do condutor está vencida (%).', d.license_expiry;
      END IF;
    END IF;

    IF NEW.fuel_type_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fuel_types f WHERE f.id = NEW.fuel_type_id AND f.organization_id = NEW.organization_id
    ) THEN RAISE EXCEPTION 'Combustível inválido para este órgão'; END IF;

    breach := public.fuel_limit_breach(NEW.organization_id, NEW.vehicle_id, NEW.unit_id, NEW.max_quantity, now());
    IF breach IS NOT NULL THEN
      IF COALESCE(btrim(NEW.limit_exception_reason), '') = '' THEN
        RAISE EXCEPTION '%', breach || ' Informe justificativa de exceção.';
      END IF;
      IF NOT public.can_manage_fleet() THEN
        RAISE EXCEPTION 'Somente gestor de frota ou administrador pode autorizar exceção de limite';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelada' THEN
      IF COALESCE(btrim(NEW.cancel_reason), '') = '' THEN
        RAISE EXCEPTION 'Informe o motivo do cancelamento da autorização';
      END IF;
      NEW.cancelled_at := now();
      NEW.cancelled_by := auth.uid();
    END IF;
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_fuel_auth_guard BEFORE INSERT OR UPDATE ON public.fuel_authorizations
FOR EACH ROW EXECUTE FUNCTION public.guard_fuel_authorization();

-- ============ CONSUMO DA AUTORIZAÇÃO ============
CREATE OR REPLACE FUNCTION public.guard_fueling_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; breach text;
BEGIN
  IF NEW.authorization_id IS NOT NULL THEN
    SELECT * INTO a FROM public.fuel_authorizations
     WHERE id = NEW.authorization_id AND organization_id = NEW.organization_id FOR UPDATE;
    IF a IS NULL THEN RAISE EXCEPTION 'Autorização inválida para este órgão'; END IF;
    IF a.status IN ('cancelada','expirada','utilizada') THEN
      RAISE EXCEPTION 'Autorização % não está disponível para consumo (%).', a.code, a.status;
    END IF;
    IF NEW.fueled_at > a.valid_until THEN
      UPDATE public.fuel_authorizations SET status = 'expirada' WHERE id = a.id;
      RAISE EXCEPTION 'Autorização % expirada em %.', a.code, a.valid_until;
    END IF;
    IF NEW.fueled_at < a.valid_from THEN
      RAISE EXCEPTION 'Autorização % ainda não está válida.', a.code;
    END IF;
    IF a.vehicle_id <> NEW.vehicle_id THEN RAISE EXCEPTION 'Veículo diferente do autorizado'; END IF;
    IF a.fuel_type_id IS NOT NULL AND NEW.fuel_type_id IS DISTINCT FROM a.fuel_type_id THEN
      RAISE EXCEPTION 'Combustível diferente do autorizado';
    END IF;
    IF a.supplier_id IS NOT NULL AND NEW.supplier_id IS DISTINCT FROM a.supplier_id THEN
      RAISE EXCEPTION 'Fornecedor diferente do autorizado';
    END IF;
    IF NEW.quantity > (a.max_quantity - a.consumed_quantity) + 0.001 THEN
      RAISE EXCEPTION 'Quantidade acima do saldo autorizado (saldo: %).', a.max_quantity - a.consumed_quantity;
    END IF;
    IF a.max_unit_price IS NOT NULL AND NEW.unit_price > a.max_unit_price + 0.0001 THEN
      RAISE EXCEPTION 'Preço unitário acima do autorizado';
    END IF;
    IF a.max_value IS NOT NULL AND (a.consumed_value + NEW.quantity * NEW.unit_price) > a.max_value + 0.01 THEN
      RAISE EXCEPTION 'Valor acima do autorizado';
    END IF;
    IF NEW.driver_id IS NULL THEN NEW.driver_id := a.driver_id; END IF;
    IF NEW.unit_id IS NULL THEN NEW.unit_id := a.unit_id; END IF;
  ELSE
    IF NOT public.can_manage_fleet() THEN
      RAISE EXCEPTION 'Abastecimento sem autorização prévia exige perfil de gestor de frota ou administrador';
    END IF;
    IF COALESCE(btrim(NEW.without_authorization_reason), '') = '' THEN
      RAISE EXCEPTION 'Informe a justificativa para abastecimento sem autorização prévia';
    END IF;
    breach := public.fuel_limit_breach(NEW.organization_id, NEW.vehicle_id, NEW.unit_id, NEW.quantity, NEW.fueled_at);
    IF breach IS NOT NULL THEN
      RAISE EXCEPTION '%', breach;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_fuelings_authorization BEFORE INSERT ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.guard_fueling_authorization();

CREATE OR REPLACE FUNCTION public.sync_fuel_authorization_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; q numeric; val numeric; a record;
BEGIN
  target := COALESCE(NEW.authorization_id, OLD.authorization_id);
  IF target IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(quantity * unit_price), 0) INTO q, val
    FROM public.fuelings WHERE authorization_id = target AND status = 'valido';

  SELECT * INTO a FROM public.fuel_authorizations WHERE id = target;
  IF a IS NULL OR a.status = 'cancelada' THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.fuel_authorizations
     SET consumed_quantity = q,
         consumed_value = val,
         status = CASE
           WHEN q >= a.max_quantity - 0.001 THEN 'utilizada'::public.fuel_auth_status
           WHEN q > 0 THEN 'utilizada_parcial'::public.fuel_auth_status
           WHEN now() > a.valid_until THEN 'expirada'::public.fuel_auth_status
           ELSE 'autorizada'::public.fuel_auth_status
         END,
         updated_at = now()
   WHERE id = target;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_fuelings_sync_auth AFTER INSERT OR UPDATE OF status, quantity, unit_price ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.sync_fuel_authorization_usage();

-- expira autorizações vencidas (chamada pela aplicação)
CREATE OR REPLACE FUNCTION public.expire_fuel_authorizations()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.fuel_authorizations
     SET status = 'expirada', updated_at = now()
   WHERE organization_id = public.current_org_id()
     AND status IN ('pendente','autorizada','utilizada_parcial')
     AND valid_until < now();
$$;
GRANT EXECUTE ON FUNCTION public.expire_fuel_authorizations() TO authenticated;

-- ============ TIMESTAMPS ============
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_fuel_limits_updated BEFORE UPDATE ON public.fuel_limits
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ AUDITORIA AMPLIADA ============
CREATE TRIGGER trg_audit_drivers AFTER INSERT OR UPDATE OR DELETE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_usages AFTER INSERT OR UPDATE ON public.vehicle_usages
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_fuel_auth AFTER INSERT OR UPDATE ON public.fuel_authorizations
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_fuel_limits AFTER INSERT OR UPDATE OR DELETE ON public.fuel_limits
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_organizations AFTER INSERT OR UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_units AFTER INSERT OR UPDATE OR DELETE ON public.units
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_vehicles AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_profiles AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();