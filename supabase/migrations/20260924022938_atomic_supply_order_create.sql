-- ============================================================
-- FrotaGov
-- Criação atômica de Ordem de Fornecimento de Peças - OFP
-- ============================================================

CREATE OR REPLACE FUNCTION public.supply_order_create(
  _unit_id uuid DEFAULT NULL,
  _vehicle_id uuid DEFAULT NULL,
  _partner_id uuid DEFAULT NULL,
  _supplier_id uuid DEFAULT NULL,
  _expense_origin public.expense_origin DEFAULT 'contrato',
  _contract_id uuid DEFAULT NULL,
  _contract_item_id uuid DEFAULT NULL,
  _cost_center_id uuid DEFAULT NULL,
  _deadline_at date DEFAULT NULL,
  _delivery_place text DEFAULT NULL,
  _justification text DEFAULT NULL,
  _requester_name text DEFAULT NULL,
  _items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.current_org_id();
  _order_id uuid;
  _item jsonb;
  _part_id uuid;
  _description text;
  _measure_unit text;
  _quantity numeric;
  _unit_value numeric;
BEGIN
  IF _org IS NULL THEN
    RAISE EXCEPTION 'Nenhum órgão ativo selecionado.';
  END IF;

  IF NOT public.can_manage_maintenance() THEN
    RAISE EXCEPTION 'Sem permissão para criar OFP.';
  END IF;

  IF _items IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Inclua ao menos um item na OFP.';
  END IF;

  -- Valida vínculos básicos com o órgão.
  IF _unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = _unit_id
      AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Unidade inválida para o órgão atual.';
  END IF;

  IF _vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.vehicles
    WHERE id = _vehicle_id
      AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Ativo inválido para o órgão atual.';
  END IF;

  IF _supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.suppliers
    WHERE id = _supplier_id
      AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para o órgão atual.';
  END IF;

  IF _contract_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.contracts
    WHERE id = _contract_id
      AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Contrato inválido para o órgão atual.';
  END IF;

  IF _contract_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.contract_items
    WHERE id = _contract_item_id
      AND organization_id = _org
      AND (
        _contract_id IS NULL
        OR contract_id = _contract_id
      )
  ) THEN
    RAISE EXCEPTION 'Item contratual inválido para o órgão atual.';
  END IF;

  INSERT INTO public.supply_orders (
    organization_id,
    code,
    unit_id,
    vehicle_id,
    partner_id,
    supplier_id,
    expense_origin,
    contract_id,
    contract_item_id,
    cost_center_id,
    deadline_at,
    delivery_place,
    justification,
    requester_id,
    requester_name,
    created_by
  )
  VALUES (
    _org,
    '',
    _unit_id,
    _vehicle_id,
    _partner_id,
    _supplier_id,
    _expense_origin,
    _contract_id,
    _contract_item_id,
    _cost_center_id,
    _deadline_at,
    NULLIF(btrim(_delivery_place), ''),
    NULLIF(btrim(_justification), ''),
    auth.uid(),
    NULLIF(btrim(_requester_name), ''),
    auth.uid()
  )
  RETURNING id INTO _order_id;

  FOR _item IN
    SELECT value
    FROM jsonb_array_elements(_items)
  LOOP
    _part_id :=
      NULLIF(_item->>'part_id', '')::uuid;

    _description :=
      btrim(COALESCE(_item->>'description', ''));

    _measure_unit :=
      COALESCE(
        NULLIF(btrim(_item->>'measure_unit'), ''),
        'unidade'
      );

    _quantity :=
      COALESCE(
        NULLIF(_item->>'quantity', '')::numeric,
        0
      );

    _unit_value :=
      COALESCE(
        NULLIF(_item->>'unit_value', '')::numeric,
        0
      );

    IF _description = '' THEN
      RAISE EXCEPTION 'Todos os itens devem possuir descrição.';
    END IF;

    IF _quantity <= 0 THEN
      RAISE EXCEPTION 'A quantidade dos itens deve ser maior que zero.';
    END IF;

    IF _unit_value < 0 THEN
      RAISE EXCEPTION 'O valor unitário não pode ser negativo.';
    END IF;

    IF _part_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.parts_catalog
      WHERE id = _part_id
        AND organization_id = _org
    ) THEN
      RAISE EXCEPTION 'Peça informada não pertence ao órgão atual.';
    END IF;

    INSERT INTO public.supply_order_items (
      organization_id,
      supply_order_id,
      part_id,
      description,
      measure_unit,
      quantity,
      unit_value,
      created_by
    )
    VALUES (
      _org,
      _order_id,
      _part_id,
      _description,
      _measure_unit,
      _quantity,
      _unit_value,
      auth.uid()
    );
  END LOOP;

  RETURN _order_id;
END;
$$;


REVOKE ALL
ON FUNCTION public.supply_order_create(
  uuid,
  uuid,
  uuid,
  uuid,
  public.expense_origin,
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  text,
  jsonb
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.supply_order_create(
  uuid,
  uuid,
  uuid,
  uuid,
  public.expense_origin,
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  text,
  jsonb
)
TO authenticated, service_role;