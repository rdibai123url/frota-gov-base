-- Bloco 1 — Máquinas e equipamentos
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS asset_class text NOT NULL DEFAULT 'veiculo',
  ADD COLUMN IF NOT EXISTS equipment_type text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS engine_number text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS meter_kind text NOT NULL DEFAULT 'hodometro',
  ADD COLUMN IF NOT EXISTS power_hp numeric,
  ADD COLUMN IF NOT EXISTS capacity_desc text,
  ADD COLUMN IF NOT EXISTS ownership text NOT NULL DEFAULT 'proprio',
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acquisition_date date,
  ADD COLUMN IF NOT EXISTS acquisition_value numeric,
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS document_path text;

ALTER TABLE public.vehicles ALTER COLUMN plate DROP NOT NULL;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_asset_class_chk;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_asset_class_chk
  CHECK (asset_class IN ('veiculo','equipamento'));
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_meter_kind_chk;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_meter_kind_chk
  CHECK (meter_kind IN ('hodometro','horimetro','ambos','nenhum'));
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_ownership_chk;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_ownership_chk
  CHECK (ownership IN ('proprio','locado','cedido','emprestado','doado','fiel_depositario','baixado','alienado','leiloado','perdido_furtado','comodato','outro'));

CREATE INDEX IF NOT EXISTS vehicles_asset_class_idx ON public.vehicles (organization_id, asset_class);

CREATE OR REPLACE FUNCTION public.guard_vehicle_identification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.asset_class = 'veiculo' AND coalesce(btrim(NEW.plate), '') = '' THEN
    RAISE EXCEPTION 'Informe a placa do veículo.';
  END IF;
  IF NEW.asset_class = 'equipamento'
     AND coalesce(btrim(NEW.asset_code), '') = ''
     AND coalesce(btrim(NEW.plate), '') = '' THEN
    RAISE EXCEPTION 'Informe o patrimônio ou a identificação interna da máquina/equipamento.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_identification ON public.vehicles;
CREATE TRIGGER trg_vehicles_identification
BEFORE INSERT OR UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_identification();

-- Tipos de máquinas/equipamentos por órgão (extensível)
CREATE TABLE IF NOT EXISTS public.equipment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  default_meter_kind text NOT NULL DEFAULT 'horimetro',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT equipment_types_meter_chk CHECK (default_meter_kind IN ('hodometro','horimetro','ambos','nenhum')),
  CONSTRAINT equipment_types_org_name_key UNIQUE (organization_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_types TO authenticated;
GRANT ALL ON public.equipment_types TO service_role;

ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_types_select" ON public.equipment_types;
CREATE POLICY "equipment_types_select" ON public.equipment_types
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id());

DROP POLICY IF EXISTS "equipment_types_insert" ON public.equipment_types;
CREATE POLICY "equipment_types_insert" ON public.equipment_types
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());

DROP POLICY IF EXISTS "equipment_types_update" ON public.equipment_types;
CREATE POLICY "equipment_types_update" ON public.equipment_types
  FOR UPDATE TO authenticated
  USING (organization_id = current_org_id() AND can_manage_fleet())
  WITH CHECK (organization_id = current_org_id() AND can_manage_fleet());

DROP TRIGGER IF EXISTS trg_equipment_types_touch ON public.equipment_types;
CREATE TRIGGER trg_equipment_types_touch
BEFORE UPDATE ON public.equipment_types
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.equipment_types (organization_id, name, default_meter_kind)
SELECT o.id, t.name, t.meter
FROM public.organizations o
CROSS JOIN (VALUES
  ('Máquina pesada','horimetro'),
  ('Trator','horimetro'),
  ('Retroescavadeira','horimetro'),
  ('Motoniveladora','horimetro'),
  ('Pá carregadeira','horimetro'),
  ('Rolo compactador','horimetro'),
  ('Escavadeira hidráulica','horimetro'),
  ('Gerador','horimetro'),
  ('Equipamento motorizado','horimetro'),
  ('Equipamento acoplado','nenhum'),
  ('Implemento agrícola','nenhum'),
  ('Rebocável / carreta','nenhum'),
  ('Roçadeira','horimetro'),
  ('Motobomba','horimetro')
) AS t(name, meter)
ON CONFLICT (organization_id, name) DO NOTHING;