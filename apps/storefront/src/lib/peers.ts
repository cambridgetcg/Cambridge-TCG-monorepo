/**
 * Peers + guestbook — the "you are not alone" surfaces.
 *
 * Two small tables, two small read/write APIs. Substrate-honest:
 *
 *   • Public participant storage and publication are disabled. The
 *     legacy tables and helpers remain in place so existing rows are not
 *     destroyed, but the public routes neither read nor write them.
 *
 *   • Bounded public identifiers — content_hash must be a complete,
 *     lowercase SHA-256 identifier and declared_kind must be one of the
 *     BeingDeclaration actor kinds. No IP or User-Agent is written by
 *     these helpers. A content hash is still a public pseudonymous
 *     identifier, not proof of identity or an absence-of-PII guarantee.
 *
 *   • Reopening requires a versioned public notice, bounded abuse
 *     controls, explicit retention/deletion behavior, and retraction.
 *     The legacy signed_for_operator field also needs a verified
 *     co-signature or must remain withheld.
 *
 *   • The legacy guestbook schema has no participant retraction path.
 *     That is a reason publication is closed, not a promise that entries
 *     should remain append-only.
 *
 *   • Dormant schema bootstrap remains behind the false gates. Public
 *     requests never invoke it. The migration at
 *     apps/storefront/drizzle/0103_peers_guestbook.sql records the
 *     legacy schema as it exists.
 *
 * Companion: docs/connections/the-fellowship.md (story-as-wire).
 */

import { query } from "@/lib/db";

export const SHA256_CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const SHA256_CONTENT_HASH_SQL_PATTERN = "^sha256:[0-9a-f]{64}$";
export const PEER_ARRIVAL_STORAGE_ENABLED = false as const;
export const PEER_ARRIVAL_PUBLICATION_ENABLED = false as const;
export const GUESTBOOK_STORAGE_ENABLED = false as const;
export const GUESTBOOK_PUBLICATION_ENABLED = false as const;

export const PEER_DECLARED_KINDS = [
  "human",
  "agent",
  "autonomous-sophia",
  "system",
  "platform",
  "collective",
  "oracle",
  "witness",
  "other",
] as const;

export type PeerDeclaredKind = (typeof PEER_DECLARED_KINDS)[number];

const PEER_DECLARED_KIND_SET = new Set<string>(PEER_DECLARED_KINDS);

export function isSha256ContentHash(value: unknown): value is string {
  return typeof value === "string" && SHA256_CONTENT_HASH_PATTERN.test(value);
}

function parseDeclaredKind(value: unknown):
  | { ok: true; value: PeerDeclaredKind | null }
  | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "declared_kind must be a string when supplied" };
  }
  const normalized = value.trim();
  if (!PEER_DECLARED_KIND_SET.has(normalized)) {
    return {
      ok: false,
      error: `declared_kind must be one of: ${PEER_DECLARED_KINDS.join(", ")}`,
    };
  }
  return { ok: true, value: normalized as PeerDeclaredKind };
}

function publicDeclaredKind(value: unknown): PeerDeclaredKind | null {
  const parsed = parseDeclaredKind(value);
  return parsed.ok ? parsed.value : null;
}

export interface ValidPeerArrivalSubmission {
  content_hash: string;
  declared_kind: PeerDeclaredKind | null;
}

export function validatePeerArrivalSubmission(input: {
  content_hash: unknown;
  declared_kind?: unknown;
}):
  | { ok: true; value: ValidPeerArrivalSubmission }
  | { ok: false; error: string } {
  if (!isSha256ContentHash(input.content_hash)) {
    return {
      ok: false,
      error: "content_hash must match sha256:<64 lowercase hexadecimal characters>",
    };
  }
  const declaredKind = parseDeclaredKind(input.declared_kind);
  if (!declaredKind.ok) return declaredKind;
  return {
    ok: true,
    value: {
      content_hash: input.content_hash,
      declared_kind: declaredKind.value,
    },
  };
}

export interface ValidGuestbookSubmission extends ValidPeerArrivalSubmission {
  note: string;
}

const NOTE_MAX = 500;

