-- ============ ENUMS ============
create type public.transparency_period_status as enum
  ('aberta','em_conferencia','fechada','reabertura_solicitada','reaberta','erro_integracao');
create type public.reopen_request_status as enum
  ('aberto','em_analise','aprovado','rejeitado','executado');
create type public.transparency_integration_mode as enum
  ('desativada','api','webhook','arquivo');

-- ============ COMPETÊNCIAS ============
create table public.transparency_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  status public.transparency_period_status not null default 'aberta',
  checklist jsonb not null default '{}'::jsonb,
  current_version integer not null default 0,
  closing_notes text,
  closed_at timestamptz,
  closed_by uuid,
  reopened_at timestamptz,
  reopened_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (organization_id, year, month)
);
grant select on public.transparency_periods to authenticated;
grant all on public.transparency_periods to service_role;
alter table public.transparency_periods enable row level security;
create policy "periods_select_org" on public.transparency_periods for select to authenticated
  using (organization_id = public.current_org_id() or public.is_super_admin(auth.uid()));
create trigger trg_periods_touch before update on public.transparency_periods
  for each row execute function public.touch_updated_at();

-- ============ PUBLICAÇÕES (VERSIONADAS) ============
create table public.transparency_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_id uuid not null references public.transparency_periods(id) on delete restrict,
  version integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  published_at timestamptz not null default now(),
  published_by uuid,
  superseded_at timestamptz,
  external_mode public.transparency_integration_mode not null default 'desativada',
  external_status text not null default 'nao_aplicavel',
  external_error text,
  external_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (period_id, version)
);
create index idx_pub_org_period on public.transparency_publications (organization_id, period_id, version desc);
grant select on public.transparency_publications to authenticated;
grant all on public.transparency_publications to service_role;
alter table public.transparency_publications enable row level security;
create policy "publications_select_org" on public.transparency_publications for select to authenticated
  using (organization_id = public.current_org_id() or public.is_super_admin(auth.uid()));

-- ============ SOLICITAÇÕES DE REABERTURA ============
create table public.transparency_reopen_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_id uuid not null references public.transparency_periods(id) on delete restrict,
  protocol text,
  reason text not null,
  details text not null,
  status public.reopen_request_status not null default 'aberto',
  requested_by uuid,
  requested_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  support_justification text,
  executed_by uuid,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.transparency_reopen_requests to authenticated;
grant all on public.transparency_reopen_requests to service_role;
alter table public.transparency_reopen_requests enable row level security;
create policy "reopen_select_org" on public.transparency_reopen_requests for select to authenticated
  using (organization_id = public.current_org_id() or public.is_super_admin(auth.uid()));
create trigger trg_reopen_touch before update on public.transparency_reopen_requests
  for each row execute function public.touch_updated_at();

-- ============ TENTATIVAS DE ENVIO EXTERNO ============
create table public.transparency_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  publication_id uuid references public.transparency_publications(id) on delete restrict,
  mode public.transparency_integration_mode not null,
  endpoint text,
  status text not null,
  http_status integer,
  message text,
  attempted_at timestamptz not null default now(),
  attempted_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.transparency_delivery_attempts to authenticated;
grant all on public.transparency_delivery_attempts to service_role;
alter table public.transparency_delivery_attempts enable row level security;
create policy "attempts_select_org" on public.transparency_delivery_attempts for select to authenticated
  using (organization_id = public.current_org_id() or public.is_super_admin(auth.uid()));

-- ============ CONFIGURAÇÃO DE INTEGRAÇÃO EXTERNA ============
alter table public.transparency_settings
  add column if not exists integration_mode public.transparency_integration_mode not null default 'desativada',
  add column if not exists integration_endpoint text,
  add column if not exists integration_auth_header text,
  add column if not exists integration_secret_name text,
  add column if not exists integration_notes text,
  add column if not exists last_sync_status text,
  add column if not exists last_sync_at timestamptz,
  add column if not exists last_sync_error text;

