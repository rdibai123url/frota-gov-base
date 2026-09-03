
CREATE OR REPLACE FUNCTION public.guard_supplier_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare v_sup uuid; v_con uuid; v_scnpj text; v_ccnpj text; v_csup uuid;
begin
  select organization_id, cnpj into v_sup, v_scnpj from public.suppliers where id = new.supplier_id;
  select organization_id, coalesce(cnpj,''), supplier_id into v_con, v_ccnpj, v_csup
    from public.contracts where id = new.contract_id;
  if v_sup is null or v_con is null then
    raise exception 'Fornecedor ou contrato inexistente.';
  end if;
  if v_sup <> new.organization_id or v_con <> new.organization_id then
    raise exception 'Fornecedor e contrato devem pertencer ao mesmo órgão do vínculo.';
  end if;
  new.cnpj_match := (v_csup is not null and v_csup = new.supplier_id)
    or (nullif(regexp_replace(coalesce(v_scnpj,''),'\D','','g'),'') is not null
        and regexp_replace(coalesce(v_scnpj,''),'\D','','g') = regexp_replace(coalesce(v_ccnpj,''),'\D','','g'));
  if not new.cnpj_match and coalesce(btrim(new.justification),'') = '' then
    raise exception 'CNPJ do fornecedor não corresponde ao do contrato. Justificativa administrativa é obrigatória.';
  end if;
  return new;
end;
$$;
REVOKE ALL ON FUNCTION public.guard_supplier_contract() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_commitment_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare c public.commitments%rowtype; v_avail numeric; v_new numeric;
begin
  select * into c from public.commitments where id = new.commitment_id for update;
  if c.id is null then raise exception 'Empenho inexistente.'; end if;
  if c.organization_id <> new.organization_id then
    raise exception 'A movimentação deve pertencer ao mesmo órgão do empenho.';
  end if;
  if coalesce(new.value,0) <= 0 then raise exception 'Informe um valor maior que zero.'; end if;

  new.previous_value := coalesce(c.committed_value,0) - coalesce(c.cancelled_value,0);
  v_avail := coalesce(c.available_value, 0);

  if new.kind = 'reforco' then
    update public.commitments
       set committed_value = coalesce(committed_value,0) + new.value, updated_at = now()
     where id = c.id;
    v_new := new.previous_value + new.value;
  else
    if new.value > v_avail + 0.005 then
      raise exception 'Saldo insuficiente: o empenho % possui apenas R$ % disponíveis (o valor já reservado ou consumido não pode ser reduzido).',
        c.number, to_char(v_avail, 'FM999G999G999D00');
    end if;
    update public.commitments
       set cancelled_value = coalesce(cancelled_value,0) + new.value, updated_at = now()
     where id = c.id;
    v_new := new.previous_value - new.value;
  end if;

  new.new_value := v_new;

  perform public.log_event('movimento_empenho','empenhos','Empenhos','/empenhos','commitments', c.id, 'update',
    case when new.kind = 'reforco' then 'Reforço' else 'Redução/anulação' end
      || ' de empenho ' || c.number, null,
    jsonb_build_object('tipo', new.kind::text, 'valor', new.value,
                       'valor_anterior', new.previous_value, 'valor_novo', v_new,
                       'documento', new.document, 'justificativa', new.justification));
  return new;
end;
$$;
REVOKE ALL ON FUNCTION public.apply_commitment_movement() FROM public, anon, authenticated;
