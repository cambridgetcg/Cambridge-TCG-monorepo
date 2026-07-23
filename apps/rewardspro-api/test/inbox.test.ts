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
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    const response = responses[responseIndex];
    responseIndex += 1;
    return response ?? { rows: [] };
  });
  const release = vi.fn();
  const inbox = new CommerceEventInbox({
    connect: vi.fn(async () => ({ query, release })),
  } as never);
  return { inbox, query, release };
}

describe("durable commerce-event inbox", () => {
  it("maps the shop to an active connection and commits a new event", async () => {
    const { inbox, query, release } = scriptedInbox([
      { rows: [{ id: TEST_CONNECTION_ID, workspace_id: TEST_WORKSPACE_ID }] },
      {
        rows: [
          {
            commerce_connection_id: TEST_CONNECTION_ID,
            external_event_type: "orders/paid",
            id: TEST_EVENT_ID,
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
    const insertCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO rp_commerce_event"),
    );
    expect(insertCall?.[0]).toContain(
      "ON CONFLICT (commerce_connection_id, external_event_id)",
    );
    expect(insertCall?.[1]?.[5]).toBe('{"id":42}');
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns the existing row for a byte-identical replay", async () => {
    const existing = {
      commerce_connection_id: TEST_CONNECTION_ID,
      external_event_type: "orders/paid",
      id: TEST_EVENT_ID,
      payload_sha256: "a".repeat(64),
      workspace_id: TEST_WORKSPACE_ID,
    };
    const { inbox, query } = scriptedInbox([
      { rows: [{ id: TEST_CONNECTION_ID, workspace_id: TEST_WORKSPACE_ID }] },
      { rows: [] },
      { rows: [existing] },
    ]);

    await expect(inbox.ingest(input())).resolves.toMatchObject({
      duplicate: true,
      eventId: TEST_EVENT_ID,
    });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET dispatch_state = 'pending'"),
      ),
    ).toBe(true);
  });

  it("rolls back if the event id is replayed with different content", async () => {
    const { inbox, query } = scriptedInbox([
      { rows: [{ id: TEST_CONNECTION_ID, workspace_id: TEST_WORKSPACE_ID }] },
      { rows: [] },
      {
        rows: [
          {
            commerce_connection_id: TEST_CONNECTION_ID,
            external_event_type: "orders/paid",
            id: TEST_EVENT_ID,
            payload_sha256: "b".repeat(64),
            workspace_id: TEST_WORKSPACE_ID,
          },
        ],
      },
    ]);

    await expect(inbox.ingest(input())).rejects.toBeInstanceOf(
      CommerceEventConflictError,
    );
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rolls back when no active commerce connection maps the shop", async () => {
    const { inbox, query } = scriptedInbox([{ rows: [] }]);

    await expect(inbox.ingest(input())).rejects.toBeInstanceOf(
      CommerceConnectionNotFoundError,
    );
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
});
