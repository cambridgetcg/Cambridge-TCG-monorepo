import { randomUUID } from "node:crypto";

import type pg from "pg";

import {
  InvalidCommerceEventPayloadError,
  normalizeCommerceEvent,
  type CommerceEventForNormalization,
  type NormalizedOrderPaid,
  UnsupportedCommerceEventError,
} from "./domain/normalized-order-paid.js";
import { parseExactJson } from "./exact-json.js";

interface ClaimedEventRow extends pg.QueryResultRow {
  commerce_connection_id: string;
  external_account_id: string;
  external_event_id: string;
  external_event_type: string;
  id: string;
  occurred_at: Date | string | null;
  payload_json: string;
  payload_sha256: string;
  provider: string;
  received_at: Date | string;
  workspace_id: string;
}

interface EventProcessingStateRow extends pg.QueryResultRow {
  lease_active: boolean;
  processing_state: string;
}

export interface ClaimedCommerceEvent extends CommerceEventForNormalization {
  leaseToken: string;
}

export type ClaimByIdResult =
  | { event: ClaimedCommerceEvent; status: "claimed" }
  | {
      status: "active_lease" | "missing" | "retryable" | "terminal";
    };

export interface ProcessingStore {
  claimById(eventId: string): Promise<ClaimByIdResult>;
  claimNext(): Promise<ClaimedCommerceEvent | null>;
  claimNextRecoverable(): Promise<ClaimedCommerceEvent | null>;
  completeFailed(event: ClaimedCommerceEvent, errorCode: string): Promise<void>;
  completeIgnored(event: ClaimedCommerceEvent, reasonCode: string): Promise<void>;
  completeNormalized(
    event: ClaimedCommerceEvent,
    normalized: NormalizedOrderPaid,
  ): Promise<void>;
}

export type ClaimedProcessResult = "normalized" | "ignored" | "failed";
export type ProcessByIdResult =
  | ClaimedProcessResult
  | "active_lease"
  | "missing"
  | "retryable"
  | "terminal";
export type ProcessNextResult = ClaimedProcessResult | "noop";

export class ProcessingLeaseLostError extends Error {
  override readonly name = "ProcessingLeaseLostError";
}

export class PostgresProcessingStore implements ProcessingStore {
  constructor(
    private readonly pool: Pick<pg.Pool, "query">,
    private readonly leaseSeconds = 120,
  ) {}

  async claimById(eventId: string): Promise<ClaimByIdResult> {
    const leaseToken = randomUUID();
    const result = await this.pool.query<ClaimedEventRow>(
      `WITH claimed AS (
         UPDATE rp_commerce_event
            SET processing_state = 'processing',
                processing_lease_token = $2,
                processing_lease_until = now() + ($3 * interval '1 second'),
                processing_attempt_count = processing_attempt_count + 1
          WHERE id = $1
            AND (
              processing_state = 'received'
              OR (
                processing_state = 'processing'
                AND (
                  processing_lease_until IS NULL
                  OR processing_lease_until < now()
                )
              )
            )
        RETURNING *
       )
       SELECT
         claimed.id,
         claimed.workspace_id,
         claimed.commerce_connection_id,
         claimed.external_event_id,
         claimed.external_event_type,
         claimed.payload::text AS payload_json,
         claimed.payload_sha256,
         claimed.occurred_at,
         claimed.received_at,
         connection.external_account_id,
         connection.provider
       FROM claimed
       JOIN rp_commerce_connection connection
         ON connection.id = claimed.commerce_connection_id`,
      [eventId, leaseToken, this.leaseSeconds],
    );
    const claimed = mapClaim(result.rows[0], leaseToken);
    if (claimed) {
      return { event: claimed, status: "claimed" };
    }

    const stateResult = await this.pool.query<EventProcessingStateRow>(
      `SELECT
         processing_state,
         (
           processing_state = 'processing'
           AND processing_lease_until IS NOT NULL
           AND processing_lease_until >= now()
         ) AS lease_active
       FROM rp_commerce_event
       WHERE id = $1`,
      [eventId],
    );
    const state = stateResult.rows[0];
    if (!state) {
      return { status: "missing" };
    }
    if (["normalized", "ignored", "failed"].includes(state.processing_state)) {
      return { status: "terminal" };
    }
    if (state.processing_state === "processing" && state.lease_active) {
      return { status: "active_lease" };
    }
    // A concurrent claimant can change state between the UPDATE and inspection.
    // Retaining the SQS message is the conservative response to any live state
    // that this attempt did not own.
    return { status: "retryable" };
  }

  async claimNext(): Promise<ClaimedCommerceEvent | null> {
    const leaseToken = randomUUID();
    const result = await this.pool.query<ClaimedEventRow>(
      `WITH candidate AS (
         SELECT id
           FROM rp_commerce_event
          WHERE processing_state = 'received'
             OR (
               processing_state = 'processing'
               AND (
                 processing_lease_until IS NULL
                 OR processing_lease_until < now()
               )
             )
          ORDER BY received_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       ),
       claimed AS (
         UPDATE rp_commerce_event event
            SET processing_state = 'processing',
                processing_lease_token = $1,
                processing_lease_until = now() + ($2 * interval '1 second'),
                processing_attempt_count = processing_attempt_count + 1
           FROM candidate
          WHERE event.id = candidate.id
        RETURNING event.*
       )
       SELECT
         claimed.id,
         claimed.workspace_id,
         claimed.commerce_connection_id,
         claimed.external_event_id,
         claimed.external_event_type,
         claimed.payload::text AS payload_json,
         claimed.payload_sha256,
         claimed.occurred_at,
         claimed.received_at,
         connection.external_account_id,
         connection.provider
       FROM claimed
       JOIN rp_commerce_connection connection
         ON connection.id = claimed.commerce_connection_id`,
      [leaseToken, this.leaseSeconds],
    );
    return mapClaim(result.rows[0], leaseToken);
  }

