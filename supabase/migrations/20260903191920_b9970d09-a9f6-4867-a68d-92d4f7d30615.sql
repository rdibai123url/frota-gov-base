revoke execute on function public.ensure_transparency_period(int,int) from anon, public;
revoke execute on function public.save_transparency_checklist(int,int,jsonb) from anon, public;
revoke execute on function public.close_transparency_period(int,int,jsonb,text) from anon, public;
revoke execute on function public.request_transparency_reopen(int,int,text,text) from anon, public;
revoke execute on function public.review_transparency_reopen(uuid,text,text) from anon, public;
revoke execute on function public.execute_transparency_reopen(uuid,text) from anon, public;
revoke execute on function public.log_transparency_delivery(uuid,text,text,int) from anon, public;
revoke execute on function public.transparency_snapshot(uuid,int,int) from anon, public;
revoke execute on function public.transparency_period_is_closed(uuid,timestamptz) from anon, public;
revoke execute on function public.guard_closed_competence() from anon, public, authenticated;

grant execute on function public.ensure_transparency_period(int,int) to authenticated;
grant execute on function public.save_transparency_checklist(int,int,jsonb) to authenticated;
grant execute on function public.close_transparency_period(int,int,jsonb,text) to authenticated;
grant execute on function public.request_transparency_reopen(int,int,text,text) to authenticated;
grant execute on function public.review_transparency_reopen(uuid,text,text) to authenticated;
grant execute on function public.execute_transparency_reopen(uuid,text) to authenticated;
grant execute on function public.log_transparency_delivery(uuid,text,text,int) to authenticated;
grant execute on function public.transparency_snapshot(uuid,int,int) to authenticated;