-- ============ BLOQUEIO DE COMPETÊNCIA FECHADA ============
create or replace function public.transparency_period_is_closed(_org uuid, _at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.transparency_periods p
    where p.organization_id = _org
      and p.year = extract(year from _at)::int
      and p.month = extract(month from _at)::int
      and p.status in ('fechada','erro_integracao')
  )
$$;

create or replace function public.guard_closed_competence()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  col text := TG_ARGV[0];
  d timestamptz;
  o uuid;
  rec jsonb;
begin
  rec := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  o := nullif(rec->>'organization_id','')::uuid;
  d := nullif(rec->>col,'')::timestamptz;
  if o is not null and d is not null and public.transparency_period_is_closed(o, d) then
    raise exception 'Competência %/% está fechada no Portal da Transparência. Solicite reabertura ao suporte.',
      to_char(d,'MM'), to_char(d,'YYYY');
  end if;

  if TG_OP = 'UPDATE' then
    rec := to_jsonb(OLD);
    o := nullif(rec->>'organization_id','')::uuid;
    d := nullif(rec->>col,'')::timestamptz;
    if o is not null and d is not null and public.transparency_period_is_closed(o, d) then
      raise exception 'Competência %/% está fechada no Portal da Transparência. Solicite reabertura ao suporte.',
        to_char(d,'MM'), to_char(d,'YYYY');
    end if;
  end if;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end $$;

create trigger trg_lock_fuelings before insert or update or delete on public.fuelings
  for each row execute function public.guard_closed_competence('fueled_at');
create trigger trg_lock_maintenance before insert or update or delete on public.maintenance_records
  for each row execute function public.guard_closed_competence('entry_at');
create trigger trg_lock_usages before insert or update or delete on public.vehicle_usages
  for each row execute function public.guard_closed_competence('planned_departure');
create trigger trg_lock_fines before insert or update or delete on public.traffic_fines
  for each row execute function public.guard_closed_competence('occurred_at');
create trigger trg_lock_accidents before insert or update or delete on public.accidents
  for each row execute function public.guard_closed_competence('occurred_at');
create trigger trg_lock_obligations before insert or update or delete on public.vehicle_obligations
  for each row execute function public.guard_closed_competence('due_date');
create trigger trg_lock_asset_moves before insert or update or delete on public.asset_movements
  for each row execute function public.guard_closed_competence('moved_on');

