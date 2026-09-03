-- ============ 1) PRODUTOS AUTOMOTIVOS ============
alter table public.fuel_types add column if not exists category text not null default 'combustivel';
alter table public.fuel_types drop constraint if exists fuel_types_category_chk;
alter table public.fuel_types add constraint fuel_types_category_chk
  check (category in ('combustivel','lubrificante','fluido','aditivo','outro'));

-- ============ 2) ABASTECIMENTO: DOCUMENTO FISCAL ============
alter table public.fuelings add column if not exists document_kind text;
alter table public.fuelings add column if not exists document_key text;
alter table public.fuelings drop constraint if exists fuelings_document_kind_chk;
alter table public.fuelings add constraint fuelings_document_kind_chk
  check (document_kind is null or document_kind in ('cupom','nfce','nfe','nota','recibo','outro'));

-- ============ 3) FORNECEDOR x CONTRATO ============
create table if not exists public.supplier_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  cnpj_match boolean not null default false,
  justification text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (supplier_id, contract_id)
);
grant select, insert, update on public.supplier_contracts to authenticated;
grant all on public.supplier_contracts to service_role;
alter table public.supplier_contracts enable row level security;
create policy "supplier_contracts_select_org" on public.supplier_contracts
  for select to authenticated
  using (organization_id = public.current_org_id() or public.is_super_admin(auth.uid()));
create policy "supplier_contracts_insert_org" on public.supplier_contracts
  for insert to authenticated
  with check (organization_id = public.current_org_id() and public.can_manage_finance());
create policy "supplier_contracts_update_org" on public.supplier_contracts
  for update to authenticated
  using (organization_id = public.current_org_id() and public.can_manage_finance())
  with check (organization_id = public.current_org_id());
create trigger trg_supplier_contracts_touch before update on public.supplier_contracts
  for each row execute function public.touch_updated_at();

-- coerência de órgão entre fornecedor, contrato e vínculo
create or replace function public.guard_supplier_contract()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sup uuid; v_con uuid; v_scnpj text; v_ccnpj text;
begin
  select organization_id, cnpj into v_sup, v_scnpj from public.suppliers where id = new.supplier_id;
  select organization_id, coalesce(cnpj,'') into v_con, v_ccnpj from public.contracts where id = new.contract_id;
  if v_sup is null or v_con is null then
    raise exception 'Fornecedor ou contrato inexistente.';
  end if;
  if v_sup <> new.organization_id or v_con <> new.organization_id then
    raise exception 'Fornecedor e contrato devem pertencer ao mesmo órgão do vínculo.';
  end if;
  new.cnpj_match := (nullif(regexp_replace(coalesce(v_scnpj,''),'\D','','g'),'') is not null
                     and regexp_replace(coalesce(v_scnpj,''),'\D','','g') = regexp_replace(coalesce(v_ccnpj,''),'\D','','g'));
  if not new.cnpj_match and coalesce(btrim(new.justification),'') = '' then
    raise exception 'CNPJ do fornecedor não corresponde ao do contrato. Justificativa administrativa é obrigatória.';
  end if;
  return new;
end $$;
create trigger trg_supplier_contract_guard before insert or update on public.supplier_contracts
  for each row execute function public.guard_supplier_contract();

-- ============ 4) VIGÊNCIAS E ADITIVOS DE CONTRATO ============
do $$ begin
  create type public.contract_amendment_kind as enum
    ('prorrogacao','acrescimo','supressao','reajuste','reequilibrio','prorrogacao_valor','combinado');
exception when duplicate_object then null; end $$;

create table if not exists public.contract_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  sequence integer not null,
  valid_from date not null,
  valid_to date not null,
  period_value numeric(16,2) not null default 0,
  reserved_value numeric(16,2) not null default 0,
  consumed_value numeric(16,2) not null default 0,
  balance_value numeric(16,2) generated always as (period_value - reserved_value - consumed_value) stored,
  is_current boolean not null default false,
  origin_amendment_id uuid,
  notes text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (contract_id, sequence)
);
create index if not exists idx_contract_periods_contract on public.contract_periods(contract_id, valid_from);
grant select, insert, update on public.contract_periods to authenticated;
grant all on public.contract_periods to service_role;
alter table public.contract_periods enable row level security;
create policy "contract_periods_select_org" on public.contract_periods
  for select to authenticated
  using (organization_id = public.current_org_id() or public.is_super_admin(auth.uid()));
