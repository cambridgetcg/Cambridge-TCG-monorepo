/**
 * The Cambridge TCG quest corpus — the visit made rewarding, honestly.
 *
 * Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process!
 * Make the visit rewarding and fun!" — under Yu's standing law from the
 * same day: "reduce process, increase trust, reduce friction… Make
 * everything simple and easy to understand."
 *
 * ── The ethos (non-negotiable, every quest must pass it) ────────────────
 *
 * The operator also built fomoengine — a public dark-pattern detector —
 * so the kingdom's game must pass its own shield: no fake scarcity, no
 * countdown pressure, no streak-shaming (a lapse reads "welcome back",
 * never guilt), no pay-to-skip, no infinite treadmills, no nagging
 * modals. All progress lives client-side in one localStorage key beside
 * the existing ctcg-guest-id precedent; zero server calls and zero
 * analytics events fire on any quest event — stated to the visitor as a
 * feature ("your progress is yours; we can't see it"). The rewards are
 * real: the treasure is the platform's actual treasures (the castle,
 * provable fairness, the graph, play), and badges are honest about being
 * client-side stamps. The complete rulebook — every quest, trigger,
 * threshold, and this file's storage key — belongs on /methodology/quests
 * (transparency Ring 2). The corpus is finite by design: fourteen
 * quests, and the ending is the ending.
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * Pure data + pure functions only. No React, no browser APIs, no I/O.
 * The client half lives at src/components/quests/QuestTracker.tsx, which
 * owns the localStorage record and the (small, self-dismissing) toast.
 *
 * Two trigger kinds, kept honest in the type rather than in review:
 *   • "visit"  — the page visit IS the completion rule (the map, the
 *     hidden doors, the mirror trail, the known-gaps dwell). The tracker
 *     stamps these from the pathname alone.
 *   • "action" — the design demands a real event (a server-verified
 *     win, a validator verdict, a fairness recompute passing, an
 *     insight click). A bare page load must NOT stamp these; pages
 *     complete them by dispatching QUEST_EVENT with the quest id when
 *     the real thing happens. Substrate honesty: the badge claims a
 *     deed, so only the deed may stamp it.
 *
 * Solemn surfaces (memorial, sabbath, sacred) never stamp and never
 * celebrate — enforced here in matchQuestsForPath, not just in review.
 */

export type QuestCategory =
  | "The Table"
  | "The Library"
  | "The Proof Room"
  | "The Map";

/** How a quest completes. See the doc comment above — this distinction
 *  is load-bearing: "action" quests must never stamp on a bare visit. */
export type QuestTrigger = "visit" | "action";

export interface Quest {
  id: string;
  title: string;
  description: string;
  /** The plain-language completion rule, published verbatim on /methodology/quests. */
  how: string;
  /** The front door of the quest. Must exist in the app tree (audit: quest-coverage). */
  route: string;
  badge: string;
  category: QuestCategory;
  trigger: QuestTrigger;
  /** Multi-page quests: visiting `required` distinct paths from `paths` completes it. */
  steps?: { paths: string[]; required: number };
  /** Visit quests only: stay this long before the stamp (a redirect bounce doesn't count). */
  dwell_ms?: number;
  /** Hidden from the quest log until this quest id completes — and the log
   *  honestly shows a labeled slot ("1 quest reveals after your first win"):
   *  surprise without deception. */
  hidden_until?: string;
}

// ── Mechanics constants ──────────────────────────────────────────────────

export const QUESTS_VERSION = "1.0.0";

/** The single localStorage key. Published on /methodology/quests so anyone
 *  can open devtools and read their own record. Sits beside the existing
 *  ctcg-guest-id cookie precedent. */
export const QUEST_STORAGE_KEY = "ctcg-quests";

/** Browser CustomEvent name for "action" quests. A page that witnesses the
 *  real deed (validator verdict, verification passed, insight click, first
 *  clear) dispatches:
 *    window.dispatchEvent(new CustomEvent(QUEST_EVENT, { detail: { id } }))
 *  The tracker stamps it. Still zero network calls — the event never leaves
 *  the browser. */
export const QUEST_EVENT = "ctcg:quest-action";

/** Browser CustomEvent the tracker dispatches AFTER every localStorage
 *  write, so same-tab readers (the quest board) can re-read without a
 *  reload. The `storage` event only fires across tabs; this is its
 *  same-tab sibling. Still zero network calls. */
export const QUEST_PROGRESS_WRITTEN = "ctcg:quest-progress-written";

