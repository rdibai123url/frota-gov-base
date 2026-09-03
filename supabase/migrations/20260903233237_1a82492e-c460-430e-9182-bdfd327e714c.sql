DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN ('my_partner_id','is_partner_user','partner_org_id','asset_card_issue',
                        'asset_card_revoke','asset_card_resolve','partner_authorizations',
                        'partner_capture_fueling','partner_capture_service',
                        'fleet_consumption_segments','fleet_cost_rows','fleet_downtime',
                        'refresh_intelligence_alerts')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, public', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;