create policy "contract_periods_insert_org" on public.contract_periods
  for insert to authenticated
  with check (organization_id = public.current_org_id() and public.can_manage_finance());
create policy "contract_periods_update_org" on public.contract_periods
  for update to authenticated
  using (organization_id = public.current_org_id() and public.can_manage_finance())
  with check (organization_id = public.current_org_id());
create trigger trg_contract_periods_touch before update on public.contract_periods
  for each row execute function public.touch_updated_at();

create table if not exists public.contract_amendments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  number text not null,
  kind public.contract_amendment_kind not null,
  signed_at date not null default current_date,
  effect_date date not null default current_date,
  new_valid_from date,
  new_valid_to date,
  delta_value numeric(16,2),
  percent numeric(9,4),
  period_value numeric(16,2),
  previous_contract_value numeric(16,2),
  new_contract_value numeric(16,2),
  index_name text,
  justification text,
  attachment_path text,
  notes text,
  period_id uuid references public.contract_periods(id),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (contract_id, number)
);
create index if not exists idx_contract_amendments_contract on public.contract_amendments(contract_id, signed_at);
grant select, insert, update on public.contract_amendments to authenticated;
grant all on public.contract_amendments to service_role;
alter table public.contract_amendments enable row level security;
create policy "contract_amendments_select_org" on public.contract_amendments
  for select to authenticated
  using (organization_id = public.current_org_id() or public.is_super_admin(auth.uid()));
create policy "contract_amendments_insert_org" on public.contract_amendments
  for insert to authenticated
  with check (organization_id = public.current_org_id() and public.can_manage_finance());
create policy "contract_amendments_update_org" on public.contract_amendments
  for update to authenticated
  using (organization_id = public.current_org_id() and public.can_manage_finance())
  with check (organization_id = public.current_org_id());
create trigger trg_contract_amendments_touch before update on public.contract_amendments
  for each row execute function public.touch_updated_at();

alter table public.contract_periods
  drop constraint if exists contract_periods_origin_fk;
alter table public.contract_periods
  add constraint contract_periods_origin_fk foreign key (origin_amendment_id)
  references public.contract_amendments(id) on delete set null;

alter table public.contracts add column if not exists original_valid_from date;
alter table public.contracts add column if not exists original_valid_to date;
alter table public.contracts add column if not exists current_period_id uuid references public.contract_periods(id);

-- não permitir sobreposição de vigências no mesmo contrato
create or replace function public.guard_contract_period()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.valid_to < new.valid_from then
    raise exception 'A data final da vigência deve ser posterior à data inicial.';
  end if;
  if exists (
    select 1 from public.contract_periods p
    where p.contract_id = new.contract_id
      and p.id <> new.id
      and daterange(p.valid_from, p.valid_to, '[]') && daterange(new.valid_from, new.valid_to, '[]')
  ) then
    raise exception 'Já existe vigência do contrato que se sobrepõe ao período informado.';
  end if;
  return new;
end $$;
create trigger trg_contract_period_guard before insert or update on public.contract_periods
  for each row execute function public.guard_contract_period();

-- backfill: vigência original de cada contrato existente
insert into public.contract_periods (organization_id, contract_id, sequence, valid_from, valid_to, period_value, is_current, notes)
select c.organization_id, c.id, 1, c.valid_from, c.valid_to,
       coalesce(c.current_value, c.initial_value, 0), true, 'Vigência original do contrato'
from public.contracts c
where not exists (select 1 from public.contract_periods p where p.contract_id = c.id);

update public.contracts c
   set original_valid_from = coalesce(c.original_valid_from, c.valid_from),
       original_valid_to   = coalesce(c.original_valid_to, c.valid_to),
       current_period_id   = coalesce(c.current_period_id, p.id)
  from public.contract_periods p
 where p.contract_id = c.id and p.sequence = 1;

