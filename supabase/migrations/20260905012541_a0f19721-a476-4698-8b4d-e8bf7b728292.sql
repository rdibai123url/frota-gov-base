-- ============================================================
-- BLOCO 5/6 — cadastros auxiliares, matriz de módulos e contrato na manutenção
-- ============================================================

/* ---------- 1) Tipos de serviço de manutenção por órgão ---------- */
CREATE TABLE public.maintenance_service_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX maintenance_service_types_uniq
  ON public.maintenance_service_types (organization_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_service_types TO authenticated;
GRANT ALL ON public.maintenance_service_types TO service_role;
ALTER TABLE public.maintenance_service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY maintenance_service_types_select ON public.maintenance_service_types
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY maintenance_service_types_insert ON public.maintenance_service_types
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY maintenance_service_types_update ON public.maintenance_service_types
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

CREATE TRIGGER trg_maintenance_service_types_updated
  BEFORE UPDATE ON public.maintenance_service_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.maintenance_service_types IS
  'Tipos de serviço de manutenção cadastrados pelo próprio órgão (usados nos planos preventivos).';

/* ---------- 2) Referências orçamentárias reutilizáveis ---------- */
CREATE TABLE public.budget_references (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('dotacao', 'fonte', 'elemento')),
  value text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX budget_references_uniq
  ON public.budget_references (organization_id, kind, lower(value));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_references TO authenticated;
GRANT ALL ON public.budget_references TO service_role;
ALTER TABLE public.budget_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY budget_references_select ON public.budget_references
  FOR SELECT TO authenticated USING (organization_id = public.current_org_id());
CREATE POLICY budget_references_insert ON public.budget_references
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY budget_references_update ON public.budget_references
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_finance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());

CREATE TRIGGER trg_budget_references_updated
  BEFORE UPDATE ON public.budget_references
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.budget_references IS
  'Dotações orçamentárias, fontes de recurso e elementos de despesa reutilizáveis no cadastro de empenhos.';

/* ---------- 3) Matriz de módulos habilitados por órgão ---------- */
CREATE TABLE public.organization_modules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, module_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_modules TO authenticated;
GRANT ALL ON public.organization_modules TO service_role;
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_modules_select ON public.organization_modules
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY organization_modules_insert ON public.organization_modules
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY organization_modules_update ON public.organization_modules
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY organization_modules_delete ON public.organization_modules
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_organization_modules_updated
  BEFORE UPDATE ON public.organization_modules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_audit_organization_modules
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_modules
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

COMMENT ON TABLE public.organization_modules IS
  'Habilitação/desabilitação de módulos do FrotaGov por órgão. Ausência de linha significa o padrão do módulo.';

/* ---------- 4) Manutenção: solicitante, contrato e itens ---------- */
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS requester_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.maintenance_requests.requester_employee_id IS
  'Funcionário solicitante; a unidade solicitante é sugerida a partir dele.';

ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS contract_item_id uuid REFERENCES public.contract_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS labor_quantity numeric,
  ADD COLUMN IF NOT EXISTS labor_unit_price numeric;
COMMENT ON COLUMN public.maintenance_records.contract_item_id IS
  'Item contratual de mão de obra/serviço que origina o preço unitário aplicado.';

