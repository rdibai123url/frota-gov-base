-- ============================================================
-- FrotaGov
-- Gravação atômica de apólice + veículos cobertos
-- ============================================================

CREATE OR REPLACE FUNCTION public.insurance_policy_save_atomic(
  _policy_id uuid DEFAULT NULL,
  _insurer_name text DEFAULT NULL,
  _policy_number text DEFAULT NULL,
  _supplier_id uuid DEFAULT NULL,
  _contract_id uuid DEFAULT NULL,
  _valid_from date DEFAULT NULL,
  _valid_to date DEFAULT NULL,
  _premium_value numeric DEFAULT 0,
  _deductible_value numeric DEFAULT NULL,
  _coverages text DEFAULT NULL,
  _limits_notes text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _status public.insurance_status DEFAULT 'ativa',
  _attachment_path text DEFAULT NULL,
  _renewed_from_id uuid DEFAULT NULL,
  _vehicles jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.current_org_id();
  _saved_id uuid;
  _vehicle jsonb;
  _vehicle_id uuid;
BEGIN
  IF _org IS NULL THEN
    RAISE EXCEPTION 'Nenhum órgão ativo selecionado.';
  END IF;

  IF NOT public.can_manage_fleet() THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar seguros.';
  END IF;

  IF COALESCE(btrim(_insurer_name), '') = '' THEN
    RAISE EXCEPTION 'Informe a seguradora.';
  END IF;

  IF COALESCE(btrim(_policy_number), '') = '' THEN
    RAISE EXCEPTION 'Informe o número da apólice.';
  END IF;

  IF _valid_from IS NULL OR _valid_to IS NULL THEN
    RAISE EXCEPTION 'Informe a vigência da apólice.';
  END IF;

  IF _valid_to < _valid_from THEN
    RAISE EXCEPTION 'O fim da vigência deve ser posterior ao início.';
  END IF;

  IF COALESCE(_premium_value, 0) < 0 THEN
    RAISE EXCEPTION 'O prêmio da apólice não pode ser negativo.';
  END IF;

  IF _deductible_value IS NOT NULL AND _deductible_value < 0 THEN
    RAISE EXCEPTION 'A franquia não pode ser negativa.';
  END IF;

  IF _supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.suppliers
     WHERE id = _supplier_id
       AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Fornecedor não pertence ao órgão atual.';
  END IF;

  IF _contract_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.contracts
     WHERE id = _contract_id
       AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Contrato não pertence ao órgão atual.';
  END IF;

  IF _renewed_from_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.insurance_policies
     WHERE id = _renewed_from_id
       AND organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Apólice anterior inválida.';
  END IF;

  IF _policy_id IS NULL THEN
    INSERT INTO public.insurance_policies (
      organization_id,
      insurer_name,
      policy_number,
      supplier_id,
      contract_id,
      valid_from,
      valid_to,
      premium_value,
      deductible_value,
      coverages,
      limits_notes,
      notes,
      status,
      attachment_path,
      renewed_from_id,
      created_by,
      updated_by
    )
    VALUES (
      _org,
      btrim(_insurer_name),
      btrim(_policy_number),
      _supplier_id,
      _contract_id,
      _valid_from,
      _valid_to,
      COALESCE(_premium_value, 0),
      _deductible_value,
      NULLIF(btrim(_coverages), ''),
      NULLIF(btrim(_limits_notes), ''),
      NULLIF(btrim(_notes), ''),
      _status,
      _attachment_path,
      _renewed_from_id,
      auth.uid(),
      auth.uid()
    )
    RETURNING id INTO _saved_id;

  ELSE
    IF NOT EXISTS (
      SELECT 1
        FROM public.insurance_policies
       WHERE id = _policy_id
         AND organization_id = _org
    ) THEN
      RAISE EXCEPTION 'Apólice não pertence ao órgão atual.';
    END IF;

    UPDATE public.insurance_policies
       SET insurer_name = btrim(_insurer_name),
           policy_number = btrim(_policy_number),
           supplier_id = _supplier_id,
           contract_id = _contract_id,
           valid_from = _valid_from,
           valid_to = _valid_to,
           premium_value = COALESCE(_premium_value, 0),
           deductible_value = _deductible_value,
           coverages = NULLIF(btrim(_coverages), ''),
           limits_notes = NULLIF(btrim(_limits_notes), ''),
           notes = NULLIF(btrim(_notes), ''),
           status = _status,
           attachment_path = COALESCE(_attachment_path, attachment_path),
           updated_at = now(),
           updated_by = auth.uid()
     WHERE id = _policy_id
       AND organization_id = _org;

    _saved_id := _policy_id;
  END IF;

  -- Substitui a relação dos veículos dentro da mesma transação.
  DELETE FROM public.insurance_vehicles
   WHERE policy_id = _saved_id
     AND organization_id = _org;

  IF _vehicles IS NOT NULL
     AND jsonb_typeof(_vehicles) = 'array'
  THEN
    FOR _vehicle IN
      SELECT value
        FROM jsonb_array_elements(_vehicles)
    LOOP
      _vehicle_id := NULLIF(_vehicle->>'vehicle_id', '')::uuid;

      IF _vehicle_id IS NULL THEN
        RAISE EXCEPTION 'Veículo inválido na apólice.';
      END IF;

      IF NOT EXISTS (
        SELECT 1
          FROM public.vehicles
         WHERE id = _vehicle_id
           AND organization_id = _org
      ) THEN
        RAISE EXCEPTION 'Veículo não pertence ao órgão atual.';
      END IF;

      INSERT INTO public.insurance_vehicles (
        organization_id,
        policy_id,
        vehicle_id,
        created_by
      )
      VALUES (
        _org,
        _saved_id,
        _vehicle_id,
        auth.uid()
      );
    END LOOP;
  END IF;

  RETURN _saved_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.insurance_policy_save_atomic(
  uuid,
  text,
  text,
  uuid,
  uuid,
  date,
  date,
  numeric,
  numeric,
  text,
  text,
  text,
  public.insurance_status,
  text,
  uuid,
  jsonb
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.insurance_policy_save_atomic(
  uuid,
  text,
  text,
  uuid,
  uuid,
  date,
  date,
  numeric,
  numeric,
  text,
  text,
  text,
  public.insurance_status,
  text,
  uuid,
  jsonb
)
TO authenticated, service_role;