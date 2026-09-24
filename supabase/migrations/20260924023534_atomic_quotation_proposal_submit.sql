-- ============================================================
-- FrotaGov
-- Gravação atômica de proposta de cotação
-- ============================================================

CREATE OR REPLACE FUNCTION public.quotation_proposal_submit_atomic(
  _organization_id uuid,
  _quotation_id uuid,
  _invitation_id uuid,
  _workshop_id uuid,
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
  _item jsonb;
  _quotation_item_id uuid;
  _description text;
  _brand text;
  _part_number text;
  _quantity numeric;
  _unit_value numeric;
BEGIN
  IF _organization_id IS NULL
     OR _quotation_id IS NULL
     OR _invitation_id IS NULL
     OR _workshop_id IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios da proposta não informados.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.quotations
    WHERE id = _quotation_id
      AND organization_id = _organization_id
      AND status IN ('rascunho', 'aberta')
  ) THEN
    RAISE EXCEPTION 'Cotação inválida ou encerrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.quotation_invitations
    WHERE id = _invitation_id
      AND quotation_id = _quotation_id
      AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'Convite inválido para esta cotação.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotation_proposals
    WHERE quotation_id = _quotation_id
      AND workshop_id = _workshop_id
  ) THEN
    RAISE EXCEPTION 'Já existe proposta desta empresa nesta cotação.';
  END IF;

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
    discount_mode,
    discount_input,
    notes
  )
  VALUES (
    _organization_id,
    _quotation_id,
    _workshop_id,
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
    COALESCE(NULLIF(btrim(_discount_mode), ''), 'amount'),
    COALESCE(_discount_input, 0),
    NULLIF(btrim(_notes), '')
  )
  RETURNING id INTO _proposal_id;

  FOR _item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb))
  LOOP
    _quotation_item_id :=
      NULLIF(_item->>'quotation_item_id', '')::uuid;

    _description :=
      btrim(COALESCE(_item->>'description', ''));

    _brand :=
      NULLIF(btrim(COALESCE(_item->>'brand', '')), '');

    _part_number :=
      NULLIF(btrim(COALESCE(_item->>'part_number', '')), '');

    _quantity :=
      COALESCE(NULLIF(_item->>'quantity', '')::numeric, 0);

    _unit_value :=
      COALESCE(NULLIF(_item->>'unit_value', '')::numeric, 0);

    IF _description = '' THEN
      RAISE EXCEPTION 'Item da proposta sem descrição.';
    END IF;

    IF _quantity <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida em item da proposta.';
    END IF;

    IF _unit_value < 0 THEN
      RAISE EXCEPTION 'Valor unitário inválido em item da proposta.';
    END IF;

    IF _quotation_item_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.quotation_items
      WHERE id = _quotation_item_id
        AND quotation_id = _quotation_id
        AND organization_id = _organization_id
    ) THEN
      RAISE EXCEPTION 'Item da cotação inválido.';
    END IF;

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

  UPDATE public.quotation_invitations
     SET send_status = 'respondido',
         status = 'respondida',
         responded_at = now(),
         proposal_id = _proposal_id
   WHERE id = _invitation_id;

  RETURN _proposal_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.quotation_proposal_submit_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer,
  integer,
  integer,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  numeric,
  text,
  jsonb
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.quotation_proposal_submit_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer,
  integer,
  integer,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  numeric,
  text,
  jsonb
)
TO service_role;