-- consumo/reserva histórico atribuído à vigência original
update public.contract_periods p
   set consumed_value = coalesce(x.consumido, 0),
       reserved_value = coalesce(x.reservado, 0)
  from (
    select ci.contract_id, sum(ci.consumed_value) consumido, sum(ci.reserved_value) reservado
      from public.contract_items ci group by ci.contract_id
  ) x
 where x.contract_id = p.contract_id and p.sequence = 1;

-- vigência aplicável a uma data
create or replace function public.contract_period_at(_contract uuid, _at date)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.contract_periods
   where contract_id = _contract and _at between valid_from and valid_to
   order by sequence desc limit 1
$$;
grant execute on function public.contract_period_at(uuid, date) to authenticated;

-- atribuição automática de reserva/consumo à vigência corrente
create or replace function public.apply_contract_period_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_contract uuid; v_period uuid; v_at date := coalesce(new.created_at, now())::date;
begin
  v_contract := new.contract_id;
  if v_contract is null and new.contract_item_id is not null then
    select contract_id into v_contract from public.contract_items where id = new.contract_item_id;
  end if;
  if v_contract is null or coalesce(new.value,0) = 0 then return new; end if;

  v_period := public.contract_period_at(v_contract, v_at);
  if v_period is null then
    select current_period_id into v_period from public.contracts where id = v_contract;
  end if;
  if v_period is null then return new; end if;

  if new.kind = 'reserva' then
    update public.contract_periods set reserved_value = greatest(reserved_value + new.value, 0) where id = v_period;
  elsif new.kind = 'liberacao' then
    update public.contract_periods set reserved_value = greatest(reserved_value - new.value, 0) where id = v_period;
  elsif new.kind = 'consumo' then
    update public.contract_periods
       set consumed_value = greatest(consumed_value + new.value, 0),
           reserved_value = greatest(reserved_value - new.value, 0)
     where id = v_period;
  elsif new.kind = 'estorno' then
    update public.contract_periods set consumed_value = greatest(consumed_value - new.value, 0) where id = v_period;
  end if;
  return new;
end $$;
drop trigger if exists trg_budget_contract_period on public.budget_movements;
create trigger trg_budget_contract_period after insert on public.budget_movements
  for each row execute function public.apply_contract_period_movement();

-- aditivo aplica efeitos sobre contrato e vigências
create or replace function public.apply_contract_amendment()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.contracts%rowtype; v_prev numeric; v_new numeric; v_seq integer; v_period uuid;
begin
  select * into c from public.contracts where id = new.contract_id;
  if c.id is null then raise exception 'Contrato inexistente.'; end if;
  if c.organization_id <> new.organization_id then
    raise exception 'O aditivo deve pertencer ao mesmo órgão do contrato.';
  end if;

  v_prev := coalesce(c.current_value, c.initial_value, 0);
  v_new := v_prev;

  if new.kind in ('acrescimo','supressao','reajuste','reequilibrio','combinado') then
    if new.delta_value is null and new.percent is null then
      raise exception 'Informe o valor ou o percentual da alteração.';
    end if;
    v_new := v_prev + coalesce(new.delta_value, round(v_prev * coalesce(new.percent,0) / 100, 2));
    if new.kind = 'supressao' and coalesce(new.delta_value,0) > 0 then
      v_new := v_prev - coalesce(new.delta_value, 0);
    end if;
    if v_new < 0 then raise exception 'O valor resultante do aditivo não pode ser negativo.'; end if;
  end if;

  if new.kind in ('prorrogacao','prorrogacao_valor','combinado') and new.new_valid_from is not null then
    if new.new_valid_to is null then raise exception 'Informe a data final da nova vigência.'; end if;
    select coalesce(max(sequence),0) + 1 into v_seq from public.contract_periods where contract_id = c.id;
    update public.contract_periods
       set is_current = false, closed_at = coalesce(closed_at, now())
     where contract_id = c.id and is_current;
    insert into public.contract_periods
      (organization_id, contract_id, sequence, valid_from, valid_to, period_value, is_current, origin_amendment_id, notes, created_by)
    values
      (c.organization_id, c.id, v_seq, new.new_valid_from, new.new_valid_to,
       coalesce(new.period_value, case when new.kind = 'prorrogacao' then coalesce(c.initial_value, v_prev) else v_new end),
       true, new.id, 'Vigência gerada pelo aditivo ' || new.number, new.created_by)
    returning id into v_period;

    new.period_id := v_period;
    if new.kind in ('prorrogacao_valor','combinado') and new.period_value is not null then
      v_new := new.period_value;
    end if;
    update public.contracts
       set valid_from = new.new_valid_from,
           valid_to = new.new_valid_to,
           current_period_id = v_period
     where id = c.id;
  end if;

  new.previous_contract_value := v_prev;
  new.new_contract_value := v_new;

  update public.contracts
     set current_value = v_new,
         amendment_count = coalesce(amendment_count,0) + 1,
         updated_at = now()
   where id = c.id;

  perform public.log_event('aditivo_contrato','contratos','Contratos','/contratos','contracts', c.id, 'insert',
    'Aditivo ' || new.number || ' aplicado ao contrato ' || c.number, null,
    jsonb_build_object('tipo', new.kind::text, 'valor_anterior', v_prev, 'valor_novo', v_new,
                       'nova_vigencia_inicio', new.new_valid_from, 'nova_vigencia_fim', new.new_valid_to));
  return new;
