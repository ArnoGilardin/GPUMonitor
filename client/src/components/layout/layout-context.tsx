import { createContext, useContext } from "react";

export const LayoutContext = createContext<{ openMobileNav: () => void }>({ openMobileNav: () => {} });

export function useLayout() {
  return useContext(LayoutContext);
}
