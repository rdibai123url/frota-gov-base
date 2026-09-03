-- ===================== FASE 7 — MULTAS, SINISTROS, SEGUROS, OBRIGAÇÕES E PATRIMÔNIO =====================

CREATE TYPE public.entity_kind AS ENUM ('pf','pj');
CREATE TYPE public.fine_status AS ENUM ('recebida','em_analise','defesa_apresentada','deferida','indeferida','paga','cancelada');
CREATE TYPE public.fine_liability AS ENUM ('nao_definida','condutor','orgao');
CREATE TYPE public.accident_kind AS ENUM ('colisao','tombamento','atropelamento','dano_estacionado','furto_roubo','incendio','perda_total','outro');
CREATE TYPE public.accident_status AS ENUM ('registrado','em_apuracao','seguradora_acionada','reparo_autorizado','encerrado');
CREATE TYPE public.insurance_status AS ENUM ('ativa','a_vencer','vencida','cancelada');
CREATE TYPE public.obligation_status AS ENUM ('pendente','quitada','vencida','nao_aplicavel','cancelada');
CREATE TYPE public.asset_movement_kind AS ENUM (
  'proprio_em_uso','cedido_ao_orgao','cedido_a_terceiros','locado','fiel_depositario','remanejamento',
  'baixa_manutencao','alienacao_em_processo','doacao','leilao','furto_roubo','perda_total','alienado','desativado'
);

-- Perfis que podem lançar ocorrências (inclui operador)
CREATE OR REPLACE FUNCTION public.can_register_occurrence()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin','org_admin','fleet_manager','unit_manager','operator'));
$$;

/* ---------------------------- ENTIDADES EXTERNAS ---------------------------- */
CREATE TABLE public.external_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.entity_kind NOT NULL DEFAULT 'pj',
  name text NOT NULL,
  document text,
  address text,
  city text,
  state text,
  zip_code text,
  phone text,
  email text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.external_entities TO authenticated;
GRANT ALL ON public.external_entities TO service_role;
ALTER TABLE public.external_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read external entities" ON public.external_entities FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR is_super_admin(auth.uid()));
CREATE POLICY "insert external entities" ON public.external_entities FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_write());
CREATE POLICY "update external entities" ON public.external_entities FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_write())
  WITH CHECK (organization_id = current_org_id() AND can_write());

/* -------------------------------- SEGUROS ---------------------------------- */
CREATE TABLE public.insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  insurer_name text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id),
  entity_id uuid REFERENCES public.external_entities(id),
  policy_number text NOT NULL,
  contract_id uuid REFERENCES public.contracts(id),
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  premium_value numeric(14,2) NOT NULL DEFAULT 0,
  deductible_value numeric(14,2),
  coverages text,
  limits_notes text,
  notes text,
  attachment_path text,
  renewed_from_id uuid REFERENCES public.insurance_policies(id),
  status public.insurance_status NOT NULL DEFAULT 'ativa',
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read policies" ON public.insurance_policies FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR is_super_admin(auth.uid()));
CREATE POLICY "insert policies" ON public.insurance_policies FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());
CREATE POLICY "update policies" ON public.insurance_policies FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_fleet())
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());

CREATE TABLE public.insurance_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  insured_value numeric(14,2),
  deductible_value numeric(14,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (policy_id, vehicle_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_vehicles TO authenticated;
GRANT ALL ON public.insurance_vehicles TO service_role;
ALTER TABLE public.insurance_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read policy vehicles" ON public.insurance_vehicles FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR is_super_admin(auth.uid()));
CREATE POLICY "insert policy vehicles" ON public.insurance_vehicles FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());
CREATE POLICY "update policy vehicles" ON public.insurance_vehicles FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_fleet())
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());
CREATE POLICY "delete policy vehicles" ON public.insurance_vehicles FOR DELETE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_fleet());

