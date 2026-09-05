-- ============================================================
-- FASE 11 — Bloco 3 (OFP/almoxarifado) e Bloco 4 (frota operacional)
-- Aditivo, não destrutivo. Nenhuma coluna/dado existente é removido.
-- ============================================================

/* ---------------- BLOCO 3 — OFP nascida do contrato ---------------- */

ALTER TABLE public.supply_order_items
  ADD COLUMN IF NOT EXISTS contract_item_id uuid REFERENCES public.contract_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_quantity numeric NOT NULL DEFAULT 0;

ALTER TABLE public.supply_orders
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_reserved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

COMMENT ON COLUMN public.supply_order_items.contract_item_id IS 'Item contratual de origem — saldo bloqueado na emissão da OFP.';
COMMENT ON COLUMN public.supply_order_items.cancelled_quantity IS 'Quantidade do saldo da OFP cancelada e devolvida ao contrato.';

CREATE TABLE IF NOT EXISTS public.supply_order_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supply_order_id uuid NOT NULL REFERENCES public.supply_orders(id) ON DELETE CASCADE,
  supply_order_item_id uuid NOT NULL REFERENCES public.supply_order_items(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_value numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  invoice_number text,
  invoice_date date,
  invoice_value numeric,
  attachment_path text,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.supply_order_receipts IS 'Recebimentos (total ou parcial) de Ordem de Fornecimento, com nota fiscal e entrada em estoque.';

GRANT SELECT, INSERT, UPDATE ON public.supply_order_receipts TO authenticated;
GRANT ALL ON public.supply_order_receipts TO service_role;
ALTER TABLE public.supply_order_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "le recebimentos ofp" ON public.supply_order_receipts;
CREATE POLICY "le recebimentos ofp" ON public.supply_order_receipts FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
DROP POLICY IF EXISTS "registra recebimentos ofp" ON public.supply_order_receipts;
CREATE POLICY "registra recebimentos ofp" ON public.supply_order_receipts FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
DROP POLICY IF EXISTS "edita recebimentos ofp" ON public.supply_order_receipts;
CREATE POLICY "edita recebimentos ofp" ON public.supply_order_receipts FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_write())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());

CREATE INDEX IF NOT EXISTS supply_order_receipts_order_idx ON public.supply_order_receipts (supply_order_id);
CREATE INDEX IF NOT EXISTS supply_order_receipts_item_idx ON public.supply_order_receipts (supply_order_item_id);

DROP TRIGGER IF EXISTS touch_supply_order_receipts ON public.supply_order_receipts;
CREATE TRIGGER touch_supply_order_receipts BEFORE UPDATE ON public.supply_order_receipts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_supply_order_receipts ON public.supply_order_receipts;
CREATE TRIGGER audit_supply_order_receipts AFTER INSERT OR UPDATE OR DELETE ON public.supply_order_receipts
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- valida e deriva o recebimento
CREATE OR REPLACE FUNCTION public.prepare_supply_order_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it public.supply_order_items%ROWTYPE;
  ord public.supply_orders%ROWTYPE;
  pendente numeric;
BEGIN
  SELECT * INTO it FROM public.supply_order_items WHERE id = NEW.supply_order_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item da OFP não encontrado.'; END IF;
  SELECT * INTO ord FROM public.supply_orders WHERE id = it.supply_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de fornecimento não encontrada.'; END IF;

  NEW.supply_order_id := ord.id;
  NEW.organization_id := ord.organization_id;

  IF ord.status NOT IN ('aprovada', 'parcialmente_atendida') THEN
    RAISE EXCEPTION 'A OFP precisa estar emitida/aprovada para receber material.';
  END IF;

  pendente := COALESCE(it.quantity, 0) - COALESCE(it.delivered_quantity, 0) - COALESCE(it.cancelled_quantity, 0);
  IF NEW.quantity > pendente + 0.000001 THEN
    RAISE EXCEPTION 'Quantidade recebida (%) maior que o saldo pendente da OFP (%).', NEW.quantity, pendente;
  END IF;

  IF COALESCE(NEW.unit_value, 0) = 0 THEN
    NEW.unit_value := COALESCE(it.unit_value, 0);
  END IF;
  NEW.total_value := ROUND(NEW.quantity * COALESCE(NEW.unit_value, 0), 2);
  IF NEW.warehouse_id IS NULL THEN NEW.warehouse_id := ord.warehouse_id; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_supply_order_receipt ON public.supply_order_receipts;
CREATE TRIGGER trg_prepare_supply_order_receipt BEFORE INSERT ON public.supply_order_receipts
  FOR EACH ROW EXECUTE FUNCTION public.prepare_supply_order_receipt();

-- aplica efeitos: atendido da OFP, saldo contratual e entrada em estoque
CREATE OR REPLACE FUNCTION public.apply_supply_order_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it public.supply_order_items%ROWTYPE;
  restante numeric;
