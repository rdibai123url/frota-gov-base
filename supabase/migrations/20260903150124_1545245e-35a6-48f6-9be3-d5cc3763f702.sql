-- ============ ENUMS ============
CREATE TYPE public.maintenance_kind AS ENUM ('preventiva','corretiva');
CREATE TYPE public.maintenance_priority AS ENUM ('baixa','normal','alta','urgente');
CREATE TYPE public.maintenance_request_status AS ENUM ('aberta','em_analise','aprovada','em_manutencao','concluida','cancelada');
CREATE TYPE public.maintenance_record_status AS ENUM ('em_execucao','concluida','cancelada');
CREATE TYPE public.tire_status AS ENUM ('estoque','instalado','em_reparo','recapagem','descartado','baixado');
CREATE TYPE public.tire_movement_kind AS ENUM ('entrada','instalacao','retirada','reparo','recapagem','descarte','baixa');

-- ============ PERMISSÃO ============
CREATE OR REPLACE FUNCTION public.can_manage_maintenance()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin','org_admin','fleet_manager'));
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_maintenance() TO authenticated;

-- ============ PARÂMETROS ============
CREATE TABLE public.maintenance_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_km numeric NOT NULL DEFAULT 500,
  lead_hours numeric NOT NULL DEFAULT 20,
  lead_days integer NOT NULL DEFAULT 15,
  warranty_lead_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.maintenance_settings TO authenticated;
GRANT ALL ON public.maintenance_settings TO service_role;
ALTER TABLE public.maintenance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read maint settings" ON public.maintenance_settings FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert maint settings" ON public.maintenance_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update maint settings" ON public.maintenance_settings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

-- ============ PLANOS PREVENTIVOS ============
CREATE TABLE public.maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  service_type text,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vehicle_type text,
  interval_km numeric,
  interval_hours numeric,
  interval_months integer,
  tolerance_km numeric NOT NULL DEFAULT 0,
  tolerance_hours numeric NOT NULL DEFAULT 0,
  tolerance_days integer NOT NULL DEFAULT 0,
  last_done_at date,
  last_done_km numeric,
  last_done_hours numeric,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_maint_plans_org ON public.maintenance_plans (organization_id);
CREATE INDEX idx_maint_plans_vehicle ON public.maintenance_plans (vehicle_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_plans TO authenticated;
GRANT ALL ON public.maintenance_plans TO service_role;
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read maint plans" ON public.maintenance_plans FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert maint plans" ON public.maintenance_plans FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update maint plans" ON public.maintenance_plans FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "delete maint plans" ON public.maintenance_plans FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance());

CREATE TABLE public.maintenance_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE CASCADE,
  description text NOT NULL,
  service_type text,
  sequence integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_maint_plan_items_plan ON public.maintenance_plan_items (plan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_plan_items TO authenticated;
GRANT ALL ON public.maintenance_plan_items TO service_role;
ALTER TABLE public.maintenance_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read maint plan items" ON public.maintenance_plan_items FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert maint plan items" ON public.maintenance_plan_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update maint plan items" ON public.maintenance_plan_items FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "delete maint plan items" ON public.maintenance_plan_items FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance());

-- ============ SOLICITAÇÕES ============
CREATE TABLE public.maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  cost_center_id uuid REFERENCES public.cost_centers(id),
  plan_id uuid REFERENCES public.maintenance_plans(id),
  requester_id uuid,
  requester_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  kind public.maintenance_kind NOT NULL DEFAULT 'corretiva',
  priority public.maintenance_priority NOT NULL DEFAULT 'normal',
  description text NOT NULL,
  odometer_km numeric,
  hour_meter numeric,
  attachment_path text,
  status public.maintenance_request_status NOT NULL DEFAULT 'aberta',
  cancel_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_maint_req_org ON public.maintenance_requests (organization_id, requested_at DESC);
CREATE INDEX idx_maint_req_vehicle ON public.maintenance_requests (vehicle_id);
GRANT SELECT, INSERT, UPDATE ON public.maintenance_requests TO authenticated;
GRANT ALL ON public.maintenance_requests TO service_role;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read maint requests" ON public.maintenance_requests FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert maint requests" ON public.maintenance_requests FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage() AND public.unit_scope_ok(unit_id));
CREATE POLICY "update maint requests" ON public.maintenance_requests FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_operate_usage() AND public.unit_scope_ok(unit_id))
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage() AND public.unit_scope_ok(unit_id));

