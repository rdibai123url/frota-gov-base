-- ============ FASE 10 / BLOCO 2 — Inteligência de consumo e custos ============

-- 1. Parâmetros de consumo esperado ------------------------------------------
CREATE TABLE public.consumption_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'orgao' CHECK (scope IN ('orgao','categoria','modelo','ativo')),
  asset_class text CHECK (asset_class IN ('veiculo','equipamento')),
  category text,
  brand text,
  model text,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  fuel_type_id uuid REFERENCES public.fuel_types(id) ON DELETE SET NULL,
  metric text NOT NULL CHECK (metric IN ('km_l','l_h')),
  expected_value numeric NOT NULL CHECK (expected_value > 0),
  tolerance_pct numeric NOT NULL DEFAULT 10 CHECK (tolerance_pct >= 0 AND tolerance_pct <= 100),
  critical_pct numeric NOT NULL DEFAULT 25 CHECK (critical_pct >= 0 AND critical_pct <= 100),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.consumption_parameters TO authenticated;
GRANT ALL ON public.consumption_parameters TO service_role;
ALTER TABLE public.consumption_parameters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read consumption parameters in org" ON public.consumption_parameters
  FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY "insert consumption parameters in org" ON public.consumption_parameters
  FOR INSERT WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());
CREATE POLICY "update consumption parameters in org" ON public.consumption_parameters
  FOR UPDATE USING (organization_id = current_org_id() AND can_manage_fleet())
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());

CREATE INDEX idx_consumption_parameters_org ON public.consumption_parameters(organization_id, active);
CREATE INDEX idx_consumption_parameters_vehicle ON public.consumption_parameters(vehicle_id);

-- 2. Configurações gerais de inteligência ------------------------------------
CREATE TABLE public.intelligence_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  default_tolerance_pct numeric NOT NULL DEFAULT 10 CHECK (default_tolerance_pct >= 0),
  critical_pct numeric NOT NULL DEFAULT 25 CHECK (critical_pct >= 0),
  max_km_segment numeric NOT NULL DEFAULT 3000 CHECK (max_km_segment > 0),
  max_hours_segment numeric NOT NULL DEFAULT 500 CHECK (max_hours_segment > 0),
  min_minutes_between_fuelings integer NOT NULL DEFAULT 60 CHECK (min_minutes_between_fuelings >= 0),
  efficiency_drop_pct numeric NOT NULL DEFAULT 20 CHECK (efficiency_drop_pct >= 0),
  maintenance_cost_alert numeric NOT NULL DEFAULT 10000 CHECK (maintenance_cost_alert >= 0),
  cost_deviation_pct numeric NOT NULL DEFAULT 80 CHECK (cost_deviation_pct >= 0),
  min_segments_for_alert integer NOT NULL DEFAULT 3 CHECK (min_segments_for_alert >= 1),
  alerts_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.intelligence_settings TO authenticated;
GRANT ALL ON public.intelligence_settings TO service_role;
ALTER TABLE public.intelligence_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read intelligence settings in org" ON public.intelligence_settings
  FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY "insert intelligence settings in org" ON public.intelligence_settings
  FOR INSERT WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());
CREATE POLICY "update intelligence settings in org" ON public.intelligence_settings
  FOR UPDATE USING (organization_id = current_org_id() AND can_manage_fleet())
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());

-- 3. Correções / trocas de medidor -------------------------------------------
CREATE TABLE public.meter_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  meter text NOT NULL CHECK (meter IN ('hodometro','horimetro')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  previous_value numeric,
  new_value numeric NOT NULL CHECK (new_value >= 0),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT ON public.meter_corrections TO authenticated;
GRANT ALL ON public.meter_corrections TO service_role;
ALTER TABLE public.meter_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read meter corrections in org" ON public.meter_corrections
  FOR SELECT USING (organization_id = current_org_id());
CREATE POLICY "insert meter corrections in org" ON public.meter_corrections
  FOR INSERT WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());
