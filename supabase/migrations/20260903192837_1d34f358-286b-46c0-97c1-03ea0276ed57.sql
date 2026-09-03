alter table public.transparency_reopen_requests add column if not exists updated_by uuid;
alter table public.transparency_reopen_requests add column if not exists updated_at timestamptz not null default now();
alter table public.transparency_periods add column if not exists updated_by uuid;