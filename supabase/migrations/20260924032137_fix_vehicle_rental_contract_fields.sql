-- ============================================================
-- FrotaGov
-- Corrige vínculo de locação usando os campos já existentes
-- acquisition_kind + lease_contract_id
-- ============================================================

-- Remove a estrutura redundante criada na migration anterior.
DROP TRIGGER IF EXISTS trg_guard_vehicle_contract_org
ON public.vehicles;

DROP FUNCTION IF EXISTS public.guard_vehicle_contract_org();

ALTER TABLE public.vehicles
DROP CONSTRAINT IF EXISTS vehicles_rented_requires_contract;

DROP INDEX IF EXISTS public.idx_vehicles_contract;

ALTER TABLE public.vehicles
DROP COLUMN IF EXISTS contract_id;

ALTER TABLE public.vehicles
DROP COLUMN IF EXISTS ownership;

DROP TYPE IF EXISTS public.vehicle_ownership;


-- Veículo locado deve possuir contrato de locação.
ALTER TABLE public.vehicles
ADD CONSTRAINT vehicles_locado_requires_lease_contract
CHECK (
  acquisition_kind <> 'locado'
  OR lease_contract_id IS NOT NULL
)
NOT VALID;


-- Valida se o contrato de locação pertence ao mesmo órgão do veículo.
CREATE OR REPLACE FUNCTION public.guard_vehicle_lease_contract_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.acquisition_kind = 'locado'
     AND NEW.lease_contract_id IS NULL THEN
    RAISE EXCEPTION 'Veículo locado exige contrato de locação vinculado.';
  END IF;

  IF NEW.lease_contract_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.contracts c
        WHERE c.id = NEW.lease_contract_id
          AND c.organization_id = NEW.organization_id
     )
  THEN
    RAISE EXCEPTION 'O contrato de locação não pertence ao mesmo órgão do veículo.';
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER trg_guard_vehicle_lease_contract_org
BEFORE INSERT OR UPDATE
ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.guard_vehicle_lease_contract_org();


CREATE INDEX IF NOT EXISTS idx_vehicles_lease_contract
ON public.vehicles(lease_contract_id)
WHERE lease_contract_id IS NOT NULL;


REVOKE ALL
ON FUNCTION public.guard_vehicle_lease_contract_org()
FROM PUBLIC, anon, authenticated;