/* --------------------------- MULTAS E INFRAÇÕES ----------------------------- */
CREATE TABLE public.traffic_fines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  driver_id uuid REFERENCES public.drivers(id),
  usage_id uuid REFERENCES public.vehicle_usages(id),
  authorization_id uuid REFERENCES public.fuel_authorizations(id),
  notice_number text NOT NULL,
  issuing_authority text NOT NULL,
  infraction_code text,
  description text NOT NULL,
  occurred_at timestamptz NOT NULL,
  location text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2),
  due_date date,
  status public.fine_status NOT NULL DEFAULT 'recebida',
  defense_protocol text,
  defense_at date,
  decision_at date,
  decision_notes text,
  liability public.fine_liability NOT NULL DEFAULT 'nao_definida',
  responsible_name text,
  responsible_id uuid,
  driver_confirmed boolean NOT NULL DEFAULT false,
  paid_at date,
  paid_amount numeric(14,2),
  points integer,
  notes text,
  notification_path text,
  defense_path text,
  decision_path text,
  payment_path text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, notice_number)
);
GRANT SELECT, INSERT, UPDATE ON public.traffic_fines TO authenticated;
GRANT ALL ON public.traffic_fines TO service_role;
ALTER TABLE public.traffic_fines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read fines" ON public.traffic_fines FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR is_super_admin(auth.uid()));
CREATE POLICY "insert fines" ON public.traffic_fines FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_register_occurrence());
CREATE POLICY "update fines" ON public.traffic_fines FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_register_occurrence())
  WITH CHECK (organization_id = current_org_id() AND can_register_occurrence());

/* --------------------------- ACIDENTES E SINISTROS -------------------------- */
CREATE TABLE public.accidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  driver_id uuid REFERENCES public.drivers(id),
  usage_id uuid REFERENCES public.vehicle_usages(id),
  authorization_id uuid REFERENCES public.fuel_authorizations(id),
  kind public.accident_kind NOT NULL DEFAULT 'colisao',
  occurred_at timestamptz NOT NULL,
  location text,
  description text NOT NULL,
  third_parties text,
  third_party_entity_id uuid REFERENCES public.external_entities(id),
  has_victims boolean NOT NULL DEFAULT false,
  victims_notes text,
  police_report_number text,
  police_report_agency text,
  damages text,
  needs_tow boolean NOT NULL DEFAULT false,
  blocks_use boolean NOT NULL DEFAULT false,
  policy_id uuid REFERENCES public.insurance_policies(id),
  deductible_value numeric(14,2),
  expenses_value numeric(14,2),
  maintenance_record_id uuid REFERENCES public.maintenance_records(id),
  service_order_id uuid REFERENCES public.service_orders(id),
  status public.accident_status NOT NULL DEFAULT 'registrado',
  reporter_name text,
  investigator_name text,
  closed_at timestamptz,
  attachment_paths text[] NOT NULL DEFAULT '{}',
  notes text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.accidents TO authenticated;
GRANT ALL ON public.accidents TO service_role;
ALTER TABLE public.accidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read accidents" ON public.accidents FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR is_super_admin(auth.uid()));
CREATE POLICY "insert accidents" ON public.accidents FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_register_occurrence());
CREATE POLICY "update accidents" ON public.accidents FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_register_occurrence())
  WITH CHECK (organization_id = current_org_id() AND can_register_occurrence());

/* --------------------- OBRIGAÇÕES LEGAIS E DOCUMENTOS ----------------------- */
CREATE TABLE public.vehicle_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  obligation_type text NOT NULL,
  exercise integer,
  document_number text,
  due_date date,
  amount numeric(14,2),
  status public.obligation_status NOT NULL DEFAULT 'pendente',
  not_applicable boolean NOT NULL DEFAULT false,
  paid_at date,
  paid_amount numeric(14,2),
  notes text,
  attachment_path text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.vehicle_obligations TO authenticated;
GRANT ALL ON public.vehicle_obligations TO service_role;
ALTER TABLE public.vehicle_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read obligations" ON public.vehicle_obligations FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR is_super_admin(auth.uid()));
CREATE POLICY "insert obligations" ON public.vehicle_obligations FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_register_occurrence());
CREATE POLICY "update obligations" ON public.vehicle_obligations FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_register_occurrence())
  WITH CHECK (organization_id = current_org_id() AND can_register_occurrence());

