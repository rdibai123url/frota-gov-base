-- ============================================================
-- FrotaGov
-- Bloco 10F - reforço das operações atômicas de OFP e cotação
-- ============================================================

-- ------------------------------------------------------------
-- 1) OFP: validar parceiro credenciado e centro de custo no órgão
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supply_order_create(
  _unit_id uuid DEFAULT NULL,
  _vehicle_id uuid DEFAULT NULL,
  _partner_id uuid DEFAULT NULL,
  _supplier_id uuid DEFAULT NULL,
  _expense_origin public.expense_origin DEFAULT 'contrato',
  _contract_id uuid DEFAULT NULL,
  _contract_item_id uuid DEFAULT NULL,
  _cost_center_id uuid DEFAULT NULL,
  _deadline_at date DEFAULT NULL,
  _delivery_place text DEFAULT NULL,
  _justification text DEFAULT NULL,
  _requester_name text DEFAULT NULL,
  _items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.current_org_id();
  _order_id uuid;
  _item jsonb;
  _part_id uuid;
  _description text;
  _measure_unit text;
  _quantity numeric;
  _unit_value numeric;
BEGIN
  IF _org IS NULL THEN
    RAISE EXCEPTION 'Nenhum órgão ativo selecionado.';
  END IF;

  IF NOT public.can_manage_maintenance() THEN
    RAISE EXCEPTION 'Sem permissão para criar OFP.';
  END IF;

  IF _items IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Inclua ao menos um item na OFP.';
  END IF;

  IF _unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units
    WHERE id = _unit_id AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Unidade inválida para o órgão atual.';
  END IF;

  IF _vehicle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = _vehicle_id AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Ativo inválido para o órgão atual.';
  END IF;

  IF _partner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accredited_partners
    WHERE id = _partner_id AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Credenciado inválido para o órgão atual.';
  END IF;

  IF _supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = _supplier_id AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para o órgão atual.';
  END IF;

  IF _cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers
    WHERE id = _cost_center_id AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Centro de custo inválido para o órgão atual.';
  END IF;

  IF _contract_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contracts
    WHERE id = _contract_id AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Contrato inválido para o órgão atual.';
  END IF;

  IF _contract_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_items
    WHERE id = _contract_item_id
      AND organization_id = _org
      AND (_contract_id IS NULL OR contract_id = _contract_id)
  ) THEN
    RAISE EXCEPTION 'Item contratual inválido para o órgão atual.';
  END IF;

  INSERT INTO public.supply_orders (
    organization_id, code, unit_id, vehicle_id, partner_id, supplier_id,
    expense_origin, contract_id, contract_item_id, cost_center_id,
    deadline_at, delivery_place, justification, requester_id,
    requester_name, created_by
  )
  VALUES (
    _org, '', _unit_id, _vehicle_id, _partner_id, _supplier_id,
    _expense_origin, _contract_id, _contract_item_id, _cost_center_id,
    _deadline_at, NULLIF(btrim(_delivery_place), ''),
    NULLIF(btrim(_justification), ''), auth.uid(),
    NULLIF(btrim(_requester_name), ''), auth.uid()
  )
  RETURNING id INTO _order_id;

  FOR _item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    _part_id := NULLIF(_item->>'part_id', '')::uuid;
    _description := btrim(COALESCE(_item->>'description', ''));
    _measure_unit := COALESCE(NULLIF(btrim(_item->>'measure_unit'), ''), 'unidade');
    _quantity := COALESCE(NULLIF(_item->>'quantity', '')::numeric, 0);
    _unit_value := COALESCE(NULLIF(_item->>'unit_value', '')::numeric, 0);

    IF _description = '' THEN
      RAISE EXCEPTION 'Todos os itens devem possuir descrição.';
    END IF;

    IF _quantity <= 0 THEN
      RAISE EXCEPTION 'A quantidade dos itens deve ser maior que zero.';
    END IF;

    IF _unit_value < 0 THEN
      RAISE EXCEPTION 'O valor unitário não pode ser negativo.';
    END IF;

    IF _part_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.parts_catalog
      WHERE id = _part_id AND organization_id = _org
    ) THEN
      RAISE EXCEPTION 'Peça informada não pertence ao órgão atual.';
    END IF;

    INSERT INTO public.supply_order_items (
      organization_id, supply_order_id, part_id, description,
      measure_unit, quantity, unit_value, created_by
    )
    VALUES (
      _org, _order_id, _part_id, _description,
      _measure_unit, _quantity, _unit_value, auth.uid()
    );
  END LOOP;

  RETURN _order_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.supply_order_create(
  uuid, uuid, uuid, uuid, public.expense_origin, uuid, uuid, uuid,
  date, text, text, text, jsonb
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.supply_order_create(
  uuid, uuid, uuid, uuid, public.expense_origin, uuid, uuid, uuid,
  date, text, text, text, jsonb
)
TO authenticated, service_role;


-- ------------------------------------------------------------
-- 2) Cotação: empresa + proposta + itens + convite na mesma transação
-- ------------------------------------------------------------

