CREATE OR REPLACE FUNCTION public.export_table_columns(_table text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(c.column_name::text ORDER BY c.ordinal_position), ARRAY[]::text[])
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.table_name = _table;
$$;

REVOKE ALL ON FUNCTION public.export_table_columns(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_table_columns(text) TO authenticated, service_role;