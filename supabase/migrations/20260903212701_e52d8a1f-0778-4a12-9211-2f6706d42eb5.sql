ALTER TABLE public.backup_runs ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.backup_restores ADD COLUMN IF NOT EXISTS updated_by uuid;