/* ------------------------- MOVIMENTAÇÃO PATRIMONIAL ------------------------- */
CREATE TABLE public.asset_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  kind public.asset_movement_kind NOT NULL,
  moved_on date NOT NULL DEFAULT current_date,
  from_unit_id uuid REFERENCES public.units(id),
  unit_id uuid REFERENCES public.units(id),
  from_status public.vehicle_status,
  to_status public.vehicle_status,
  owner_name text,
  holder_name text,
  reason text,
  odometer_km numeric(12,1),
  hour_meter numeric(12,1),
  condition_state text,
  book_value numeric(14,2),
  asset_code text,
  act_number text,
  act_published_on date,
  official_gazette text,
  entity_id uuid REFERENCES public.external_entities(id),
  auction_number text,
  auction_lot text,
  auction_winner_entity_id uuid REFERENCES public.external_entities(id),
  auction_value numeric(14,2),
  accident_id uuid REFERENCES public.accidents(id),
  notes text,
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.asset_movements TO authenticated;
GRANT ALL ON public.asset_movements TO service_role;
ALTER TABLE public.asset_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read asset movements" ON public.asset_movements FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR is_super_admin(auth.uid()));
CREATE POLICY "insert asset movements" ON public.asset_movements FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());
CREATE POLICY "update asset movements" ON public.asset_movements FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_fleet())
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());

ALTER TABLE public.vehicle_status_history ADD COLUMN IF NOT EXISTS asset_movement_id uuid REFERENCES public.asset_movements(id);
ALTER TABLE public.vehicle_status_history ADD COLUMN IF NOT EXISTS accident_id uuid REFERENCES public.accidents(id);
ALTER TABLE public.maintenance_records ADD COLUMN IF NOT EXISTS accident_id uuid REFERENCES public.accidents(id);
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS accident_id uuid REFERENCES public.accidents(id);

/* --------------------------------- REGRAS ---------------------------------- */

-- Códigos automáticos
CREATE OR REPLACE FUNCTION public.set_phase7_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    IF TG_TABLE_NAME = 'traffic_fines' THEN NEW.code := public.next_org_code(NEW.organization_id,'traffic_fine','MUL');
    ELSIF TG_TABLE_NAME = 'accidents' THEN NEW.code := public.next_org_code(NEW.organization_id,'accident','SIN');
    ELSIF TG_TABLE_NAME = 'asset_movements' THEN NEW.code := public.next_org_code(NEW.organization_id,'asset_movement','MOV');
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER set_code_fines BEFORE INSERT ON public.traffic_fines FOR EACH ROW EXECUTE FUNCTION public.set_phase7_code();
CREATE TRIGGER set_code_accidents BEFORE INSERT ON public.accidents FOR EACH ROW EXECUTE FUNCTION public.set_phase7_code();
CREATE TRIGGER set_code_movements BEFORE INSERT ON public.asset_movements FOR EACH ROW EXECUTE FUNCTION public.set_phase7_code();

