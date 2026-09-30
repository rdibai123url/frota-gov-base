-- Cor da marca do órgão/empresa: o sistema monta o tema de cores a partir dela.
ALTER TABLE public.organizations
  ADD COLUMN brand_color text,
  ADD CONSTRAINT organizations_brand_color_chk
    CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9a-fA-F]{6}$');