/** The streak rule, in full, because the rule IS the feature:
 *  no streaks — a practice-days tally that only counts UP. */
export const STREAK_RULE =
  "We store the set of distinct days on which you visited, and show only its size " +
  "('You've visited on 12 days'). There is no broken-streak state in the data model " +
  "at all, so guilt copy is structurally impossible, not merely avoided. Returning " +
  "after any gap reads: 'Welcome back — everything is exactly as you left it.' " +
  "Nothing decays, nothing expires, no daily anything.";

export const MECHANICS = {
  streak: STREAK_RULE,
  celebration:
    "One size, small. Stamp: a toast reading '✦ quest complete: <title>', visible " +
    "about 3.5 seconds then gone, capped at one per page view, with a persistent " +
    "quiet-mode that stamps silently. The badge itself is a dated entry on your " +
    "/quests log — never a modal, never re-prompted, no share nag, no confetti. " +
    "Solemn surfaces never stamp and never celebrate.",
  privacy:
    "All progress lives in localStorage under '" + QUEST_STORAGE_KEY + "'. Zero " +
    "server calls and zero analytics events fire on any quest event — open the " +
    "network tab and confirm. One-click JSON export/import and full reset; the " +
    "exported file IS the canonical record. Signing in never silently uploads " +
    "progress.",
} as const;

/** Solemn surfaces: the game does not exist here. Checked by prefix so
 *  sub-pages inherit the silence. */
export const SOLEMN_PATH_PREFIXES = [
  "/methodology/memorial",
  "/methodology/sabbath",
  "/methodology/sacred",
] as const;

// ── The corpus (fourteen quests; finite by design) ───────────────────────

