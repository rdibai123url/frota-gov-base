
ALTER TABLE public.contract_periods
  DROP CONSTRAINT IF EXISTS contract_periods_origin_fk;

ALTER TABLE public.contract_periods
  ADD CONSTRAINT contract_periods_origin_fk
  FOREIGN KEY (origin_amendment_id) REFERENCES public.contract_amendments(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;
