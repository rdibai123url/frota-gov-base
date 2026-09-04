ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS company_kind text NOT NULL DEFAULT 'oficina';
ALTER TABLE public.workshops DROP CONSTRAINT IF EXISTS workshops_company_kind_chk;
ALTER TABLE public.workshops ADD CONSTRAINT workshops_company_kind_chk CHECK (company_kind IN ('oficina','loja','fornecedor'));