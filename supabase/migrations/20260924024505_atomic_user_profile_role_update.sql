-- ============================================================
-- FrotaGov
-- Atualização atômica de perfil + papel do usuário
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_org_user_atomic(
  _user_id uuid,
  _full_name text,
  _job_title text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _unit_id uuid DEFAULT NULL,
  _active boolean DEFAULT true,
  _role public.app_role DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.current_org_id();
BEGIN
  IF _org IS NULL THEN
    RAISE EXCEPTION 'Nenhum órgão ativo selecionado.';
  END IF;

  IF NOT public.can_manage_users() THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar usuários.';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não informado.';
  END IF;

  IF COALESCE(btrim(_full_name), '') = '' THEN
    RAISE EXCEPTION 'Informe o nome do usuário.';
  END IF;

  IF _role = 'super_admin' THEN
    RAISE EXCEPTION 'O perfil Super Admin não pode ser concedido por esta operação.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Usuário não pertence ao órgão atual.';
  END IF;

  IF _unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units
    WHERE id = _unit_id
      AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Unidade inválida para o órgão atual.';
  END IF;

  UPDATE public.profiles
     SET full_name = btrim(_full_name),
         job_title = NULLIF(btrim(_job_title), ''),
         phone = NULLIF(btrim(_phone), ''),
         unit_id = _unit_id,
         active = COALESCE(_active, true),
         updated_at = now()
   WHERE id = _user_id
     AND organization_id = _org;

  -- Mantém intacto qualquer papel super_admin da plataforma.
  DELETE FROM public.user_roles
   WHERE user_id = _user_id
     AND organization_id = _org
     AND role <> 'super_admin';

  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (
      user_id,
      organization_id,
      role
    )
    VALUES (
      _user_id,
      _org,
      _role
    )
    ON CONFLICT (user_id, role, organization_id)
    DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL
ON FUNCTION public.update_org_user_atomic(
  uuid,
  text,
  text,
  text,
  uuid,
  boolean,
  public.app_role
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.update_org_user_atomic(
  uuid,
  text,
  text,
  text,
  uuid,
  boolean,
  public.app_role
)
TO authenticated, service_role;