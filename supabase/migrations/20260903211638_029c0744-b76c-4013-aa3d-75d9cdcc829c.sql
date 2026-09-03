REVOKE ALL ON FUNCTION public.backup_due_organizations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_backup_alerts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_backups() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_backup_run_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_due_organizations() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_backup_alerts() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_backups() TO service_role;