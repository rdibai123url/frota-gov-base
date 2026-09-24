/**
 * Campos reutilizáveis com o padrão global de formatação do FrotaGov.
 * Use sempre estes componentes em vez de <Input> cru para valores, litros, CPF e CNPJ.
 */
import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  HOUR_METER_DECIMALS,
  LITER_DECIMALS,
  MONEY_DECIMALS,
  PERCENT_DECIMALS,
  QUANTITY_DECIMALS,
  maskInteger,
  maskKm,
  maskCNPJ,
  maskCPF,
  maskDecimalBR,
  toMaskedNumber,
} from "@/lib/format";

type BaseProps = Omit<React.ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange"> & {
  defaultValue?: number | string | null;
  value?: number | string | null;
  onValueChange?: (text: string) => void;
};

function useMasked(
  initial: number | string | null | undefined,
  mask: (v: string) => string,
  controlled?: number | string | null,
) {
  const [text, setText] = React.useState(() => mask(String(initial ?? "")));
  React.useEffect(() => {
    if (controlled !== undefined) setText(mask(String(controlled ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled]);
  return [text, setText] as const;
}

/** Campo decimal no padrão brasileiro (milhar ".", decimal ",") com casas fixas. */
export function DecimalInput({
  decimals = 2,
  defaultValue,
  value,
  onValueChange,
  ...props
}: BaseProps & { decimals?: number }) {
  const fmt = (v: string) =>
    v === "" ? "" : toMaskedNumber(v, decimals) || maskDecimalBR(v, decimals);
  const [text, setText] = useMasked(
    defaultValue === null || defaultValue === undefined || defaultValue === ""
      ? ""
      : fmt(String(defaultValue)),
    (v) => v,
    value === null || value === undefined ? value : fmt(String(value)),
  );
  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      {...props}
      value={text}
      onChange={(e) => {
        const masked = maskDecimalBR(e.target.value, decimals);
        setText(masked);
        onValueChange?.(masked);
      }}
    />
  );
}

/** Valor monetário — sempre 2 casas decimais. */
export function MoneyInput(props: BaseProps) {
  return <DecimalInput decimals={MONEY_DECIMALS} placeholder="0,00" {...props} />;
}

/** Volume em litros — sempre 4 casas decimais. */
export function LitersInput(props: BaseProps) {
  return <DecimalInput decimals={LITER_DECIMALS} placeholder="0,0000" {...props} />;
}

export function CpfInput({ defaultValue, value, onValueChange, ...props }: BaseProps) {
  const [text, setText] = useMasked(defaultValue, maskCPF, value);
  return (
    <Input
      inputMode="numeric"
      placeholder="000.000.000-00"
      autoComplete="off"
      {...props}
      value={text}
      onChange={(e) => {
        const masked = maskCPF(e.target.value);
        setText(masked);
        onValueChange?.(masked);
      }}
    />
  );
}

export function CnpjInput({ defaultValue, value, onValueChange, ...props }: BaseProps) {
  const [text, setText] = useMasked(defaultValue, maskCNPJ, value);
  return (
    <Input
      inputMode="numeric"
      placeholder="00.000.000/0000-00"
      autoComplete="off"
      {...props}
      value={text}
      onChange={(e) => {
        const masked = maskCNPJ(e.target.value);
        setText(masked);
        onValueChange?.(masked);
      }}
    />
  );
}

/** Percentual — sempre 2 casas decimais. */
export function PercentInput(props: BaseProps) {
  return <DecimalInput decimals={PERCENT_DECIMALS} placeholder="0,00" {...props} />;
}

/** Quantidade genérica — sempre 2 casas decimais. */
export function QuantityInput(props: BaseProps) {
  return <DecimalInput decimals={QUANTITY_DECIMALS} placeholder="0,00" {...props} />;
}

/** Horímetro — uma casa decimal. */
export function HourMeterInput(props: BaseProps) {
  return <DecimalInput decimals={HOUR_METER_DECIMALS} placeholder="0,0" {...props} />;
}

/** Hodômetro — inteiro com separador de milhar (sem decimais artificiais). */
export function KmInput({ defaultValue, value, onValueChange, ...props }: BaseProps) {
  const [text, setText] = useMasked(defaultValue, maskKm, value);
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      placeholder="0"
      {...props}
      value={text}
      onChange={(e) => {
        const masked = maskKm(e.target.value);
        setText(masked);
        onValueChange?.(masked);
      }}
    />
  );
}

/** Inteiro técnico (ano, processo, sequencial, eixos) — sem casas decimais. */
export function IntegerInput({
  defaultValue,
  value,
  onValueChange,
  maxDigits = 12,
  ...props
}: BaseProps & { maxDigits?: number }) {
  const mask = (v: string) => maskInteger(v, maxDigits);
  const [text, setText] = useMasked(defaultValue, mask, value);
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      {...props}
      value={text}
      onChange={(e) => {
        const masked = mask(e.target.value);
        setText(masked);
        onValueChange?.(masked);
      }}
    />
  );
}
