-- Fase 2 — Manutenção avançada.
-- Origem: editais de Cachoeiro de Itapemirim/ES, CRMV-PR, DNIT/Sede e Imperatriz/MA.
-- Tudo aqui é aditivo: colunas novas com valor padrão, tabelas novas e gatilhos que só
-- disparam em novas gravações.

/* ------------------------------------------------------------------ */
/* 1. Execução da manutenção: inspeção, retirada e prazo prometido     */
/* ------------------------------------------------------------------ */
ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS entry_inspection text,
  ADD COLUMN IF NOT EXISTS exit_inspection text,
  ADD COLUMN IF NOT EXISTS pickup_person text,
  ADD COLUMN IF NOT EXISTS promised_return_at timestamptz;

/* ------------------------------------------------------------------ */
/* 2. Peças: origem, justificativa e destino da peça substituída       */
/* ------------------------------------------------------------------ */
ALTER TABLE public.maintenance_parts
  ADD COLUMN IF NOT EXISTS part_origin text NOT NULL DEFAULT 'genuina',
  ADD COLUMN IF NOT EXISTS origin_note text,
  ADD COLUMN IF NOT EXISTS replaced_destination text NOT NULL DEFAULT 'nao_aplicavel';

ALTER TABLE public.maintenance_parts
  ADD CONSTRAINT maintenance_parts_origin_chk
  CHECK (part_origin IN ('genuina', 'original', 'paralela', 'recondicionada'));
ALTER TABLE public.maintenance_parts
  ADD CONSTRAINT maintenance_parts_destination_chk
  CHECK (replaced_destination IN ('nao_aplicavel', 'entregue_servidor', 'descartada'));

ALTER TABLE public.quotation_proposals
  ADD COLUMN IF NOT EXISTS parts_origin text NOT NULL DEFAULT 'genuina',
  ADD COLUMN IF NOT EXISTS parts_origin_note text;
ALTER TABLE public.quotation_proposals
  ADD CONSTRAINT quotation_proposals_parts_origin_chk
  CHECK (parts_origin IN ('genuina', 'original', 'paralela', 'recondicionada'));

-- Peça paralela ou recondicionada só com justificativa aprovada pelo gestor.
CREATE OR REPLACE FUNCTION public.guard_part_origin()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_origin text; v_note text;
BEGIN
  EXECUTE format('SELECT ($1).%I::text, ($1).%I::text', TG_ARGV[0], TG_ARGV[1])
    INTO v_origin, v_note USING NEW;
  IF v_origin = 'paralela' AND btrim(coalesce(v_note, '')) = '' THEN
    RAISE EXCEPTION 'Peça paralela exige justificativa e aprovação do gestor da frota.';
  ELSIF v_origin = 'recondicionada' AND btrim(coalesce(v_note, '')) = '' THEN
    RAISE EXCEPTION 'Peça recondicionada só é permitida em caráter excepcional, com justificativa.';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_part_origin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_maintenance_parts_origin ON public.maintenance_parts;
CREATE TRIGGER trg_maintenance_parts_origin
  BEFORE INSERT OR UPDATE OF part_origin, origin_note ON public.maintenance_parts
  FOR EACH ROW EXECUTE FUNCTION public.guard_part_origin('part_origin', 'origin_note');

DROP TRIGGER IF EXISTS trg_quotation_proposals_origin ON public.quotation_proposals;
CREATE TRIGGER trg_quotation_proposals_origin
  BEFORE INSERT OR UPDATE OF parts_origin, parts_origin_note ON public.quotation_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_part_origin('parts_origin', 'parts_origin_note');

/* ------------------------------------------------------------------ */
/* 3. Veículo em garantia de fábrica e oficina com requisitos ambientais */
/* ------------------------------------------------------------------ */
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS factory_warranty_until date,
  ADD COLUMN IF NOT EXISTS factory_warranty_km numeric;

ALTER TABLE public.external_entities
  ADD COLUMN IF NOT EXISTS environmental_compliant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environmental_note text;

/* ------------------------------------------------------------------ */
/* 4. Parâmetros de preço da mão de obra                                */
/* ------------------------------------------------------------------ */
ALTER TABLE public.maintenance_settings
  ADD COLUMN IF NOT EXISTS max_labor_hour_value numeric,
  ADD COLUMN IF NOT EXISTS block_above_max_hour_value boolean NOT NULL DEFAULT false;

/* ------------------------------------------------------------------ */
/* 5. Tabelas de regras                                                 */
/* ------------------------------------------------------------------ */
-- 5.1 Alçadas e limites financeiros por perfil (e, se quiser, por unidade)
CREATE TABLE IF NOT EXISTS public.approval_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'manutencao' CHECK (scope IN ('manutencao', 'todos')),
  max_value numeric(14, 2) NOT NULL CHECK (max_value >= 0),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS approval_limits_unique_idx
  ON public.approval_limits (organization_id, role, scope, unit_id) NULLS NOT DISTINCT;

-- 5.2 Tabela de tempos padrão de reparo (Audatex, Molicar, fabricante ou interna)
CREATE TABLE IF NOT EXISTS public.labor_time_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  vehicle_type text,
  standard_hours numeric(8, 2) NOT NULL CHECK (standard_hours > 0),
  source text NOT NULL DEFAULT 'interna',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS labor_time_standards_unique_idx
  ON public.labor_time_standards (organization_id, lower(service_name), COALESCE(vehicle_type, ''));