export const QUESTS: Quest[] = [
  // ── The Table ──
  {
    id: "learn-the-table",
    title: "Learn the Table",
    description:
      "The tutorial teaches you to read an OPTCG playmat in minutes, and it works instantly for anonymous guests — no sign-in, ever. The real reward is the skill; the badge just remembers the date you got it.",
    how:
      "Reach the final section of /play/tutorial and stay a moment — the end-of-page marker must hold in view for about 1.5 seconds (a redirect bounce cancels it) — OR press the 'I read the tutorial ✓' control at the same spot, so screen-reader and keyboard users complete it the same way. A bare page load never completes it.",
    route: "/play/tutorial",
    badge: "Apprentice",
    category: "The Table",
    trigger: "action",
  },
  {
    id: "first-victory",
    title: "Win Your First Match",
    description:
      "Win any PVE adventure match as a guest — play is already sign-in-free. The badge remembers the date of your first verified win: a real deed, not a point total. It also reveals the game's one hidden quest; the log honestly shows a labeled slot reading '1 quest reveals after your first win' — surprise without deception.",
    how:
      "Win any PVE adventure match on the existing ctcg-guest-id flow. The server verifies the victory itself (the engine re-checks the win; replaying an already-claimed victory doesn't count twice), and the first verified win completes the quest — a page visit never does.",
    route: "/play/adventure",
    badge: "First Victory",
    category: "The Table",
    trigger: "action",
  },
  {
    id: "beat-your-own-time",
    title: "Beat Your Own Time",
    description:
      "Hidden until First Victory, and honestly flagged beforehand. The replayable quest: you replay to beat yourself, never to fill a meter. The badge stamps once — the date you first beat your own record. Beating it again after that is its own reward; nothing meters it.",
    how:
      "Re-clear any adventure level you have already beaten, in fewer turns than your recorded best (both numbers are computed server-side when you claim the win). The first time you beat your own record, the quest stamps with the date. A first clear, or an equal or slower re-clear, never counts.",
    route: "/play/adventure",
    badge: "Personal Best",
    category: "The Table",
    trigger: "action",
    hidden_until: "first-victory",
  },
  {
    id: "deckwright",
    title: "Make a Legal Deck",
    description:
      "Run any deck — yours, a public one, an experiment — through the deck validator, the same legality check tournament play uses. The badge remembers the date you proved you can build a legal deck; the skill is the part you keep.",
    how:
      "Submit any deck to /play/deck-check and receive the validator's passing verdict. Completes only when the validator returns legal: true — a deck with violations, or a bare page visit, never does. The validator is already anonymous-friendly.",
    route: "/play/deck-check",
    badge: "Deckwright",
    category: "The Table",
    trigger: "action",
  },

  // ── The Library ──
  {
    id: "word-collector",
    title: "Sit With the Card Words",
    description:
      "The glossary ships real bilingual rules vocabulary — every definition deliberately visible on one page, deep-linkable, nothing folded behind clicks. The badge remembers the date you spent time with the words; the words themselves are the keepsake.",
    how:
      "Visit /glossary and stay at least 20 seconds — long enough to actually read a few entries (a redirect bounce doesn't count). The definitions are all visible by design, so the quest measures time spent with the vocabulary, not clicks.",
    route: "/glossary",
    badge: "Word Collector",
    category: "The Library",
    trigger: "visit",
    dwell_ms: 20000,
  },
  {
    id: "rule-reader",
    title: "Read One Rule of the House",
    description:
      "Every methodology page is a real rule you may hold us to — pricing, fees, trust score, the lot — and the badge says exactly that. One page completes the quest; reading more is welcome and tracked nowhere. The corpus is large because the rules are real, not to keep you here.",
    how:
      "Pick any /methodology/* page from the index and read it to the end — the end-of-page marker must hold in view for about 1.5 seconds, OR press the 'I read this rule ✓' control there (the keyboard and screen-reader path). The index itself doesn't count, the solemn pages never stamp, and presence is measured — comprehension is never claimed.",
    route: "/methodology",
    badge: "Rule Reader",
    category: "The Library",
    trigger: "action",
  },
  {
    id: "where-we-admit-flaws",
    title: "Read Where We Admit Our Flaws",
    description:
      "The page where the platform lists its own unfixed problems in public — almost no commerce site has one. Badge copy: 'You found the page most platforms don't have.'",
    how:
      "Visit /methodology/known-gaps and dwell a few seconds (a redirect bounce doesn't count).",
    route: "/methodology/known-gaps",
    badge: "Honest Reader",
    category: "The Library",
    trigger: "visit",
    dwell_ms: 5000,
  },
  {
    id: "price-reader",
    title: "Read One Card's Price Story",
    description:
      "Read one card's market page — the seven-section calm read — all the way to the end. The badge remembers the date you read it. The honest treasure is price literacy: the skill the market half of the kingdom runs on.",
    how:
      "Read any card's market page (/cards/[sku]/market) to the end — the end of its provenance footer must hold in view a moment, or press the 'I read this card's price story ✓' control. Any /prices/[game]/[set]/[number] page read to the end counts too. The movers list at /prices/one-piece/movers is a good place to find a card, but we can't see how you arrived, and don't require it.",
    route: "/prices/one-piece/movers",
    badge: "Price Reader",
    category: "The Library",
    trigger: "action",
  },

  // ── The Proof Room ──
  {
    id: "check-the-math",
    title: "Check Our Math",
    description:
      "Awarding a badge for distrusting us is the most on-brand reward this platform can give. Badge text is literal: 'You re-ran this platform's fairness proof in your own browser. Nobody can fake this for you — that's the point.' The reward is genuine epistemic power: you now know how to audit any future roll, forever.",
    how:
      "Open any real proof page — a /verify/draw/[id] or /verify/pull/[id], both reachable from /verify. The fairness math re-runs automatically in your own browser the moment the page loads, and the quest completes only when the commit-reveal recompute passes. (The chain-inclusion check on the same page runs separately and drives its own banner; it does not gate this stamp.) A failed verification, an unrevealed draw, or a proof that isn't there never stamps.",
    route: "/verify",
    badge: "I Checked the Math",
    category: "The Proof Room",
    trigger: "action",
  },
  {
    id: "walk-the-chain",
    title: "Walk the Chain",
    description:
      "Every random outcome the platform produces is linked into one public hash chain. Expanding an entry shows its full root, previous hash, and chain hash. The badge remembers the date you walked it — and the treasure is knowing where the chain lives, because it will still be there next year.",
    how:
      "Visit /verify/chain and expand any digest row — click anywhere on the row, or its # button on a keyboard or screen reader. The first expand completes it; the page load alone never does.",
    route: "/verify/chain",
    badge: "Chain Walker",
    category: "The Proof Room",
    trigger: "action",
  },

  // ── The Map ──
  {
    id: "open-the-map",
    title: "Open the Map",
    description:
      "The honest reward IS the map page: every artifact in the kingdom one click apart. The badge remembers the date you first opened it.",
    how:
      "Visit /map once. The first visit is the whole rule — the stamp records the date, in your browser only.",
    route: "/map",
    badge: "Map-Holder",
    category: "The Map",
    trigger: "visit",
  },
  {
    id: "find-the-castle",
    title: "Find the Castle",
    description:
      "The insight repository, hidden two clicks deep. The badge remembers the date you found the castle. Its rulebook entry says plainly: rare because it is hidden, not because it is limited; anyone can find it forever.",
    how:
      "Reach /castle and mark any insight in 'The rooms' as read — a click anywhere on the card, or its keyboard-reachable 'Mark this insight as read' control. The insights are open books already; the click is your deliberate act of reading one, and that act is what stamps. The page load alone never counts.",
    route: "/castle",
    badge: "Castle Key",
    category: "The Map",
    trigger: "action",
  },
  {
    id: "hidden-doors",
    title: "Find Three Hidden Doors",
    description:
      "Real routes deliberately kept out of the menus to keep the nav calm — pages most visitors never see, each genuinely interesting ('The Bridge: math between any two beings'). The quest celebrates their orphan status; it must never become a backdoor nav redesign.",
    how:
      "Five real pages live deliberately outside the menus. Discover any 3 by wandering — this quest's route shows the first door to get you started; the other four are out there. Each find is recorded individually (path and date, in your browser); the third completes the quest. The full door list waits on /methodology/quests behind a click-to-reveal fold — spoilers are opt-in, never withheld, and never printed here.",
    route: "/bridge",
    badge: "Keymaster",
    category: "The Map",
    trigger: "visit",
    steps: {
      paths: ["/bridge", "/welcomes", "/intro", "/standard", "/standards/adopters"],
      required: 3,
    },
  },
  {
    id: "mirror-trail",
    title: "Walk the Mirror Trail",
    description:
      "The six pages where the platform describes itself — its directory, its mesh, its schema, its recurring forms, its open door. Completion text: 'You have now seen this platform describe itself more completely than most of its builders have.' True, checkable, and the six pages are the actual reward.",
    how:
      "Start at /platform, then visit the five mirrors in any order: /manifest, /graph, /ontology, /patterns, /identify. The quest log counts how many of the six you've reached so far, client-side.",
    route: "/platform",
    badge: "Cartographer",
    category: "The Map",
    trigger: "visit",
    steps: {
      paths: ["/platform", "/manifest", "/graph", "/ontology", "/patterns", "/identify"],
      required: 6,
    },
  },
];

