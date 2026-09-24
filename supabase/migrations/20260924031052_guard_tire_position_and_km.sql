-- ============================================================
-- FrotaGov
-- Integridade de pneus: posição, veículo e quilometragem
-- ============================================================

ALTER TABLE public.tires
ADD CONSTRAINT tires_nonnegative_values
CHECK (
  (purchase_value IS NULL OR purchase_value >= 0)
  AND (expected_life_km IS NULL OR expected_life_km >= 0)
  AND accumulated_km >= 0
  AND (install_km IS NULL OR install_km >= 0)
  AND (removal_km IS NULL OR removal_km >= 0)
)
NOT VALID;


ALTER TABLE public.tires
ADD CONSTRAINT tires_installed_requires_vehicle_position
CHECK (
  status <> 'instalado'
  OR (
    vehicle_id IS NOT NULL
    AND NULLIF(btrim(position), '') IS NOT NULL
    AND install_km IS NOT NULL
    AND install_date IS NOT NULL
  )
)
NOT VALID;


ALTER TABLE public.tires
ADD CONSTRAINT tires_not_installed_without_position
CHECK (
  status = 'instalado'
  OR (
    vehicle_id IS NULL
    AND position IS NULL
  )
)
NOT VALID;


ALTER TABLE public.tires
ADD CONSTRAINT tires_removal_km_guard
CHECK (
  removal_km IS NULL
  OR install_km IS NULL
  OR removal_km >= install_km
)
NOT VALID;


CREATE OR REPLACE FUNCTION public.guard_tire_vehicle_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vehicle_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.vehicles v
        WHERE v.id = NEW.vehicle_id
          AND v.organization_id = NEW.organization_id
     )
  THEN
    RAISE EXCEPTION 'Veículo do pneu não pertence ao mesmo órgão.';
  END IF;

  IF NEW.supplier_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.suppliers s
        WHERE s.id = NEW.supplier_id
          AND s.organization_id = NEW.organization_id
     )
  THEN
    RAISE EXCEPTION 'Fornecedor do pneu não pertence ao mesmo órgão.';
  END IF;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_guard_tire_vehicle_org
ON public.tires;

CREATE TRIGGER trg_guard_tire_vehicle_org
BEFORE INSERT OR UPDATE
ON public.tires
FOR EACH ROW
EXECUTE FUNCTION public.guard_tire_vehicle_org();


REVOKE ALL
ON FUNCTION public.guard_tire_vehicle_org()
FROM PUBLIC, anon, authenticated;