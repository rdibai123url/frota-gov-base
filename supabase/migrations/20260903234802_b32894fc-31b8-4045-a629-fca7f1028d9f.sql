-- Credenciado vê apenas as OS da própria oficina
CREATE POLICY "credenciado le ordens" ON public.service_orders FOR SELECT TO authenticated
  USING (
    workshop_id IN (
      SELECT ap.workshop_id FROM public.accredited_partners ap
      WHERE ap.id = public.my_partner_id() AND ap.workshop_id IS NOT NULL
    )
  );

CREATE POLICY "credenciado le itens ordens" ON public.service_order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      JOIN public.accredited_partners ap ON ap.id = public.my_partner_id()
      WHERE so.id = service_order_id AND so.workshop_id = ap.workshop_id
    )
  );

-- Vincula o usuário logado ao cadastro do credenciado e registra o acesso
CREATE OR REPLACE FUNCTION public.partner_session_touch()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  _email := lower(coalesce(auth.jwt() ->> 'email', ''));

  UPDATE public.partner_users SET user_id = auth.uid(), last_access_at = now()
   WHERE user_id IS NULL AND _email <> '' AND lower(email) = _email AND status = 'ativo';

  UPDATE public.partner_users SET last_access_at = now()
   WHERE user_id = auth.uid() AND status = 'ativo'
  RETURNING id INTO _id;

  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.partner_session_touch() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.partner_session_touch() TO authenticated, service_role;