import { randomUUID } from "node:crypto";

import type pg from "pg";

export interface IngestCommerceEventInput {
  dispatch: boolean;
  externalEventId: string;
  externalEventType: string;
  occurredAt: string | null;
  payloadJson: string;
  payloadSha256: string;
  provider: "shopify";
  sourceAccountId: string;
}

export interface IngestCommerceEventResult {
  commerceConnectionId: string;
  duplicate: boolean;
  eventId: string;
  workspaceId: string;
}

interface ConnectionRow extends pg.QueryResultRow {
  id: string;
  workspace_id: string;
}

interface EventIdentityRow extends pg.QueryResultRow {
  commerce_connection_id: string;
  external_event_type: string;
  id: string;
  payload_sha256: string;
  workspace_id: string;
}

export class CommerceConnectionNotFoundError extends Error {
  override readonly name = "CommerceConnectionNotFoundError";
}

export class CommerceEventConflictError extends Error {
  override readonly name = "CommerceEventConflictError";
}

export class CommerceEventInbox {
  constructor(private readonly pool: Pick<pg.Pool, "connect">) {}

  async ingest(
    input: IngestCommerceEventInput,
  ): Promise<IngestCommerceEventResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const connectionResult = await client.query<ConnectionRow>(
        `SELECT id, workspace_id
           FROM rp_commerce_connection
          WHERE provider = $1
            AND external_account_id = $2
            AND status = 'active'
          FOR SHARE`,
        [input.provider, input.sourceAccountId],
      );
      const connection = connectionResult.rows[0];
      if (!connection) {
        throw new CommerceConnectionNotFoundError(
          "Commerce connection is not configured",
        );
      }

      const eventId = randomUUID();
      const inserted = await client.query<EventIdentityRow>(
        `INSERT INTO rp_commerce_event (
           id,
           workspace_id,
           commerce_connection_id,
           external_event_id,
           external_event_type,
           payload,
           payload_sha256,
           occurred_at,
           dispatch_state
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
         ON CONFLICT (commerce_connection_id, external_event_id) DO NOTHING
         RETURNING
           id,
           workspace_id,
           commerce_connection_id,
           external_event_type,
           payload_sha256`,
        [
          eventId,
          connection.workspace_id,
          connection.id,
          input.externalEventId,
          input.externalEventType,
          input.payloadJson,
          input.payloadSha256,
          input.occurredAt,
          input.dispatch ? "pending" : "disabled",
        ],
      );

      let duplicate = false;
      let event = inserted.rows[0];
      if (!event) {
        duplicate = true;
        const existing = await client.query<EventIdentityRow>(
          `SELECT
             id,
             workspace_id,
             commerce_connection_id,
             external_event_type,
             payload_sha256
           FROM rp_commerce_event
           WHERE commerce_connection_id = $1 AND external_event_id = $2`,
          [connection.id, input.externalEventId],
        );
        event = existing.rows[0];
        if (
          !event ||
          event.workspace_id !== connection.workspace_id ||
          event.commerce_connection_id !== connection.id ||
          event.external_event_type !== input.externalEventType ||
          event.payload_sha256.trim() !== input.payloadSha256
        ) {
          throw new CommerceEventConflictError(
            "Event id was previously used for different content",
          );
        }
        if (input.dispatch) {
          await client.query(
            `UPDATE rp_commerce_event
                SET dispatch_state = 'pending',
                    next_dispatch_at = now()
              WHERE id = $1
                AND dispatch_state = 'disabled'
                AND processing_state IN ('received', 'processing')`,
            [event.id],
          );
        }
      }

      await client.query("COMMIT");
      return {
        commerceConnectionId: event.commerce_connection_id,
        duplicate,
        eventId: event.id,
        workspaceId: event.workspace_id,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
