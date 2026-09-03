REVOKE ALL ON FUNCTION public.active_org_id() FROM anon;
REVOKE ALL ON FUNCTION public.write_activity_log() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_activity_logs() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.log_event(text,text,text,text,text,uuid,text,text,jsonb,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_event(text,text,text,text,text,uuid,text,text,jsonb,jsonb) TO authenticated;