-- Remove a assinatura anterior para não deixar uma sobrecarga menos protegida.
DROP FUNCTION IF EXISTS public.quotation_proposal_submit_atomic(
  uuid, uuid, uuid, uuid, text, integer, integer, integer, integer,
  text, numeric, numeric, numeric, numeric, text, numeric, text, jsonb
);

CREATE FUNCTION public.quotation_proposal_submit_atomic(
  _organization_id uuid,
  _quotation_id uuid,
  _invitation_id uuid,
  _workshop_id uuid,
  _company_name text,
  _cnpj text,
  _contact_name text,
  _phone text,
  _email text,
  _source text,
  _execution_days integer,
  _warranty_days integer,
  _parts_warranty_days integer,
  _valid_days integer,
  _payment_terms text,
  _labor_hours numeric,
  _labor_hour_value numeric,
  _labor_value numeric,
  _services_value numeric,
  _discount_mode text,
  _discount_input numeric,
  _notes text,
  _items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _proposal_id uuid;
  _resolved_workshop_id uuid := _workshop_id;
  _quotation_kind text;
  _deadline_at timestamptz;
  _invite_expires_at timestamptz;
  _existing_proposal_id uuid;
  _item jsonb;
  _quotation_item_id uuid;
  _description text;
  _brand text;
  _part_number text;
  _quantity numeric;
  _unit_value numeric;
  _parts_value numeric := 0;
  _expected_gross numeric := 0;
  _normalized_cnpj text := regexp_replace(COALESCE(_cnpj, ''), '\D', '', 'g');
  _normalized_name text := NULLIF(btrim(COALESCE(_company_name, '')), '');
BEGIN
  IF _organization_id IS NULL
     OR _quotation_id IS NULL
     OR _invitation_id IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios da proposta não informados.';
  END IF;

  SELECT q.quotation_kind::text, q.deadline_at
    INTO _quotation_kind, _deadline_at
  FROM public.quotations q
  WHERE q.id = _quotation_id
    AND q.organization_id = _organization_id
    AND q.status IN ('rascunho', 'aberta')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cotação inválida ou encerrada.';
  END IF;

  IF _deadline_at IS NOT NULL AND _deadline_at < now() THEN
    RAISE EXCEPTION 'O prazo para envio da proposta está encerrado.';
  END IF;

  SELECT qi.token_expires_at, qi.proposal_id
    INTO _invite_expires_at, _existing_proposal_id
  FROM public.quotation_invitations qi
  WHERE qi.id = _invitation_id
    AND qi.quotation_id = _quotation_id
    AND qi.organization_id = _organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido para esta cotação.';
  END IF;

  IF _invite_expires_at IS NOT NULL AND _invite_expires_at < now() THEN
    RAISE EXCEPTION 'O prazo do convite está encerrado.';
  END IF;

  IF _existing_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe proposta registrada para este convite.';
  END IF;

  -- Resolve ou cria a oficina dentro da mesma transação da proposta.
  IF _resolved_workshop_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workshops w
      WHERE w.id = _resolved_workshop_id
        AND w.organization_id = _organization_id
    ) THEN
      RAISE EXCEPTION 'Empresa da proposta não pertence ao órgão.';
    END IF;
  ELSE
    IF _normalized_cnpj <> '' THEN
      SELECT w.id
        INTO _resolved_workshop_id
      FROM public.workshops w
      WHERE w.organization_id = _organization_id
        AND regexp_replace(COALESCE(w.cnpj, ''), '\D', '', 'g') = _normalized_cnpj
      ORDER BY w.created_at
      LIMIT 1;
    END IF;

    IF _resolved_workshop_id IS NULL THEN
      IF _normalized_name IS NULL THEN
        RAISE EXCEPTION 'Informe a empresa responsável pela proposta.';
      END IF;

      INSERT INTO public.workshops (
        organization_id,
        legal_name,
        trade_name,
        cnpj,
        email,
        phone,
        contact_name,
        status
      )
      VALUES (
        _organization_id,
        _normalized_name,
        _normalized_name,
        NULLIF(_normalized_cnpj, ''),
        NULLIF(btrim(COALESCE(_email, '')), ''),
        NULLIF(btrim(COALESCE(_phone, '')), ''),
        NULLIF(btrim(COALESCE(_contact_name, '')), ''),
        'ativo'
      )
      RETURNING id INTO _resolved_workshop_id;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotation_invitations qi
    WHERE qi.quotation_id = _quotation_id
      AND qi.workshop_id = _resolved_workshop_id
      AND qi.id <> _invitation_id
  ) THEN
    RAISE EXCEPTION 'Esta empresa já possui outro convite nesta cotação.';
  END IF;

  SELECT p.id
    INTO _existing_proposal_id
  FROM public.quotation_proposals p
  WHERE p.quotation_id = _quotation_id
    AND p.workshop_id = _resolved_workshop_id
  LIMIT 1;

  IF _existing_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe proposta desta empresa nesta cotação.';
  END IF;

  IF COALESCE(_execution_days, 0) < 0
     OR COALESCE(_warranty_days, 0) < 0
     OR COALESCE(_parts_warranty_days, 0) < 0
     OR COALESCE(_valid_days, 0) < 0 THEN
    RAISE EXCEPTION 'Prazos e garantias não podem ser negativos.';
  END IF;

  IF COALESCE(_labor_hours, 0) < 0
     OR COALESCE(_labor_hour_value, 0) < 0
     OR COALESCE(_labor_value, 0) < 0
     OR COALESCE(_services_value, 0) < 0 THEN
    RAISE EXCEPTION 'Valores de serviços não podem ser negativos.';
  END IF;

  IF COALESCE(_discount_mode, 'amount') NOT IN ('amount', 'percent') THEN
    RAISE EXCEPTION 'Modalidade de desconto inválida.';
  END IF;

  IF COALESCE(_discount_input, 0) < 0 THEN
    RAISE EXCEPTION 'O desconto não pode ser negativo.';
  END IF;

  IF COALESCE(_discount_mode, 'amount') = 'percent'
     AND COALESCE(_discount_input, 0) > 100 THEN
    RAISE EXCEPTION 'O desconto percentual não pode passar de 100%%.';
  END IF;

  -- Para cotações de peças, os dados estruturais vêm da própria solicitação.
  IF COALESCE(_quotation_kind, 'servicos_pecas') <> 'servicos' THEN
    FOR _item IN
      SELECT value FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb))
    LOOP
      _quotation_item_id := NULLIF(_item->>'quotation_item_id', '')::uuid;
      _brand := NULLIF(btrim(COALESCE(_item->>'brand', '')), '');
      _part_number := NULLIF(btrim(COALESCE(_item->>'part_number', '')), '');
      _unit_value := COALESCE(NULLIF(_item->>'unit_value', '')::numeric, 0);

      IF _quotation_item_id IS NULL THEN
        RAISE EXCEPTION 'Item da proposta sem vínculo com a cotação.';
      END IF;

      SELECT qi.description, qi.quantity
        INTO _description, _quantity
      FROM public.quotation_items qi
      WHERE qi.id = _quotation_item_id
        AND qi.quotation_id = _quotation_id
        AND qi.organization_id = _organization_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item da cotação inválido.';
      END IF;

      IF COALESCE(_quantity, 0) <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida em item da cotação.';
      END IF;

      IF _unit_value < 0 THEN
        RAISE EXCEPTION 'Valor unitário inválido em item da proposta.';
      END IF;

      _parts_value := _parts_value + (_quantity * _unit_value);
    END LOOP;
  ELSIF jsonb_array_length(COALESCE(_items, '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'Cotação exclusiva de serviços não aceita itens de peças.';
  END IF;

  IF COALESCE(_quotation_kind, 'servicos_pecas') = 'pecas'
     AND (
       COALESCE(_labor_hours, 0) <> 0
       OR COALESCE(_labor_hour_value, 0) <> 0
       OR COALESCE(_labor_value, 0) <> 0
       OR COALESCE(_services_value, 0) <> 0
     ) THEN
    RAISE EXCEPTION 'Cotação exclusiva de peças não aceita valores de serviços.';
  END IF;

  _expected_gross :=
    round(
      COALESCE(_parts_value, 0)
      + COALESCE(_labor_value, 0)
      + COALESCE(_services_value, 0),
      2
    );

  IF _expected_gross <= 0 THEN
    RAISE EXCEPTION 'Informe ao menos um valor de serviço ou de peça.';
  END IF;

  IF COALESCE(_discount_mode, 'amount') = 'amount'
     AND COALESCE(_discount_input, 0) > _expected_gross + 0.005 THEN
    RAISE EXCEPTION 'O desconto em reais não pode ser maior que o valor bruto da proposta.';
  END IF;

  -- Vincula a empresa somente agora; qualquer erro posterior desfaz tudo.
  UPDATE public.quotation_invitations
     SET workshop_id = _resolved_workshop_id,
         updated_at = now()
   WHERE id = _invitation_id;

  INSERT INTO public.quotation_proposals (
    organization_id,
    quotation_id,
    workshop_id,
    source,
    execution_days,
    warranty_days,
    parts_warranty_days,
    valid_days,
    payment_terms,
    labor_hours,
    labor_hour_value,
    labor_value,
    services_value,
    parts_value,
    discount_mode,
    discount_input,
    notes
  )
  VALUES (
    _organization_id,
    _quotation_id,
    _resolved_workshop_id,
    COALESCE(NULLIF(btrim(_source), ''), 'link'),
    _execution_days,
    _warranty_days,
    _parts_warranty_days,
    _valid_days,
    NULLIF(btrim(_payment_terms), ''),
    COALESCE(_labor_hours, 0),
    COALESCE(_labor_hour_value, 0),
    COALESCE(_labor_value, 0),
    COALESCE(_services_value, 0),
    round(COALESCE(_parts_value, 0), 2),
    COALESCE(NULLIF(btrim(_discount_mode), ''), 'amount'),
    COALESCE(_discount_input, 0),
    NULLIF(btrim(_notes), '')
  )
  RETURNING id INTO _proposal_id;

  -- Grava itens usando descrição/quantidade oficiais da cotação.
  IF COALESCE(_quotation_kind, 'servicos_pecas') <> 'servicos' THEN
    FOR _item IN
      SELECT value FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb))
    LOOP
      _quotation_item_id := NULLIF(_item->>'quotation_item_id', '')::uuid;
      _brand := NULLIF(btrim(COALESCE(_item->>'brand', '')), '');
      _part_number := NULLIF(btrim(COALESCE(_item->>'part_number', '')), '');
      _unit_value := COALESCE(NULLIF(_item->>'unit_value', '')::numeric, 0);

      SELECT qi.description, qi.quantity
        INTO _description, _quantity
      FROM public.quotation_items qi
      WHERE qi.id = _quotation_item_id
        AND qi.quotation_id = _quotation_id
        AND qi.organization_id = _organization_id;

      INSERT INTO public.quotation_proposal_items (
        organization_id,
        proposal_id,
        quotation_item_id,
        description,
        brand,
        part_number,
        quantity,
        unit_value
      )
      VALUES (
        _organization_id,
        _proposal_id,
        _quotation_item_id,
        _description,
        _brand,
        _part_number,
        _quantity,
        _unit_value
      );
    END LOOP;
  END IF;

  UPDATE public.quotation_invitations
     SET send_status = 'respondido',
         status = 'respondida',
         responded_at = now(),
         proposal_id = _proposal_id,
         workshop_id = _resolved_workshop_id,
         updated_at = now()
   WHERE id = _invitation_id;

  RETURN _proposal_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.quotation_proposal_submit_atomic(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text,
  integer, integer, integer, integer, text, numeric, numeric,
  numeric, numeric, text, numeric, text, jsonb
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.quotation_proposal_submit_atomic(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text,
  integer, integer, integer, integer, text, numeric, numeric,
  numeric, numeric, text, numeric, text, jsonb
)
TO service_role;
