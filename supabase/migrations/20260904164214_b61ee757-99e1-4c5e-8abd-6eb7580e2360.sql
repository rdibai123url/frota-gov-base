REVOKE SELECT ON public.transparency_settings FROM anon;
GRANT SELECT (organization_id, enabled, slug, headline, datasets) ON public.transparency_settings TO anon;