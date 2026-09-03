
ALTER TABLE public.fuelings
  ADD COLUMN IF NOT EXISTS closes_authorization boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reserved_quantity_before numeric,
  ADD COLUMN IF NOT EXISTS reserved_value_before numeric,
  ADD COLUMN IF NOT EXISTS released_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS released_value numeric NOT NULL DEFAULT 0;

-- snapshot do saldo reservado da autorização no momento do lançamento
CREATE OR REPLACE FUNCTION public.inherit_fueling_funding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      NEW.reserved_quantity_before := a.reserved_quantity;
      NEW.reserved_value_before := a.reserved_value;
    END IF;
  ELSE
    NEW.closes_authorization := false;
  END IF;
  IF NEW.total_value IS NULL THEN NEW.total_value := round(NEW.quantity * NEW.unit_price, 2); END IF;
  RETURN NEW;
END; $function$;

-- encerramento da autorização: devolve automaticamente a diferença reservada
CREATE OR REPLACE FUNCTION public.close_authorization_on_fueling()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a record; rq numeric; rv numeric;
BEGIN
  IF NEW.authorization_id IS NULL OR NOT NEW.closes_authorization OR NEW.status <> 'valido' THEN
    RETURN NEW;
  END IF;
  SELECT * INTO a FROM public.fuel_authorizations WHERE id = NEW.authorization_id FOR UPDATE;
  IF NOT FOUND OR a.status IN ('cancelada','expirada','utilizada') THEN RETURN NEW; END IF;
  rq := GREATEST(COALESCE(a.reserved_quantity,0), 0);
  rv := GREATEST(COALESCE(a.reserved_value,0), 0);
  -- a atualização de status dispara release_authorization_budget (liberação do saldo remanescente)
  UPDATE public.fuel_authorizations SET status = 'utilizada' WHERE id = a.id;
  IF COALESCE(a.budget_reserved, false) AND (rq > 0 OR rv > 0) THEN
    UPDATE public.fuelings
       SET released_quantity = rq, released_value = rv
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_fuelings_zz_close_auth ON public.fuelings;
CREATE TRIGGER trg_fuelings_zz_close_auth
AFTER INSERT ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.close_authorization_on_fueling();

REVOKE EXECUTE ON FUNCTION public.close_authorization_on_fueling() FROM PUBLIC, anon, authenticated;
