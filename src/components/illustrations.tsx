import { cn } from "@/lib/utils";

/** Cena da frota para a tela de login: pista, veículos e um ponto de localização. */
export function FleetIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 300"
      role="img"
      aria-label="Ilustração de veículos em uma pista com ponto de localização"
      className={cn("w-full", className)}
    >
      <defs>
        <linearGradient id="fi-road" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <path
        d="M-10 232 C 120 190, 200 250, 330 214 S 470 170, 540 190 L540 300 L-10 300 Z"
        fill="url(#fi-road)"
      />
      <path
        d="M-10 240 C 120 198, 200 258, 330 222 S 470 178, 540 198"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeDasharray="10 12"
      />
      {/* ônibus */}
      <g transform="translate(60 150)">
        <rect width="120" height="56" rx="10" fill="#ffffff" fillOpacity="0.95" />
        <rect x="10" y="10" width="20" height="18" rx="3" fill="#2f6df6" fillOpacity="0.75" />
        <rect x="36" y="10" width="20" height="18" rx="3" fill="#2f6df6" fillOpacity="0.75" />
        <rect x="62" y="10" width="20" height="18" rx="3" fill="#2f6df6" fillOpacity="0.75" />
        <rect x="88" y="10" width="24" height="26" rx="3" fill="#2f6df6" fillOpacity="0.75" />
        <circle cx="28" cy="58" r="9" fill="#0b2545" stroke="#ffffff" strokeWidth="3" />
        <circle cx="92" cy="58" r="9" fill="#0b2545" stroke="#ffffff" strokeWidth="3" />
      </g>
      {/* carro */}
      <g transform="translate(260 176)">
        <path
          d="M0 34 L10 14 Q14 6 24 6 H58 Q68 6 74 14 L88 30 Q96 32 96 40 V46 H0 Z"
          fill="#ffffff"
          fillOpacity="0.95"
        />
        <path d="M16 16 H36 V30 H10 Z M42 16 H62 L74 30 H42 Z" fill="#2f6df6" fillOpacity="0.75" />
        <circle cx="24" cy="48" r="8" fill="#0b2545" stroke="#ffffff" strokeWidth="3" />
        <circle cx="72" cy="48" r="8" fill="#0b2545" stroke="#ffffff" strokeWidth="3" />
      </g>
      {/* ponto de localização */}
      <g transform="translate(400 70)">
        <circle cx="20" cy="56" r="16" fill="#7fb0ff" fillOpacity="0.2">
          <animate attributeName="r" values="12;24;12" dur="3s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.35;0;0.35"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
        <path
          d="M20 0 C 9 0 0 9 0 20 C 0 35 20 56 20 56 C 20 56 40 35 40 20 C 40 9 31 0 20 0 Z"
          fill="#ffffff"
        />
        <circle cx="20" cy="20" r="8" fill="#2f6df6" />
      </g>
      {/* linhas de rota */}
      <path
        d="M120 140 C 160 90, 260 110, 330 130 S 400 100, 420 96"
        fill="none"
        stroke="#7fb0ff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="2 9"
      />
    </svg>
  );
}

/** Ilustração discreta para telas sem dados: pasta com lupa. */
export function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" aria-hidden className={cn("mx-auto h-24 w-auto", className)}>
      <ellipse cx="80" cy="98" rx="52" ry="7" fill="currentColor" opacity="0.08" />
      <path
        d="M26 34 h34 l8 10 h66 a6 6 0 0 1 6 6 v40 a6 6 0 0 1 -6 6 H26 a6 6 0 0 1 -6 -6 V40 a6 6 0 0 1 6 -6 z"
        fill="var(--color-primary)"
        opacity="0.16"
      />
      <path
        d="M26 46 h108 a6 6 0 0 1 6 6 v34 a6 6 0 0 1 -6 6 H26 a6 6 0 0 1 -6 -6 V52 a6 6 0 0 1 6 -6 z"
        fill="var(--color-primary)"
        opacity="0.28"
      />
      <circle
        cx="104"
        cy="60"
        r="16"
        fill="var(--color-card)"
        stroke="var(--color-primary)"
        strokeWidth="3"
      />
      <path
        d="M116 72 l14 14"
        stroke="var(--color-primary)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
