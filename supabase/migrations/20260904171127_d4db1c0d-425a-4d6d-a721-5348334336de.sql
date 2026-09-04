-- 1) Convites: apoio a fornecedores e e-mails avulsos
ALTER TABLE public.quotation_invitations ALTER COLUMN workshop_id DROP NOT NULL;

ALTER TABLE public.quotation_invitations
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.quotation_proposals(id),
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.quotation_invitations
  DROP CONSTRAINT IF EXISTS quotation_invitations_send_status_chk;
ALTER TABLE public.quotation_invitations
  ADD CONSTRAINT quotation_invitations_send_status_chk
  CHECK (send_status IN ('pendente','enviado','erro','respondido','expirado'));

ALTER TABLE public.quotation_invitations
  DROP CONSTRAINT IF EXISTS quotation_invitations_target_chk;
ALTER TABLE public.quotation_invitations
  ADD CONSTRAINT quotation_invitations_target_chk
  CHECK (workshop_id IS NOT NULL OR supplier_id IS NOT NULL OR email IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS quotation_invitations_email_uidx
  ON public.quotation_invitations (quotation_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS quotation_invitations_token_idx
  ON public.quotation_invitations (token_hash) WHERE token_hash IS NOT NULL;

-- 2) Configuração de e-mail por órgão (sem segredos)
CREATE TABLE IF NOT EXISTS public.org_email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id),
  provider text NOT NULL DEFAULT 'nenhum',
  enabled boolean NOT NULL DEFAULT false,
  from_name text,
  from_email text,
  reply_to text,
  smtp_host text,
  smtp_port integer,
  smtp_secure boolean NOT NULL DEFAULT true,
  smtp_user text,
  has_secret boolean NOT NULL DEFAULT false,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT org_email_settings_provider_chk CHECK (provider IN ('nenhum','smtp','resend','sendgrid'))
);

GRANT SELECT, INSERT, UPDATE ON public.org_email_settings TO authenticated;
GRANT ALL ON public.org_email_settings TO service_role;
ALTER TABLE public.org_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read email settings" ON public.org_email_settings FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "insert email settings" ON public.org_email_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());
CREATE POLICY "update email settings" ON public.org_email_settings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_users())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_users());

CREATE TRIGGER trg_org_email_settings_updated BEFORE UPDATE ON public.org_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Segredos do provedor: acesso exclusivo do servidor
CREATE TABLE IF NOT EXISTS public.org_email_secrets (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.org_email_secrets FROM anon, authenticated;
GRANT ALL ON public.org_email_secrets TO service_role;
ALTER TABLE public.org_email_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only email secrets" ON public.org_email_secrets FOR ALL TO service_role
  USING (true) WITH CHECK (true);