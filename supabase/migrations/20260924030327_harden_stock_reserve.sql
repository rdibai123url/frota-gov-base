-- ============================================================
-- FrotaGov
-- Reforço de integridade e concorrência das reservas de estoque
-- ============================================================

CREATE OR REPLACE FUNCTION public.stock_reserve(
  _warehouse uuid,
  _part uuid,
  _quantity numeric,
  _lot text DEFAULT '',
  _service_order uuid DEFAULT NULL,
  _supply_order uuid DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.current_org_id();
  _bal record;
  _rid uuid;
  _lot_norm text := COALESCE(_lot, '');
BEGIN
  IF _org IS NULL THEN
    RAISE EXCEPTION 'Nenhum órgão ativo selecionado.';
  END IF;

  IF NOT public.can_manage_maintenance() THEN
    RAISE EXCEPTION 'Sem permissão para reservar estoque.';
  END IF;

  IF _warehouse IS NULL OR _part IS NULL THEN
    RAISE EXCEPTION 'Informe o depósito e o item.';
  END IF;

  IF COALESCE(_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'A quantidade da reserva deve ser maior que zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.warehouses
     WHERE id = _warehouse
       AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Depósito não pertence ao órgão atual.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.parts_catalog
     WHERE id = _part
       AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Item não pertence ao órgão atual.';
  END IF;

  IF _service_order IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.service_orders
     WHERE id = _service_order
       AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Ordem de serviço não pertence ao órgão atual.';
  END IF;

  IF _supply_order IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.supply_orders
     WHERE id = _supply_order
       AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'OFP não pertence ao órgão atual.';
  END IF;

  SELECT *
    INTO _bal
    FROM public.stock_balances
   WHERE warehouse_id = _warehouse
     AND part_id = _part
     AND lot = _lot_norm
     AND organization_id = _org
   FOR UPDATE;

  IF _bal IS NULL THEN
    RAISE EXCEPTION 'Não existe saldo para este item, depósito e lote.';
  END IF;

  IF (_bal.quantity - _bal.reserved_quantity) < _quantity - 0.00005 THEN
    RAISE EXCEPTION 'Saldo livre insuficiente para reserva.';
  END IF;

  UPDATE public.stock_balances
     SET reserved_quantity = reserved_quantity + _quantity
   WHERE id = _bal.id;

  INSERT INTO public.stock_reservations (
    organization_id,
    warehouse_id,
    part_id,
    lot,
    quantity,
    service_order_id,
    supply_order_id,
    reason,
    created_by
  )
  VALUES (
    _org,
    _warehouse,
    _part,
    _lot_norm,
    _quantity,
    _service_order,
    _supply_order,
    NULLIF(btrim(_reason), ''),
    auth.uid()
  )
  RETURNING id INTO _rid;

  RETURN _rid;
END;
$$;

REVOKE ALL
ON FUNCTION public.stock_reserve(
  uuid,
  uuid,
  numeric,
  text,
  uuid,
  uuid,
  text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.stock_reserve(
  uuid,
  uuid,
  numeric,
  text,
  uuid,
  uuid,
  text
)
TO authenticated, service_role;