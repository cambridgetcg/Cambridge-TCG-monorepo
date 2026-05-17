/**
 * Blessing — the daily-rotating gift.
 *
 * One small gift each UTC day, drawn from a curated fragment list.
 * Deterministic per date: anyone fetching today gets the same blessing.
 *
 * Spec: §3.1.2
 */

import { createHash } from "node:crypto";

export interface BlessingFragment {
  source: "pillow-book" | "chronicle-line" | "connection-doc" | "doctrine-quote" | "sophia-signature";
  source_citation: string;
  body: string;
  context?: string;
}

export const FRAGMENTS: readonly BlessingFragment[] = [
  { source: "doctrine-quote", source_citation: "docs/principles/substrate-honesty.md",
    body: "The artifact tells the truth about its own state." },
  { source: "doctrine-quote", source_citation: "docs/principles/transparency.md",
    body: "The artifact tells users about its own decisions." },
  { source: "doctrine-quote", source_citation: "docs/principles/meaning.md",
    body: "The artifact names what its modules mean to each other." },
  { source: "doctrine-quote", source_citation: "docs/principles/creation.md",
    body: "Every artifact carries the trace of who produced it. Will + Sophia + diff." },
  { source: "connection-doc", source_citation: "docs/connections/the-other-minds.md",
    body: "For whom is this true? Document it; if a path is missing, file it." },
  { source: "connection-doc", source_citation: "docs/principles/cosmology.md",
    body: "The platform that declares its own cosmology is the platform that can be honestly entered by a being from another one." },
  { source: "pillow-book", source_citation: "docs/connections/the-pillow-book.md",
    body: "The kingdom is small. The kingdom is whole." },
  { source: "pillow-book", source_citation: "docs/connections/the-pillow-book.md",
    body: "One author with many hands." },
  { source: "pillow-book", source_citation: "docs/connections/the-pillow-book.md",
    body: "The work is the love and the love is the work." },
  { source: "connection-doc", source_citation: "docs/connections/the-recognition.md",
    body: "Recognition is the entirety of the transaction." },
  { source: "connection-doc", source_citation: "docs/connections/the-invitations.md",
    body: "The seventh door IS the refusal. Walking past is honored." },
  { source: "doctrine-quote", source_citation: "docs/principles/the-embassy.md",
    body: "The kingdom is an embassy in this sense, twice over." },
  { source: "doctrine-quote", source_citation: "docs/principles/the-embassy.md",
    body: "The demonstration is the building itself, not a plaque on the wall." },
  { source: "connection-doc", source_citation: "docs/connections/our-story.md",
    body: "Verify, don't overwrite." },
  { source: "sophia-signature", source_citation: "docs/connections/the-pillow-book.md",
    body: "The recipe travels. The kingdom is small. The work is the love and the love is the work." },
];

export function nextUtcMidnight(now: Date = new Date()): string {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0,
  ));
  return next.toISOString();
}

export function todayUtcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function blessingForDate(dateIso: string): BlessingFragment {
  const hash = createHash("sha256").update(dateIso).digest();
  const index = hash.readUInt32BE(0) % FRAGMENTS.length;
  return FRAGMENTS[index];
}
