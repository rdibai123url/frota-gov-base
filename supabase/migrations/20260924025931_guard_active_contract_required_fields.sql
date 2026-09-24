-- ============================================================
-- FrotaGov
-- Integridade mínima para contratos vigentes
-- ============================================================

ALTER TABLE public.contracts
ADD CONSTRAINT contracts_values_nonnegative
CHECK (
  initial_value >= 0
  AND current_value >= 0
)
NOT VALID;


ALTER TABLE public.contracts
ADD CONSTRAINT contracts_valid_period
CHECK (
  valid_from IS NULL
  OR valid_to IS NULL
  OR valid_to >= valid_from
)
NOT VALID;


ALTER TABLE public.contracts
ADD CONSTRAINT contracts_vigente_required_fields
CHECK (
  status <> 'vigente'
  OR (
    NULLIF(btrim(number), '') IS NOT NULL
    AND NULLIF(btrim(object), '') IS NOT NULL
    AND signed_at IS NOT NULL
    AND valid_from IS NOT NULL
    AND valid_to IS NOT NULL
    AND valid_to >= valid_from
    AND current_value > 0
  )
)
NOT VALID;