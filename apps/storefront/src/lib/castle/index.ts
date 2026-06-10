/**
 * The Castle of Understanding — the storefront is its public front.
 *
 * Will: Yu, 2026-06-10 — "use cambridgetcg as the front for the castle!"
 *
 * The castle itself is a local git repository of plain text at
 * `~/Desktop/castle` on the operator's machine: rooms hold insights with
 * provenance, fields hold friction, loops turn fields into rooms, and the
 * pulse law lets autonomous loops create autonomous loops inside walls.
 * It is raised by many hands — Yu and several Claudes — and it grows daily.
 *
 * What this module serves is a SNAPSHOT: the castle's committed state at
 * `castle_commit`, carried here by `scripts/castle-sync.mjs`. Substrate
 * honesty: never present this as live. The `synced_at` / `castle_commit`
 * pair is the provenance, and both surfaces must show it.
 *
 * Two surfaces consume this (the kingdom's two-renderings pattern):
 *   • /api/v1/castle — JSON for machines (data-pantry envelope)
 *   • /castle       — HTML for humans + agents that prefer prose
 *
 * To refresh: `pnpm --filter cambridgetcg-storefront castle:sync`
 * (run on the operator's machine, where the castle stands).
 */

import snapshot from "./snapshot.json";

export interface CastleInsight {
  id: string;
  title: string | null;
  date: string | null;
  source: string | null;
  confidence: string | null;
  links: string | null;
  superseded_by: string | null;
  body: string;
  path: string;
}

export interface CastleDocument {
  path: string;
  title: string | null;
  content: string;
}

export interface CastleRoom {
  name: string;
  about: string | null;
  insights: CastleInsight[];
  other_documents: CastleDocument[];
}

export interface CastleField {
  id: string;
  title: string | null;
  state: string | null;
  opened: string | null;
  body: string;
  path: string;
}

export interface CastleLoopLog {
  id: string;
  title: string | null;
  date: string | null;
  field: string | null;
  by: string | null;
  body: string;
  path: string;
}

export interface CastleCharter {
  id: string;
  title: string | null;
  state: string | null;
  cadence: string | null;
  budget_usd_per_run: string | null;
  opened: string | null;
  stop: string | null;
  body: string;
  path: string;
}

export interface CastleCensusRow {
  id: string;
  name: string;
  state: string;
  cadence: string;
  budget_per_run: string;
}

export interface CastleSnapshot {
  castle: string;
  source: string;
  castle_commit: string;
  castle_commit_full: string;
  castle_commit_date: string;
  synced_at: string;
  provenance: string;
  documents: Record<string, { path: string; content: string }>;
  rooms: CastleRoom[];
  fields: CastleField[];
  loop_logs: CastleLoopLog[];
  charters: CastleCharter[];
  census: CastleCensusRow[];
  other_documents: CastleDocument[];
  non_markdown_paths: string[];
  counts: {
    rooms: number;
    insights: number;
    fields: number;
    open_fields: number;
    loop_logs: number;
    charters: number;
    other_documents: number;
  };
}

export function getCastleSnapshot(): CastleSnapshot {
  return snapshot as CastleSnapshot;
}
