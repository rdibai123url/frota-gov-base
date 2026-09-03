-- ============================ DIÁRIAS ============================
DO $$ BEGIN
  CREATE TYPE public.diary_status AS ENUM (
    'rascunho','solicitada','em_analise','autorizada','paga','viagem_realizada',
    'aguardando_comprovacao','comprovada','rejeitada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.diary_proof_status AS ENUM (
    'em_elaboracao','entregue','em_conferencia','aprovada','rejeitada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  exercise integer NOT NULL DEFAULT EXTRACT(YEAR FROM current_date)::int,
  unit_id uuid REFERENCES public.units(id),
  requester_name text,
  requester_id uuid,
  beneficiary_driver_id uuid REFERENCES public.drivers(id),
  beneficiary_name text NOT NULL,
  beneficiary_role text,
  beneficiary_cpf text,
  vehicle_id uuid REFERENCES public.vehicles(id),
  usage_id uuid REFERENCES public.vehicle_usages(id),
  origin_city text,
  origin_state text,
  destination_city text NOT NULL,
  destination_state text,
  departure_at timestamptz NOT NULL,
  return_at timestamptz,
  quantity numeric NOT NULL DEFAULT 1,
  unit_value numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  purpose text NOT NULL,
  event_name text,
  event_location text,
  legal_basis text,
  application_period text,
  notes text,
  attachment_paths text[] NOT NULL DEFAULT '{}',
  cost_center_id uuid REFERENCES public.cost_centers(id),
  commitment_id uuid REFERENCES public.commitments(id),
  budget_note text,
  status public.diary_status NOT NULL DEFAULT 'rascunho',
  requested_at timestamptz,
  authorized_by uuid,
  authorized_by_name text,
  authorized_at timestamptz,
  paid_at timestamptz,
  closed_by uuid,
  closed_by_name text,
  closed_at timestamptz,
  reject_reason text,
  cancel_reason text,
  import_batch_id uuid,
  legacy_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diaries TO authenticated;
GRANT ALL ON public.diaries TO service_role;
ALTER TABLE public.diaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read diaries" ON public.diaries FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "insert diaries" ON public.diaries FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage());
CREATE POLICY "update diaries" ON public.diaries FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_operate_usage())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage());

CREATE TABLE IF NOT EXISTS public.diary_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  diary_id uuid NOT NULL REFERENCES public.diaries(id) ON DELETE CASCADE,
  code text,
  exercise integer NOT NULL DEFAULT EXTRACT(YEAR FROM current_date)::int,
  beneficiary_name text,
  beneficiary_role text,
  beneficiary_cpf text,
  actual_departure_at timestamptz,
  actual_return_at timestamptz,
  received_quantity numeric NOT NULL DEFAULT 0,
  received_unit_value numeric NOT NULL DEFAULT 0,
  received_total numeric NOT NULL DEFAULT 0,
  used_quantity numeric NOT NULL DEFAULT 0,
  used_total numeric NOT NULL DEFAULT 0,
  balance_value numeric NOT NULL DEFAULT 0,
  purpose text,
  purpose_complement text,
  activity_report text,
  attachment_paths text[] NOT NULL DEFAULT '{}',
  settlement_date date,
  reviewer_name text,
  reviewer_id uuid,
  reviewed_at timestamptz,
  restitution_resolved boolean NOT NULL DEFAULT false,
  restitution_note text,
  status public.diary_proof_status NOT NULL DEFAULT 'em_elaboracao',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diary_proofs TO authenticated;
GRANT ALL ON public.diary_proofs TO service_role;
ALTER TABLE public.diary_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read diary proofs" ON public.diary_proofs FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "insert diary proofs" ON public.diary_proofs FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage());
CREATE POLICY "update diary proofs" ON public.diary_proofs FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_operate_usage())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage());

