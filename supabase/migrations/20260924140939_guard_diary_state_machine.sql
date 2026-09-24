-- ============================================================
-- FrotaGov
-- Bloco 10G - máquina de estados e integridade das diárias
-- ============================================================

-- A interface só permite escrita de WRITE_ROLES. O banco passa a refletir
-- a mesma regra, em vez de permitir que "operator" altere diretamente RD/CD.
DROP POLICY IF EXISTS "insert diaries" ON public.diaries;
CREATE POLICY "insert diaries" ON public.diaries
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.current_org_id()
  AND public.can_write()
);

DROP POLICY IF EXISTS "update diaries" ON public.diaries;
CREATE POLICY "update diaries" ON public.diaries
FOR UPDATE TO authenticated
USING (
  organization_id = public.current_org_id()
  AND public.can_write()
)
WITH CHECK (
  organization_id = public.current_org_id()
  AND public.can_write()
);

DROP POLICY IF EXISTS "insert diary proofs" ON public.diary_proofs;
CREATE POLICY "insert diary proofs" ON public.diary_proofs
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.current_org_id()
  AND public.can_write()
);

DROP POLICY IF EXISTS "update diary proofs" ON public.diary_proofs;
CREATE POLICY "update diary proofs" ON public.diary_proofs
FOR UPDATE TO authenticated
USING (
  organization_id = public.current_org_id()
  AND public.can_write()
)
WITH CHECK (
  organization_id = public.current_org_id()
  AND public.can_write()
);


