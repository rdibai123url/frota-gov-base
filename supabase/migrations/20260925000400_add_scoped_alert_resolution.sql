-- FrotaGov: revisão de consolidação. Aplicação remota exige autorização.
BEGIN;

ALTER TABLE public.fueling_alerts
  ADD COLUMN resolution_kind text CHECK (resolution_kind IN ('auto','correcao','usuario')),
  ADD COLUMN resolution_reason text CHECK (length(resolution_reason) <= 500),
  ADD CONSTRAINT fueling_alerts_user_reason_check CHECK (
    resolution_kind IS DISTINCT FROM 'usuario' OR length(btrim(COALESCE(resolution_reason,''))) >= 5);
REVOKE UPDATE ON public.fueling_alerts FROM authenticated;
DROP POLICY "update alerts in org" ON public.fueling_alerts;
-- A inserção pelo formulário de abastecimento continua permitida, mas não pode forjar resolução/autoria.
CREATE FUNCTION public.guard_alert_resolution()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP <> 'INSERT' OR NEW.organization_id IS DISTINCT FROM public.current_org_id()
       OR NEW.status <> 'aberto' OR NEW.resolution_kind IS NOT NULL OR NEW.resolution_reason IS NOT NULL
       OR NEW.resolved_at IS NOT NULL OR NEW.resolved_by IS NOT NULL THEN
      RAISE EXCEPTION 'Resolução de alertas exige operação autorizada';
    END IF;
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'aberto' AND NEW.status <> 'aberto' THEN
    NEW.resolution_kind := COALESCE(NEW.resolution_kind, 'auto');
    NEW.resolved_at := now();
    NEW.resolved_by := auth.uid();
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_alert_resolution() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_guard_alert_resolution BEFORE INSERT OR UPDATE ON public.fueling_alerts
FOR EACH ROW EXECUTE FUNCTION public.guard_alert_resolution();
CREATE TRIGGER trg_audit_alert_resolution AFTER UPDATE ON public.fueling_alerts
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.write_audit_log();

