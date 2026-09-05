-- ===================== BLOCO 1 — FUNCIONÁRIOS =====================

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  cpf text,
  registration text,
  job_title text,
  phone text,
  email text,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  functions text[] NOT NULL DEFAULT '{}',
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read employees" ON public.employees
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "insert employees" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_write());

CREATE POLICY "update employees" ON public.employees
  FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_write())
  WITH CHECK (organization_id = current_org_id() AND can_write());

CREATE UNIQUE INDEX IF NOT EXISTS employees_org_cpf_key
  ON public.employees (organization_id, cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS employees_org_idx ON public.employees (organization_id, full_name);

CREATE TRIGGER touch_employees BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- ============ BLOCO 1 — CADASTRO MESTRE DE EMPRESAS/PESSOAS EXTERNAS ============

ALTER TABLE public.external_entities
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS district text;

CREATE INDEX IF NOT EXISTS external_entities_categories_idx
  ON public.external_entities USING gin (categories);

-- ===================== BLOCO 2 — CONTRATOS =====================

ALTER TYPE public.contract_modality ADD VALUE IF NOT EXISTS 'credenciamento';

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS srp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS procedure_number text,
  ADD COLUMN IF NOT EXISTS fiscal_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.external_entities(id) ON DELETE SET NULL;

-- Valor global inicial e valor atual calculados pela soma dos itens
CREATE OR REPLACE FUNCTION public.sync_contract_value_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _contract uuid; _total numeric;
BEGIN
  _contract := COALESCE(NEW.contract_id, OLD.contract_id);
  SELECT COALESCE(SUM(quantity * unit_price), 0) INTO _total
    FROM public.contract_items WHERE contract_id = _contract AND active;

  UPDATE public.contracts SET current_value = _total, updated_at = now()
   WHERE id = _contract AND value_from_items;

  -- Enquanto não houver aditivo, o valor global inicial acompanha a planilha de itens.
  UPDATE public.contracts SET initial_value = _total, updated_at = now()
   WHERE id = _contract AND value_from_items AND COALESCE(amendment_count, 0) = 0;

  RETURN NULL;
END; $function$;

-- Contrato formalizado só muda por aditivo
CREATE OR REPLACE FUNCTION public.guard_contract_item_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE st public.contract_status; num text;
BEGIN
  IF COALESCE(current_setting('frotagov.amendment', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT status, number INTO st, num FROM public.contracts WHERE id = NEW.contract_id;
  IF st IS NULL OR st = 'rascunho' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.origin_amendment_id IS NULL THEN
    RAISE EXCEPTION 'O contrato % não está em rascunho. A inclusão de itens deve ser feita por aditivo.', num;
  END IF;

  IF TG_OP = 'UPDATE' AND (
       NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.measure_unit IS DISTINCT FROM OLD.measure_unit
  ) THEN
    RAISE EXCEPTION 'O contrato % está formalizado. Alterações de quantidade, valor ou descrição de item devem ser feitas por aditivo.', num;
  END IF;

  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_contract_item_guard_write ON public.contract_items;
CREATE TRIGGER trg_contract_item_guard_write
  BEFORE INSERT OR UPDATE ON public.contract_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_contract_item_write();

-- ============ BLOCO 2 — ITENS DO ADITIVO ============

CREATE TABLE IF NOT EXISTS public.contract_amendment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amendment_id uuid NOT NULL REFERENCES public.contract_amendments(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  contract_item_id uuid REFERENCES public.contract_items(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  description text,
  material_kind text NOT NULL DEFAULT 'outro',
  measure_unit text NOT NULL DEFAULT 'unidade',
  fuel_type_id uuid REFERENCES public.fuel_types(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  previous_quantity numeric,
  new_quantity numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT contract_amendment_items_operation_chk CHECK (operation IN ('acrescimo', 'supressao')),
  CONSTRAINT contract_amendment_items_quantity_chk CHECK (quantity >= 0),
  CONSTRAINT contract_amendment_items_price_chk CHECK (unit_price >= 0)
);

GRANT SELECT, INSERT ON public.contract_amendment_items TO authenticated;
GRANT ALL ON public.contract_amendment_items TO service_role;

ALTER TABLE public.contract_amendment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read amendment items" ON public.contract_amendment_items
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

CREATE POLICY "insert amendment items" ON public.contract_amendment_items
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_finance());

CREATE INDEX IF NOT EXISTS contract_amendment_items_amendment_idx
  ON public.contract_amendment_items (amendment_id);

CREATE OR REPLACE FUNCTION public.apply_contract_amendment_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE it public.contract_items%rowtype; v_used numeric; v_new numeric; v_id uuid;
BEGIN
  PERFORM set_config('frotagov.amendment', 'on', true);

  NEW.total_value := round(COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0), 2);

  IF NEW.contract_item_id IS NULL THEN
    IF NEW.operation <> 'acrescimo' THEN
      RAISE EXCEPTION 'A supressão exige a indicação do item contratual existente.';
    END IF;
    IF COALESCE(NEW.description, '') = '' THEN
      RAISE EXCEPTION 'Informe a descrição do item acrescido pelo aditivo.';
    END IF;
    INSERT INTO public.contract_items
      (organization_id, contract_id, description, material_kind, measure_unit, fuel_type_id,
       quantity, unit_price, notes, origin_amendment_id, created_by)
    VALUES
      (NEW.organization_id, NEW.contract_id, NEW.description, NEW.material_kind, NEW.measure_unit,
       NEW.fuel_type_id, NEW.quantity, NEW.unit_price,
       NEW.notes, NEW.amendment_id, NEW.created_by)
    RETURNING id INTO v_id;
    NEW.contract_item_id := v_id;
    NEW.previous_quantity := 0;
    NEW.new_quantity := NEW.quantity;
    RETURN NEW;
  END IF;

  SELECT * INTO it FROM public.contract_items WHERE id = NEW.contract_item_id;
  IF it.id IS NULL THEN RAISE EXCEPTION 'Item contratual inexistente.'; END IF;
  IF it.contract_id <> NEW.contract_id THEN
    RAISE EXCEPTION 'O item informado não pertence a este contrato.';
  END IF;

  IF NEW.operation = 'acrescimo' THEN
    v_new := COALESCE(it.quantity, 0) + COALESCE(NEW.quantity, 0);
  ELSE
    v_new := COALESCE(it.quantity, 0) - COALESCE(NEW.quantity, 0);
  END IF;

  v_used := COALESCE(it.reserved_quantity, 0) + COALESCE(it.consumed_quantity, 0);
  IF v_new < 0 THEN
    RAISE EXCEPTION 'A supressão deixaria o item "%" com quantidade negativa.', it.description;
  END IF;
  IF v_new < v_used THEN
    RAISE EXCEPTION 'A supressão do item "%" é menor que a quantidade já reservada/consumida (%).', it.description, v_used;
  END IF;

  NEW.previous_quantity := COALESCE(it.quantity, 0);
  NEW.new_quantity := v_new;
  IF COALESCE(NEW.unit_price, 0) = 0 THEN NEW.unit_price := it.unit_price; END IF;
  NEW.total_value := round(COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0), 2);
  IF COALESCE(NEW.description, '') = '' THEN NEW.description := it.description; END IF;
  NEW.measure_unit := it.measure_unit;
  NEW.material_kind := it.material_kind;

  UPDATE public.contract_items
     SET quantity = v_new,
         unit_price = COALESCE(NULLIF(NEW.unit_price, 0), unit_price),
         active = CASE WHEN v_new = 0 THEN false ELSE active END,
         updated_at = now(),
         updated_by = NEW.created_by
   WHERE id = it.id;

  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_amendment_item_apply ON public.contract_amendment_items;
CREATE TRIGGER trg_amendment_item_apply
  BEFORE INSERT ON public.contract_amendment_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_contract_amendment_item();

CREATE TRIGGER audit_contract_amendment_items
  AFTER INSERT OR UPDATE OR DELETE ON public.contract_amendment_items
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

COMMENT ON TABLE public.employees IS 'Funcionários do órgão (pessoas), independentemente de possuírem acesso ao sistema.';
COMMENT ON COLUMN public.employees.functions IS 'Funções institucionais: fiscal_contrato, gestor_contrato, autorizador, administrativo, almoxarifado, diretor, gerente, coordenador, controlador, motorista.';
COMMENT ON COLUMN public.external_entities.categories IS 'Categorias reutilizáveis: fornecedor, posto, oficina, lava_jato, seguradora, locadora, terceiro_sinistro, proprietario_cedente, prestador_eventual, outro.';
COMMENT ON TABLE public.contract_amendment_items IS 'Itens acrescidos ou suprimidos por aditivo contratual, com histórico das quantidades anterior e posterior.';