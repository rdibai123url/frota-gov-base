
REVOKE EXECUTE ON FUNCTION public.server_quota_usage(uuid, timestamptz, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.active_server_quota(uuid, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.server_quota_cycle(public.server_quota_period, timestamptz) FROM authenticated;
