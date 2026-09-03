-- ================= FASE 6 — REDE CREDENCIADA, COTAÇÕES E OS =================
CREATE TYPE public.workshop_status AS ENUM ('em_analise','ativo','suspenso','inativo');
CREATE TYPE public.quotation_status AS ENUM ('rascunho','aberta','em_analise','encerrada','cancelada');
CREATE TYPE public.proposal_status AS ENUM ('recebida','desclassificada','selecionada','nao_selecionada');
CREATE TYPE public.invitation_status AS ENUM ('convidada','respondida','recusada','sem_resposta');
CREATE TYPE public.service_order_status AS ENUM ('emitida','veiculo_recebido','em_execucao','aguardando_peca','concluida','cancelada');

-- ============ REDE CREDENCIADA ============
CREATE TABLE public.workshops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  legal_name text NOT NULL,
  trade_name text,
  cnpj text,
  address text,
  district text,
  city text,
  state text,
  zip_code text,
  phone text,
  email text,
  contact_name text,
  status public.workshop_status NOT NULL DEFAULT 'em_analise',
  accredited_at date,
  accredited_until date,
  specialties text[] NOT NULL DEFAULT '{}',
  brands text[] NOT NULL DEFAULT '{}',
  service_radius_km numeric,
  coverage_area text,
  urgency_24h boolean NOT NULL DEFAULT false,
  weekend_service boolean NOT NULL DEFAULT false,
  attachment_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_workshops_org ON public.workshops (organization_id, legal_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workshops TO authenticated;
GRANT ALL ON public.workshops TO service_role;
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read workshops" ON public.workshops FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert workshops" ON public.workshops FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update workshops" ON public.workshops FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

-- ============ COTAÇÕES ============
CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  code text,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  request_id uuid REFERENCES public.maintenance_requests(id),
  unit_id uuid REFERENCES public.units(id),
  cost_center_id uuid REFERENCES public.cost_centers(id),
  description text NOT NULL,
  specialty text,
  deadline_at timestamptz,
  status public.quotation_status NOT NULL DEFAULT 'rascunho',
  invited_count integer NOT NULL DEFAULT 0,
  proposals_count integer NOT NULL DEFAULT 0,
  valid_proposals_count integer NOT NULL DEFAULT 0,
  refusals_count integer NOT NULL DEFAULT 0,
  no_response_count integer NOT NULL DEFAULT 0,
  few_proposals_justification text,
  technical_analysis text,
  choice_justification text,
  selected_proposal_id uuid,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  reject_reason text,
  cancel_reason text,
  notes text,
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_quotations_org ON public.quotations (organization_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read quotations" ON public.quotations FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert quotations" ON public.quotations FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update quotations" ON public.quotations FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

CREATE TABLE public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  description text NOT NULL,
  measure_unit text NOT NULL DEFAULT 'UN',
  quantity numeric NOT NULL DEFAULT 1,
  part_id uuid REFERENCES public.parts_catalog(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_quotation_items_q ON public.quotation_items (quotation_id, sequence);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotation_items TO service_role;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read quotation items" ON public.quotation_items FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert quotation items" ON public.quotation_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update quotation items" ON public.quotation_items FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "delete quotation items" ON public.quotation_items FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance()
         AND EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND q.status IN ('rascunho','aberta')));

CREATE TABLE public.quotation_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  workshop_id uuid NOT NULL REFERENCES public.workshops(id),
  status public.invitation_status NOT NULL DEFAULT 'convidada',
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (quotation_id, workshop_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_invitations TO authenticated;
GRANT ALL ON public.quotation_invitations TO service_role;
ALTER TABLE public.quotation_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read invitations" ON public.quotation_invitations FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert invitations" ON public.quotation_invitations FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update invitations" ON public.quotation_invitations FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "delete invitations" ON public.quotation_invitations FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance()
         AND EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND q.status IN ('rascunho','aberta')));

