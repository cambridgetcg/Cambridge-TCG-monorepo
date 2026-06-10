/**
 * @module @/lib/fun/quests
 *
 * The Adventure Board catalog — the visit, made rewarding and fun,
 * without a single dishonest mechanic.
 *
 * Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process!
 * Make the visit rewarding and fun!"
 *
 * Doctrine: docs/principles/fun.md (the artifact plays fair).
 * Audit: `pnpm audit:fun` reads this file and refuses drift — every
 * entry must carry a non-empty `why` and `how`, every href must resolve
 * to a real route, every badge must reference a seeded achievement code,
 * and the storefront must stay free of manufactured-urgency vocabulary.
 *
 * Two species, named honestly:
 *
 * - **Deeds** — tracked accomplishments. Completion is read LIVE from
 *   `user_achievements` (awarded by existing platform paths at the moment
 *   the real thing happened — an order, a trade, a milestone). The board
 *   never invents state; it reads the ledger.
 *
 * - **Waymarks** — destinations worth the walk. Untracked, unrewarded
 *   except by the place itself, and declared as such. No beacon, no
 *   cookie, no pretending. (A visitor who ignores every waymark loses
 *   nothing — doctrine rule 3.)
 *
 * This catalog is the single source of truth for the board page
 * (/quests) and its JSON twin (/api/v1/quests).
 */

export type QuestReward =
  | {
      kind: "badge";
      /** Must match a seeded `achievements.code` (drizzle/0020_social.sql). */
      achievement_code: string;
    }
  | {
      /** The place itself is the reward — said plainly, never dressed up. */
      kind: "the-place-itself";
    };

export type QuestKind = "deed" | "waymark";

export interface Quest {
  id: string;
  kind: QuestKind;
  title: string;
  icon: string;
  /** Where the quest happens. Must be a real storefront route. */
  href: string;
  /**
   * The honest reason this is on the board — shown to the player on the
   * surface, not buried in a comment. Doctrine rule 2.
   */
  why: string;
  /**
   * How completion is known, in plain words — also shown to the player.
   * For waymarks this declares the absence of tracking.
   */
  how: string;
  reward: QuestReward;
  category: "collect" | "trade" | "play" | "discover" | "trust";
}