CREATE FUNCTION public.dismiss_alert(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE org uuid := public.current_org_id(); a public.fueling_alerts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION 'Sem permissão para resolver alertas';
  END IF;
  IF length(btrim(COALESCE(_reason,''))) < 5 OR length(_reason) > 500 THEN
    RAISE EXCEPTION 'Justificativa deve ter entre 5 e 500 caracteres';
  END IF;
  SELECT * INTO a FROM public.fueling_alerts WHERE id = _id AND organization_id = org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alerta não encontrado neste órgão'; END IF;
  -- Espelha alertGuidance; desconhecidos são orientativos, exceto famílias corretivas.
  IF a.alert_type IN ('contrato_esgotado','contrato_vencido','os_atrasada') OR
     a.alert_type ~ '^(empenho_|cota_|manutencao_|obrigacao_|seguro_|multa_|sinistro_|credenciamento_|combustivel_|tanque_|duplic|cnh_)' THEN
    RAISE EXCEPTION 'Alerta corretivo exige correção na origem';
  END IF;
  IF a.status <> 'aberto' THEN RETURN; END IF;
  UPDATE public.fueling_alerts SET status = 'resolvido', resolution_kind = 'usuario',
    resolution_reason = btrim(_reason), resolved_by = auth.uid(), resolved_at = now(), updated_by = auth.uid()
    WHERE id = _id AND organization_id = org AND status = 'aberto';
END; $$;
REVOKE ALL ON FUNCTION public.dismiss_alert(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_alert(uuid,text) TO authenticated;

-- NULL significa causa desconhecida/entidade ausente: nunca presumir correção.
CREATE FUNCTION public.alert_cause_active(a public.fueling_alerts)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE active_cause boolean;
BEGIN
  CASE a.entity_type
  WHEN 'contract' THEN
    SELECT c.status = 'vigente' AND CASE
      WHEN a.alert_type IN ('contrato_80','contrato_90','contrato_esgotado') THEN
        COALESCE((SELECT round(SUM(i.consumed_value)/NULLIF(SUM(i.total_value),0)*100,1)
         FROM public.contract_items i WHERE i.contract_id=c.id AND i.organization_id=a.organization_id),0)
         >= CASE a.alert_type WHEN 'contrato_80' THEN 80 WHEN 'contrato_90' THEN 90 ELSE 100 END
      WHEN a.alert_type = 'contrato_vencido' THEN c.valid_to < current_date
      WHEN a.alert_type IN ('contrato_vence_7','contrato_vence_15','contrato_vence_30','contrato_vence_60') THEN
        c.valid_to-current_date <= CASE a.alert_type WHEN 'contrato_vence_7' THEN 7 WHEN 'contrato_vence_15' THEN 15 WHEN 'contrato_vence_30' THEN 30 ELSE 60 END
      ELSE NULL END INTO active_cause FROM public.contracts c WHERE c.id=a.entity_id AND c.organization_id=a.organization_id;
  WHEN 'commitment' THEN
    IF a.alert_type IN ('empenho_zerado','empenho_saldo_10','empenho_saldo_20') THEN
      SELECT m.status='ativo' AND (m.committed_value-m.cancelled_value)>0 AND
        round(m.available_value/NULLIF(m.committed_value-m.cancelled_value,0)*100,1) <=
          CASE a.alert_type WHEN 'empenho_zerado' THEN 0 WHEN 'empenho_saldo_10' THEN 10 ELSE 20 END
      INTO active_cause FROM public.commitments m WHERE m.id=a.entity_id AND m.organization_id=a.organization_id;
    END IF;
  WHEN 'quota' THEN
    IF a.alert_type IN ('cota_zerada','cota_saldo_10','cota_saldo_20') THEN
      SELECT q.active AND q.granted_amount>0 AND round(q.balance_amount/NULLIF(q.granted_amount,0)*100,1) <=
        CASE a.alert_type WHEN 'cota_zerada' THEN 0 WHEN 'cota_saldo_10' THEN 10 ELSE 20 END
      INTO active_cause FROM public.quotas q WHERE q.id=a.entity_id AND q.organization_id=a.organization_id;
    END IF;
  WHEN 'vehicle_obligation' THEN
    IF a.alert_type IN ('obrigacao_a_vencer','obrigacao_vencida') THEN
      SELECT o.status IN ('pendente','vencida') AND NOT o.not_applicable AND o.due_date IS NOT NULL AND
        CASE WHEN a.alert_type='obrigacao_vencida' THEN o.due_date<current_date ELSE o.due_date<=current_date+30 END
      INTO active_cause FROM public.vehicle_obligations o WHERE o.id=a.entity_id AND o.organization_id=a.organization_id;
    END IF;
  WHEN 'insurance_policy' THEN
    IF a.alert_type IN ('seguro_a_vencer','seguro_vencido') THEN
      SELECT p.status <> 'cancelada' AND CASE WHEN a.alert_type='seguro_vencido' THEN p.valid_to<current_date ELSE p.valid_to<=current_date+60 END
      INTO active_cause FROM public.insurance_policies p WHERE p.id=a.entity_id AND p.organization_id=a.organization_id;
    END IF;
  WHEN 'traffic_fine' THEN
    IF a.alert_type IN ('multa_a_vencer','multa_vencida') THEN
      SELECT f.status IN ('recebida','em_analise','defesa_apresentada','indeferida') AND f.due_date IS NOT NULL AND
        CASE WHEN a.alert_type='multa_vencida' THEN f.due_date<current_date ELSE f.due_date<=current_date+15 END
      INTO active_cause FROM public.traffic_fines f WHERE f.id=a.entity_id AND f.organization_id=a.organization_id;
    END IF;
  WHEN 'accident' THEN
    IF a.alert_type='sinistro_em_aberto' THEN
      SELECT s.status <> 'encerrado' AND s.occurred_at < now()-interval '30 days' INTO active_cause
      FROM public.accidents s WHERE s.id=a.entity_id AND s.organization_id=a.organization_id;
    END IF;
  WHEN 'service_order' THEN
    IF a.alert_type='os_atrasada' THEN
      SELECT o.status NOT IN ('concluida','cancelada') AND o.deadline_at IS NOT NULL AND o.deadline_at<current_date
      INTO active_cause FROM public.service_orders o WHERE o.id=a.entity_id AND o.organization_id=a.organization_id;
    END IF;
  WHEN 'quotation' THEN
    IF a.alert_type IN ('cotacao_insuficiente','cotacao_prazo_vencido','cotacao_prazo_proximo') THEN
      SELECT q.status IN ('aberta','em_analise') AND CASE a.alert_type
        WHEN 'cotacao_insuficiente' THEN q.valid_proposals_count<3
        WHEN 'cotacao_prazo_vencido' THEN q.deadline_at IS NOT NULL AND q.deadline_at<now()
        ELSE q.deadline_at IS NOT NULL AND q.deadline_at<now()+interval '48 hours' END
      INTO active_cause FROM public.quotations q WHERE q.id=a.entity_id AND q.organization_id=a.organization_id;
    END IF;
  ELSE NULL; -- Manutenção é resolvida pelo cálculo vigente km/horas/meses em refresh_maintenance_alerts.
  END CASE;
  RETURN active_cause;
END; $$;
REVOKE ALL ON FUNCTION public.alert_cause_active(public.fueling_alerts) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.resolve_stale_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE org uuid := public.current_org_id(); n integer;
BEGIN
  IF auth.uid() IS NULL OR org IS NULL OR NOT public.can_operate_usage() THEN
    RAISE EXCEPTION 'Sem permissão para atualizar alertas';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('alerts:'||org::text,0));
  UPDATE public.fueling_alerts a SET status='resolvido', resolution_kind='correcao',
    resolved_at=now(), resolved_by=auth.uid(), updated_by=auth.uid()
  WHERE a.organization_id=org AND a.status='aberto' AND public.alert_cause_active(a) IS FALSE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_stale_alerts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_stale_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_maintenance_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE _scope uuid := public.current_org_id(); r record; st text; msg text; sev public.alert_severity; cfg record;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF _scope IS NULL OR NOT public.can_operate_usage() THEN RAISE EXCEPTION 'Órgão/permissão inválidos'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('alerts:'||_scope::text,0));
  ELSIF session_user <> 'postgres' OR COALESCE(current_setting('role',true),'none') <> 'none' THEN
    RAISE EXCEPTION 'Execução global reservada ao agendador interno';
  END IF;
  FOR cfg IN SELECT o.id AS org,
                    COALESCE(s.lead_km, 500) AS lead_km,
                    COALESCE(s.lead_hours, 20) AS lead_hours,
                    COALESCE(s.lead_days, 15) AS lead_days,
                    COALESCE(s.warranty_lead_days, 30) AS wlead
               FROM public.organizations o
               LEFT JOIN public.maintenance_settings s ON s.organization_id = o.id WHERE (_scope IS NULL OR o.id=_scope) LOOP

    FOR r IN
      SELECT p.id AS plan_id, p.name, p.organization_id, v.id AS vehicle_id, v.plate,
             p.interval_km, p.interval_hours, p.interval_months,
             p.tolerance_km, p.tolerance_hours, p.tolerance_days,
             COALESCE(p.last_done_km, 0) AS base_km,
             COALESCE(p.last_done_hours, 0) AS base_h,
             COALESCE(p.last_done_at, p.created_at::date) AS base_date,
             COALESCE(v.current_km, 0) AS km, COALESCE(v.hour_meter, 0) AS hm
        FROM public.maintenance_plans p
        JOIN public.vehicles v
          ON v.organization_id = p.organization_id
         AND (p.vehicle_id IS NULL OR v.id = p.vehicle_id)
         AND (p.vehicle_type IS NULL OR v.vehicle_type = p.vehicle_type)
       WHERE p.active AND p.organization_id = cfg.org AND v.status <> 'baixado'
    LOOP
      st := 'ok';
      IF r.interval_km IS NOT NULL AND r.interval_km > 0 THEN
        IF r.km >= r.base_km + r.interval_km + COALESCE(r.tolerance_km,0) THEN st := 'vencido';
        ELSIF st <> 'vencido' AND r.km >= r.base_km + r.interval_km - cfg.lead_km THEN st := 'proximo'; END IF;
      END IF;
      IF r.interval_hours IS NOT NULL AND r.interval_hours > 0 THEN
        IF r.hm >= r.base_h + r.interval_hours + COALESCE(r.tolerance_hours,0) THEN st := 'vencido';
        ELSIF st <> 'vencido' AND r.hm >= r.base_h + r.interval_hours - cfg.lead_hours THEN st := 'proximo'; END IF;
      END IF;
      IF r.interval_months IS NOT NULL AND r.interval_months > 0 THEN
        IF current_date >= (r.base_date + (r.interval_months || ' months')::interval)::date + COALESCE(r.tolerance_days,0) THEN st := 'vencido';
        ELSIF st <> 'vencido' AND current_date >= (r.base_date + (r.interval_months || ' months')::interval)::date - cfg.lead_days THEN st := 'proximo'; END IF;
      END IF;

      IF st <> 'ok' THEN
        msg := CASE WHEN st = 'vencido'
                    THEN 'Manutenção preventiva vencida: ' || r.name || ' — veículo ' || r.plate
                    ELSE 'Manutenção preventiva próxima do vencimento: ' || r.name || ' — veículo ' || r.plate END;
        sev := CASE WHEN st = 'vencido' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END;
        IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a
                        WHERE a.organization_id = r.organization_id AND a.status = 'aberto'
                          AND a.entity_type = 'maintenance_plan' AND a.entity_id = r.plan_id
                          AND a.vehicle_id = r.vehicle_id
                          AND a.alert_type = ('manutencao_' || st)) THEN
          INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
          VALUES (r.organization_id, r.vehicle_id, 'manutencao_' || st, sev, msg, 'manutencao', 'maintenance_plan', r.plan_id, 'aberto');
        END IF;
      ELSE
        UPDATE public.fueling_alerts SET status = 'resolvido', resolution_kind = 'correcao', resolved_at = now(), resolved_by = auth.uid(), updated_by = auth.uid()
         WHERE organization_id = r.organization_id AND status = 'aberto'
           AND entity_type = 'maintenance_plan' AND entity_id = r.plan_id AND vehicle_id = r.vehicle_id;
      END IF;
    END LOOP;

    -- garantias a vencer (peças, serviços e pneus)
    FOR r IN
      SELECT 'maintenance_part' AS et, p.id, p.organization_id, p.vehicle_id, p.warranty_until, p.description AS nome
        FROM public.maintenance_parts p
       WHERE p.organization_id = cfg.org AND p.warranty_until IS NOT NULL
         AND p.warranty_until BETWEEN current_date AND current_date + cfg.wlead
      UNION ALL
      SELECT 'maintenance_record', m.id, m.organization_id, m.vehicle_id, m.warranty_until, 'Serviço ' || COALESCE(m.code,'')
        FROM public.maintenance_records m
       WHERE m.organization_id = cfg.org AND m.status = 'concluida' AND m.warranty_until IS NOT NULL
         AND m.warranty_until BETWEEN current_date AND current_date + cfg.wlead
      UNION ALL
      SELECT 'tire', t.id, t.organization_id, t.vehicle_id, t.warranty_until, 'Pneu ' || t.code
        FROM public.tires t
       WHERE t.organization_id = cfg.org AND t.warranty_until IS NOT NULL
         AND t.warranty_until BETWEEN current_date AND current_date + cfg.wlead
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a
                      WHERE a.organization_id = r.organization_id AND a.status = 'aberto'
                        AND a.entity_type = r.et AND a.entity_id = r.id AND a.alert_type = 'garantia_a_vencer') THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, 'garantia_a_vencer', 'alerta', 'Garantia a vencer em ' || to_char(r.warranty_until,'DD/MM/YYYY') || ': ' || r.nome,
                'manutencao', r.et, r.id, 'aberto');
      END IF;
    END LOOP;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_maintenance_alerts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_maintenance_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_procurement_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE _scope uuid := public.current_org_id(); r record; cfg record;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF _scope IS NULL OR NOT public.can_operate_usage() THEN RAISE EXCEPTION 'Órgão/permissão inválidos'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('alerts:'||_scope::text,0));
  ELSIF session_user <> 'postgres' OR COALESCE(current_setting('role',true),'none') <> 'none' THEN
    RAISE EXCEPTION 'Execução global reservada ao agendador interno';
  END IF;
  FOR cfg IN SELECT o.id AS org, COALESCE(s.warranty_lead_days, 30) AS wlead
               FROM public.organizations o
               LEFT JOIN public.maintenance_settings s ON s.organization_id = o.id WHERE (_scope IS NULL OR o.id=_scope) LOOP

    -- prazo de cotação vencido ou próximo
    FOR r IN SELECT q.id, q.organization_id, q.vehicle_id, q.code, q.deadline_at,
                    CASE WHEN q.deadline_at < now() THEN 'cotacao_prazo_vencido' ELSE 'cotacao_prazo_proximo' END AS tp
               FROM public.quotations q
              WHERE q.organization_id = cfg.org AND q.status IN ('aberta','em_analise')
                AND q.deadline_at IS NOT NULL AND q.deadline_at < now() + interval '48 hours'
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'quotation' AND a.entity_id = r.id AND a.alert_type = r.tp) THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, r.tp,
                CASE WHEN r.tp = 'cotacao_prazo_vencido' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
                CASE WHEN r.tp = 'cotacao_prazo_vencido'
                     THEN 'Prazo de propostas encerrado no processo ' || COALESCE(r.code,'')
                     ELSE 'Prazo de propostas próximo do encerramento no processo ' || COALESCE(r.code,'') END,
                'cotacao', 'quotation', r.id, 'aberto');
      END IF;
    END LOOP;

    -- processos com menos de 3 propostas válidas
    FOR r IN SELECT q.id, q.organization_id, q.vehicle_id, q.code, q.valid_proposals_count
               FROM public.quotations q
              WHERE q.organization_id = cfg.org AND q.status IN ('aberta','em_analise')
                AND q.valid_proposals_count < 3
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'quotation' AND a.entity_id = r.id
                      AND a.alert_type = 'cotacao_insuficiente') THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, 'cotacao_insuficiente', 'alerta',
                'Processo ' || COALESCE(r.code,'') || ' com apenas ' || r.valid_proposals_count || ' proposta(s) válida(s)',
                'cotacao', 'quotation', r.id, 'aberto');
      END IF;
    END LOOP;

    -- OS atrasada
    FOR r IN SELECT s.id, s.organization_id, s.vehicle_id, s.code, s.deadline_at
               FROM public.service_orders s
              WHERE s.organization_id = cfg.org AND s.status NOT IN ('concluida','cancelada')
                AND s.deadline_at IS NOT NULL AND s.deadline_at < current_date
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'service_order' AND a.entity_id = r.id
                      AND a.alert_type = 'os_atrasada') THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, 'os_atrasada', 'erro',
                'Ordem de serviço ' || COALESCE(r.code,'') || ' com prazo vencido em ' || to_char(r.deadline_at,'DD/MM/YYYY'),
                'ordem_servico', 'service_order', r.id, 'aberto');
      END IF;
    END LOOP;

    -- garantias de itens da OS a vencer
    FOR r IN SELECT i.id, i.organization_id, s.vehicle_id, i.description, i.warranty_until
               FROM public.service_order_items i
               JOIN public.service_orders s ON s.id = i.service_order_id
              WHERE i.organization_id = cfg.org AND i.warranty_until IS NOT NULL
                AND i.warranty_until BETWEEN current_date AND current_date + cfg.wlead
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'service_order_item' AND a.entity_id = r.id
                      AND a.alert_type = 'garantia_a_vencer') THEN
        INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, r.vehicle_id, 'garantia_a_vencer', 'alerta',
                'Garantia a vencer em ' || to_char(r.warranty_until,'DD/MM/YYYY') || ': ' || r.description,
                'ordem_servico', 'service_order_item', r.id, 'aberto');
      END IF;
    END LOOP;

    -- credenciamento de oficina vencendo
    FOR r IN SELECT w.id, w.organization_id, COALESCE(w.trade_name, w.legal_name) AS nome, w.accredited_until
               FROM public.workshops w
              WHERE w.organization_id = cfg.org AND w.status = 'ativo' AND w.accredited_until IS NOT NULL
                AND w.accredited_until <= current_date + 30
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                      AND a.status = 'aberto' AND a.entity_type = 'workshop' AND a.entity_id = r.id
                      AND a.alert_type = 'credenciamento_vencendo') THEN
        INSERT INTO public.fueling_alerts (organization_id, alert_type, severity, message, category, entity_type, entity_id, status)
        VALUES (r.organization_id, 'credenciamento_vencendo',
                CASE WHEN r.accredited_until < current_date THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
                'Credenciamento da oficina ' || r.nome || ' vence em ' || to_char(r.accredited_until,'DD/MM/YYYY'),
                'credenciamento', 'workshop', r.id, 'aberto');
      END IF;
    END LOOP;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_procurement_alerts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_procurement_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_fleet_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE _scope uuid := public.current_org_id(); r record;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF _scope IS NULL OR NOT public.can_operate_usage() THEN RAISE EXCEPTION 'Órgão/permissão inválidos'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('alerts:'||_scope::text,0));
  ELSIF session_user <> 'postgres' OR COALESCE(current_setting('role',true),'none') <> 'none' THEN
    RAISE EXCEPTION 'Execução global reservada ao agendador interno';
  END IF;
  -- multas vencidas / a vencer
  FOR r IN SELECT f.id, f.organization_id, f.vehicle_id, f.code, f.notice_number, f.due_date,
                  CASE WHEN f.due_date < current_date THEN 'multa_vencida' ELSE 'multa_a_vencer' END AS tp
             FROM public.traffic_fines f
            WHERE (_scope IS NULL OR f.organization_id=_scope) AND f.status IN ('recebida','em_analise','defesa_apresentada','indeferida')
              AND f.due_date IS NOT NULL AND f.due_date <= current_date + 15
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='traffic_fine' AND a.entity_id=r.id AND a.alert_type=r.tp) THEN
      INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.vehicle_id, r.tp,
              CASE WHEN r.tp='multa_vencida' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
              'Multa ' || COALESCE(r.code, r.notice_number) || ' com vencimento em ' || to_char(r.due_date,'DD/MM/YYYY'),
              'frota', 'traffic_fine', r.id, 'aberto');
    END IF;
  END LOOP;

  -- obrigações legais
  FOR r IN SELECT ob.id, ob.organization_id, ob.vehicle_id, ob.obligation_type, ob.due_date,
                  CASE WHEN ob.due_date < current_date THEN 'obrigacao_vencida' ELSE 'obrigacao_a_vencer' END AS tp
             FROM public.vehicle_obligations ob
            WHERE (_scope IS NULL OR ob.organization_id=_scope) AND ob.status IN ('pendente','vencida') AND NOT ob.not_applicable
              AND ob.due_date IS NOT NULL AND ob.due_date <= current_date + 30
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='vehicle_obligation' AND a.entity_id=r.id AND a.alert_type=r.tp) THEN
      INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.vehicle_id, r.tp,
              CASE WHEN r.tp='obrigacao_vencida' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
              r.obligation_type || ' com vencimento em ' || to_char(r.due_date,'DD/MM/YYYY'),
              'frota', 'vehicle_obligation', r.id, 'aberto');
    END IF;
  END LOOP;

  -- seguros
  FOR r IN SELECT p.id, p.organization_id, p.policy_number, p.valid_to,
                  CASE WHEN p.valid_to < current_date THEN 'seguro_vencido' ELSE 'seguro_a_vencer' END AS tp
             FROM public.insurance_policies p
            WHERE (_scope IS NULL OR p.organization_id=_scope) AND p.status <> 'cancelada' AND p.valid_to <= current_date + 60
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='insurance_policy' AND a.entity_id=r.id AND a.alert_type=r.tp) THEN
      INSERT INTO public.fueling_alerts (organization_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.tp,
              CASE WHEN r.tp='seguro_vencido' THEN 'erro'::public.alert_severity ELSE 'alerta'::public.alert_severity END,
              'Apólice ' || r.policy_number || ' com vigência até ' || to_char(r.valid_to,'DD/MM/YYYY'),
              'frota', 'insurance_policy', r.id, 'aberto');
    END IF;
  END LOOP;

  -- sinistros em aberto há mais de 30 dias
  FOR r IN SELECT ac.id, ac.organization_id, ac.vehicle_id, ac.code, ac.occurred_at
             FROM public.accidents ac
            WHERE (_scope IS NULL OR ac.organization_id=_scope) AND ac.status <> 'encerrado' AND ac.occurred_at < now() - interval '30 days'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='accident' AND a.entity_id=r.id AND a.alert_type='sinistro_em_aberto') THEN
      INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.vehicle_id, 'sinistro_em_aberto', 'alerta',
              'Sinistro ' || COALESCE(r.code,'') || ' em aberto desde ' || to_char(r.occurred_at,'DD/MM/YYYY'),
              'frota', 'accident', r.id, 'aberto');
    END IF;
  END LOOP;

  -- perda total sem movimentação patrimonial concluída
  FOR r IN SELECT ac.id, ac.organization_id, ac.vehicle_id, ac.code
             FROM public.accidents ac
            WHERE (_scope IS NULL OR ac.organization_id=_scope) AND ac.kind = 'perda_total'
              AND NOT EXISTS (SELECT 1 FROM public.asset_movements m
                               WHERE m.vehicle_id = ac.vehicle_id
                                 AND m.kind IN ('perda_total','alienado','leilao','doacao','desativado'))
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fueling_alerts a WHERE a.organization_id = r.organization_id
                    AND a.status='aberto' AND a.entity_type='accident' AND a.entity_id=r.id AND a.alert_type='perda_total_sem_baixa') THEN
      INSERT INTO public.fueling_alerts (organization_id, vehicle_id, alert_type, severity, message, category, entity_type, entity_id, status)
      VALUES (r.organization_id, r.vehicle_id, 'perda_total_sem_baixa', 'erro',
              'Veículo com perda total (sinistro ' || COALESCE(r.code,'') || ') sem movimentação patrimonial concluída',
              'frota', 'accident', r.id, 'aberto');
    END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_fleet_alerts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_fleet_alerts() TO authenticated;

COMMIT;
