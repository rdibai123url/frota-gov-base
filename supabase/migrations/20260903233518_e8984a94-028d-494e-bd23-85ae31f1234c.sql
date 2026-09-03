-- ===================== ORIGENS DE DESPESA ======================
ALTER TYPE public.expense_origin ADD VALUE IF NOT EXISTS 'suprimento_fundos';
ALTER TYPE public.expense_origin ADD VALUE IF NOT EXISTS 'terceiro';

-- ===================== CATÁLOGO DE PEÇAS =======================
ALTER TABLE public.parts_catalog
  ADD COLUMN IF NOT EXISTS part_group text,
  ADD COLUMN IF NOT EXISTS original_reference text,
  ADD COLUMN IF NOT EXISTS alternate_reference text,
  ADD COLUMN IF NOT EXISTS manufacturer text;

-- ================== COMPATIBILIDADE PEÇA × ATIVO ===============
CREATE TABLE public.part_compatibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'familia' CHECK (scope IN ('familia','ativo')),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  asset_class text CHECK (asset_class IN ('veiculo','equipamento')),
  brand text,
  model text,
  year_from integer,
  year_to integer,
  engine text,
  version text,
  equipment_type text,
  application text,
  active boolean NOT NULL DEFAULT true,
  inactivated_at timestamptz,
  inactivated_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX ON public.part_compatibilities (organization_id, part_id, active);
GRANT SELECT, INSERT, UPDATE ON public.part_compatibilities TO authenticated;
GRANT ALL ON public.part_compatibilities TO service_role;
ALTER TABLE public.part_compatibilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le compatibilidades" ON public.part_compatibilities FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
CREATE POLICY "cria compatibilidades" ON public.part_compatibilities FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());
CREATE POLICY "edita compatibilidades" ON public.part_compatibilities FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_maintenance())
  WITH CHECK (organization_id = current_org_id());

CREATE TABLE public.compatibility_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  vehicle_id uuid REFERENCES public.vehicles(id),
  context text NOT NULL,
  entity_id uuid,
  justification text NOT NULL,
  authorized_by uuid,
  authorized_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.compatibility_overrides TO authenticated;
GRANT ALL ON public.compatibility_overrides TO service_role;
ALTER TABLE public.compatibility_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le overrides" ON public.compatibility_overrides FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
CREATE POLICY "registra override" ON public.compatibility_overrides FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());

-- =============== ORDEM DE FORNECIMENTO DE PEÇAS ================
CREATE TYPE public.supply_order_status AS ENUM
  ('rascunho','aguardando_aprovacao','aprovada','parcialmente_atendida','atendida','rejeitada','cancelada');

CREATE TABLE public.supply_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  unit_id uuid REFERENCES public.units(id),
  vehicle_id uuid REFERENCES public.vehicles(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  partner_id uuid REFERENCES public.accredited_partners(id),
  quotation_id uuid REFERENCES public.quotations(id),
  requester_id uuid,
  requester_name text,
  expense_origin public.expense_origin NOT NULL DEFAULT 'contrato',
  cost_center_id uuid REFERENCES public.cost_centers(id),
  contract_id uuid REFERENCES public.contracts(id),
  contract_item_id uuid REFERENCES public.contract_items(id),
  commitment_id uuid REFERENCES public.commitments(id),
  quota_id uuid REFERENCES public.quotas(id),
  max_value numeric(14,2),
  reserved_value numeric(14,2) NOT NULL DEFAULT 0,
  consumed_value numeric(14,2) NOT NULL DEFAULT 0,
  budget_reserved boolean NOT NULL DEFAULT false,
  deadline_at date,
  delivery_place text,
  justification text,
  status public.supply_order_status NOT NULL DEFAULT 'rascunho',
  issued_at timestamptz,
  delivered_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid,
  cancel_reason text,
  attachment_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.supply_orders TO authenticated;
GRANT ALL ON public.supply_orders TO service_role;
ALTER TABLE public.supply_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le ofp" ON public.supply_orders FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR partner_id = my_partner_id());
CREATE POLICY "cria ofp" ON public.supply_orders FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());
CREATE POLICY "edita ofp" ON public.supply_orders FOR UPDATE TO authenticated
  USING ((organization_id = current_org_id() AND can_manage_maintenance()) OR partner_id = my_partner_id())
  WITH CHECK (organization_id = current_org_id());

