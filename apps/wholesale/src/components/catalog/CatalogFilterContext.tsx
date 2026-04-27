"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";

const Ctx = createContext<{
  isPending: boolean;
  startFilter: (fn: () => void) => void;
}>({ isPending: false, startFilter: (fn) => fn() });

export function CatalogFilterProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Ctx.Provider value={{ isPending, startFilter: startTransition }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCatalogFilter() {
  return useContext(Ctx);
}