CREATE INDEX IF NOT EXISTS idx_diaries_org_departure ON public.diaries (organization_id, departure_at DESC);
CREATE INDEX IF NOT EXISTS idx_diaries_vehicle ON public.diaries (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_diaries_driver ON public.diaries (beneficiary_driver_id);
CREATE INDEX IF NOT EXISTS idx_diary_proofs_diary ON public.diary_proofs (diary_id);

-- código automático RD/CD e cálculos
CREATE OR REPLACE FUNCTION public.set_diary_code() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'diaries' THEN
    IF NEW.code IS NULL OR NEW.code = '' THEN
      NEW.code := public.next_org_code(NEW.organization_id, 'diary', 'RD');
    END IF;
    NEW.total_value := ROUND(COALESCE(NEW.quantity,0) * COALESCE(NEW.unit_value,0), 2);
    IF NEW.exercise IS NULL THEN
      NEW.exercise := EXTRACT(YEAR FROM COALESCE(NEW.departure_at, now()))::int;
    END IF;
  ELSE
    IF NEW.code IS NULL OR NEW.code = '' THEN
      NEW.code := public.next_org_code(NEW.organization_id, 'diary_proof', 'CD');
    END IF;
    NEW.received_total := ROUND(COALESCE(NEW.received_quantity,0) * COALESCE(NEW.received_unit_value,0), 2);
    NEW.used_total := ROUND(COALESCE(NEW.used_total,0), 2);
    NEW.balance_value := ROUND(COALESCE(NEW.received_total,0) - COALESCE(NEW.used_total,0), 2);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_diary_proof() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.diaries;
BEGIN
  SELECT * INTO d FROM public.diaries WHERE id = NEW.diary_id;
  IF d IS NULL THEN RAISE EXCEPTION 'Comprovação precisa estar vinculada a uma requisição de diária'; END IF;
  IF d.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Requisição de diária pertence a outro órgão';
  END IF;
  IF NEW.status IN ('entregue','em_conferencia','aprovada') THEN
    IF COALESCE(btrim(NEW.activity_report), '') = '' THEN
      RAISE EXCEPTION 'Informe o relatório de atividades antes de encerrar a comprovação';
    END IF;
  END IF;
  IF NEW.status = 'aprovada' AND NEW.balance_value > 0 AND NOT NEW.restitution_resolved THEN
    RAISE EXCEPTION 'Existe saldo a restituir não resolvido. Registre a devolução antes de encerrar.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER set_code_diaries BEFORE INSERT OR UPDATE ON public.diaries
  FOR EACH ROW EXECUTE FUNCTION public.set_diary_code();
CREATE TRIGGER set_code_diary_proofs BEFORE INSERT OR UPDATE ON public.diary_proofs
  FOR EACH ROW EXECUTE FUNCTION public.set_diary_code();
CREATE TRIGGER guard_diary_proofs BEFORE INSERT OR UPDATE ON public.diary_proofs
  FOR EACH ROW EXECUTE FUNCTION public.guard_diary_proof();
CREATE TRIGGER guard_refs_diaries BEFORE INSERT OR UPDATE ON public.diaries
  FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();
CREATE TRIGGER touch_diaries BEFORE UPDATE ON public.diaries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_diary_proofs BEFORE UPDATE ON public.diary_proofs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_diaries AFTER INSERT OR UPDATE ON public.diaries
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_diary_proofs AFTER INSERT OR UPDATE ON public.diary_proofs
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_lock_diaries BEFORE INSERT OR UPDATE OR DELETE ON public.diaries
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_competence('departure_at');

-- ==================== MIGRAÇÃO POR TIPO INDIVIDUAL ====================
ALTER TABLE public.accidents ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.accidents ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.parts_catalog ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.parts_catalog ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.tires ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.tires ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.maintenance_plans ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.quotas ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.quotas ADD COLUMN IF NOT EXISTS legacy_source text;

CREATE OR REPLACE FUNCTION public.commit_import_batch_v2(_batch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.import_batches;
  r public.import_rows;
  d jsonb;
  n_new integer := 0;
  n_skip integer := 0;
  new_id uuid;
  v_unit uuid; v_vehicle uuid; v_supplier uuid; v_driver uuid; v_contract uuid; v_cc uuid;
  legacy text;
BEGIN
  SELECT * INTO b FROM public.import_batches WHERE id = _batch;
  IF b IS NULL THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;

  -- módulos já suportados pela rotina original
  IF b.module NOT IN ('diarias','acidentes','rede_credenciada','pecas','pneus','planos','cotas') THEN
    RETURN public.commit_import_batch(_batch);
  END IF;

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
    v_driver   := public.import_ref_driver(b.organization_id, d->>'_driver');
    v_contract := public.import_ref_contract(b.organization_id, d->>'_contract');
    v_cc       := public.import_ref_cost_center(b.organization_id, d->>'_cost_center');
    new_id := NULL;

    CASE b.module
      WHEN 'diarias' THEN
        INSERT INTO public.diaries (organization_id, unit_id, vehicle_id, beneficiary_driver_id, beneficiary_name,
                                    beneficiary_role, beneficiary_cpf, requester_name, origin_city, origin_state,
                                    destination_city, destination_state, departure_at, return_at, quantity,
                                    unit_value, purpose, event_name, event_location, legal_basis, notes,
                                    cost_center_id, status, exercise, created_by, import_batch_id, legacy_source)
        VALUES (b.organization_id, v_unit, v_vehicle, v_driver,
                COALESCE(NULLIF(d->>'beneficiary_name',''), 'Beneficiário não informado'),
                NULLIF(d->>'beneficiary_role',''),
                NULLIF(regexp_replace(COALESCE(d->>'beneficiary_cpf',''), '\D', '', 'g'), ''),
                NULLIF(d->>'requester_name',''), NULLIF(d->>'origin_city',''), NULLIF(d->>'origin_state',''),
                COALESCE(NULLIF(d->>'destination_city',''), 'Não informado'), NULLIF(d->>'destination_state',''),
                (d->>'departure_at')::timestamptz, NULLIF(d->>'return_at','')::timestamptz,
                COALESCE(NULLIF(d->>'quantity','')::numeric, 1),
                COALESCE(NULLIF(d->>'unit_value','')::numeric, 0),
                COALESCE(NULLIF(d->>'purpose',''), 'Migração de dados legados'),
                NULLIF(d->>'event_name',''), NULLIF(d->>'event_location',''), NULLIF(d->>'legal_basis',''),
                NULLIF(d->>'notes',''), v_cc,
                COALESCE(NULLIF(d->>'status','')::diary_status, 'comprovada'),
                EXTRACT(YEAR FROM (d->>'departure_at')::timestamptz)::int,
                auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'acidentes' THEN
        INSERT INTO public.accidents (organization_id, vehicle_id, unit_id, driver_id, kind, occurred_at, location,
                                      description, third_parties, police_report_number, damages, deductible_value,
                                      expenses_value, status, reporter_name, notes, created_by,
                                      import_batch_id, legacy_source)
        VALUES (b.organization_id, v_vehicle, v_unit, v_driver,
                COALESCE(NULLIF(d->>'kind','')::accident_kind, 'colisao'),
                (d->>'occurred_at')::timestamptz, NULLIF(d->>'location',''),
                COALESCE(NULLIF(d->>'description',''), 'Sinistro migrado do sistema anterior'),
                NULLIF(d->>'third_parties',''), NULLIF(d->>'police_report_number',''), NULLIF(d->>'damages',''),
                NULLIF(d->>'deductible_value','')::numeric, NULLIF(d->>'expenses_value','')::numeric,
                COALESCE(NULLIF(d->>'status','')::accident_status, 'registrado'),
                NULLIF(d->>'reporter_name',''), NULLIF(d->>'notes',''), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'rede_credenciada' THEN
        INSERT INTO public.workshops (organization_id, legal_name, trade_name, cnpj, address, city, state, zip_code,
                                      phone, email, contact_name, specialties, coverage_area, notes, status,
                                      created_by, import_batch_id, legacy_source)
        VALUES (b.organization_id, d->>'legal_name', NULLIF(d->>'trade_name',''),
                NULLIF(regexp_replace(COALESCE(d->>'cnpj',''), '\D', '', 'g'), ''),
                NULLIF(d->>'address',''), NULLIF(d->>'city',''), NULLIF(d->>'state',''), NULLIF(d->>'zip_code',''),
                NULLIF(d->>'phone',''), NULLIF(d->>'email',''), NULLIF(d->>'contact_name',''),
                CASE WHEN COALESCE(d->>'specialties','') = '' THEN NULL
                     ELSE string_to_array(d->>'specialties', ',') END,
                NULLIF(d->>'coverage_area',''), NULLIF(d->>'notes',''),
                COALESCE(NULLIF(d->>'status','')::workshop_status, 'ativa'),
                auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'pecas' THEN
        INSERT INTO public.parts_catalog (organization_id, internal_code, description, brand, reference,
                                          measure_unit, category, active, notes, created_by,
                                          import_batch_id, legacy_source)
        VALUES (b.organization_id, NULLIF(d->>'internal_code',''), d->>'description', NULLIF(d->>'brand',''),
                NULLIF(d->>'reference',''), COALESCE(NULLIF(d->>'measure_unit',''), 'unidade'),
                NULLIF(d->>'category',''), true, NULLIF(d->>'notes',''), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'pneus' THEN
        INSERT INTO public.tires (organization_id, code, brand, model, size, dot, serial_number, purchase_value,
                                  purchase_date, supplier_id, expected_life_km, accumulated_km, status,
                                  vehicle_id, position, install_km, install_date, notes, created_by,
                                  import_batch_id, legacy_source)
        VALUES (b.organization_id, d->>'code', NULLIF(d->>'brand',''), NULLIF(d->>'model',''),
                NULLIF(d->>'size',''), NULLIF(d->>'dot',''), NULLIF(d->>'serial_number',''),
                NULLIF(d->>'purchase_value','')::numeric, NULLIF(d->>'purchase_date','')::date, v_supplier,
                NULLIF(d->>'expected_life_km','')::numeric,
                COALESCE(NULLIF(d->>'accumulated_km','')::numeric, 0),
                COALESCE(NULLIF(d->>'status','')::tire_status, 'estoque'),
                v_vehicle, NULLIF(d->>'position',''), NULLIF(d->>'install_km','')::numeric,
                NULLIF(d->>'install_date','')::date, NULLIF(d->>'notes',''), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'planos' THEN
        INSERT INTO public.maintenance_plans (organization_id, name, description, service_type, vehicle_id,
                                              vehicle_type, interval_km, interval_hours, interval_months,
                                              tolerance_km, tolerance_days, last_done_at, last_done_km,
                                              active, notes, created_by, import_batch_id, legacy_source)
        VALUES (b.organization_id, d->>'name', NULLIF(d->>'description',''), NULLIF(d->>'service_type',''),
                v_vehicle, NULLIF(d->>'vehicle_type',''), NULLIF(d->>'interval_km','')::numeric,
                NULLIF(d->>'interval_hours','')::numeric, NULLIF(d->>'interval_months','')::int,
                NULLIF(d->>'tolerance_km','')::numeric, NULLIF(d->>'tolerance_days','')::int,
                NULLIF(d->>'last_done_at','')::date, NULLIF(d->>'last_done_km','')::numeric,
                true, NULLIF(d->>'notes',''), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      WHEN 'cotas' THEN
        INSERT INTO public.quotas (organization_id, name, quota_type, measure_unit, contract_id, cost_center_id,
                                   unit_id, valid_from, valid_to, granted_amount, active, notes, created_by,
                                   import_batch_id, legacy_source)
        VALUES (b.organization_id, d->>'name',
                COALESCE(NULLIF(d->>'quota_type','')::quota_type, 'valor'),
                NULLIF(d->>'measure_unit',''), v_contract, v_cc, v_unit,
                NULLIF(d->>'valid_from','')::date, NULLIF(d->>'valid_to','')::date,
                COALESCE(NULLIF(d->>'granted_amount','')::numeric, 0), true,
                NULLIF(d->>'notes',''), auth.uid(), _batch, legacy)
        RETURNING id INTO new_id;

      ELSE
        RAISE EXCEPTION 'Módulo de importação desconhecido: %', b.module;
    END CASE;

    UPDATE public.import_rows SET imported = true, target_id = new_id WHERE id = r.id;
    n_new := n_new + 1;
  END LOOP;

  UPDATE public.import_batches
     SET status = 'concluido', imported_rows = n_new, completed_at = now(),
         result = jsonb_build_object('criados', n_new, 'atualizados', 0, 'ignorados', n_skip,
                                     'modulo', b.module, 'origem', legacy)
   WHERE id = _batch;

  PERFORM public.log_event('import.commit', 'Implantação', 'Migração de dados', '/migracao',
                           'import_batches', _batch, 'importar',
                           'Lote ' || b.module || ' importado: ' || n_new || ' registro(s)',
                           NULL, jsonb_build_object('criados', n_new, 'ignorados', n_skip));

  RETURN jsonb_build_object('criados', n_new, 'atualizados', 0, 'ignorados', n_skip);
END; $$;
REVOKE ALL ON FUNCTION public.commit_import_batch_v2(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.commit_import_batch_v2(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.annul_import_batch(_batch uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.import_batches; affected integer := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente o Super Admin da plataforma pode anular um lote concluído';
  END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'Informe a justificativa da anulação';
  END IF;
  SELECT * INTO b FROM public.import_batches WHERE id = _batch FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF b.status <> 'concluido' THEN RAISE EXCEPTION 'Somente lotes concluídos podem ser anulados'; END IF;

  UPDATE public.fuelings SET status = 'cancelado', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelado';
  UPDATE public.vehicle_usages SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.maintenance_records SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.traffic_fines SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.insurance_policies SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.vehicle_obligations SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.diaries SET status = 'cancelada', cancel_reason = 'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'cancelada';
  UPDATE public.accidents SET status = 'encerrado', notes = COALESCE(notes || ' | ', '') ||
         'Lote de migração anulado: ' || _reason
   WHERE import_batch_id = _batch AND status <> 'encerrado';
  UPDATE public.units SET active = false WHERE import_batch_id = _batch;
  UPDATE public.drivers SET active = false WHERE import_batch_id = _batch;
  UPDATE public.suppliers SET active = false WHERE import_batch_id = _batch;
  UPDATE public.fuel_types SET active = false WHERE import_batch_id = _batch;
  UPDATE public.cost_centers SET active = false WHERE import_batch_id = _batch;
  UPDATE public.external_entities SET active = false WHERE import_batch_id = _batch;
  UPDATE public.parts_catalog SET active = false WHERE import_batch_id = _batch;
  UPDATE public.maintenance_plans SET active = false WHERE import_batch_id = _batch;
  UPDATE public.quotas SET active = false WHERE import_batch_id = _batch;
  UPDATE public.workshops SET status = 'inativa' WHERE import_batch_id = _batch AND status <> 'inativa';
  UPDATE public.tires SET status = 'descartado' WHERE import_batch_id = _batch AND status <> 'descartado';
  UPDATE public.vehicles SET status = 'inativo' WHERE import_batch_id = _batch AND status <> 'baixado';
  UPDATE public.contracts SET status = 'encerrado' WHERE import_batch_id = _batch;
  UPDATE public.commitments SET status = 'anulado' WHERE import_batch_id = _batch;

  SELECT count(*) INTO affected FROM public.import_rows WHERE batch_id = _batch AND imported;

  UPDATE public.import_batches
     SET status = 'anulado', annulled_at = now(), annulled_by = auth.uid(), annul_reason = _reason
   WHERE id = _batch;

  PERFORM public.log_event('import.annul', 'Implantação', 'Migração de dados', '/migracao',
                           'import_batches', _batch, 'anular',
                           'Lote ' || b.module || ' anulado', NULL,
                           jsonb_build_object('motivo', _reason, 'registros', affected));

  RETURN jsonb_build_object('registros', affected);
END; $$;
REVOKE ALL ON FUNCTION public.annul_import_batch(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.annul_import_batch(uuid, text) TO authenticated;