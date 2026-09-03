CREATE OR REPLACE FUNCTION public.guard_same_org_refs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o uuid;
BEGIN
  IF to_jsonb(NEW) ? 'contract_id' AND (to_jsonb(NEW)->>'contract_id') IS NOT NULL THEN
    SELECT organization_id INTO o FROM public.contracts WHERE id = (to_jsonb(NEW)->>'contract_id')::uuid;
    IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Contrato pertence a outro órgão'; END IF;
  END IF;
  IF to_jsonb(NEW) ? 'contract_item_id' AND (to_jsonb(NEW)->>'contract_item_id') IS NOT NULL THEN
    SELECT organization_id INTO o FROM public.contract_items WHERE id = (to_jsonb(NEW)->>'contract_item_id')::uuid;
    IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Item contratual pertence a outro órgão'; END IF;
  END IF;
  IF to_jsonb(NEW) ? 'commitment_id' AND (to_jsonb(NEW)->>'commitment_id') IS NOT NULL THEN
    SELECT organization_id INTO o FROM public.commitments WHERE id = (to_jsonb(NEW)->>'commitment_id')::uuid;
    IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Empenho pertence a outro órgão'; END IF;
  END IF;
  IF to_jsonb(NEW) ? 'cost_center_id' AND (to_jsonb(NEW)->>'cost_center_id') IS NOT NULL THEN
    SELECT organization_id INTO o FROM public.cost_centers WHERE id = (to_jsonb(NEW)->>'cost_center_id')::uuid;
    IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Centro de custo pertence a outro órgão'; END IF;
  END IF;
  IF to_jsonb(NEW) ? 'unit_id' AND (to_jsonb(NEW)->>'unit_id') IS NOT NULL THEN
    SELECT organization_id INTO o FROM public.units WHERE id = (to_jsonb(NEW)->>'unit_id')::uuid;
    IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Unidade pertence a outro órgão'; END IF;
  END IF;
  IF to_jsonb(NEW) ? 'quota_id' AND (to_jsonb(NEW)->>'quota_id') IS NOT NULL THEN
    SELECT organization_id INTO o FROM public.quotas WHERE id = (to_jsonb(NEW)->>'quota_id')::uuid;
    IF o IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Cota pertence a outro órgão'; END IF;
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.guard_same_org_refs() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_quotas_same_org ON public.quotas;
CREATE TRIGGER trg_quotas_same_org BEFORE INSERT OR UPDATE ON public.quotas
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();

DROP TRIGGER IF EXISTS trg_commitments_same_org ON public.commitments;
CREATE TRIGGER trg_commitments_same_org BEFORE INSERT OR UPDATE ON public.commitments
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();

DROP TRIGGER IF EXISTS trg_contract_items_same_org ON public.contract_items;
CREATE TRIGGER trg_contract_items_same_org BEFORE INSERT OR UPDATE ON public.contract_items
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();

DROP TRIGGER IF EXISTS trg_cost_centers_same_org ON public.cost_centers;
CREATE TRIGGER trg_cost_centers_same_org BEFORE INSERT OR UPDATE ON public.cost_centers
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();

DROP TRIGGER IF EXISTS trg_fuel_auth_same_org ON public.fuel_authorizations;
CREATE TRIGGER trg_fuel_auth_same_org BEFORE INSERT OR UPDATE ON public.fuel_authorizations
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();