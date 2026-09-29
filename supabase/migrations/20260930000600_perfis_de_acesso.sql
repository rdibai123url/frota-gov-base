-- Perfis de acesso mais finos: o administrador do órgão escolhe, para cada perfil, quais telas
-- ficam abertas. Sem linha cadastrada vale o padrão do sistema. Esconder a tela é uma camada
-- de conforto e clareza; a proteção dos dados continua sendo feita pelas regras do banco.

CREATE TABLE public.org_role_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key ~ '^[a-z0-9-]{2,60}$'),
  role public.app_role NOT NULL,
  allowed boolean NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, module_key, role),
  -- o administrador do órgão nunca perde acesso (evita trancar o próprio órgão)
  CONSTRAINT org_role_access_admin_chk CHECK (role NOT IN ('org_admin', 'super_admin') OR allowed)
);

ALTER TABLE public.org_role_access ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_role_access TO authenticated;
GRANT ALL ON public.org_role_access TO service_role;

CREATE POLICY "read org_role_access" ON public.org_role_access FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "write org_role_access" ON public.org_role_access FOR ALL TO authenticated
  USING (organization_id = public.current_org_id()
         AND (public.has_role(auth.uid(), 'org_admin') OR public.is_super_admin(auth.uid())))
  WITH CHECK (organization_id = public.current_org_id()
         AND (public.has_role(auth.uid(), 'org_admin') OR public.is_super_admin(auth.uid())));