CREATE TABLE public.quotation_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  workshop_id uuid NOT NULL REFERENCES public.workshops(id),
  execution_days integer,
  valid_until date,
  warranty_days integer,
  payment_terms text,
  parts_value numeric NOT NULL DEFAULT 0,
  labor_value numeric NOT NULL DEFAULT 0,
  discount_value numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  status public.proposal_status NOT NULL DEFAULT 'recebida',
  disqualify_reason text,
  notes text,
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (quotation_id, workshop_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_proposals TO authenticated;
GRANT ALL ON public.quotation_proposals TO service_role;
ALTER TABLE public.quotation_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read proposals" ON public.quotation_proposals FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert proposals" ON public.quotation_proposals FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update proposals" ON public.quotation_proposals FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

CREATE TABLE public.quotation_proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  proposal_id uuid NOT NULL REFERENCES public.quotation_proposals(id) ON DELETE CASCADE,
  quotation_item_id uuid REFERENCES public.quotation_items(id),
  description text NOT NULL,
  brand text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_value numeric NOT NULL DEFAULT 0,
  total_value numeric GENERATED ALWAYS AS (quantity * unit_value) STORED,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_proposal_items_p ON public.quotation_proposal_items (proposal_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_proposal_items TO authenticated;
GRANT ALL ON public.quotation_proposal_items TO service_role;
ALTER TABLE public.quotation_proposal_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read proposal items" ON public.quotation_proposal_items FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert proposal items" ON public.quotation_proposal_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update proposal items" ON public.quotation_proposal_items FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "delete proposal items" ON public.quotation_proposal_items FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance()
         AND EXISTS (SELECT 1 FROM public.quotation_proposals p
                      JOIN public.quotations q ON q.id = p.quotation_id
                     WHERE p.id = proposal_id AND q.status IN ('rascunho','aberta','em_analise')));

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_selected_proposal_fk
  FOREIGN KEY (selected_proposal_id) REFERENCES public.quotation_proposals(id);

-- ============ ORDENS DE SERVIÇO ============
CREATE TABLE public.service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  code text,
  quotation_id uuid REFERENCES public.quotations(id),
  proposal_id uuid REFERENCES public.quotation_proposals(id),
  request_id uuid REFERENCES public.maintenance_requests(id),
  maintenance_record_id uuid REFERENCES public.maintenance_records(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  unit_id uuid REFERENCES public.units(id),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id),
  services text NOT NULL,
  approved_value numeric NOT NULL DEFAULT 0,
  executed_value numeric,
  reserved_value numeric NOT NULL DEFAULT 0,
  consumed_value numeric NOT NULL DEFAULT 0,
  budget_reserved boolean NOT NULL DEFAULT false,
  execution_days integer,
  deadline_at date,
  warranty_days integer,
  expense_origin public.expense_origin NOT NULL DEFAULT 'compra_direta',
  cost_center_id uuid REFERENCES public.cost_centers(id),
  contract_id uuid REFERENCES public.contracts(id),
  contract_item_id uuid REFERENCES public.contract_items(id),
  commitment_id uuid REFERENCES public.commitments(id),
  quota_id uuid REFERENCES public.quotas(id),
  authorizer_id uuid,
  authorizer_name text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  odometer_km numeric,
  hour_meter numeric,
  status public.service_order_status NOT NULL DEFAULT 'emitida',
  cancel_reason text,
  notes text,
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_service_orders_org ON public.service_orders (organization_id, issued_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_orders TO authenticated;
GRANT ALL ON public.service_orders TO service_role;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read service orders" ON public.service_orders FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert service orders" ON public.service_orders FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update service orders" ON public.service_orders FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());

CREATE TABLE public.service_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'peca',
  part_id uuid REFERENCES public.parts_catalog(id),
  description text NOT NULL,
  brand text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_value numeric NOT NULL DEFAULT 0,
  total_value numeric GENERATED ALWAYS AS (quantity * unit_value) STORED,
  warranty_days integer,
  warranty_until date,
  replaced_part_returned boolean NOT NULL DEFAULT false,
  returned_at date,
  returned_to text,
  return_notes text,
  return_attachment_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX idx_so_items_so ON public.service_order_items (service_order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_items TO authenticated;
GRANT ALL ON public.service_order_items TO service_role;
ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read so items" ON public.service_order_items FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "insert so items" ON public.service_order_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "update so items" ON public.service_order_items FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance())
  WITH CHECK (organization_id = public.current_org_id() AND public.can_manage_maintenance());
CREATE POLICY "delete so items" ON public.service_order_items FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.can_manage_maintenance()
         AND EXISTS (SELECT 1 FROM public.service_orders s WHERE s.id = service_order_id
                      AND s.status NOT IN ('concluida','cancelada')));

ALTER TABLE public.budget_movements ADD COLUMN service_order_id uuid REFERENCES public.service_orders(id);

-- ============ FUNÇÕES ============
CREATE OR REPLACE FUNCTION public.set_phase6_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := public.next_org_code(NEW.organization_id, TG_ARGV[0], TG_ARGV[1]);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.set_phase6_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_phase6_code() TO service_role;

-- recalcula o total da proposta a partir dos itens
CREATE OR REPLACE FUNCTION public.sync_proposal_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; v numeric;
BEGIN
  pid := COALESCE(NEW.proposal_id, OLD.proposal_id);
  SELECT COALESCE(SUM(total_value),0) INTO v FROM public.quotation_proposal_items WHERE proposal_id = pid;
  UPDATE public.quotation_proposals
     SET parts_value = v,
         total_value = GREATEST(v + labor_value - discount_value, 0),
         updated_at = now()
   WHERE id = pid;
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.sync_proposal_total() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_proposal_total() TO service_role;

CREATE OR REPLACE FUNCTION public.sync_proposal_value()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.total_value := GREATEST(COALESCE(NEW.parts_value,0) + COALESCE(NEW.labor_value,0) - COALESCE(NEW.discount_value,0), 0);
  IF NEW.status = 'desclassificada' AND COALESCE(btrim(NEW.disqualify_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo da desclassificação da proposta';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_proposal_value() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_proposal_value() TO service_role;

-- estatísticas do processo de cotação
CREATE OR REPLACE FUNCTION public.recount_quotation_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE qid uuid;
BEGIN
  qid := COALESCE((to_jsonb(NEW)->>'quotation_id')::uuid, (to_jsonb(OLD)->>'quotation_id')::uuid);
  UPDATE public.quotations q SET
    invited_count = (SELECT count(*) FROM public.quotation_invitations i WHERE i.quotation_id = qid),
    refusals_count = (SELECT count(*) FROM public.quotation_invitations i WHERE i.quotation_id = qid AND i.status = 'recusada'),
    no_response_count = (SELECT count(*) FROM public.quotation_invitations i WHERE i.quotation_id = qid AND i.status IN ('convidada','sem_resposta')),
    proposals_count = (SELECT count(*) FROM public.quotation_proposals p WHERE p.quotation_id = qid),
    valid_proposals_count = (SELECT count(*) FROM public.quotation_proposals p WHERE p.quotation_id = qid AND p.status <> 'desclassificada'),
    updated_at = now()
  WHERE q.id = qid;
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE ALL ON FUNCTION public.recount_quotation_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recount_quotation_stats() TO service_role;

-- regras da cotação: cancelamento, mínimo de 3 propostas e justificativa da escolha
CREATE OR REPLACE FUNCTION public.guard_quotation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sel record; lowest numeric; valid_count integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'cancelada' AND NEW.status <> 'cancelada' THEN
      RAISE EXCEPTION 'Processo de cotação cancelado não pode ser reaberto';
    END IF;
    IF OLD.status = 'encerrada' AND NEW.selected_proposal_id IS DISTINCT FROM OLD.selected_proposal_id THEN
      RAISE EXCEPTION 'Processo encerrado: a proposta selecionada não pode ser alterada';
    END IF;
  END IF;

  IF NEW.status = 'cancelada' AND COALESCE(btrim(NEW.cancel_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento do processo de cotação';
  END IF;

  IF NEW.selected_proposal_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.selected_proposal_id IS DISTINCT FROM OLD.selected_proposal_id) THEN
    SELECT * INTO sel FROM public.quotation_proposals WHERE id = NEW.selected_proposal_id;
    IF sel IS NULL OR sel.quotation_id <> NEW.id THEN
      RAISE EXCEPTION 'Proposta selecionada não pertence a este processo';
    END IF;
    IF sel.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Proposta pertence a outro órgão';
    END IF;
    IF sel.status = 'desclassificada' THEN
      RAISE EXCEPTION 'Proposta desclassificada não pode ser selecionada';
    END IF;

    SELECT count(*), MIN(total_value) INTO valid_count, lowest
      FROM public.quotation_proposals
     WHERE quotation_id = NEW.id AND status <> 'desclassificada';

    IF valid_count < 3 AND COALESCE(btrim(NEW.few_proposals_justification),'') = '' THEN
      RAISE EXCEPTION 'Processo com % proposta(s) válida(s): informe a justificativa formal para prosseguir com menos de 3 cotações', valid_count;
    END IF;
    IF sel.total_value > COALESCE(lowest,0) + 0.005 AND COALESCE(btrim(NEW.choice_justification),'') = '' THEN
      RAISE EXCEPTION 'A proposta escolhida não é a de menor valor: informe a justificativa técnica da escolha';
    END IF;

    NEW.status := 'encerrada';
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_quotation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_quotation() TO service_role;

CREATE OR REPLACE FUNCTION public.apply_quotation_selection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.selected_proposal_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.selected_proposal_id IS DISTINCT FROM OLD.selected_proposal_id) THEN
    UPDATE public.quotation_proposals SET status = 'selecionada', updated_at = now()
     WHERE id = NEW.selected_proposal_id;
    UPDATE public.quotation_proposals SET status = 'nao_selecionada', updated_at = now()
     WHERE quotation_id = NEW.id AND id <> NEW.selected_proposal_id AND status NOT IN ('desclassificada');
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.apply_quotation_selection() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_quotation_selection() TO service_role;

-- regras e reserva financeira da ordem de serviço
CREATE OR REPLACE FUNCTION public.guard_service_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record; p record; w record; v record;
BEGIN
  SELECT * INTO w FROM public.workshops WHERE id = NEW.workshop_id;
  IF w IS NULL OR w.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Oficina credenciada pertence a outro órgão';
  END IF;
  IF TG_OP = 'INSERT' AND w.status <> 'ativo' THEN
    RAISE EXCEPTION 'Oficina % não está com credenciamento ativo', COALESCE(w.trade_name, w.legal_name);
  END IF;

  SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF v IS NULL OR v.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Veículo pertence a outro órgão';
  END IF;

  IF NEW.quotation_id IS NOT NULL THEN
    SELECT * INTO q FROM public.quotations WHERE id = NEW.quotation_id;
    IF q IS NULL OR q.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Processo de cotação pertence a outro órgão';
    END IF;
    IF q.selected_proposal_id IS NULL THEN
      RAISE EXCEPTION 'A ordem de serviço só pode ser emitida após a aprovação de uma proposta';
    END IF;
    IF TG_OP = 'INSERT' THEN
      SELECT * INTO p FROM public.quotation_proposals WHERE id = q.selected_proposal_id;
      IF NEW.workshop_id <> p.workshop_id THEN
        RAISE EXCEPTION 'A oficina da OS deve ser a mesma da proposta aprovada';
      END IF;
      NEW.proposal_id := q.selected_proposal_id;
    END IF;
  END IF;

  IF NEW.status = 'cancelada' AND COALESCE(btrim(NEW.cancel_reason),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento da ordem de serviço';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'concluida' AND (
         NEW.status <> OLD.status OR NEW.approved_value <> OLD.approved_value
         OR NEW.executed_value IS DISTINCT FROM OLD.executed_value
         OR NEW.workshop_id <> OLD.workshop_id OR NEW.vehicle_id <> OLD.vehicle_id) THEN
      RAISE EXCEPTION 'Ordem de serviço concluída é imutável nos dados críticos';
    END IF;
    IF OLD.status = 'cancelada' AND NEW.status <> 'cancelada' THEN
      RAISE EXCEPTION 'Ordem de serviço cancelada não pode ser reaberta';
    END IF;
    IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
      NEW.executed_value := COALESCE(NEW.executed_value, NEW.approved_value);
      NEW.finished_at := COALESCE(NEW.finished_at, now());
    END IF;
    IF NEW.status IN ('em_execucao','aguardando_peca') AND OLD.started_at IS NULL THEN
      NEW.started_at := COALESCE(NEW.started_at, now());
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_service_order() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_service_order() TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_service_order_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'cancelada'
     AND COALESCE(NEW.approved_value,0) > 0
     AND (NEW.contract_item_id IS NOT NULL OR NEW.commitment_id IS NOT NULL OR NEW.quota_id IS NOT NULL) THEN
    PERFORM public.budget_reserve(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id, 0, NEW.approved_value);
    NEW.budget_reserved := true;
    NEW.reserved_value := NEW.approved_value;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_service_order_budget() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_service_order_budget() TO service_role;

CREATE OR REPLACE FUNCTION public.apply_service_order_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rest numeric;
BEGIN
  IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    IF NEW.contract_item_id IS NOT NULL OR NEW.commitment_id IS NOT NULL OR NEW.quota_id IS NOT NULL THEN
      PERFORM public.budget_consume(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id,
                                    0, COALESCE(NEW.executed_value,0), OLD.budget_reserved);
      rest := GREATEST(COALESCE(OLD.reserved_value,0) - COALESCE(NEW.executed_value,0), 0);
      IF OLD.budget_reserved AND rest > 0 THEN
        PERFORM public.budget_release(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id, 0, rest);
      END IF;
    END IF;
    NEW.consumed_value := COALESCE(NEW.executed_value,0);
    NEW.reserved_value := 0;
    NEW.budget_reserved := false;
  ELSIF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
    IF OLD.budget_reserved AND COALESCE(OLD.reserved_value,0) > 0 THEN
      PERFORM public.budget_release(NEW.organization_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id, 0, OLD.reserved_value);
    END IF;
    NEW.reserved_value := 0;
    NEW.budget_reserved := false;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.apply_service_order_budget() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_service_order_budget() TO service_role;

CREATE OR REPLACE FUNCTION public.log_service_order_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k public.budget_movement_kind; val numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.budget_reserved AND NEW.reserved_value > 0 THEN k := 'reserva'; val := NEW.reserved_value; END IF;
  ELSE
    IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN k := 'consumo'; val := COALESCE(NEW.executed_value,0);
    ELSIF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' AND COALESCE(OLD.reserved_value,0) > 0 THEN
      k := 'liberacao'; val := OLD.reserved_value;
    END IF;
  END IF;
  IF k IS NOT NULL AND COALESCE(val,0) > 0 THEN
    INSERT INTO public.budget_movements (organization_id, kind, service_order_id, contract_id, contract_item_id,
                                         commitment_id, quota_id, cost_center_id, quantity, value, reason)
    VALUES (NEW.organization_id, k, NEW.id, NEW.contract_id, NEW.contract_item_id, NEW.commitment_id, NEW.quota_id,
            NEW.cost_center_id, 0, val, 'Ordem de serviço ' || COALESCE(NEW.code,''));
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.log_service_order_budget() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_service_order_budget() TO service_role;

-- indisponibilidade do veículo durante a execução da OS
CREATE OR REPLACE FUNCTION public.apply_service_order_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('veiculo_recebido','em_execucao','aguardando_peca') THEN
    UPDATE public.vehicles SET status = 'manutencao', updated_at = now()
     WHERE id = NEW.vehicle_id AND status = 'ativo';
  ELSIF NEW.status IN ('concluida','cancelada') THEN
    UPDATE public.vehicles SET status = 'ativo', updated_at = now()
     WHERE id = NEW.vehicle_id AND status = 'manutencao'
       AND NOT EXISTS (SELECT 1 FROM public.service_orders s
                        WHERE s.vehicle_id = NEW.vehicle_id AND s.id <> NEW.id
                          AND s.status IN ('veiculo_recebido','em_execucao','aguardando_peca'))
       AND NOT EXISTS (SELECT 1 FROM public.maintenance_requests r
                        WHERE r.vehicle_id = NEW.vehicle_id AND r.status = 'em_manutencao');
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.apply_service_order_availability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_service_order_availability() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_service_order_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public.service_orders WHERE id = NEW.service_order_id;
  IF s IS NULL OR s.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Ordem de serviço pertence a outro órgão';
  END IF;
  IF TG_OP = 'INSERT' AND s.status IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'Ordem de serviço encerrada não aceita novos itens';
  END IF;
  IF NEW.warranty_days IS NOT NULL AND NEW.warranty_until IS NULL THEN
    NEW.warranty_until := current_date + NEW.warranty_days;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_service_order_item() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_service_order_item() TO service_role;

-- ============ ALERTAS DA FASE 6 ============
CREATE OR REPLACE FUNCTION public.refresh_procurement_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; cfg record;
BEGIN
  FOR cfg IN SELECT o.id AS org, COALESCE(s.warranty_lead_days, 30) AS wlead
               FROM public.organizations o
               LEFT JOIN public.maintenance_settings s ON s.organization_id = o.id LOOP

    -- prazo de cotação vencido ou próximo
    FOR r IN SELECT q.id, q.organization_id, q.vehicle_id, q.code, q.deadline_at,
                    CASE WHEN q.deadline_at < now() THEN 'cotacao_prazo_vencido' ELSE 'cotacao_prazo_proximo' END AS tp
               FROM public.quotations q
              WHERE q.organization_id = cfg.org AND q.status IN ('aberta','em_analise')
                AND q.deadline_at IS NOT NULL AND q.deadline_at < now() + interval '48 hours'
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'quotation' AND a.entity_id = r.id AND a.alert_type = r.tp) THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, r.tp,
                CASE WHEN r.tp = 'cotacao_prazo_vencido' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
                CASE WHEN r.tp = 'cotacao_prazo_vencido'
                     THEN 'Prazo de propostas encerrado no processo ' || COALESCE(r.code,'')
                     ELSE 'Prazo de propostas próximo do encerramento no processo ' || COALESCE(r.code,'') END,
                'cotacao', 'quotation', r.id, 'aberto');
      END IF;
    END LOOP;

    -- processos com menos de 3 propostas válidas
    FOR r IN SELECT q.id, q.organization_id, q.vehicle_id, q.code, q.valid_proposals_count
               FROM public.quotations q
              WHERE q.organization_id = cfg.org AND q.status IN ('aberta','em_analise')
                AND q.valid_proposals_count < 3
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'quotation' AND a.entity_id = r.id
                      AND a.alert_type = 'cotacao_insuficiente') THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, 'cotacao_insuficiente', 'alerta',
                'Processo ' || COALESCE(r.code,'') || ' com apenas ' || r.valid_proposals_count || ' proposta(s) válida(s)',
                'cotacao', 'quotation', r.id, 'aberto');
      END IF;
    END LOOP;

    -- OS atrasada
    FOR r IN SELECT s.id, s.organization_id, s.vehicle_id, s.code, s.deadline_at
               FROM public.service_orders s
              WHERE s.organization_id = cfg.org AND s.status NOT IN ('concluida','cancelada')
                AND s.deadline_at IS NOT NULL AND s.deadline_at < current_date
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'service_order' AND a.entity_id = r.id
                      AND a.alert_type = 'os_atrasada') THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, 'os_atrasada', 'erro',
                'Ordem de serviço ' || COALESCE(r.code,'') || ' com prazo vencido em ' || to_char(r.deadline_at,'DD/MM/YYYY'),
                'ordem_servico', 'service_order', r.id, 'aberto');
      END IF;
    END LOOP;

    -- garantias de itens da OS a vencer
    FOR r IN SELECT i.id, i.organization_id, s.vehicle_id, i.description, i.warranty_until
               FROM public.service_order_items i
               JOIN public.service_orders s ON s.id = i.service_order_id
              WHERE i.organization_id = cfg.org AND i.warranty_until IS NOT NULL
                AND i.warranty_until BETWEEN current_date AND current_date + cfg.wlead
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'service_order_item' AND a.entity_id = r.id
                      AND a.alert_type = 'garantia_a_vencer') THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, 'garantia_a_vencer', 'alerta',
                'Garantia a vencer em ' || to_char(r.warranty_until,'DD/MM/YYYY') || ': ' || r.description,
                'ordem_servico', 'service_order_item', r.id, 'aberto');
      END IF;
    END LOOP;

    -- credenciamento de oficina vencendo
    FOR r IN SELECT w.id, w.organization_id, COALESCE(w.trade_name, w.legal_name) AS nome, w.accredited_until
               FROM public.workshops w
              WHERE w.organization_id = cfg.org AND w.status = 'ativo' AND w.accredited_until IS NOT NULL
                AND w.accredited_until <= current_date + 30
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'workshop' AND a.entity_id = r.id
                      AND a.alert_type = 'credenciamento_vencendo') THEN
        INSERT INTO public.fueling_alerts (organization_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, 'credenciamento_vencendo',
                CASE WHEN r.accredited_until < current_date THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
                'Credenciamento da oficina ' || r.nome || ' vence em ' || to_char(r.accredited_until,'DD/MM/YYYY'),
                'credenciamento', 'workshop', r.id, 'aberto');
      END IF;
    END LOOP;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.refresh_procurement_alerts() TO authenticated;

