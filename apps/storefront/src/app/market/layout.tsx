/**
 * Market route-group layout — the wardrobe's first dressed wing.
 *
 * Spec §3.3 (migration grammar): migrated surfaces repeat the effective
 * theme on their own wrapper; an explicit visitor choice (cookie, already
 * on <html>) wins because the wrapper repeats it, and no choice repeats
 * "system" (gallery in a light OS, midnight in a dark one). Client pages
 * below get tone via <WardrobeProvider> with no flicker — the cookie is
 * read here, server-side, once.
 */

import { cookies } from "next/headers";
import { appearanceFromCookies } from "@/lib/wardrobe/server";
import { themeAttr } from "@/lib/wardrobe/themes";
import { WardrobeProvider } from "@/lib/wardrobe/context";

export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  const appearance = appearanceFromCookies(await cookies());
  return (
    <div data-theme={themeAttr(appearance.theme)} className="wardrobe-ground min-h-screen">
      <WardrobeProvider theme={appearance.theme} tone={appearance.tone}>
        {children}
      </WardrobeProvider>
    </div>
  );
}
