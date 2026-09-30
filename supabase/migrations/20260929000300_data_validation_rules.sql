-- Achados do teste de 29/09/2026 (regras que só existiam na tela):
--  * datas no futuro em abastecimento, multa e sinistro;
--  * ano do modelo anterior ao de fabricação;
--  * saída de manutenção anterior à entrada;
--  * desconto de multa maior que o valor;
--  * obrigação "quitada" sem valor e data de pagamento.
-- As restrições usam NOT VALID: valem para novas gravações e edições, sem falhar
-- por causa de linhas antigas. Os gatilhos de data só disparam ao inserir ou ao
-- alterar a própria coluna de data, para não travar edições não relacionadas.

CREATE OR REPLACE FUNCTION public.guard_not_future()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v timestamptz;
BEGIN
  EXECUTE format('SELECT ($1).%I::timestamptz', TG_ARGV[0]) INTO v USING NEW;
  IF v IS NOT NULL AND v > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'A data e hora do registro não podem estar no futuro.';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_not_future() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fuelings_not_future ON public.fuelings;
CREATE TRIGGER trg_fuelings_not_future BEFORE INSERT OR UPDATE OF fueled_at ON public.fuelings
FOR EACH ROW EXECUTE FUNCTION public.guard_not_future('fueled_at');

DROP TRIGGER IF EXISTS trg_traffic_fines_not_future ON public.traffic_fines;
CREATE TRIGGER trg_traffic_fines_not_future BEFORE INSERT OR UPDATE OF occurred_at ON public.traffic_fines
FOR EACH ROW EXECUTE FUNCTION public.guard_not_future('occurred_at');

DROP TRIGGER IF EXISTS trg_accidents_not_future ON public.accidents;
CREATE TRIGGER trg_accidents_not_future BEFORE INSERT OR UPDATE OF occurred_at ON public.accidents
FOR EACH ROW EXECUTE FUNCTION public.guard_not_future('occurred_at');

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_year_order_chk
  CHECK (year_model IS NULL OR year_manufacture IS NULL OR year_model >= year_manufacture) NOT VALID;

ALTER TABLE public.maintenance_records
  ADD CONSTRAINT maintenance_records_exit_after_entry_chk
  CHECK (exit_at IS NULL OR exit_at >= entry_at) NOT VALID;

ALTER TABLE public.traffic_fines
  ADD CONSTRAINT traffic_fines_discount_within_amount_chk
  CHECK (discount_amount IS NULL OR (discount_amount >= 0 AND discount_amount <= amount)) NOT VALID;

ALTER TABLE public.vehicle_obligations
  ADD CONSTRAINT vehicle_obligations_paid_requires_data_chk
  CHECK (status::text <> 'quitada' OR (paid_amount IS NOT NULL AND paid_amount > 0 AND paid_at IS NOT NULL)) NOT VALID;
