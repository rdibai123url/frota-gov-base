import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ThemeMode = "claro" | "escuro" | "sistema";
const KEY = "frota-tema";

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

  useEffect(() => {
    const m = read();
    setMode(m);
    apply(m);
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

  const Icon = mode === "escuro" ? Moon : mode === "sistema" ? Monitor : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Modo de tela (claro ou escuro)">
          <Icon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => choose("claro")}>
          <Sun className="size-4" /> Claro
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose("escuro")}>
          <Moon className="size-4" /> Escuro
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose("sistema")}>
          <Monitor className="size-4" /> Igual ao aparelho
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Roda antes de a página aparecer, para não piscar branco quando o modo escuro está escolhido. */
export const THEME_BOOT_SCRIPT = `try{var m=localStorage.getItem("${KEY}");if(m==="escuro"||(m==="sistema"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`;
