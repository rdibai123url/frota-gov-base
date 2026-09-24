-- ============================================================
-- FROTAgov
-- Proteções financeiras das Ordens de Serviço
-- ============================================================

-- O valor aprovado nunca pode ser negativo.
ALTER TABLE public.service_orders
ADD CONSTRAINT service_orders_approved_value_nonnegative
CHECK (
  approved_value >= 0
)
NOT VALID;


-- O valor executado:
-- 1. pode ficar nulo enquanto a OS ainda não foi executada;
-- 2. nunca pode ser negativo;
-- 3. nunca pode ultrapassar o valor aprovado.
ALTER TABLE public.service_orders
ADD CONSTRAINT service_orders_executed_value_guard
CHECK (
  executed_value IS NULL
  OR (
    executed_value >= 0
    AND executed_value <= approved_value
  )
)
NOT VALID;