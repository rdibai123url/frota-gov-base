ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.stock_reservations ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.partner_captures ADD COLUMN IF NOT EXISTS updated_by uuid;