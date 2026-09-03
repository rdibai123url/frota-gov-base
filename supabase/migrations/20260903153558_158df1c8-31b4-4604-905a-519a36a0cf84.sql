REVOKE ALL ON FUNCTION public.refresh_procurement_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_procurement_alerts() TO authenticated;