import { Check, Monitor, Moon, Sun, Type } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ThemeMode = "claro" | "escuro" | "sistema";
const KEY = "frota-tema";
const SIZE_KEY = "frota-tamanho";

export type SizeMode = "compacto" | "auto" | "grande";

function readSize(): SizeMode {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    return v === "compacto" || v === "grande" ? v : "auto";
  } catch {
    return "auto";
  }
}

function applySize(mode: SizeMode) {
  if (mode === "auto") document.documentElement.removeAttribute("data-tamanho");
  else document.documentElement.setAttribute("data-tamanho", mode);
}

function apply(mode: ThemeMode) {
  const dark =
    mode === "escuro" ||
    (mode === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "claro" || v === "escuro" || v === "sistema" ? v : "claro";
  } catch {
    return "claro";
  }
}

/** Botão para escolher o modo de tela: claro, escuro ou igual ao do aparelho. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("claro");
  const [size, setSize] = useState<SizeMode>("auto");

  useEffect(() => {
    const m = read();
    setMode(m);
    apply(m);
    const sz = readSize();
    setSize(sz);
    applySize(sz);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => read() === "sistema" && apply("sistema");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function choose(m: ThemeMode) {
    setMode(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* navegador sem armazenamento: vale só nesta sessão */
    }
    apply(m);
  }

  function chooseSize(m: SizeMode) {
    setSize(m);
    try {
      localStorage.setItem(SIZE_KEY, m);
    } catch {
      /* vale só nesta sessão */
    }
    applySize(m);
  }

  const Icon = mode === "escuro" ? Moon : mode === "sistema" ? Monitor : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Aparência: modo e tamanho da tela">
          <Icon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Modo de tela</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => choose("claro")}>
          <Sun className="size-4" /> Claro{" "}
          {mode === "claro" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose("escuro")}>
          <Moon className="size-4" /> Escuro{" "}
          {mode === "escuro" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose("sistema")}>
          <Monitor className="size-4" /> Igual ao aparelho{" "}
          {mode === "sistema" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tamanho das letras e da tela</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => chooseSize("auto")}>
          <Type className="size-4" /> Automático (ajusta à tela){" "}
          {size === "auto" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => chooseSize("compacto")}>
          <Type className="size-3.5" /> Compacto{" "}
          {size === "compacto" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => chooseSize("grande")}>
          <Type className="size-5" /> Grande{" "}
          {size === "grande" && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Roda antes de a página aparecer, para não piscar branco quando o modo escuro está escolhido. */
export const THEME_BOOT_SCRIPT = `try{var z=localStorage.getItem("${SIZE_KEY}");if(z==="compacto"||z==="grande"){document.documentElement.setAttribute("data-tamanho",z)}var m=localStorage.getItem("${KEY}");if(m==="escuro"||(m==="sistema"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`;
