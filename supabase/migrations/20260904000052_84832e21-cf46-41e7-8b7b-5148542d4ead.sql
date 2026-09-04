CREATE OR REPLACE FUNCTION public.partner_capture_fueling(_authorization uuid, _quantity numeric, _unit_price numeric, _odometer numeric DEFAULT NULL::numeric, _hour_meter numeric DEFAULT NULL::numeric, _document text DEFAULT NULL::text, _attachment text DEFAULT NULL::text, _fueled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _notes text DEFAULT NULL::text, _ip text DEFAULT NULL::text, _user_agent text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a record; _partner uuid := my_partner_id(); _sup uuid; _org uuid;
  _fid uuid; _at timestamptz := COALESCE(_fueled_at, now()); _mk text; _last numeric;
BEGIN
  IF _partner IS NULL AND NOT can_manage_fleet() THEN
    RAISE EXCEPTION 'Captura permitida apenas para credenciados habilitados ou gestores de frota';
  END IF;
  SELECT * INTO a FROM public.fuel_authorizations WHERE id = _authorization FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Autorização não encontrada'; END IF;
  _org := a.organization_id;

  IF _partner IS NOT NULL THEN
    SELECT p.supplier_id INTO _sup FROM public.accredited_partners p
      WHERE p.id = _partner AND p.organization_id = _org AND p.status = 'ativo'
        AND 'abastecimento' = ANY (p.kinds);
    IF NOT FOUND THEN RAISE EXCEPTION 'Credenciado não habilitado para abastecimento neste órgão'; END IF;
    IF a.supplier_id IS NOT NULL AND _sup IS NOT NULL AND a.supplier_id <> _sup THEN
      RAISE EXCEPTION 'Autorização emitida para outro fornecedor';
    END IF;
  END IF;

  IF a.status IN ('cancelada','expirada','utilizada') THEN
    RAISE EXCEPTION 'Autorização % não está disponível (%).', a.code, a.status;
  END IF;
  IF _at > a.valid_until THEN RAISE EXCEPTION 'Autorização % expirada em %.', a.code, a.valid_until; END IF;
  IF _at < a.valid_from THEN RAISE EXCEPTION 'Autorização % ainda não está válida.', a.code; END IF;
  IF COALESCE(_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Informe a quantidade efetivamente abastecida'; END IF;
  IF COALESCE(_unit_price, 0) <= 0 THEN RAISE EXCEPTION 'Informe o preço unitário praticado'; END IF;
  IF COALESCE(btrim(_document), '') = '' THEN RAISE EXCEPTION 'Informe o número do documento fiscal/cupom'; END IF;
  IF EXISTS (SELECT 1 FROM public.fuelings f
              WHERE f.authorization_id = a.id AND f.status <> 'cancelado'
                AND upper(COALESCE(f.invoice_number, '')) = upper(btrim(_document))) THEN
    RAISE EXCEPTION 'Documento fiscal já capturado para esta autorização';
  END IF;

  SELECT COALESCE(meter_kind, 'hodometro') INTO _mk FROM public.vehicles WHERE id = a.vehicle_id;
  IF _mk IN ('hodometro','ambos') AND _odometer IS NULL THEN
    RAISE EXCEPTION 'Informe o hodômetro do veículo';
  END IF;
  IF _mk = 'horimetro' AND _hour_meter IS NULL THEN
    RAISE EXCEPTION 'Informe o horímetro do equipamento';
  END IF;

  -- medidor não pode regredir sem correção formal registrada
  IF _odometer IS NOT NULL THEN
    SELECT max(f.odometer_km) INTO _last FROM public.fuelings f
     WHERE f.vehicle_id = a.vehicle_id AND f.status <> 'cancelado' AND f.fueled_at <= _at;
    IF _last IS NOT NULL AND _odometer < _last THEN
      RAISE EXCEPTION 'Hodômetro informado (%) é menor que a última leitura registrada (%). Registre uma correção de medidor antes da captura.', _odometer, _last;
    END IF;
  END IF;
  IF _hour_meter IS NOT NULL THEN
    SELECT max(f.hour_meter) INTO _last FROM public.fuelings f
     WHERE f.vehicle_id = a.vehicle_id AND f.status <> 'cancelado' AND f.fueled_at <= _at;
    IF _last IS NOT NULL AND _hour_meter < _last THEN
      RAISE EXCEPTION 'Horímetro informado (%) é menor que a última leitura registrada (%). Registre uma correção de medidor antes da captura.', _hour_meter, _last;
    END IF;
  END IF;

  INSERT INTO public.fuelings (
    organization_id, vehicle_id, unit_id, supplier_id, fuel_type_id, driver_id, authorization_id,
    fueled_at, odometer_km, hour_meter, quantity, unit_price, status, expense_origin,
    cost_center_id, contract_id, contract_item_id, commitment_id, quota_id,
    document_kind, invoice_number, attachment_path, notes, created_by
  ) VALUES (
    _org, a.vehicle_id, a.unit_id, COALESCE(_sup, a.supplier_id), a.fuel_type_id, a.driver_id, a.id,
    _at, _odometer, _hour_meter, _quantity, _unit_price, 'valido', a.expense_origin,
    a.cost_center_id, a.contract_id, a.contract_item_id, a.commitment_id, a.quota_id,
    'cupom', btrim(_document), _attachment,
    COALESCE(_notes, 'Capturado no Portal do Credenciado'), auth.uid()
  ) RETURNING id INTO _fid;

  INSERT INTO public.partner_captures (
    organization_id, partner_id, kind, vehicle_id, authorization_id, fueling_id,
    authorized_quantity, captured_quantity, authorized_value, captured_value,
    document_number, attachment_path, captured_by, ip, user_agent,
    response_minutes, notes
  ) VALUES (
    _org, _partner, 'abastecimento', a.vehicle_id, a.id, _fid,
    a.max_quantity, _quantity, a.max_value, ROUND(_quantity * _unit_price, 2),
    btrim(_document), _attachment, auth.uid(), _ip, _user_agent,
    GREATEST(EXTRACT(EPOCH FROM (now() - a.created_at)) / 60, 0)::int, _notes
  );

  RETURN _fid;
END $function$;