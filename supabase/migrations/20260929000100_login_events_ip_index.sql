-- Apoia o limite de gravações por IP em auth_login_events (rota pública de auditoria de login).
CREATE INDEX IF NOT EXISTS auth_login_events_ip_created_idx
  ON public.auth_login_events (ip_address, created_at DESC);
