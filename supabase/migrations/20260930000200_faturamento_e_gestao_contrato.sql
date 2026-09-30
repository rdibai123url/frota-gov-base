-- Fase 3 — Faturamento, taxa de administração, gestão do contrato e IMR.
-- Origem: editais do CRMV-PR, DNIT/Sede, UFOB, Cachoeiro de Itapemirim/ES, Imperatriz/MA e Vilhena/RO.
-- Tudo aditivo: colunas e tabelas novas, sem alterar o que já existe.

/* ------------------------------------------------------------------ */
/* 1. Taxa de administração padrão no contrato                          */
/* ------------------------------------------------------------------ */
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS admin_fee_percent numeric(7, 4)
  CHECK (admin_fee_percent IS NULL OR (admin_fee_percent >= -100 AND admin_fee_percent <= 100));

/* ------------------------------------------------------------------ */
/* 2. Faturas                                                           */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  reference_month date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'conferida', 'paga', 'cancelada')),
  due_date date,
  nf_number text,
  nf_date date,
  nf_value numeric(14, 2) CHECK (nf_value IS NULL OR nf_value >= 0),
  items_total numeric(14, 2) NOT NULL DEFAULT 0,
  glosa_total numeric(14, 2) NOT NULL DEFAULT 0,
  admin_fee_percent numeric(7, 4) NOT NULL DEFAULT 0
    CHECK (admin_fee_percent >= -100 AND admin_fee_percent <= 100),
  admin_fee_value numeric(14, 2) NOT NULL DEFAULT 0,
  withholding_value numeric(14, 2) NOT NULL DEFAULT 0 CHECK (withholding_value >= 0),
  withholding_note text,
  net_total numeric(14, 2) NOT NULL DEFAULT 0,
  paid_at date,
  notes text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT billing_invoices_period_chk CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS billing_invoices_org_month_idx
  ON public.billing_invoices (organization_id, reference_month DESC);

CREATE TABLE IF NOT EXISTS public.billing_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('abastecimento', 'manutencao', 'lavagem', 'outro')),
  source_id uuid,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  description text NOT NULL,
  service_date date,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  glosa_value numeric(14, 2) NOT NULL DEFAULT 0 CHECK (glosa_value >= 0),
  glosa_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_items_glosa_within_chk CHECK (glosa_value <= amount),
  CONSTRAINT billing_items_glosa_reason_chk
    CHECK (glosa_value = 0 OR btrim(coalesce(glosa_reason, '')) <> '')
);
CREATE INDEX IF NOT EXISTS billing_items_invoice_idx ON public.billing_invoice_items (invoice_id);
-- Uma operação só pode estar em uma fatura (ao cancelar a fatura, os itens são removidos).
CREATE UNIQUE INDEX IF NOT EXISTS billing_items_source_unique_idx
  ON public.billing_invoice_items (source_type, source_id) WHERE source_id IS NOT NULL;

-- Totais da fatura: taxa de administração e valor líquido calculados no banco.
CREATE OR REPLACE FUNCTION public.billing_invoice_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base numeric;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.code IS NULL THEN
    NEW.code := public.next_org_code(NEW.organization_id, 'billing_invoice', 'FAT');
  END IF;

  IF NEW.contract_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.id = NEW.contract_id AND c.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Contrato inválido para este órgão.';
  END IF;
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = NEW.supplier_id AND s.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para este órgão.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('paga', 'cancelada') AND NEW.status = OLD.status
       AND (NEW.items_total, NEW.glosa_total, NEW.admin_fee_percent, NEW.withholding_value,
            NEW.nf_number, NEW.nf_value, NEW.period_start, NEW.period_end)
          IS DISTINCT FROM
          (OLD.items_total, OLD.glosa_total, OLD.admin_fee_percent, OLD.withholding_value,
           OLD.nf_number, OLD.nf_value, OLD.period_start, OLD.period_end) THEN
      RAISE EXCEPTION 'Fatura paga ou cancelada não pode ser alterada.';
    END IF;
    IF OLD.status = 'paga' AND NEW.status <> 'paga' THEN
      RAISE EXCEPTION 'Fatura paga não pode voltar a outra situação.';
    END IF;
    IF OLD.status = 'cancelada' AND NEW.status <> 'cancelada' THEN
      RAISE EXCEPTION 'Fatura cancelada não pode ser reaberta.';
    END IF;
    IF NEW.status = 'conferida' AND OLD.status = 'aberta' THEN
      IF btrim(coalesce(NEW.nf_number, '')) = '' OR NEW.nf_value IS NULL THEN
        RAISE EXCEPTION 'Para conferir a fatura, informe o número e o valor da nota fiscal.';
      END IF;
    END IF;
    IF NEW.status = 'paga' AND OLD.status <> 'paga' THEN
      IF OLD.status <> 'conferida' THEN
        RAISE EXCEPTION 'Só é possível pagar uma fatura já conferida.';
      END IF;
      IF NEW.paid_at IS NULL THEN
        RAISE EXCEPTION 'Informe a data do pagamento.';
      END IF;
    END IF;
    IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada'
       AND btrim(coalesce(NEW.cancel_reason, '')) = '' THEN
      RAISE EXCEPTION 'Informe o motivo do cancelamento da fatura.';
    END IF;
  END IF;

  base := COALESCE(NEW.items_total, 0) - COALESCE(NEW.glosa_total, 0);
  NEW.admin_fee_value := round(base * COALESCE(NEW.admin_fee_percent, 0) / 100, 2);
  NEW.net_total := round(base + NEW.admin_fee_value - COALESCE(NEW.withholding_value, 0), 2);
  IF NEW.net_total < 0 AND NEW.status IN ('conferida', 'paga') THEN
    RAISE EXCEPTION 'As retenções não podem ser maiores que o valor da fatura.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.billing_invoice_totals() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_billing_invoice_totals ON public.billing_invoices;