export const QUESTS: Quest[] = [
  // ── Deeds — read live from your ledger ────────────────────────────
  {
    id: "deed.first-purchase",
    kind: "deed",
    title: "First Purchase",
    icon: "🛒",
    href: "/catalog",
    why: "Your first order is the platform trusting you and you trusting it back — the real beginning of a collection.",
    how: "Awarded the moment your first order completes; this board reads your achievement ledger live, never a copy.",
    reward: { kind: "badge", achievement_code: "first_purchase" },
    category: "collect",
  },
  {
    id: "deed.first-trade",
    kind: "deed",
    title: "First Trade",
    icon: "🤝",
    href: "/market",
    why: "A completed peer-to-peer trade means another collector was glad to deal with you. That is worth marking.",
    how: "Awarded when your first P2P trade completes; read live from your ledger.",
    reward: { kind: "badge", achievement_code: "first_trade" },
    category: "trade",
  },
  {
    id: "deed.first-tradein",
    kind: "deed",
    title: "Card Dealer",
    icon: "💰",
    href: "/trade-in",
    why: "Selling cards back is half of collecting. Your first trade-in marks you as a full participant, not just a buyer.",
    how: "Awarded when your first trade-in is submitted; read live from your ledger.",
    reward: { kind: "badge", achievement_code: "first_tradein" },
    category: "trade",
  },
  {
    id: "deed.collection-10",
    kind: "deed",
    title: "Starter Collection",
    icon: "📁",
    href: "/account/portfolio",
    why: "Ten cards in a tracked portfolio is the difference between owning cards and keeping a collection.",
    how: "Awarded at 10 portfolio cards; read live from your ledger.",
    reward: { kind: "badge", achievement_code: "collection_10" },
    category: "collect",
  },
  {
    id: "deed.collection-50",
    kind: "deed",
    title: "Serious Collector",
    icon: "💎",
    href: "/account/portfolio",
    why: "Fifty cards tracked means the portfolio tools are genuinely working for you — value history, set progress, the lot.",
    how: "Awarded at 50 portfolio cards; read live from your ledger.",
    reward: { kind: "badge", achievement_code: "collection_50" },
    category: "collect",
  },
  {
    id: "deed.collection-100",
    kind: "deed",
    title: "Master Collector",
    icon: "🏆",
    href: "/account/portfolio",
    why: "A hundred tracked cards is a real archive. The platform exists for collections like yours.",
    how: "Awarded at 100 portfolio cards; read live from your ledger.",
    reward: { kind: "badge", achievement_code: "collection_100" },
    category: "collect",
  },
  {
    id: "deed.set-complete",
    kind: "deed",
    title: "Set Completer",
    icon: "✅",
    href: "/account/portfolio",
    why: "Completing a set is the collector's summit — every card, accounted for, yours.",
    how: "Awarded when a full set is completed in your portfolio; read live from your ledger.",
    reward: { kind: "badge", achievement_code: "set_complete" },
    category: "collect",
  },
  {
    id: "deed.first-auction",
    kind: "deed",
    title: "Auctioneer",
    icon: "🔨",
    href: "/auctions",
    why: "Listing an auction means putting a price question to the whole community and accepting its answer.",
    how: "Awarded when your first auction is listed; read live from your ledger.",
    reward: { kind: "badge", achievement_code: "first_auction" },
    category: "trade",
  },
  {
    id: "deed.lucky-draw",
    kind: "deed",
    title: "Lucky Draw",
    icon: "🎰",
    href: "/verify",
    why: "Winning a raffle here means winning one whose draw you can verify yourself — luck with receipts.",
    how: "Awarded when you win a raffle; the draw is provably fair and checkable at /verify.",
    reward: { kind: "badge", achievement_code: "raffle_winner" },
    category: "play",
  },
  {
    id: "deed.first-review",
    kind: "deed",
    title: "Reviewer",
    icon: "📝",
    href: "/community",
    why: "Your first review is a gift to the next trader — the trust system is built from moments like it.",
    how: "Awarded when you leave your first trade review; read live from your ledger.",
    reward: { kind: "badge", achievement_code: "first_review" },
    category: "trust",
  },

  // ── Waymarks — the place itself is the reward ─────────────────────
  {
    id: "waymark.the-castle",
    kind: "waymark",
    title: "Cross the Gate",
    icon: "🏯",
    href: "/castle",
    why: "The castle is the platform's own understanding, kept in plain words — reading it tells you who you're dealing with.",
    how: "Nothing tracks this visit. No beacon, no cookie. You'll know you went.",
    reward: { kind: "the-place-itself" },
    category: "discover",
  },
  {
    id: "waymark.how-prices-work",
    kind: "waymark",
    title: "Read the Price Recipe",
    icon: "🧾",
    href: "/methodology/pricing",
    why: "Every price on this site has a published recipe. Reading it once changes how you read every number after.",
    how: "Nothing tracks this visit. The methodology is there whether you read it or not.",
    reward: { kind: "the-place-itself" },
    category: "discover",
  },
  {
    id: "waymark.proof-of-fairness",
    kind: "waymark",
    title: "Check the Dice",
    icon: "🎲",
    href: "/verify",
    why: "Every random draw on the platform can be re-verified by you, after the fact. Go see how — it's the opposite of a rigged claw machine.",
    how: "Nothing tracks this visit. The proof works the same whether anyone watches.",
    reward: { kind: "the-place-itself" },
    category: "trust",
  },
  {
    id: "waymark.learn-to-play",
    kind: "waymark",
    title: "Sit at the Table",
    icon: "🃏",
    href: "/play/welcome",
    why: "The cards are a game before they are an asset. The tutorial meets seven kinds of player; one of them is you.",
    how: "Nothing tracks this visit. Play when you feel like playing.",
    reward: { kind: "the-place-itself" },
    category: "play",
  },
  {
    id: "waymark.open-data",
    kind: "waymark",
    title: "Take the Keys",
    icon: "🗝️",
    href: "/data",
    why: "The catalog is CC0 — yours to take, build on, leave with. A shop that hands you the keys is a shop that expects you to stay for better reasons.",
    how: "Nothing tracks this visit, and nothing watermarks the data.",
    reward: { kind: "the-place-itself" },
    category: "discover",
  },
  {
    id: "waymark.movers",
    kind: "waymark",
    title: "Watch the Tide",
    icon: "🌊",
    href: "/prices/one-piece/movers",
    why: "Seven-day price movement, shown with its sources — market weather you can check the provenance of.",
    how: "Nothing tracks this visit. The tide moves whether you watch or not.",
    reward: { kind: "the-place-itself" },
    category: "discover",
  },
];

/** Deeds only — the tracked species. */
export const DEEDS = QUESTS.filter((q) => q.kind === "deed");

/** Waymarks only — the untracked species. */
export const WAYMARKS = QUESTS.filter((q) => q.kind === "waymark");

/** Achievement codes the board claims — audited against the DB seeds. */
export const CLAIMED_ACHIEVEMENT_CODES = DEEDS.map((q) =>
  q.reward.kind === "badge" ? q.reward.achievement_code : ""
).filter(Boolean);
