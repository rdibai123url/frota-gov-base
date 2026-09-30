-- Avisos de vencimento por e-mail e WhatsApp: CNH, seguro, contrato, obrigações legais,
-- garantia de fábrica e revisão preventiva. O envio é feito pelo servidor; o banco só
-- guarda a configuração, o histórico e calcula a lista do que está para vencer.

CREATE TABLE public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  recipients text[] NOT NULL DEFAULT '{}',
  frequency text NOT NULL DEFAULT 'semanal' CHECK (frequency IN ('diaria', 'semanal')),
  cnh_days integer NOT NULL DEFAULT 30 CHECK (cnh_days BETWEEN 1 AND 365),
  insurance_days integer NOT NULL DEFAULT 30 CHECK (insurance_days BETWEEN 1 AND 365),
  contract_days integer NOT NULL DEFAULT 60 CHECK (contract_days BETWEEN 1 AND 365),
  obligation_days integer NOT NULL DEFAULT 30 CHECK (obligation_days BETWEEN 1 AND 365),
  warranty_days integer NOT NULL DEFAULT 60 CHECK (warranty_days BETWEEN 1 AND 365),
  preventive_days integer NOT NULL DEFAULT 15 CHECK (preventive_days BETWEEN 1 AND 365),
  preventive_km integer NOT NULL DEFAULT 500 CHECK (preventive_km BETWEEN 0 AND 100000),
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT notification_recipients_max_chk CHECK (cardinality(recipients) <= 20)
);
CREATE TRIGGER touch_notification_settings BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp')),
  status text NOT NULL CHECK (status IN ('enviado', 'erro', 'sem_itens')),
  items_count integer NOT NULL DEFAULT 0,
  recipients_count integer NOT NULL DEFAULT 0,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_log_org_idx ON public.notification_log (organization_id, created_at DESC);

/* Itens que estão vencidos ou vão vencer, conforme os prazos configurados. */
CREATE OR REPLACE FUNCTION public.notification_items(_org uuid)
RETURNS TABLE (kind text, title text, detail text, due_date date, days integer, phone text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.notification_settings%ROWTYPE;
  today date := current_date;
BEGIN
  -- usuário logado só enxerga o próprio órgão; o servidor (sem usuário) informa o órgão
  IF auth.uid() IS NOT NULL AND _org IS DISTINCT FROM public.current_org_id()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  SELECT * INTO s FROM public.notification_settings WHERE organization_id = _org;
  IF NOT FOUND THEN
    s.cnh_days := 30; s.insurance_days := 30; s.contract_days := 60;
    s.obligation_days := 30; s.warranty_days := 60; s.preventive_days := 15; s.preventive_km := 500;
  END IF;

  RETURN QUERY
  SELECT 'cnh'::text, d.full_name,
         CASE WHEN d.license_expiry < today THEN 'CNH vencida' ELSE 'CNH vence' END,
         d.license_expiry, (d.license_expiry - today), d.phone
    FROM public.drivers d
   WHERE d.organization_id = _org AND d.active AND d.license_expiry IS NOT NULL
     AND d.license_expiry <= today + s.cnh_days;

  RETURN QUERY
  SELECT 'seguro'::text, ('Apólice ' || p.policy_number || ' — ' || p.insurer_name),
         CASE WHEN p.valid_to < today THEN 'Seguro vencido' ELSE 'Seguro vence' END,
         p.valid_to, (p.valid_to - today), NULL::text
    FROM public.insurance_policies p
   WHERE p.organization_id = _org AND p.status NOT IN ('cancelada')
     AND p.valid_to <= today + s.insurance_days;

  RETURN QUERY
  SELECT 'contrato'::text, ('Contrato ' || c.number || ' — ' || left(c.object, 60)),
         CASE WHEN c.valid_to < today THEN 'Contrato vencido' ELSE 'Contrato vence' END,
         c.valid_to, (c.valid_to - today), NULL::text
    FROM public.contracts c
   WHERE c.organization_id = _org AND c.status = 'vigente' AND c.valid_to IS NOT NULL
     AND c.valid_to <= today + s.contract_days;

  RETURN QUERY
  SELECT 'obrigacao'::text, (COALESCE(v.plate, v.asset_code, 'Veículo') || ' — ' || o.obligation_type),
         CASE WHEN o.due_date < today THEN 'Obrigação vencida' ELSE 'Obrigação vence' END,
         o.due_date, (o.due_date - today), NULL::text
    FROM public.vehicle_obligations o
    JOIN public.vehicles v ON v.id = o.vehicle_id
   WHERE o.organization_id = _org AND o.status IN ('pendente', 'vencida')
     AND NOT o.not_applicable AND o.due_date IS NOT NULL
     AND o.due_date <= today + s.obligation_days;

  RETURN QUERY
  SELECT 'garantia'::text, (COALESCE(v.plate, v.asset_code, 'Veículo') || ' — garantia de fábrica'),
         CASE WHEN v.factory_warranty_until < today THEN 'Garantia encerrada' ELSE 'Garantia termina' END,
         v.factory_warranty_until, (v.factory_warranty_until - today), NULL::text
    FROM public.vehicles v
   WHERE v.organization_id = _org AND v.factory_warranty_until IS NOT NULL
     AND v.factory_warranty_until BETWEEN today - 30 AND today + s.warranty_days;

  -- revisão preventiva: por prazo (meses) ou por quilometragem
  RETURN QUERY
  SELECT 'revisao'::text,
         (COALESCE(v.plate, v.asset_code, 'Veículo') || ' — ' || p.name),
         CASE WHEN due.by_date < today OR due.rest_km <= 0 THEN 'Revisão vencida' ELSE 'Revisão próxima' END,
         due.by_date, (due.by_date - today), NULL::text
    FROM public.maintenance_plans p
    JOIN public.vehicles v ON v.organization_id = p.organization_id
                          AND (p.vehicle_id = v.id OR (p.vehicle_id IS NULL AND (p.vehicle_type IS NULL OR p.vehicle_type = v.vehicle_type)))
    CROSS JOIN LATERAL (
      SELECT
        CASE WHEN p.interval_months IS NOT NULL
             THEN (COALESCE(p.last_done_at::date, p.created_at::date) + make_interval(months => p.interval_months))::date END AS by_date,
        CASE WHEN p.interval_km IS NOT NULL
             THEN (COALESCE(p.last_done_km, 0) + p.interval_km) - COALESCE(v.current_km, 0) END AS rest_km
    ) due
   WHERE p.organization_id = _org AND p.active
     AND ((due.by_date IS NOT NULL AND due.by_date <= today + s.preventive_days)
          OR (due.rest_km IS NOT NULL AND due.rest_km <= s.preventive_km));
END $$;

REVOKE ALL ON FUNCTION public.notification_items(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_items(uuid) TO authenticated, service_role;

/* Segurança (RLS) */
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_settings, public.notification_log TO service_role;

CREATE POLICY "read notification_settings" ON public.notification_settings FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert notification_settings" ON public.notification_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "update notification_settings" ON public.notification_settings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_finance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_finance());
CREATE POLICY "read notification_log" ON public.notification_log FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
