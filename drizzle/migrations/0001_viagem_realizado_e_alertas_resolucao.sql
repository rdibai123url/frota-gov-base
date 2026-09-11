-- Fase 11 — Bloco 1: vínculo de abastecimento à utilização (fechamento da viagem)
ALTER TABLE public.fuelings
  ADD COLUMN IF NOT EXISTS usage_id uuid REFERENCES public.vehicle_usages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS full_tank boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_fuelings_usage ON public.fuelings(usage_id);

CREATE OR REPLACE FUNCTION public.guard_fueling_usage_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u record;
BEGIN
  IF NEW.usage_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO u FROM public.vehicle_usages WHERE id = NEW.usage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utilização não encontrada.'; END IF;
  IF u.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'A utilização pertence a outro órgão.';
  END IF;
  IF u.vehicle_id <> NEW.vehicle_id THEN
    RAISE EXCEPTION 'O abastecimento é de outro bem; não pode ser vinculado a esta viagem.';
  END IF;
  IF NEW.fueled_at < COALESCE(u.actual_departure, u.planned_departure) - interval '12 hours'
     OR NEW.fueled_at > COALESCE(u.actual_return, u.planned_return, now()) + interval '12 hours' THEN
    RAISE EXCEPTION 'A data do abastecimento está fora do período da viagem.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_fueling_usage_link ON public.fuelings;
CREATE TRIGGER trg_guard_fueling_usage_link
  BEFORE INSERT OR UPDATE OF usage_id ON public.fuelings
  FOR EACH ROW EXECUTE FUNCTION public.guard_fueling_usage_link();

-- Fase 11 — Bloco 2: classificação da resolução dos alertas
ALTER TABLE public.fueling_alerts
  ADD COLUMN IF NOT EXISTS resolution_kind text,
  ADD COLUMN IF NOT EXISTS resolution_reason text;

