-- ============ 1) Isolamento absoluto por órgão no backup ============
CREATE OR REPLACE FUNCTION public.guard_backup_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r_org uuid; s_org uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'O órgão de um registro de backup não pode ser alterado.';
  END IF;

  IF TG_TABLE_NAME = 'backup_restores' THEN
    SELECT organization_id INTO r_org FROM public.backup_runs WHERE id = NEW.run_id;
    IF r_org IS NULL OR r_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'O backup selecionado pertence a outro órgão.';
    END IF;
    IF NEW.safety_run_id IS NOT NULL THEN
      SELECT organization_id INTO s_org FROM public.backup_runs WHERE id = NEW.safety_run_id;
      IF s_org IS DISTINCT FROM NEW.organization_id THEN
        RAISE EXCEPTION 'O backup de segurança pertence a outro órgão.';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'backup_settings' AND TG_OP = 'UPDATE'
     AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'A configuração de backup não pode mudar de órgão.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_backup_tenant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_backup_runs_tenant ON public.backup_runs;
CREATE TRIGGER trg_backup_runs_tenant BEFORE UPDATE ON public.backup_runs
FOR EACH ROW EXECUTE FUNCTION public.guard_backup_tenant();

DROP TRIGGER IF EXISTS trg_backup_restores_tenant ON public.backup_restores;
CREATE TRIGGER trg_backup_restores_tenant BEFORE INSERT OR UPDATE ON public.backup_restores
FOR EACH ROW EXECUTE FUNCTION public.guard_backup_tenant();

DROP TRIGGER IF EXISTS trg_backup_settings_tenant ON public.backup_settings;
CREATE TRIGGER trg_backup_settings_tenant BEFORE UPDATE ON public.backup_settings
FOR EACH ROW EXECUTE FUNCTION public.guard_backup_tenant();

-- ============ 2) Módulo Limpeza ============
DO $$ BEGIN
  CREATE TYPE public.cleaning_status AS ENUM ('agendada','realizada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.cleaning_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (organization_id, name)
);

GRANT SELECT, INSERT, UPDATE ON public.cleaning_types TO authenticated;
GRANT ALL ON public.cleaning_types TO service_role;
ALTER TABLE public.cleaning_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cleaning_types_select" ON public.cleaning_types FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "cleaning_types_insert" ON public.cleaning_types FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "cleaning_types_update" ON public.cleaning_types FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

CREATE TRIGGER trg_cleaning_types_updated BEFORE UPDATE ON public.cleaning_types
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.vehicle_cleanings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  odometer_km numeric,
  service_type_ids uuid[] NOT NULL DEFAULT '{}',
  service_types text[] NOT NULL DEFAULT '{}',
  supplier_id uuid REFERENCES public.suppliers(id),
  contract_id uuid REFERENCES public.contracts(id),
  contract_item_id uuid REFERENCES public.contract_items(id),
  commitment_id uuid REFERENCES public.commitments(id),
  quota_id uuid REFERENCES public.quotas(id),
  cost_center_id uuid REFERENCES public.cost_centers(id),
  total_value numeric NOT NULL DEFAULT 0,
  invoice_number text,
  notes text,
  attachment_path text,
  status public.cleaning_status NOT NULL DEFAULT 'realizada',
  cancel_reason text,
  budget_consumed boolean NOT NULL DEFAULT false,
  import_batch_id uuid,
  legacy_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (organization_id, code)
);

