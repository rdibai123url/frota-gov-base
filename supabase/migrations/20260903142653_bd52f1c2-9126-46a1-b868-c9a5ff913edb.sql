DO $$
DECLARE r record; allowed text[] := ARRAY[
  'has_role','is_super_admin','current_org_id','my_unit_id','can_write','can_manage_users',
  'can_register_fueling','can_cancel_fueling','can_fuel_vehicle','can_manage_fleet','can_operate_usage',
  'unit_scope_ok','can_manage_finance','expire_fuel_authorizations','fuel_limit_breach',
  'refresh_financial_alerts','log_budget_block'];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    IF r.proname = ANY (allowed) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;