CREATE INDEX idx_meter_corrections_vehicle ON public.meter_corrections(vehicle_id, occurred_at);

-- 4. Sem exclusão física de parâmetros e correções ---------------------------
CREATE OR REPLACE FUNCTION public.block_intelligence_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Registros de % não podem ser excluídos; use a inativação.', TG_TABLE_NAME;
END; $$;
REVOKE EXECUTE ON FUNCTION public.block_intelligence_delete() FROM PUBLIC;
CREATE TRIGGER no_delete_consumption_parameters BEFORE DELETE ON public.consumption_parameters
  FOR EACH ROW EXECUTE FUNCTION public.block_intelligence_delete();
CREATE TRIGGER no_delete_meter_corrections BEFORE DELETE ON public.meter_corrections
  FOR EACH ROW EXECUTE FUNCTION public.block_intelligence_delete();

-- 5. Auditoria das alterações -------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_intelligence_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rec jsonb;
BEGIN
  _rec := to_jsonb(COALESCE(NEW, OLD));
  INSERT INTO public.activity_logs (organization_id, actor_id, event_type, area, screen, entity, record_id, action, summary, old_data, new_data)
  VALUES (
    (_rec->>'organization_id')::uuid, auth.uid(), 'parametro', 'inteligencia', 'Inteligência da frota',
    TG_TABLE_NAME, (_rec->>'id')::uuid, lower(TG_OP),
    CASE TG_OP WHEN 'INSERT' THEN 'Parâmetro de inteligência criado' ELSE 'Parâmetro de inteligência alterado' END,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.audit_intelligence_change() FROM PUBLIC;
CREATE TRIGGER audit_consumption_parameters AFTER INSERT OR UPDATE ON public.consumption_parameters
  FOR EACH ROW EXECUTE FUNCTION public.audit_intelligence_change();
CREATE TRIGGER audit_intelligence_settings AFTER INSERT OR UPDATE ON public.intelligence_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_intelligence_change();
CREATE TRIGGER audit_meter_corrections AFTER INSERT ON public.meter_corrections
  FOR EACH ROW EXECUTE FUNCTION public.audit_intelligence_change();

CREATE TRIGGER set_updated_at_consumption_parameters BEFORE UPDATE ON public.consumption_parameters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER set_updated_at_intelligence_settings BEFORE UPDATE ON public.intelligence_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Competência dos alertas (evita duplicidade) ------------------------------
ALTER TABLE public.fueling_alerts ADD COLUMN IF NOT EXISTS period_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_period
  ON public.fueling_alerts(organization_id, alert_type, entity_type, entity_id, period_key)
  WHERE period_key IS NOT NULL;

-- 7. Trechos de consumo (fonte única dos indicadores) -------------------------
CREATE OR REPLACE FUNCTION public.fleet_consumption_segments(
  _from date,
  _to date,
  _unit uuid DEFAULT NULL,
  _cost_center uuid DEFAULT NULL,
  _vehicle uuid DEFAULT NULL,
  _asset_class text DEFAULT NULL,
  _driver uuid DEFAULT NULL,
  _fuel uuid DEFAULT NULL
) RETURNS TABLE (
  fueling_id uuid,
  vehicle_id uuid,
  asset_label text,
  asset_class text,
  meter_kind text,
  brand text,
  model text,
  category text,
  unit_id uuid,
  unit_name text,
  cost_center_id uuid,
  cost_center_name text,
  driver_id uuid,
  driver_name text,
  fuel_type_id uuid,
  fuel_name text,
  fueled_at timestamptz,
  liters numeric,
  value numeric,
  distance_km numeric,
  hours numeric,
  valid boolean,
  invalid_reason text,
  too_close boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (
    SELECT
      COALESCE(s.max_km_segment, 3000) AS max_km,
      COALESCE(s.max_hours_segment, 500) AS max_h,
      COALESCE(s.min_minutes_between_fuelings, 60) AS min_min
    FROM (SELECT 1) x
    LEFT JOIN public.intelligence_settings s ON s.organization_id = current_org_id()
  ),
  base AS (
    SELECT f.id, f.vehicle_id, f.fueled_at, f.quantity, f.total_value, f.odometer_km, f.hour_meter,
           f.unit_id, f.cost_center_id, f.driver_id, f.fuel_type_id,
           LAG(f.odometer_km) OVER w AS prev_km,
           LAG(f.hour_meter) OVER w AS prev_h,
           LAG(f.fueled_at) OVER w AS prev_at
    FROM public.fuelings f
    JOIN public.fuel_types ft ON ft.id = f.fuel_type_id
    WHERE f.organization_id = current_org_id()
      AND f.status <> 'cancelado'
      AND COALESCE(ft.category, 'combustivel') = 'combustivel'
    WINDOW w AS (PARTITION BY f.vehicle_id ORDER BY f.fueled_at)
  )
  SELECT
    b.id,
    b.vehicle_id,
    COALESCE(v.plate, v.asset_code, 'sem identificação'),
    COALESCE(v.asset_class, 'veiculo'),
    COALESCE(v.meter_kind, 'hodometro'),
    v.brand,
    v.model,
    COALESCE(v.equipment_type, v.vehicle_type),
    b.unit_id, u.name,
    b.cost_center_id, cc.name,
    b.driver_id, d.full_name,
    b.fuel_type_id, ft.name,
    b.fueled_at,
    COALESCE(b.quantity, 0),
    COALESCE(b.total_value, 0),
    CASE WHEN seg.reason IS NULL AND COALESCE(v.meter_kind,'hodometro') IN ('hodometro','ambos')
              AND b.prev_km IS NOT NULL AND b.odometer_km IS NOT NULL
         THEN b.odometer_km - b.prev_km END,
    CASE WHEN seg.reason IS NULL AND COALESCE(v.meter_kind,'hodometro') IN ('horimetro','ambos')
              AND b.prev_h IS NOT NULL AND b.hour_meter IS NOT NULL
         THEN b.hour_meter - b.prev_h END,
    seg.reason IS NULL,
    seg.reason,
    b.prev_at IS NOT NULL AND b.fueled_at - b.prev_at < make_interval(mins => cfg.min_min)
  FROM base b
  CROSS JOIN cfg
  JOIN public.vehicles v ON v.id = b.vehicle_id
  LEFT JOIN public.units u ON u.id = b.unit_id
  LEFT JOIN public.cost_centers cc ON cc.id = b.cost_center_id
  LEFT JOIN public.drivers d ON d.id = b.driver_id
  LEFT JOIN public.fuel_types ft ON ft.id = b.fuel_type_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN b.prev_at IS NULL THEN 'primeiro abastecimento do ativo'
      WHEN EXISTS (
        SELECT 1 FROM public.meter_corrections mc
        WHERE mc.vehicle_id = b.vehicle_id
          AND mc.occurred_at > b.prev_at AND mc.occurred_at <= b.fueled_at
      ) THEN 'correção/troca de medidor no intervalo'
      WHEN COALESCE(v.meter_kind,'hodometro') IN ('hodometro','ambos')
           AND (b.prev_km IS NULL OR b.odometer_km IS NULL) THEN 'hodômetro não informado'
      WHEN COALESCE(v.meter_kind,'hodometro') = 'horimetro'
           AND (b.prev_h IS NULL OR b.hour_meter IS NULL) THEN 'horímetro não informado'
      WHEN COALESCE(v.meter_kind,'hodometro') IN ('hodometro','ambos')
           AND b.odometer_km - b.prev_km <= 0 THEN 'medidor sem avanço'
      WHEN COALESCE(v.meter_kind,'hodometro') IN ('hodometro','ambos')
           AND b.odometer_km - b.prev_km > cfg.max_km THEN 'variação de hodômetro implausível'
      WHEN COALESCE(v.meter_kind,'hodometro') = 'horimetro'
           AND b.hour_meter - b.prev_h <= 0 THEN 'medidor sem avanço'
      WHEN COALESCE(v.meter_kind,'hodometro') = 'horimetro'
           AND b.hour_meter - b.prev_h > cfg.max_h THEN 'variação de horímetro implausível'
      WHEN COALESCE(b.quantity, 0) <= 0 THEN 'sem litros registrados'
      ELSE NULL END AS reason
  ) seg
  WHERE b.fueled_at >= _from::timestamptz
    AND b.fueled_at < (_to + 1)::timestamptz
    AND (_unit IS NULL OR b.unit_id = _unit)
    AND (_cost_center IS NULL OR b.cost_center_id = _cost_center)
    AND (_vehicle IS NULL OR b.vehicle_id = _vehicle)
    AND (_asset_class IS NULL OR COALESCE(v.asset_class,'veiculo') = _asset_class)
    AND (_driver IS NULL OR b.driver_id = _driver)
    AND (_fuel IS NULL OR b.fuel_type_id = _fuel)
  ORDER BY b.fueled_at;
$$;
REVOKE EXECUTE ON FUNCTION public.fleet_consumption_segments(date,date,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_consumption_segments(date,date,uuid,uuid,uuid,text,uuid,uuid) TO authenticated;

-- 8. Custos por ativo, categoria e competência --------------------------------
CREATE OR REPLACE FUNCTION public.fleet_cost_rows(
  _from date,
  _to date,
  _unit uuid DEFAULT NULL,
  _cost_center uuid DEFAULT NULL,
  _vehicle uuid DEFAULT NULL,
  _asset_class text DEFAULT NULL
) RETURNS TABLE (
  vehicle_id uuid,
  asset_label text,
  asset_class text,
  brand text,
  model text,
  category_asset text,
  unit_id uuid,
  unit_name text,
  cost_center_id uuid,
  cost_center_name text,
  competence date,
  category text,
  value numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
$$;
REVOKE EXECUTE ON FUNCTION public.fleet_cost_rows(date,date,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_cost_rows(date,date,uuid,uuid,uuid,text) TO authenticated;

-- 9. Indisponibilidade por manutenção (apoio à economicidade) ------------------
CREATE OR REPLACE FUNCTION public.fleet_downtime(_from date, _to date)
RETURNS TABLE (vehicle_id uuid, days numeric, events integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.vehicle_id,
         SUM(GREATEST(0, EXTRACT(epoch FROM (COALESCE(m.exit_at, LEAST(now(), (_to + 1)::timestamptz)) - m.entry_at)) / 86400.0))::numeric,
         COUNT(*)::int
  FROM public.maintenance_records m
  WHERE m.organization_id = current_org_id() AND m.status <> 'cancelada'
    AND m.entry_at >= _from::timestamptz AND m.entry_at < (_to + 1)::timestamptz
  GROUP BY m.vehicle_id;
$$;
REVOKE EXECUTE ON FUNCTION public.fleet_downtime(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_downtime(date,date) TO authenticated;

-- 10. Geração de alertas de inteligência --------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_intelligence_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := current_org_id();
  _cfg public.intelligence_settings%ROWTYPE;
  _from date := (date_trunc('month', now()) - interval '2 months')::date;
  _to date := now()::date;
  _period text := to_char(now(), 'YYYY-MM');
  _count integer := 0;
  r record;
BEGIN
  IF _org IS NULL THEN RETURN 0; END IF;
  SELECT * INTO _cfg FROM public.intelligence_settings WHERE organization_id = _org;
  IF _cfg.id IS NOT NULL AND _cfg.alerts_enabled = false THEN RETURN 0; END IF;

  -- 10.1 consumo abaixo do parâmetro esperado
  FOR r IN
    WITH seg AS (
      SELECT * FROM public.fleet_consumption_segments(_from, _to) WHERE valid
    ),
    agg AS (
      SELECT s.vehicle_id, s.asset_label, s.asset_class, s.brand, s.model, s.category,
             SUM(s.liters) AS liters, SUM(COALESCE(s.distance_km,0)) AS km, SUM(COALESCE(s.hours,0)) AS hours,
             COUNT(*) AS segments
      FROM seg s GROUP BY 1,2,3,4,5,6
    )
    SELECT a.*,
      CASE WHEN a.km > 0 THEN a.km / NULLIF(a.liters,0) END AS km_l,
      CASE WHEN a.hours > 0 THEN a.liters / NULLIF(a.hours,0) END AS l_h,
      p.expected_value, p.tolerance_pct, p.critical_pct, p.metric
    FROM agg a
    JOIN LATERAL (
      SELECT cp.* FROM public.consumption_parameters cp
      WHERE cp.organization_id = _org AND cp.active
        AND (cp.vehicle_id IS NULL OR cp.vehicle_id = a.vehicle_id)
        AND (cp.asset_class IS NULL OR cp.asset_class = a.asset_class)
        AND (cp.category IS NULL OR cp.category = a.category)
        AND (cp.brand IS NULL OR cp.brand = a.brand)
        AND (cp.model IS NULL OR cp.model = a.model)
        AND cp.metric = CASE WHEN a.km > 0 THEN 'km_l' ELSE 'l_h' END
      ORDER BY CASE cp.scope WHEN 'ativo' THEN 1 WHEN 'modelo' THEN 2 WHEN 'categoria' THEN 3 ELSE 4 END
      LIMIT 1
    ) p ON true
    WHERE a.segments >= COALESCE(_cfg.min_segments_for_alert, 3)
  LOOP
    IF (r.metric = 'km_l' AND r.km_l IS NOT NULL AND r.km_l < r.expected_value * (1 - r.tolerance_pct/100.0))
       OR (r.metric = 'l_h' AND r.l_h IS NOT NULL AND r.l_h > r.expected_value * (1 + r.tolerance_pct/100.0)) THEN
      INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, period_key)
      VALUES (_org, r.vehicle_id, 'consumo_fora_do_parametro',
        CASE WHEN (r.metric = 'km_l' AND r.km_l < r.expected_value * (1 - r.critical_pct/100.0))
                  OR (r.metric = 'l_h' AND r.l_h > r.expected_value * (1 + r.critical_pct/100.0))
             THEN 'erro'::alert_severity ELSE 'alerta'::alert_severity END,
        format('Consumo do ativo %s está fora do parâmetro: real %s x esperado %s (%s).',
               r.asset_label,
               round(COALESCE(r.km_l, r.l_h), 2), round(r.expected_value, 2),
               CASE WHEN r.metric = 'km_l' THEN 'km/L' ELSE 'L/h' END),
        'inteligencia', 'vehicle', r.vehicle_id, _period)
      ON CONFLICT DO NOTHING;
      _count := _count + 1;
    END IF;
  END LOOP;

  -- 10.2 custo de manutenção elevado no período
  FOR r IN
    SELECT c.vehicle_id, c.asset_label, SUM(c.value) AS total
    FROM public.fleet_cost_rows(date_trunc('month', now())::date, _to) c
    WHERE c.category IN ('manutencao','pecas')
    GROUP BY 1,2
    HAVING SUM(c.value) > COALESCE(_cfg.maintenance_cost_alert, 10000)
  LOOP
    INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, period_key)
    VALUES (_org, r.vehicle_id, 'custo_manutencao_elevado', 'alerta',
      format('Custo de manutenção/peças do ativo %s no mês corrente (R$ %s) supera o limite configurado.',
             r.asset_label, to_char(r.total, 'FM999G999G990D00')),
      'inteligencia', 'vehicle', r.vehicle_id, _period)
    ON CONFLICT DO NOTHING;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END; $$;
REVOKE EXECUTE ON FUNCTION public.refresh_intelligence_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_intelligence_alerts() TO authenticated;