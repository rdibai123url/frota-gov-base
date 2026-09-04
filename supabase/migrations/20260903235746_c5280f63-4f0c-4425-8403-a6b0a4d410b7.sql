CREATE OR REPLACE FUNCTION public.asset_card_resolve(_qr uuid DEFAULT NULL::uuid, _identifier text DEFAULT NULL::text, _security text DEFAULT NULL::text)
 RETURNS TABLE(card_id uuid, organization_id uuid, org_name text, vehicle_id uuid, asset_label text, asset_class text, vehicle_status text, fuel_type text, meter_kind text, open_authorizations integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _org uuid := COALESCE(partner_org_id(), current_org_id());
BEGIN
  IF _org IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.organization_id, COALESCE(o.short_name, o.legal_name), v.id,
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
END $function$;