-- ============ MANUTENÇÕES EXECUTADAS ============
CREATE TABLE public.maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  request_id uuid REFERENCES public.maintenance_requests(id),
  plan_id uuid REFERENCES public.maintenance_plans(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  kind public.maintenance_kind NOT NULL DEFAULT 'corretiva',
  entry_at timestamptz NOT NULL DEFAULT now(),
  exit_at timestamptz,
  services text NOT NULL,
  odometer_km numeric,
  hour_meter numeric,
  labor_value numeric NOT NULL DEFAULT 0,
  parts_value numeric NOT NULL DEFAULT 0,
  other_value numeric NOT NULL DEFAULT 0,
  total_value numeric GENERATED ALWAYS AS (labor_value + parts_value + other_value) STORED,
  invoice_number text,
  warranty_days integer,
  warranty_until date,
  notes text,
  attachment_path text,
  status public.maintenance_record_status NOT NULL DEFAULT 'em_execucao',
  cancel_reason text,
  expense_origin public.expense_origin NOT NULL DEFAULT 'compra_direta',
  cost_center_id uuid REFERENCES public.cost_centers(id),
  contract_id uuid REFERENCES public.contracts(id),
  commitment_id uuid REFERENCES public.commitments(id),
  quota_id uuid REFERENCES public.quotas(id),
  budget_consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_maint_rec_org ON public.maintenance_records (organization_id, entry_at DESC);
CREATE INDEX idx_maint_rec_vehicle ON public.maintenance_records (vehicle_id);
GRANT SELECT, INSERT, UPDATE ON public.maintenance_records TO authenticated;
GRANT ALL ON public.maintenance_records TO service_role;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read maint records" ON public.maintenance_records FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert maint records" ON public.maintenance_records FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update maint records" ON public.maintenance_records FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

-- ============ CATÁLOGO DE PEÇAS ============
CREATE TABLE public.parts_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  internal_code text,
  description text NOT NULL,
  brand text,
  reference text,
  measure_unit text NOT NULL DEFAULT 'unidade',
  category text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX parts_catalog_org_code_key ON public.parts_catalog (organization_id, internal_code) WHERE internal_code IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_catalog TO authenticated;
GRANT ALL ON public.parts_catalog TO service_role;
ALTER TABLE public.parts_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read parts catalog" ON public.parts_catalog FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert parts catalog" ON public.parts_catalog FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update parts catalog" ON public.parts_catalog FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "delete parts catalog" ON public.parts_catalog FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance());

-- ============ PEÇAS APLICADAS (histórico por veículo) ============
CREATE TABLE public.maintenance_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  maintenance_record_id uuid NOT NULL REFERENCES public.maintenance_records(id),
  part_id uuid REFERENCES public.parts_catalog(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_value numeric NOT NULL DEFAULT 0,
  total_value numeric GENERATED ALWAYS AS (quantity * unit_value) STORED,
  installed_at date NOT NULL DEFAULT current_date,
  odometer_km numeric,
  hour_meter numeric,
  warranty_days integer,
  warranty_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_maint_parts_record ON public.maintenance_parts (maintenance_record_id);
CREATE INDEX idx_maint_parts_vehicle ON public.maintenance_parts (vehicle_id, installed_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.maintenance_parts TO authenticated;
GRANT ALL ON public.maintenance_parts TO service_role;
ALTER TABLE public.maintenance_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read maint parts" ON public.maintenance_parts FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert maint parts" ON public.maintenance_parts FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update maint parts" ON public.maintenance_parts FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

-- ============ PNEUS ============
CREATE TABLE public.tires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  brand text,
  model text,
  size text,
  dot text,
  serial_number text,
  purchase_value numeric,
  purchase_date date,
  supplier_id uuid REFERENCES public.suppliers(id),
  expected_life_km numeric,
  accumulated_km numeric NOT NULL DEFAULT 0,
  warranty_until date,
  status public.tire_status NOT NULL DEFAULT 'estoque',
  vehicle_id uuid REFERENCES public.vehicles(id),
  position text,
  install_km numeric,
  install_date date,
  removal_km numeric,
  removal_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX tires_org_code_key ON public.tires (organization_id, code);
CREATE UNIQUE INDEX tires_position_unique ON public.tires (vehicle_id, position) WHERE status = 'instalado';
GRANT SELECT, INSERT, UPDATE ON public.tires TO authenticated;
GRANT ALL ON public.tires TO service_role;
ALTER TABLE public.tires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read tires" ON public.tires FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert tires" ON public.tires FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update tires" ON public.tires FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

CREATE TABLE public.tire_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tire_id uuid NOT NULL REFERENCES public.tires(id),
  kind public.tire_movement_kind NOT NULL,
  from_status public.tire_status,
  to_status public.tire_status NOT NULL,
  vehicle_id uuid REFERENCES public.vehicles(id),
  position text,
  odometer_km numeric,
  reason text,
  maintenance_record_id uuid REFERENCES public.maintenance_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_tire_mov_tire ON public.tire_movements (tire_id, created_at DESC);
GRANT SELECT, INSERT ON public.tire_movements TO authenticated;
GRANT ALL ON public.tire_movements TO service_role;
ALTER TABLE public.tire_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read tire movements" ON public.tire_movements FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert tire movements" ON public.tire_movements FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

-- ============ HISTÓRICO DE SITUAÇÃO DO VEÍCULO ============
CREATE TABLE public.vehicle_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  from_status public.vehicle_status,
  to_status public.vehicle_status NOT NULL,
  reason text,
  source text,
  maintenance_request_id uuid REFERENCES public.maintenance_requests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_vsh_vehicle ON public.vehicle_status_history (vehicle_id, created_at DESC);
GRANT SELECT ON public.vehicle_status_history TO authenticated;
GRANT ALL ON public.vehicle_status_history TO service_role;
ALTER TABLE public.vehicle_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read vehicle status history" ON public.vehicle_status_history FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));

-- ============ MOVIMENTOS ORÇAMENTÁRIOS ============
ALTER TABLE public.budget_movements ADD COLUMN maintenance_record_id uuid REFERENCES public.maintenance_records(id);

-- ============ CÓDIGO AUTOMÁTICO ============
CREATE OR REPLACE FUNCTION public.set_maintenance_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := public.next_org_code(NEW.organization_id, TG_ARGV[0], TG_ARGV[1]);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_maintenance_code() FROM anon, authenticated;

-- ============ HISTÓRICO / INDISPONIBILIDADE DO VEÍCULO ============
CREATE OR REPLACE FUNCTION public.log_vehicle_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.vehicle_status_history (organization_id, vehicle_id, from_status, to_status, source, created_by)
    VALUES (NEW.organization_id, NEW.id, OLD.status, NEW.status, 'cadastro', auth.uid());
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_vehicle_status() FROM anon, authenticated;
CREATE TRIGGER trg_vehicles_status_history AFTER UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.log_vehicle_status();

CREATE OR REPLACE FUNCTION public.apply_maintenance_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.status = 'em_manutencao' AND v.status IN ('ativo','cedido') THEN
    UPDATE public.vehicles SET status = 'manutencao', updated_at = now() WHERE id = v.id;
    INSERT INTO public.vehicle_status_history (organization_id, vehicle_id, from_status, to_status, reason, source, maintenance_request_id, created_by)
    VALUES (NEW.organization_id, v.id, v.status, 'manutencao', 'Solicitação ' || COALESCE(NEW.code,''), 'manutencao', NEW.id, auth.uid());
  ELSIF NEW.status IN ('concluida','cancelada') AND v.status = 'manutencao'
        AND NOT EXISTS (SELECT 1 FROM public.maintenance_requests r
                        WHERE r.vehicle_id = v.id AND r.id <> NEW.id AND r.status = 'em_manutencao') THEN
    UPDATE public.vehicles SET status = 'ativo', updated_at = now() WHERE id = v.id;
    INSERT INTO public.vehicle_status_history (organization_id, vehicle_id, from_status, to_status, reason, source, maintenance_request_id, created_by)
    VALUES (NEW.organization_id, v.id, 'manutencao', 'ativo', 'Solicitação ' || COALESCE(NEW.code,'') || ' ' || NEW.status::text, 'manutencao', NEW.id, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_maintenance_availability() FROM anon, authenticated;

-- ============ INTEGRIDADE DA SOLICITAÇÃO ============
CREATE OR REPLACE FUNCTION public.guard_maintenance_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF NOT FOUND OR v.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Veículo pertence a outro órgão';
  END IF;
  IF NEW.odometer_km IS NOT NULL AND v.current_km IS NOT NULL AND NEW.odometer_km < v.current_km THEN
    RAISE EXCEPTION 'KM informado (%) é menor que o KM atual do veículo (%).', NEW.odometer_km, v.current_km;
  END IF;
  IF NEW.hour_meter IS NOT NULL AND v.hour_meter IS NOT NULL AND NEW.hour_meter < v.hour_meter THEN
    RAISE EXCEPTION 'Horímetro informado (%) é menor que o horímetro atual (%).', NEW.hour_meter, v.hour_meter;
  END IF;
  IF NEW.status = 'cancelada' AND COALESCE(btrim(NEW.cancel_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento da solicitação.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('concluida','cancelada') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Solicitação % já está encerrada e não pode ser reaberta.', OLD.code;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_maintenance_request() FROM anon, authenticated;

-- ============ INTEGRIDADE E ORÇAMENTO DA MANUTENÇÃO ============
CREATE OR REPLACE FUNCTION public.guard_maintenance_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF NOT FOUND OR v.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Veículo pertence a outro órgão';
  END IF;
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.suppliers s WHERE s.id = NEW.supplier_id AND s.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Fornecedor pertence a outro órgão';
  END IF;
  IF NEW.odometer_km IS NOT NULL AND v.current_km IS NOT NULL AND NEW.odometer_km < v.current_km THEN
    RAISE EXCEPTION 'KM da manutenção (%) é menor que o KM atual do veículo (%).', NEW.odometer_km, v.current_km;
  END IF;
  IF NEW.status = 'cancelada' AND COALESCE(btrim(NEW.cancel_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento da manutenção.';
  END IF;
  IF NEW.warranty_until IS NULL AND NEW.warranty_days IS NOT NULL AND NEW.exit_at IS NOT NULL THEN
    NEW.warranty_until := (NEW.exit_at::date + NEW.warranty_days);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'concluida' THEN
    IF NEW.status = 'concluida' AND (
         NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
      OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
      OR NEW.labor_value IS DISTINCT FROM OLD.labor_value
      OR NEW.other_value IS DISTINCT FROM OLD.other_value
      OR NEW.entry_at IS DISTINCT FROM OLD.entry_at
      OR NEW.exit_at IS DISTINCT FROM OLD.exit_at
      OR NEW.services IS DISTINCT FROM OLD.services
      OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
      OR NEW.commitment_id IS DISTINCT FROM OLD.commitment_id
      OR NEW.quota_id IS DISTINCT FROM OLD.quota_id) THEN
      RAISE EXCEPTION 'Manutenção concluída é imutável. Registre um cancelamento com motivo e um novo registro.';
    END IF;
    IF NEW.status NOT IN ('concluida','cancelada') THEN
      RAISE EXCEPTION 'Manutenção concluída não pode voltar para execução.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_maintenance_record() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_maintenance_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tot numeric;
BEGIN
  tot := COALESCE(NEW.total_value, 0);

  IF NEW.status = 'concluida' AND NOT NEW.budget_consumed
     AND (NEW.commitment_id IS NOT NULL OR NEW.quota_id IS NOT NULL) AND tot > 0 THEN
    PERFORM public.budget_consume(NEW.organization_id, NULL, NEW.commitment_id, NEW.quota_id, 0, tot, false);
    INSERT INTO public.budget_movements (organization_id, kind, commitment_id, quota_id, cost_center_id,
                                         maintenance_record_id, quantity, value, reason, created_by)
    VALUES (NEW.organization_id, 'consumo', NEW.commitment_id, NEW.quota_id, NEW.cost_center_id,
            NEW.id, 0, tot, 'Manutenção ' || COALESCE(NEW.code,''), auth.uid());
    UPDATE public.maintenance_records SET budget_consumed = true WHERE id = NEW.id;
  END IF;

  IF NEW.status = 'cancelada' AND OLD.status = 'concluida' AND OLD.budget_consumed THEN
    PERFORM public.budget_refund(NEW.organization_id, NULL, NEW.commitment_id, NEW.quota_id, 0, COALESCE(OLD.total_value,0));
    INSERT INTO public.budget_movements (organization_id, kind, commitment_id, quota_id, cost_center_id,
                                         maintenance_record_id, quantity, value, reason, created_by)
    VALUES (NEW.organization_id, 'estorno', NEW.commitment_id, NEW.quota_id, NEW.cost_center_id,
            NEW.id, 0, COALESCE(OLD.total_value,0), 'Cancelamento da manutenção ' || COALESCE(NEW.code,''), auth.uid());
    UPDATE public.maintenance_records SET budget_consumed = false WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_maintenance_budget() FROM anon, authenticated;

-- medidores do veículo e plano ao concluir a manutenção
CREATE OR REPLACE FUNCTION public.apply_maintenance_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'concluida' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluida') THEN
    UPDATE public.vehicles
       SET current_km = GREATEST(COALESCE(current_km,0), COALESCE(NEW.odometer_km, 0)),
           hour_meter = GREATEST(COALESCE(hour_meter,0), COALESCE(NEW.hour_meter, 0)),
           updated_at = now()
     WHERE id = NEW.vehicle_id;
    IF NEW.plan_id IS NOT NULL THEN
      UPDATE public.maintenance_plans
         SET last_done_at = COALESCE(NEW.exit_at::date, current_date),
             last_done_km = COALESCE(NEW.odometer_km, last_done_km),
             last_done_hours = COALESCE(NEW.hour_meter, last_done_hours),
             updated_at = now()
       WHERE id = NEW.plan_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_maintenance_completion() FROM anon, authenticated;

-- soma das peças no valor da manutenção
CREATE OR REPLACE FUNCTION public.sync_maintenance_parts_value()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec uuid;
BEGIN
  rec := COALESCE(NEW.maintenance_record_id, OLD.maintenance_record_id);
  UPDATE public.maintenance_records m
     SET parts_value = COALESCE((SELECT SUM(p.total_value) FROM public.maintenance_parts p
                                  WHERE p.maintenance_record_id = rec), 0),
         updated_at = now()
   WHERE m.id = rec;
  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.sync_maintenance_parts_value() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_maintenance_part()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record;
BEGIN
  SELECT * INTO m FROM public.maintenance_records WHERE id = NEW.maintenance_record_id;
  IF NOT FOUND OR m.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Manutenção pertence a outro órgão';
  END IF;
  IF m.status = 'concluida' AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Manutenção concluída não aceita novas peças.';
  END IF;
  NEW.vehicle_id := m.vehicle_id;
  IF NEW.warranty_until IS NULL AND NEW.warranty_days IS NOT NULL THEN
    NEW.warranty_until := NEW.installed_at + NEW.warranty_days;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_maintenance_part() FROM anon, authenticated;

-- ============ PNEUS: integridade e movimentação ============
CREATE OR REPLACE FUNCTION public.guard_tire()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'instalado' THEN
    IF NEW.vehicle_id IS NULL OR COALESCE(btrim(NEW.position),'') = '' THEN
      RAISE EXCEPTION 'Informe veículo e posição para instalar o pneu.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = NEW.vehicle_id AND v.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'Veículo pertence a outro órgão';
    END IF;
    IF EXISTS (SELECT 1 FROM public.tires t WHERE t.id <> NEW.id AND t.status = 'instalado'
                 AND t.vehicle_id = NEW.vehicle_id AND t.position = NEW.position) THEN
      RAISE EXCEPTION 'Já existe pneu instalado nesta posição do veículo.';
    END IF;
  ELSE
    NEW.vehicle_id := NULL;
    NEW.position := NULL;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_tire() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_tire_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k public.tire_movement_kind;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.tire_movements (organization_id, tire_id, kind, from_status, to_status, vehicle_id, position, odometer_km, reason, created_by)
    VALUES (NEW.organization_id, NEW.id, 'entrada', NULL, NEW.status, NEW.vehicle_id, NEW.position, NEW.install_km, 'Cadastro do pneu', auth.uid());
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR NEW.position IS DISTINCT FROM OLD.position THEN
    k := CASE NEW.status
           WHEN 'instalado' THEN 'instalacao'::public.tire_movement_kind
           WHEN 'estoque' THEN 'retirada'::public.tire_movement_kind
           WHEN 'em_reparo' THEN 'reparo'::public.tire_movement_kind
           WHEN 'recapagem' THEN 'recapagem'::public.tire_movement_kind
           WHEN 'descartado' THEN 'descarte'::public.tire_movement_kind
           ELSE 'baixa'::public.tire_movement_kind END;
    INSERT INTO public.tire_movements (organization_id, tire_id, kind, from_status, to_status, vehicle_id, position, odometer_km, reason, created_by)
    VALUES (NEW.organization_id, NEW.id, k, OLD.status, NEW.status,
            COALESCE(NEW.vehicle_id, OLD.vehicle_id), COALESCE(NEW.position, OLD.position),
            COALESCE(NEW.removal_km, NEW.install_km), NEW.removal_reason, auth.uid());
    IF OLD.status = 'instalado' AND NEW.status <> 'instalado'
       AND NEW.removal_km IS NOT NULL AND OLD.install_km IS NOT NULL AND NEW.removal_km >= OLD.install_km THEN
      UPDATE public.tires SET accumulated_km = accumulated_km + (NEW.removal_km - OLD.install_km) WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_tire_movement() FROM anon, authenticated;

-- ============ ALERTAS DE MANUTENÇÃO E GARANTIAS ============
CREATE OR REPLACE FUNCTION public.refresh_maintenance_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; st text; msg text; sev public.alert_severity; cfg record;
BEGIN
  FOR cfg IN SELECT o.id AS org,
                    COALESCE(s.lead_km, 500) AS lead_km,
                    COALESCE(s.lead_hours, 20) AS lead_hours,
                    COALESCE(s.lead_days, 15) AS lead_days,
                    COALESCE(s.warranty_lead_days, 30) AS wlead
               FROM public.organizations o
               LEFT JOIN public.maintenance_settings s ON s.organization_id = o.id LOOP

    FOR r IN
      SELECT p.id AS plan_id, p.name, p.organization_id, v.id AS vehicle_id, v.plate,
             p.interval_km, p.interval_hours, p.interval_months,
             p.tolerance_km, p.tolerance_hours, p.tolerance_days,
             COALESCE(p.last_done_km, 0) AS base_km,
             COALESCE(p.last_done_hours, 0) AS base_h,
             COALESCE(p.last_done_at, p.created_at::date) AS base_date,
             COALESCE(v.current_km, 0) AS km, COALESCE(v.hour_meter, 0) AS hm
        FROM public.maintenance_plans p
        JOIN public.vehicles v
          ON v.organization_id = p.organization_id
         AND (p.vehicle_id IS NULL OR v.id = p.vehicle_id)
         AND (p.vehicle_type IS NULL OR v.vehicle_type = p.vehicle_type)
       WHERE p.active AND p.organization_id = cfg.org AND v.status <> 'baixado'
    LOOP
      st := 'ok';
      IF r.interval_km IS NOT NULL AND r.interval_km > 0 THEN
        IF r.km >= r.base_km + r.interval_km + COALESCE(r.tolerance_km,0) THEN st := 'vencido';
        ELSIF st <> 'vencido' AND r.km >= r.base_km + r.interval_km - cfg.lead_km THEN st := 'proximo'; END IF;
      END IF;
      IF r.interval_hours IS NOT NULL AND r.interval_hours > 0 THEN
        IF r.hm >= r.base_h + r.interval_hours + COALESCE(r.tolerance_hours,0) THEN st := 'vencido';
        ELSIF st <> 'vencido' AND r.hm >= r.base_h + r.interval_hours - cfg.lead_hours THEN st := 'proximo'; END IF;
      END IF;
      IF r.interval_months IS NOT NULL AND r.interval_months > 0 THEN
        IF current_date >= (r.base_date + (r.interval_months || ' months')::interval)::date + COALESCE(r.tolerance_days,0) THEN st := 'vencido';
        ELSIF st <> 'vencido' AND current_date >= (r.base_date + (r.interval_months || ' months')::interval)::date - cfg.lead_days THEN st := 'proximo'; END IF;
      END IF;

      IF st <> 'ok' THEN
        msg := CASE WHEN st = 'vencido'
                    THEN 'Manutenção preventiva vencida: ' || r.name || ' — veículo ' || r.plate
                    ELSE 'Manutenção preventiva próxima do vencimento: ' || r.name || ' — veículo ' || r.plate END;
        sev := CASE WHEN st = 'vencido' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END;
        IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a
                        WHERE a.organization_id = r.organization_id AND a.status = 'aberto'
                          AND a.entity_type = 'maintenance_plan' AND a.entity_id = r.plan_id
                          AND a.vehicle_id = r.vehicle_id
                          AND a.alert_type = ('manutencao_' || st)) THEN
          INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
          VALUES (r.organization_id, r.vehicle_id, 'manutencao_' || st, sev, msg, 'manutencao', 'maintenance_plan', r.plan_id, 'aberto');
        END IF;
      ELSE
        UPDATE public.fueling_alerts SET status = 'resolvido', resolved_at = now()
         WHERE organization_id = r.organization_id AND status = 'aberto'
           AND entity_type = 'maintenance_plan' AND entity_id = r.plan_id AND vehicle_id = r.vehicle_id;
      END IF;
    END LOOP;

    -- garantias a vencer (peças, serviços e pneus)
    FOR r IN
      SELECT 'maintenance_part' AS et, p.id, p.organization_id, p.vehicle_id, p.warranty_until, p.description AS nome
        FROM public.maintenance_parts p
       WHERE p.organization_id = cfg.org AND p.warranty_until IS NOT NULL
         AND p.warranty_until BETWEEN current_date AND current_date + cfg.wlead
      UNION ALL
      SELECT 'maintenance_record', m.id, m.organization_id, m.vehicle_id, m.warranty_until, 'Serviço ' || COALESCE(m.code,'')
        FROM public.maintenance_records m
       WHERE m.organization_id = cfg.org AND m.status = 'concluida' AND m.warranty_until IS NOT NULL
         AND m.warranty_until BETWEEN current_date AND current_date + cfg.wlead
      UNION ALL
      SELECT 'tire', t.id, t.organization_id, t.vehicle_id, t.warranty_until, 'Pneu ' || t.code
        FROM public.tires t
       WHERE t.organization_id = cfg.org AND t.warranty_until IS NOT NULL
         AND t.warranty_until BETWEEN current_date AND current_date + cfg.wlead
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a
                      WHERE a.organization_id = r.organization_id AND a.status = 'aberto'
                        AND a.entity_type = r.et AND a.entity_id = r.id AND a.alert_type = 'garantia_a_vencer') THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, 'garantia_a_vencer', 'alerta', 'Garantia a vencer em ' || to_char(r.warranty_until,'DD/MM/YYYY') || ': ' || r.nome,
                'manutencao', r.et, r.id, 'aberto');
      END IF;
    END LOOP;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.refresh_maintenance_alerts() TO authenticated;

-- ============ TRIGGERS ============
CREATE TRIGGER trg_maint_settings_updated BEFORE UPDATE ON public.maintenance_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_maint_plans_updated BEFORE UPDATE ON public.maintenance_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_maint_plan_items_updated BEFORE UPDATE ON public.maintenance_plan_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_maint_req_updated BEFORE UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_maint_rec_updated BEFORE UPDATE ON public.maintenance_records FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_parts_catalog_updated BEFORE UPDATE ON public.parts_catalog FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_maint_parts_updated BEFORE UPDATE ON public.maintenance_parts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tires_updated BEFORE UPDATE ON public.tires FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_maint_req_code BEFORE INSERT ON public.maintenance_requests
FOR EACH ROW EXECUTE FUNCTION public.set_maintenance_code('maintenance_request', 'MNT');
CREATE TRIGGER trg_maint_rec_code BEFORE INSERT ON public.maintenance_records
FOR EACH ROW EXECUTE FUNCTION public.set_maintenance_code('maintenance_record', 'OS');

CREATE TRIGGER trg_maint_req_same_org BEFORE INSERT OR UPDATE ON public.maintenance_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();
CREATE TRIGGER trg_maint_rec_same_org BEFORE INSERT OR UPDATE ON public.maintenance_records
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();

CREATE TRIGGER trg_maint_req_guard BEFORE INSERT OR UPDATE ON public.maintenance_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_request();
CREATE TRIGGER trg_maint_req_availability AFTER INSERT OR UPDATE ON public.maintenance_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_maintenance_availability();

CREATE TRIGGER trg_maint_rec_guard BEFORE INSERT OR UPDATE ON public.maintenance_records
FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_record();
CREATE TRIGGER trg_maint_rec_completion AFTER INSERT OR UPDATE ON public.maintenance_records
FOR EACH ROW EXECUTE FUNCTION public.apply_maintenance_completion();
CREATE TRIGGER trg_maint_rec_budget AFTER UPDATE ON public.maintenance_records
FOR EACH ROW EXECUTE FUNCTION public.apply_maintenance_budget();

CREATE TRIGGER trg_maint_parts_guard BEFORE INSERT OR UPDATE ON public.maintenance_parts
FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_part();
CREATE TRIGGER trg_maint_parts_sync AFTER INSERT OR UPDATE ON public.maintenance_parts
FOR EACH ROW EXECUTE FUNCTION public.sync_maintenance_parts_value();

CREATE TRIGGER trg_tires_guard BEFORE INSERT OR UPDATE ON public.tires
FOR EACH ROW EXECUTE FUNCTION public.guard_tire();
CREATE TRIGGER trg_tires_movement AFTER INSERT OR UPDATE ON public.tires
FOR EACH ROW EXECUTE FUNCTION public.log_tire_movement();

-- auditoria
CREATE TRIGGER trg_audit_maint_plans AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_plans FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_maint_requests AFTER INSERT OR UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_maint_records AFTER INSERT OR UPDATE ON public.maintenance_records FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_maint_parts AFTER INSERT OR UPDATE ON public.maintenance_parts FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_parts_catalog AFTER INSERT OR UPDATE OR DELETE ON public.parts_catalog FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_tires AFTER INSERT OR UPDATE ON public.tires FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_tire_movements AFTER INSERT ON public.tire_movements FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();