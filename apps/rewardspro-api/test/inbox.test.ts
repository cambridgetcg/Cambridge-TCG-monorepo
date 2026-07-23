import { describe, expect, it, vi } from "vitest";

import {
  CommerceConnectionNotFoundError,
  CommerceEventConflictError,
  CommerceEventInbox,
} from "../src/repositories/commerce-event-inbox.js";
import { TEST_CONNECTION_ID, TEST_EVENT_ID, TEST_WORKSPACE_ID } from "./helpers.js";

function input() {
  return {
    dispatch: true,
    externalEventId: "webhook-1",
    externalEventType: "orders/paid",
    occurredAt: "2026-07-23T10:00:00Z",
    payloadJson: '{"id":42}',
    payloadSha256: "a".repeat(64),
    provider: "shopify" as const,
    sourceAccountId: "example.myshopify.com",
  };
}

function scriptedInbox(
  responses: Array<{ rows: Array<Record<string, unknown>> }>,
) {
  let responseIndex = 0;
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => {
    const response = responses[responseIndex];
    responseIndex += 1;
    return response ?? { rows: [] };
  });
  const inbox = new CommerceEventInbox({ query } as never);
  return { inbox, query };
}

describe("durable commerce-event inbox", () => {
  it("uses the narrow atomic ingest capability for a new event", async () => {
    const { inbox, query } = scriptedInbox([
      {
        rows: [
          {
            commerce_connection_id: TEST_CONNECTION_ID,
            duplicate: false,
            event_id: TEST_EVENT_ID,
            external_event_type: "orders/paid",
            payload_sha256: "a".repeat(64),
            workspace_id: TEST_WORKSPACE_ID,
          },
        ],
      },
    ]);

    await expect(inbox.ingest(input())).resolves.toEqual({
      commerceConnectionId: TEST_CONNECTION_ID,
      duplicate: false,
      eventId: TEST_EVENT_ID,
      workspaceId: TEST_WORKSPACE_ID,
    });
    expect(String(query.mock.calls[0]?.[0])).toContain(
      "FROM public.rp_ingest_shopify_event",
    );
    expect(query.mock.calls[0]?.[1]?.[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(query.mock.calls[0]?.[1]?.[5]).toBe('{"id":42}');
  });

  it("returns the existing row for a byte-identical replay", async () => {
    const existing = {
      commerce_connection_id: TEST_CONNECTION_ID,
      duplicate: true,
      event_id: TEST_EVENT_ID,
      external_event_type: "orders/paid",
      payload_sha256: "a".repeat(64),
      workspace_id: TEST_WORKSPACE_ID,
    };
    const { inbox, query } = scriptedInbox([{ rows: [existing] }]);

    await expect(inbox.ingest(input())).resolves.toMatchObject({
      duplicate: true,
      eventId: TEST_EVENT_ID,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("rejects an event id replayed with different content", async () => {
    const { inbox } = scriptedInbox([
      {
        rows: [
          {
            commerce_connection_id: TEST_CONNECTION_ID,
            duplicate: true,
            event_id: TEST_EVENT_ID,
            external_event_type: "orders/paid",
            payload_sha256: "b".repeat(64),
            workspace_id: TEST_WORKSPACE_ID,
          },
        ],
      },
    ]);

    await expect(inbox.ingest(input())).rejects.toBeInstanceOf(
      CommerceEventConflictError,
    );
  });

  it("rejects when no active commerce connection maps the shop", async () => {
    const { inbox } = scriptedInbox([{ rows: [] }]);

    await expect(inbox.ingest(input())).rejects.toBeInstanceOf(
      CommerceConnectionNotFoundError,
    );
  });
});
