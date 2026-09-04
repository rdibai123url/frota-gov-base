/**
 * FrotaGov — padrão global de formatação (pt-BR).
 *
 * Regras obrigatórias em todo o sistema:
 *  - Valores monetários: milhar com ponto, decimal com vírgula, sempre 2 casas.
 *  - Volumes em litros: milhar com ponto, decimal com vírgula, sempre 4 casas.
 *  - CNPJ: 00.000.000/0000-00 com validação de dígitos verificadores.
 *  - CPF: 000.000.000-00 com validação de dígitos verificadores.
 *
 * No banco os valores permanecem numéricos; a formatação é apenas de interface.
 */

export const MONEY_DECIMALS = 2;
export const LITER_DECIMALS = 4;

export const onlyDigits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

/* ------------------------------- números -------------------------------- */

/** Formata um número no padrão brasileiro com casas decimais fixas. */
export function formatNumberBR(value: number | string | null | undefined, decimals = 2) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Valor monetário sem símbolo: 1234567.8 -> "1.234.567,80". */
export const formatMoney = (value: number | string | null | undefined) =>
  formatNumberBR(value, MONEY_DECIMALS);

/** Valor monetário com símbolo: "R$ 1.234.567,80". */
export const formatBRL = (value: number | string | null | undefined) =>
  `R$ ${formatNumberBR(value, MONEY_DECIMALS)}`;

/** Volume em litros: 12.5 -> "12,5000". */
export const formatLiters = (value: number | string | null | undefined) =>
  formatNumberBR(value, LITER_DECIMALS);

/** Litros com unidade: "12,5000 L". */
export const formatLitersUnit = (value: number | string | null | undefined, unit = "L") =>
  `${formatLiters(value)} ${unit}`;

/**
 * Converte texto no padrão brasileiro (ou americano simples) em número.
 * "1.234.567,80" -> 1234567.8 | "12,5" -> 12.5 | "12.5" -> 12.5
 */
export function parseBRNumber(input: string | number | null | undefined): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const raw = String(input ?? "").trim();
  if (!raw) return 0;
  const hasComma = raw.includes(",");
  const cleaned = hasComma
    ? raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    : raw.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Máscara progressiva de digitação: mantém sempre o número de casas decimais
 * exigido, deslocando os dígitos da direita para a esquerda.
 */
export function maskDecimalBR(input: string, decimals = 2) {
  const d = onlyDigits(input).replace(/^0+(?=\d)/, "");
  if (!d) return "";
  const padded = d.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals) || "0";
  const decPart = decimals > 0 ? padded.slice(padded.length - decimals) : "";
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals > 0 ? `${intFmt},${decPart}` : intFmt;
}

export const maskMoneyBR = (input: string) => maskDecimalBR(input, MONEY_DECIMALS);
export const maskLitersBR = (input: string) => maskDecimalBR(input, LITER_DECIMALS);

/** Converte número para o texto usado nos campos mascarados. */
export function toMaskedNumber(value: number | string | null | undefined, decimals = 2) {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return formatNumberBR(n, decimals);
}

/* ------------------------------ documentos ------------------------------ */

export function maskCNPJ(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskCPF(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Exibição segura: aplica máscara mesmo quando o banco guarda só dígitos. */
export const formatCNPJ = (v: string | null | undefined) => (v ? maskCNPJ(v) : "—");
export const formatCPF = (v: string | null | undefined) => (v ? maskCPF(v) : "—");

export function isValidCNPJ(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = 0; i < len; i++) {
      sum += Number(d[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function isValidCPF(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export const maskCEP = (v: string) => onlyDigits(v).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

/* --------------------- padrões numéricos complementares ------------------ */

export const PERCENT_DECIMALS = 2;
export const QUANTITY_DECIMALS = 2;
/** Hodômetro: quilometragem inteira (precisão funcional do produto). */
export const KM_DECIMALS = 0;
/** Horímetro: uma casa decimal, como registrado nos equipamentos. */
export const HOUR_METER_DECIMALS = 1;

/** Percentual no padrão brasileiro: 12.5 -> "12,50". */
export const formatPercent = (value: number | string | null | undefined, withSign = true) =>
  `${formatNumberBR(value, PERCENT_DECIMALS)}${withSign ? "%" : ""}`;

/** Quantidade genérica (peças, serviços, itens): sempre 2 casas. */
export const formatQuantity = (value: number | string | null | undefined) =>
  formatNumberBR(value, QUANTITY_DECIMALS);

/** Quantidade com unidade de medida: "3,00 UN". */
export const formatQuantityUnit = (value: number | string | null | undefined, unit?: string | null) =>
  `${formatQuantity(value)}${unit ? ` ${unit}` : ""}`;

/** Quilometragem: milhar brasileiro, sem casas decimais artificiais. */
export const formatKm = (value: number | string | null | undefined) =>
  formatNumberBR(value, KM_DECIMALS);

export const formatKmUnit = (value: number | string | null | undefined) => `${formatKm(value)} km`;

/** Horímetro: uma casa decimal. */
export const formatHourMeter = (value: number | string | null | undefined) =>
  formatNumberBR(value, HOUR_METER_DECIMALS);

/**
 * Inteiro técnico (ano, processo, sequencial, eixos): sem casas decimais
 * e sem separador de milhar, para não descaracterizar o número.
 */
export const formatInteger = (value: number | string | null | undefined) => {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? String(Math.round(n)) : "";
};

/** Máscara de digitação apenas com dígitos (inteiros técnicos). */
export const maskInteger = (v: string, max = 12) => onlyDigits(v).slice(0, max);

/** Máscara de quilometragem com separador de milhar, sem decimais. */
export function maskKm(v: string) {
  const d = onlyDigits(v).replace(/^0+(?=\d)/, "");
  if (!d) return "";
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