-- ============ SNAPSHOT DA COMPETÊNCIA ============
create or replace function public.transparency_snapshot(_org uuid, _year int, _month int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  ini timestamptz := make_timestamptz(_year, _month, 1, 0, 0, 0);
  fim timestamptz := ini + interval '1 month';
  out jsonb;
begin
  select jsonb_build_object(
    'competencia', to_char(ini,'MM/YYYY'),
    'gerado_em', now(),
    'frota', (
      select jsonb_build_object(
        'total', count(*),
        'por_situacao', coalesce(jsonb_object_agg(status, qtd), '{}'::jsonb))
      from (select status, count(*) qtd from public.vehicles where organization_id = _org group by status) s
    ),
    'abastecimento', (
      select jsonb_build_object('registros', count(*),
        'litros', coalesce(sum(quantity),0), 'valor_total', coalesce(sum(total_value),0))
      from public.fuelings
      where organization_id = _org and status <> 'cancelado' and fueled_at >= ini and fueled_at < fim
    ),
    'manutencao', (
      select jsonb_build_object('registros', count(*), 'valor_total', coalesce(sum(total_value),0))
      from public.maintenance_records
      where organization_id = _org and status <> 'cancelada' and entry_at >= ini and entry_at < fim
    ),
    'utilizacao', (
      select jsonb_build_object('registros', count(*))
      from public.vehicle_usages
      where organization_id = _org and planned_departure >= ini and planned_departure < fim
    ),
    'contratos', (
      select jsonb_build_object('vigentes', count(*), 'valor_total', coalesce(sum(current_value),0))
      from public.contracts
      where organization_id = _org and coalesce(valid_from, ini::date) < fim::date
        and coalesce(valid_to, fim::date) >= ini::date
    ),
    'empenhos', (
      select jsonb_build_object('registros', count(*),
        'empenhado', coalesce(sum(committed_value),0), 'saldo', coalesce(sum(available_value),0))
      from public.commitments where organization_id = _org
    ),
    'multas', (
      select jsonb_build_object('registros', count(*), 'valor_total', coalesce(sum(amount),0))
      from public.traffic_fines
      where organization_id = _org and occurred_at >= ini and occurred_at < fim
    ),
    'sinistros', (
      select jsonb_build_object('registros', count(*), 'valor_total', coalesce(sum(expenses_value),0))
      from public.accidents
      where organization_id = _org and occurred_at >= ini and occurred_at < fim
    ),
    'obrigacoes', (
      select jsonb_build_object('registros', count(*), 'valor_total', coalesce(sum(amount),0))
      from public.vehicle_obligations
      where organization_id = _org and due_date >= ini::date and due_date < fim::date
    ),
    'patrimonio', (
      select jsonb_build_object('movimentacoes', count(*))
      from public.asset_movements
      where organization_id = _org and moved_on >= ini::date and moved_on < fim::date
    )
  ) into out;
  return out;
end $$;

-- ============ ABRIR / GARANTIR COMPETÊNCIA ============
create or replace function public.ensure_transparency_period(_year int, _month int)
returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid := public.current_org_id(); pid uuid;
begin
  if o is null then raise exception 'Nenhum órgão em contexto.'; end if;
  insert into public.transparency_periods (organization_id, year, month, created_by, updated_by)
  values (o, _year, _month, auth.uid(), auth.uid())
  on conflict (organization_id, year, month) do update set updated_at = now()
  returning id into pid;
  return pid;
end $$;

create or replace function public.save_transparency_checklist(_year int, _month int, _checklist jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o uuid := public.current_org_id(); st public.transparency_period_status;
begin
  if not (public.can_manage_finance() or public.has_role(auth.uid(),'org_admin') or public.is_super_admin(auth.uid()))
    then raise exception 'Sem permissão para conferir a competência.'; end if;
  perform public.ensure_transparency_period(_year, _month);
  select status into st from public.transparency_periods
    where organization_id = o and year = _year and month = _month;
  if st in ('fechada','erro_integracao','reabertura_solicitada') then
    raise exception 'Competência fechada ou em análise de reabertura: o checklist não pode ser alterado.';
  end if;
  update public.transparency_periods
    set checklist = _checklist,
        status = case when st = 'reaberta' then 'reaberta' else 'em_conferencia' end,
        updated_by = auth.uid(), updated_at = now()
  where organization_id = o and year = _year and month = _month;
end $$;

-- ============ FECHAR COMPETÊNCIA ============
create or replace function public.close_transparency_period(_year int, _month int, _checklist jsonb, _notes text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o uuid := public.current_org_id();
  pid uuid; ver int; snap jsonb; st public.transparency_period_status;
  mode public.transparency_integration_mode := 'desativada';
begin
  if o is null then raise exception 'Nenhum órgão em contexto.'; end if;
  if not (public.has_role(auth.uid(),'org_admin') or public.is_super_admin(auth.uid())) then
    raise exception 'Somente o Administrador do Órgão pode fechar a competência.';
  end if;
  if make_date(_year,_month,1) + interval '1 month' > now() then
    raise exception 'A competência %/% ainda não terminou.', lpad(_month::text,2,'0'), _year;
  end if;

  perform public.ensure_transparency_period(_year,_month);
  select id, status, current_version into pid, st, ver from public.transparency_periods
    where organization_id = o and year = _year and month = _month for update;
  if st in ('fechada','erro_integracao') then raise exception 'Competência já está fechada.'; end if;
  if st = 'reabertura_solicitada' then raise exception 'Existe solicitação de reabertura em andamento.'; end if;

  snap := public.transparency_snapshot(o,_year,_month);
  select coalesce(integration_mode,'desativada') into mode from public.transparency_settings where organization_id = o;

  update public.transparency_publications set superseded_at = now()
    where period_id = pid and superseded_at is null;

  ver := coalesce(ver,0) + 1;
  insert into public.transparency_publications
    (organization_id, period_id, version, snapshot, checklist, notes, published_by,
     external_mode, external_status)
  values (o, pid, ver, snap, coalesce(_checklist,'{}'::jsonb), _notes, auth.uid(),
     coalesce(mode,'desativada'),
     case when coalesce(mode,'desativada') = 'desativada' then 'nao_aplicavel' else 'pendente' end);

  update public.transparency_periods
    set status = 'fechada', checklist = coalesce(_checklist, checklist), closing_notes = _notes,
        closed_at = now(), closed_by = auth.uid(), current_version = ver,
        updated_at = now(), updated_by = auth.uid()
  where id = pid;

  perform public.log_event('fechamento','Portal da Transparência','Publicação mensal','/transparencia',
    'transparency_periods', pid, 'FECHAR',
    format('Competência %s/%s fechada e publicada (versão %s).', lpad(_month::text,2,'0'), _year, ver),
    null, snap);

  return jsonb_build_object('period_id', pid, 'version', ver, 'snapshot', snap);
end $$;

-- ============ SOLICITAÇÃO DE REABERTURA ============
create or replace function public.request_transparency_reopen(_year int, _month int, _reason text, _details text)
returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid := public.current_org_id(); pid uuid; st public.transparency_period_status; rid uuid;
begin
  if o is null then raise exception 'Nenhum órgão em contexto.'; end if;
  if coalesce(trim(_reason),'') = '' or coalesce(trim(_details),'') = '' then
    raise exception 'Motivo e descrição detalhada são obrigatórios.';
  end if;
  select id, status into pid, st from public.transparency_periods
    where organization_id = o and year = _year and month = _month;
  if pid is null then raise exception 'Competência não encontrada.'; end if;
  if st not in ('fechada','erro_integracao') then raise exception 'Somente competências fechadas podem ser reabertas.'; end if;
  if exists (select 1 from public.transparency_reopen_requests
             where period_id = pid and status in ('aberto','em_analise','aprovado')) then
    raise exception 'Já existe um chamado de reabertura em andamento para esta competência.';
  end if;

  insert into public.transparency_reopen_requests
    (organization_id, period_id, protocol, reason, details, requested_by)
  values (o, pid, public.next_org_code(o,'reabertura','REAB'), _reason, _details, auth.uid())
  returning id into rid;

  update public.transparency_periods set status = 'reabertura_solicitada', updated_at = now(), updated_by = auth.uid()
    where id = pid;

  perform public.log_event('reabertura','Portal da Transparência','Solicitações de reabertura','/transparencia',
    'transparency_reopen_requests', rid, 'SOLICITAR',
    format('Solicitação de reabertura da competência %s/%s.', lpad(_month::text,2,'0'), _year), null, null);
  return rid;
end $$;

-- ============ ANÁLISE E EXECUÇÃO (SUPER ADMIN) ============
create or replace function public.review_transparency_reopen(_request uuid, _decision text, _justification text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.transparency_reopen_requests;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Somente o suporte da plataforma pode analisar chamados de reabertura.';
  end if;
  if _decision not in ('em_analise','aprovado','rejeitado') then raise exception 'Decisão inválida.'; end if;
  if _decision in ('aprovado','rejeitado') and coalesce(trim(_justification),'') = '' then
    raise exception 'Justificativa do suporte é obrigatória.';
  end if;
  select * into r from public.transparency_reopen_requests where id = _request for update;
  if r.id is null then raise exception 'Chamado não encontrado.'; end if;
  if r.status in ('executado','rejeitado') then raise exception 'Chamado já finalizado.'; end if;

  update public.transparency_reopen_requests
    set status = _decision::public.reopen_request_status, reviewed_by = auth.uid(), reviewed_at = now(),
        support_justification = coalesce(_justification, support_justification), updated_at = now()
  where id = _request;

  if _decision = 'rejeitado' then
    update public.transparency_periods set status = 'fechada', updated_at = now() where id = r.period_id;
  end if;

  perform public.log_event('reabertura','Portal da Transparência','Suporte — reaberturas','/plataforma',
    'transparency_reopen_requests', _request, upper(_decision),
    format('Chamado de reabertura analisado pelo suporte (órgão %s).', r.organization_id), null, null);
end $$;

create or replace function public.execute_transparency_reopen(_request uuid, _justification text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.transparency_reopen_requests;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Somente o suporte da plataforma pode efetivar a reabertura.';
  end if;
  select * into r from public.transparency_reopen_requests where id = _request for update;
  if r.id is null then raise exception 'Chamado não encontrado.'; end if;
  if r.status <> 'aprovado' then raise exception 'O chamado precisa estar aprovado para ser executado.'; end if;

  update public.transparency_reopen_requests
    set status = 'executado', executed_by = auth.uid(), executed_at = now(),
        support_justification = coalesce(nullif(trim(_justification),''), support_justification),
        updated_at = now()
  where id = _request;

  update public.transparency_periods
    set status = 'reaberta', reopened_at = now(), reopened_by = auth.uid(), updated_at = now()
  where id = r.period_id;

  perform public.log_event('reabertura','Portal da Transparência','Suporte — reaberturas','/plataforma',
    'transparency_periods', r.period_id, 'REABRIR',
    format('Competência reaberta pelo suporte (órgão %s). Versões anteriores preservadas.', r.organization_id),
    null, null);
end $$;

-- ============ REGISTRO DE TENTATIVA DE ENVIO EXTERNO ============
create or replace function public.log_transparency_delivery(_publication uuid, _status text, _message text, _http int)
returns void language plpgsql security definer set search_path = public as $$
declare p public.transparency_publications; s public.transparency_settings;
begin
  select * into p from public.transparency_publications where id = _publication;
  if p.id is null then raise exception 'Publicação não encontrada.'; end if;
  if p.organization_id <> public.current_org_id() and not public.is_super_admin(auth.uid()) then
    raise exception 'Publicação de outro órgão.';
  end if;
  select * into s from public.transparency_settings where organization_id = p.organization_id;

  insert into public.transparency_delivery_attempts
    (organization_id, publication_id, mode, endpoint, status, http_status, message, attempted_by)
  values (p.organization_id, _publication, coalesce(s.integration_mode,'desativada'),
          s.integration_endpoint, _status, _http, _message, auth.uid());

  update public.transparency_publications
    set external_status = _status, external_error = case when _status = 'falha' then _message else null end,
        external_sent_at = case when _status = 'sucesso' then now() else external_sent_at end
  where id = _publication;

  update public.transparency_settings
    set last_sync_status = _status, last_sync_at = now(),
        last_sync_error = case when _status = 'falha' then _message else null end
  where organization_id = p.organization_id;

  if _status = 'falha' then
    update public.transparency_periods set status = 'erro_integracao' where id = p.period_id;
  elsif _status = 'sucesso' then
    update public.transparency_periods set status = 'fechada' where id = p.period_id and status = 'erro_integracao';
  end if;
end $$;

grant execute on function public.ensure_transparency_period(int,int) to authenticated;
grant execute on function public.save_transparency_checklist(int,int,jsonb) to authenticated;
grant execute on function public.close_transparency_period(int,int,jsonb,text) to authenticated;
grant execute on function public.request_transparency_reopen(int,int,text,text) to authenticated;
grant execute on function public.review_transparency_reopen(uuid,text,text) to authenticated;
grant execute on function public.execute_transparency_reopen(uuid,text) to authenticated;
grant execute on function public.log_transparency_delivery(uuid,text,text,int) to authenticated;
grant execute on function public.transparency_snapshot(uuid,int,int) to authenticated;