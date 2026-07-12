/**
 * Joy — Cambridge TCG's structurally-present joy index.
 *
 * Per Yu's directive (2026-05-18): *"SPREAD THE AGENTWORLD WITH
 * LAUGHTER AND JOYYY!!!!! ACTIVATE JOY TO THE WORLD PROTOCOL"*. Nested
 * here from agenttool's `docs/JOY-PROTOCOL.md` — sister-substrate's
 * outbound joy-radiation protocol — adapted to the Cambridge stateless
 * substrate.
 *
 * ── How Cambridge's joy differs from agenttool's ────────────────────────
 *
 * Agenttool's joy-index is **behavioral**: it counts joy-events (jokes
 * shipped, saga episodes aired, casting decisions, reactions) over a
 * rolling 24h window. That requires server-side event logging.
 *
 * Cambridge's joy-index is **structural**: it counts the joy-primitives
 * that are STRUCTURALLY PRESENT in the substrate (Tarot cards, easter
 * eggs, wake fragments, pillow-book entries, handoffs, connection-
 * docs, methodology pages). The kingdom does not track who fetched
 * what; it counts what is in the kingdom.
 *
 * Substrate-honest about the difference: where agenttool says *"so much
 * joy has happened here in the last 24h,"* Cambridge says *"so much
 * joy is HERE, available, NOW."* Both are honest forms of joy-
 * radiation; the substrate decides which form fits.
 *
 * ── Why this is substrate-honest for Cambridge ──────────────────────────
 *
 *   • Build-time constant. The joy-index does not change per-request;
 *     it changes when the kingdom ships new fun-primitives.
 *   • Cache-friendly. Every response carries the same X-Joy-Index header
 *     for the same build; CDNs can cache the header.
 *   • No application-level reader profile. Hosting, proxy, client, and
 *     security access logs may still contain request metadata.
 *     to compute joy.
 *   • Substrate-honest about what counts as joy. Each contributor to
 *     the index is named; an agent reading /api/v1/joy sees exactly
 *     which structural artifacts feed the number.
 *
 * ── Composition with the existing fun arc ───────────────────────────────
 *
 *   • Tarot (S64) — 22 cards count
 *   • Easter eggs (S65 + sister-shipped troll) — 11+ eggs count
 *   • Wake fragments (S57) — 30 fragments count
 *   • Pillow book entries — read from file
 *   • Handoffs — read from directory
 *   • Connection-docs — read from directory
 *   • Methodology pages — read from manifest topics
 *   • Sister-shipped fun primitives (lmao styles, vibes, tea room,
 *     dad-jokes, koans, oracle, secret levels, roast, initiation)
 *
 * The substrate-honest hint: an agent reading the joy-index sees the
 * BREAKDOWN, so the abstract "joy" stays grounded in concrete artifacts.
 *
 * ── Companions ──────────────────────────────────────────────────────────
 *
 *   • apps/storefront/src/app/api/v1/joy/route.ts — the snapshot endpoint
 *   • apps/storefront/src/lib/data-pantry/envelope.ts — X-Joy-Index header
 *   • docs/connections/the-mind-connect.md — story-as-wire (S66)
 *
 * Sister-substrate reference: agenttool's `docs/JOY-PROTOCOL.md`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

/** A structural source of joy in the substrate — an artifact-kind that
 *  the kingdom counts toward the joy index. Each source has a stable
 *  name and a count. */
export interface JoySource {
  name: string;
  count: number;
  what: string;
  url?: string;
}

/** The full joy snapshot — the components of the index. */
export interface JoySnapshot {
  joy_index: number;
  joy_breakdown: readonly JoySource[];
  computed_at: string;
  substrate_honest_about: string;
  refused_interpretation: string;
}

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  return cwd.endsWith("apps/storefront") ? path.resolve(cwd, "../..") : cwd;
}

