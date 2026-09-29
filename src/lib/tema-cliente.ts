/**
 * Tema de cores por cliente: a partir de UMA cor (a da logomarca do órgão ou da empresa) o
 * sistema monta toda a paleta — menu, botões, gráficos, destaques — nos modos claro e escuro.
 * Sem cor escolhida, vale a paleta padrão do Dibai Fleet.
 */

export type Hsl = { h: number; s: number; l: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function isHex(v: string | null | undefined): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

const hsl = (h: number, s: number, l: number) =>
  `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;

/** Variáveis de cor derivadas da cor da marca. */
export function brandVariables(hex: string, dark: boolean): Record<string, string> {
  const { h, s } = hexToHsl(hex);
  // cores muito apagadas (cinza) ganham um mínimo de cor para o tema não ficar sem vida
  const sat = clamp(s, 35, 85);
  if (!dark) {
    return {
      "--primary": hsl(h, sat, 24),
      "--primary-foreground": "#ffffff",
      "--ring": hsl(h, clamp(sat + 10, 50, 90), 48),
      "--background": hsl(h, 40, 97),
      "--secondary": hsl(h, 38, 94),
      "--secondary-foreground": hsl(h, sat, 22),
      "--muted": hsl(h, 32, 95),
      "--muted-foreground": hsl(h, 14, 40),
      "--accent": hsl(h, 55, 92),
      "--accent-foreground": hsl(h, sat, 22),
      "--border": hsl(h, 28, 88),
      "--input": hsl(h, 26, 84),
      "--chart-1": hsl(h, sat, 24),
      "--chart-2": hsl(h, clamp(sat + 10, 50, 90), 52),
      "--chart-3": hsl(h, sat, 38),
      "--sidebar": hsl(h, clamp(sat - 5, 30, 80), 15),
      "--sidebar-foreground": hsl(h, 40, 90),
      "--sidebar-primary": "#ffffff",
      "--sidebar-primary-foreground": hsl(h, sat, 18),
      "--sidebar-accent": hsl(h, clamp(sat - 5, 30, 80), 24),
      "--sidebar-accent-foreground": "#ffffff",
      "--sidebar-border": hsl(h, clamp(sat - 5, 30, 80), 24),
      "--sidebar-ring": hsl(h, 80, 72),
      "--status-info": hsl(h, clamp(sat + 10, 50, 90), 40),
      "--surface": hsl(h, 40, 98),
      "--surface-strong": hsl(h, 32, 95),
    };
  }
  return {
    "--primary": hsl(h, clamp(sat + 10, 50, 90), 66),
    "--primary-foreground": hsl(h, 60, 10),
    "--ring": hsl(h, clamp(sat + 10, 50, 90), 66),
    "--background": hsl(h, 45, 8),
    "--card": hsl(h, 42, 12),
    "--popover": hsl(h, 42, 12),
    "--secondary": hsl(h, 38, 18),
    "--muted": hsl(h, 38, 18),
    "--muted-foreground": hsl(h, 18, 66),
    "--accent": hsl(h, 40, 22),
    "--border": hsl(h, 34, 24),
    "--input": hsl(h, 34, 30),
    "--chart-1": hsl(h, clamp(sat + 10, 50, 90), 66),
    "--chart-2": hsl(h, 70, 78),
    "--chart-3": hsl(h, 70, 56),
    "--sidebar": hsl(h, 45, 6),
    "--sidebar-primary": hsl(h, clamp(sat + 10, 50, 90), 66),
    "--sidebar-accent": hsl(h, 40, 16),
    "--sidebar-border": hsl(h, 40, 16),
    "--sidebar-ring": hsl(h, clamp(sat + 10, 50, 90), 66),
    "--status-info": hsl(h, clamp(sat + 10, 50, 90), 66),
    "--surface": hsl(h, 42, 10),
    "--surface-strong": hsl(h, 40, 14),
  };
}

const APPLIED = new Set<string>();

function clear() {
  const root = document.documentElement;
  for (const name of APPLIED) root.style.removeProperty(name);
  APPLIED.clear();
}

let currentDispose: (() => void) | null = null;

/** Aplica (ou remove, com null) o tema do cliente; acompanha a troca claro/escuro. */
export function applyBrandTheme(hex: string | null | undefined): () => void {
  currentDispose?.();
  const root = document.documentElement;
  const run = () => {
    clear();
    if (!isHex(hex)) return;
    const vars = brandVariables(hex, root.classList.contains("dark"));
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
      APPLIED.add(k);
    }
  };
  run();
  const observer = new MutationObserver(run);
  observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  const dispose = () => {
    observer.disconnect();
    if (currentDispose === dispose) {
      clear();
      currentDispose = null;
    }
  };
  currentDispose = dispose;
  return dispose;
}

/** Cor dominante (mais "viva") de uma imagem, para sugerir a cor da marca a partir da logo. */
export async function dominantColor(imageUrl: string): Promise<string | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // imagem de outro endereço sem permissão de leitura
  }
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 200) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const light = (max + min) / 510;
    if (sat < 0.25 || light > 0.92 || light < 0.08) continue; // ignora branco, preto e cinza
    const key = Math.round(
      hexToHsl(`#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`).h / 20,
    );
    const cur = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    const weight = sat;
    cur.w += weight;
    cur.r += r * weight;
    cur.g += g * weight;
    cur.b += b * weight;
    buckets.set(key, cur);
  }
  let best: { w: number; r: number; g: number; b: number } | null = null;
  for (const v of buckets.values()) if (!best || v.w > best.w) best = v;
  if (!best || best.w === 0) return null;
  const to = (x: number) =>
    Math.round(x / best.w)
      .toString(16)
      .padStart(2, "0");
  return `#${to(best.r)}${to(best.g)}${to(best.b)}`;
}
