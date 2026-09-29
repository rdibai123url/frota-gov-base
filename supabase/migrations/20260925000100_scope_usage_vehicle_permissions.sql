-- FrotaGov: revisão de consolidação. Aplicação remota exige autorização.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_operate_usage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND public.current_org_id() IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'org_admin') OR
    public.has_role(auth.uid(), 'fleet_manager') OR public.has_role(auth.uid(), 'unit_manager') OR
    public.has_role(auth.uid(), 'operator'));
$$;
REVOKE ALL ON FUNCTION public.can_operate_usage() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_operate_usage() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_fuel_vehicle(_vehicle uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND public.current_org_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.vehicles v WHERE v.id = _vehicle AND v.organization_id = public.current_org_id()
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'org_admin') OR
      public.has_role(auth.uid(), 'fleet_manager') OR public.has_role(auth.uid(), 'operator') OR
      (public.has_role(auth.uid(), 'unit_manager') AND v.unit_id IS NOT NULL
       AND v.unit_id = public.my_unit_id() AND EXISTS (
         SELECT 1 FROM public.units u WHERE u.id = v.unit_id AND u.organization_id = v.organization_id))));
$$;
REVOKE ALL ON FUNCTION public.can_fuel_vehicle(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_fuel_vehicle(uuid) TO authenticated;

COMMIT;
