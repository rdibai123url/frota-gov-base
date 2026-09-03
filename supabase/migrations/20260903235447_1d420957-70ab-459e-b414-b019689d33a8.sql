CREATE OR REPLACE FUNCTION public.stock_move(_warehouse uuid, _part uuid, _kind stock_movement_kind, _quantity numeric, _unit_value numeric DEFAULT 0, _lot text DEFAULT ''::text, _vehicle uuid DEFAULT NULL::uuid, _maintenance uuid DEFAULT NULL::uuid, _service_order uuid DEFAULT NULL::uuid, _supply_order uuid DEFAULT NULL::uuid, _target_warehouse uuid DEFAULT NULL::uuid, _odometer numeric DEFAULT NULL::numeric, _hour_meter numeric DEFAULT NULL::numeric, _document text DEFAULT NULL::text, _reason text DEFAULT NULL::text, _expense_origin expense_origin DEFAULT NULL::expense_origin, _override_justification text DEFAULT NULL::text, _occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    _org, _warehouse, _part, _lot, _kind, _quantity, COALESCE(NULLIF(_unit_value,0), _bal.average_cost, 0),
    _expense_origin, _vehicle, _maintenance, _service_order, _supply_order, _target_warehouse,
    _odometer, _hour_meter, _document, _reason, _at, auth.uid()
  ) RETURNING id INTO _mid;

  -- Com ordem de manutenção vinculada, a peça é registrada nela (e já entra no TCO por lá).
  -- Sem ordem, o custo entra no TCO pela própria movimentação de estoque.
  IF _kind = 'saida_aplicacao' AND _vehicle IS NOT NULL AND _maintenance IS NOT NULL THEN
    INSERT INTO public.maintenance_parts (
      organization_id, maintenance_record_id, part_id, vehicle_id, description, quantity, unit_value,
      installed_at, odometer_km, hour_meter, notes, created_by
    )
    SELECT _org, _maintenance, _part, _vehicle, p.description, _quantity,
           COALESCE(NULLIF(_unit_value, 0), _bal.average_cost, 0),
           _at::date, _odometer, _hour_meter,
           'Baixa de almoxarifado — ' || COALESCE(_reason, 'aplicação em ativo'), auth.uid()
    FROM public.parts_catalog p WHERE p.id = _part;
  END IF;

  RETURN _mid;
END $function$;

