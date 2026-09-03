CREATE OR REPLACE FUNCTION public.budget_release(
  _org uuid, _item uuid, _commitment uuid, _quota uuid, _qty numeric, _val numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE qt record; amt numeric;
BEGIN
  IF _item IS NOT NULL THEN
    UPDATE public.contract_items
       SET reserved_quantity = GREATEST(reserved_quantity - _qty, 0),
           reserved_value = GREATEST(reserved_value - _val, 0), updated_at = now()
     WHERE id = _item AND organization_id = _org;
  END IF;
  IF _commitment IS NOT NULL THEN
    UPDATE public.commitments SET reserved_value = GREATEST(reserved_value - _val, 0), updated_at = now()
     WHERE id = _commitment AND organization_id = _org;
  END IF;
  IF _quota IS NOT NULL THEN
    SELECT * INTO qt FROM public.quotas WHERE id = _quota AND organization_id = _org FOR UPDATE;
    IF FOUND THEN
      amt := CASE WHEN qt.quota_type = 'financeira' THEN _val ELSE _qty END;
      UPDATE public.quotas SET reserved_amount = GREATEST(reserved_amount - amt, 0), updated_at = now() WHERE id = _quota;
    END IF;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.budget_refund(
  _org uuid, _item uuid, _commitment uuid, _quota uuid, _qty numeric, _val numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE qt record; amt numeric;
BEGIN
  IF _item IS NOT NULL THEN
    UPDATE public.contract_items
       SET consumed_quantity = GREATEST(consumed_quantity - _qty, 0),
           consumed_value = GREATEST(consumed_value - _val, 0), updated_at = now()
     WHERE id = _item AND organization_id = _org;
  END IF;
  IF _commitment IS NOT NULL THEN
    UPDATE public.commitments SET consumed_value = GREATEST(consumed_value - _val, 0), updated_at = now()
     WHERE id = _commitment AND organization_id = _org;
    UPDATE public.commitments SET status = 'ativo'
     WHERE id = _commitment AND status = 'esgotado' AND available_value > 0.005;
  END IF;
  IF _quota IS NOT NULL THEN
    SELECT * INTO qt FROM public.quotas WHERE id = _quota AND organization_id = _org FOR UPDATE;
    IF FOUND THEN
      amt := CASE WHEN qt.quota_type = 'financeira' THEN _val ELSE _qty END;
      UPDATE public.quotas SET consumed_amount = GREATEST(consumed_amount - amt, 0), updated_at = now() WHERE id = _quota;
    END IF;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.inherit_fueling_funding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record;
BEGIN
  IF NEW.authorization_id IS NOT NULL THEN
    SELECT * INTO a FROM public.fuel_authorizations WHERE id = NEW.authorization_id AND organization_id = NEW.organization_id;
    IF FOUND THEN
      NEW.expense_origin := a.expense_origin;
      NEW.cost_center_id := COALESCE(NEW.cost_center_id, a.cost_center_id);
      NEW.contract_id := COALESCE(NEW.contract_id, a.contract_id);
      NEW.contract_item_id := COALESCE(NEW.contract_item_id, a.contract_item_id);
      NEW.commitment_id := COALESCE(NEW.commitment_id, a.commitment_id);
      NEW.quota_id := COALESCE(NEW.quota_id, a.quota_id);
    END IF;
  END IF;
  IF NEW.total_value IS NULL THEN NEW.total_value := round(NEW.quantity * NEW.unit_price, 2); END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.apply_fueling_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; has_auth boolean := false; val numeric; qty numeric; from_res boolean := false;
BEGIN
  IF NEW.contract_item_id IS NULL AND NEW.commitment_id IS NULL AND NEW.quota_id IS NULL THEN
    RETURN NEW;
  END IF;
  qty := NEW.quantity;
  val := round(NEW.quantity * NEW.unit_price, 2);

  IF NEW.authorization_id IS NOT NULL THEN
    SELECT * INTO a FROM public.fuel_authorizations WHERE id = NEW.authorization_id FOR UPDATE;
    has_auth := FOUND;
    from_res := has_auth AND COALESCE(a.budget_reserved, false);
  END IF;

  PERFORM public.budget_consume(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id, qty, val, from_res);
  PERFORM public.budget_log(NEW.organization_id, 'consumo', NEW.authorization_id, NEW.id, NEW.contract_item_id,
    NEW.commitment_id, NEW.quota_id, qty, val, 'Baixa por abastecimento');

  IF from_res THEN
    UPDATE public.fuel_authorizations
       SET reserved_quantity = GREATEST(reserved_quantity - qty, 0),
           reserved_value = GREATEST(reserved_value - val, 0)
     WHERE id = a.id;
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.budget_release(uuid, uuid, uuid, uuid, numeric, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.budget_refund(uuid, uuid, uuid, uuid, numeric, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.inherit_fueling_funding() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_fueling_budget() FROM anon, authenticated;