CREATE TABLE public.supply_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supply_order_id uuid NOT NULL REFERENCES public.supply_orders(id) ON DELETE CASCADE,
  part_id uuid REFERENCES public.parts_catalog(id),
  description text NOT NULL,
  measure_unit text,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  delivered_quantity numeric(14,4) NOT NULL DEFAULT 0,
  unit_value numeric(14,4) NOT NULL DEFAULT 0,
  max_value numeric(14,2) GENERATED ALWAYS AS (ROUND(quantity * unit_value, 2)) STORED,
  delivered_value numeric(14,2) NOT NULL DEFAULT 0,
  document_number text,
  compatibility_warning text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.supply_order_items TO authenticated;
GRANT ALL ON public.supply_order_items TO service_role;
ALTER TABLE public.supply_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le itens ofp" ON public.supply_order_items FOR SELECT TO authenticated
  USING (organization_id = current_org_id()
         OR EXISTS (SELECT 1 FROM public.supply_orders o
                    WHERE o.id = supply_order_id AND o.partner_id = my_partner_id()));
CREATE POLICY "cria itens ofp" ON public.supply_order_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());
CREATE POLICY "edita itens ofp" ON public.supply_order_items FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_maintenance())
  WITH CHECK (organization_id = current_org_id());

-- ========================= ALMOXARIFADO ========================
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id),
  name text NOT NULL,
  code text,
  address text,
  responsible_name text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, name)
);
GRANT SELECT, INSERT, UPDATE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le almoxarifados" ON public.warehouses FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
CREATE POLICY "cria almoxarifados" ON public.warehouses FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());
CREATE POLICY "edita almoxarifados" ON public.warehouses FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_maintenance())
  WITH CHECK (organization_id = current_org_id());

CREATE TABLE public.stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id) ON DELETE CASCADE,
  lot text NOT NULL DEFAULT '',
  quantity numeric(14,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity numeric(14,4) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  average_cost numeric(14,4) NOT NULL DEFAULT 0,
  min_quantity numeric(14,4),
  max_quantity numeric(14,4),
  location text,
  expires_at date,
  last_movement_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, part_id, lot)
);
GRANT SELECT, INSERT, UPDATE ON public.stock_balances TO authenticated;
GRANT ALL ON public.stock_balances TO service_role;
ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le saldos" ON public.stock_balances FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
CREATE POLICY "gestao saldos" ON public.stock_balances FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_maintenance())
  WITH CHECK (organization_id = current_org_id());
CREATE POLICY "cria saldos" ON public.stock_balances FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());

CREATE TYPE public.stock_movement_kind AS ENUM
  ('entrada_compra','entrada_ofp','entrada_devolucao','entrada_doacao','entrada_transferencia',
   'saldo_inicial','saida_aplicacao','saida_manutencao','saida_consumo','saida_transferencia',
   'saida_baixa','saida_devolucao','ajuste_positivo','ajuste_negativo','estorno');

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  lot text NOT NULL DEFAULT '',
  kind public.stock_movement_kind NOT NULL,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit_value numeric(14,4) NOT NULL DEFAULT 0,
  total_value numeric(14,2) GENERATED ALWAYS AS (ROUND(quantity * unit_value, 2)) STORED,
  expense_origin public.expense_origin,
  vehicle_id uuid REFERENCES public.vehicles(id),
  maintenance_record_id uuid REFERENCES public.maintenance_records(id),
  service_order_id uuid REFERENCES public.service_orders(id),
  supply_order_id uuid REFERENCES public.supply_orders(id),
  target_warehouse_id uuid REFERENCES public.warehouses(id),
  inventory_id uuid,
  odometer_km numeric(14,2),
  hour_meter numeric(14,2),
  warranty_days integer,
  document_number text,
  attachment_path text,
  reason text,
  reversed_movement_id uuid REFERENCES public.stock_movements(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX ON public.stock_movements (organization_id, occurred_at DESC);
CREATE INDEX ON public.stock_movements (part_id, warehouse_id);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le movimentacoes" ON public.stock_movements FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
CREATE POLICY "registra movimentacoes" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());

