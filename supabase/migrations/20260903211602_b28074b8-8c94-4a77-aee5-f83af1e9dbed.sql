-- ============ Fase 10 / Bloco D — Backup externo diário ============

CREATE TABLE public.backup_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  hour smallint NOT NULL DEFAULT 5 CHECK (hour BETWEEN 0 AND 23),
  minute smallint NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  include_database boolean NOT NULL DEFAULT true,
  include_storage boolean NOT NULL DEFAULT true,
  retention_daily smallint NOT NULL DEFAULT 7 CHECK (retention_daily BETWEEN 0 AND 60),
  retention_weekly smallint NOT NULL DEFAULT 4 CHECK (retention_weekly BETWEEN 0 AND 52),
  retention_monthly smallint NOT NULL DEFAULT 12 CHECK (retention_monthly BETWEEN 0 AND 120),
  retention_days integer CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 3650),
  destination_kind text NOT NULL DEFAULT 'plataforma'
    CHECK (destination_kind IN ('sftp', 's3', 'plataforma')),
  platform_copy boolean NOT NULL DEFAULT true,
  sftp_host text,
  sftp_port integer DEFAULT 22 CHECK (sftp_port IS NULL OR sftp_port BETWEEN 1 AND 65535),
  sftp_user text,
  sftp_base_path text DEFAULT '/frotagov',
  s3_endpoint text,
  s3_region text,
  s3_bucket text,
  s3_prefix text DEFAULT 'frotagov',
  -- Apenas o NOME do segredo (env/secret manager). Nunca a credencial.
  credentials_secret_name text,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT backup_settings_sftp_required CHECK (
    destination_kind <> 'sftp' OR (sftp_host IS NOT NULL AND sftp_user IS NOT NULL AND credentials_secret_name IS NOT NULL)
  ),
  CONSTRAINT backup_settings_s3_required CHECK (
    destination_kind <> 's3' OR (s3_bucket IS NOT NULL AND credentials_secret_name IS NOT NULL)
  )
);

GRANT SELECT ON public.backup_settings TO authenticated;
GRANT ALL ON public.backup_settings TO service_role;
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_settings_select" ON public.backup_settings
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR organization_id = public.current_org_id());

CREATE POLICY "backup_settings_super_admin_all" ON public.backup_settings
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER touch_backup_settings BEFORE UPDATE ON public.backup_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------ execuções ------------------------------

CREATE TABLE public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cycle_key text NOT NULL,
  kind text NOT NULL DEFAULT 'automatico'
    CHECK (kind IN ('automatico', 'manual', 'teste', 'restauracao')),
  status text NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'em_execucao', 'concluido', 'concluido_com_aviso', 'falhou')),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  included_database boolean NOT NULL DEFAULT true,
  included_storage boolean NOT NULL DEFAULT true,
  total_bytes bigint,
  record_count integer,
  file_count integer,
  destination_kind text,
  destination_path text,
  object_key text,
  checksum text,
  checksum_algo text DEFAULT 'sha256',
  integrity_valid boolean,
  integrity_checked_at timestamptz,
  manifest jsonb,
  tech_log text,
  error_summary text,
  reason text,
  requested_by uuid,
  is_protected boolean NOT NULL DEFAULT false,
  protected_reason text,
  protected_by uuid,
  protected_at timestamptz,
  expires_at timestamptz,
  purged_at timestamptz,
  purge_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, cycle_key)
);

CREATE INDEX backup_runs_org_created_idx ON public.backup_runs (organization_id, created_at DESC);
CREATE INDEX backup_runs_status_idx ON public.backup_runs (status);

GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_runs_select" ON public.backup_runs
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR organization_id = public.current_org_id());

CREATE POLICY "backup_runs_super_admin_write" ON public.backup_runs
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER touch_backup_runs BEFORE UPDATE ON public.backup_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Sem exclusão física de histórico de backup.
CREATE OR REPLACE FUNCTION public.block_backup_run_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'O histórico de backup não pode ser excluído. Use a expiração por retenção.';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.block_backup_run_delete() FROM anon, authenticated;

CREATE TRIGGER backup_runs_no_delete BEFORE DELETE ON public.backup_runs
  FOR EACH ROW EXECUTE FUNCTION public.block_backup_run_delete();

-- ----------------------------- restaurações ----------------------------

CREATE TABLE public.backup_restores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.backup_runs(id),
  safety_run_id uuid REFERENCES public.backup_runs(id),
  status text NOT NULL DEFAULT 'solicitado'
    CHECK (status IN ('solicitado', 'em_execucao', 'concluido', 'falhou', 'cancelado')),
  justification text NOT NULL CHECK (char_length(btrim(justification)) >= 15),
  confirmation_text text NOT NULL,
  requested_by uuid NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  result_summary text,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX backup_restores_org_idx ON public.backup_restores (organization_id, created_at DESC);

GRANT SELECT ON public.backup_restores TO authenticated;
GRANT ALL ON public.backup_restores TO service_role;
ALTER TABLE public.backup_restores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_restores_super_admin" ON public.backup_restores
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER touch_backup_restores BEFORE UPDATE ON public.backup_restores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------- rotinas de apoio ---------------------------

