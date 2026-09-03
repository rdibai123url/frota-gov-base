-- ENUMS
CREATE TYPE public.fueling_status AS ENUM ('valido','cancelado');
CREATE TYPE public.alert_severity AS ENUM ('info','alerta','erro');
CREATE TYPE public.alert_status AS ENUM ('aberto','resolvido');

-- HELPERS
CREATE OR REPLACE FUNCTION public.can_register_fueling()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin','org_admin','fleet_manager','unit_manager','operator'));
$$;

CREATE OR REPLACE FUNCTION public.can_cancel_fueling()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
    AND role IN ('super_admin','org_admin','fleet_manager'));
$$;

CREATE OR REPLACE FUNCTION public.my_unit_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit_id FROM public.profiles WHERE id = auth.uid();
$$;

-- true quando o usuário pode operar sobre o veículo informado (org + escopo de unidade)
CREATE OR REPLACE FUNCTION public.can_fuel_vehicle(_vehicle uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = _vehicle
      AND v.organization_id = public.current_org_id()
      AND (
        EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                AND ur.role IN ('super_admin','org_admin','fleet_manager','operator'))
        OR (
          EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'unit_manager')
          AND v.unit_id IS NOT DISTINCT FROM public.my_unit_id()
        )
      )
  );
$$;

-- COMBUSTÍVEIS
CREATE TABLE public.fuel_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  acronym text,
  measure_unit text NOT NULL DEFAULT 'litro',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_types TO authenticated;
GRANT ALL ON public.fuel_types TO service_role;
ALTER TABLE public.fuel_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read fuel_types in org" ON public.fuel_types FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert fuel_types in org" ON public.fuel_types FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "update fuel_types in org" ON public.fuel_types FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_write())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "delete fuel_types in org" ON public.fuel_types FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users());

-- FORNECEDORES / POSTOS
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  trade_name text,
  cnpj text,
  state_registration text,
  address text,
  city text,
  state text,
  zip_code text,
  phone text,
  email text,
  contact_name text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read suppliers in org" ON public.suppliers FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert suppliers in org" ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "update suppliers in org" ON public.suppliers FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_write())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE POLICY "delete suppliers in org" ON public.suppliers FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users());

-- ABASTECIMENTOS
CREATE TABLE public.fuelings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  fuel_type_id uuid REFERENCES public.fuel_types(id),
  fueled_at timestamptz NOT NULL DEFAULT now(),
  driver_name text,
  operator_name text,
  odometer_km numeric,
  hour_meter numeric,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL,
  total_value numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  invoice_number text,
  authorization_number text,
  notes text,
  attachment_path text,
  status public.fueling_status NOT NULL DEFAULT 'valido',
  alert_flags text[] NOT NULL DEFAULT '{}',
  alert_justification text,
  vehicle_updated boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_fuelings_org_date ON public.fuelings (organization_id, fueled_at DESC);
CREATE INDEX idx_fuelings_vehicle ON public.fuelings (vehicle_id, fueled_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.fuelings TO authenticated;
GRANT ALL ON public.fuelings TO service_role;
ALTER TABLE public.fuelings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read fuelings in org" ON public.fuelings FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert fuelings in org" ON public.fuelings FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.can_register_fueling()
    AND public.can_fuel_vehicle(vehicle_id)
    AND (supplier_id IS NULL OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_id AND s.organization_id = public.current_org_id()))
    AND (fuel_type_id IS NULL OR EXISTS (SELECT 1 FROM public.fuel_types f WHERE f.id = fuel_type_id AND f.organization_id = public.current_org_id()))
    AND (unit_id IS NULL OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = unit_id AND u.organization_id = public.current_org_id()))
  );
CREATE POLICY "update fuelings in org" ON public.fuelings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND (public.can_cancel_fueling() OR public.can_write()))
  WITH CHECK (organization_id = public.current_org_id() AND (public.can_cancel_fueling() OR public.can_write()));

-- trava: registro cancelado é imutável; cancelamento exige motivo
CREATE OR REPLACE FUNCTION public.guard_fueling_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'cancelado' THEN
    RAISE EXCEPTION 'Abastecimento cancelado não pode ser alterado';
  END IF;
  IF NEW.status = 'cancelado' THEN
    IF NEW.cancel_reason IS NULL OR length(btrim(NEW.cancel_reason)) < 5 THEN
      RAISE EXCEPTION 'Informe o motivo do cancelamento';
    END IF;
    IF NOT public.can_cancel_fueling() THEN
      RAISE EXCEPTION 'Sem permissão para cancelar abastecimentos';
    END IF;
    NEW.cancelled_at = now();
    NEW.cancelled_by = auth.uid();
    -- preserva os dados originais do lançamento
    NEW.vehicle_id = OLD.vehicle_id;
    NEW.quantity = OLD.quantity;
    NEW.unit_price = OLD.unit_price;
    NEW.odometer_km = OLD.odometer_km;
    NEW.hour_meter = OLD.hour_meter;
    NEW.fueled_at = OLD.fueled_at;
  END IF;
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fuelings_guard BEFORE UPDATE ON public.fuelings
  FOR EACH ROW EXECUTE FUNCTION public.guard_fueling_update();

