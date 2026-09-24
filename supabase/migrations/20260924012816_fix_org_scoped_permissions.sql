-- Corrige permissões para considerar o órgão ativo do usuário.
-- Super Admin continua global, operando pelo órgão selecionado em platform_sessions.

CREATE OR REPLACE FUNCTION public.has_role(
  _user_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        ur.role = 'super_admin'
        OR ur.organization_id = public.current_org_id()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = public.current_org_id()
        AND ur.role IN ('org_admin','fleet_manager','unit_manager')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_users()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = public.current_org_id()
        AND ur.role = 'org_admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = public.current_org_id()
        AND ur.role IN ('org_admin','fleet_manager')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_register_fueling()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = public.current_org_id()
        AND ur.role IN ('org_admin','fleet_manager','unit_manager','operator')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_cancel_fueling()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = public.current_org_id()
        AND ur.role IN ('org_admin','fleet_manager')
    );
$$;

DROP POLICY IF EXISTS "insert own activity logs" ON public.activity_logs;

CREATE POLICY "insert own activity logs"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (
    organization_id = public.current_org_id()
    OR (
      public.is_super_admin(auth.uid())
      AND organization_id IS NULL
    )
  )
);