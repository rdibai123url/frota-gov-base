-- ============================================================
-- FrotaGov
-- Validações complementares dos fatores de emissão
-- ============================================================

ALTER TABLE public.emission_factors
ADD CONSTRAINT emission_factors_required_text
CHECK (
  NULLIF(btrim(fuel_key), '') IS NOT NULL
  AND NULLIF(btrim(label), '') IS NOT NULL
  AND NULLIF(btrim(unit), '') IS NOT NULL
  AND NULLIF(btrim(source), '') IS NOT NULL
  AND NULLIF(btrim(version), '') IS NOT NULL
)
NOT VALID;


ALTER TABLE public.emission_factors
ADD CONSTRAINT emission_factors_valid_period
CHECK (
  valid_to IS NULL
  OR valid_to >= valid_from
)
NOT VALID;