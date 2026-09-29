-- FrotaGov: revisão de consolidação. Aplicação remota exige autorização.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('checklist-frota','checklist-frota',false,10485760,ARRAY['image/jpeg','image/png','image/webp']);

CREATE TABLE public.checklist_photo_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  checklist_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmado','limpeza_pendente')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  updated_at timestamptz NOT NULL DEFAULT now(),
  photo_id uuid REFERENCES public.vehicle_checklist_photos(id) ON DELETE RESTRICT,
  FOREIGN KEY (checklist_id,organization_id) REFERENCES public.vehicle_checklists(id,organization_id) ON DELETE RESTRICT,
  CHECK ((status='confirmado') = (photo_id IS NOT NULL))
);
CREATE INDEX checklist_photo_uploads_pending_idx ON public.checklist_photo_uploads(status, expires_at) WHERE status <> 'confirmado';
ALTER TABLE public.checklist_photo_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checklist_photo_uploads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.checklist_photo_uploads TO authenticated, service_role;
CREATE POLICY checklist_uploads_owner_read ON public.checklist_photo_uploads FOR SELECT TO authenticated
USING (organization_id=public.current_org_id() AND created_by=auth.uid());
CREATE TRIGGER trg_audit_checklist_uploads AFTER INSERT OR UPDATE ON public.checklist_photo_uploads
FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Metadados somente após confirmação da reserva; não é possível anexar caminho arbitrário.
REVOKE INSERT, UPDATE, DELETE ON public.vehicle_checklist_photos FROM authenticated, service_role;
DROP POLICY "insert vehicle checklist photos in org" ON public.vehicle_checklist_photos;

