-- ============================ ENUMS ============================
CREATE TYPE public.partner_kind AS ENUM ('abastecimento','manutencao','pecas','pneus','higienizacao');
CREATE TYPE public.partner_status AS ENUM ('ativo','suspenso','inativo');
CREATE TYPE public.partner_user_role AS ENUM ('responsavel','operador');
CREATE TYPE public.partner_user_status AS ENUM ('ativo','bloqueado','inativo');
CREATE TYPE public.asset_card_status AS ENUM ('ativo','invalidado');
CREATE TYPE public.capture_kind AS ENUM ('abastecimento','manutencao','fornecimento');
CREATE TYPE public.capture_status AS ENUM ('registrada','aceita','rejeitada');

-- ======================= CREDENCIADOS ==========================
CREATE TABLE public.accredited_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id),
  workshop_id uuid REFERENCES public.workshops(id),
  legal_name text NOT NULL,
  trade_name text,
  cnpj text,
  kinds public.partner_kind[] NOT NULL DEFAULT '{}',
  status public.partner_status NOT NULL DEFAULT 'ativo',
  address text,
  district text,
  city text,
  state text,
  zip_code text,
  latitude numeric(10,6),
  longitude numeric(10,6),
  coverage_area text,
  phone text,
  email text,
  contact_name text,
  notes text,
  import_batch_id uuid REFERENCES public.import_batches(id),
  legacy_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX ON public.accredited_partners (organization_id, status);
GRANT SELECT, INSERT, UPDATE ON public.accredited_partners TO authenticated;
GRANT ALL ON public.accredited_partners TO service_role;
ALTER TABLE public.accredited_partners ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partner_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.accredited_partners(id) ON DELETE CASCADE,
  user_id uuid,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role public.partner_user_role NOT NULL DEFAULT 'operador',
  status public.partner_user_status NOT NULL DEFAULT 'ativo',
  last_access_at timestamptz,
  blocked_at timestamptz,
  blocked_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (partner_id, email)
);
CREATE INDEX ON public.partner_users (user_id);
GRANT SELECT, INSERT, UPDATE ON public.partner_users TO authenticated;
GRANT ALL ON public.partner_users TO service_role;
ALTER TABLE public.partner_users ENABLE ROW LEVEL SECURITY;

-- ===================== CARTÃO VIRTUAL ==========================
CREATE TABLE public.asset_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  code text NOT NULL,
  qr_token uuid NOT NULL DEFAULT gen_random_uuid(),
  security_code text NOT NULL,
  status public.asset_card_status NOT NULL DEFAULT 'ativo',
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  uses_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (organization_id, code),
  UNIQUE (qr_token)
);
CREATE INDEX ON public.asset_cards (vehicle_id, status);
GRANT SELECT, INSERT, UPDATE ON public.asset_cards TO authenticated;
GRANT ALL ON public.asset_cards TO service_role;
ALTER TABLE public.asset_cards ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.asset_card_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.asset_cards(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.accredited_partners(id),
  used_by uuid,
  purpose text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.asset_card_uses TO authenticated;
GRANT ALL ON public.asset_card_uses TO service_role;
ALTER TABLE public.asset_card_uses ENABLE ROW LEVEL SECURITY;

-- ================ CAPTURAS DO CREDENCIADO ======================
CREATE TABLE public.partner_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.accredited_partners(id),
  kind public.capture_kind NOT NULL,
  status public.capture_status NOT NULL DEFAULT 'registrada',
  vehicle_id uuid REFERENCES public.vehicles(id),
  authorization_id uuid REFERENCES public.fuel_authorizations(id),
  fueling_id uuid REFERENCES public.fuelings(id),
  service_order_id uuid REFERENCES public.service_orders(id),
  authorized_quantity numeric(14,4),
  captured_quantity numeric(14,4),
  authorized_value numeric(14,2),
  captured_value numeric(14,2),
  document_number text,
  attachment_path text,
  response_minutes integer,
  captured_by uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.partner_captures (organization_id, captured_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.partner_captures TO authenticated;
GRANT ALL ON public.partner_captures TO service_role;
ALTER TABLE public.partner_captures ENABLE ROW LEVEL SECURITY;

-- ==================== FUNÇÕES DE ESCOPO ========================
CREATE OR REPLACE FUNCTION public.my_partner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pu.partner_id FROM public.partner_users pu
  WHERE pu.user_id = auth.uid() AND pu.status = 'ativo'
  ORDER BY pu.created_at LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_partner_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.partner_users pu
                 WHERE pu.user_id = auth.uid() AND pu.status = 'ativo');
$$;

CREATE OR REPLACE FUNCTION public.partner_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pu.organization_id FROM public.partner_users pu
  WHERE pu.user_id = auth.uid() AND pu.status = 'ativo'
  ORDER BY pu.created_at LIMIT 1;
$$;

-- ========================== POLÍTICAS ==========================
CREATE POLICY "org le credenciados" ON public.accredited_partners FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR id = my_partner_id());
CREATE POLICY "gestao cria credenciados" ON public.accredited_partners FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());
CREATE POLICY "gestao edita credenciados" ON public.accredited_partners FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_fleet())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "le usuarios credenciado" ON public.partner_users FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR partner_id = my_partner_id());
CREATE POLICY "gestao cria usuarios credenciado" ON public.partner_users FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_users());
CREATE POLICY "gestao edita usuarios credenciado" ON public.partner_users FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_users())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "le cartoes" ON public.asset_cards FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR (is_partner_user() AND organization_id = partner_org_id()));
CREATE POLICY "gestao emite cartoes" ON public.asset_cards FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());
CREATE POLICY "gestao altera cartoes" ON public.asset_cards FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_fleet())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "le uso cartao" ON public.asset_card_uses FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR partner_id = my_partner_id());
CREATE POLICY "registra uso cartao" ON public.asset_card_uses FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() OR (is_partner_user() AND organization_id = partner_org_id()));

