-- 1) Veículo opcional na cotação
ALTER TABLE public.quotations ALTER COLUMN vehicle_id DROP NOT NULL;

-- 2) Tipo da cotação
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS quotation_kind text NOT NULL DEFAULT 'servicos_pecas';
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_kind_chk;
ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_kind_chk CHECK (quotation_kind IN ('servicos','pecas','servicos_pecas'));

-- Inferência conservadora para o histórico
UPDATE public.quotations q SET quotation_kind = 'pecas'
 WHERE EXISTS (SELECT 1 FROM public.quotation_proposals p WHERE p.quotation_id = q.id)
   AND NOT EXISTS (SELECT 1 FROM public.quotation_proposals p WHERE p.quotation_id = q.id AND COALESCE(p.labor_value,0) > 0)
   AND EXISTS (SELECT 1 FROM public.quotation_proposals p WHERE p.quotation_id = q.id AND COALESCE(p.parts_value,0) > 0);

UPDATE public.quotations q SET quotation_kind = 'servicos'
 WHERE EXISTS (SELECT 1 FROM public.quotation_proposals p WHERE p.quotation_id = q.id)
   AND NOT EXISTS (SELECT 1 FROM public.quotation_proposals p WHERE p.quotation_id = q.id AND COALESCE(p.parts_value,0) > 0)
   AND EXISTS (SELECT 1 FROM public.quotation_proposals p WHERE p.quotation_id = q.id AND COALESCE(p.labor_value,0) > 0);

-- 3) Propostas: campos aditivos
ALTER TABLE public.quotation_proposals
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS valid_days integer,
  ADD COLUMN IF NOT EXISTS labor_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_hour_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS services_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'amount',
  ADD COLUMN IF NOT EXISTS discount_input numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_value numeric NOT NULL DEFAULT 0;

ALTER TABLE public.quotation_proposals DROP CONSTRAINT IF EXISTS proposals_source_chk;
ALTER TABLE public.quotation_proposals
  ADD CONSTRAINT proposals_source_chk CHECK (source IN ('manual','link'));
ALTER TABLE public.quotation_proposals DROP CONSTRAINT IF EXISTS proposals_discount_mode_chk;
ALTER TABLE public.quotation_proposals
  ADD CONSTRAINT proposals_discount_mode_chk CHECK (discount_mode IN ('amount','percent'));
ALTER TABLE public.quotation_proposals DROP CONSTRAINT IF EXISTS proposals_discount_input_chk;
ALTER TABLE public.quotation_proposals
  ADD CONSTRAINT proposals_discount_input_chk CHECK (discount_input >= 0);

-- 4) Itens da proposta: campos aditivos
ALTER TABLE public.quotation_proposal_items
  ADD COLUMN IF NOT EXISTS part_number text,
  ADD COLUMN IF NOT EXISTS warranty_days integer;

-- 5) Backfill das propostas existentes
UPDATE public.quotation_proposals
   SET gross_value = COALESCE(parts_value,0) + COALESCE(labor_value,0) + COALESCE(services_value,0),
       discount_input = COALESCE(discount_value,0),
       net_value = COALESCE(total_value,0),
       valid_days = COALESCE(valid_days, CASE WHEN valid_until IS NOT NULL
                                              THEN GREATEST((valid_until - received_at::date), 0) END)
 WHERE gross_value = 0;

UPDATE public.quotation_proposals p SET source = 'link'
 WHERE EXISTS (SELECT 1 FROM public.quotation_invitations i WHERE i.proposal_id = p.id);

-- 6) Recálculo e validação no banco
CREATE OR REPLACE FUNCTION public.sync_proposal_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.labor_hours := GREATEST(COALESCE(NEW.labor_hours,0), 0);
  NEW.labor_hour_value := GREATEST(COALESCE(NEW.labor_hour_value,0), 0);
  NEW.services_value := GREATEST(COALESCE(NEW.services_value,0), 0);
  NEW.parts_value := GREATEST(COALESCE(NEW.parts_value,0), 0);

  IF NEW.labor_hours > 0 AND NEW.labor_hour_value > 0 THEN
    NEW.labor_value := round(NEW.labor_hours * NEW.labor_hour_value, 2);
  ELSE
    NEW.labor_value := GREATEST(COALESCE(NEW.labor_value,0), 0);
  END IF;

  NEW.gross_value := NEW.parts_value + NEW.labor_value + NEW.services_value;

  IF COALESCE(NEW.discount_mode,'amount') = 'percent' THEN
    IF COALESCE(NEW.discount_input,0) < 0 OR COALESCE(NEW.discount_input,0) > 100 THEN
      RAISE EXCEPTION 'O desconto percentual deve ficar entre 0%% e 100%%';
    END IF;
    NEW.discount_value := round(NEW.gross_value * COALESCE(NEW.discount_input,0) / 100, 2);
  ELSE
    -- Compatibilidade: propostas antigas informam apenas discount_value.
    IF COALESCE(NEW.discount_input,0) = 0 AND COALESCE(NEW.discount_value,0) > 0 THEN
      NEW.discount_input := NEW.discount_value;
    END IF;
    IF COALESCE(NEW.discount_input,0) < 0 THEN
      RAISE EXCEPTION 'O desconto não pode ser negativo';
    END IF;
    IF NEW.gross_value > 0 AND COALESCE(NEW.discount_input,0) > NEW.gross_value + 0.005 THEN
      RAISE EXCEPTION 'O desconto em reais não pode ser maior que o valor bruto da proposta';
    END IF;
    NEW.discount_value := LEAST(COALESCE(NEW.discount_input,0), NEW.gross_value);
  END IF;

  NEW.net_value := GREATEST(NEW.gross_value - NEW.discount_value, 0);
  NEW.total_value := NEW.net_value;

  IF NEW.status = 'desclassificada' AND COALESCE(btrim(NEW.disqualify_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo da desclassificação da proposta';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_proposal_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE pid uuid; v numeric;
BEGIN
  pid := COALESCE(NEW.proposal_id, OLD.proposal_id);
  SELECT COALESCE(SUM(total_value),0) INTO v FROM public.quotation_proposal_items WHERE proposal_id = pid;
  -- O gatilho BEFORE de quotation_proposals recalcula bruto, desconto e líquido.
  UPDATE public.quotation_proposals
     SET parts_value = v,
         updated_at = now()
   WHERE id = pid;
  RETURN COALESCE(NEW, OLD);
END; $function$;