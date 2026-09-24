-- ============================================================
-- FrotaGov
-- Transferência atômica de vários itens entre depósitos
-- ============================================================

CREATE OR REPLACE FUNCTION public.stock_transfer_batch(
  _from uuid,
  _to uuid,
  _items jsonb,
  _reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.current_org_id();
  _item jsonb;
  _part uuid;
  _quantity numeric;
  _lot text;
  _count integer := 0;
BEGIN
  IF _org IS NULL THEN
    RAISE EXCEPTION 'Nenhum órgão ativo selecionado.';
  END IF;

  IF NOT public.can_manage_maintenance() THEN
    RAISE EXCEPTION 'Sem permissão para transferir estoque.';
  END IF;

  IF _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'Informe os depósitos de origem e destino.';
  END IF;

  IF _from = _to THEN
    RAISE EXCEPTION 'Origem e destino devem ser diferentes.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses
    WHERE id = _from
      AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Depósito de origem inválido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouses
    WHERE id = _to
      AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Depósito de destino inválido.';
  END IF;

  IF _items IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item para transferência.';
  END IF;

  FOR _item IN
    SELECT value
    FROM jsonb_array_elements(_items)
  LOOP
    _part := NULLIF(_item->>'part_id', '')::uuid;
    _quantity := COALESCE(NULLIF(_item->>'quantity', '')::numeric, 0);
    _lot := COALESCE(_item->>'lot', '');

    IF _part IS NULL THEN
      RAISE EXCEPTION 'Item da transferência não informado.';
    END IF;

    IF _quantity <= 0 THEN
      RAISE EXCEPTION 'A quantidade de todos os itens deve ser maior que zero.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.parts_catalog
      WHERE id = _part
        AND organization_id = _org
    ) THEN
      RAISE EXCEPTION 'Item não pertence ao órgão atual.';
    END IF;

    PERFORM public.stock_transfer(
      _from,
      _to,
      _part,
      _quantity,
      _lot,
      NULLIF(btrim(_reason), '')
    );

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

REVOKE ALL
ON FUNCTION public.stock_transfer_batch(
  uuid,
  uuid,
  jsonb,
  text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.stock_transfer_batch(
  uuid,
  uuid,
  jsonb,
  text
)
TO authenticated, service_role;