CREATE TRIGGER trg_billing_invoice_totals
  BEFORE INSERT OR UPDATE ON public.billing_invoices
  FOR EACH ROW EXECUTE FUNCTION public.billing_invoice_totals();

-- Fatura paga não pode ser excluída (só as abertas, conferidas ou canceladas).
CREATE OR REPLACE FUNCTION public.billing_invoice_delete_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'paga' THEN
    RAISE EXCEPTION 'Fatura paga não pode ser excluída.';
  END IF;
  RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.billing_invoice_delete_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_billing_invoice_delete_guard ON public.billing_invoices;
CREATE TRIGGER trg_billing_invoice_delete_guard
  BEFORE DELETE ON public.billing_invoices
  FOR EACH ROW EXECUTE FUNCTION public.billing_invoice_delete_guard();

-- Itens: não mexem em fatura fechada, respeitam o órgão e atualizam os totais.
CREATE OR REPLACE FUNCTION public.billing_item_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE inv record; inv_id uuid;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT id, organization_id, status INTO inv FROM public.billing_invoices WHERE id = inv_id;
  IF inv.id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP <> 'DELETE' AND NEW.organization_id <> inv.organization_id THEN
    RAISE EXCEPTION 'Item de outro órgão.';
  END IF;
  IF inv.status IN ('paga', 'cancelada') THEN
    RAISE EXCEPTION 'Fatura paga ou cancelada não pode ser alterada.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.billing_item_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_billing_item_guard ON public.billing_invoice_items;
CREATE TRIGGER trg_billing_item_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.billing_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.billing_item_guard();

CREATE OR REPLACE FUNCTION public.billing_item_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv_id uuid;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  UPDATE public.billing_invoices i
     SET items_total = COALESCE((SELECT sum(amount) FROM public.billing_invoice_items WHERE invoice_id = inv_id), 0),
         glosa_total = COALESCE((SELECT sum(glosa_value) FROM public.billing_invoice_items WHERE invoice_id = inv_id), 0)
   WHERE i.id = inv_id;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.billing_item_after() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_billing_item_after ON public.billing_invoice_items;
CREATE TRIGGER trg_billing_item_after
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.billing_item_after();

/* ------------------------------------------------------------------ */
/* 3. Histórico de gerenciamento do contrato                            */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS public.contract_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'ocorrencia'
    CHECK (kind IN ('ocorrencia', 'notificacao', 'advertencia', 'glosa', 'atesto', 'prorrogacao', 'reuniao')),
  author_role text NOT NULL DEFAULT 'fiscal_tecnico'
    CHECK (author_role IN ('fiscal_tecnico', 'fiscal_administrativo', 'gestor')),
  description text NOT NULL CHECK (char_length(btrim(description)) >= 5),
  deadline_at date,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'atendida', 'encerrada')),
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_by_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS contract_occurrences_contract_idx
  ON public.contract_occurrences (contract_id, occurred_at DESC);

/* ------------------------------------------------------------------ */
/* 4. IMR — indicadores de nível de serviço                             */
/* ------------------------------------------------------------------ */
CREATE TABLE IF NOT EXISTS public.service_level_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  block text NOT NULL DEFAULT 'manutencao'
    CHECK (block IN ('abastecimento', 'manutencao', 'lavagem', 'transversal', 'outro')),
  block_weight numeric(5, 2) NOT NULL DEFAULT 0 CHECK (block_weight >= 0 AND block_weight <= 100),
  weight_in_block numeric(5, 2) NOT NULL DEFAULT 100 CHECK (weight_in_block >= 0 AND weight_in_block <= 100),
  target_value numeric(8, 2) NOT NULL CHECK (target_value >= 0),
  kind text NOT NULL DEFAULT 'percent_min' CHECK (kind IN ('percent_min', 'ocorrencias_max')),
  auto_metric text NOT NULL DEFAULT 'nenhum'
    CHECK (auto_metric IN ('nenhum', 'prazo_cotacao', 'cobertura_manutencao')),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (contract_id, code)
);

CREATE TABLE IF NOT EXISTS public.service_level_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  indicator_id uuid NOT NULL REFERENCES public.service_level_indicators(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  measured_value numeric(8, 2) NOT NULL CHECK (measured_value >= 0),
  score numeric(5, 2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'automatico')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (indicator_id, reference_month)
);

