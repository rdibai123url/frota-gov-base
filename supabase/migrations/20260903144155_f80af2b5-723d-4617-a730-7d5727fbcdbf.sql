DROP TRIGGER IF EXISTS trg_fuel_auth_budget_release ON public.fuel_authorizations;

CREATE OR REPLACE FUNCTION public.release_authorization_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.budget_reserved AND NEW.status IN ('cancelada','expirada','utilizada')
     AND OLD.status NOT IN ('cancelada','expirada','utilizada')
     AND (OLD.reserved_quantity > 0 OR OLD.reserved_value > 0) THEN
    PERFORM public.budget_release(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id,
      OLD.reserved_quantity, OLD.reserved_value);
    PERFORM public.budget_log(NEW.organization_id, 'liberacao', NEW.id, NULL, NEW.contract_item_id, NEW.commitment_id,
      NEW.quota_id, OLD.reserved_quantity, OLD.reserved_value,
      'Liberação de saldo — autorização ' || COALESCE(NEW.code,'') || ' (' || NEW.status || ')');
    NEW.reserved_quantity := 0;
    NEW.reserved_value := 0;
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.release_authorization_budget() FROM anon, authenticated;

CREATE TRIGGER trg_a_fuel_auth_budget_release BEFORE UPDATE OF status ON public.fuel_authorizations
FOR EACH ROW EXECUTE FUNCTION public.release_authorization_budget();