ALTER TABLE public.maintenance_parts
  ADD COLUMN IF NOT EXISTS contract_item_id uuid REFERENCES public.contract_items(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.maintenance_parts.contract_item_id IS
  'Item contratual de peça que origina o preço unitário e o saldo consumido.';

/* consumo auditável do item contratual — mão de obra */
CREATE OR REPLACE FUNCTION public.apply_maintenance_labor_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  oq numeric := 0; ov numeric := 0; nq numeric := 0; nv numeric := 0;
  old_item uuid := NULL; new_item uuid := NULL;
  it record; avail numeric;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.contract_item_id IS NOT NULL AND OLD.status <> 'cancelada' THEN
      old_item := OLD.contract_item_id;
      oq := COALESCE(OLD.labor_quantity, 0);
      ov := oq * COALESCE(OLD.labor_unit_price, 0);
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.contract_item_id IS NOT NULL AND NEW.status <> 'cancelada' THEN
      new_item := NEW.contract_item_id;
      nq := COALESCE(NEW.labor_quantity, 0);
      nv := nq * COALESCE(NEW.labor_unit_price, 0);
    END IF;
  END IF;

  IF old_item IS NOT NULL THEN
    UPDATE public.contract_items
       SET consumed_quantity = GREATEST(COALESCE(consumed_quantity, 0) - oq, 0),
           consumed_value = GREATEST(COALESCE(consumed_value, 0) - ov, 0)
     WHERE id = old_item;
  END IF;

  IF new_item IS NOT NULL THEN
    SELECT * INTO it FROM public.contract_items WHERE id = new_item FOR UPDATE;
    IF NOT FOUND OR it.organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Item contratual pertence a outro órgão';
    END IF;
    IF NEW.contract_id IS NULL OR it.contract_id <> NEW.contract_id THEN
      RAISE EXCEPTION 'O item de mão de obra não pertence ao contrato informado';
    END IF;
    avail := COALESCE(it.quantity, 0) - COALESCE(it.reserved_quantity, 0) - COALESCE(it.consumed_quantity, 0);
    IF nq > avail + 0.000001 THEN
      RAISE EXCEPTION 'Saldo insuficiente no item contratual (disponível %).', avail;
    END IF;
    UPDATE public.contract_items
       SET consumed_quantity = COALESCE(consumed_quantity, 0) + nq,
           consumed_value = COALESCE(consumed_value, 0) + nv
     WHERE id = new_item;
  END IF;

  RETURN NULL;
END; $$;

REVOKE EXECUTE ON FUNCTION public.apply_maintenance_labor_contract() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_maint_rec_contract_item
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.apply_maintenance_labor_contract();

/* consumo auditável do item contratual — peças */
CREATE OR REPLACE FUNCTION public.apply_maintenance_part_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  oq numeric := 0; ov numeric := 0; nq numeric := 0; nv numeric := 0;
  old_item uuid := NULL; new_item uuid := NULL;
  it record; rec record; avail numeric;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.contract_item_id IS NOT NULL THEN
      old_item := OLD.contract_item_id;
      oq := COALESCE(OLD.quantity, 0);
      ov := oq * COALESCE(OLD.unit_value, 0);
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.contract_item_id IS NOT NULL THEN
      new_item := NEW.contract_item_id;
      nq := COALESCE(NEW.quantity, 0);
      nv := nq * COALESCE(NEW.unit_value, 0);
    END IF;
  END IF;

  IF old_item IS NOT NULL THEN
    UPDATE public.contract_items
       SET consumed_quantity = GREATEST(COALESCE(consumed_quantity, 0) - oq, 0),
           consumed_value = GREATEST(COALESCE(consumed_value, 0) - ov, 0)
     WHERE id = old_item;
  END IF;

  IF new_item IS NOT NULL THEN
    SELECT * INTO it FROM public.contract_items WHERE id = new_item FOR UPDATE;
    IF NOT FOUND OR it.organization_id IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Item contratual pertence a outro órgão';
    END IF;
    SELECT * INTO rec FROM public.maintenance_records WHERE id = NEW.maintenance_record_id;
    IF rec.contract_id IS NULL OR it.contract_id <> rec.contract_id THEN
      RAISE EXCEPTION 'A peça deve pertencer ao contrato da manutenção';
    END IF;
    avail := COALESCE(it.quantity, 0) - COALESCE(it.reserved_quantity, 0) - COALESCE(it.consumed_quantity, 0);
    IF nq > avail + 0.000001 THEN
      RAISE EXCEPTION 'Saldo insuficiente no item contratual (disponível %).', avail;
    END IF;
    UPDATE public.contract_items
       SET consumed_quantity = COALESCE(consumed_quantity, 0) + nq,
           consumed_value = COALESCE(consumed_value, 0) + nv
     WHERE id = new_item;
  END IF;

  RETURN NULL;
END; $$;

REVOKE EXECUTE ON FUNCTION public.apply_maintenance_part_contract() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_maint_parts_contract_item
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_parts
  FOR EACH ROW EXECUTE FUNCTION public.apply_maintenance_part_contract();

/* ---------- 5) OS: compra direta pode usar oficina do cadastro mestre ---------- */
CREATE OR REPLACE FUNCTION public.guard_service_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE q record; p record; w record; v record;
BEGIN
  SELECT * INTO w FROM public.workshops WHERE id = NEW.workshop_id;
  IF w IS NULL OR w.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Oficina credenciada pertence a outro órgão';
  END IF;
  -- Compra direta / pronto pagamento pode usar empresa do cadastro mestre sem credenciamento ativo.
  IF TG_OP = 'INSERT' AND w.status <> 'ativo'
     AND (NEW.quotation_id IS NOT NULL OR NEW.expense_origin = 'contrato') THEN
    RAISE EXCEPTION 'Oficina % não está com credenciamento ativo', COALESCE(w.trade_name, w.legal_name);
  END IF;

  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF v IS NULL OR v.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Veículo pertence a outro órgão';
  END IF;

  IF NEW.quotation_id IS NOT NULL THEN
    SELECT * INTO q FROM public.quotations WHERE id = NEW.quotation_id;
    IF q IS NULL OR q.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Processo de cotação pertence a outro órgão';
    END IF;
    IF q.selected_proposal_id IS NULL THEN
      RAISE EXCEPTION 'A ordem de serviço só pode ser emitida após a aprovação de uma proposta';
    END IF;
    IF TG_OP = 'INSERT' THEN
      SELECT * INTO p FROM public.quotation_proposals WHERE id = q.selected_proposal_id;
      IF NEW.workshop_id <> p.workshop_id THEN
        RAISE EXCEPTION 'A oficina da OS deve ser a mesma da proposta aprovada';
      END IF;
      NEW.proposal_id := q.selected_proposal_id;
    END IF;
  END IF;

  IF NEW.expense_origin = 'contrato' AND NEW.contract_id IS NULL THEN
    RAISE EXCEPTION 'Ordem de serviço com origem em contrato exige o contrato vinculado';
  END IF;

  IF NEW.status = 'cancelada' AND COALESCE(btrim(NEW.cancel_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento da ordem de serviço';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'concluida' AND (
         NEW.status <> OLD.status OR NEW.approved_value <> OLD.approved_value
         OR NEW.executed_value IS DISTINCT FROM OLD.executed_value
         OR NEW.workshop_id <> OLD.workshop_id OR NEW.vehicle_id <> OLD.vehicle_id) THEN
      RAISE EXCEPTION 'Ordem de serviço concluída é imutável nos dados críticos';
    END IF;
    IF OLD.status = 'cancelada' AND NEW.status <> 'cancelada' THEN
      RAISE EXCEPTION 'Ordem de serviço cancelada não pode ser reaberta';
    END IF;
    IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
      NEW.executed_value := COALESCE(NEW.executed_value, NEW.approved_value);
      NEW.finished_at := COALESCE(NEW.finished_at, now());
    END IF;
    IF NEW.status IN ('em_execucao','aguardando_peca') AND OLD.started_at IS NULL THEN
      NEW.started_at := COALESCE(NEW.started_at, now());
    END IF;
  END IF;
  RETURN NEW;
END; $$;