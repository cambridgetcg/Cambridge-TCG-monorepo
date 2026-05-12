import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";

/**
 * Metadata-only layout for /play/deck-check.
 *
 * The deck-check page is a client component (it manages form state) and
 * therefore can't export `metadata` itself — Next.js App Router only
 * accepts metadata exports from server components. This thin layout sits
 * between the route and the page, declaring the title and audience.
 *
 * E2E test finding (kingdom-070 follow-through): without this layout,
 * the page rendered with the root layout's default title
 * ("Cambridge TCG — Japanese Trading Cards") instead of "Deck check".
 */

export const metadata: Metadata = {
  title: "Deck check — validate an OPTCG deck",
  description:
    "Paste your leader + main deck card IDs; receive typed legality violations (50-card count, leader-color match, 4-copy limit, set/block rotation). Substrate-honest about gracefully-degraded checks.",
  other: audienceMetadata("public-documentation", ["play", "deck", "validator"]),
};

export default function DeckCheckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