CREATE TABLE public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  lot text NOT NULL DEFAULT '',
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  consumed_quantity numeric(14,4) NOT NULL DEFAULT 0,
  released_quantity numeric(14,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','consumida','liberada')),
  service_order_id uuid REFERENCES public.service_orders(id),
  supply_order_id uuid REFERENCES public.supply_orders(id),
  maintenance_record_id uuid REFERENCES public.maintenance_records(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.stock_reservations TO authenticated;
GRANT ALL ON public.stock_reservations TO service_role;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le reservas estoque" ON public.stock_reservations FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
CREATE POLICY "cria reservas estoque" ON public.stock_reservations FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());
CREATE POLICY "edita reservas estoque" ON public.stock_reservations FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_maintenance())
  WITH CHECK (organization_id = current_org_id());

CREATE TABLE public.inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_contagem','finalizado','cancelado')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  responsible_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.inventories TO authenticated;
GRANT ALL ON public.inventories TO service_role;
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le inventarios" ON public.inventories FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
CREATE POLICY "cria inventarios" ON public.inventories FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());
CREATE POLICY "edita inventarios" ON public.inventories FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_maintenance())
  WITH CHECK (organization_id = current_org_id());

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.parts_catalog(id),
  lot text NOT NULL DEFAULT '',
  system_quantity numeric(14,4) NOT NULL DEFAULT 0,
  counted_quantity numeric(14,4),
  difference numeric(14,4) GENERATED ALWAYS AS (COALESCE(counted_quantity, 0) - system_quantity) STORED,
  justification text,
  adjusted boolean NOT NULL DEFAULT false,
  adjusted_at timestamptz,
  adjusted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "le itens inventario" ON public.inventory_items FOR SELECT TO authenticated
  USING (organization_id = current_org_id());
CREATE POLICY "cria itens inventario" ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_maintenance());
CREATE POLICY "edita itens inventario" ON public.inventory_items FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_maintenance())
  WITH CHECK (organization_id = current_org_id());

-- ================= TRIGGERS DE ATUALIZAÇÃO =====================
CREATE TRIGGER trg_part_compat_updated BEFORE UPDATE ON public.part_compatibilities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_supply_orders_updated BEFORE UPDATE ON public.supply_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_supply_order_items_updated BEFORE UPDATE ON public.supply_order_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_stock_balances_updated BEFORE UPDATE ON public.stock_balances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_stock_reservations_updated BEFORE UPDATE ON public.stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_inventories_updated BEFORE UPDATE ON public.inventories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_inventory_items_updated BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- código automático da OFP e do inventário
CREATE OR REPLACE FUNCTION public.supply_order_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(btrim(NEW.code), '') = '' THEN
    NEW.code := next_org_code(NEW.organization_id, 'supply_order', 'OFP');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_supply_order_code BEFORE INSERT ON public.supply_orders
  FOR EACH ROW EXECUTE FUNCTION public.supply_order_code();

CREATE OR REPLACE FUNCTION public.inventory_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(btrim(NEW.code), '') = '' THEN
    NEW.code := next_org_code(NEW.organization_id, 'inventory', 'INV');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_inventory_code BEFORE INSERT ON public.inventories
  FOR EACH ROW EXECUTE FUNCTION public.inventory_code();

-- ============ COMPATIBILIDADE: FUNÇÃO DE VERIFICAÇÃO ===========
CREATE OR REPLACE FUNCTION public.part_is_compatible(_part uuid, _vehicle uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _vehicle IS NULL THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.part_compatibilities pc
                     WHERE pc.part_id = _part AND pc.active) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.part_compatibilities pc
      JOIN public.vehicles v ON v.id = _vehicle
      WHERE pc.part_id = _part AND pc.active
        AND (pc.vehicle_id IS NULL OR pc.vehicle_id = v.id)
        AND (pc.asset_class IS NULL OR pc.asset_class = COALESCE(v.asset_class, 'veiculo'))
        AND (pc.brand IS NULL OR upper(btrim(pc.brand)) = upper(btrim(COALESCE(v.brand, ''))))
        AND (pc.model IS NULL OR upper(btrim(v.model)) LIKE upper(btrim(pc.model)) || '%')
        AND (pc.equipment_type IS NULL OR pc.equipment_type = COALESCE(v.equipment_type, v.vehicle_type))
        AND (pc.year_from IS NULL OR COALESCE(v.year_model, pc.year_from) >= pc.year_from)
        AND (pc.year_to IS NULL OR COALESCE(v.year_model, pc.year_to) <= pc.year_to)
    )
  END;
$$;

