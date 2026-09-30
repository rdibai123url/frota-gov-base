-- Assinatura e aprovação eletrônica de documentos (autorização de abastecimento, ordem de
-- serviço, atesto/ocorrência do contrato e fatura). A assinatura só é gravada pelo servidor,
-- depois de o usuário confirmar a própria senha, e guarda o "resumo" (hash) do documento no
-- momento em que foi assinado. Se o documento mudar depois, o sistema percebe.

CREATE TABLE public.electronic_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN
    ('autorizacao_abastecimento', 'ordem_servico', 'contrato_ocorrencia', 'fatura')),
  doc_id uuid NOT NULL,
  doc_label text NOT NULL,
  doc_hash text NOT NULL CHECK (doc_hash ~ '^[0-9a-f]{64}$'),
  signer_id uuid NOT NULL,
  signer_name text NOT NULL,
  signer_role text,
  statement text NOT NULL DEFAULT 'Li e aprovo o documento.',
  verification_code text NOT NULL UNIQUE,
  ip_address text,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_type, doc_id, signer_id)
);
CREATE INDEX electronic_signatures_doc_idx ON public.electronic_signatures (doc_type, doc_id);
CREATE INDEX electronic_signatures_org_idx ON public.electronic_signatures (organization_id, signed_at DESC);

-- Uma assinatura registrada nunca é editada nem apagada.
CREATE OR REPLACE FUNCTION public.electronic_signatures_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Assinaturas eletrônicas não podem ser alteradas nem apagadas';
END $$;
REVOKE ALL ON FUNCTION public.electronic_signatures_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER electronic_signatures_no_change BEFORE UPDATE OR DELETE ON public.electronic_signatures
  FOR EACH ROW EXECUTE FUNCTION public.electronic_signatures_immutable();

ALTER TABLE public.electronic_signatures ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.electronic_signatures TO authenticated;
GRANT ALL ON public.electronic_signatures TO service_role;
CREATE POLICY "read electronic_signatures" ON public.electronic_signatures FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_super_admin(auth.uid()));

-- Conferência pública: quem recebe o documento digita o código e vê quem assinou e quando.
CREATE OR REPLACE FUNCTION public.verify_signature(_code text)
RETURNS TABLE (doc_type text, doc_label text, signer_name text, signer_role text,
               signed_at timestamptz, doc_hash text, organization_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.doc_type, s.doc_label, s.signer_name, s.signer_role, s.signed_at, s.doc_hash,
         COALESCE(o.short_name, o.legal_name)
    FROM public.electronic_signatures s
    JOIN public.organizations o ON o.id = s.organization_id
   WHERE s.verification_code = upper(trim(_code))
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_signature(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_signature(text) TO anon, authenticated, service_role;
