import { createContext, useContext } from "react";

/** Verdadeiro quando uma tela está dentro de uma aba de outra tela: o cabeçalho grande some. */
export const EmbeddedContext = createContext(false);
export const useEmbedded = () => useContext(EmbeddedContext);
