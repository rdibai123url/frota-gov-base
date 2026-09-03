CREATE TABLE IF NOT EXISTS public.cron_secrets (
  name text PRIMARY KEY,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cron_secrets TO service_role;

ALTER TABLE public.cron_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Somente o servidor acessa as chaves de rotina"
  ON public.cron_secrets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER cron_secrets_touch_updated_at
  BEFORE UPDATE ON public.cron_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();