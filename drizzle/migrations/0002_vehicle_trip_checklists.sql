CREATE TABLE public.vehicle_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  usage_id uuid NOT NULL REFERENCES public.vehicle_usages(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage IN ('saida','retorno')),
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  observations text,
  odometer_km numeric,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid,
  completed_by_name text,
  active boolean NOT NULL DEFAULT true,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (usage_id, stage),
  CHECK (odometer_km IS NULL OR odometer_km >= 0),
  CHECK (active OR length(btrim(COALESCE(void_reason, ''))) >= 5)
);
GRANT SELECT, INSERT, UPDATE ON public.vehicle_checklists TO authenticated;
GRANT ALL ON public.vehicle_checklists TO service_role;
ALTER TABLE public.vehicle_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read vehicle checklists in org" ON public.vehicle_checklists
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "insert vehicle checklists in org" ON public.vehicle_checklists
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage() AND public.can_fuel_vehicle(vehicle_id));
CREATE POLICY "update vehicle checklists in org" ON public.vehicle_checklists
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_operate_usage() AND public.can_fuel_vehicle(vehicle_id))
  WITH CHECK (organization_id = public.current_org_id() AND public.can_operate_usage() AND public.can_fuel_vehicle(vehicle_id));
CREATE INDEX idx_vehicle_checklists_usage ON public.vehicle_checklists(usage_id, stage);
CREATE INDEX idx_vehicle_checklists_vehicle ON public.vehicle_checklists(vehicle_id, completed_at DESC);

CREATE TABLE public.vehicle_checklist_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL REFERENCES public.vehicle_checklists(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);
GRANT SELECT, INSERT ON public.vehicle_checklist_photos TO authenticated;
GRANT ALL ON public.vehicle_checklist_photos TO service_role;
ALTER TABLE public.vehicle_checklist_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read vehicle checklist photos in org" ON public.vehicle_checklist_photos
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "insert vehicle checklist photos in org" ON public.vehicle_checklist_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.can_operate_usage()
    AND EXISTS (
      SELECT 1 FROM public.vehicle_checklists c
      WHERE c.id = checklist_id AND c.organization_id = public.current_org_id()
    )
  );
CREATE INDEX idx_vehicle_checklist_photos_checklist ON public.vehicle_checklist_photos(checklist_id, created_at);

CREATE OR REPLACE FUNCTION public.guard_vehicle_checklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE u record;
BEGIN
  SELECT id, organization_id, vehicle_id, status, start_km, end_km
    INTO u FROM public.vehicle_usages WHERE id = NEW.usage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilização não encontrada.'; END IF;
  IF u.organization_id <> NEW.organization_id OR u.vehicle_id <> NEW.vehicle_id THEN
    RAISE EXCEPTION 'Checklist, utilização e veículo devem pertencer ao mesmo órgão e registro.';
  END IF;
  IF NEW.stage = 'saida' AND u.status NOT IN ('solicitada','autorizada','em_uso') THEN
    RAISE EXCEPTION 'O checklist de saída só pode ser registrado antes ou durante a utilização.';
  END IF;
  IF NEW.stage = 'retorno' AND u.status NOT IN ('em_uso','concluida') THEN
    RAISE EXCEPTION 'O checklist de retorno só pode ser registrado no fechamento da utilização.';
  END IF;
  IF NEW.stage = 'retorno' AND NEW.odometer_km IS NOT NULL AND u.start_km IS NOT NULL AND NEW.odometer_km < u.start_km THEN
    RAISE EXCEPTION 'O odômetro de retorno não pode ser inferior ao de saída.';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_vehicle_checklist() FROM anon, authenticated;
CREATE TRIGGER trg_guard_vehicle_checklist
  BEFORE INSERT OR UPDATE ON public.vehicle_checklists
  FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_checklist();
CREATE TRIGGER trg_audit_vehicle_checklists
  AFTER INSERT OR UPDATE ON public.vehicle_checklists
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_vehicle_checklist_photos
  AFTER INSERT ON public.vehicle_checklist_photos
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE POLICY "checklist photos read own org" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'checklist-frota' AND (storage.foldername(name))[1] = public.current_org_id()::text);
CREATE POLICY "checklist photos insert own org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checklist-frota' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_operate_usage());
CREATE POLICY "checklist photos update own org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'checklist-frota' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_operate_usage())
  WITH CHECK (bucket_id = 'checklist-frota' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_operate_usage());