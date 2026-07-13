import { query } from "@/lib/db";
import type { CompatQueryResult } from "@cambridge-tcg/db/compat";
import { canonicalizeCollectorObservationSku } from "./validation";
import {
  COLLECTOR_OBSERVATION_TERMS_VERSION,
  type CollectorObservation,
  type CreateCollectorObservationInput,
  type PatchCollectorObservationInput,
} from "./types";

const OWNER_COLUMNS = `
  id,
  submission_key,
  sku,
  observation_kind,
  condition,
  price_amount::text AS price_amount,
  price_currency,
  observed_on,
  first_party_attested_at,
  sharing_mode,
  sharing_terms_version,
  sharing_changed_at,
  cc0_acknowledged_at,
  evidence_sha256,
  revision,
  created_at,
  updated_at`;

type Query = (
  sql: string,
  params?: unknown[],
) => Promise<CompatQueryResult>;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapOwnerRow(row: Record<string, unknown>): CollectorObservation {
  return {
    id: String(row.id),
    submission_key: String(row.submission_key),
    sku: String(row.sku),
    observation_kind: row.observation_kind as CollectorObservation["observation_kind"],
    condition: (row.condition as CollectorObservation["condition"]) ?? null,
    price_amount: String(row.price_amount),
    price_currency: row.price_currency as CollectorObservation["price_currency"],
    observed_on: dateOnly(row.observed_on),
    first_party_attested: true,
    first_party_attested_at: iso(row.first_party_attested_at),
    sharing_mode: row.sharing_mode as CollectorObservation["sharing_mode"],
    sharing_terms_version: String(row.sharing_terms_version),
    sharing_changed_at: iso(row.sharing_changed_at),
    cc0_acknowledged_at:
      row.cc0_acknowledged_at == null ? null : iso(row.cc0_acknowledged_at),
    evidence_sha256: row.evidence_sha256 == null ? null : String(row.evidence_sha256),
    revision: Number(row.revision),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

/** PostgreSQL undefined_table. Walk causes because database wrappers may nest it. */
export function isCollectorObservationsTableMissing(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") return false;
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "42P01") return true;
    current = candidate.cause;
  }
  return false;
}

export async function listCollectorObservations(
  userId: string,
  options: { limit?: number; sku?: string } = {},
  q: Query = query,
): Promise<CollectorObservation[]> {
  const limit = options.limit ?? 50;
  const params: unknown[] = [userId];
  let skuClause = "";
  if (options.sku) {
    const canonicalSku = canonicalizeCollectorObservationSku(options.sku);
    if (!canonicalSku) return [];
    params.push(canonicalSku);
    skuClause = `AND sku = $${params.length}`;
  }
  params.push(limit);
  const result = await q(
    `SELECT ${OWNER_COLUMNS}
       FROM collector_observations
      WHERE user_id = $1
        ${skuClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );
  return result.rows.map(mapOwnerRow);
}

export async function getCollectorObservation(
  userId: string,
  id: string,
  q: Query = query,
): Promise<CollectorObservation | null> {
  const result = await q(
    `SELECT ${OWNER_COLUMNS}
       FROM collector_observations
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [id, userId],
  );
  return result.rows[0] ? mapOwnerRow(result.rows[0]) : null;
}