CREATE INDEX vehicle_cleanings_org_date_idx ON public.vehicle_cleanings (organization_id, performed_at DESC);
CREATE INDEX vehicle_cleanings_vehicle_idx ON public.vehicle_cleanings (vehicle_id, performed_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.vehicle_cleanings TO authenticated;
GRANT ALL ON public.vehicle_cleanings TO service_role;
ALTER TABLE public.vehicle_cleanings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_cleanings_select" ON public.vehicle_cleanings FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "vehicle_cleanings_insert" ON public.vehicle_cleanings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "vehicle_cleanings_update" ON public.vehicle_cleanings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

-- validações do módulo
CREATE OR REPLACE FUNCTION public.guard_vehicle_cleaning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v record; bad integer;
BEGIN
  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF NOT FOUND OR v.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Veículo pertence a outro órgão';
  END IF;
  IF NEW.unit_id IS NULL THEN NEW.unit_id := v.unit_id; END IF;

  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.suppliers s WHERE s.id = NEW.supplier_id AND s.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Fornecedor pertence a outro órgão';
  END IF;

  IF array_length(NEW.service_type_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe ao menos um tipo de serviço de limpeza.';
  END IF;

  SELECT count(*) INTO bad
    FROM unnest(NEW.service_type_ids) AS t(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.cleaning_types c
      WHERE c.id = t.id AND c.organization_id = NEW.organization_id);
  IF bad > 0 THEN
    RAISE EXCEPTION 'Tipo de limpeza inválido para este órgão.';
  END IF;

  SELECT array_agg(c.name ORDER BY c.sort_order, c.name) INTO NEW.service_types
    FROM public.cleaning_types c WHERE c.id = ANY (NEW.service_type_ids);

  IF NEW.status <> 'cancelada' AND NEW.odometer_km IS NOT NULL
     AND v.current_km IS NOT NULL AND NEW.odometer_km < v.current_km THEN
    RAISE EXCEPTION 'KM da limpeza (%) é menor que o KM atual do veículo (%).', NEW.odometer_km, v.current_km;
  END IF;

  IF NEW.status = 'cancelada' AND COALESCE(btrim(NEW.cancel_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento da limpeza.';
  END IF;

  IF COALESCE(NEW.total_value, 0) < 0 THEN
    RAISE EXCEPTION 'O valor da limpeza não pode ser negativo.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_vehicle_cleaning() FROM PUBLIC, anon, authenticated;

-- consumo/estorno de saldo
CREATE OR REPLACE FUNCTION public.apply_cleaning_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE tot numeric;
BEGIN
  tot := COALESCE(NEW.total_value, 0);

  IF NEW.status = 'realizada' AND NOT NEW.budget_consumed
     AND (NEW.commitment_id IS NOT NULL OR NEW.quota_id IS NOT NULL OR NEW.contract_item_id IS NOT NULL)
     AND tot > 0 THEN
    PERFORM public.budget_consume(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id, 0, tot, false);
    INSERT INTO public.budget_movements (organization_id, kind, contract_item_id, commitment_id, quota_id,
                                         cost_center_id, quantity, value, reason, created_by)
    VALUES (NEW.organization_id, 'consumo', NEW.contract_item_id, NEW.commitment_id, NEW.quota_id,
            NEW.cost_center_id, 0, tot, 'Limpeza ' || COALESCE(NEW.code,''), auth.uid());
    UPDATE public.vehicle_cleanings SET budget_consumed = true WHERE id = NEW.id;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelada' AND OLD.status = 'realizada' AND OLD.budget_consumed THEN
    PERFORM public.budget_refund(NEW.organization_id, OLD.contract_item_id, OLD.commitment_id, OLD.quota_id, 0, COALESCE(OLD.total_value,0));
    INSERT INTO public.budget_movements (organization_id, kind, contract_item_id, commitment_id, quota_id,
                                         cost_center_id, quantity, value, reason, created_by)
    VALUES (NEW.organization_id, 'estorno', OLD.contract_item_id, OLD.commitment_id, OLD.quota_id,
            NEW.cost_center_id, 0, COALESCE(OLD.total_value,0), 'Cancelamento da limpeza ' || COALESCE(NEW.code,''), auth.uid());
    UPDATE public.vehicle_cleanings SET budget_consumed = false WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_cleaning_budget() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_cleaning_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'realizada' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'realizada')
     AND NEW.odometer_km IS NOT NULL THEN
    UPDATE public.vehicles
       SET current_km = GREATEST(COALESCE(current_km,0), NEW.odometer_km), updated_at = now()
     WHERE id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_cleaning_completion() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_cleanings_code BEFORE INSERT ON public.vehicle_cleanings
FOR EACH ROW EXECUTE FUNCTION public.set_maintenance_code('vehicle_cleaning', 'LIMP');

CREATE TRIGGER trg_cleanings_guard BEFORE INSERT OR UPDATE ON public.vehicle_cleanings
FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_cleaning();

CREATE TRIGGER trg_cleanings_same_org BEFORE INSERT OR UPDATE ON public.vehicle_cleanings
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();

CREATE TRIGGER trg_cleanings_lock BEFORE INSERT OR UPDATE ON public.vehicle_cleanings
FOR EACH ROW EXECUTE FUNCTION public.guard_closed_competence('performed_at');

CREATE TRIGGER trg_cleanings_updated BEFORE UPDATE ON public.vehicle_cleanings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_cleanings_budget AFTER INSERT OR UPDATE ON public.vehicle_cleanings
FOR EACH ROW EXECUTE FUNCTION public.apply_cleaning_budget();

CREATE TRIGGER trg_cleanings_completion AFTER INSERT OR UPDATE ON public.vehicle_cleanings
FOR EACH ROW EXECUTE FUNCTION public.apply_cleaning_completion();

CREATE TRIGGER trg_audit_cleanings AFTER INSERT OR UPDATE ON public.vehicle_cleanings
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- tipos padrão para órgãos existentes e novos
CREATE OR REPLACE FUNCTION public.seed_cleaning_types(_org uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.cleaning_types (organization_id, name, description, sort_order)
  SELECT _org, t.name, t.descr, t.ord
    FROM (VALUES
      ('Lavagem simples', 'Lavagem externa do veículo', 10),
      ('Lavagem completa', 'Lavagem externa e interna', 20),
      ('Higienização interna', 'Higienização de bancos, forros e carpetes', 30),
      ('Polimento e enceramento', 'Polimento da pintura e enceramento', 40),
      ('Higienização de ar-condicionado', 'Limpeza e higienização do sistema de climatização', 50),
      ('Lavagem de motor', 'Limpeza técnica do compartimento do motor', 60)
    ) AS t(name, descr, ord)
  ON CONFLICT (organization_id, name) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.seed_cleaning_types(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_cleaning_types(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.seed_cleaning_types_for_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_cleaning_types(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_cleaning_types_for_new_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_cleaning_types ON public.organizations;
CREATE TRIGGER trg_org_cleaning_types AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.seed_cleaning_types_for_new_org();

DO $$ DECLARE o record; BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_cleaning_types(o.id);
  END LOOP;
END $$;

-- ============ 3) Importação de limpezas ============
CREATE OR REPLACE FUNCTION public.commit_import_batch_v3(_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.import_batches;
  r public.import_rows;
  d jsonb;
  n_new integer := 0;
  n_skip integer := 0;
  new_id uuid;
  v_unit uuid; v_vehicle uuid; v_supplier uuid; v_contract uuid; v_cc uuid;
  legacy text;
  v_types uuid[];
BEGIN
  SELECT * INTO b FROM public.import_batches WHERE id = _batch;
  IF b IS NULL THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF b.module <> 'limpeza' THEN RETURN public.commit_import_batch_v2(_batch); END IF;

  IF b.organization_id IS DISTINCT FROM public.active_org_id() THEN
    RAISE EXCEPTION 'Lote pertence a outro órgão';
  END IF;
  IF NOT public.can_manage_users() THEN
    RAISE EXCEPTION 'Sem permissão para importar dados neste órgão';
  END IF;
  IF b.status <> 'pronto' THEN
    RAISE EXCEPTION 'O lote precisa estar validado e sem erros bloqueantes (situação atual: %).', b.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.import_rows WHERE batch_id = _batch AND status = 'erro') THEN
    RAISE EXCEPTION 'Existem linhas com erro no lote. Corrija o arquivo e valide novamente.';
  END IF;

  legacy := COALESCE(NULLIF(btrim(b.source_system), ''), 'Migração legada');
  UPDATE public.import_batches SET status = 'importando' WHERE id = _batch;

  FOR r IN SELECT * FROM public.import_rows
            WHERE batch_id = _batch AND imported = false AND status IN ('valido','aviso','duplicado')
            ORDER BY row_number
  LOOP
    d := r.normalized;
    IF r.status = 'duplicado' AND b.duplicate_strategy <> 'rejeitar' THEN
      n_skip := n_skip + 1; CONTINUE;
    END IF;

    v_unit     := public.import_ref_unit(b.organization_id, d->>'_unit');
    v_vehicle  := public.import_ref_vehicle(b.organization_id, d->>'_vehicle');
    v_supplier := public.import_ref_supplier(b.organization_id, d->>'_supplier');
    v_contract := public.import_ref_contract(b.organization_id, d->>'_contract');
    v_cc       := public.import_ref_cost_center(b.organization_id, d->>'_cost_center');

    SELECT COALESCE(array_agg(c.id), '{}') INTO v_types
      FROM unnest(string_to_array(COALESCE(d->>'service_types',''), ';')) AS n(nome)
      JOIN public.cleaning_types c
        ON c.organization_id = b.organization_id
       AND lower(btrim(c.name)) = lower(btrim(n.nome));

    IF array_length(v_types, 1) IS NULL THEN
      SELECT array_agg(id) INTO v_types FROM (
        SELECT id FROM public.cleaning_types
         WHERE organization_id = b.organization_id AND name = 'Lavagem simples' LIMIT 1) s;
    END IF;

    INSERT INTO public.vehicle_cleanings (organization_id, vehicle_id, unit_id, performed_at, odometer_km,
                                          service_type_ids, supplier_id, contract_id, cost_center_id,
                                          total_value, invoice_number, notes, status, created_by,
                                          import_batch_id, legacy_source)
    VALUES (b.organization_id, v_vehicle, v_unit,
            COALESCE(NULLIF(d->>'performed_at','')::timestamptz, now()),
            NULLIF(d->>'odometer_km','')::numeric,
            v_types, v_supplier, v_contract, v_cc,
            COALESCE(NULLIF(d->>'total_value','')::numeric, 0),
            NULLIF(d->>'invoice_number',''), NULLIF(d->>'notes',''),
            COALESCE(NULLIF(d->>'status','')::public.cleaning_status, 'realizada'),
            auth.uid(), _batch, legacy)
    RETURNING id INTO new_id;

    UPDATE public.import_rows SET imported = true, created_record_id = new_id WHERE id = r.id;
    n_new := n_new + 1;
  END LOOP;

  UPDATE public.import_batches
     SET status = 'importado', imported_at = now(), imported_count = n_new, skipped_count = n_skip
   WHERE id = _batch;

  RETURN jsonb_build_object('inserted', n_new, 'skipped', n_skip);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_import_batch_v3(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_import_batch_v3(uuid) TO authenticated, service_role;