end $$;
create trigger trg_contract_amendment_apply before insert on public.contract_amendments
  for each row execute function public.apply_contract_amendment();

-- ============ 5) EMPENHOS: REFORÇO E REDUÇÃO ============
create table if not exists public.commitment_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  commitment_id uuid not null references public.commitments(id) on delete cascade,
  kind text not null check (kind in ('reforco','reducao')),
  moved_on date not null default current_date,
  value numeric(16,2) not null check (value > 0),
  document text,
  justification text,
  attachment_path text,
  previous_value numeric(16,2),
  new_value numeric(16,2),
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists idx_commitment_movements_commitment on public.commitment_movements(commitment_id, moved_on);
grant select, insert on public.commitment_movements to authenticated;
grant all on public.commitment_movements to service_role;
alter table public.commitment_movements enable row level security;
create policy "commitment_movements_select_org" on public.commitment_movements
  for select to authenticated
  using (organization_id = public.current_org_id() or public.is_super_admin(auth.uid()));
create policy "commitment_movements_insert_org" on public.commitment_movements
  for insert to authenticated
  with check (organization_id = public.current_org_id() and public.can_manage_finance());

create or replace function public.apply_commitment_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare e public.commitments%rowtype; v_avail numeric;
begin
  select * into e from public.commitments where id = new.commitment_id for update;
  if e.id is null then raise exception 'Empenho inexistente.'; end if;
  if e.organization_id <> new.organization_id then
    raise exception 'A movimentação deve pertencer ao mesmo órgão do empenho.';
  end if;
  if coalesce(btrim(new.justification),'') = '' then
    raise exception 'Informe a justificativa da movimentação do empenho.';
  end if;

  new.previous_value := coalesce(e.committed_value,0) - coalesce(e.cancelled_value,0);
  v_avail := coalesce(e.available_value, 0);

  if new.kind = 'reforco' then
    update public.commitments set committed_value = coalesce(committed_value,0) + new.value, updated_at = now()
     where id = e.id;
  else
    if new.value > v_avail + 0.005 then
      raise exception 'Saldo insuficiente: o empenho % possui apenas R$ % disponíveis (já reservado/consumido não pode ser reduzido).',
        e.number, to_char(v_avail,'FM999G999G990D00');
    end if;
    update public.commitments set cancelled_value = coalesce(cancelled_value,0) + new.value, updated_at = now()
     where id = e.id;
  end if;

  select coalesce(committed_value,0) - coalesce(cancelled_value,0) into new.new_value
    from public.commitments where id = e.id;

  perform public.log_event('movimento_empenho','contratos','Empenhos','/empenhos','commitments', e.id, 'update',
    case when new.kind = 'reforco' then 'Reforço de empenho ' else 'Redução/anulação de empenho ' end || e.number,
    jsonb_build_object('valor_anterior', new.previous_value),
    jsonb_build_object('tipo', new.kind, 'valor', new.value, 'valor_novo', new.new_value, 'justificativa', new.justification));
  return new;
end $$;
create trigger trg_commitment_movement_apply before insert on public.commitment_movements
  for each row execute function public.apply_commitment_movement();