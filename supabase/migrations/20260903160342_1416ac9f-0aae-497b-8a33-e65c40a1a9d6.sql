REVOKE ALL ON FUNCTION public.set_phase7_code() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_traffic_fine() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_accident() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_accident_availability() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_vehicle_obligation() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_insurance_policy() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_asset_movement() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_fleet_alerts() FROM anon;
REVOKE ALL ON FUNCTION public.can_register_occurrence() FROM anon;