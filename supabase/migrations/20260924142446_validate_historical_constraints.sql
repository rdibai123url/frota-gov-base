-- FrotaGov - Bloco 10H
-- Validação definitiva das constraints históricas já diagnosticadas sem violações.

ALTER TABLE public.contracts
  VALIDATE CONSTRAINT contracts_valid_period;

ALTER TABLE public.contracts
  VALIDATE CONSTRAINT contracts_values_nonnegative;

ALTER TABLE public.contracts
  VALIDATE CONSTRAINT contracts_vigente_required_fields;

ALTER TABLE public.emission_factors
  VALIDATE CONSTRAINT emission_factors_required_text;

ALTER TABLE public.emission_factors
  VALIDATE CONSTRAINT emission_factors_valid_period;

ALTER TABLE public.service_orders
  VALIDATE CONSTRAINT service_orders_approved_value_nonnegative;

ALTER TABLE public.service_orders
  VALIDATE CONSTRAINT service_orders_executed_value_guard;

ALTER TABLE public.tires
  VALIDATE CONSTRAINT tires_installed_requires_vehicle_position;

ALTER TABLE public.tires
  VALIDATE CONSTRAINT tires_nonnegative_values;

ALTER TABLE public.tires
  VALIDATE CONSTRAINT tires_not_installed_without_position;

ALTER TABLE public.tires
  VALIDATE CONSTRAINT tires_removal_km_guard;

ALTER TABLE public.vehicles
  VALIDATE CONSTRAINT vehicles_locado_requires_lease_contract;
