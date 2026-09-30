-- Fase 6: rastreamento e telemetria (recebe posições de rastreadores de terceiros).
-- Cada rastreador recebe um token secreto; o banco guarda só o hash (sha256).

/* ------------------------------------------------------------------ */
/* 1. Tabelas                                                           */
/* ------------------------------------------------------------------ */
CREATE TABLE public.tracking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  max_speed_kmh numeric(5,1) NOT NULL DEFAULT 110 CHECK (max_speed_kmh > 0 AND max_speed_kmh <= 300),
  low_battery_v numeric(4,1) NOT NULL DEFAULT 11.5 CHECK (low_battery_v > 0 AND low_battery_v <= 30),
  offline_minutes integer NOT NULL DEFAULT 30 CHECK (offline_minutes BETWEEN 1 AND 10080),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.tracking_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  provider text,
  device_identifier text,
  token_hash text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX tracking_devices_vehicle_idx ON public.tracking_devices (organization_id, vehicle_id);

CREATE TABLE public.tracking_geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  center_lat numeric(9,6) NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
  center_lng numeric(9,6) NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
  radius_m integer NOT NULL CHECK (radius_m BETWEEN 50 AND 500000),
  alert_on text NOT NULL DEFAULT 'saida' CHECK (alert_on IN ('saida', 'entrada', 'ambos')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.tracking_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.tracking_devices(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  speed_kmh numeric(5,1) CHECK (speed_kmh IS NULL OR (speed_kmh >= 0 AND speed_kmh <= 400)),
  heading integer CHECK (heading IS NULL OR heading BETWEEN 0 AND 360),
  ignition boolean,
  battery_v numeric(4,1) CHECK (battery_v IS NULL OR (battery_v >= 0 AND battery_v <= 60)),
  odometer_km numeric(10,1) CHECK (odometer_km IS NULL OR odometer_km >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_positions_vehicle_time_idx
  ON public.tracking_positions (vehicle_id, recorded_at DESC);
CREATE INDEX tracking_positions_org_time_idx
  ON public.tracking_positions (organization_id, recorded_at DESC);

CREATE TABLE public.tracking_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.tracking_positions(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('excesso_velocidade', 'bateria_baixa', 'saida_geocerca', 'entrada_geocerca')),
  message text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_alerts_org_idx ON public.tracking_alerts (organization_id, occurred_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tracking_settings', 'tracking_devices', 'tracking_geofences'] LOOP
    EXECUTE format('CREATE TRIGGER touch_%1$s BEFORE UPDATE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
  END LOOP;
END $$;

/* ------------------------------------------------------------------ */
/* 2. Distância entre dois pontos (fórmula de Haversine, em metros)     */
/* ------------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.tracking_distance_m(_lat1 numeric, _lng1 numeric, _lat2 numeric, _lng2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    power(sin(radians((_lat2 - _lat1)::float8) / 2), 2) +
    cos(radians(_lat1::float8)) * cos(radians(_lat2::float8)) *
    power(sin(radians((_lng2 - _lng1)::float8) / 2), 2)
  ))::numeric;
$$;

/* ------------------------------------------------------------------ */
/* 3. Recebimento de posições (chamado pelo rastreador com o token)     */
/* ------------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.tracking_ingest(_token text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dev public.tracking_devices%ROWTYPE;
  cfg public.tracking_settings%ROWTYPE;
  lat numeric; lng numeric; spd numeric; bat numeric; hdg integer; odo numeric;
  ign boolean; rec timestamptz;
  pos_id uuid; prev public.tracking_positions%ROWTYPE;
  g public.tracking_geofences%ROWTYPE;
  d_prev numeric; d_now numeric;
  alerts integer := 0;
BEGIN
  IF _token IS NULL OR length(_token) < 24 THEN
    RAISE EXCEPTION 'Token inválido' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO dev FROM public.tracking_devices
   WHERE token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex') AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido' USING ERRCODE = '28000';
  END IF;

  lat := (_payload->>'lat')::numeric;
  lng := (_payload->>'lng')::numeric;
  IF lat IS NULL OR lng IS NULL OR lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas inválidas' USING ERRCODE = '22023';
  END IF;
  spd := NULLIF(_payload->>'speed_kmh', '')::numeric;
  bat := NULLIF(_payload->>'battery_v', '')::numeric;
  hdg := NULLIF(_payload->>'heading', '')::integer;
  odo := NULLIF(_payload->>'odometer_km', '')::numeric;
  ign := NULLIF(_payload->>'ignition', '')::boolean;
  rec := COALESCE(NULLIF(_payload->>'recorded_at', '')::timestamptz, now());
  IF rec > now() + interval '5 minutes' THEN rec := now(); END IF;

  SELECT * INTO prev FROM public.tracking_positions
   WHERE vehicle_id = dev.vehicle_id AND recorded_at < rec
   ORDER BY recorded_at DESC LIMIT 1;

  INSERT INTO public.tracking_positions (organization_id, vehicle_id, device_id, recorded_at,
    latitude, longitude, speed_kmh, heading, ignition, battery_v, odometer_km)
  VALUES (dev.organization_id, dev.vehicle_id, dev.id, rec, lat, lng, spd, hdg, ign, bat, odo)
  RETURNING id INTO pos_id;

  UPDATE public.tracking_devices SET last_seen_at = GREATEST(COALESCE(last_seen_at, rec), rec)
   WHERE id = dev.id;

  SELECT * INTO cfg FROM public.tracking_settings WHERE organization_id = dev.organization_id;
  IF NOT FOUND THEN
    cfg.max_speed_kmh := 110; cfg.low_battery_v := 11.5;
  END IF;

  IF spd IS NOT NULL AND spd > cfg.max_speed_kmh AND NOT EXISTS (
    SELECT 1 FROM public.tracking_alerts WHERE vehicle_id = dev.vehicle_id
      AND kind = 'excesso_velocidade' AND acknowledged_at IS NULL
      AND occurred_at > rec - interval '15 minutes') THEN
    INSERT INTO public.tracking_alerts (organization_id, vehicle_id, position_id, kind, message, occurred_at)
    VALUES (dev.organization_id, dev.vehicle_id, pos_id, 'excesso_velocidade',
      'Velocidade de ' || spd || ' km/h (limite ' || cfg.max_speed_kmh || ' km/h)', rec);
    alerts := alerts + 1;
  END IF;

  IF bat IS NOT NULL AND bat > 0 AND bat < cfg.low_battery_v AND NOT EXISTS (
    SELECT 1 FROM public.tracking_alerts WHERE vehicle_id = dev.vehicle_id
      AND kind = 'bateria_baixa' AND acknowledged_at IS NULL
      AND occurred_at > rec - interval '6 hours') THEN
    INSERT INTO public.tracking_alerts (organization_id, vehicle_id, position_id, kind, message, occurred_at)
    VALUES (dev.organization_id, dev.vehicle_id, pos_id, 'bateria_baixa',
      'Bateria em ' || bat || ' V (mínimo ' || cfg.low_battery_v || ' V)', rec);
    alerts := alerts + 1;
  END IF;

  IF prev.id IS NOT NULL THEN
    FOR g IN SELECT * FROM public.tracking_geofences
             WHERE organization_id = dev.organization_id AND active LOOP
      d_prev := public.tracking_distance_m(prev.latitude, prev.longitude, g.center_lat, g.center_lng);
      d_now := public.tracking_distance_m(lat, lng, g.center_lat, g.center_lng);
      IF g.alert_on IN ('saida', 'ambos') AND d_prev <= g.radius_m AND d_now > g.radius_m THEN
        INSERT INTO public.tracking_alerts (organization_id, vehicle_id, position_id, kind, message, occurred_at)
        VALUES (dev.organization_id, dev.vehicle_id, pos_id, 'saida_geocerca',
          'Saiu da área "' || g.name || '"', rec);
        alerts := alerts + 1;
      ELSIF g.alert_on IN ('entrada', 'ambos') AND d_prev > g.radius_m AND d_now <= g.radius_m THEN
        INSERT INTO public.tracking_alerts (organization_id, vehicle_id, position_id, kind, message, occurred_at)
        VALUES (dev.organization_id, dev.vehicle_id, pos_id, 'entrada_geocerca',
          'Entrou na área "' || g.name || '"', rec);
        alerts := alerts + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('accepted', true, 'position_id', pos_id, 'alerts', alerts);
END $$;

REVOKE ALL ON FUNCTION public.tracking_ingest(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_ingest(text, jsonb) TO anon, authenticated, service_role;

/* ------------------------------------------------------------------ */
/* 4. Segurança (RLS)                                                   */
/* Posições e alertas só são criados pela função acima; o usuário só    */
/* lê e, nos alertas, marca como visto.                                 */
/* ------------------------------------------------------------------ */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tracking_settings', 'tracking_devices', 'tracking_geofences',
                           'tracking_positions', 'tracking_alerts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format($p$CREATE POLICY "read %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()))$p$, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['tracking_settings', 'tracking_devices', 'tracking_geofences'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format($p$CREATE POLICY "insert %1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance())$p$, t);
    EXECUTE format($p$CREATE POLICY "update %1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (organization_id = public.current_org_id() AND public.can_manage_finance())
      WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance())$p$, t);
    EXECUTE format($p$CREATE POLICY "delete %1$s" ON public.%1$I FOR DELETE TO authenticated
      USING (organization_id = public.current_org_id() AND public.can_manage_finance())$p$, t);
  END LOOP;
END $$;

GRANT SELECT ON public.tracking_positions TO authenticated;
GRANT SELECT, UPDATE (acknowledged_at, acknowledged_by) ON public.tracking_alerts TO authenticated;
CREATE POLICY "ack tracking_alerts" ON public.tracking_alerts FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_write())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