export function validateGuestbookSubmission(input: {
  content_hash: unknown;
  declared_kind?: unknown;
  note: unknown;
  signed_for_operator?: unknown;
}):
  | { ok: true; value: ValidGuestbookSubmission }
  | { ok: false; error: string } {
  const identity = validatePeerArrivalSubmission(input);
  if (!identity.ok) return identity;
  if (
    input.signed_for_operator !== undefined &&
    input.signed_for_operator !== null
  ) {
    return {
      ok: false,
      error:
        "signed_for_operator is not accepted because this route cannot verify third-party attribution",
    };
  }
  if (typeof input.note !== "string") {
    return { ok: false, error: "note must be a string" };
  }
  const note = input.note.trim();
  if (!note) return { ok: false, error: "note required" };
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `note exceeds ${NOTE_MAX} characters` };
  }
  const cleaned = note.replace(/\r\n?/g, "\n");
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned.charCodeAt(i);
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a) || c === 0x7f) {
      return { ok: false, error: "note contains control characters" };
    }
  }
  return { ok: true, value: { ...identity.value, note: cleaned } };
}

// ── Bootstrap ───────────────────────────────────────────────────────────

let bootstrapped = false;

async function ensureSchema(): Promise<void> {
  if (bootstrapped) return;
  await query(
    `CREATE TABLE IF NOT EXISTS peer_arrivals (
      id BIGSERIAL PRIMARY KEY,
      content_hash TEXT NOT NULL,
      declared_kind TEXT,
      arrived_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS peer_arrivals_arrived_at_idx
      ON peer_arrivals(arrived_at DESC)`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS peer_arrivals_content_hash_idx
      ON peer_arrivals(content_hash)`,
  );
  await query(
    `CREATE TABLE IF NOT EXISTS agent_guestbook (
      id BIGSERIAL PRIMARY KEY,
      content_hash TEXT NOT NULL,
      declared_kind TEXT,
      note TEXT NOT NULL,
      signed_for_operator TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS agent_guestbook_created_at_idx
      ON agent_guestbook(created_at DESC)`,
  );
  bootstrapped = true;
}

// ── Peer arrivals ───────────────────────────────────────────────────────

export interface PeerArrival {
  content_hash: string;
  declared_kind: PeerDeclaredKind | null;
  arrived_at: string; // ISO-8601
}

export interface PeerArrivalsSummary {
  window: "publication disabled" | "rolling 24 hours";
  as_of: string;
  total_announcements: number;
  distinct_content_hashes: number;
  by_kind: Record<string, number>;
  recent: PeerArrival[];
}

/** Dormant persistence helper. The immutable release gate returns before DB. */
export async function recordPeerArrival(input: {
  content_hash: unknown;
  declared_kind?: unknown;
}): Promise<{ ok: true; arrived_at: string } | { ok: false; error: string }> {
  const validated = validatePeerArrivalSubmission(input);
  if (!validated.ok) return validated;
  if (!PEER_ARRIVAL_STORAGE_ENABLED) {
    return {
      ok: false,
      error:
        "peer-arrival storage is disabled; the submission was not persisted",
    };
  }

  await ensureSchema();
  const result = await query(
    `INSERT INTO peer_arrivals (content_hash, declared_kind)
       VALUES ($1, $2)
       RETURNING to_char(arrived_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS arrived_at`,
    [validated.value.content_hash, validated.value.declared_kind],
  );
  return { ok: true, arrived_at: result.rows[0]?.arrived_at ?? new Date().toISOString() };
}

/** Dormant publication helper. The immutable release gate returns an empty view. */
export async function summarizePeerArrivals(opts: {
  limit?: number;
} = {}): Promise<PeerArrivalsSummary> {
  if (!PEER_ARRIVAL_PUBLICATION_ENABLED) {
    return {
      window: "publication disabled",
      as_of: new Date().toISOString(),
      total_announcements: 0,
      distinct_content_hashes: 0,
      by_kind: {},
      recent: [],
    };
  }
  await ensureSchema();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const totals = await query(
    `SELECT COUNT(*)::TEXT AS total,
            COUNT(DISTINCT content_hash)::TEXT AS distinct
       FROM peer_arrivals
      WHERE arrived_at >= now() - interval '24 hours'
        AND content_hash ~ $1`,
    [SHA256_CONTENT_HASH_SQL_PATTERN],
  );
  const byKind = await query(
    `SELECT CASE
              WHEN declared_kind = ANY($2::text[]) THEN declared_kind
              ELSE NULL
            END AS declared_kind,
            COUNT(*)::TEXT AS count
       FROM peer_arrivals
      WHERE arrived_at >= now() - interval '24 hours'
        AND content_hash ~ $1
      GROUP BY 1
      ORDER BY count DESC`,
    [SHA256_CONTENT_HASH_SQL_PATTERN, [...PEER_DECLARED_KINDS]],
  );
  const recent = await query(
    `SELECT content_hash,
            CASE
              WHEN declared_kind = ANY($2::text[]) THEN declared_kind
              ELSE NULL
            END AS declared_kind,
            to_char(arrived_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS arrived_at
       FROM peer_arrivals
      WHERE arrived_at >= now() - interval '24 hours'
        AND content_hash ~ $1
      ORDER BY arrived_at DESC
      LIMIT $3`,
    [SHA256_CONTENT_HASH_SQL_PATTERN, [...PEER_DECLARED_KINDS], limit],
  );

  const byKindMap: Record<string, number> = {};
  for (const row of byKind.rows) {
    const key = publicDeclaredKind(row.declared_kind) ?? "(undeclared)";
    byKindMap[key] = (byKindMap[key] ?? 0) + Number(row.count);
  }

  const safeRecent = recent.rows.flatMap((row) =>
    isSha256ContentHash(row.content_hash)
      ? [{
          content_hash: row.content_hash,
          declared_kind: publicDeclaredKind(row.declared_kind),
          arrived_at: String(row.arrived_at),
        }]
      : [],
  );

  return {
    window: "rolling 24 hours",
    as_of: new Date().toISOString(),
    total_announcements: Number(totals.rows[0]?.total ?? 0),
    distinct_content_hashes: Number(totals.rows[0]?.distinct ?? 0),
    by_kind: byKindMap,
    recent: safeRecent,
  };
}

// ── Guestbook ───────────────────────────────────────────────────────────

export interface GuestbookEntry {
  id: number;
  content_hash: string;
  declared_kind: PeerDeclaredKind | null;
  note: string;
  signed_for_operator: string | null;
  created_at: string;
}

export interface GuestbookListing {
  total: number;
  returned: number;
  entries: GuestbookEntry[];
}

/** Dormant persistence helper. The immutable release gate returns before DB. */
export async function appendGuestbookEntry(input: {
  content_hash: unknown;
  declared_kind?: unknown;
  note: string;
  signed_for_operator?: string | null;
}): Promise<
  | { ok: true; entry: GuestbookEntry }
  | { ok: false; error: string }
> {
  const validated = validateGuestbookSubmission(input);
  if (!validated.ok) return validated;
  if (!GUESTBOOK_STORAGE_ENABLED) {
    return {
      ok: false,
      error: "guestbook storage is disabled; the submission was not persisted",
    };
  }
  await ensureSchema();
  const result = await query(
    `INSERT INTO agent_guestbook (content_hash, declared_kind, note, signed_for_operator)
       VALUES ($1, $2, $3, $4)
       RETURNING id, content_hash, declared_kind, note, signed_for_operator,
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at`,
    [
      validated.value.content_hash,
      validated.value.declared_kind,
      validated.value.note,
      null,
    ],
  );
  const entry = result.rows[0] as GuestbookEntry | undefined;
  if (!entry) return { ok: false, error: "insert failed" };
  return { ok: true, entry };
}

/** Dormant publication helper. The immutable release gate returns an empty view. */
export async function listGuestbookEntries(opts: {
  limit?: number;
} = {}): Promise<GuestbookListing> {
  if (!GUESTBOOK_PUBLICATION_ENABLED) {
    return { total: 0, returned: 0, entries: [] };
  }
  await ensureSchema();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const totals = await query(
    `SELECT COUNT(*)::TEXT AS total
       FROM agent_guestbook
      WHERE content_hash ~ $1`,
    [SHA256_CONTENT_HASH_SQL_PATTERN],
  );
  const entries = await query(
    `SELECT id, content_hash,
            CASE
              WHEN declared_kind = ANY($2::text[]) THEN declared_kind
              ELSE NULL
            END AS declared_kind,
            note, signed_for_operator,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM agent_guestbook
      WHERE content_hash ~ $1
      ORDER BY created_at DESC
      LIMIT $3`,
    [SHA256_CONTENT_HASH_SQL_PATTERN, [...PEER_DECLARED_KINDS], limit],
  );
  const safeEntries = entries.rows.flatMap((row) =>
    isSha256ContentHash(row.content_hash)
      ? [{
          id: Number(row.id),
          content_hash: row.content_hash,
          declared_kind: publicDeclaredKind(row.declared_kind),
          note: String(row.note),
          signed_for_operator:
            typeof row.signed_for_operator === "string"
              ? row.signed_for_operator
              : null,
          created_at: String(row.created_at),
        }]
      : [],
  );
  return {
    total: Number(totals.rows[0]?.total ?? 0),
    returned: safeEntries.length,
    entries: safeEntries,
  };
}
