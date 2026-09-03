
-- ============================ 1. LOTES DE IMPORTAÇÃO ============================
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','em_validacao','com_erros','pronto','importando','concluido','cancelado','anulado')),
  file_name text,
  file_type text,
  source_system text,
  notes text,
  duplicate_strategy text NOT NULL DEFAULT 'ignorar'
    CHECK (duplicate_strategy IN ('ignorar','atualizar','rejeitar')),
  create_missing boolean NOT NULL DEFAULT false,
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  warning_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  result jsonb,
  cancel_reason text,
  annulled_at timestamptz,
  annulled_by uuid,
  annul_reason text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_batches_select_org" ON public.import_batches FOR SELECT TO authenticated
  USING (organization_id = public.active_org_id());
CREATE POLICY "import_batches_insert_org" ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.active_org_id() AND public.can_manage_users());
CREATE POLICY "import_batches_update_org" ON public.import_batches FOR UPDATE TO authenticated
  USING (organization_id = public.active_org_id() AND public.can_manage_users())
  WITH CHECK (organization_id = public.active_org_id() AND public.can_manage_users());

CREATE INDEX idx_import_batches_org ON public.import_batches (organization_id, created_at DESC);

-- ============================== 2. LINHAS DO LOTE ==============================
CREATE TABLE public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'valido' CHECK (status IN ('valido','aviso','erro','duplicado')),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  duplicate_of uuid,
  target_id uuid,
  imported boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_rows_select_org" ON public.import_rows FOR SELECT TO authenticated
  USING (organization_id = public.active_org_id());
CREATE POLICY "import_rows_write_org" ON public.import_rows FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.active_org_id() AND public.can_manage_users());
CREATE POLICY "import_rows_update_org" ON public.import_rows FOR UPDATE TO authenticated
  USING (organization_id = public.active_org_id() AND public.can_manage_users())
  WITH CHECK (organization_id = public.active_org_id() AND public.can_manage_users());
-- Linhas de simulação podem ser descartadas enquanto o lote não foi importado.
CREATE POLICY "import_rows_delete_draft" ON public.import_rows FOR DELETE TO authenticated
  USING (organization_id = public.active_org_id() AND public.can_manage_users()
         AND EXISTS (SELECT 1 FROM public.import_batches b
                      WHERE b.id = batch_id AND b.status NOT IN ('concluido','anulado')));

CREATE INDEX idx_import_rows_batch ON public.import_rows (batch_id, row_number);

-- ========================= 3. SALDOS / POSIÇÃO DE ABERTURA =====================
CREATE TABLE public.opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('contrato','empenho','cota','veiculo_km','pneu')),
  reference_id uuid,
  reference_label text NOT NULL,
  base_date date NOT NULL,
  value numeric(14,2),
  quantity numeric(14,4),
  justification text NOT NULL,
  batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  applied_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.opening_balances TO authenticated;
GRANT ALL ON public.opening_balances TO service_role;
ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opening_balances_select_org" ON public.opening_balances FOR SELECT TO authenticated
  USING (organization_id = public.active_org_id());
CREATE POLICY "opening_balances_insert_org" ON public.opening_balances FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.active_org_id() AND public.can_manage_finance());
CREATE POLICY "opening_balances_update_org" ON public.opening_balances FOR UPDATE TO authenticated
  USING (organization_id = public.active_org_id() AND public.can_manage_finance())
  WITH CHECK (organization_id = public.active_org_id() AND public.can_manage_finance());

CREATE TRIGGER trg_opening_balances_touch BEFORE UPDATE ON public.opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_import_batches_touch BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===================== 4. RASTREABILIDADE NAS TABELAS DE DESTINO ================
ALTER TABLE public.units             ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.vehicles          ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.drivers           ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.suppliers         ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.fuel_types        ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.cost_centers      ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.contracts         ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.commitments       ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.external_entities ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE public.fuelings            ADD COLUMN IF NOT EXISTS import_batch_id uuid,
                                       ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.vehicle_usages      ADD COLUMN IF NOT EXISTS import_batch_id uuid,
                                       ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.maintenance_records ADD COLUMN IF NOT EXISTS import_batch_id uuid,
                                       ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.traffic_fines       ADD COLUMN IF NOT EXISTS import_batch_id uuid,
                                       ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.insurance_policies  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
                                       ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.vehicle_obligations ADD COLUMN IF NOT EXISTS import_batch_id uuid,
                                       ADD COLUMN IF NOT EXISTS legacy_source text;
ALTER TABLE public.asset_movements     ADD COLUMN IF NOT EXISTS import_batch_id uuid,
                                       ADD COLUMN IF NOT EXISTS legacy_source text;

-- Abastecimento legado não é operação corrente: não passa pelo teto de consumo atual.
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
  ELSIF NEW.legacy_source IS NOT NULL OR NEW.import_batch_id IS NOT NULL THEN
    IF COALESCE(btrim(NEW.without_authorization_reason), '') = '' THEN
      NEW.without_authorization_reason :=
        'Migração de histórico legado (' || COALESCE(NEW.legacy_source, 'sistema anterior') || ')';
    END IF;
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
REVOKE ALL ON FUNCTION public.guard_fueling_authorization() FROM public, anon, authenticated;
