ALTER TABLE public.quotation_proposals ADD COLUMN IF NOT EXISTS parts_warranty_days integer;
COMMENT ON COLUMN public.quotation_proposals.warranty_days IS 'Garantia dos serviços, em dias.';
COMMENT ON COLUMN public.quotation_proposals.parts_warranty_days IS 'Garantia das peças, em dias.';