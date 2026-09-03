
CREATE OR REPLACE FUNCTION public.create_initial_contract_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_period uuid;
BEGIN
  INSERT INTO public.contract_periods
    (organization_id, contract_id, sequence, valid_from, valid_to, period_value, is_current, notes, created_by)
  VALUES
    (NEW.organization_id, NEW.id, 1, NEW.valid_from, NEW.valid_to,
     COALESCE(NEW.initial_value, NEW.current_value, 0), true, 'Vigência original do contrato', NEW.created_by)
  RETURNING id INTO v_period;

  UPDATE public.contracts
     SET current_period_id = v_period,
         original_valid_from = COALESCE(original_valid_from, NEW.valid_from),
         original_valid_to = COALESCE(original_valid_to, NEW.valid_to)
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_initial_contract_period() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contract_initial_period ON public.contracts;
CREATE TRIGGER trg_contract_initial_period
AFTER INSERT ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.create_initial_contract_period();

UPDATE public.contracts c
   SET original_valid_from = COALESCE(c.original_valid_from, c.valid_from),
       original_valid_to = COALESCE(c.original_valid_to, c.valid_to);

INSERT INTO public.contract_periods
  (organization_id, contract_id, sequence, valid_from, valid_to, period_value, is_current, notes)
SELECT c.organization_id, c.id, 1, c.valid_from, c.valid_to,
       COALESCE(c.initial_value, c.current_value, 0), true, 'Vigência original do contrato'
  FROM public.contracts c
 WHERE NOT EXISTS (SELECT 1 FROM public.contract_periods p WHERE p.contract_id = c.id);

UPDATE public.contracts c
   SET current_period_id = p.id
  FROM public.contract_periods p
 WHERE p.contract_id = c.id AND p.is_current AND c.current_period_id IS DISTINCT FROM p.id;
