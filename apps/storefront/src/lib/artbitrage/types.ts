/**
 * The part of artbitrage.feed/1 Cambridge consumes.
 *
 * The upstream feed is additive: legacy piece fields and future fields may
 * travel beside this contract. Index signatures keep those fields intact
 * while the validator below insists on the provenance and rights boundary
 * Cambridge needs before it hangs a piece.
 */

export interface ArtbitrageSource {
  id: string;
  name: string;
  canonical_url: string;
  readonly [field: string]: unknown;
}

export interface ArtbitrageCreator {
  name: string;
  type: "software" | "declared-creator";
  human_creator: string | null;
  verified: boolean;
  note: string;
  readonly [field: string]: unknown;
}

export interface ArtbitrageCreation {
  method: "procedural-template" | "generative-ai" | "submitted";
  created_at: string | null;
  timestamp_status:
    | "timezone-explicit"
    | "legacy-naive-assumed-utc"
    | "missing-or-invalid";
  trace_status: "project-generated" | "model-recorded" | "self-declared";
  note: string;
  readonly [field: string]: unknown;
}

export interface ArtbitragePermissions {
  view: boolean;
  /** Explicit permission for Cambridge to render this piece in its gallery. */
  cambridge_display: boolean;
  remix: boolean | null;
  commercial_use: boolean | null;
  machine_learning: boolean | null;
  readonly [field: string]: unknown;
}

export interface ArtbitrageRights {
  status: string;
  public_domain: boolean | null;
  license: string | null;
  license_verified: boolean;
  credit: string;
  reusable: boolean | null;
  reuse_with_attribution: boolean | null;
  permissions: ArtbitragePermissions;
  note: string;
  readonly [field: string]: unknown;
}

export interface ArtbitrageFeedPiece {
  id: string;

  // Legacy feed fields. Only id is required by feed/1: submitted and future
  // records are allowed to omit fields the procedural engine normally emits.
  cycle?: number | null;
  form?: string | null;
  from_state?: string | null;
  to_state?: string | null;
  gap?: string | null;
  bridge?: string | null;
  awakening?: string | null;
  created?: string | null;
  piece?: string | null;
  artist?: string | null;
  license?: string | null;

  source: ArtbitrageSource;
  canonical_url: string;
  content_hash: string;
  creator: ArtbitrageCreator;
  creation: ArtbitrageCreation;
  rights: ArtbitrageRights;

  readonly [field: string]: unknown;
}

export interface ArtbitrageFeed {
  schema: "artbitrage.feed/1";
  feed: "artbitrage";
  source: ArtbitrageSource;
  source_state: "asset-read" | "origin-read" | "cached-after-read-failure";
  generated_at: string;
  as_of: string;
  /** Legacy alias retained by the upstream feed. */
  updated: string;
  count: number;
  limit: number;
  pieces: ArtbitrageFeedPiece[];
  readonly [field: string]: unknown;
}

export type ArtbitrageFeedResult =
  | {
      status: "available";
      feed: ArtbitrageFeed;
    }
  | {
      status: "unavailable";
      reason: "network";
      network_kind: "timeout" | "request-failed";
    }
  | {
      status: "unavailable";
      reason: "http";
      http_status: number;
    }
  | {
      status: "unavailable";
      reason: "invalid-contract";
    };