-- ================= ESTOQUE: MOVIMENTAÇÃO E SALDOS ==============
CREATE OR REPLACE FUNCTION public.stock_move(
  _warehouse uuid, _part uuid, _kind public.stock_movement_kind, _quantity numeric,
  _unit_value numeric DEFAULT 0, _lot text DEFAULT '', _vehicle uuid DEFAULT NULL,
  _maintenance uuid DEFAULT NULL, _service_order uuid DEFAULT NULL, _supply_order uuid DEFAULT NULL,
  _target_warehouse uuid DEFAULT NULL, _odometer numeric DEFAULT NULL, _hour_meter numeric DEFAULT NULL,
  _document text DEFAULT NULL, _reason text DEFAULT NULL, _expense_origin public.expense_origin DEFAULT NULL,
  _override_justification text DEFAULT NULL, _occurred_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := current_org_id(); _sign int; _bal record; _mid uuid; _lot text := COALESCE(_lot, '');
  _at timestamptz := COALESCE(_occurred_at, now());
BEGIN
  IF NOT can_manage_maintenance() THEN RAISE EXCEPTION 'Sem permissão para movimentar o almoxarifado'; END IF;
  IF COALESCE(_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Informe uma quantidade maior que zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = _warehouse AND w.organization_id = _org) THEN
    RAISE EXCEPTION 'Almoxarifado não encontrado neste órgão';
  END IF;

  _sign := CASE WHEN _kind::text LIKE 'entrada%' OR _kind = 'saldo_inicial' OR _kind = 'ajuste_positivo'
                THEN 1 ELSE -1 END;

  -- compatibilidade na aplicação em ativo
  IF _vehicle IS NOT NULL AND _kind IN ('saida_aplicacao','saida_manutencao') THEN
    IF NOT part_is_compatible(_part, _vehicle) THEN
      IF COALESCE(btrim(_override_justification), '') = '' THEN
        RAISE EXCEPTION 'Peça incompatível com o ativo selecionado. Informe justificativa para liberação excepcional.';
      END IF;
      INSERT INTO public.compatibility_overrides
        (organization_id, part_id, vehicle_id, context, entity_id, justification, authorized_by, authorized_name)
      VALUES (_org, _part, _vehicle, 'saida_estoque', _service_order, _override_justification, auth.uid(),
              (SELECT full_name FROM public.profiles WHERE id = auth.uid()));
    END IF;
  END IF;

  SELECT * INTO _bal FROM public.stock_balances
   WHERE warehouse_id = _warehouse AND part_id = _part AND lot = _lot FOR UPDATE;
  IF _bal IS NULL THEN
    INSERT INTO public.stock_balances (organization_id, warehouse_id, part_id, lot)
    VALUES (_org, _warehouse, _part, _lot) RETURNING * INTO _bal;
  END IF;

  IF _sign < 0 AND _bal.quantity - _quantity < -0.00005 THEN
    RAISE EXCEPTION 'Saldo insuficiente no almoxarifado (disponível: %).', _bal.quantity;
  END IF;
  IF _sign < 0 AND _kind <> 'estorno'
     AND (_bal.quantity - _bal.reserved_quantity) - _quantity < -0.00005 THEN
    RAISE EXCEPTION 'Saldo livre insuficiente: % em estoque, % reservados.',
      _bal.quantity, _bal.reserved_quantity;
  END IF;

  UPDATE public.stock_balances SET
    quantity = quantity + (_sign * _quantity),
    average_cost = CASE WHEN _sign > 0 AND COALESCE(_unit_value, 0) > 0
      THEN ROUND(((quantity * average_cost) + (_quantity * _unit_value)) / NULLIF(quantity + _quantity, 0), 4)
      ELSE average_cost END,
    last_movement_at = _at
  WHERE id = _bal.id;

  INSERT INTO public.stock_movements (
    organization_id, warehouse_id, part_id, lot, kind, quantity, unit_value, expense_origin,
    vehicle_id, maintenance_record_id, service_order_id, supply_order_id, target_warehouse_id,
    odometer_km, hour_meter, document_number, reason, occurred_at, created_by
  ) VALUES (
    _org, _warehouse, _part, _lot, _kind, _quantity, COALESCE(_unit_value, _bal.average_cost, 0),
    _expense_origin, _vehicle, _maintenance, _service_order, _supply_order, _target_warehouse,
    _odometer, _hour_meter, _document, _reason, _at, auth.uid()
  ) RETURNING id INTO _mid;

  -- aplicação em ativo alimenta histórico/TCO pelo registro de peças
  IF _kind = 'saida_aplicacao' AND _vehicle IS NOT NULL THEN
    INSERT INTO public.maintenance_parts (
      organization_id, part_id, vehicle_id, description, quantity, unit_value,
      installed_at, odometer_km, hour_meter, notes, created_by
    )
    SELECT _org, _part, _vehicle, p.description, _quantity,
           COALESCE(NULLIF(_unit_value, 0), _bal.average_cost, 0),
           _at::date, _odometer, _hour_meter,
           'Baixa de almoxarifado — ' || COALESCE(_reason, 'aplicação em ativo'), auth.uid()
    FROM public.parts_catalog p WHERE p.id = _part;
  END IF;

  RETURN _mid;
END $$;

CREATE OR REPLACE FUNCTION public.stock_transfer(
  _from uuid, _to uuid, _part uuid, _quantity numeric, _lot text DEFAULT '', _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cost numeric;
BEGIN
  IF _from = _to THEN RAISE EXCEPTION 'Selecione almoxarifados diferentes'; END IF;
  SELECT average_cost INTO _cost FROM public.stock_balances
   WHERE warehouse_id = _from AND part_id = _part AND lot = COALESCE(_lot, '');
  PERFORM stock_move(_from, _part, 'saida_transferencia', _quantity, COALESCE(_cost, 0), _lot,
                     NULL, NULL, NULL, NULL, _to, NULL, NULL, NULL, _reason);
  PERFORM stock_move(_to, _part, 'entrada_transferencia', _quantity, COALESCE(_cost, 0), _lot,
                     NULL, NULL, NULL, NULL, _from, NULL, NULL, NULL, _reason);
END $$;

CREATE OR REPLACE FUNCTION public.stock_reserve(
  _warehouse uuid, _part uuid, _quantity numeric, _lot text DEFAULT '',
  _service_order uuid DEFAULT NULL, _supply_order uuid DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := current_org_id(); _bal record; _rid uuid;
BEGIN
  IF NOT can_manage_maintenance() THEN RAISE EXCEPTION 'Sem permissão para reservar estoque'; END IF;
  SELECT * INTO _bal FROM public.stock_balances
   WHERE warehouse_id = _warehouse AND part_id = _part AND lot = COALESCE(_lot, '') FOR UPDATE;
  IF _bal IS NULL OR (_bal.quantity - _bal.reserved_quantity) < _quantity - 0.00005 THEN
    RAISE EXCEPTION 'Saldo livre insuficiente para reserva';
  END IF;
  UPDATE public.stock_balances SET reserved_quantity = reserved_quantity + _quantity WHERE id = _bal.id;
  INSERT INTO public.stock_reservations
    (organization_id, warehouse_id, part_id, lot, quantity, service_order_id, supply_order_id, reason, created_by)
  VALUES (_org, _warehouse, _part, COALESCE(_lot, ''), _quantity, _service_order, _supply_order, _reason, auth.uid())
  RETURNING id INTO _rid;
  RETURN _rid;
END $$;

CREATE OR REPLACE FUNCTION public.stock_reservation_settle(
  _reservation uuid, _consume numeric DEFAULT 0, _release numeric DEFAULT 0,
  _vehicle uuid DEFAULT NULL, _odometer numeric DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _pending numeric;
BEGIN
  IF NOT can_manage_maintenance() THEN RAISE EXCEPTION 'Sem permissão para baixar reservas'; END IF;
  SELECT * INTO r FROM public.stock_reservations WHERE id = _reservation
    AND organization_id = current_org_id() FOR UPDATE;
  IF r IS NULL THEN RAISE EXCEPTION 'Reserva não encontrada'; END IF;
  _pending := r.quantity - r.consumed_quantity - r.released_quantity;
  IF COALESCE(_consume, 0) + COALESCE(_release, 0) > _pending + 0.00005 THEN
    RAISE EXCEPTION 'Quantidade acima do saldo reservado pendente (%).', _pending;
  END IF;

  UPDATE public.stock_balances
     SET reserved_quantity = GREATEST(reserved_quantity - (COALESCE(_consume,0) + COALESCE(_release,0)), 0)
   WHERE warehouse_id = r.warehouse_id AND part_id = r.part_id AND lot = r.lot;

  IF COALESCE(_consume, 0) > 0 THEN
    PERFORM stock_move(r.warehouse_id, r.part_id,
      CASE WHEN _vehicle IS NOT NULL THEN 'saida_aplicacao'::stock_movement_kind
           ELSE 'saida_manutencao'::stock_movement_kind END,
      _consume, 0, r.lot, _vehicle, r.maintenance_record_id, r.service_order_id, r.supply_order_id,
      NULL, _odometer, NULL, NULL, COALESCE(_reason, 'Consumo de reserva'));
  END IF;

  UPDATE public.stock_reservations SET
    consumed_quantity = consumed_quantity + COALESCE(_consume, 0),
    released_quantity = released_quantity + COALESCE(_release, 0),
    status = CASE WHEN quantity - (consumed_quantity + COALESCE(_consume,0))
                             - (released_quantity + COALESCE(_release,0)) <= 0.00005
                  THEN CASE WHEN consumed_quantity + COALESCE(_consume,0) > 0 THEN 'consumida' ELSE 'liberada' END
                  ELSE 'ativa' END
  WHERE id = r.id;
END $$;

-- ===================== OFP: FLUXO OPERACIONAL ==================
CREATE OR REPLACE FUNCTION public.supply_order_issue(_order uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; _total numeric;
BEGIN
  IF NOT can_manage_maintenance() THEN RAISE EXCEPTION 'Sem permissão para emitir OFP'; END IF;
  SELECT * INTO o FROM public.supply_orders WHERE id = _order AND organization_id = current_org_id() FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'OFP não encontrada'; END IF;
  IF o.status NOT IN ('rascunho','aguardando_aprovacao') THEN
    RAISE EXCEPTION 'OFP % já foi processada (%).', o.code, o.status;
  END IF;
  SELECT COALESCE(sum(max_value), 0) INTO _total FROM public.supply_order_items WHERE supply_order_id = o.id;
  IF _total <= 0 THEN RAISE EXCEPTION 'Inclua ao menos um item com quantidade e valor'; END IF;

  IF o.expense_origin = 'contrato' AND o.contract_item_id IS NOT NULL THEN
    PERFORM budget_reserve(o.organization_id, o.contract_item_id, o.commitment_id, o.quota_id, NULL, _total);
  END IF;

  UPDATE public.supply_orders SET status = 'aprovada', issued_at = now(),
    max_value = _total, reserved_value = CASE WHEN o.expense_origin = 'contrato' AND o.contract_item_id IS NOT NULL
      THEN _total ELSE 0 END,
    budget_reserved = (o.expense_origin = 'contrato' AND o.contract_item_id IS NOT NULL),
    updated_by = auth.uid()
  WHERE id = o.id;
END $$;

CREATE OR REPLACE FUNCTION public.supply_order_deliver(
  _item uuid, _quantity numeric, _unit_value numeric DEFAULT NULL,
  _document text DEFAULT NULL, _warehouse uuid DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it record; o record; _pending numeric; _value numeric; _partner uuid := my_partner_id();
BEGIN
  SELECT * INTO it FROM public.supply_order_items WHERE id = _item FOR UPDATE;
  IF it IS NULL THEN RAISE EXCEPTION 'Item da OFP não encontrado'; END IF;
  SELECT * INTO o FROM public.supply_orders WHERE id = it.supply_order_id FOR UPDATE;
  IF _partner IS NULL AND NOT can_manage_maintenance() THEN
    RAISE EXCEPTION 'Sem permissão para registrar atendimento';
  END IF;
  IF _partner IS NOT NULL AND o.partner_id IS DISTINCT FROM _partner THEN
    RAISE EXCEPTION 'OFP emitida para outro credenciado';
  END IF;
  IF o.status NOT IN ('aprovada','parcialmente_atendida') THEN
    RAISE EXCEPTION 'OFP % não está disponível para atendimento (%).', o.code, o.status;
  END IF;
  _pending := it.quantity - it.delivered_quantity;
  IF _quantity > _pending + 0.00005 THEN
    RAISE EXCEPTION 'Quantidade acima do saldo autorizado do item (pendente: %).', _pending;
  END IF;
  _value := ROUND(_quantity * COALESCE(_unit_value, it.unit_value), 2);
  IF COALESCE(_unit_value, it.unit_value) > it.unit_value + 0.0001 THEN
    RAISE EXCEPTION 'Preço unitário acima do autorizado';
  END IF;

  UPDATE public.supply_order_items SET
    delivered_quantity = delivered_quantity + _quantity,
    delivered_value = delivered_value + _value,
    document_number = COALESCE(_document, document_number),
    notes = COALESCE(_notes, notes)
  WHERE id = it.id;

  IF o.budget_reserved AND o.contract_item_id IS NOT NULL THEN
    PERFORM budget_consume(o.organization_id, o.contract_item_id, o.commitment_id, o.quota_id,
                           NULL, _value, true);
  END IF;

  IF _warehouse IS NOT NULL AND it.part_id IS NOT NULL THEN
    PERFORM stock_move(_warehouse, it.part_id, 'entrada_ofp', _quantity,
                       COALESCE(_unit_value, it.unit_value), '', NULL, NULL, NULL, o.id,
                       NULL, NULL, NULL, _document, 'Entrada por OFP ' || o.code, o.expense_origin);
  END IF;

  UPDATE public.supply_orders SET
    consumed_value = consumed_value + _value,
    reserved_value = GREATEST(reserved_value - _value, 0),
    delivered_at = now(),
    status = CASE WHEN NOT EXISTS (
        SELECT 1 FROM public.supply_order_items i
        WHERE i.supply_order_id = o.id AND i.delivered_quantity < i.quantity - 0.00005)
      THEN 'atendida'::supply_order_status ELSE 'parcialmente_atendida'::supply_order_status END
  WHERE id = o.id;
END $$;

CREATE OR REPLACE FUNCTION public.supply_order_cancel(_order uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF NOT can_manage_maintenance() THEN RAISE EXCEPTION 'Sem permissão para cancelar OFP'; END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
  SELECT * INTO o FROM public.supply_orders WHERE id = _order AND organization_id = current_org_id() FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'OFP não encontrada'; END IF;
  IF o.status IN ('cancelada','atendida') THEN RAISE EXCEPTION 'OFP % não pode ser cancelada (%).', o.code, o.status; END IF;
  IF o.budget_reserved AND o.reserved_value > 0 AND o.contract_item_id IS NOT NULL THEN
    PERFORM budget_release(o.organization_id, o.contract_item_id, o.commitment_id, o.quota_id, NULL, o.reserved_value);
  END IF;
  UPDATE public.supply_orders SET status = 'cancelada', cancel_reason = _reason,
    reserved_value = 0, budget_reserved = false, updated_by = auth.uid()
  WHERE id = o.id;
END $$;

-- ===================== INVENTÁRIO: AJUSTE ======================
CREATE OR REPLACE FUNCTION public.inventory_apply(_inventory uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; it record; _n int := 0; _diff numeric;
BEGIN
  IF NOT can_manage_maintenance() THEN RAISE EXCEPTION 'Sem permissão para finalizar inventário'; END IF;
  SELECT * INTO inv FROM public.inventories WHERE id = _inventory AND organization_id = current_org_id() FOR UPDATE;
  IF inv IS NULL THEN RAISE EXCEPTION 'Inventário não encontrado'; END IF;
  IF inv.status = 'finalizado' THEN RAISE EXCEPTION 'Inventário já finalizado'; END IF;

  FOR it IN SELECT * FROM public.inventory_items WHERE inventory_id = inv.id AND counted_quantity IS NOT NULL LOOP
    _diff := it.counted_quantity - it.system_quantity;
    IF abs(_diff) > 0.00005 THEN
      IF COALESCE(btrim(it.justification), '') = '' THEN
        RAISE EXCEPTION 'Divergência sem justificativa no item %.', it.part_id;
      END IF;
      PERFORM stock_move(inv.warehouse_id, it.part_id,
        CASE WHEN _diff > 0 THEN 'ajuste_positivo'::stock_movement_kind ELSE 'ajuste_negativo'::stock_movement_kind END,
        abs(_diff), 0, it.lot, NULL, NULL, NULL, NULL, NULL, NULL, NULL, inv.code,
        'Ajuste de inventário — ' || it.justification);
      _n := _n + 1;
    END IF;
    UPDATE public.inventory_items SET adjusted = true, adjusted_at = now(), adjusted_by = auth.uid()
     WHERE id = it.id;
  END LOOP;

  UPDATE public.inventories SET status = 'finalizado', closed_at = now(), updated_by = auth.uid()
   WHERE id = inv.id;
  RETURN _n;
END $$;

-- Execução restrita a usuários autenticados
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN ('part_is_compatible','stock_move','stock_transfer','stock_reserve',
                        'stock_reservation_settle','supply_order_issue','supply_order_deliver',
                        'supply_order_cancel','inventory_apply','supply_order_code','inventory_code')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;