-- Nota do indicador (0 a 10): proporcional à meta, ou pela contagem de ocorrências.
CREATE OR REPLACE FUNCTION public.service_level_score()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ind public.service_level_indicators;
BEGIN
  SELECT * INTO ind FROM public.service_level_indicators WHERE id = NEW.indicator_id;
  IF ind.id IS NULL THEN RAISE EXCEPTION 'Indicador não encontrado.'; END IF;
  IF ind.organization_id <> NEW.organization_id OR ind.contract_id <> NEW.contract_id THEN
    RAISE EXCEPTION 'Indicador de outro contrato ou órgão.';
  END IF;
  NEW.reference_month := date_trunc('month', NEW.reference_month)::date;
  IF ind.kind = 'ocorrencias_max' THEN
    NEW.score := CASE WHEN NEW.measured_value <= 0 THEN 10 WHEN NEW.measured_value < 2 THEN 5 ELSE 0 END;
  ELSIF ind.target_value > 0 THEN
    NEW.score := round(least(10, NEW.measured_value / ind.target_value * 10), 2);
  ELSE
    NEW.score := 10;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.service_level_score() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_service_level_score ON public.service_level_results;
CREATE TRIGGER trg_service_level_score
  BEFORE INSERT OR UPDATE ON public.service_level_results
  FOR EACH ROW EXECUTE FUNCTION public.service_level_score();

-- Nota final do mês: média ponderada dos indicadores dentro de cada bloco e dos blocos entre si.
-- Blocos ou indicadores sem resultado no mês ficam de fora e os pesos restantes são reescalados.
CREATE OR REPLACE FUNCTION public.imr_final_grade(_contract uuid, _month date)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  WITH r AS (
    SELECT i.block, i.block_weight, i.weight_in_block, s.score
      FROM public.service_level_indicators i
      JOIN public.service_level_results s
        ON s.indicator_id = i.id AND s.reference_month = date_trunc('month', _month)::date
     WHERE i.contract_id = _contract AND i.active
  ), b AS (
    SELECT block, max(block_weight) AS w,
           sum(score * weight_in_block) / NULLIF(sum(weight_in_block), 0) AS grade
      FROM r GROUP BY block
  )
  SELECT round(sum(grade * w) / NULLIF(sum(w), 0), 2) FROM b WHERE w > 0;
$$;
GRANT EXECUTE ON FUNCTION public.imr_final_grade(uuid, date) TO authenticated;
REVOKE ALL ON FUNCTION public.imr_final_grade(uuid, date) FROM PUBLIC, anon;

-- Medidas calculadas automaticamente a partir dos dados do sistema (respeitam o órgão do usuário).
CREATE OR REPLACE FUNCTION public.imr_auto_metric(_metric text, _month date)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v numeric; m date := date_trunc('month', _month)::date;
BEGIN
  IF _metric = 'prazo_cotacao' THEN
    SELECT round(100.0 * count(*) FILTER (WHERE q.first_prop <= q.created_at + interval '24 hours')
                  / NULLIF(count(*), 0), 2)
      INTO v
      FROM (
        SELECT q0.created_at,
               (SELECT min(p.received_at) FROM public.quotation_proposals p WHERE p.quotation_id = q0.id) AS first_prop
          FROM public.quotations q0
         WHERE q0.status <> 'cancelada'
           AND date_trunc('month', q0.created_at)::date = m
      ) q;
  ELSIF _metric = 'cobertura_manutencao' THEN
    SELECT round(100.0 * count(*) FILTER (WHERE status <> 'cancelada') / NULLIF(count(*), 0), 2)
      INTO v
      FROM public.maintenance_requests
     WHERE date_trunc('month', created_at)::date = m;
  ELSE
    RAISE EXCEPTION 'Medida automática desconhecida.';
  END IF;
  RETURN v;
END; $$;
GRANT EXECUTE ON FUNCTION public.imr_auto_metric(text, date) TO authenticated;
REVOKE ALL ON FUNCTION public.imr_auto_metric(text, date) FROM PUBLIC, anon;

/* ------------------------------------------------------------------ */
/* 5. Segurança (RLS)                                                   */
/* ------------------------------------------------------------------ */
DO $$
DECLARE t text; w text;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing_invoices', 'billing_invoice_items', 'contract_occurrences',
                           'service_level_indicators', 'service_level_results'] LOOP
    w := CASE WHEN t IN ('contract_occurrences') THEN 'public.can_write()' ELSE 'public.can_manage_finance()' END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format($p$CREATE POLICY "read %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()))$p$, t);
    EXECUTE format($p$CREATE POLICY "insert %1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (organization_id = public.current_org_id() AND %2$s)$p$, t, w);
    EXECUTE format($p$CREATE POLICY "update %1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (organization_id = public.current_org_id() AND %2$s)
      WITH CHECK (organization_id = public.current_org_id() AND %2$s)$p$, t, w);
    EXECUTE format($p$CREATE POLICY "delete %1$s" ON public.%1$I FOR DELETE TO authenticated
      USING (organization_id = public.current_org_id() AND %2$s)$p$, t, w);
  END LOOP;
END $$;
