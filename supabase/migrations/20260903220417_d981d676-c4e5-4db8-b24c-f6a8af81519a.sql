
REVOKE EXECUTE ON FUNCTION public.contract_item_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_contract_item_delete() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_contract_value_from_items() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.touch_server_fuel_quota() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_server_quota_authorization() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_server_quota_fueling() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.alert_server_quota_fueling() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.server_quota_usage(uuid, timestamptz, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.active_server_quota(uuid, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.server_quota_cycle(public.server_quota_period, timestamptz) FROM anon, public;