-- ============ TRIGGERS ============
CREATE TRIGGER trg_workshops_updated BEFORE UPDATE ON public.workshops FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_quotations_updated BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_quotation_items_updated BEFORE UPDATE ON public.quotation_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_invitations_updated BEFORE UPDATE ON public.quotation_invitations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_proposals_updated BEFORE UPDATE ON public.quotation_proposals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_proposal_items_updated BEFORE UPDATE ON public.quotation_proposal_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_service_orders_updated BEFORE UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_so_items_updated BEFORE UPDATE ON public.service_order_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_quotation_code BEFORE INSERT ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.set_phase6_code('quotation', 'COT');
CREATE TRIGGER trg_service_order_code BEFORE INSERT ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.set_phase6_code('maintenance_record', 'OS');

CREATE TRIGGER trg_quotations_same_org BEFORE INSERT OR UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();
CREATE TRIGGER trg_service_orders_same_org BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_same_org_refs();

CREATE TRIGGER trg_quotations_guard BEFORE INSERT OR UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.guard_quotation();
CREATE TRIGGER trg_quotations_selection AFTER INSERT OR UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.apply_quotation_selection();

CREATE TRIGGER trg_proposal_value BEFORE INSERT OR UPDATE ON public.quotation_proposals
FOR EACH ROW EXECUTE FUNCTION public.sync_proposal_value();
CREATE TRIGGER trg_proposal_items_total AFTER INSERT OR UPDATE OR DELETE ON public.quotation_proposal_items
FOR EACH ROW EXECUTE FUNCTION public.sync_proposal_total();
CREATE TRIGGER trg_proposal_stats AFTER INSERT OR UPDATE OR DELETE ON public.quotation_proposals
FOR EACH ROW EXECUTE FUNCTION public.recount_quotation_stats();
CREATE TRIGGER trg_invitation_stats AFTER INSERT OR UPDATE OR DELETE ON public.quotation_invitations
FOR EACH ROW EXECUTE FUNCTION public.recount_quotation_stats();

