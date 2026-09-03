-- ===================== FASE 4 — CONTRATOS / EMPENHOS / CENTROS DE CUSTO / COTAS =====================

CREATE TYPE public.contract_modality AS ENUM ('pregao','concorrencia','dispensa','inexigibilidade','adesao_ata','contratacao_direta','outro');
CREATE TYPE public.contract_status AS ENUM ('rascunho','vigente','suspenso','encerrado','rescindido');
CREATE TYPE public.commitment_kind AS ENUM ('ordinario','estimativo','global');
CREATE TYPE public.commitment_status AS ENUM ('ativo','esgotado','anulado','encerrado');
CREATE TYPE public.quota_type AS ENUM ('financeira','quantitativa');
CREATE TYPE public.expense_origin AS ENUM ('contrato','compra_direta','convenio','doacao','almoxarifado','recurso_proprio');
CREATE TYPE public.budget_movement_kind AS ENUM ('reserva','liberacao','consumo','estorno','suplementacao');

-- ------------------------------------------------------------------ permissões
CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin','org_admin','fleet_manager'));
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_finance() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_manage_finance() TO authenticated, service_role;

-- ------------------------------------------------------------------ centros de custo
CREATE TABLE public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read cost_centers in org" ON public.cost_centers FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert cost_centers in org" ON public.cost_centers FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "update cost_centers in org" ON public.cost_centers FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_finance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "delete cost_centers in org" ON public.cost_centers FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users());

-- ------------------------------------------------------------------ contratos
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  number text NOT NULL,
  process_number text,
  modality public.contract_modality NOT NULL DEFAULT 'pregao',
  object text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  cnpj text,
  signed_at date,
  valid_from date,
  valid_to date,
  initial_value numeric(16,2) NOT NULL DEFAULT 0,
  current_value numeric(16,2) NOT NULL DEFAULT 0,
  status public.contract_status NOT NULL DEFAULT 'rascunho',
  allows_amendment boolean NOT NULL DEFAULT true,
  amendment_count integer NOT NULL DEFAULT 0,
  notes text,
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read contracts in org" ON public.contracts FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert contracts in org" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "update contracts in org" ON public.contracts FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_finance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
-- ------------------------------------------------------------------ itens do contrato
CREATE TABLE public.contract_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  item_code text,
  description text NOT NULL,
  fuel_type_id uuid REFERENCES public.fuel_types(id) ON DELETE SET NULL,
  material_kind text NOT NULL DEFAULT 'combustivel',
  measure_unit text NOT NULL DEFAULT 'litro',
  quantity numeric(16,3) NOT NULL DEFAULT 0,
  unit_price numeric(16,4) NOT NULL DEFAULT 0,
  total_value numeric(18,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  reserved_quantity numeric(16,3) NOT NULL DEFAULT 0,
  consumed_quantity numeric(16,3) NOT NULL DEFAULT 0,
  reserved_value numeric(18,2) NOT NULL DEFAULT 0,
  consumed_value numeric(18,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_items TO authenticated;
GRANT ALL ON public.contract_items TO service_role;
ALTER TABLE public.contract_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read contract_items in org" ON public.contract_items FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert contract_items in org" ON public.contract_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance()
    AND EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND c.organization_id = public.current_org_id()));
CREATE POLICY "update contract_items in org" ON public.contract_items FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_finance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "delete contract_items in org" ON public.contract_items FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users()
     AND consumed_quantity = 0 AND reserved_quantity = 0 AND consumed_value = 0 AND reserved_value = 0);

CREATE POLICY "delete contracts in org" ON public.contracts FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users()
     AND NOT EXISTS (SELECT 1 FROM public.contract_items i
        WHERE i.contract_id = contracts.id AND (i.consumed_quantity > 0 OR i.reserved_quantity > 0)));

-- ------------------------------------------------------------------ empenhos
CREATE TABLE public.commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  number text NOT NULL,
  exercise integer NOT NULL DEFAULT date_part('year', now()),
  issued_at date NOT NULL DEFAULT current_date,
  kind public.commitment_kind NOT NULL DEFAULT 'estimativo',
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  budget_allocation text,
  resource_source text,
  expense_element text,
  committed_value numeric(16,2) NOT NULL DEFAULT 0,
  cancelled_value numeric(16,2) NOT NULL DEFAULT 0,
  reserved_value numeric(16,2) NOT NULL DEFAULT 0,
  consumed_value numeric(16,2) NOT NULL DEFAULT 0,
  available_value numeric(16,2) GENERATED ALWAYS AS (committed_value - cancelled_value - reserved_value - consumed_value) STORED,
  status public.commitment_status NOT NULL DEFAULT 'ativo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, number, exercise)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commitments TO authenticated;
