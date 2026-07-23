import { randomUUID } from "node:crypto";

import { SendMessageCommand, type SQSClient } from "@aws-sdk/client-sqs";
import type { Logger } from "pino";
import type pg from "pg";
import { z } from "zod";

export const CommerceEventQueueMessageSchema = z
  .object({
    commerceEventId: z.string().uuid(),
    schemaVersion: z.literal(1),
    type: z.literal("commerce_event"),
  })
  .strict();

export type CommerceEventQueueMessage = z.infer<
  typeof CommerceEventQueueMessageSchema
>;

export const WorkerCommandQueueMessageSchema = z
  .object({
    command: z.literal("flush_outbox"),
    schemaVersion: z.literal(1),
    type: z.literal("command"),
  })
  .strict();

export const WorkerProbeQueueMessageSchema = z
  .object({
    probeId: z.string().uuid(),
    schemaVersion: z.literal(1),
    type: z.literal("probe"),
  })
  .strict();

export type WorkerProbeQueueMessage = z.infer<
  typeof WorkerProbeQueueMessageSchema
>;

export const WorkerQueueMessageSchema = z.discriminatedUnion("type", [
  CommerceEventQueueMessageSchema,
  WorkerCommandQueueMessageSchema,
  WorkerProbeQueueMessageSchema,
]);

export type WorkerQueueMessage = z.infer<typeof WorkerQueueMessageSchema>;

interface OutboxClaimRow extends pg.QueryResultRow {
  commerce_connection_id: string;
  id: string;
}

export interface OutboxClaim {
  commerceConnectionId: string;
  eventId: string;
  leaseToken: string;
}

export interface OutboxStore {
  claim(eventId: string): Promise<OutboxClaim | null>;
  listPending(limit: number): Promise<string[]>;
  markFailed(claim: OutboxClaim): Promise<void>;
  markPublished(claim: OutboxClaim): Promise<void>;
}

export class OutboxPublishError extends Error {
  override readonly name = "OutboxPublishError";
}

export class PostgresOutboxStore implements OutboxStore {
  constructor(
    private readonly pool: Pick<pg.Pool, "query">,
    private readonly leaseSeconds = 60,
  ) {}

  async claim(eventId: string): Promise<OutboxClaim | null> {
    const leaseToken = randomUUID();
    const result = await this.pool.query<OutboxClaimRow>(
      `UPDATE rp_commerce_event
          SET dispatch_lease_token = $2,
              dispatch_lease_until = now() + ($3 * interval '1 second'),
              dispatch_attempt_count = dispatch_attempt_count + 1
        WHERE id = $1
          AND dispatch_state = 'pending'
          AND next_dispatch_at <= now()
          AND (
            dispatch_lease_until IS NULL
            OR dispatch_lease_until < now()
          )
      RETURNING id, commerce_connection_id`,
      [eventId, leaseToken, this.leaseSeconds],
    );
    const row = result.rows[0];
    return row
      ? {
          commerceConnectionId: row.commerce_connection_id,
          eventId: row.id,
          leaseToken,
        }
      : null;
  }

  async listPending(limit: number): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id
         FROM rp_commerce_event
        WHERE dispatch_state = 'pending'
          AND next_dispatch_at <= now()
          AND (
            dispatch_lease_until IS NULL
            OR dispatch_lease_until < now()
          )
        ORDER BY next_dispatch_at, received_at
        LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => row.id);
  }

  async markPublished(claim: OutboxClaim): Promise<void> {
    await this.pool.query(
      `UPDATE rp_commerce_event
          SET dispatch_state = 'queued',
              dispatch_lease_token = NULL,
              dispatch_lease_until = NULL,
              dispatched_at = now(),
              last_dispatch_error_code = NULL
        WHERE id = $1
          AND dispatch_state = 'pending'
          AND dispatch_lease_token = $2`,
      [claim.eventId, claim.leaseToken],
    );
  }

  async markFailed(claim: OutboxClaim): Promise<void> {
    await this.pool.query(
      `UPDATE rp_commerce_event
          SET dispatch_lease_token = NULL,
              dispatch_lease_until = NULL,
              last_dispatch_error_code = 'sqs_publish_failed',
              next_dispatch_at =
                now() + (
                  LEAST(300, power(2, LEAST(dispatch_attempt_count, 8))) *
                  interval '1 second'
                )
        WHERE id = $1
          AND dispatch_state = 'pending'
          AND dispatch_lease_token = $2`,
      [claim.eventId, claim.leaseToken],
    );
  }
}

interface SqsSender {
  send(command: SendMessageCommand): Promise<unknown>;
}

export class SqsOutboxPublisher {
  constructor(
    private readonly store: OutboxStore,
    private readonly sqs: SqsSender,
    private readonly queueUrl: string,
    private readonly logger: Pick<Logger, "warn">,
  ) {}

  async publishEvent(eventId: string): Promise<boolean> {
    const claim = await this.store.claim(eventId);
    if (!claim) {
      return false;
    }

    const message: CommerceEventQueueMessage = {
      commerceEventId: claim.eventId,
      schemaVersion: 1,
      type: "commerce_event",
    };
    const fifoFields = this.queueUrl.endsWith(".fifo")
      ? {
          MessageDeduplicationId: claim.eventId,
          MessageGroupId: claim.commerceConnectionId,
        }
      : {};

    try {
      await this.sqs.send(
        new SendMessageCommand({
          MessageBody: JSON.stringify(message),
          QueueUrl: this.queueUrl,
          ...fifoFields,
        }),
      );
      await this.store.markPublished(claim);
      return true;
    } catch (error) {
      try {
        await this.store.markFailed(claim);
      } catch (markError) {
        this.logger.warn(
          { err: markError, eventId: claim.eventId },
          "outbox failure state could not be persisted",
        );
      }
      this.logger.warn(
        { err: error, eventId: claim.eventId },
        "commerce event remains pending for SQS delivery",
      );
      throw new OutboxPublishError(
        "Commerce event could not be published to SQS",
        { cause: error },
      );
    }
  }

  async flushPending(limit: number): Promise<number> {
    const eventIds = await this.store.listPending(limit);
    let published = 0;
    for (const eventId of eventIds) {
      if (await this.publishEvent(eventId)) {
        published += 1;
      }
    }
    return published;
  }
}

export function createSqsOutboxPublisher(
  pool: Pick<pg.Pool, "query">,
  sqs: SQSClient,
  queueUrl: string,
  logger: Pick<Logger, "warn">,
): SqsOutboxPublisher {
  return new SqsOutboxPublisher(
    new PostgresOutboxStore(pool),
    sqs,
    queueUrl,
    logger,
  );
}