CREATE TRIGGER trg_so_guard BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_service_order();
CREATE TRIGGER trg_so_reserve BEFORE INSERT ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.reserve_service_order_budget();
CREATE TRIGGER trg_so_budget BEFORE UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.apply_service_order_budget();
CREATE TRIGGER trg_so_budget_log AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.log_service_order_budget();
CREATE TRIGGER trg_so_availability AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.apply_service_order_availability();
CREATE TRIGGER trg_so_items_guard BEFORE INSERT OR UPDATE ON public.service_order_items
FOR EACH ROW EXECUTE FUNCTION public.guard_service_order_item();

-- auditoria
CREATE TRIGGER trg_audit_workshops AFTER INSERT OR UPDATE OR DELETE ON public.workshops FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_quotations AFTER INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_quotation_items AFTER INSERT OR UPDATE OR DELETE ON public.quotation_items FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_invitations AFTER INSERT OR UPDATE OR DELETE ON public.quotation_invitations FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_proposals AFTER INSERT OR UPDATE ON public.quotation_proposals FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_proposal_items AFTER INSERT OR UPDATE OR DELETE ON public.quotation_proposal_items FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_service_orders AFTER INSERT OR UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_so_items AFTER INSERT OR UPDATE ON public.service_order_items FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- ============ STORAGE: anexos privados de manutenção ============
CREATE POLICY "read manutencao in org" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'manutencao' AND (storage.foldername(name))[1] = public.current_org_id()::text);
CREATE POLICY "insert manutencao in org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manutencao' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_manage_maintenance());
CREATE POLICY "update manutencao in org" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'manutencao' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_manage_maintenance());
CREATE POLICY "delete manutencao in org" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manutencao' AND (storage.foldername(name))[1] = public.current_org_id()::text AND public.can_manage_users());