GRANT ALL ON public.commitments TO service_role;
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read commitments in org" ON public.commitments FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert commitments in org" ON public.commitments FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "update commitments in org" ON public.commitments FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_finance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "delete commitments in org" ON public.commitments FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users()
     AND consumed_value = 0 AND reserved_value = 0);

-- ------------------------------------------------------------------ cotas
CREATE TABLE public.quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  quota_type public.quota_type NOT NULL DEFAULT 'quantitativa',
  measure_unit text NOT NULL DEFAULT 'litro',
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  contract_item_id uuid REFERENCES public.contract_items(id) ON DELETE SET NULL,
  commitment_id uuid REFERENCES public.commitments(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  granted_amount numeric(18,3) NOT NULL DEFAULT 0,
  reserved_amount numeric(18,3) NOT NULL DEFAULT 0,
  consumed_amount numeric(18,3) NOT NULL DEFAULT 0,
  balance_amount numeric(18,3) GENERATED ALWAYS AS (granted_amount - reserved_amount - consumed_amount) STORED,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotas TO authenticated;
GRANT ALL ON public.quotas TO service_role;
ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read quotas in org" ON public.quotas FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert quotas in org" ON public.quotas FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "update quotas in org" ON public.quotas FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_finance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "delete quotas in org" ON public.quotas FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users()
     AND consumed_amount = 0 AND reserved_amount = 0);

-- ------------------------------------------------------------------ suplementações de cota
CREATE TABLE public.quota_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quota_id uuid NOT NULL REFERENCES public.quotas(id) ON DELETE CASCADE,
  amount numeric(18,3) NOT NULL,
  reason text NOT NULL,
  responsible_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT ON public.quota_supplements TO authenticated;
GRANT ALL ON public.quota_supplements TO service_role;
ALTER TABLE public.quota_supplements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read quota_supplements in org" ON public.quota_supplements FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert quota_supplements in org" ON public.quota_supplements FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance()
    AND EXISTS (SELECT 1 FROM public.quotas q WHERE q.id = quota_id AND q.organization_id = public.current_org_id()));