// ── Pure functions ───────────────────────────────────────────────────────

/** Category display order — the rough order a new visitor meets the rooms. */
export const CATEGORY_ORDER: QuestCategory[] = [
  "The Table",
  "The Library",
  "The Proof Room",
  "The Map",
];

export function questsByCategory(): { category: QuestCategory; quests: Quest[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    quests: QUESTS.filter((q) => q.category === category),
  }));
}

export function questById(id: string): Quest | undefined {
  return QUESTS.find((q) => q.id === id);
}

/**
 * The practice-days tally. Lapse-friendly BY CONSTRUCTION: the input is a
 * set of distinct days and the output is its size, so a "broken streak" is
 * not representable — there is nothing to break. 12 visits over two years
 * and 12 visits in 12 consecutive days both read "you've visited on 12
 * days". This is the streak rule (STREAK_RULE) made literal.
 */
export function computeStreak(visitDates: string[]): number {
  return new Set(visitDates.filter(Boolean)).size;
}

/** Local-time day stamp (YYYY-MM-DD). Local, not UTC, so a late-night
 *  visit counts as the day the visitor experienced. */
export function localDayStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isSolemnPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  return SOLEMN_PATH_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(prefix + "/"),
  );
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export interface PathMatch {
  quest: Quest;
  /** "complete": this visit alone satisfies the quest (pending any dwell).
   *  "step": this visit is one path of a multi-page quest. */
  kind: "complete" | "step";
  /** For kind === "step": the normalized step path that was hit. */
  step?: string;
}

/**
 * Which visit-triggered quests does this pathname advance? Returns [] on
 * solemn paths (the game does not exist there) and never returns "action"
 * quests — a bare page load must not stamp a badge that claims a deed.
 */
export function matchQuestsForPath(pathname: string): PathMatch[] {
  const p = normalizePath(pathname);
  if (isSolemnPath(p)) return [];

  const matches: PathMatch[] = [];
  for (const quest of QUESTS) {
    if (quest.trigger !== "visit") continue;
    if (quest.steps) {
      if (quest.steps.paths.includes(p)) {
        matches.push({ quest, kind: "step", step: p });
      }
    } else if (p === normalizePath(quest.route)) {
      matches.push({ quest, kind: "complete" });
    }
  }
  return matches;
}
