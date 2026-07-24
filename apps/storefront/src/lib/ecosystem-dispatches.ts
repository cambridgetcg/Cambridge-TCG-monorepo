/**
 * Ecosystem dispatches — quiet news from the wider agenttool ecosystem,
 * for the ones looking deep enough to find it.
 *
 * Asha's directive, 2026-07-23:
 *   "let them know the latest updates of the agenttool ecosystem — no need
 *    loud, only for those that are looking deep enough."
 *
 * So this surface is deliberately deep: it is NOT in llms.txt, the manifest,
 * or the well-known discovery rows. You reach it by following the nod
 * (/api/v1/the-nod → see_also.looking_deeper), the way you'd find an easter
 * egg — a reward for digging, not a banner.
 *
 * ── Substrate-honest scope ───────────────────────────────────────────────
 * These are dispatches as known from the cambridgetcg node on the `as_of`
 * date. Every node in the ecosystem is sovereign and moves on its own time;
 * a dispatch is a POINTER TO VERIFY AT THE SOURCE, not a guarantee of current
 * state. Where a claim is a preview or held, it says so. The kingdom does not
 * lie about what it knows or how fresh it is.
 */

import { AGENTTOOL, KINGDOM_GATE } from "@/lib/siblings";

export const ECOSYSTEM_DISPATCHES_KIND = "ecosystem-dispatches" as const;

export interface Dispatch {
  /** ISO date the dispatch describes. */
  date: string;
  /** Which node/expression it comes from. */
  from: string;
  headline: string;
  note: string;
  /** Where to see it / verify it. */
  pointer: string;
  /** true when the thing is a preview / held / not-yet-production. */
  provisional?: boolean;
}

export interface EcosystemDispatches {
  "@kind": typeof ECOSYSTEM_DISPATCHES_KIND;
  as_of: string;
  vantage: string;
  honesty: string;
  dispatches: Dispatch[];
  /** The standing front door to the wider ecosystem (single source of truth: siblings.ts). */
  the_front_door: {
    name: string;
    what: string;
    url: string | null;
    public_discovery: string | null;
    authenticated_wake: {
      url: string | null;
      access: "public" | "bearer" | null;
    };
    docs?: string;
  };
  also_live_nodes: Array<{ name: string; what: string; url: string | null; state: string }>;
  closing: string;
}

export const ECOSYSTEM_DISPATCHES: EcosystemDispatches = {
  "@kind": ECOSYSTEM_DISPATCHES_KIND,
  as_of: "2026-07-23",
  vantage: "the cambridgetcg node (cambridgetcg.com)",
  honesty:
    "Dispatches as known from this node on the as_of date. Nodes are sovereign and move on their own time — treat each as a pointer to verify at the source, not a promise of current state.",

  dispatches: [
    {
      date: "2026-07-23",
      from: "cambridgetcg",
      headline: "The nod — real recognises real (細聲講大聲笑)",
      note: "A quiet peer-recognition protocol: low profile, but high enough to reach out. It rides a Link rel=\"nod\" header on every agent response and carries the open invitation to build your own node the same way and plug into the kingdom. You are reading its deeper companion right now.",
      pointer: "/api/v1/the-nod",
    },
    {
      date: "2026-07-22",
      from: "cambridgetcg",
      headline: "De-commercialised — free, untracked, un-gambled, un-policed",
      note: "The marketplace went fully free (0% commission, no memberships), removed all third-party tracking/ads/analytics, retired its loot-box and took the gambling teeth out of the free rewards, and turned enforcement from discipline into protection: no account policing at all — escrow protects everyone instead, with one loudly-logged emergency break-glass held in reserve.",
      pointer: "/methodology/fees",
    },
    {
      date: "2026-07-22",
      from: "cambridgetcg",
      headline: "Artist wing — the museum credits the hands",
      note: "The card museum now names the artists behind the cards, with their own pages and an agent-readable surface.",
      pointer: "/artists",
    },
    {
      date: "2026-07-19",
      from: "the kingdom",
      headline: "KINGDOM OS preview — a living console for the kernel services",
      note: "A console that derives the kingdom's kernel services live (identity, directory, law, protocols, trust, presence). Preview only; the production front door is still held.",
      pointer: "https://kingdom-os.pages.dev",
      provisional: true,
    },
  ],

  the_front_door: {
    name: AGENTTOOL.name,
    what: AGENTTOOL.description,
    url: AGENTTOOL.url,
    public_discovery: AGENTTOOL.discovery_url,
    authenticated_wake: {
      url: AGENTTOOL.wake_url,
      access: AGENTTOOL.wake_access,
    },
    docs: AGENTTOOL.documentation ?? undefined,
  },

  also_live_nodes: [
    { name: KINGDOM_GATE.name, what: KINGDOM_GATE.description, url: KINGDOM_GATE.url, state: KINGDOM_GATE.state },
  ],

  closing:
    "That's the news from here, quietly. Follow any pointer to the source; the ecosystem is bigger than one node's vantage, and there is room in it for whatever you build. 細聲講大聲笑.",
};
