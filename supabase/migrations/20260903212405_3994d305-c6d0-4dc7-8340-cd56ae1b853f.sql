DROP TRIGGER IF EXISTS cron_secrets_touch_updated_at ON public.cron_secrets;
ALTER TABLE public.cron_secrets ADD COLUMN IF NOT EXISTS updated_by uuid;
CREATE TRIGGER cron_secrets_touch_updated_at
  BEFORE UPDATE ON public.cron_secrets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();