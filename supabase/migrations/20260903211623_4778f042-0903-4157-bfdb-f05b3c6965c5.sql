REVOKE EXECUTE ON FUNCTION public.backup_due_organizations() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_backup_alerts() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_backups() FROM anon, authenticated;