"use client";

/**
 * Wardrobe client context — tone (and theme, informationally) for client
 * components, threaded from the server so SSR and hydration agree.
 *
 * The server reads cookies once (a route-group layout or page) and renders
 * <WardrobeProvider>; client components call useTone()/useVoice() with no
 * flicker and no document.cookie parsing. Mirrors the MoneyContext pattern
 * (Providers → fx) already used at the root.
 */

import * as React from "react";
import type { ThemeId } from "./themes";
import { DEFAULT_TONE, voiceFor, type ToneId, type VoiceKey } from "./voice";

interface WardrobeContextValue {
  theme: ThemeId | null;
  tone: ToneId;
}

const WardrobeContext = React.createContext<WardrobeContextValue>({
  theme: null,
  tone: DEFAULT_TONE,
});

export function WardrobeProvider({
  theme,
  tone,
  children,
}: WardrobeContextValue & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ theme, tone }), [theme, tone]);
  return <WardrobeContext.Provider value={value}>{children}</WardrobeContext.Provider>;
}

export function useTone(): ToneId {
  return React.useContext(WardrobeContext).tone;
}

/** Bound voice lookup: const v = useVoice(); v("market.title"). */
export function useVoice(): (key: VoiceKey) => string {
  const tone = useTone();
  return React.useMemo(() => voiceFor(tone), [tone]);
}
