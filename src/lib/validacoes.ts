/**
 * Regras de validação comuns às telas. Servem só para orientar o usuário antes
 * de gravar; as regras críticas também são garantidas no banco (migrations).
 */

/** Data ou data/hora (datetime-local) posterior ao momento atual. */
export function isFutureDate(value: string | null | undefined, toleranceMinutes = 5) {
  if (!value) return false;
  const t = new Date(value.length <= 10 ? `${value}T00:00:00` : value).getTime();
  if (Number.isNaN(t)) return false;
  const limit = value.length <= 10 ? endOfToday() : Date.now() + toleranceMinutes * 60_000;
  return t > limit;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Renavam com 9 a 11 dígitos numéricos (vazio é aceito quando o campo é opcional). */
export function isValidRenavam(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 0 || (digits.length >= 9 && digits.length <= 11);
}

export function isValidEmail(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  return v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

type DbErrorLike = { code?: string; message?: string } | null | undefined;

/**
 * Traduz erros técnicos do banco em mensagens claras em português.
 * Mensagens já escritas para o usuário (regras do banco) passam sem alteração.
 */
export function friendlyDbError(error: DbErrorLike, fallback = "Não foi possível salvar.") {
  if (!error) return fallback;
  const message = error.message ?? "";
  if (error.code === "23505" || /duplicate key value/i.test(message))
    return "Já existe um cadastro com estes dados.";
  if (error.code === "23503" || /violates foreign key/i.test(message))
    return "Este registro está vinculado a outros dados e não pode ser alterado assim.";
  if (error.code === "23514" || /violates check constraint/i.test(message))
    return "Os dados informados não atendem às regras do sistema. Revise os valores.";
  if (error.code === "23502" || /null value in column/i.test(message))
    return "Há campos obrigatórios sem preenchimento.";
  if (/^[A-Za-z_ ]+\(.*\)$/.test(message) || /violates|constraint|relation "/i.test(message))
    return fallback;
  return message || fallback;
}