-- Guarda de multas
CREATE OR REPLACE FUNCTION public.guard_traffic_fine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o uuid;
BEGIN
  SELECT organization_id INTO o FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Veículo pertence a outro órgão'; END IF;
  IF NEW.driver_id IS NOT NULL THEN
    SELECT organization_id INTO o FROM public.drivers WHERE id = NEW.driver_id;
    IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Condutor pertence a outro órgão'; END IF;
  END IF;
  IF NEW.usage_id IS NOT NULL THEN
    SELECT organization_id INTO o FROM public.vehicle_usages WHERE id = NEW.usage_id;
    IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Utilização pertence a outro órgão'; END IF;
  END IF;
  IF NEW.amount < 0 THEN RAISE EXCEPTION 'Valor da multa não pode ser negativo'; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'cancelada' AND NEW.status = 'cancelada' AND to_jsonb(NEW) - 'updated_at' - 'updated_by' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' - 'updated_by' THEN
      RAISE EXCEPTION 'Multa cancelada não pode ser alterada';
    END IF;
    IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
      IF COALESCE(btrim(NEW.cancel_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo do cancelamento da multa'; END IF;
      IF NOT public.can_manage_fleet() THEN RAISE EXCEPTION 'Apenas a gestão de frota pode cancelar multas'; END IF;
    END IF;
    IF NEW.status = 'paga' AND NEW.paid_at IS NULL THEN NEW.paid_at := current_date; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_fines BEFORE INSERT OR UPDATE ON public.traffic_fines FOR EACH ROW EXECUTE FUNCTION public.guard_traffic_fine();

-- Guarda de acidentes + indisponibilidade automática
CREATE OR REPLACE FUNCTION public.guard_accident()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o uuid; v record;
BEGIN
  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF v.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Veículo pertence a outro órgão'; END IF;
  IF NEW.driver_id IS NOT NULL THEN
    SELECT organization_id INTO o FROM public.drivers WHERE id = NEW.driver_id;
    IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Condutor pertence a outro órgão'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'encerrado' AND NEW.status <> 'encerrado' AND NOT public.can_manage_fleet() THEN
      RAISE EXCEPTION 'Apenas a gestão de frota pode reabrir um sinistro encerrado';
    END IF;
    IF NEW.status = 'encerrado' AND OLD.status <> 'encerrado' THEN NEW.closed_at := COALESCE(NEW.closed_at, now()); END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_accidents BEFORE INSERT OR UPDATE ON public.accidents FOR EACH ROW EXECUTE FUNCTION public.guard_accident();

CREATE OR REPLACE FUNCTION public.apply_accident_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cur public.vehicle_status;
BEGIN
  SELECT status INTO cur FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF NEW.blocks_use AND NEW.status <> 'encerrado' AND cur NOT IN ('manutencao','baixado','inativo') THEN
    UPDATE public.vehicles SET status = 'manutencao', updated_at = now() WHERE id = NEW.vehicle_id;
    INSERT INTO public.vehicle_status_history (organization_id, vehicle_id, from_status, to_status, source, reason, accident_id, created_by)
    VALUES (NEW.organization_id, NEW.vehicle_id, cur, 'manutencao', 'sinistro',
            'Sinistro ' || COALESCE(NEW.code,'') || ' impeditivo de uso', NEW.id, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER apply_accident_avail AFTER INSERT OR UPDATE OF blocks_use, status ON public.accidents
FOR EACH ROW EXECUTE FUNCTION public.apply_accident_availability();

-- Obrigações: situação automática
CREATE OR REPLACE FUNCTION public.guard_vehicle_obligation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o uuid;
BEGIN
  SELECT organization_id INTO o FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Veículo pertence a outro órgão'; END IF;
  IF NEW.not_applicable THEN
    NEW.status := 'nao_aplicavel';
  ELSIF NEW.status NOT IN ('cancelada','quitada') THEN
    NEW.status := CASE WHEN NEW.due_date IS NOT NULL AND NEW.due_date < current_date THEN 'vencida'::public.obligation_status
                       ELSE 'pendente'::public.obligation_status END;
  END IF;
  IF NEW.status = 'quitada' AND NEW.paid_at IS NULL THEN NEW.paid_at := current_date; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
    IF COALESCE(btrim(NEW.cancel_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo do cancelamento da obrigação'; END IF;
    IF NOT public.can_manage_fleet() THEN RAISE EXCEPTION 'Apenas a gestão de frota pode cancelar obrigações'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_obligations BEFORE INSERT OR UPDATE ON public.vehicle_obligations
FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_obligation();

-- Seguros: situação automática pela vigência
CREATE OR REPLACE FUNCTION public.guard_insurance_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.valid_to < NEW.valid_from THEN RAISE EXCEPTION 'Fim da vigência anterior ao início'; END IF;
  IF NEW.status <> 'cancelada' THEN
    NEW.status := CASE
      WHEN NEW.valid_to < current_date THEN 'vencida'::public.insurance_status
      WHEN NEW.valid_to <= current_date + 60 THEN 'a_vencer'::public.insurance_status
      ELSE 'ativa'::public.insurance_status END;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelada' AND OLD.status <> 'cancelada'
     AND COALESCE(btrim(NEW.cancel_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento da apólice';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_policies BEFORE INSERT OR UPDATE ON public.insurance_policies
FOR EACH ROW EXECUTE FUNCTION public.guard_insurance_policy();

-- Movimentação patrimonial aplica unidade/situação e grava histórico
CREATE OR REPLACE FUNCTION public.apply_asset_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; target public.vehicle_status;
BEGIN
  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF v.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Veículo pertence a outro órgão'; END IF;

  target := COALESCE(NEW.to_status, CASE NEW.kind
    WHEN 'proprio_em_uso' THEN 'ativo'
    WHEN 'cedido_ao_orgao' THEN 'ativo'
    WHEN 'locado' THEN 'ativo'
    WHEN 'fiel_depositario' THEN 'ativo'
    WHEN 'remanejamento' THEN v.status
    WHEN 'cedido_a_terceiros' THEN 'cedido'
    WHEN 'baixa_manutencao' THEN 'manutencao'
    WHEN 'alienacao_em_processo' THEN 'inativo'
    WHEN 'desativado' THEN 'inativo'
    WHEN 'furto_roubo' THEN 'inativo'
    WHEN 'perda_total' THEN 'inativo'
    WHEN 'doacao' THEN 'baixado'
    WHEN 'leilao' THEN 'baixado'
    WHEN 'alienado' THEN 'baixado'
    ELSE v.status END::public.vehicle_status);

  UPDATE public.asset_movements
     SET from_unit_id = COALESCE(from_unit_id, v.unit_id),
         from_status = COALESCE(from_status, v.status),
         to_status = target,
         odometer_km = COALESCE(odometer_km, v.current_km)
   WHERE id = NEW.id;

  UPDATE public.vehicles
     SET unit_id = COALESCE(NEW.unit_id, unit_id),
         status = target,
         current_km = GREATEST(COALESCE(current_km,0), COALESCE(NEW.odometer_km, 0)),
         updated_at = now()
   WHERE id = NEW.vehicle_id;

  INSERT INTO public.vehicle_status_history (organization_id, vehicle_id, from_status, to_status, source, reason, asset_movement_id, created_by)
  VALUES (NEW.organization_id, NEW.vehicle_id, v.status, target, 'patrimonio',
          COALESCE(NEW.reason, NEW.kind::text), NEW.id, auth.uid());
  RETURN NEW;
END; $$;
CREATE TRIGGER apply_asset_mov AFTER INSERT ON public.asset_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_asset_movement();

-- updated_at + auditoria
CREATE TRIGGER touch_fines BEFORE UPDATE ON public.traffic_fines FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_accidents BEFORE UPDATE ON public.accidents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_policies BEFORE UPDATE ON public.insurance_policies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_obligations BEFORE UPDATE ON public.vehicle_obligations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_movements BEFORE UPDATE ON public.asset_movements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_entities BEFORE UPDATE ON public.external_entities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER audit_fines AFTER INSERT OR UPDATE ON public.traffic_fines FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_accidents AFTER INSERT OR UPDATE ON public.accidents FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_policies AFTER INSERT OR UPDATE ON public.insurance_policies FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_obligations AFTER INSERT OR UPDATE ON public.vehicle_obligations FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_movements AFTER INSERT OR UPDATE ON public.asset_movements FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_entities AFTER INSERT OR UPDATE ON public.external_entities FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

/* --------------------------------- ALERTAS ---------------------------------- */
CREATE OR REPLACE FUNCTION public.refresh_fleet_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  -- multas vencidas / a vencer
  FOR r IN SELECT f.id, f.organization_id, f.vehicle_id, f.code, f.notice_number, f.due_date,
                  CASE WHEN f.due_date < current_date THEN 'multa_vencida' ELSE 'multa_a_vencer' END AS tp
             FROM public.traffic_fines f
            WHERE f.status IN ('recebida','em_analise','defesa_apresentada','indeferida')
              AND f.due_date IS NOT NULL AND f.due_date <= current_date + 15
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='traffic_fine' AND a.entity_id=r.id AND a.alert_type=r.tp) THEN
      INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.vehicle_id, r.tp,
              CASE WHEN r.tp='multa_vencida' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
              'Multa ' || COALESCE(r.code, r.notice_number) || ' com vencimento em ' || to_char(r.due_date,'DD/MM/YYYY'),
              'frota', 'traffic_fine', r.id, 'aberto');
    END IF;
  END LOOP;

  -- obrigações legais
  FOR r IN SELECT ob.id, ob.organization_id, ob.vehicle_id, ob.obligation_type, ob.due_date,
                  CASE WHEN ob.due_date < current_date THEN 'obrigacao_vencida' ELSE 'obrigacao_a_vencer' END AS tp
             FROM public.vehicle_obligations ob
            WHERE ob.status IN ('pendente','vencida') AND NOT ob.not_applicable
              AND ob.due_date IS NOT NULL AND ob.due_date <= current_date + 30
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='vehicle_obligation' AND a.entity_id=r.id AND a.alert_type=r.tp) THEN
      INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.vehicle_id, r.tp,
              CASE WHEN r.tp='obrigacao_vencida' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
              r.obligation_type || ' com vencimento em ' || to_char(r.due_date,'DD/MM/YYYY'),
              'frota', 'vehicle_obligation', r.id, 'aberto');
    END IF;
  END LOOP;

  -- seguros
  FOR r IN SELECT p.id, p.organization_id, p.policy_number, p.valid_to,
                  CASE WHEN p.valid_to < current_date THEN 'seguro_vencido' ELSE 'seguro_a_vencer' END AS tp
             FROM public.insurance_policies p
            WHERE p.status <> 'cancelada' AND p.valid_to <= current_date + 60
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='insurance_policy' AND a.entity_id=r.id AND a.alert_type=r.tp) THEN
      INSERT INTO public.fueling_alerts (organization_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.tp,
              CASE WHEN r.tp='seguro_vencido' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
              'Apólice ' || r.policy_number || ' com vigência até ' || to_char(r.valid_to,'DD/MM/YYYY'),
              'frota', 'insurance_policy', r.id, 'aberto');
    END IF;
  END LOOP;

  -- sinistros em aberto há mais de 30 dias
  FOR r IN SELECT ac.id, ac.organization_id, ac.vehicle_id, ac.code, ac.occurred_at
             FROM public.accidents ac
            WHERE ac.status <> 'encerrado' AND ac.occurred_at < now() - interval '30 days'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='accident' AND a.entity_id=r.id AND a.alert_type='sinistro_em_aberto') THEN
      INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.vehicle_id, 'sinistro_em_aberto', 'alerta',
              'Sinistro ' || COALESCE(r.code,'') || ' em aberto desde ' || to_char(r.occurred_at,'DD/MM/YYYY'),
              'frota', 'accident', r.id, 'aberto');
    END IF;
  END LOOP;

  -- perda total sem movimentação patrimonial concluída
  FOR r IN SELECT ac.id, ac.organization_id, ac.vehicle_id, ac.code
             FROM public.accidents ac
            WHERE ac.kind = 'perda_total'
              AND NOT EXISTS (SELECT 1 FROM public.asset_movements m
                               WHERE m.vehicle_id = ac.vehicle_id
                                 AND m.kind IN ('perda_total','alienado','leilao','doacao','desativado'))
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='accident' AND a.entity_id=r.id AND a.alert_type='perda_total_sem_baixa') THEN
      INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.vehicle_id, 'perda_total_sem_baixa', 'erro',
              'Veículo com perda total (sinistro ' || COALESCE(r.code,'') || ') sem movimentação patrimonial concluída',
              'frota', 'accident', r.id, 'aberto');
    END IF;
  END LOOP;
END; $$;

/* ----------------------------- ANEXOS PRIVADOS ------------------------------ */
CREATE POLICY "frota read own org" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'frota' AND (storage.foldername(name))[1] = current_org_id()::text);
CREATE POLICY "frota insert own org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'frota' AND (storage.foldername(name))[1] = current_org_id()::text AND can_register_occurrence());
CREATE POLICY "frota update own org" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'frota' AND (storage.foldername(name))[1] = current_org_id()::text AND can_manage_fleet());
