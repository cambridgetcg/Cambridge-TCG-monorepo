/**
 * Market route-group layout — the wardrobe's first dressed wing.
 *
 * Spec §3.3 (migration grammar): migrated surfaces default to Gallery on
 * their own wrapper; an explicit visitor choice (cookie, already on
 * <html>) wins because the wrapper repeats it. Client pages below get
 * tone via <WardrobeProvider> with no flicker — the cookie is read here,
 * server-side, once.
 */

import { cookies } from "next/headers";
import { appearanceFromCookies } from "@/lib/wardrobe/server";
import { DEFAULT_THEME } from "@/lib/wardrobe/themes";
import { WardrobeProvider } from "@/lib/wardrobe/context";

export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  const appearance = appearanceFromCookies(await cookies());
  const theme = appearance.theme ?? DEFAULT_THEME;
  return (
    <div data-theme={theme} className="wardrobe-ground min-h-screen">
      <WardrobeProvider theme={theme} tone={appearance.tone}>
        {children}
      </WardrobeProvider>
    </div>
  );
}