-- 5.3 Prazos de devolução do veículo pela oficina
CREATE TABLE IF NOT EXISTS public.maintenance_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_type text,
  kind public.maintenance_kind,
  business_days integer NOT NULL CHECK (business_days >= 0 AND business_days <= 365),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_deadlines_unique_idx
  ON public.maintenance_deadlines (organization_id, vehicle_type, kind) NULLS NOT DISTINCT;

-- 5.4 Limites de lavagem por tipo de veículo
CREATE TABLE IF NOT EXISTS public.cleaning_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_type text,
  min_interval_days integer NOT NULL DEFAULT 0 CHECK (min_interval_days >= 0),
  max_per_month integer CHECK (max_per_month IS NULL OR max_per_month > 0),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS cleaning_rules_unique_idx
  ON public.cleaning_rules (organization_id, vehicle_type) NULLS NOT DISTINCT;

-- RLS: leitura para o órgão, escrita para quem gerencia manutenção.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_limits', 'labor_time_standards', 'maintenance_deadlines', 'cleaning_rules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format($p$CREATE POLICY "read %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()))$p$, t);
    EXECUTE format($p$CREATE POLICY "insert %1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance())$p$, t);
    EXECUTE format($p$CREATE POLICY "update %1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
      WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance())$p$, t);
    EXECUTE format($p$CREATE POLICY "delete %1$s" ON public.%1$I FOR DELETE TO authenticated
      USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())$p$, t);
  END LOOP;
END $$;

/* ------------------------------------------------------------------ */
/* 6. Alçada: a ordem de serviço não pode passar do limite do autorizador */
/* ------------------------------------------------------------------ */
-- Devolve NULL quando não há alçada aplicável (sem limite): órgão sem alçadas
-- cadastradas, administrador do órgão, super admin ou perfil sem alçada definida.
CREATE OR REPLACE FUNCTION public.approval_limit_for(_user uuid, _org uuid, _unit uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric; has_any boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.approval_limits WHERE organization_id = _org AND active)
    INTO has_any;
  IF NOT has_any THEN RETURN NULL; END IF;
  IF _user IS NULL OR public.is_super_admin(_user) OR public.has_role(_user, 'org_admin') THEN
    RETURN NULL;
  END IF;
  SELECT max(l.max_value) INTO v
    FROM public.approval_limits l
    JOIN public.user_roles ur
      ON ur.user_id = _user AND ur.role = l.role
     AND (ur.organization_id IS NULL OR ur.organization_id = _org)
   WHERE l.organization_id = _org AND l.active
     AND l.scope IN ('manutencao', 'todos')
     AND (l.unit_id IS NULL OR l.unit_id = _unit);
  RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.approval_limit_for(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approval_limit_for(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_service_order_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v numeric;
BEGIN
  IF NEW.status = 'cancelada' THEN RETURN NEW; END IF;
  v := public.approval_limit_for(NEW.authorizer_id, NEW.organization_id, NEW.unit_id);
  IF v IS NOT NULL AND COALESCE(NEW.approved_value, 0) > v THEN
    RAISE EXCEPTION 'Valor da ordem de serviço acima da alçada do autorizador (limite de R$ %).',
      trim(to_char(v, 'FM999999990.00'));
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_service_order_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_service_orders_limit ON public.service_orders;
CREATE TRIGGER trg_service_orders_limit
  BEFORE INSERT OR UPDATE OF approved_value, authorizer_id ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_service_order_limit();

/* ------------------------------------------------------------------ */
/* 7. Lavagem: intervalo mínimo e máximo por mês                        */
/* ------------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.guard_cleaning_limits()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.cleaning_rules; vtype text; n int;
BEGIN
  IF NEW.status = 'cancelada' THEN RETURN NEW; END IF;
  SELECT vehicle_type INTO vtype FROM public.vehicles WHERE id = NEW.vehicle_id;
  SELECT * INTO r FROM public.cleaning_rules
   WHERE organization_id = NEW.organization_id AND active
     AND (vehicle_type IS NULL OR vehicle_type = vtype)
   ORDER BY (vehicle_type IS NULL) ASC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF r.min_interval_days > 0 AND EXISTS (
    SELECT 1 FROM public.vehicle_cleanings c
     WHERE c.vehicle_id = NEW.vehicle_id AND c.id <> NEW.id AND c.status <> 'cancelada'
       AND abs(NEW.performed_at::date - c.performed_at::date) < r.min_interval_days
  ) THEN
    RAISE EXCEPTION 'Este veículo já teve lavagem em menos de % dia(s), intervalo mínimo definido pelo órgão.',
      r.min_interval_days;
  END IF;

  IF r.max_per_month IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.vehicle_cleanings c
     WHERE c.vehicle_id = NEW.vehicle_id AND c.id <> NEW.id AND c.status <> 'cancelada'
       AND date_trunc('month', c.performed_at) = date_trunc('month', NEW.performed_at);
    IF n >= r.max_per_month THEN
      RAISE EXCEPTION 'Limite de % lavagem(ns) por mês atingido para este veículo.', r.max_per_month;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_cleaning_limits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vehicle_cleanings_limits ON public.vehicle_cleanings;
CREATE TRIGGER trg_vehicle_cleanings_limits
  BEFORE INSERT OR UPDATE OF vehicle_id, performed_at, status ON public.vehicle_cleanings
  FOR EACH ROW EXECUTE FUNCTION public.guard_cleaning_limits();
