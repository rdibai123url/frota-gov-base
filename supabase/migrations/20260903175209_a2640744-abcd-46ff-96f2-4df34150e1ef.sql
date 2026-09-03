-- 1) Revoke EXECUTE on trigger/internal functions from anon and authenticated
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND (p.prorettype = 'trigger'::regtype
            OR p.proname IN ('purge_activity_logs','next_org_code','budget_reserve','budget_release','budget_consume','budget_refund','budget_log'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, PUBLIC', r.sig);
  END LOOP;
END $$;

-- 2) Revoke anon EXECUTE on every SECURITY DEFINER function in public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- 3) org_counters: internal-only table, explicit deny policy so it is never reachable via the API
REVOKE ALL ON TABLE public.org_counters FROM anon, authenticated;
GRANT ALL ON TABLE public.org_counters TO service_role;
ALTER TABLE public.org_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_counters_no_api_access" ON public.org_counters;
CREATE POLICY "org_counters_no_api_access" ON public.org_counters
  FOR SELECT TO authenticated USING (false);

-- 4) Global (cron-friendly) expiration of fuel authorizations
CREATE OR REPLACE FUNCTION public.expire_fuel_authorizations_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.fuel_authorizations
     SET status = 'expirada', updated_at = now()
   WHERE status IN ('pendente','autorizada','utilizada_parcial')
     AND valid_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_fuel_authorizations_all() FROM anon, authenticated, PUBLIC;

-- 5) Scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('frotagov_refresh_alerts','frotagov_expire_authorizations','frotagov_purge_logs');

  PERFORM cron.schedule('frotagov_refresh_alerts', '5 * * * *', $cron$
    SELECT public.refresh_financial_alerts();
    SELECT public.refresh_maintenance_alerts();
    SELECT public.refresh_procurement_alerts();
    SELECT public.refresh_fleet_alerts();
  $cron$);

  PERFORM cron.schedule('frotagov_expire_authorizations', '10 * * * *',
    $cron$SELECT public.expire_fuel_authorizations_all();$cron$);

  PERFORM cron.schedule('frotagov_purge_logs', '20 3 * * *',
    $cron$SELECT public.purge_activity_logs();$cron$);
END $$;