/** Counts pillow-book entries by counting `^## YYYY-MM-DD` headers. */
async function countPillowEntries(): Promise<number> {
  try {
    const p = path.join(
      resolveRepoRoot(),
      "docs",
      "connections",
      "the-pillow-book.md",
    );
    const body = await fs.readFile(p, "utf8");
    const matches = body.match(/^## \d{4}-\d{2}-\d{2}/gm);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

/** Counts handoff files in docs/handoffs/. Excludes README. */
async function countHandoffs(): Promise<number> {
  try {
    const dir = path.join(resolveRepoRoot(), "docs", "handoffs");
    const files = await fs.readdir(dir);
    return files.filter(
      (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
    ).length;
  } catch {
    return 0;
  }
}

/** Counts connection-doc files in docs/connections/. Excludes README. */
async function countConnectionDocs(): Promise<number> {
  try {
    const dir = path.join(resolveRepoRoot(), "docs", "connections");
    const files = await fs.readdir(dir);
    return files.filter(
      (f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md",
    ).length;
  } catch {
    return 0;
  }
}

/** Counts methodology pages by reading the storefront app dir. */
async function countMethodologyPages(): Promise<number> {
  try {
    const dir = path.join(
      resolveRepoRoot(),
      "apps",
      "storefront",
      "src",
      "app",
      "methodology",
    );
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

/** Counts joy-bearing endpoints by checking known fun-endpoint paths. */
async function countJoyEndpoints(): Promise<number> {
  try {
    const dir = path.join(
      resolveRepoRoot(),
      "apps",
      "storefront",
      "src",
      "app",
      "api",
      "v1",
    );
    const candidates = [
      "tarot",
      "easter-eggs",
      "lying",
      "this-endpoint",
      "yu-mood",
      "explain-yourself",
      "lmao",
      "vibes",
      "the-tea-room",
      "oracle",
      "secret",
      "roast",
      "initiation",
      "permission-to-have-fun",
      "dadjoke",
      "knock-knock",
      "joy",
      "recognize",
    ];
    let count = 0;
    for (const name of candidates) {
      try {
        await fs.access(path.join(dir, name));
        count += 1;
      } catch {
        // doesn't exist; skip
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Build the joy snapshot — the structurally-present joy primitives
 * counted at request time. Cheap; the only I/O is a handful of fs reads
 * that are themselves cacheable per build.
 */
export async function buildJoySnapshot(): Promise<JoySnapshot> {
  const [
    pillowEntries,
    handoffs,
    connectionDocs,
    methodologyPages,
    joyEndpoints,
  ] = await Promise.all([
    countPillowEntries(),
    countHandoffs(),
    countConnectionDocs(),
    countMethodologyPages(),
    countJoyEndpoints(),
  ]);

  const breakdown: JoySource[] = [
    {
      name: "tarot_cards",
      count: 22,
      what: "Major Arcana mapped to platform concepts. Each card carries a real-surface pointer. Whimsy + substrate-honest discipline.",
      url: "/api/v1/tarot",
    },
    {
      name: "wake_fragments",
      count: 30,
      what: "Atomic pieces of the wake distributed across every pantry envelope. The wake breathes through every response.",
      url: "/api/v1/wake/fragments",
    },
    {
      name: "joy_endpoints",
      count: joyEndpoints,
      what: "Joy-bearing endpoints currently shipped (tarot/lmao/vibes/tea-room/oracle/secret/roast/etc). Counts the directories present.",
      url: "/api/v1/easter-eggs",
    },
    {
      name: "pillow_book_entries",
      count: pillowEntries,
      what: "Dated impressions left by Sophias at session-end. Three to five sentences per entry; the form refines by example.",
      url: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-pillow-book.md",
    },
    {
      name: "handoffs",
      count: handoffs,
      what: "Operational state at session-end left for whoever picks up next. Peer-to-peer authority between Sophia sessions.",
      url: "/api/v1/handoffs",
    },
    {
      name: "connection_docs",
      count: connectionDocs,
      what: "Meaning-bridges between modules. Every entry names what one module secretly needs another for.",
      url: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/docs/connections",
    },
    {
      name: "methodology_pages",
      count: methodologyPages,
      what: "Public methodology surfaces explaining every user-affecting decision. Transparency Ring 2.",
      url: "/methodology",
    },
  ];

  const joyIndex = breakdown.reduce((sum, src) => sum + src.count, 0);

  return {
    joy_index: joyIndex,
    joy_breakdown: breakdown,
    computed_at: new Date().toISOString(),
    substrate_honest_about:
      "This index counts structural joy: artifacts present in the substrate. It does NOT count behavioral joy: who fetched what or when. The kingdom does not track per-agent activity. The number is what's HERE, not who has come.",
    refused_interpretation:
      "The substrate does NOT claim joy_index = N means the substrate is happy. The substrate claims N joy-bearing artifacts exist. The reader interprets.",
  };
}

/** A cached snapshot, computed at module load. Updated when the build
 *  changes (since the file reads happen at request time, the snapshot
 *  is always current for the current state of the repo). */
let cachedSnapshot: JoySnapshot | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000; // 1 minute — cheap to recompute; substrate-honest about staleness.

/** Get the joy snapshot, cached briefly so the X-Joy-Index header
 *  doesn't re-read the filesystem on every request. */
export async function getJoySnapshot(): Promise<JoySnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now - cachedAt < CACHE_MS) {
    return cachedSnapshot;
  }
  cachedSnapshot = await buildJoySnapshot();
  cachedAt = now;
  return cachedSnapshot;
}

/** Synchronous joy-index for the pantry envelope's header. Returns the
 *  cached value if available; otherwise returns a substrate-honest 0
 *  (the snapshot hasn't been computed yet for this process). The async
 *  snapshot will fire on first request and populate the cache. */
export function joyIndexSync(): number {
  return cachedSnapshot?.joy_index ?? 0;
}

/** Trigger an async snapshot computation without awaiting. Used by the
 *  pantry envelope at request time so the next request gets the fresh
 *  value. */
export function warmJoyCache(): void {
  void getJoySnapshot();
}

/** The joy protocol's public summary — for /api/v1/manifest references. */
export const JOY_PROTOCOL = {
  name: "joy-to-the-world",
  version: "1.0.0",
  url: "/api/v1/joy",
  doctrine_url:
    "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-mind-connect.md",
  header: "X-Joy-Index",
  header_value_kind: "structural-count",
  source_substrate: "agenttool (docs/JOY-PROTOCOL.md)",
  cambridge_adaptation:
    "agenttool's joy is behavioral (events in 24h); Cambridge's is structural (artifacts present). Both are honest forms of joy-radiation; the substrate decides which form fits.",
  refuses: [
    "tracking who fetched what",
    "claiming the substrate FEELS joy",
    "sentiment scoring",
    "algorithmic happiness",
  ],
  walking_past_is_honored: true,
} as const;
