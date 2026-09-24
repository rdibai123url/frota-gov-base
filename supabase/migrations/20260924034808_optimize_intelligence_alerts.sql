-- ============================================================
-- FrotaGov
-- Otimização das rotinas de alertas e inteligência
-- ============================================================

-- Acelera as várias verificações:
-- organization_id + status aberto + entity_type + entity_id + alert_type
CREATE INDEX IF NOT EXISTS idx_fueling_alerts_open_entity
ON public.fueling_alerts (
  organization_id,
  entity_type,
  entity_id,
  alert_type
)
WHERE status = 'aberto';


-- Acelera a busca do parâmetro aplicável durante
-- refresh_intelligence_alerts()
CREATE INDEX IF NOT EXISTS idx_consumption_parameters_org_metric_active
ON public.consumption_parameters (
  organization_id,
  metric,
  vehicle_id,
  asset_class,
  category,
  brand,
  model
)
WHERE active = true;


-- Ajuda consultas periódicas dos alertas de inteligência
CREATE INDEX IF NOT EXISTS idx_fueling_alerts_period
ON public.fueling_alerts (
  organization_id,
  period_key,
  alert_type
)
WHERE period_key IS NOT NULL;