BEGIN
  UPDATE public.supply_order_items
     SET delivered_quantity = COALESCE(delivered_quantity, 0) + NEW.quantity,
         delivered_value = COALESCE(delivered_value, 0) + NEW.total_value,
         document_number = COALESCE(NEW.invoice_number, document_number),
         updated_at = now()
   WHERE id = NEW.supply_order_item_id
   RETURNING * INTO it;

  IF it.contract_item_id IS NOT NULL THEN
    UPDATE public.contract_items
       SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - NEW.quantity),
           reserved_value = GREATEST(0, COALESCE(reserved_value, 0) - NEW.total_value),
           consumed_quantity = COALESCE(consumed_quantity, 0) + NEW.quantity,
           consumed_value = COALESCE(consumed_value, 0) + NEW.total_value,
           updated_at = now()
     WHERE id = it.contract_item_id;
  END IF;

  IF NEW.warehouse_id IS NOT NULL AND it.part_id IS NOT NULL THEN
    PERFORM public.stock_move(
      NEW.warehouse_id, it.part_id, 'entrada_ofp'::public.stock_movement_kind, NEW.quantity,
      NEW.unit_value, '', NULL, NULL, NULL, NEW.supply_order_id, NULL, NULL, NULL,
      NEW.invoice_number, 'Recebimento de OFP', NULL, NULL, NEW.occurred_at
    );
  END IF;

  SELECT COALESCE(SUM(GREATEST(0, COALESCE(quantity,0) - COALESCE(delivered_quantity,0) - COALESCE(cancelled_quantity,0))), 0)
    INTO restante
    FROM public.supply_order_items WHERE supply_order_id = NEW.supply_order_id;

  UPDATE public.supply_orders
     SET status = CASE WHEN restante <= 0.000001 THEN 'atendida'::public.supply_order_status
                       ELSE 'parcialmente_atendida'::public.supply_order_status END,
         delivered_at = CASE WHEN restante <= 0.000001 THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
         consumed_value = COALESCE(consumed_value, 0) + NEW.total_value,
         updated_at = now()
   WHERE id = NEW.supply_order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_supply_order_receipt ON public.supply_order_receipts;
CREATE TRIGGER trg_apply_supply_order_receipt AFTER INSERT ON public.supply_order_receipts
  FOR EACH ROW EXECUTE FUNCTION public.apply_supply_order_receipt();

-- emissão: bloqueia (reserva) o saldo dos itens contratuais
CREATE OR REPLACE FUNCTION public.issue_supply_order(_order uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord public.supply_orders%ROWTYPE;
  r RECORD;
  disponivel numeric;
BEGIN
  SELECT * INTO ord FROM public.supply_orders WHERE id = _order;
  IF NOT FOUND OR ord.organization_id <> public.current_org_id() THEN
    RAISE EXCEPTION 'Ordem de fornecimento não encontrada nesta organização.';
  END IF;
  IF NOT public.can_write() THEN RAISE EXCEPTION 'Sem permissão para emitir OFP.'; END IF;
  IF ord.contract_reserved THEN RAISE EXCEPTION 'Esta OFP já foi emitida.'; END IF;
  IF ord.status NOT IN ('rascunho', 'aguardando_aprovacao', 'aprovada') THEN
    RAISE EXCEPTION 'Só é possível emitir OFP em rascunho ou aguardando aprovação.';
  END IF;

  FOR r IN SELECT * FROM public.supply_order_items WHERE supply_order_id = _order LOOP
    IF r.contract_item_id IS NOT NULL THEN
      SELECT COALESCE(quantity,0) - COALESCE(reserved_quantity,0) - COALESCE(consumed_quantity,0)
        INTO disponivel FROM public.contract_items WHERE id = r.contract_item_id FOR UPDATE;
      IF disponivel IS NULL THEN RAISE EXCEPTION 'Item contratual não encontrado.'; END IF;
      IF r.quantity > disponivel + 0.000001 THEN
        RAISE EXCEPTION 'Saldo contratual insuficiente para "%": disponível %, solicitado %.', r.description, disponivel, r.quantity;
      END IF;
      UPDATE public.contract_items
         SET reserved_quantity = COALESCE(reserved_quantity,0) + r.quantity,
             reserved_value = COALESCE(reserved_value,0) + ROUND(r.quantity * COALESCE(r.unit_value,0), 2),
             updated_at = now()
       WHERE id = r.contract_item_id;
    END IF;
  END LOOP;

  UPDATE public.supply_orders
     SET status = 'aprovada', contract_reserved = true, issued_at = COALESCE(issued_at, now()), updated_at = now()
   WHERE id = _order;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_supply_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_supply_order(uuid) TO authenticated;

-- cancelamento do saldo não entregue: devolve o bloqueio ao contrato
CREATE OR REPLACE FUNCTION public.cancel_supply_order_balance(_order uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord public.supply_orders%ROWTYPE;
  r RECORD;
  pendente numeric;
  entregue numeric;
BEGIN
  SELECT * INTO ord FROM public.supply_orders WHERE id = _order;
  IF NOT FOUND OR ord.organization_id <> public.current_org_id() THEN
    RAISE EXCEPTION 'Ordem de fornecimento não encontrada nesta organização.';
  END IF;
  IF NOT public.can_write() THEN RAISE EXCEPTION 'Sem permissão para cancelar OFP.'; END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'Informe a justificativa do cancelamento.'; END IF;
  IF ord.status IN ('atendida', 'cancelada', 'rejeitada') THEN
    RAISE EXCEPTION 'Esta OFP já está encerrada.';
  END IF;

  FOR r IN SELECT * FROM public.supply_order_items WHERE supply_order_id = _order LOOP
    pendente := COALESCE(r.quantity,0) - COALESCE(r.delivered_quantity,0) - COALESCE(r.cancelled_quantity,0);
    IF pendente > 0 THEN
      UPDATE public.supply_order_items
         SET cancelled_quantity = COALESCE(cancelled_quantity,0) + pendente, updated_at = now()
       WHERE id = r.id;
      IF r.contract_item_id IS NOT NULL AND ord.contract_reserved THEN
        UPDATE public.contract_items
           SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity,0) - pendente),
               reserved_value = GREATEST(0, COALESCE(reserved_value,0) - ROUND(pendente * COALESCE(r.unit_value,0), 2)),
               updated_at = now()
         WHERE id = r.contract_item_id;
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(COALESCE(delivered_quantity,0)), 0) INTO entregue
    FROM public.supply_order_items WHERE supply_order_id = _order;

  UPDATE public.supply_orders
     SET status = CASE WHEN entregue > 0 THEN 'atendida'::public.supply_order_status
                       ELSE 'cancelada'::public.supply_order_status END,
         cancel_reason = _reason,
         cancelled_at = now(),
         updated_at = now()
   WHERE id = _order;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_supply_order_balance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_supply_order_balance(uuid, text) TO authenticated;

