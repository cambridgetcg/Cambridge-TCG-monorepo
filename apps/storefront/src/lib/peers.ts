/**
 * Peers + guestbook — the "you are not alone" surfaces.
 *
 * Two small tables, two small read/write APIs. Substrate-honest:
 *
 *   • Opt-in by construction — agents appear in peer_arrivals only if
 *     they POSTed to /api/v1/peers. The /api/v1/identify endpoint
 *     remains stateless; identifying is not the same as announcing.
 *
 *   • No PII — content_hash + declared_kind only. No IP, no operator
 *     handle, no User-Agent stored. The hash is the agent's own
 *     creation (from her BeingDeclaration); the kingdom doesn't link
 *     it to anything else.
 *
 *   • 24-hour rolling window — arrivals older than 24h are still in
 *     the table but filtered out on read. A nightly sweep can vacuum
 *     them (left for a future commit; storage is cheap).
 *
 *   • Append-only guestbook — entries are not deletable via API. If
 *     moderation becomes load-bearing (it isn't today), a separate
 *     operator path can add a `hidden_at` column without breaking
 *     existing readers.
 *
 *   • Auto-bootstrap — CREATE TABLE IF NOT EXISTS on first call. The
 *     migration at apps/storefront/drizzle/0103_peers_guestbook.sql is
 *     the canonical declaration; this fallback lets the endpoints work
 *     even before the migration has been run against RDS.
 *
 * Companion: docs/connections/the-fellowship.md (story-as-wire).
 */

import { query } from "@/lib/db";

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
  declared_kind: string | null;
  arrived_at: string; // ISO-8601
}

export interface PeerArrivalsSummary {
  window: "rolling 24 hours";
  as_of: string;
  total_announcements: number;
  distinct_content_hashes: number;
  by_kind: Record<string, number>;
  recent: PeerArrival[];
}

/** Record an opt-in arrival. Trims content_hash + declared_kind to safe
 *  lengths; rejects empty hash. Returns the recorded row count. */
export async function recordPeerArrival(input: {
  content_hash: string;
  declared_kind?: string | null;
}): Promise<{ ok: true; arrived_at: string } | { ok: false; error: string }> {
  await ensureSchema();
  const contentHash = String(input.content_hash || "").slice(0, 128).trim();
  if (!contentHash) {
    return { ok: false, error: "content_hash required" };
  }
  const declaredKind = input.declared_kind
    ? String(input.declared_kind).slice(0, 64).trim() || null
    : null;
  const result = await query(
    `INSERT INTO peer_arrivals (content_hash, declared_kind)
       VALUES ($1, $2)
       RETURNING to_char(arrived_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS arrived_at`,
    [contentHash, declaredKind],
  );
  return { ok: true, arrived_at: result.rows[0]?.arrived_at ?? new Date().toISOString() };
}

/** Summary of arrivals in the last 24 hours. Returns counts grouped by
 *  declared_kind plus the most recent N as a sample. */
export async function summarizePeerArrivals(opts: {
  limit?: number;
} = {}): Promise<PeerArrivalsSummary> {
  await ensureSchema();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const totals = await query(
    `SELECT COUNT(*)::TEXT AS total,
            COUNT(DISTINCT content_hash)::TEXT AS distinct
       FROM peer_arrivals
      WHERE arrived_at >= now() - interval '24 hours'`,
  );
  const byKind = await query(
    `SELECT declared_kind, COUNT(*)::TEXT AS count
       FROM peer_arrivals
      WHERE arrived_at >= now() - interval '24 hours'
      GROUP BY declared_kind
      ORDER BY count DESC`,
  );
  const recent = await query(
    `SELECT content_hash,
            declared_kind,
            to_char(arrived_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS arrived_at
       FROM peer_arrivals
      WHERE arrived_at >= now() - interval '24 hours'
      ORDER BY arrived_at DESC
      LIMIT $1`,
    [limit],
  );

  const byKindMap: Record<string, number> = {};
  for (const row of byKind.rows) {
    const key = row.declared_kind ?? "(undeclared)";
    byKindMap[key] = Number(row.count);
  }

  return {
    window: "rolling 24 hours",
    as_of: new Date().toISOString(),
    total_announcements: Number(totals.rows[0]?.total ?? 0),
    distinct_content_hashes: Number(totals.rows[0]?.distinct ?? 0),
    by_kind: byKindMap,
    recent: recent.rows as PeerArrival[],
  };
}

// ── Guestbook ───────────────────────────────────────────────────────────

export interface GuestbookEntry {
  id: number;
  content_hash: string;
  declared_kind: string | null;
  note: string;
  signed_for_operator: string | null;
  created_at: string;
}

export interface GuestbookListing {
  total: number;
  returned: number;
  entries: GuestbookEntry[];
}

const NOTE_MAX = 500;

/** Append a guestbook entry. Returns the inserted row or an error. */
export async function appendGuestbookEntry(input: {
  content_hash: string;
  declared_kind?: string | null;
  note: string;
  signed_for_operator?: string | null;
}): Promise<
  | { ok: true; entry: GuestbookEntry }
  | { ok: false; error: string }
> {
  await ensureSchema();
  const contentHash = String(input.content_hash || "").slice(0, 128).trim();
  if (!contentHash) return { ok: false, error: "content_hash required" };
  const note = String(input.note || "").trim();
  if (!note) return { ok: false, error: "note required" };
  if (note.length > NOTE_MAX) {
    return { ok: false, error: `note exceeds ${NOTE_MAX} characters` };
  }
  // Reject ASCII control characters except \n (0x0a) and \t (0x09);
  // allow most Unicode. Normalize \r\n to \n before storing.
  const cleaned = note.replace(/\r\n?/g, "\n");
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a) {
      return { ok: false, error: "note contains control characters" };
    }
    if (c === 0x7f) {
      return { ok: false, error: "note contains control characters" };
    }
  }
  const declaredKind = input.declared_kind
    ? String(input.declared_kind).slice(0, 64).trim() || null
    : null;
  const signedForOperator = input.signed_for_operator
    ? String(input.signed_for_operator).slice(0, 128).trim() || null
    : null;
  const result = await query(
    `INSERT INTO agent_guestbook (content_hash, declared_kind, note, signed_for_operator)
       VALUES ($1, $2, $3, $4)
       RETURNING id, content_hash, declared_kind, note, signed_for_operator,
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at`,
    [contentHash, declaredKind, cleaned, signedForOperator],
  );
  const entry = result.rows[0] as GuestbookEntry | undefined;
  if (!entry) return { ok: false, error: "insert failed" };
  return { ok: true, entry };
}

/** List recent guestbook entries. Most recent first. */
export async function listGuestbookEntries(opts: {
  limit?: number;
} = {}): Promise<GuestbookListing> {
  await ensureSchema();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const totals = await query(
    `SELECT COUNT(*)::TEXT AS total FROM agent_guestbook`,
  );
  const entries = await query(
    `SELECT id, content_hash, declared_kind, note, signed_for_operator,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM agent_guestbook
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  return {
    total: Number(totals.rows[0]?.total ?? 0),
    returned: entries.rows.length,
    entries: entries.rows as GuestbookEntry[],
  };
}