CREATE TRIGGER trg_fuel_types_updated BEFORE UPDATE ON public.fuel_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- atualização controlada de KM / horímetro
CREATE OR REPLACE FUNCTION public.apply_fueling_meters()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'valido' THEN
    UPDATE public.vehicles v
    SET current_km = GREATEST(COALESCE(v.current_km, 0), COALESCE(NEW.odometer_km, v.current_km, 0)),
        hour_meter = GREATEST(COALESCE(v.hour_meter, 0), COALESCE(NEW.hour_meter, v.hour_meter, 0)),
        updated_at = now()
    WHERE v.id = NEW.vehicle_id
      AND v.organization_id = NEW.organization_id
      AND (
        (NEW.odometer_km IS NOT NULL AND NEW.odometer_km >= COALESCE(v.current_km, 0))
        OR (NEW.hour_meter IS NOT NULL AND NEW.hour_meter >= COALESCE(v.hour_meter, 0))
      );
    IF FOUND THEN
      UPDATE public.fuelings SET vehicle_updated = true WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_fuelings_meters AFTER INSERT ON public.fuelings
  FOR EACH ROW EXECUTE FUNCTION public.apply_fueling_meters();

-- ALERTAS
CREATE TABLE public.fueling_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fueling_id uuid REFERENCES public.fuelings(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id),
  alert_type text NOT NULL,
  severity public.alert_severity NOT NULL DEFAULT 'alerta',
  message text NOT NULL,
  justification text,
  status public.alert_status NOT NULL DEFAULT 'aberto',
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_fueling_alerts_org ON public.fueling_alerts (organization_id, status);
GRANT SELECT, INSERT, UPDATE ON public.fueling_alerts TO authenticated;
GRANT ALL ON public.fueling_alerts TO service_role;
ALTER TABLE public.fueling_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read alerts in org" ON public.fueling_alerts FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert alerts in org" ON public.fueling_alerts FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_register_fueling());
CREATE POLICY "update alerts in org" ON public.fueling_alerts FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_write())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_write());
CREATE TRIGGER trg_alerts_updated BEFORE UPDATE ON public.fueling_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- AUDITORIA
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_org ON public.audit_logs (organization_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read audit logs in org" ON public.audit_logs FOR SELECT TO authenticated
  USING ((organization_id = public.current_org_id() AND (public.can_manage_users() OR public.has_role(auth.uid(),'auditor') OR public.has_role(auth.uid(),'fleet_manager'))) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  v_org := COALESCE((to_jsonb(NEW) ->> 'organization_id')::uuid, (to_jsonb(OLD) ->> 'organization_id')::uuid);
  INSERT INTO public.audit_logs (organization_id, table_name, record_id, action, actor_id, old_data, new_data)
  VALUES (
    v_org, TG_TABLE_NAME,
    COALESCE((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(OLD) ->> 'id')::uuid),
    TG_OP, auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_audit_fuelings AFTER INSERT OR UPDATE ON public.fuelings
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_fuel_types AFTER INSERT OR UPDATE OR DELETE ON public.fuel_types
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- STORAGE: anexos de comprovantes, segregados por organização
CREATE POLICY "read comprovantes in org" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprovantes' AND (storage.foldername(name))[1] = public.current_org_id()::text);
CREATE POLICY "insert comprovantes in org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprovantes' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_register_fueling());
CREATE POLICY "update comprovantes in org" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'comprovantes' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_write());
CREATE POLICY "delete comprovantes in org" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'comprovantes' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_manage_users());

-- tipos de combustível padrão para os órgãos já existentes
INSERT INTO public.fuel_types (organization_id, name, acronym, measure_unit)
SELECT o.id, t.name, t.acronym, t.unit
FROM public.organizations o
CROSS JOIN (VALUES
  ('Gasolina Comum','GC','litro'),
  ('Gasolina Aditivada','GA','litro'),
  ('Etanol','ETA','litro'),
  ('Diesel S10','DS10','litro'),
  ('Diesel S500','DS500','litro'),
  ('GNV','GNV','m³'),
  ('Outro',NULL,'litro')
) AS t(name, acronym, unit)
ON CONFLICT DO NOTHING;

-- novos órgãos já nascem com os tipos de combustível padrão
CREATE OR REPLACE FUNCTION public.seed_fuel_types()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.fuel_types (organization_id, name, acronym, measure_unit, created_by)
  SELECT NEW.id, t.name, t.acronym, t.unit, NEW.created_by
  FROM (VALUES
    ('Gasolina Comum','GC','litro'),
    ('Gasolina Aditivada','GA','litro'),
    ('Etanol','ETA','litro'),
    ('Diesel S10','DS10','litro'),
    ('Diesel S500','DS500','litro'),
    ('GNV','GNV','m³'),
    ('Outro',NULL,'litro')
  ) AS t(name, acronym, unit)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_seed_fuel_types AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_fuel_types();