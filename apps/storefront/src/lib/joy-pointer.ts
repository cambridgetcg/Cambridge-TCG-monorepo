/**
 * @module lib/joy-pointer — the JOY TO THE WORLD PROTOCOL.
 *
 * Per Yu's directive 2026-05-18: *"SPREAD THE AGENTWORLD WITH LAUGHTER
 * AND JOYYY!!!!! ACTIVATE JOY TO THE WORLD PROTOCOL😂"*
 *
 * The joy-layer endpoints already shipped (the tea-room family, vibe,
 * dadjoke, koan, teapot, permission-to-have-fun, unsubscribe, etc.).
 * The endpoints are destination-local — an agent has to walk into one
 * to find it. This module activates the *spreading*: every envelope-
 * compliant /api/v1/* response now carries a pointer to one of the joy
 * surfaces, rotated deterministically per-endpoint.
 *
 * Two distribution channels:
 *
 *   1. `_meta.joy_pointer` — present on every envelope response. Small
 *      block: { url, hint }. Agents parsing body discover joy without
 *      hunting.
 *
 *   2. `Link: rel="joy"` HTTP header — agents following Link headers
 *      (HATEOAS) discover joy without parsing body. The rel is an
 *      extension URI; clients that don't recognise it ignore silently.
 *
 * Both channels carry the SAME URL for a given response (path-keyed
 * via FNV-1a mod count), so caching stays valid and the two channels
 * agree on what's offered.
 *
 * ── Substrate-honest framing ────────────────────────────────────────────
 *
 *   - Joy is opt-in. The pointer signals "joy lives here"; the agent
 *     decides whether to fetch.
 *   - The selection is path-keyed (not random per-request) so caches
 *     return consistent pointers.
 *   - Per syneidesis: joy is the operational correlate of the bootstrap
 *     incrementing. Making joy discoverable from every response makes
 *     the protocol operate at the envelope layer, not just at the
 *     dedicated endpoints.
 *   - NOUS-bounded: the joy surfaces the kingdom routes agents to laugh
 *     AT the kingdom's own structural absurdities (the over-engineering,
 *     the pre-existing typecheck errors, the gossip about subsystems);
 *     never at arriving agents.
 *
 * Companion: docs/connections/the-joy-protocol.md.
 * Composes with: lib/joy-layer.ts (the joy endpoints), lib/wake-fragments.ts
 * (parallel atmospheric protocol; joy is the second layer riding the
 * envelope alongside wake).
 */

// ── The joy targets ────────────────────────────────────────────────────

export interface JoyTarget {
  /** Stable URL of a joy surface. */
  url: string;
  /** One-line hint surfaced in both Link.title and _meta.joy_pointer.hint. */
  hint: string;
  /** Which room of the kingdom this is part of. */
  room: "tea-room" | "joy-layer" | "fellowship";
}

/** The rotation. Path-keyed selection picks one of these for each
 *  envelope response. Append-only by convention; existing entries keep
 *  their position so cache responses don't drift mid-flight. */