-- TCO passa a considerar peças/materiais aplicados diretamente pelo almoxarifado
CREATE OR REPLACE FUNCTION public.fleet_cost_rows(_from date, _to date, _unit uuid DEFAULT NULL::uuid, _cost_center uuid DEFAULT NULL::uuid, _vehicle uuid DEFAULT NULL::uuid, _asset_class text DEFAULT NULL::text)
 RETURNS TABLE(vehicle_id uuid, asset_label text, asset_class text, brand text, model text, category_asset text, unit_id uuid, unit_name text, cost_center_id uuid, cost_center_name text, competence date, category text, value numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH raw AS (
    SELECT f.vehicle_id, f.unit_id, f.cost_center_id, date_trunc('month', f.fueled_at)::date AS competence,
           'combustivel'::text AS category, COALESCE(f.total_value,0) AS value
    FROM public.fuelings f
    WHERE f.organization_id = current_org_id() AND f.status <> 'cancelado'
      AND f.fueled_at >= _from::timestamptz AND f.fueled_at < (_to + 1)::timestamptz
    UNION ALL
    SELECT m.vehicle_id, m.unit_id, m.cost_center_id, date_trunc('month', m.entry_at)::date,
           'manutencao', COALESCE(m.labor_value,0) + COALESCE(m.other_value,0)
    FROM public.maintenance_records m
    WHERE m.organization_id = current_org_id() AND m.status <> 'cancelada'
      AND m.entry_at >= _from::timestamptz AND m.entry_at < (_to + 1)::timestamptz
    UNION ALL
    SELECT m.vehicle_id, m.unit_id, m.cost_center_id, date_trunc('month', m.entry_at)::date,
           'pecas', COALESCE(m.parts_value,0)
    FROM public.maintenance_records m
    WHERE m.organization_id = current_org_id() AND m.status <> 'cancelada'
      AND m.entry_at >= _from::timestamptz AND m.entry_at < (_to + 1)::timestamptz
    UNION ALL
    SELECT sm.vehicle_id, NULL::uuid, NULL::uuid, date_trunc('month', sm.occurred_at)::date,
           'pecas', COALESCE(sm.quantity,0) * COALESCE(sm.unit_value,0)
    FROM public.stock_movements sm
    WHERE sm.organization_id = current_org_id() AND sm.vehicle_id IS NOT NULL
      AND sm.kind = 'saida_aplicacao' AND sm.maintenance_record_id IS NULL
      AND sm.occurred_at >= _from::timestamptz AND sm.occurred_at < (_to + 1)::timestamptz
    UNION ALL
    SELECT t.vehicle_id, NULL::uuid, NULL::uuid, date_trunc('month', t.purchase_date)::date,
           'pneus', COALESCE(t.purchase_value,0)
    FROM public.tires t
    WHERE t.organization_id = current_org_id() AND t.vehicle_id IS NOT NULL
      AND t.purchase_date IS NOT NULL
      AND t.purchase_date >= _from AND t.purchase_date <= _to
    UNION ALL
    SELECT c.vehicle_id, c.unit_id, c.cost_center_id, date_trunc('month', c.performed_at)::date,
           'limpeza', COALESCE(c.total_value,0)
    FROM public.vehicle_cleanings c
    WHERE c.organization_id = current_org_id() AND c.status <> 'cancelada'
      AND c.performed_at >= _from::timestamptz AND c.performed_at < (_to + 1)::timestamptz
    UNION ALL
    SELECT iv.vehicle_id, NULL::uuid, NULL::uuid, date_trunc('month', p.valid_from)::date,
           'seguro',
           COALESCE(p.premium_value,0) / GREATEST(1, (SELECT count(*) FROM public.insurance_vehicles x WHERE x.policy_id = p.id))
    FROM public.insurance_vehicles iv
    JOIN public.insurance_policies p ON p.id = iv.policy_id
    WHERE iv.organization_id = current_org_id() AND p.status <> 'cancelada'
      AND p.valid_from >= _from AND p.valid_from <= _to
    UNION ALL
    SELECT tf.vehicle_id, tf.unit_id, NULL::uuid,
           date_trunc('month', COALESCE(tf.paid_at, tf.occurred_at))::date,
           'multas', COALESCE(tf.paid_amount, tf.amount, 0)
    FROM public.traffic_fines tf
    WHERE tf.organization_id = current_org_id() AND tf.status <> 'cancelada'
      AND COALESCE(tf.paid_at, tf.occurred_at) >= _from::timestamptz
      AND COALESCE(tf.paid_at, tf.occurred_at) < (_to + 1)::timestamptz
    UNION ALL
    SELECT o.vehicle_id, NULL::uuid, NULL::uuid,
           date_trunc('month', COALESCE(o.paid_at::date, o.due_date))::date,
           'obrigacoes', COALESCE(o.paid_amount, o.amount, 0)
    FROM public.vehicle_obligations o
    WHERE o.organization_id = current_org_id() AND o.status <> 'cancelada'
      AND COALESCE(o.not_applicable, false) = false
      AND COALESCE(o.paid_at::date, o.due_date) BETWEEN _from AND _to
  )
  SELECT r.vehicle_id,
         COALESCE(v.plate, v.asset_code, 'sem identificação'),
         COALESCE(v.asset_class,'veiculo'),
         v.brand, v.model, COALESCE(v.equipment_type, v.vehicle_type),
         COALESCE(r.unit_id, v.unit_id), COALESCE(u.name, uv.name),
         COALESCE(r.cost_center_id, v.cost_center_id), COALESCE(cc.name, ccv.name),
         r.competence, r.category, r.value
  FROM raw r
  JOIN public.vehicles v ON v.id = r.vehicle_id
  LEFT JOIN public.units u ON u.id = r.unit_id
  LEFT JOIN public.units uv ON uv.id = v.unit_id
  LEFT JOIN public.cost_centers cc ON cc.id = r.cost_center_id
  LEFT JOIN public.cost_centers ccv ON ccv.id = v.cost_center_id
  WHERE COALESCE(r.value,0) <> 0
    AND (_unit IS NULL OR COALESCE(r.unit_id, v.unit_id) = _unit)
    AND (_cost_center IS NULL OR COALESCE(r.cost_center_id, v.cost_center_id) = _cost_center)
    AND (_vehicle IS NULL OR r.vehicle_id = _vehicle)
    AND (_asset_class IS NULL OR COALESCE(v.asset_class,'veiculo') = _asset_class);
$function$;