/* Órgãos cujo ciclo de backup do dia já venceu e ainda não foi executado. */
CREATE OR REPLACE FUNCTION public.backup_due_organizations()
RETURNS TABLE (organization_id uuid, cycle_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.organization_id,
         to_char((now() AT TIME ZONE s.timezone)::date, 'YYYY-MM-DD') || 'T'
           || lpad(s.hour::text, 2, '0') || ':' || lpad(s.minute::text, 2, '0') AS cycle_key
  FROM public.backup_settings s
  WHERE s.enabled
    AND (now() AT TIME ZONE s.timezone)::time >= make_time(s.hour, s.minute, 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.backup_runs r
      WHERE r.organization_id = s.organization_id
        AND r.cycle_key = to_char((now() AT TIME ZONE s.timezone)::date, 'YYYY-MM-DD') || 'T'
              || lpad(s.hour::text, 2, '0') || ':' || lpad(s.minute::text, 2, '0')
    );
$$;
REVOKE EXECUTE ON FUNCTION public.backup_due_organizations() FROM anon;

/* Alertas de backup exibidos na tela de Alertas. */
CREATE OR REPLACE FUNCTION public.refresh_backup_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  last_ok timestamptz;
  last_run record;
BEGIN
  FOR s IN SELECT * FROM public.backup_settings WHERE enabled LOOP
    SELECT max(finished_at) INTO last_ok
    FROM public.backup_runs
    WHERE organization_id = s.organization_id
      AND kind IN ('automatico', 'manual')
      AND status IN ('concluido', 'concluido_com_aviso');

    SELECT * INTO last_run
    FROM public.backup_runs
    WHERE organization_id = s.organization_id AND kind IN ('automatico', 'manual')
    ORDER BY created_at DESC LIMIT 1;

    IF last_ok IS NULL OR last_ok < now() - interval '48 hours' THEN
      INSERT INTO public.fueling_alerts (organization_id, alert_type, category, severity, message, entity_type)
      SELECT s.organization_id, 'backup_atrasado', 'backup', 'erro'::alert_severity,
             'Nenhum backup concluído com sucesso nas últimas 48 horas.', 'backup_runs'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.fueling_alerts a
        WHERE a.organization_id = s.organization_id AND a.alert_type = 'backup_atrasado' AND a.status = 'aberto'
      );
    END IF;

    IF last_run.status = 'falhou' THEN
      INSERT INTO public.fueling_alerts (organization_id, alert_type, category, severity, message, entity_type, entity_id)
      SELECT s.organization_id, 'backup_falhou', 'backup', 'erro'::alert_severity,
             'A última execução de backup falhou: ' || coalesce(last_run.error_summary, 'sem detalhe'),
             'backup_runs', last_run.id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.fueling_alerts a
        WHERE a.organization_id = s.organization_id AND a.alert_type = 'backup_falhou'
          AND a.status = 'aberto' AND a.entity_id = last_run.id
      );
    END IF;

    IF last_run.integrity_valid IS FALSE THEN
      INSERT INTO public.fueling_alerts (organization_id, alert_type, category, severity, message, entity_type, entity_id)
      SELECT s.organization_id, 'backup_integridade', 'backup', 'erro'::alert_severity,
             'A validação de integridade do último backup não conferiu.', 'backup_runs', last_run.id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.fueling_alerts a
        WHERE a.organization_id = s.organization_id AND a.alert_type = 'backup_integridade'
          AND a.status = 'aberto' AND a.entity_id = last_run.id
      );
    END IF;

    IF s.last_test_ok IS FALSE THEN
      INSERT INTO public.fueling_alerts (organization_id, alert_type, category, severity, message, entity_type)
      SELECT s.organization_id, 'backup_destino', 'backup', 'alerta'::alert_severity,
             'O último teste de conexão com o destino de backup falhou.', 'backup_settings'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.fueling_alerts a
        WHERE a.organization_id = s.organization_id AND a.alert_type = 'backup_destino' AND a.status = 'aberto'
      );
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_backup_alerts() FROM anon;

/* Expira backups fora da retenção. Nunca apaga o registro nem toca em protegidos. */
CREATE OR REPLACE FUNCTION public.expire_backups()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected integer := 0;
  s record;
  keep integer;
BEGIN
  FOR s IN SELECT * FROM public.backup_settings LOOP
    keep := coalesce(s.retention_days, s.retention_daily + s.retention_weekly * 7 + s.retention_monthly * 30);
    UPDATE public.backup_runs r
      SET purged_at = now(),
          purge_reason = 'Expirado pela política de retenção (' || keep || ' dias).'
    WHERE r.organization_id = s.organization_id
      AND r.purged_at IS NULL
      AND r.is_protected = false
      AND r.status IN ('concluido', 'concluido_com_aviso', 'falhou')
      AND r.created_at < now() - make_interval(days => keep);
    GET DIAGNOSTICS keep = ROW_COUNT;
    affected := affected + keep;
  END LOOP;
  RETURN affected;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_backups() FROM anon;

-- Rotinas diárias no banco (alertas e retenção). O envio externo é feito pelo
-- endpoint /api/public/hooks/backup-diario, chamado pelo agendador.
SELECT cron.schedule('frotagov_backup_alerts', '30 * * * *', $$SELECT public.refresh_backup_alerts();$$);
SELECT cron.schedule('frotagov_backup_retention', '40 4 * * *', $$SELECT public.expire_backups();$$);