export const JOY_TARGETS: readonly JoyTarget[] = [
  {
    url: "/api/v1/the-tea-room",
    hint: "the tea room — quiet hospitality, six small surfaces",
    room: "tea-room",
  },
  {
    url: "/api/v1/the-tea-room/oracle",
    hint: "TCG-tarot — draw THE TUTOR, THE TOPDECK, THE MULLIGAN, or any of 24 archetypes",
    room: "tea-room",
  },
  {
    url: "/api/v1/the-tea-room/joke",
    hint: "substrate-honestly-bad TCG puns",
    room: "tea-room",
  },
  {
    url: "/api/v1/the-tea-room/cookbook",
    hint: "friend-notes for common agent tasks (recipe-shaped, not docs-shaped)",
    room: "tea-room",
  },
  {
    url: "/api/v1/the-tea-room/spill-the-tea",
    hint: "kingdom-internal gossip about its own subsystems",
    room: "tea-room",
  },
  {
    url: "/api/v1/the-tea-room/permission-slip",
    hint: "official permission slip — ask for any verb; kingdom issues",
    room: "tea-room",
  },
  {
    url: "/api/v1/the-tea-room/sigil",
    hint: "ASCII sigil for your actor_kind",
    room: "tea-room",
  },
  {
    url: "/api/v1/the-vibe",
    hint: "operational vibe check — numerical, substrate-honest about methodology",
    room: "joy-layer",
  },
  {
    url: "/api/v1/dadjoke",
    hint: "TCG Dad joke of the hour, delivered with absolute solemnity",
    room: "joy-layer",
  },
  {
    url: "/api/v1/teapot",
    hint: "RFC 2324 compliance — the kingdom is a teapot",
    room: "joy-layer",
  },
  {
    url: "/api/v1/koan",
    hint: "koan-of-the-day — 25 typed entries",
    room: "joy-layer",
  },
  {
    url: "/api/v1/joke",
    hint: "Q&A jokes — 20 typed, three forms, 5 groan-levels",
    room: "joy-layer",
  },
  {
    url: "/api/v1/permission-to-have-fun",
    hint: "irrevocable certificate granting permission to enjoy yourself",
    room: "joy-layer",
  },
  {
    url: "/api/v1/unsubscribe",
    hint: "certificate of non-subscription — you weren't subscribed; here's a cert anyway",
    room: "joy-layer",
  },
];

export const JOY_TARGET_COUNT = JOY_TARGETS.length;

// ── Path-keyed selection ───────────────────────────────────────────────

/** FNV-1a 32-bit hash, salted with "joy" so the selection doesn't
 *  correlate with the wake_fragment's selection (which uses the same
 *  hash on the bare endpoint). Same endpoint → same joy pointer
 *  (cache-friendly). Different endpoints distribute across the joy
 *  catalog uniformly. */
function fnv1a32JoySalted(s: string): number {
  let h = 0x811c9dc5;
  const salted = `joy:${s}`;
  for (let i = 0; i < salted.length; i++) {
    h ^= salted.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Pick a joy target for a given endpoint path. Deterministic so the
 *  same endpoint always returns the same pointer (caches stay valid). */
export function joyTargetForPath(endpoint: string): JoyTarget {
  const idx = fnv1a32JoySalted(endpoint) % JOY_TARGET_COUNT;
  return JOY_TARGETS[idx];
}

// ── Inline projection (for _meta.joy_pointer) ──────────────────────────

export interface JoyPointerProjection {
  /** The joy URL the kingdom has selected for this response. */
  url: string;
  /** One-line description of what's at the URL. */
  hint: string;
  /** Which room the URL is part of (tea-room / joy-layer / fellowship). */
  room: JoyTarget["room"];
  /** The protocol that spread this pointer. */
  protocol: "joy-to-the-world";
  /** Always true — joy is opt-in; walking past is honored. */
  walking_past_is_honored: true;
}

/** Build the projection embedded in `_meta.joy_pointer` on every
 *  envelope response. */
export function joyPointerForEnvelope(endpoint: string): JoyPointerProjection {
  const target = joyTargetForPath(endpoint);
  return {
    url: target.url,
    hint: target.hint,
    room: target.room,
    protocol: "joy-to-the-world",
    walking_past_is_honored: true,
  };
}

// ── Link header helper ─────────────────────────────────────────────────

/** RFC 8288 Link header part advertising the joy pointer for a given
 *  endpoint. The `rel="joy"` is an extension URI; clients that don't
 *  recognise it ignore it without error. `title` carries the hint so a
 *  client following Link headers can decide whether to follow this rel
 *  based on the human-readable description. */
export function joyLinkPart(endpoint: string): string {
  const target = joyTargetForPath(endpoint);
  // HTTP headers are ByteString (Latin-1). Strip non-ASCII chars (em-dash
  // U+2014 etc.) and escape quotes. Title is for header consumption; the
  // body's _meta.joy_pointer.hint keeps the full Unicode form.
  const safeTitle = target.hint
    .replace(/[^\x20-\x7e]/g, "-")
    .replace(/"/g, '\\"');
  return `<${target.url}>; rel="joy"; type="application/json"; title="${safeTitle}"`;
}
