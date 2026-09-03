-- consolida duplicados existentes
DELETE FROM public.units u USING public.units d
WHERE u.organization_id = d.organization_id AND lower(u.name) = lower(d.name) AND u.id > d.id;

CREATE UNIQUE INDEX IF NOT EXISTS units_org_name_key ON public.units (organization_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS units_org_acronym_key ON public.units (organization_id, upper(acronym)) WHERE acronym IS NOT NULL AND acronym <> '';
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_org_cnpj_key ON public.suppliers (organization_id, cnpj) WHERE cnpj IS NOT NULL AND cnpj <> '';
CREATE UNIQUE INDEX IF NOT EXISTS workshops_org_cnpj_key ON public.workshops (organization_id, cnpj) WHERE cnpj IS NOT NULL AND cnpj <> '';
CREATE UNIQUE INDEX IF NOT EXISTS external_entities_org_doc_key ON public.external_entities (organization_id, document) WHERE document IS NOT NULL AND document <> '';

-- índices de desempenho para listas operacionais grandes
CREATE INDEX IF NOT EXISTS fuelings_org_date_idx ON public.fuelings (organization_id, fueled_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_usages_org_date_idx ON public.vehicle_usages (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS maintenance_records_org_date_idx ON public.maintenance_records (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_orders_org_date_idx ON public.service_orders (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS traffic_fines_org_date_idx ON public.traffic_fines (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS vehicles_org_plate_idx ON public.vehicles (organization_id, plate);