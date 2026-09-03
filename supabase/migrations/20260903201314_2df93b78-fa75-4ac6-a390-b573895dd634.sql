revoke execute on function public.guard_supplier_contract() from public, anon, authenticated;
revoke execute on function public.guard_contract_period() from public, anon, authenticated;
revoke execute on function public.apply_contract_period_movement() from public, anon, authenticated;
revoke execute on function public.apply_contract_amendment() from public, anon, authenticated;
revoke execute on function public.apply_commitment_movement() from public, anon, authenticated;
revoke execute on function public.contract_period_at(uuid, date) from public, anon;