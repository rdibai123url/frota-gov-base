REVOKE ALL ON FUNCTION public.prepare_supply_order_receipt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_supply_order_receipt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_exceptional_stock_entry() FROM PUBLIC, anon, authenticated;