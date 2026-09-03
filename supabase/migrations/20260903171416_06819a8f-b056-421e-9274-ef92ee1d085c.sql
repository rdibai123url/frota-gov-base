-- 1) Sessão de contexto do Super Admin -------------------------------------
CREATE TABLE public.platform_sessions (
  user_id uuid PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_sessions TO authenticated;
GRANT ALL ON public.platform_sessions TO service_role;
ALTER TABLE public.platform_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin own session" ON public.platform_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.active_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN public.is_super_admin(auth.uid())
      THEN (SELECT organization_id FROM public.platform_sessions WHERE user_id = auth.uid())
    ELSE (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  END;
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.active_org_id();
$$;

-- 2) Escopo do Super Admin nas políticas existentes --------------------------
DO $$
DECLARE r record; v_qual text; v_check text; v_roles text;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename NOT IN ('organizations','profiles','audit_logs','platform_sessions')
      AND (p.qual LIKE '%is_super_admin(auth.uid())%' OR p.with_check LIKE '%is_super_admin(auth.uid())%')
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema='public' AND c.table_name=p.tablename AND c.column_name='organization_id')
  LOOP
    v_qual := replace(COALESCE(r.qual,''), 'is_super_admin(auth.uid())',
      '(is_super_admin(auth.uid()) AND organization_id = current_org_id())');
    v_check := replace(COALESCE(r.with_check,''), 'is_super_admin(auth.uid())',
      '(is_super_admin(auth.uid()) AND organization_id = current_org_id())');
    v_roles := array_to_string(r.roles, ',');
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO %s %s %s',
      r.policyname, r.tablename, r.cmd, v_roles,
      CASE WHEN r.qual IS NULL THEN '' ELSE 'USING (' || v_qual || ')' END,
      CASE WHEN r.with_check IS NULL THEN '' ELSE 'WITH CHECK (' || v_check || ')' END);
  END LOOP;
END $$;

-- user_roles: super admin limitado ao órgão em contexto
DROP POLICY IF EXISTS "read roles in org" ON public.user_roles;
CREATE POLICY "read roles in org" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR organization_id = public.current_org_id()
         OR (public.is_super_admin(auth.uid()) AND organization_id = public.current_org_id()));

DROP POLICY IF EXISTS "read profiles in org" ON public.profiles;
CREATE POLICY "read profiles in org" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR organization_id = public.current_org_id());

DROP POLICY IF EXISTS "update profiles in org" ON public.profiles;
CREATE POLICY "update profiles in org" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR (organization_id = public.current_org_id() AND public.can_manage_users()))
  WITH CHECK (id = auth.uid() OR (organization_id = public.current_org_id() AND public.can_manage_users()));

-- 3) Perfis: CPF e troca obrigatória de senha --------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- 4) Sem auto-cadastro de órgão ----------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, organization_id, full_name, email, must_change_password)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data ->> 'organization_id','')::uuid,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    COALESCE((NEW.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

-- 5) Logs de atividade --------------------------------------------------------
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_name text,
  actor_email text,
  actor_role text,
  as_super_admin boolean NOT NULL DEFAULT false,
  event_type text NOT NULL,
  area text,
  screen text,
  route text,
  entity text,
  record_id uuid,
  action text,
  summary text,
  old_data jsonb,
  new_data jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_org_created_idx ON public.activity_logs (organization_id, created_at DESC);
CREATE INDEX activity_logs_actor_idx ON public.activity_logs (actor_id, created_at DESC);
CREATE INDEX activity_logs_event_idx ON public.activity_logs (event_type, created_at DESC);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read activity logs" ON public.activity_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (organization_id = public.current_org_id()
        AND (public.can_manage_users()
             OR public.has_role(auth.uid(), 'auditor')
             OR public.has_role(auth.uid(), 'fleet_manager')))
  );
CREATE POLICY "insert own activity logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_event(
  _event_type text, _area text DEFAULT NULL, _screen text DEFAULT NULL, _route text DEFAULT NULL,
  _entity text DEFAULT NULL, _record_id uuid DEFAULT NULL, _action text DEFAULT NULL,
  _summary text DEFAULT NULL, _old jsonb DEFAULT NULL, _new jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_p record; v_role text;
