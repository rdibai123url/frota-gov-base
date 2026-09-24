-- ============================================================
-- FrotaGov
-- Integridade na baixa de reservas de estoque
-- ============================================================

CREATE OR REPLACE FUNCTION public.stock_reservation_settle(
  _reservation uuid,
  _consume numeric DEFAULT 0,
  _release numeric DEFAULT 0,
  _vehicle uuid DEFAULT NULL,
  _odometer numeric DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.current_org_id();
  r record;
  _pending numeric;
  _consume_value numeric := COALESCE(_consume, 0);
  _release_value numeric := COALESCE(_release, 0);
BEGIN
  IF _org IS NULL THEN
    RAISE EXCEPTION 'Nenhum órgão ativo selecionado.';
  END IF;

  IF NOT public.can_manage_maintenance() THEN
    RAISE EXCEPTION 'Sem permissão para baixar reservas.';
  END IF;

  IF _reservation IS NULL THEN
    RAISE EXCEPTION 'Reserva não informada.';
  END IF;

  IF _consume_value < 0 OR _release_value < 0 THEN
    RAISE EXCEPTION 'As quantidades de consumo e liberação não podem ser negativas.';
  END IF;

  IF _consume_value = 0 AND _release_value = 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade para consumir ou liberar.';
  END IF;

  IF _consume_value > 0 AND _release_value > 0 THEN
    RAISE EXCEPTION 'Informe consumo ou liberação separadamente.';
  END IF;

  SELECT *
    INTO r
    FROM public.stock_reservations
   WHERE id = _reservation
     AND organization_id = _org
   FOR UPDATE;

  IF r IS NULL THEN
    RAISE EXCEPTION 'Reserva não encontrada.';
  END IF;

  IF r.status <> 'ativa' THEN
    RAISE EXCEPTION 'A reserva já foi encerrada.';
  END IF;

  _pending :=
    r.quantity
    - r.consumed_quantity
    - r.released_quantity;

  IF _pending <= 0.00005 THEN
    RAISE EXCEPTION 'A reserva não possui saldo pendente.';
  END IF;

  IF (_consume_value + _release_value) > _pending + 0.00005 THEN
    RAISE EXCEPTION
      'Quantidade acima do saldo reservado pendente (%).',
      _pending;
  END IF;

  IF _vehicle IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.vehicles
     WHERE id = _vehicle
       AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Veículo não pertence ao órgão atual.';
  END IF;

  UPDATE public.stock_balances
     SET reserved_quantity =
       GREATEST(
         reserved_quantity - (_consume_value + _release_value),
         0
       )
   WHERE warehouse_id = r.warehouse_id
     AND part_id = r.part_id
     AND lot = r.lot
     AND organization_id = _org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saldo de estoque vinculado à reserva não foi encontrado.';
  END IF;

  IF _consume_value > 0 THEN
    PERFORM public.stock_move(
      r.warehouse_id,
      r.part_id,
      CASE
        WHEN _vehicle IS NOT NULL
          THEN 'saida_aplicacao'::public.stock_movement_kind
        ELSE 'saida_manutencao'::public.stock_movement_kind
      END,
      _consume_value,
      0,
      r.lot,
      _vehicle,
      r.maintenance_record_id,
      r.service_order_id,
      r.supply_order_id,
      NULL,
      _odometer,
      NULL,
      NULL,
      COALESCE(
        NULLIF(btrim(_reason), ''),
        'Consumo de reserva'
      )
    );
  END IF;

  UPDATE public.stock_reservations
     SET consumed_quantity =
           consumed_quantity + _consume_value,
         released_quantity =
           released_quantity + _release_value,
         status =
           CASE
             WHEN quantity
                    - (consumed_quantity + _consume_value)
                    - (released_quantity + _release_value)
                  <= 0.00005
             THEN
               CASE
                 WHEN consumed_quantity + _consume_value > 0
                   THEN 'consumida'
                 ELSE 'liberada'
               END
             ELSE 'ativa'
           END
   WHERE id = r.id;
END;
$$;

REVOKE ALL
ON FUNCTION public.stock_reservation_settle(
  uuid,
  numeric,
  numeric,
  uuid,
  numeric,
  text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.stock_reservation_settle(
  uuid,
  numeric,
  numeric,
  uuid,
  numeric,
  text
)
TO authenticated, service_role;