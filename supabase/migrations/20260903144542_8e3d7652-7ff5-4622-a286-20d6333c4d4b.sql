REVOKE ALL ON FUNCTION public.guard_same_org_refs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_same_org_refs() TO service_role;