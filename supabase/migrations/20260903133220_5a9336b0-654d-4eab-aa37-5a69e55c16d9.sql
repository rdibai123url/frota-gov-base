ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.can_manage_users()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('super_admin','org_admin')
  );
$$;

DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update profiles in org" ON public.profiles
FOR UPDATE TO authenticated
USING (
  id = auth.uid()
  OR is_super_admin(auth.uid())
  OR (organization_id = current_org_id() AND can_manage_users())
)
WITH CHECK (
  id = auth.uid()
  OR is_super_admin(auth.uid())
  OR (organization_id = current_org_id() AND can_manage_users())
);

CREATE POLICY "manage roles in org" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    organization_id = current_org_id()
    AND can_manage_users()
    AND role <> 'super_admin'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.organization_id = current_org_id())
  )
);

CREATE POLICY "delete roles in org" ON public.user_roles
FOR DELETE TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id = current_org_id()
    AND can_manage_users()
    AND role <> 'super_admin'
  )
);

GRANT INSERT, DELETE ON public.user_roles TO authenticated;