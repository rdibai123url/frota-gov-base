create or replace function public.transparency_snapshot(_org uuid, _year int, _month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
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
        'total', coalesce(sum(qtd),0),
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
end
$fn$;

revoke execute on function public.transparency_snapshot(uuid,int,int) from anon, public;
grant execute on function public.transparency_snapshot(uuid,int,int) to authenticated;