BEGIN
  SELECT full_name, email INTO v_p FROM public.profiles WHERE id = auth.uid();
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.activity_logs (organization_id, actor_id, actor_name, actor_email, actor_role,
    as_super_admin, event_type, area, screen, route, entity, record_id, action, summary, old_data, new_data)
  VALUES (public.current_org_id(), auth.uid(), v_p.full_name, v_p.email, v_role,
    public.is_super_admin(auth.uid()), _event_type, _area, _screen, _route, _entity, _record_id,
    _action, _summary, _old, _new);
END; $$;
REVOKE ALL ON FUNCTION public.log_event(text,text,text,text,text,uuid,text,text,jsonb,jsonb) FROM anon;

-- gatilho genérico rico para auditoria de tabelas
CREATE OR REPLACE FUNCTION public.write_activity_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_p record; v_role text; v_org uuid;
BEGIN
  v_org := COALESCE((to_jsonb(NEW) ->> 'organization_id')::uuid, (to_jsonb(OLD) ->> 'organization_id')::uuid);
  SELECT full_name, email INTO v_p FROM public.profiles WHERE id = auth.uid();
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.activity_logs (organization_id, actor_id, actor_name, actor_email, actor_role,
    as_super_admin, event_type, entity, record_id, action, summary, old_data, new_data)
  VALUES (v_org, auth.uid(), v_p.full_name, v_p.email, v_role, public.is_super_admin(auth.uid()),
    'registro', TG_TABLE_NAME, COALESCE((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(OLD) ->> 'id')::uuid),
    TG_OP, TG_OP || ' em ' || TG_TABLE_NAME,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END; $$;

-- 6) Configurações da plataforma ---------------------------------------------
CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  log_retention_days integer NOT NULL DEFAULT 365,
  platform_name text NOT NULL DEFAULT 'FrotaGov',
  support_email text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin platform settings" ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.purge_activity_logs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_days integer; v_count integer;
BEGIN
  SELECT log_retention_days INTO v_days FROM public.platform_settings WHERE id;
  DELETE FROM public.activity_logs WHERE created_at < now() - make_interval(days => COALESCE(v_days, 365));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.purge_activity_logs() FROM anon, authenticated;

-- 7) Chaves de integração por órgão ------------------------------------------
CREATE TABLE public.org_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['read'],
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX org_api_keys_prefix_idx ON public.org_api_keys (prefix);
GRANT SELECT, INSERT, UPDATE ON public.org_api_keys TO authenticated;
GRANT ALL ON public.org_api_keys TO service_role;
ALTER TABLE public.org_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read api keys in org" ON public.org_api_keys FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "insert api keys in org" ON public.org_api_keys FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "update api keys in org" ON public.org_api_keys FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE TRIGGER org_api_keys_touch BEFORE UPDATE ON public.org_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER org_api_keys_activity AFTER INSERT OR UPDATE ON public.org_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.write_activity_log();

-- 8) Portal da Transparência --------------------------------------------------
CREATE TABLE public.transparency_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  slug text UNIQUE,
  headline text,
  datasets jsonb NOT NULL DEFAULT '{"frota":false,"abastecimento":false,"manutencao":false,"contratos":false,"indicadores":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.transparency_settings TO authenticated;
GRANT SELECT ON public.transparency_settings TO anon;
GRANT ALL ON public.transparency_settings TO service_role;
ALTER TABLE public.transparency_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads enabled portals" ON public.transparency_settings FOR SELECT TO anon
  USING (enabled = true);
CREATE POLICY "org reads own portal" ON public.transparency_settings FOR SELECT TO authenticated
  USING (enabled = true OR organization_id = public.current_org_id());
CREATE POLICY "org admin sets portal" ON public.transparency_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "org admin updates portal" ON public.transparency_settings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE TRIGGER transparency_touch BEFORE UPDATE ON public.transparency_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER transparency_activity AFTER INSERT OR UPDATE ON public.transparency_settings
  FOR EACH ROW EXECUTE FUNCTION public.write_activity_log();

-- 9) Modelos de relatório por usuário ----------------------------------------
CREATE TABLE public.report_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  report_key text NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_presets TO authenticated;
GRANT ALL ON public.report_presets TO service_role;
ALTER TABLE public.report_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own report presets" ON public.report_presets FOR ALL TO authenticated
  USING (user_id = auth.uid() AND organization_id = public.current_org_id())
  WITH CHECK (user_id = auth.uid() AND organization_id = public.current_org_id());
CREATE TRIGGER report_presets_touch BEFORE UPDATE ON public.report_presets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();