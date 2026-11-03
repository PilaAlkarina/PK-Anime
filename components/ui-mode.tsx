"use client";

import { createContext, useContext } from "react";
import type { UiMode } from "@/lib/ui-mode";

// TV by default: the library's components were built for it, and outside a provider
// they keep behaving as before
const UiModeContext = createContext<UiMode>("tv");

export function UiModeProvider({ mode, children }: { mode: UiMode; children: React.ReactNode }) {
  return <UiModeContext.Provider value={mode}>{children}</UiModeContext.Provider>;
}

export function useUiMode(): UiMode {
  return useContext(UiModeContext);
}

export const useIsTv = () => useUiMode() === "tv";
