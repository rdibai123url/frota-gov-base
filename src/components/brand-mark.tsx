import { useId } from "react";

import { cn } from "@/lib/utils";

/** Símbolo do Dibai Fleet: um "D" formado por uma pista curva, com o ponto de um veículo. */
export function BrandMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Dibai Fleet"
      className={cn("size-9 shrink-0", className)}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6df6" />
          <stop offset="1" stopColor="#0b2545" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${id}-bg)`} />
      <path
        d="M15 12h9c8.3 0 13 4.7 13 12s-4.7 12-13 12h-9z"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M20 24h10"
        stroke="#9cc2ff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 5"
      />
      <circle cx="32.5" cy="24" r="2.5" fill="#fff" />
    </svg>
  );
}
