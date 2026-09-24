-- ============================================================
-- FrotaGov
-- Origem/posse do veículo e vínculo de contrato para locados
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_type
     WHERE typname = 'vehicle_ownership'
  ) THEN
    CREATE TYPE public.vehicle_ownership AS ENUM (
      'proprio',
      'locado',
      'cedido',
      'comodato',
      'outro'
    );
  END IF;
END
$$;


ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS ownership public.vehicle_ownership NOT NULL DEFAULT 'proprio';


ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS contract_id uuid
REFERENCES public.contracts(id) ON DELETE SET NULL;


ALTER TABLE public.vehicles
ADD CONSTRAINT vehicles_rented_requires_contract
CHECK (
  ownership <> 'locado'
  OR contract_id IS NOT NULL
)
NOT VALID;


CREATE OR REPLACE FUNCTION public.guard_vehicle_contract_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.contracts c
       WHERE c.id = NEW.contract_id
         AND c.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'O contrato do veículo não pertence ao mesmo órgão.';
    END IF;
  END IF;

  IF NEW.ownership = 'locado'
     AND NEW.contract_id IS NULL THEN
    RAISE EXCEPTION 'Veículo locado exige contrato vinculado.';
  END IF;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_guard_vehicle_contract_org
ON public.vehicles;

CREATE TRIGGER trg_guard_vehicle_contract_org
BEFORE INSERT OR UPDATE
ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.guard_vehicle_contract_org();


CREATE INDEX IF NOT EXISTS idx_vehicles_contract
ON public.vehicles(contract_id)
WHERE contract_id IS NOT NULL;


REVOKE ALL
ON FUNCTION public.guard_vehicle_contract_org()
FROM PUBLIC, anon, authenticated;