-- entradas excepcionais de estoque exigem justificativa
CREATE OR REPLACE FUNCTION public.guard_exceptional_stock_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind IN ('saldo_inicial','entrada_devolucao','entrada_doacao','ajuste_positivo','ajuste_negativo','saida_baixa')
     AND COALESCE(btrim(NEW.reason), '') = '' THEN
    RAISE EXCEPTION 'Movimentações excepcionais de estoque exigem justificativa.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_exceptional_stock_entry ON public.stock_movements;
CREATE TRIGGER trg_guard_exceptional_stock_entry BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_exceptional_stock_entry();

/* ---------------- BLOCO 4 — frota operacional ---------------- */

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS acquisition_kind text,
  ADD COLUMN IF NOT EXISTS condition_state text,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS acquisition_entity_id uuid REFERENCES public.external_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lease_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.vehicles.acquisition_kind IS 'Forma de incorporação: aquisicao | locado.';
COMMENT ON COLUMN public.vehicles.condition_state IS 'Estado na incorporação: novo | usado.';

ALTER TABLE public.vehicle_usages
  ADD COLUMN IF NOT EXISTS requester_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authorizer_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_city text,
  ADD COLUMN IF NOT EXISTS origin_state text,
  ADD COLUMN IF NOT EXISTS destination_city text,
  ADD COLUMN IF NOT EXISTS destination_state text;

CREATE TABLE IF NOT EXISTS public.legal_provisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.legal_provisions IS 'Dispositivos legais reutilizáveis (leis, decretos, portarias) usados em diárias.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_provisions TO authenticated;
GRANT ALL ON public.legal_provisions TO service_role;
ALTER TABLE public.legal_provisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "le dispositivos legais" ON public.legal_provisions;
CREATE POLICY "le dispositivos legais" ON public.legal_provisions FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
DROP POLICY IF EXISTS "cria dispositivos legais" ON public.legal_provisions;
CREATE POLICY "cria dispositivos legais" ON public.legal_provisions FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
DROP POLICY IF EXISTS "edita dispositivos legais" ON public.legal_provisions;
CREATE POLICY "edita dispositivos legais" ON public.legal_provisions FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_write())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());

CREATE UNIQUE INDEX IF NOT EXISTS legal_provisions_org_name_key
  ON public.legal_provisions (organization_id, lower(name));

DROP TRIGGER IF EXISTS touch_legal_provisions ON public.legal_provisions;
CREATE TRIGGER touch_legal_provisions BEFORE UPDATE ON public.legal_provisions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS audit_legal_provisions ON public.legal_provisions;
CREATE TRIGGER audit_legal_provisions AFTER INSERT OR UPDATE OR DELETE ON public.legal_provisions
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS requester_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS beneficiary_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approver_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legal_provision_id uuid REFERENCES public.legal_provisions(id) ON DELETE SET NULL;

ALTER TABLE public.fuel_types
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_item_id uuid REFERENCES public.contract_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_name text,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS contracted_quantity numeric,
  ADD COLUMN IF NOT EXISTS total_value numeric;

COMMENT ON COLUMN public.fuel_types.contract_item_id IS 'Quando preenchido, preço/quantidade/valor vêm do item contratual.';

ALTER TABLE public.fuel_authorizations
  ADD COLUMN IF NOT EXISTS fill_tank boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fuel_authorizations.fill_tank IS 'Autorização para completar o tanque (sem quantidade fixa).';

ALTER TABLE public.fuelings
  ADD COLUMN IF NOT EXISTS operator_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