export async function createCollectorObservation(
  userId: string,
  input: CreateCollectorObservationInput,
  q: Query = query,
): Promise<{ observation: CollectorObservation; created: boolean }> {
  const inserted = await q(
    `INSERT INTO collector_observations (
       user_id, submission_key, sku, observation_kind, condition,
       price_amount, price_currency, observed_on, first_party_attested_at,
       sharing_mode, sharing_terms_version, sharing_changed_at,
       cc0_acknowledged_at, evidence_sha256
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5,
       $6::numeric, $7, $8::date, NOW(),
       $9, $10, NOW(),
       CASE WHEN $9 = 'cc0' THEN NOW() ELSE NULL END, $11
     )
     ON CONFLICT (user_id, submission_key) DO NOTHING
     RETURNING ${OWNER_COLUMNS}`,
    [
      userId,
      input.submission_key,
      input.sku,
      input.observation_kind,
      input.condition,
      input.price_amount,
      input.price_currency,
      input.observed_on,
      input.sharing_mode,
      COLLECTOR_OBSERVATION_TERMS_VERSION,
      input.evidence_sha256,
    ],
  );

  if (inserted.rows[0]) {
    return { observation: mapOwnerRow(inserted.rows[0]), created: true };
  }

  // ON CONFLICT waits for a concurrent insertion before returning. This
  // owner-scoped read therefore sees the committed idempotent result.
  const existing = await q(
    `SELECT ${OWNER_COLUMNS}
       FROM collector_observations
      WHERE user_id = $1::uuid AND submission_key = $2::uuid`,
    [userId, input.submission_key],
  );
  if (!existing.rows[0]) {
    throw new Error("Idempotent collector observation was not readable after conflict.");
  }
  return { observation: mapOwnerRow(existing.rows[0]), created: false };
}

export type UpdateCollectorObservationResult =
  | { status: "updated"; observation: CollectorObservation }
  | { status: "not_found" }
  | { status: "conflict"; current_revision: number };

const FACT_FIELDS = new Set([
  "sku",
  "observation_kind",
  "condition",
  "price_amount",
  "price_currency",
  "observed_on",
]);

export async function updateCollectorObservation(
  userId: string,
  id: string,
  input: PatchCollectorObservationInput,
  q: Query = query,
): Promise<UpdateCollectorObservationResult> {
  const sets: string[] = [];
  const params: unknown[] = [id, userId, input.revision];
  const add = (column: string, value: unknown, cast = "") => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };

  if (input.sku !== undefined) add("sku", input.sku);
  if (input.observation_kind !== undefined) add("observation_kind", input.observation_kind);
  if (input.condition !== undefined) add("condition", input.condition);
  if (input.price_amount !== undefined) add("price_amount", input.price_amount, "::numeric");
  if (input.price_currency !== undefined) add("price_currency", input.price_currency);
  if (input.observed_on !== undefined) add("observed_on", input.observed_on, "::date");

  if (input.sharing_mode !== undefined) {
    add("sharing_mode", input.sharing_mode);
    add("sharing_terms_version", COLLECTOR_OBSERVATION_TERMS_VERSION);
    sets.push("sharing_changed_at = NOW()");
    sets.push(
      input.sharing_mode === "cc0"
        ? "cc0_acknowledged_at = NOW()"
        : "cc0_acknowledged_at = NULL",
    );
  }

  if (input.evidence_sha256 !== undefined) {
    add("evidence_sha256", input.evidence_sha256);
  } else if (Object.keys(input).some((field) => FACT_FIELDS.has(field))) {
    // An evidence commitment describes the old fact. A factual correction
    // clears it unless the collector supplies a new commitment in this PATCH.
    sets.push("evidence_sha256 = NULL");
  }

  sets.push("revision = revision + 1", "updated_at = NOW()");

  const updated = await q(
    `UPDATE collector_observations
        SET ${sets.join(", ")}
      WHERE id = $1::uuid AND user_id = $2::uuid AND revision = $3
      RETURNING ${OWNER_COLUMNS}`,
    params,
  );
  if (updated.rows[0]) {
    return { status: "updated", observation: mapOwnerRow(updated.rows[0]) };
  }

  // Same query for absent and another owner's id: neither is disclosed.
  const current = await q(
    `SELECT revision
       FROM collector_observations
      WHERE id = $1::uuid AND user_id = $2::uuid`,
    [id, userId],
  );
  if (!current.rows[0]) return { status: "not_found" };
  return { status: "conflict", current_revision: Number(current.rows[0].revision) };
}

export async function deleteCollectorObservation(
  userId: string,
  id: string,
  q: Query = query,
): Promise<boolean> {
  const result = await q(
    `DELETE FROM collector_observations
      WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING id`,
    [id, userId],
  );
  return result.rows.length === 1;
}