CREATE POLICY "le capturas" ON public.partner_captures FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR partner_id = my_partner_id());
CREATE POLICY "credenciado registra captura" ON public.partner_captures FOR INSERT TO authenticated
  WITH CHECK ((partner_id = my_partner_id() AND organization_id = partner_org_id())
              OR (organization_id = current_org_id() AND can_manage_fleet()));
CREATE POLICY "orgao revisa captura" ON public.partner_captures FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_fleet())
  WITH CHECK (organization_id = current_org_id());

-- =================== TRIGGERS DE MANUTENÇÃO ====================
CREATE TRIGGER trg_partners_updated BEFORE UPDATE ON public.accredited_partners
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_partner_users_updated BEFORE UPDATE ON public.partner_users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_asset_cards_updated BEFORE UPDATE ON public.asset_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_partner_captures_updated BEFORE UPDATE ON public.partner_captures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===================== CARTÃO VIRTUAL: API =====================
CREATE OR REPLACE FUNCTION public.asset_card_issue(_vehicle uuid, _notes text DEFAULT NULL)
RETURNS public.asset_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := current_org_id(); v record; c public.asset_cards;
BEGIN
  IF NOT can_manage_fleet() THEN RAISE EXCEPTION 'Sem permissão para emitir cartão virtual'; END IF;
  SELECT * INTO v FROM public.vehicles WHERE id = _vehicle AND organization_id = _org;
  IF v IS NULL THEN RAISE EXCEPTION 'Ativo não encontrado neste órgão'; END IF;
  UPDATE public.asset_cards SET status = 'invalidado', revoked_at = now(),
         revoke_reason = COALESCE(revoke_reason, 'Reemissão do cartão virtual')
   WHERE vehicle_id = _vehicle AND organization_id = _org AND status = 'ativo';
  INSERT INTO public.asset_cards (organization_id, vehicle_id, code, security_code, notes, created_by)
  VALUES (_org, _vehicle,
          next_org_code(_org, 'asset_card', 'CV'),
          upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
          _notes, auth.uid())
  RETURNING * INTO c;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.asset_card_revoke(_card uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_manage_fleet() THEN RAISE EXCEPTION 'Sem permissão para invalidar cartão virtual'; END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'Informe o motivo da invalidação'; END IF;
  UPDATE public.asset_cards SET status = 'invalidado', revoked_at = now(), revoke_reason = _reason,
         updated_by = auth.uid()
   WHERE id = _card AND organization_id = current_org_id() AND status = 'ativo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartão virtual não encontrado ou já invalidado'; END IF;
END $$;

-- Resolve cartão (QR ou placa/patrimônio + código de segurança). Dados mínimos, sem dados pessoais.
CREATE OR REPLACE FUNCTION public.asset_card_resolve(_qr uuid DEFAULT NULL, _identifier text DEFAULT NULL, _security text DEFAULT NULL)
RETURNS TABLE(card_id uuid, organization_id uuid, org_name text, vehicle_id uuid, asset_label text,
              asset_class text, vehicle_status text, fuel_type text, meter_kind text,
              open_authorizations integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid := COALESCE(partner_org_id(), current_org_id());
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'Sessão sem órgão vinculado'; END IF;
  RETURN QUERY
  SELECT c.id, c.organization_id, o.name, v.id,
         COALESCE(v.plate, v.asset_code, 'sem identificação'),
         COALESCE(v.asset_class, 'veiculo'), v.status::text, v.fuel_type,
         COALESCE(v.meter_kind, 'hodometro'),
         (SELECT count(*)::int FROM public.fuel_authorizations a
           WHERE a.vehicle_id = v.id AND a.status IN ('pendente','autorizada','utilizada_parcial')
             AND a.valid_until >= now())
  FROM public.asset_cards c
  JOIN public.vehicles v ON v.id = c.vehicle_id
  JOIN public.organizations o ON o.id = c.organization_id
  WHERE c.organization_id = _org
    AND c.status = 'ativo'
    AND ((_qr IS NOT NULL AND c.qr_token = _qr)
      OR (_identifier IS NOT NULL AND _security IS NOT NULL
          AND upper(btrim(_security)) = c.security_code
          AND (upper(btrim(_identifier)) IN (upper(COALESCE(v.plate,'')), upper(COALESCE(v.asset_code,''))))));
END $$;

-- ============== CAPTURA DE ABASTECIMENTO (POSTO) ===============
CREATE OR REPLACE FUNCTION public.partner_authorizations(_vehicle uuid DEFAULT NULL, _code text DEFAULT NULL)
RETURNS TABLE(id uuid, code text, vehicle_id uuid, asset_label text, unit_name text, fuel_name text,
              max_quantity numeric, max_value numeric, max_unit_price numeric, remaining_quantity numeric,
              valid_from timestamptz, valid_until timestamptz, status text, driver_name text,
              contract_code text, meter_kind text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _partner uuid := my_partner_id(); _org uuid := COALESCE(partner_org_id(), current_org_id()); _sup uuid;
BEGIN
  IF _org IS NULL THEN RAISE EXCEPTION 'Sessão sem órgão vinculado'; END IF;
  SELECT p.supplier_id INTO _sup FROM public.accredited_partners p WHERE p.id = _partner;
  RETURN QUERY
  SELECT a.id, a.code, a.vehicle_id, COALESCE(v.plate, v.asset_code, 'sem identificação'), u.name, ft.name,
         a.max_quantity, a.max_value, a.max_unit_price,
         GREATEST(a.max_quantity - COALESCE(a.consumed_quantity, 0), 0),
         a.valid_from, a.valid_until, a.status::text, d.full_name, ct.number,
         COALESCE(v.meter_kind, 'hodometro')
  FROM public.fuel_authorizations a
  JOIN public.vehicles v ON v.id = a.vehicle_id
  LEFT JOIN public.units u ON u.id = a.unit_id
  LEFT JOIN public.fuel_types ft ON ft.id = a.fuel_type_id
  LEFT JOIN public.drivers d ON d.id = a.driver_id
  LEFT JOIN public.contracts ct ON ct.id = a.contract_id
  WHERE a.organization_id = _org
    AND a.status IN ('pendente','autorizada','utilizada_parcial')
    AND (_partner IS NULL OR _sup IS NULL OR a.supplier_id IS NULL OR a.supplier_id = _sup)
    AND (_vehicle IS NULL OR a.vehicle_id = _vehicle)
    AND (_code IS NULL OR upper(a.code) = upper(btrim(_code)))
  ORDER BY a.valid_until;
END $$;

CREATE OR REPLACE FUNCTION public.partner_capture_fueling(
  _authorization uuid, _quantity numeric, _unit_price numeric,
  _odometer numeric DEFAULT NULL, _hour_meter numeric DEFAULT NULL,
  _document text DEFAULT NULL, _attachment text DEFAULT NULL,
  _fueled_at timestamptz DEFAULT NULL, _notes text DEFAULT NULL,
  _ip text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record; _partner uuid := my_partner_id(); _sup uuid; _org uuid;
  _fid uuid; _at timestamptz := COALESCE(_fueled_at, now()); _mk text;
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
                AND upper(COALESCE(f.document_number, '')) = upper(btrim(_document))) THEN
    RAISE EXCEPTION 'Documento fiscal já capturado para esta autorização';
  END IF;

  SELECT COALESCE(meter_kind, 'hodometro') INTO _mk FROM public.vehicles WHERE id = a.vehicle_id;
  IF _mk IN ('hodometro','ambos') AND _odometer IS NULL THEN
    RAISE EXCEPTION 'Informe o hodômetro do veículo';
  END IF;
  IF _mk = 'horimetro' AND _hour_meter IS NULL THEN
    RAISE EXCEPTION 'Informe o horímetro do equipamento';
  END IF;

  INSERT INTO public.fuelings (
    organization_id, vehicle_id, unit_id, supplier_id, fuel_type_id, driver_id, authorization_id,
    fueled_at, odometer_km, hour_meter, quantity, unit_price, status, expense_origin,
    cost_center_id, contract_id, contract_item_id, commitment_id, quota_id,
    document_kind, document_number, attachment_path, notes, created_by
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
END $$;

-- ============ CAPTURA DE MANUTENÇÃO/SERVIÇOS (OFICINA) =========
CREATE OR REPLACE FUNCTION public.partner_capture_service(
  _service_order uuid, _started_at timestamptz DEFAULT NULL, _finished_at timestamptz DEFAULT NULL,
  _executed_value numeric DEFAULT NULL, _odometer numeric DEFAULT NULL, _hour_meter numeric DEFAULT NULL,
  _document text DEFAULT NULL, _attachment text DEFAULT NULL, _notes text DEFAULT NULL,
  _finish boolean DEFAULT false, _ip text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE so record; _partner uuid := my_partner_id(); _ws uuid;
BEGIN
  IF _partner IS NULL AND NOT can_manage_maintenance() THEN
    RAISE EXCEPTION 'Captura permitida apenas para credenciados habilitados ou gestores de manutenção';
  END IF;
  SELECT * INTO so FROM public.service_orders WHERE id = _service_order FOR UPDATE;
  IF so IS NULL THEN RAISE EXCEPTION 'Ordem de serviço não encontrada'; END IF;
  IF so.status IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'Ordem de serviço % não está em execução (%).', so.code, so.status;
  END IF;

  IF _partner IS NOT NULL THEN
    SELECT p.workshop_id INTO _ws FROM public.accredited_partners p
      WHERE p.id = _partner AND p.organization_id = so.organization_id AND p.status = 'ativo'
        AND 'manutencao' = ANY (p.kinds);
    IF NOT FOUND THEN RAISE EXCEPTION 'Credenciado não habilitado para manutenção neste órgão'; END IF;
    IF so.workshop_id IS NOT NULL AND _ws IS NOT NULL AND so.workshop_id <> _ws THEN
      RAISE EXCEPTION 'Ordem de serviço emitida para outra oficina';
    END IF;
  END IF;

  IF _executed_value IS NOT NULL AND so.approved_value IS NOT NULL
     AND _executed_value > so.approved_value + 0.01 THEN
    RAISE EXCEPTION 'Valor executado (%) acima do autorizado (%).', _executed_value, so.approved_value;
  END IF;

  UPDATE public.service_orders SET
    started_at = COALESCE(_started_at, started_at, now()),
    finished_at = CASE WHEN _finish THEN COALESCE(_finished_at, now()) ELSE finished_at END,
    executed_value = COALESCE(_executed_value, executed_value),
    odometer_km = COALESCE(_odometer, odometer_km),
    hour_meter = COALESCE(_hour_meter, hour_meter),
    attachment_path = COALESCE(_attachment, attachment_path),
    notes = COALESCE(_notes, notes),
    status = CASE WHEN _finish THEN 'concluida'::service_order_status ELSE 'em_execucao'::service_order_status END,
    updated_at = now(), updated_by = auth.uid()
  WHERE id = so.id;

  INSERT INTO public.partner_captures (
    organization_id, partner_id, kind, vehicle_id, service_order_id,
    authorized_value, captured_value, document_number, attachment_path,
    captured_by, ip, user_agent, notes
  ) VALUES (
    so.organization_id, _partner, 'manutencao', so.vehicle_id, so.id,
    so.approved_value, _executed_value, _document, _attachment,
    auth.uid(), _ip, _user_agent, _notes
  );

  RETURN so.id;
END $$;

REVOKE ALL ON FUNCTION public.asset_card_issue(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.asset_card_revoke(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.asset_card_issue(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.asset_card_revoke(uuid, text) TO authenticated;