import type pg from "pg";
import { uuidv7 } from "yutabase/uuidv7";

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

interface EventIdentityRow extends pg.QueryResultRow {
  commerce_connection_id: string;
  duplicate: boolean;
  external_event_type: string;
  event_id: string;
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
  constructor(private readonly pool: Pick<pg.Pool, "query">) {}

  async ingest(
    input: IngestCommerceEventInput,
  ): Promise<IngestCommerceEventResult> {
    const result = await this.pool.query<EventIdentityRow>(
      `SELECT
         event_id,
         workspace_id,
         commerce_connection_id,
         external_event_type,
         payload_sha256,
         duplicate
       FROM public.rp_ingest_shopify_event(
         $1,
         $2,
         $3,
         $4,
         $5,
         $6::jsonb,
         $7,
         $8
       )`,
      [
        uuidv7(),
        input.sourceAccountId,
        input.externalEventId,
        input.externalEventType,
        input.payloadSha256,
        input.payloadJson,
        input.occurredAt,
        input.dispatch,
      ],
    );
    const event = result.rows[0];
    if (!event) {
      throw new CommerceConnectionNotFoundError(
        "Commerce connection is not configured",
      );
    }
    if (
      event.external_event_type !== input.externalEventType ||
      event.payload_sha256.trim() !== input.payloadSha256
    ) {
      throw new CommerceEventConflictError(
        "Event id was previously used for different content",
      );
    }

    return {
      commerceConnectionId: event.commerce_connection_id,
      duplicate: event.duplicate,
      eventId: event.event_id,
      workspaceId: event.workspace_id,
    };
  }
}
