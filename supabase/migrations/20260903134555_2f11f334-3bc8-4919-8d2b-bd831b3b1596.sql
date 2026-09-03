REVOKE EXECUTE ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_fueling_meters() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_fueling_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_fuel_types() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.can_register_fueling() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_cancel_fueling() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_unit_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_fuel_vehicle(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_register_fueling() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_cancel_fueling() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_unit_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_fuel_vehicle(uuid) TO authenticated;