-- Encerramento manual de alerta orientativo, com auditoria e checagem de perfil.
CREATE OR REPLACE FUNCTION public.dismiss_alert(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid; a record;
BEGIN
  org := public.current_org_id();
  IF org IS NULL THEN RAISE EXCEPTION 'Órgão não identificado.'; END IF;
  IF NOT (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'org_admin')
          OR public.has_role(auth.uid(), 'fleet_manager')) THEN
    RAISE EXCEPTION 'Seu perfil não permite encerrar alertas por decisão do usuário.';
  END IF;
  SELECT * INTO a FROM public.fueling_alerts WHERE id = _id AND organization_id = org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alerta não encontrado neste órgão.'; END IF;
  IF a.status <> 'aberto' THEN RETURN; END IF;

  UPDATE public.fueling_alerts
     SET status = 'resolvido', resolved_at = now(), resolved_by = auth.uid(),
         resolution_kind = 'usuario',
         resolution_reason = NULLIF(left(COALESCE(_reason, ''), 500), ''),
         updated_by = auth.uid()
   WHERE id = _id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.dismiss_alert(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.dismiss_alert(uuid, text) TO authenticated, service_role;

-- Fecha automaticamente as inconsistências corretivas cuja condição de origem já não existe.
CREATE OR REPLACE FUNCTION public.resolve_stale_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid; n integer := 0; c integer;
BEGIN
  org := public.current_org_id();
  IF org IS NULL THEN RETURN 0; END IF;

  -- contratos: execução voltou abaixo da faixa, ou contrato deixou de estar vigente
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type IN ('contrato_80','contrato_90','contrato_esgotado')
     AND NOT EXISTS (
       SELECT 1 FROM public.contracts c
         LEFT JOIN public.contract_items i ON i.contract_id=c.id
        WHERE c.id=a.entity_id AND c.status='vigente'
        GROUP BY c.id
       HAVING COALESCE(SUM(i.total_value),0) > 0
          AND COALESCE(SUM(i.consumed_value),0)/COALESCE(SUM(i.total_value),1)*100 >=
              CASE a.alert_type WHEN 'contrato_esgotado' THEN 100 WHEN 'contrato_90' THEN 90 ELSE 80 END);
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type IN ('contrato_vence_60','contrato_vence_30','contrato_vence_15','contrato_vence_7','contrato_vencido')
     AND NOT EXISTS (
       SELECT 1 FROM public.contracts c
        WHERE c.id=a.entity_id AND c.status='vigente' AND c.valid_to IS NOT NULL
          AND (c.valid_to - current_date) <=
              CASE a.alert_type WHEN 'contrato_vencido' THEN -1 WHEN 'contrato_vence_7' THEN 7
                                WHEN 'contrato_vence_15' THEN 15 WHEN 'contrato_vence_30' THEN 30 ELSE 60 END);
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  -- empenhos
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type IN ('empenho_saldo_20','empenho_saldo_10','empenho_zerado')
     AND NOT EXISTS (
       SELECT 1 FROM public.commitments m
        WHERE m.id=a.entity_id AND m.status='ativo'
          AND (m.committed_value - m.cancelled_value) > 0
          AND round(m.available_value/(m.committed_value-m.cancelled_value)*100,1) <=
              CASE a.alert_type WHEN 'empenho_zerado' THEN 0 WHEN 'empenho_saldo_10' THEN 10 ELSE 20 END);
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  -- cotas
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type IN ('cota_saldo_20','cota_saldo_10','cota_zerada')
     AND NOT EXISTS (
       SELECT 1 FROM public.quotas q
        WHERE q.id=a.entity_id AND q.active AND q.granted_amount > 0
          AND round(q.balance_amount/q.granted_amount*100,1) <=
              CASE a.alert_type WHEN 'cota_zerada' THEN 0 WHEN 'cota_saldo_10' THEN 10 ELSE 20 END);
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  -- obrigações legais
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type IN ('obrigacao_a_vencer','obrigacao_vencida')
     AND NOT EXISTS (SELECT 1 FROM public.vehicle_obligations o
                      WHERE o.id=a.entity_id AND o.status IN ('pendente','vencida'));
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  -- seguros
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type IN ('seguro_a_vencer','seguro_vencido')
     AND NOT EXISTS (SELECT 1 FROM public.insurance_policies p
                      WHERE p.id=a.entity_id AND p.status IN ('ativa','a_vencer','vencida')
                        AND p.valid_to >= current_date - 1);
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  -- multas
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type IN ('multa_a_vencer','multa_vencida')
     AND NOT EXISTS (SELECT 1 FROM public.traffic_fines f
                      WHERE f.id=a.entity_id AND f.status NOT IN ('paga','cancelada','deferida'));
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  -- sinistros
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type = 'sinistro_em_aberto'
     AND NOT EXISTS (SELECT 1 FROM public.accidents s WHERE s.id=a.entity_id AND s.status <> 'encerrado');
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  -- ordens de serviço atrasadas
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type = 'os_atrasada'
     AND NOT EXISTS (SELECT 1 FROM public.service_orders o
                      WHERE o.id=a.entity_id AND o.status NOT IN ('concluida','cancelada'));
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  -- planos preventivos regularizados
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type IN ('manutencao_vencido','manutencao_proximo')
     AND NOT EXISTS (SELECT 1 FROM public.maintenance_plans p
                      WHERE p.id=a.entity_id AND p.active
                        AND p.next_due_date IS NOT NULL
                        AND (p.next_due_date - current_date) <=
                            CASE a.alert_type WHEN 'manutencao_vencido' THEN -1 ELSE 30 END);
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  -- cotações: prazo/propostas
  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type IN ('cotacao_prazo_proximo','cotacao_prazo_vencido','cotacao_insuficiente')
     AND NOT EXISTS (SELECT 1 FROM public.quotations q
                      WHERE q.id=a.entity_id AND q.status IN ('aberta','em_analise'));
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  UPDATE public.fueling_alerts a SET status='resolvido', resolved_at=now(), resolution_kind='correcao'
   WHERE a.organization_id=org AND a.status='aberto'
     AND a.alert_type = 'cotacao_insuficiente'
     AND EXISTS (SELECT 1 FROM public.quotations q
                  WHERE q.id=a.entity_id
                    AND ((SELECT count(*) FROM public.quotation_proposals p
                           WHERE p.quotation_id=q.id AND p.status <> 'desclassificada') >= 3));
  GET DIAGNOSTICS c = ROW_COUNT; n := n + c;

  UPDATE public.fueling_alerts SET resolved_by = COALESCE(resolved_by, auth.uid()), updated_by = auth.uid()
   WHERE organization_id = org AND status = 'resolvido' AND resolution_kind = 'correcao' AND resolved_by IS NULL;

  RETURN n;
END; $$;
REVOKE EXECUTE ON FUNCTION public.resolve_stale_alerts() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.resolve_stale_alerts() TO authenticated, service_role;