CREATE FUNCTION public.reserve_checklist_photo(_checklist uuid, _mime text, _size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE c public.vehicle_checklists%ROWTYPE; rid uuid := gen_random_uuid(); path text; ext text;
BEGIN
  IF auth.uid() IS NULL OR public.current_org_id() IS NULL OR NOT public.can_operate_usage() THEN
    RAISE EXCEPTION 'Upload não autorizado'; END IF;
  SELECT * INTO c FROM public.vehicle_checklists WHERE id=_checklist AND organization_id=public.current_org_id() FOR SHARE;
  IF NOT FOUND OR NOT c.active OR NOT public.can_fuel_vehicle(c.vehicle_id) THEN RAISE EXCEPTION 'Checklist não autorizado'; END IF;
  IF _mime NOT IN ('image/jpeg','image/png','image/webp') OR _mime IS NULL OR _size IS NULL OR _size NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION 'Envie JPEG, PNG ou WebP de até 10 MiB'; END IF;
  ext := CASE _mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
  path := c.organization_id::text||'/'||c.usage_id::text||'/'||c.stage||'/'||rid::text||'.'||ext;
  INSERT INTO public.checklist_photo_uploads(id,organization_id,checklist_id,storage_path,mime_type,size_bytes,created_by)
    VALUES(rid,c.organization_id,c.id,path,_mime,_size,auth.uid());
  RETURN jsonb_build_object('id',rid,'path',path);
END; $$;
REVOKE ALL ON FUNCTION public.reserve_checklist_photo(uuid,text,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_checklist_photo(uuid,text,bigint) TO authenticated;

CREATE FUNCTION public.confirm_checklist_photo(_upload uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE u public.checklist_photo_uploads%ROWTYPE; c public.vehicle_checklists%ROWTYPE; pid uuid;
BEGIN
  IF auth.uid() IS NULL OR public.current_org_id() IS NULL OR NOT public.can_operate_usage() THEN RAISE EXCEPTION 'Confirmação não autorizada'; END IF;
  SELECT * INTO u FROM public.checklist_photo_uploads WHERE id=_upload AND organization_id=public.current_org_id()
    AND created_by=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload não encontrado'; END IF;
  SELECT * INTO c FROM public.vehicle_checklists WHERE id=u.checklist_id AND organization_id=u.organization_id FOR SHARE;
  IF NOT FOUND OR NOT public.can_fuel_vehicle(c.vehicle_id) THEN RAISE EXCEPTION 'Checklist não autorizado'; END IF;
  IF u.status='confirmado' THEN RETURN u.photo_id; END IF;
  IF u.status <> 'pendente' OR u.expires_at<now() OR NOT c.active THEN RAISE EXCEPTION 'Upload indisponível para confirmação'; END IF;
  PERFORM 1 FROM storage.objects WHERE bucket_id='checklist-frota' AND name=u.storage_path
    AND owner_id=auth.uid()::text AND (metadata->>'size')::bigint=u.size_bytes AND metadata->>'mimetype'=u.mime_type FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Arquivo não encontrado ou metadados incompatíveis'; END IF;
  INSERT INTO public.vehicle_checklist_photos(organization_id,checklist_id,storage_path,created_by)
    VALUES(u.organization_id,u.checklist_id,u.storage_path,auth.uid()) RETURNING id INTO pid;
  UPDATE public.checklist_photo_uploads SET status='confirmado',photo_id=pid,updated_at=now() WHERE id=u.id;
  RETURN pid;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_checklist_photo(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_checklist_photo(uuid) TO authenticated;

CREATE FUNCTION public.cancel_checklist_photo_upload(_upload uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE u public.checklist_photo_uploads%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.current_org_id() IS NULL OR NOT public.can_operate_usage() THEN RAISE EXCEPTION 'Cancelamento não autorizado'; END IF;
  SELECT * INTO u FROM public.checklist_photo_uploads WHERE id=_upload AND organization_id=public.current_org_id()
    AND created_by=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload não encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vehicle_checklists c WHERE c.id=u.checklist_id
    AND c.organization_id=u.organization_id AND public.can_fuel_vehicle(c.vehicle_id)) THEN RAISE EXCEPTION 'Checklist não autorizado'; END IF;
  IF u.status='confirmado' THEN RETURN false; END IF;
  UPDATE public.checklist_photo_uploads SET status='limpeza_pendente',updated_at=now() WHERE id=u.id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.cancel_checklist_photo_upload(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_checklist_photo_upload(uuid) TO authenticated;

CREATE POLICY checklist_objects_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='checklist-frota' AND (storage.foldername(name))[1]=public.current_org_id()::text AND (
    EXISTS (SELECT 1 FROM public.vehicle_checklist_photos p WHERE p.storage_path=name AND p.organization_id=public.current_org_id()) OR
    EXISTS (SELECT 1 FROM public.checklist_photo_uploads u WHERE u.storage_path=name
      AND u.organization_id=public.current_org_id() AND u.created_by=auth.uid())));
CREATE POLICY checklist_objects_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='checklist-frota' AND owner_id=auth.uid()::text AND (storage.foldername(name))[1]=public.current_org_id()::text
  AND public.can_operate_usage() AND EXISTS (
    SELECT 1 FROM public.checklist_photo_uploads u JOIN public.vehicle_checklists c ON c.id=u.checklist_id AND c.organization_id=u.organization_id
    WHERE u.storage_path=name AND u.organization_id=public.current_org_id() AND u.created_by=auth.uid()
      AND u.status='pendente' AND u.expires_at>now() AND c.active AND public.can_fuel_vehicle(c.vehicle_id)));
-- DELETE somente para compensar reserva cancelada. Uma confirmação nunca volta ao estado de limpeza.
CREATE POLICY checklist_objects_cleanup ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='checklist-frota' AND owner_id=auth.uid()::text AND (storage.foldername(name))[1]=public.current_org_id()::text
  AND public.can_operate_usage() AND EXISTS (
    SELECT 1 FROM public.checklist_photo_uploads u JOIN public.vehicle_checklists c ON c.id=u.checklist_id AND c.organization_id=u.organization_id
    WHERE u.storage_path=name AND u.organization_id=public.current_org_id() AND u.created_by=auth.uid()
      AND u.status='limpeza_pendente' AND u.photo_id IS NULL AND public.can_fuel_vehicle(c.vehicle_id)));
-- Nenhuma policy UPDATE; nenhuma exclusão agendada; evidências confirmadas são preservadas.

COMMIT;
