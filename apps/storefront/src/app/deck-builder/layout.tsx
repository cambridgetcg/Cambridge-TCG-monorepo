import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";

/**
 * Metadata-only layout for /deck-builder.
 *
 * The deck builder is a client component (it manages the whole working
 * deck in state) and therefore can't export `metadata` itself — Next.js
 * App Router only accepts metadata exports from server components. This
 * thin layout sits between the route and the page, declaring the title
 * and audience. Same pattern as /play/deck-check.
 *
 * The description stays fun-only: the deck builder lives in the
 * game-economy, not the real-economy (see the doctrine comments in
 * page.tsx and DeckStatsPanel.tsx).
 */

export const metadata: Metadata = {
  title: "Deck builder — build a 50-card OPTCG deck",
  description:
    "Build a One Piece TCG deck in the browser: pick a Leader, add up to 4 copies per card, check your rarity and role curves, and test opening hands with a 10,000-shuffle simulator.",
  other: audienceMetadata("public-documentation", ["play", "deck", "builder"]),
};

export default function DeckBuilderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