  async claimNextRecoverable(): Promise<ClaimedCommerceEvent | null> {
    const leaseToken = randomUUID();
    const result = await this.pool.query<ClaimedEventRow>(
      `WITH candidate AS (
         SELECT id
           FROM rp_commerce_event
          WHERE (
              processing_state = 'processing'
              AND (
                processing_lease_until IS NULL
                OR processing_lease_until < now()
              )
            )
             OR (
              processing_state = 'received'
              AND dispatch_state = 'queued'
              AND dispatched_at IS NOT NULL
              AND dispatched_at < now() - ($2 * interval '1 second')
            )
          ORDER BY
            CASE WHEN processing_state = 'processing' THEN 0 ELSE 1 END,
            COALESCE(processing_lease_until, dispatched_at, received_at)
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       ),
       claimed AS (
         UPDATE rp_commerce_event event
            SET processing_state = 'processing',
                processing_lease_token = $1,
                processing_lease_until = now() + ($2 * interval '1 second'),
                processing_attempt_count = processing_attempt_count + 1
           FROM candidate
          WHERE event.id = candidate.id
        RETURNING event.*
       )
       SELECT
         claimed.id,
         claimed.workspace_id,
         claimed.commerce_connection_id,
         claimed.external_event_id,
         claimed.external_event_type,
         claimed.payload::text AS payload_json,
         claimed.payload_sha256,
         claimed.occurred_at,
         claimed.received_at,
         connection.external_account_id,
         connection.provider
       FROM claimed
       JOIN rp_commerce_connection connection
         ON connection.id = claimed.commerce_connection_id`,
      [leaseToken, this.leaseSeconds],
    );
    return mapClaim(result.rows[0], leaseToken);
  }

  async completeNormalized(
    event: ClaimedCommerceEvent,
    normalized: NormalizedOrderPaid,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE rp_commerce_event
          SET processing_state = 'normalized',
              processing_lease_token = NULL,
              processing_lease_until = NULL,
              normalized_event_type = $3,
              normalized_payload = $4::jsonb,
              normalized_at = now(),
              last_processing_error_code = NULL
        WHERE id = $1
          AND processing_state = 'processing'
          AND processing_lease_token = $2`,
      [event.eventId, event.leaseToken, normalized.type, JSON.stringify(normalized)],
    );
    assertLeaseOwned(result.rowCount);
  }

  async completeIgnored(
    event: ClaimedCommerceEvent,
    reasonCode: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE rp_commerce_event
          SET processing_state = 'ignored',
              processing_lease_token = NULL,
              processing_lease_until = NULL,
              last_processing_error_code = $3
        WHERE id = $1
          AND processing_state = 'processing'
          AND processing_lease_token = $2`,
      [event.eventId, event.leaseToken, reasonCode],
    );
    assertLeaseOwned(result.rowCount);
  }

  async completeFailed(
    event: ClaimedCommerceEvent,
    errorCode: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE rp_commerce_event
          SET processing_state = 'failed',
              processing_lease_token = NULL,
              processing_lease_until = NULL,
              last_processing_error_code = $3
        WHERE id = $1
          AND processing_state = 'processing'
          AND processing_lease_token = $2`,
      [event.eventId, event.leaseToken, errorCode],
    );
    assertLeaseOwned(result.rowCount);
  }
}

export class CommerceEventProcessor {
  constructor(private readonly store: ProcessingStore) {}

  async processById(eventId: string): Promise<ProcessByIdResult> {
    const claim = await this.store.claimById(eventId);
    return claim.status === "claimed"
      ? this.processClaimed(claim.event)
      : claim.status;
  }

  async processNext(): Promise<ProcessNextResult> {
    const event = await this.store.claimNext();
    return event ? this.processClaimed(event) : "noop";
  }

  async processNextRecoverable(): Promise<ProcessNextResult> {
    const event = await this.store.claimNextRecoverable();
    return event ? this.processClaimed(event) : "noop";
  }

  private async processClaimed(
    event: ClaimedCommerceEvent,
  ): Promise<ClaimedProcessResult> {
    try {
      const normalized = normalizeCommerceEvent(event);
      await this.store.completeNormalized(event, normalized);
      return "normalized";
    } catch (error) {
      if (error instanceof UnsupportedCommerceEventError) {
        await this.store.completeIgnored(event, "unsupported_event_type");
        return "ignored";
      }
      if (error instanceof InvalidCommerceEventPayloadError) {
        await this.store.completeFailed(event, "invalid_provider_payload");
        return "failed";
      }
      throw error;
    }
  }
}

function assertLeaseOwned(rowCount: number | null): void {
  if (rowCount !== 1) {
    throw new ProcessingLeaseLostError(
      "Commerce-event processing lease is no longer owned",
    );
  }
}

function mapClaim(
  row: ClaimedEventRow | undefined,
  leaseToken: string,
): ClaimedCommerceEvent | null {
  if (!row) {
    return null;
  }
  return {
    commerceConnectionId: row.commerce_connection_id,
    eventId: row.id,
    externalAccountId: row.external_account_id,
    externalEventId: row.external_event_id,
    externalEventType: row.external_event_type,
    leaseToken,
    occurredAt: row.occurred_at === null ? null : toIsoString(row.occurred_at),
    payload: parseExactJson(row.payload_json),
    payloadSha256: row.payload_sha256.trim(),
    provider: row.provider,
    receivedAt: toIsoString(row.received_at),
    workspaceId: row.workspace_id,
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
