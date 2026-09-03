/**
 * Campos reutilizáveis com o padrão global de formatação do FrotaGov.
 * Use sempre estes componentes em vez de <Input> cru para valores, litros, CPF e CNPJ.
 */
import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  LITER_DECIMALS,
  MONEY_DECIMALS,
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
  const fmt = (v: string) => (v === "" ? "" : toMaskedNumber(v, decimals) || maskDecimalBR(v, decimals));
  const [text, setText] = useMasked(
    defaultValue === null || defaultValue === undefined || defaultValue === "" ? "" : fmt(String(defaultValue)),
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