-- ------------------------------------------------------------------ movimentos de saldo (rastreabilidade)
CREATE TABLE public.budget_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.budget_movement_kind NOT NULL,
  authorization_id uuid REFERENCES public.fuel_authorizations(id) ON DELETE SET NULL,
  fueling_id uuid REFERENCES public.fuelings(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  contract_item_id uuid REFERENCES public.contract_items(id) ON DELETE SET NULL,
  commitment_id uuid REFERENCES public.commitments(id) ON DELETE SET NULL,
  quota_id uuid REFERENCES public.quotas(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  quantity numeric(18,3) NOT NULL DEFAULT 0,
  value numeric(18,2) NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT ON public.budget_movements TO authenticated;
GRANT ALL ON public.budget_movements TO service_role;
ALTER TABLE public.budget_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read budget_movements in org" ON public.budget_movements FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));

-- ------------------------------------------------------------------ colunas de origem do recurso
ALTER TABLE public.fuel_authorizations
  ADD COLUMN expense_origin public.expense_origin NOT NULL DEFAULT 'contrato',
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN contract_item_id uuid REFERENCES public.contract_items(id) ON DELETE SET NULL,
  ADD COLUMN commitment_id uuid REFERENCES public.commitments(id) ON DELETE SET NULL,
  ADD COLUMN quota_id uuid REFERENCES public.quotas(id) ON DELETE SET NULL,
  ADD COLUMN reserved_quantity numeric(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN reserved_value numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN budget_reserved boolean NOT NULL DEFAULT false;

ALTER TABLE public.fuelings
  ADD COLUMN expense_origin public.expense_origin NOT NULL DEFAULT 'contrato',
  ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN contract_item_id uuid REFERENCES public.contract_items(id) ON DELETE SET NULL,
  ADD COLUMN commitment_id uuid REFERENCES public.commitments(id) ON DELETE SET NULL,
  ADD COLUMN quota_id uuid REFERENCES public.quotas(id) ON DELETE SET NULL;

ALTER TABLE public.fueling_alerts
  ADD COLUMN category text NOT NULL DEFAULT 'abastecimento',
  ADD COLUMN entity_type text,
  ADD COLUMN entity_id uuid;

-- ------------------------------------------------------------------ motor de saldos
CREATE OR REPLACE FUNCTION public.budget_log(
  _org uuid, _kind public.budget_movement_kind, _auth uuid, _fueling uuid,
  _item uuid, _commitment uuid, _quota uuid, _qty numeric, _val numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c uuid;
BEGIN
  SELECT contract_id INTO c FROM public.contract_items WHERE id = _item;
  INSERT INTO public.budget_movements (organization_id, kind, authorization_id, fueling_id, contract_id,
    contract_item_id, commitment_id, quota_id, quantity, value, reason, created_by)
  VALUES (_org, _kind, _auth, _fueling, c, _item, _commitment, _quota, COALESCE(_qty,0), COALESCE(_val,0), _reason, auth.uid());
END; $$;

-- reserva de saldo: bloqueia as linhas envolvidas (FOR UPDATE) evitando dupla reserva concorrente
CREATE OR REPLACE FUNCTION public.budget_reserve(
  _org uuid, _item uuid, _commitment uuid, _quota uuid, _qty numeric, _val numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it record; ct record; cm record; qt record; avail numeric; need numeric;
BEGIN
  IF _item IS NOT NULL THEN
    SELECT * INTO it FROM public.contract_items WHERE id = _item AND organization_id = _org FOR UPDATE;
    IF it IS NULL THEN RAISE EXCEPTION 'Item contratual inválido para este órgão'; END IF;
    IF NOT it.active THEN RAISE EXCEPTION 'Item contratual inativo'; END IF;
    SELECT * INTO ct FROM public.contracts WHERE id = it.contract_id;
    IF ct.status <> 'vigente' THEN RAISE EXCEPTION 'Contrato % não está vigente (%).', ct.number, ct.status; END IF;
    IF ct.valid_to IS NOT NULL AND ct.valid_to < current_date THEN
      RAISE EXCEPTION 'Contrato % com vigência encerrada em %.', ct.number, ct.valid_to; END IF;
    avail := it.quantity - it.reserved_quantity - it.consumed_quantity;
    IF _qty > avail + 0.0005 THEN
      RAISE EXCEPTION 'Saldo insuficiente no item contratual "%": disponível % %, solicitado %.',
        it.description, round(avail,3), it.measure_unit, round(_qty,3); END IF;
    avail := it.total_value - it.reserved_value - it.consumed_value;
    IF _val > avail + 0.005 THEN
      RAISE EXCEPTION 'Saldo financeiro insuficiente no item contratual "%": disponível R$ %.', it.description, round(avail,2); END IF;
    UPDATE public.contract_items
       SET reserved_quantity = reserved_quantity + _qty, reserved_value = reserved_value + _val, updated_at = now()
     WHERE id = _item;
  END IF;

  IF _commitment IS NOT NULL THEN
    SELECT * INTO cm FROM public.commitments WHERE id = _commitment AND organization_id = _org FOR UPDATE;
    IF cm IS NULL THEN RAISE EXCEPTION 'Empenho inválido para este órgão'; END IF;
    IF cm.status <> 'ativo' THEN RAISE EXCEPTION 'Empenho % não está ativo (%).', cm.number, cm.status; END IF;
    avail := cm.committed_value - cm.cancelled_value - cm.reserved_value - cm.consumed_value;
    IF _val > avail + 0.005 THEN
      RAISE EXCEPTION 'Saldo insuficiente no empenho %: disponível R$ %, solicitado R$ %.', cm.number, round(avail,2), round(_val,2); END IF;
    UPDATE public.commitments SET reserved_value = reserved_value + _val, updated_at = now() WHERE id = _commitment;
  END IF;

  IF _quota IS NOT NULL THEN
    SELECT * INTO qt FROM public.quotas WHERE id = _quota AND organization_id = _org FOR UPDATE;
    IF qt IS NULL THEN RAISE EXCEPTION 'Cota inválida para este órgão'; END IF;
    IF NOT qt.active THEN RAISE EXCEPTION 'Cota "%" está inativa', qt.name; END IF;
    IF qt.valid_from > current_date OR (qt.valid_to IS NOT NULL AND qt.valid_to < current_date) THEN
      RAISE EXCEPTION 'Cota "%" fora da vigência', qt.name; END IF;
    need := CASE WHEN qt.quota_type = 'financeira' THEN _val ELSE _qty END;
    avail := qt.granted_amount - qt.reserved_amount - qt.consumed_amount;
    IF need > avail + 0.005 THEN
      RAISE EXCEPTION 'Saldo insuficiente na cota "%": disponível %, solicitado %.', qt.name, round(avail,3), round(need,3); END IF;
    UPDATE public.quotas SET reserved_amount = reserved_amount + need, updated_at = now() WHERE id = _quota;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.budget_release(
  _org uuid, _item uuid, _commitment uuid, _quota uuid, _qty numeric, _val numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE qt record; amt numeric;
BEGIN
  IF _item IS NOT NULL THEN
    UPDATE public.contract_items
       SET reserved_quantity = GREATEST(reserved_quantity - _qty, 0),
           reserved_value = GREATEST(reserved_value - _val, 0), updated_at = now()
     WHERE id = _item AND organization_id = _org;
  END IF;
  IF _commitment IS NOT NULL THEN
    UPDATE public.commitments SET reserved_value = GREATEST(reserved_value - _val, 0), updated_at = now()
     WHERE id = _commitment AND organization_id = _org;
  END IF;
  IF _quota IS NOT NULL THEN
    SELECT * INTO qt FROM public.quotas WHERE id = _quota AND organization_id = _org FOR UPDATE;
    IF qt IS NOT NULL THEN
      amt := CASE WHEN qt.quota_type = 'financeira' THEN _val ELSE _qty END;
      UPDATE public.quotas SET reserved_amount = GREATEST(reserved_amount - amt, 0), updated_at = now() WHERE id = _quota;
    END IF;
  END IF;
END; $$;

-- consumo: quando _from_reserved, converte reserva em consumo; senão valida saldo livre
CREATE OR REPLACE FUNCTION public.budget_consume(
  _org uuid, _item uuid, _commitment uuid, _quota uuid, _qty numeric, _val numeric, _from_reserved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it record; cm record; qt record; avail numeric; need numeric; dq numeric; dv numeric;
BEGIN
  IF _item IS NOT NULL THEN
    SELECT * INTO it FROM public.contract_items WHERE id = _item AND organization_id = _org FOR UPDATE;
    IF it IS NULL THEN RAISE EXCEPTION 'Item contratual inválido para este órgão'; END IF;
    dq := CASE WHEN _from_reserved THEN LEAST(_qty, it.reserved_quantity) ELSE 0 END;
    dv := CASE WHEN _from_reserved THEN LEAST(_val, it.reserved_value) ELSE 0 END;
    avail := it.quantity - it.reserved_quantity - it.consumed_quantity + dq;
    IF _qty > avail + 0.0005 THEN
      RAISE EXCEPTION 'Saldo insuficiente no item contratual "%": disponível % %.', it.description, round(avail,3), it.measure_unit; END IF;
    avail := it.total_value - it.reserved_value - it.consumed_value + dv;
    IF _val > avail + 0.005 THEN
      RAISE EXCEPTION 'Saldo financeiro insuficiente no item contratual "%": disponível R$ %.', it.description, round(avail,2); END IF;
    UPDATE public.contract_items
       SET reserved_quantity = reserved_quantity - dq, reserved_value = reserved_value - dv,
           consumed_quantity = consumed_quantity + _qty, consumed_value = consumed_value + _val, updated_at = now()
     WHERE id = _item;
  END IF;

  IF _commitment IS NOT NULL THEN
    SELECT * INTO cm FROM public.commitments WHERE id = _commitment AND organization_id = _org FOR UPDATE;
    IF cm IS NULL THEN RAISE EXCEPTION 'Empenho inválido para este órgão'; END IF;
    dv := CASE WHEN _from_reserved THEN LEAST(_val, cm.reserved_value) ELSE 0 END;
    avail := cm.committed_value - cm.cancelled_value - cm.reserved_value - cm.consumed_value + dv;
    IF _val > avail + 0.005 THEN
      RAISE EXCEPTION 'Saldo insuficiente no empenho %: disponível R$ %.', cm.number, round(avail,2); END IF;
    UPDATE public.commitments
       SET reserved_value = reserved_value - dv, consumed_value = consumed_value + _val, updated_at = now()
     WHERE id = _commitment;
    UPDATE public.commitments SET status = 'esgotado'
     WHERE id = _commitment AND status = 'ativo' AND available_value <= 0.005;
  END IF;

  IF _quota IS NOT NULL THEN
    SELECT * INTO qt FROM public.quotas WHERE id = _quota AND organization_id = _org FOR UPDATE;
    IF qt IS NULL THEN RAISE EXCEPTION 'Cota inválida para este órgão'; END IF;
    need := CASE WHEN qt.quota_type = 'financeira' THEN _val ELSE _qty END;
    dv := CASE WHEN _from_reserved THEN LEAST(need, qt.reserved_amount) ELSE 0 END;
    avail := qt.granted_amount - qt.reserved_amount - qt.consumed_amount + dv;
    IF need > avail + 0.005 THEN
      RAISE EXCEPTION 'Saldo insuficiente na cota "%": disponível %.', qt.name, round(avail,3); END IF;
    UPDATE public.quotas
       SET reserved_amount = reserved_amount - dv, consumed_amount = consumed_amount + need, updated_at = now()
     WHERE id = _quota;
  END IF;
END; $$;

-- estorno de consumo (cancelamento de abastecimento)
CREATE OR REPLACE FUNCTION public.budget_refund(
  _org uuid, _item uuid, _commitment uuid, _quota uuid, _qty numeric, _val numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE qt record; amt numeric;
BEGIN
  IF _item IS NOT NULL THEN
    UPDATE public.contract_items
       SET consumed_quantity = GREATEST(consumed_quantity - _qty, 0),
           consumed_value = GREATEST(consumed_value - _val, 0), updated_at = now()
     WHERE id = _item AND organization_id = _org;
  END IF;
  IF _commitment IS NOT NULL THEN
    UPDATE public.commitments SET consumed_value = GREATEST(consumed_value - _val, 0), updated_at = now()
     WHERE id = _commitment AND organization_id = _org;
    UPDATE public.commitments SET status = 'ativo'
     WHERE id = _commitment AND status = 'esgotado' AND available_value > 0.005;
  END IF;
  IF _quota IS NOT NULL THEN
    SELECT * INTO qt FROM public.quotas WHERE id = _quota AND organization_id = _org FOR UPDATE;
    IF qt IS NOT NULL THEN
      amt := CASE WHEN qt.quota_type = 'financeira' THEN _val ELSE _qty END;
      UPDATE public.quotas SET consumed_amount = GREATEST(consumed_amount - amt, 0), updated_at = now() WHERE id = _quota;
    END IF;
  END IF;
END; $$;

-- ------------------------------------------------------------------ suplementação de cota
CREATE OR REPLACE FUNCTION public.apply_quota_supplement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (NEW.amount > 0) THEN RAISE EXCEPTION 'A suplementação deve ser maior que zero'; END IF;
  IF COALESCE(btrim(NEW.reason), '') = '' THEN RAISE EXCEPTION 'Informe a justificativa da suplementação'; END IF;
  UPDATE public.quotas SET granted_amount = granted_amount + NEW.amount, updated_at = now()
   WHERE id = NEW.quota_id AND organization_id = NEW.organization_id;
  PERFORM public.budget_log(NEW.organization_id, 'suplementacao', NULL, NULL, NULL, NULL, NEW.quota_id, NEW.amount, NEW.amount, NEW.reason);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_quota_supplement AFTER INSERT ON public.quota_supplements
FOR EACH ROW EXECUTE FUNCTION public.apply_quota_supplement();

-- ------------------------------------------------------------------ reserva na autorização
CREATE OR REPLACE FUNCTION public.prepare_authorization_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.contract_item_id IS NOT NULL THEN
      SELECT * INTO it FROM public.contract_items WHERE id = NEW.contract_item_id AND organization_id = NEW.organization_id;
      IF it IS NULL THEN RAISE EXCEPTION 'Item contratual inválido para este órgão'; END IF;
      IF NEW.contract_id IS NULL THEN NEW.contract_id := it.contract_id; END IF;
      IF it.fuel_type_id IS NOT NULL AND NEW.fuel_type_id IS NOT NULL AND it.fuel_type_id <> NEW.fuel_type_id THEN
        RAISE EXCEPTION 'O combustível autorizado não corresponde ao item contratual';
      END IF;
    END IF;
    NEW.reserved_quantity := NEW.max_quantity;
    NEW.reserved_value := COALESCE(
      NEW.max_value,
      NEW.max_quantity * NEW.max_unit_price,
      NEW.max_quantity * (SELECT unit_price FROM public.contract_items WHERE id = NEW.contract_item_id),
      0);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fuel_auth_budget_prepare BEFORE INSERT ON public.fuel_authorizations
FOR EACH ROW EXECUTE FUNCTION public.prepare_authorization_budget();

CREATE OR REPLACE FUNCTION public.reserve_authorization_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IN ('pendente','autorizada')
     AND (NEW.contract_item_id IS NOT NULL OR NEW.commitment_id IS NOT NULL OR NEW.quota_id IS NOT NULL) THEN
    PERFORM public.budget_reserve(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id,
      NEW.reserved_quantity, NEW.reserved_value);
    UPDATE public.fuel_authorizations SET budget_reserved = true WHERE id = NEW.id;
    PERFORM public.budget_log(NEW.organization_id, 'reserva', NEW.id, NULL, NEW.contract_item_id, NEW.commitment_id,
      NEW.quota_id, NEW.reserved_quantity, NEW.reserved_value, 'Reserva da autorização ' || COALESCE(NEW.code,''));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fuel_auth_budget_reserve AFTER INSERT ON public.fuel_authorizations
FOR EACH ROW EXECUTE FUNCTION public.reserve_authorization_budget();

-- liberação automática ao cancelar / expirar / concluir
CREATE OR REPLACE FUNCTION public.release_authorization_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.budget_reserved AND NEW.status IN ('cancelada','expirada','utilizada')
     AND OLD.status NOT IN ('cancelada','expirada','utilizada')
     AND (NEW.reserved_quantity > 0 OR NEW.reserved_value > 0) THEN
    PERFORM public.budget_release(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id,
      NEW.reserved_quantity, NEW.reserved_value);
    PERFORM public.budget_log(NEW.organization_id, 'liberacao', NEW.id, NULL, NEW.contract_item_id, NEW.commitment_id,
      NEW.quota_id, NEW.reserved_quantity, NEW.reserved_value,
      'Liberação de saldo — autorização ' || COALESCE(NEW.code,'') || ' (' || NEW.status || ')');
    UPDATE public.fuel_authorizations SET reserved_quantity = 0, reserved_value = 0 WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fuel_auth_budget_release AFTER UPDATE OF status ON public.fuel_authorizations
FOR EACH ROW EXECUTE FUNCTION public.release_authorization_budget();

-- ------------------------------------------------------------------ herança e baixa no abastecimento
CREATE OR REPLACE FUNCTION public.inherit_fueling_funding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record;
BEGIN
  IF NEW.authorization_id IS NOT NULL THEN
    SELECT * INTO a FROM public.fuel_authorizations WHERE id = NEW.authorization_id AND organization_id = NEW.organization_id;
    IF a IS NOT NULL THEN
      NEW.expense_origin := a.expense_origin;
      NEW.cost_center_id := COALESCE(NEW.cost_center_id, a.cost_center_id);
      NEW.contract_id := COALESCE(NEW.contract_id, a.contract_id);
      NEW.contract_item_id := COALESCE(NEW.contract_item_id, a.contract_item_id);
      NEW.commitment_id := COALESCE(NEW.commitment_id, a.commitment_id);
      NEW.quota_id := COALESCE(NEW.quota_id, a.quota_id);
    END IF;
  END IF;
  IF NEW.total_value IS NULL THEN NEW.total_value := round(NEW.quantity * NEW.unit_price, 2); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fuelings_funding BEFORE INSERT ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.inherit_fueling_funding();

CREATE OR REPLACE FUNCTION public.apply_fueling_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; val numeric; qty numeric; from_res boolean := false;
BEGIN
  IF NEW.contract_item_id IS NULL AND NEW.commitment_id IS NULL AND NEW.quota_id IS NULL THEN
    RETURN NEW;
  END IF;
  qty := NEW.quantity;
  val := round(NEW.quantity * NEW.unit_price, 2);

  IF NEW.authorization_id IS NOT NULL THEN
    SELECT * INTO a FROM public.fuel_authorizations WHERE id = NEW.authorization_id FOR UPDATE;
    from_res := COALESCE(a.budget_reserved, false);
  END IF;

  PERFORM public.budget_consume(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id, qty, val, from_res);
  PERFORM public.budget_log(NEW.organization_id, 'consumo', NEW.authorization_id, NEW.id, NEW.contract_item_id,
    NEW.commitment_id, NEW.quota_id, qty, val, 'Baixa por abastecimento');

  IF a IS NOT NULL AND from_res THEN
    UPDATE public.fuel_authorizations
       SET reserved_quantity = GREATEST(reserved_quantity - qty, 0),
           reserved_value = GREATEST(reserved_value - val, 0)
     WHERE id = a.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fuelings_budget AFTER INSERT ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.apply_fueling_budget();

CREATE OR REPLACE FUNCTION public.refund_fueling_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE val numeric;
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado'
     AND (NEW.contract_item_id IS NOT NULL OR NEW.commitment_id IS NOT NULL OR NEW.quota_id IS NOT NULL) THEN
    val := round(NEW.quantity * NEW.unit_price, 2);
    PERFORM public.budget_refund(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id, NEW.quantity, val);
    PERFORM public.budget_log(NEW.organization_id, 'estorno', NEW.authorization_id, NEW.id, NEW.contract_item_id,
      NEW.commitment_id, NEW.quota_id, NEW.quantity, val, 'Estorno por cancelamento de abastecimento');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fuelings_budget_refund AFTER UPDATE OF status ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.refund_fueling_budget();

-- ------------------------------------------------------------------ alertas financeiros
CREATE OR REPLACE FUNCTION public.refresh_financial_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid; r record; pct numeric; days integer; sev public.alert_severity; atype text; msg text;
BEGIN
  org := public.current_org_id();
  IF org IS NULL THEN RETURN; END IF;

  FOR r IN SELECT c.id, c.number, c.valid_to, c.status,
                  COALESCE(SUM(i.total_value),0) AS total,
                  COALESCE(SUM(i.consumed_value),0) AS used
             FROM public.contracts c LEFT JOIN public.contract_items i ON i.contract_id = c.id
            WHERE c.organization_id = org AND c.status = 'vigente'
            GROUP BY c.id LOOP
    IF r.total > 0 THEN
      pct := round(r.used / r.total * 100, 1);
      atype := CASE WHEN pct >= 100 THEN 'contrato_esgotado' WHEN pct >= 90 THEN 'contrato_90'
                    WHEN pct >= 80 THEN 'contrato_80' ELSE NULL END;
      IF atype IS NOT NULL THEN
        sev := CASE WHEN pct >= 100 THEN 'erro' ELSE 'alerta' END;
        msg := 'Contrato ' || r.number || ' com ' || pct || '% do valor executado.';
        INSERT INTO public.fueling_alerts (organization_id, alert_type, severity, message, category, entity_type, entity_id)
        SELECT org, atype, sev, msg, 'contrato', 'contract', r.id
        WHERE NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = org
          AND a.alert_type = atype AND a.entity_id = r.id AND a.status = 'aberto');
      END IF;
    END IF;
    IF r.valid_to IS NOT NULL THEN
      days := r.valid_to - current_date;
      atype := CASE WHEN days < 0 THEN 'contrato_vencido' WHEN days <= 7 THEN 'contrato_vence_7'
                    WHEN days <= 15 THEN 'contrato_vence_15' WHEN days <= 30 THEN 'contrato_vence_30'
                    WHEN days <= 60 THEN 'contrato_vence_60' ELSE NULL END;
      IF atype IS NOT NULL THEN
        sev := CASE WHEN days <= 7 THEN 'erro' ELSE 'alerta' END;
        msg := CASE WHEN days < 0 THEN 'Contrato ' || r.number || ' com vigência encerrada em ' || r.valid_to
                    ELSE 'Contrato ' || r.number || ' vence em ' || days || ' dia(s).' END;
        INSERT INTO public.fueling_alerts (organization_id, alert_type, severity, message, category, entity_type, entity_id)
        SELECT org, atype, sev, msg, 'contrato', 'contract', r.id
        WHERE NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = org
          AND a.alert_type = atype AND a.entity_id = r.id AND a.status = 'aberto');
      END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT id, number, committed_value, cancelled_value, available_value
             FROM public.commitments WHERE organization_id = org AND status = 'ativo' LOOP
    IF (r.committed_value - r.cancelled_value) > 0 THEN
      pct := round(r.available_value / (r.committed_value - r.cancelled_value) * 100, 1);
      atype := CASE WHEN pct <= 0 THEN 'empenho_zerado' WHEN pct <= 10 THEN 'empenho_saldo_10'
                    WHEN pct <= 20 THEN 'empenho_saldo_20' ELSE NULL END;
      IF atype IS NOT NULL THEN
        sev := CASE WHEN pct <= 0 THEN 'erro' ELSE 'alerta' END;
        msg := 'Empenho ' || r.number || ' com saldo de ' || pct || '% (R$ ' || round(r.available_value,2) || ').';
        INSERT INTO public.fueling_alerts (organization_id, alert_type, severity, message, category, entity_type, entity_id)
        SELECT org, atype, sev, msg, 'empenho', 'commitment', r.id
        WHERE NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = org
          AND a.alert_type = atype AND a.entity_id = r.id AND a.status = 'aberto');
      END IF;
    END IF;
  END LOOP;

  FOR r IN SELECT id, name, granted_amount, balance_amount
             FROM public.quotas WHERE organization_id = org AND active LOOP
    IF r.granted_amount > 0 THEN
      pct := round(r.balance_amount / r.granted_amount * 100, 1);
      atype := CASE WHEN pct <= 0 THEN 'cota_zerada' WHEN pct <= 10 THEN 'cota_saldo_10'
                    WHEN pct <= 20 THEN 'cota_saldo_20' ELSE NULL END;
      IF atype IS NOT NULL THEN
        sev := CASE WHEN pct <= 0 THEN 'erro' ELSE 'alerta' END;
        msg := 'Cota "' || r.name || '" com saldo de ' || pct || '%.';
        INSERT INTO public.fueling_alerts (organization_id, alert_type, severity, message, category, entity_type, entity_id)
        SELECT org, atype, sev, msg, 'cota', 'quota', r.id
        WHERE NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = org
          AND a.alert_type = atype AND a.entity_id = r.id AND a.status = 'aberto');
      END IF;
    END IF;
  END LOOP;
END; $$;
REVOKE EXECUTE ON FUNCTION public.refresh_financial_alerts() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.refresh_financial_alerts() TO authenticated, service_role;

-- registro de bloqueio por saldo insuficiente (chamado pela aplicação após erro)
CREATE OR REPLACE FUNCTION public.log_budget_block(_message text, _entity_type text, _entity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid;
BEGIN
  org := public.current_org_id();
  IF org IS NULL THEN RETURN; END IF;
  INSERT INTO public.fueling_alerts (organization_id, alert_type, severity, message, category, entity_type, entity_id, created_by)
  VALUES (org, 'saldo_insuficiente', 'erro', left(COALESCE(_message,'Bloqueio por saldo insuficiente'), 500),
          'bloqueio', _entity_type, _entity_id, auth.uid());
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_budget_block(text, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.log_budget_block(text, text, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------ timestamps + auditoria
CREATE TRIGGER trg_cost_centers_updated BEFORE UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_commitments_updated BEFORE UPDATE ON public.commitments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_audit_cost_centers AFTER INSERT OR UPDATE OR DELETE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_contracts AFTER INSERT OR UPDATE OR DELETE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_contract_items AFTER INSERT OR UPDATE OR DELETE ON public.contract_items FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_commitments AFTER INSERT OR UPDATE OR DELETE ON public.commitments FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_quotas AFTER INSERT OR UPDATE OR DELETE ON public.quotas FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_quota_supplements AFTER INSERT ON public.quota_supplements FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_budget_movements AFTER INSERT ON public.budget_movements FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE INDEX idx_contract_items_contract ON public.contract_items(contract_id);
CREATE INDEX idx_commitments_org ON public.commitments(organization_id, exercise);
CREATE INDEX idx_quotas_org ON public.quotas(organization_id);
CREATE INDEX idx_budget_movements_org ON public.budget_movements(organization_id, created_at DESC);
CREATE INDEX idx_fuelings_contract_item ON public.fuelings(contract_item_id);

-- ------------------------------------------------------------------ armazenamento privado de contratos
CREATE POLICY "org members read contratos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contratos' AND (storage.foldername(name))[1] = public.current_org_id()::text);
CREATE POLICY "org managers upload contratos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contratos' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_manage_finance());
CREATE POLICY "org managers update contratos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contratos' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_manage_finance());
CREATE POLICY "org managers delete contratos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contratos' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_manage_finance());