-- ------------------------------------------------------------
-- Fluxo oficial da Requisição de Diária
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_diary_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed boolean := false;
BEGIN
  -- Criação sempre começa em rascunho ou solicitada.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('rascunho', 'solicitada') THEN
      RAISE EXCEPTION 'Uma nova diária deve iniciar em rascunho ou solicitada.';
    END IF;

    IF NEW.status = 'solicitada' THEN
      NEW.requested_at := COALESCE(NEW.requested_at, now());
    END IF;

    RETURN NEW;
  END IF;

  -- Sem mudança de status: deixa as demais validações seguirem normalmente.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Estados encerrados não podem ser reabertos.
  IF OLD.status IN ('comprovada', 'cancelada') THEN
    RAISE EXCEPTION 'A diária % está encerrada e não pode mudar de situação.', COALESCE(OLD.code, OLD.id::text);
  END IF;

  -- Transições operacionais normais.
  _allowed :=
       (OLD.status = 'rascunho'                AND NEW.status = 'solicitada')
    OR (OLD.status = 'solicitada'              AND NEW.status = 'em_analise')
    OR (OLD.status = 'solicitada'              AND NEW.status = 'autorizada')
    OR (OLD.status = 'em_analise'              AND NEW.status = 'autorizada')
    OR (OLD.status = 'autorizada'              AND NEW.status = 'paga')
    OR (OLD.status = 'paga'                    AND NEW.status = 'viagem_realizada')
    OR (OLD.status = 'viagem_realizada'        AND NEW.status = 'aguardando_comprovacao')
    OR (OLD.status = 'aguardando_comprovacao'  AND NEW.status = 'comprovada')
    OR (OLD.status IN ('solicitada', 'em_analise') AND NEW.status = 'rejeitada')
    -- A interface permite cancelar qualquer registro ainda não comprovado/cancelado.
    OR (NEW.status = 'cancelada'
        AND OLD.status NOT IN ('comprovada', 'cancelada'));

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Transição de diária inválida: % -> %.', OLD.status, NEW.status;
  END IF;

  -- Etapas administrativas exigem perfil gestor.
  IF NEW.status IN ('autorizada', 'paga', 'rejeitada', 'cancelada')
     AND NOT public.can_manage_fleet() THEN
    RAISE EXCEPTION 'Você não possui permissão para executar esta etapa da diária.';
  END IF;

  -- Etapas operacionais exigem permissão de escrita.
  IF NEW.status IN ('solicitada', 'em_analise', 'viagem_realizada', 'aguardando_comprovacao')
     AND NOT public.can_write() THEN
    RAISE EXCEPTION 'Você não possui permissão para executar esta etapa da diária.';
  END IF;

  IF NEW.status = 'solicitada' THEN
    NEW.requested_at := COALESCE(NEW.requested_at, now());
  END IF;

  IF NEW.status = 'autorizada' THEN
    NEW.authorized_at := COALESCE(NEW.authorized_at, now());
    NEW.authorized_by := COALESCE(NEW.authorized_by, auth.uid());
  END IF;

  IF NEW.status = 'paga' THEN
    NEW.paid_at := COALESCE(NEW.paid_at, now());
  END IF;

  IF NEW.status = 'rejeitada' THEN
    IF length(btrim(COALESCE(NEW.reject_reason, ''))) < 5 THEN
      RAISE EXCEPTION 'Informe o motivo da rejeição com pelo menos 5 caracteres.';
    END IF;
  END IF;

  IF NEW.status = 'cancelada' THEN
    IF length(btrim(COALESCE(NEW.cancel_reason, ''))) < 5 THEN
      RAISE EXCEPTION 'Informe o motivo do cancelamento com pelo menos 5 caracteres.';
    END IF;
  END IF;

  IF NEW.status = 'comprovada' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.diary_proofs p
      WHERE p.diary_id = NEW.id
        AND p.organization_id = NEW.organization_id
        AND p.status = 'aprovada'
    ) THEN
      RAISE EXCEPTION 'A diária só pode ser encerrada após uma comprovação aprovada.';
    END IF;

    NEW.closed_at := COALESCE(NEW.closed_at, now());
    NEW.closed_by := COALESCE(NEW.closed_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_diary_state ON public.diaries;
CREATE TRIGGER trg_guard_diary_state
BEFORE INSERT OR UPDATE OF status ON public.diaries
FOR EACH ROW EXECUTE FUNCTION public.guard_diary_state();

REVOKE EXECUTE ON FUNCTION public.guard_diary_state()
FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- Comprovação: só existe depois da viagem e aprovação encerra a RD
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_diary_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.diaries;
BEGIN
  SELECT *
    INTO d
  FROM public.diaries
  WHERE id = NEW.diary_id
  FOR UPDATE;

  IF d IS NULL THEN
    RAISE EXCEPTION 'Comprovação precisa estar vinculada a uma requisição de diária.';
  END IF;

  IF d.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Requisição de diária pertence a outro órgão.';
  END IF;

  IF d.status NOT IN ('viagem_realizada', 'aguardando_comprovacao', 'comprovada') THEN
    RAISE EXCEPTION 'A comprovação só pode ser registrada após a realização da viagem.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'aprovada'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Uma comprovação aprovada não pode ser reaberta.';
  END IF;

  IF NEW.status IN ('entregue', 'em_conferencia', 'aprovada') THEN
    IF COALESCE(btrim(NEW.activity_report), '') = '' THEN
      RAISE EXCEPTION 'Informe o relatório de atividades antes de encerrar a comprovação.';
    END IF;
  END IF;

  IF NEW.status = 'aprovada' THEN
    IF d.status <> 'aguardando_comprovacao' AND d.status <> 'comprovada' THEN
      RAISE EXCEPTION 'Coloque a diária em "Aguardando comprovação" antes de encerrar a prestação de contas.';
    END IF;

    IF NEW.balance_value > 0 AND NOT NEW.restitution_resolved THEN
      RAISE EXCEPTION 'Existe saldo a restituir não resolvido. Registre a devolução antes de encerrar.';
    END IF;

    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.reviewer_id := COALESCE(NEW.reviewer_id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_diary_proof()
FROM PUBLIC, anon, authenticated;


-- A aprovação da comprovação e o encerramento da RD passam a ocorrer
-- na mesma transação do banco.
CREATE OR REPLACE FUNCTION public.close_diary_from_approved_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'aprovada'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.diaries
       SET status = 'comprovada',
           closed_at = COALESCE(closed_at, now()),
           closed_by = COALESCE(closed_by, auth.uid()),
           updated_by = COALESCE(auth.uid(), updated_by)
     WHERE id = NEW.diary_id
       AND organization_id = NEW.organization_id
       AND status = 'aguardando_comprovacao';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A diária deve estar aguardando comprovação para ser encerrada.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_diary_from_approved_proof ON public.diary_proofs;
CREATE TRIGGER trg_close_diary_from_approved_proof
AFTER INSERT OR UPDATE OF status ON public.diary_proofs
FOR EACH ROW EXECUTE FUNCTION public.close_diary_from_approved_proof();

REVOKE EXECUTE ON FUNCTION public.close_diary_from_approved_proof()
FROM PUBLIC, anon, authenticated;
