CREATE OR REPLACE FUNCTION public.fg_norm(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(translate(coalesce(_t, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'));
$$;

CREATE OR REPLACE FUNCTION public.search_item_history(_q text, _limit integer DEFAULT 10)
RETURNS TABLE (
  description text,
  measure_unit text,
  uses bigint,
  last_used timestamptz,
  sources text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid := public.current_org_id();
  _tokens text[];
BEGIN
  IF _org IS NULL THEN RETURN; END IF;
  IF _q IS NULL OR length(btrim(_q)) < 2 THEN RETURN; END IF;

  _tokens := regexp_split_to_array(btrim(public.fg_norm(_q)), '\s+');
  _limit := least(greatest(coalesce(_limit, 10), 1), 25);

  RETURN QUERY
  WITH raw AS (
    SELECT qi.description AS d, qi.measure_unit AS u, qi.created_at AS c, 'Cotações'::text AS s
      FROM public.quotation_items qi WHERE qi.organization_id = _org
    UNION ALL
    SELECT pi.description, NULL, pi.created_at, 'Propostas'
      FROM public.quotation_proposal_items pi WHERE pi.organization_id = _org
    UNION ALL
    SELECT pc.description, pc.measure_unit, pc.created_at, 'Catálogo de peças'
      FROM public.parts_catalog pc WHERE pc.organization_id = _org
    UNION ALL
    SELECT soi.description, NULL, soi.created_at, 'Ordens de serviço'
      FROM public.service_order_items soi WHERE soi.organization_id = _org
    UNION ALL
    SELECT mp.description, NULL, mp.created_at, 'Manutenções'
      FROM public.maintenance_parts mp WHERE mp.organization_id = _org
    UNION ALL
    SELECT ci.description, ci.measure_unit, ci.created_at, 'Contratos'
      FROM public.contract_items ci WHERE ci.organization_id = _org
    UNION ALL
    SELECT soi2.description, soi2.measure_unit, soi2.created_at, 'Fornecimento'
      FROM public.supply_order_items soi2 WHERE soi2.organization_id = _org
  ),
  cleaned AS (
    SELECT btrim(regexp_replace(r.d, '\s+', ' ', 'g')) AS d,
           nullif(btrim(r.u), '') AS u,
           r.c, r.s
      FROM raw r
     WHERE r.d IS NOT NULL AND length(btrim(r.d)) >= 2
  ),
  matched AS (
    SELECT cl.*, public.fg_norm(cl.d) AS nd FROM cleaned cl
  ),
  filtered AS (
    SELECT m.* FROM matched m
     WHERE NOT EXISTS (
       SELECT 1 FROM unnest(_tokens) tk
        WHERE tk <> '' AND position(tk IN m.nd) = 0
     )
  )
  SELECT
    (array_agg(f.d ORDER BY f.c DESC))[1] AS description,
    (array_agg(f.u ORDER BY (f.u IS NULL), f.c DESC))[1] AS measure_unit,
    count(*)::bigint AS uses,
    max(f.c) AS last_used,
    (SELECT array_agg(DISTINCT x.s) FROM unnest(array_agg(f.s)) x(s)) AS sources
  FROM filtered f
  GROUP BY f.nd
  ORDER BY count(*) DESC, max(f.c) DESC
  LIMIT _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_item_history(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_item_history(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fg_norm(text) TO authenticated, anon, service_role;