-- Acesso por usuário: o gestor libera ou bloqueia telas para uma pessoa específica, por cima do
-- perfil. Ordem de prioridade: escolha para o usuário > escolha do órgão para o perfil > padrão.

CREATE TABLE public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key ~ '^[a-z0-9-]{2,60}$'),
  allowed boolean NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key),
  -- telas essenciais nunca são bloqueadas para ninguém
  CONSTRAINT user_module_access_essential_chk
    CHECK (allowed OR module_key NOT IN ('painel', 'perfis-acesso', 'usuarios', 'orgao'))
);
CREATE INDEX user_module_access_org_idx ON public.user_module_access (organization_id);

/* O usuário precisa pertencer ao mesmo órgão do registro. */
CREATE OR REPLACE FUNCTION public.user_module_access_same_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = NEW.user_id AND p.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'O usuário não pertence a este órgão';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.user_module_access_same_org() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER user_module_access_same_org BEFORE INSERT OR UPDATE ON public.user_module_access
  FOR EACH ROW EXECUTE FUNCTION public.user_module_access_same_org();

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_module_access TO authenticated;
GRANT ALL ON public.user_module_access TO service_role;

-- cada pessoa lê as próprias escolhas; o administrador do órgão lê e altera todas do órgão
CREATE POLICY "read user_module_access" ON public.user_module_access FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR (organization_id = public.current_org_id()
             AND (public.has_role(auth.uid(), 'org_admin') OR public.is_super_admin(auth.uid()))));
CREATE POLICY "write user_module_access" ON public.user_module_access FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.has_role(auth.uid(), 'org_admin') OR public.is_super_admin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.has_role(auth.uid(), 'org_admin') OR public.is_super_admin(auth.uid())));
