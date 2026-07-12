import { query } from "@/lib/db";

export const COLLECTOR_MEDIA_MAX_OBJECTS = 20;
export const COLLECTOR_MEDIA_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export type CollectorMediaStatus = "pending" | "ready";

export interface CollectorMediaItem {
  id: string;
  purpose: "collection_photo";
  status: CollectorMediaStatus;
  sourceMimeType: "image/jpeg" | "image/png" | "image/webp";
  sourceBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  storedBytes: number;
  width: number;
  height: number;
  createdAt: string;
  readyAt: string | null;
}

export interface OwnedCollectorMedia extends CollectorMediaItem {
  objectKey: string;
}

export interface ClaimedCollectorMediaCleanup {
  id: string;
  ownerUserId: string;
  objectKey: string;
}

export interface ReserveCollectorMediaArgs {
  id: string;
  ownerUserId: string;
  objectKey: string;
  sourceMimeType: CollectorMediaItem["sourceMimeType"];
  sourceBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  storedBytes: number;
  width: number;
  height: number;
  sha256Hex: string;
}

type DbRow = Record<string, unknown>;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function mapItem(row: DbRow): CollectorMediaItem {
  return {
    id: String(row.id),
    purpose: "collection_photo",
    status: String(row.status) as CollectorMediaStatus,
    sourceMimeType: String(row.source_mime_type) as CollectorMediaItem["sourceMimeType"],
    sourceBytes: Number(row.source_bytes),
    sourceWidth: Number(row.source_width),
    sourceHeight: Number(row.source_height),
    storedBytes: Number(row.stored_bytes),
    width: Number(row.width),
    height: Number(row.height),
    createdAt: iso(row.created_at),
    readyAt: row.ready_at == null ? null : iso(row.ready_at),
  };
}

const ITEM_COLUMNS = `
  id, purpose, status, source_mime_type, source_bytes,
  source_width, source_height, stored_bytes, width, height,
  created_at, ready_at
`;

/** The SQL function holds an account advisory lock before count + insert. */
export async function reserveCollectorMedia(
  args: ReserveCollectorMediaArgs,
): Promise<boolean> {
  const result = await query(
    `SELECT reserve_collector_media_vault_object(
       $1::uuid, $2::uuid, $3::text, $4::text, $5::integer,
       $6::integer, $7::integer, $8::integer, $9::integer,
       $10::integer, $11::char(64)
     ) AS reserved`,
    [
      args.id,
      args.ownerUserId,
      args.objectKey,
      args.sourceMimeType,
      args.sourceBytes,
      args.sourceWidth,
      args.sourceHeight,
      args.storedBytes,
      args.width,
      args.height,
      args.sha256Hex,
    ],
  );
  return result.rows[0]?.reserved === true;
}

export async function markCollectorMediaReady(
  id: string,
  ownerUserId: string,
): Promise<CollectorMediaItem | null> {
  const result = await query(
    `UPDATE collector_media_vault
        SET status = 'ready',
            ready_at = NOW(),
            pending_expires_at = NULL,
            updated_at = NOW()
      WHERE id = $1 AND owner_user_id = $2 AND status = 'pending'
      RETURNING ${ITEM_COLUMNS}`,
    [id, ownerUserId],
  );
  return result.rows[0] ? mapItem(result.rows[0]) : null;
}

export async function listCollectorMedia(ownerUserId: string): Promise<CollectorMediaItem[]> {
  const result = await query(
    `SELECT ${ITEM_COLUMNS}
       FROM collector_media_vault
      WHERE owner_user_id = $1 AND status IN ('pending', 'ready')
      ORDER BY created_at DESC
      LIMIT $2`,
    [ownerUserId, COLLECTOR_MEDIA_MAX_OBJECTS],
  );
  return result.rows.map(mapItem);
}

export async function findOwnedCollectorMedia(
  id: string,
  ownerUserId: string,
  readyOnly = false,
): Promise<OwnedCollectorMedia | null> {
  const result = await query(
    `SELECT ${ITEM_COLUMNS}, object_key
       FROM collector_media_vault
      WHERE id = $1 AND owner_user_id = $2
        AND status IN ('pending', 'ready')
        ${readyOnly ? "AND status = 'ready'" : ""}
      LIMIT 1`,
    [id, ownerUserId],
  );
  if (!result.rows[0]) return null;
  return { ...mapItem(result.rows[0]), objectKey: String(result.rows[0].object_key) };
}

export async function deleteCollectorMediaRow(
  id: string,
  ownerUserId: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM collector_media_vault
      WHERE id = $1 AND owner_user_id = $2
      RETURNING id`,
    [id, ownerUserId],
  );
  return result.rowCount === 1;
}

export async function claimExpiredPendingCollectorMedia(
  limit = 25,
): Promise<ClaimedCollectorMediaCleanup[]> {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const result = await query(
    `WITH due AS (
       SELECT id
         FROM collector_media_vault
        WHERE (status = 'pending' AND pending_expires_at <= NOW())
           OR (status = 'deleting' AND cleanup_claimed_at <= NOW() - INTERVAL '1 hour')
        ORDER BY COALESCE(pending_expires_at, cleanup_claimed_at) ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     )
     UPDATE collector_media_vault AS media
        SET status = 'deleting',
            pending_expires_at = NULL,
            cleanup_claimed_at = NOW(),
            updated_at = NOW()
       FROM due
      WHERE media.id = due.id
      RETURNING media.id, media.owner_user_id, media.object_key`,
    [boundedLimit],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    objectKey: String(row.object_key),
  }));
}

export async function deleteClaimedCollectorMediaRow(
  id: string,
  ownerUserId: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM collector_media_vault
      WHERE id = $1 AND owner_user_id = $2 AND status = 'deleting'
      RETURNING id`,
    [id, ownerUserId],
  );
  return result.rowCount === 1;
}

export async function resetCollectorMediaCleanupClaim(
  id: string,
  ownerUserId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE collector_media_vault
        SET status = 'pending',
            pending_expires_at = NOW() + INTERVAL '1 hour',
            cleanup_claimed_at = NULL,
            updated_at = NOW()
      WHERE id = $1 AND owner_user_id = $2 AND status = 'deleting'
      RETURNING id`,
    [id, ownerUserId],
  );
  return result.rowCount === 1;
}
