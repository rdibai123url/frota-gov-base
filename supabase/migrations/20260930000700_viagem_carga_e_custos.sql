-- Viagens: carga transportada e custos além do combustível (pedágio, alimentação, outros),
-- para o custo real da viagem ser o combustível abastecido mais estes valores.
ALTER TABLE public.vehicle_usages
  ADD COLUMN cargo_description text,
  ADD COLUMN toll_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN other_trip_costs numeric(12,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT vehicle_usages_trip_costs_chk CHECK (toll_value >= 0 AND other_trip_costs >= 0),
  ADD CONSTRAINT vehicle_usages_cargo_len_chk CHECK (cargo_description IS NULL OR length(cargo_description) <= 300);
