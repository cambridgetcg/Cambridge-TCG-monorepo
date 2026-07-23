import { describe, expect, it, vi } from "vitest";

import {
  PostgresProcessingStore,
  ProcessingLeaseLostError,
} from "../src/processing.js";
import { normalizableEvent } from "./helpers.js";

describe("PostgreSQL processing leases", () => {
  it("normalizes exact jsonb text without rounding 64-bit ids", async () => {
    const query = vi.fn(async (_sql: string) => ({
      rows: [
        {
          commerce_connection_id:
            "30000000-0000-4000-8000-000000000003",
          external_account_id: "example.myshopify.com",
          external_event_id: "webhook-1",
          external_event_type: "orders/paid",
          id: "10000000-0000-4000-8000-000000000001",
          occurred_at: "2026-07-23T10:00:00Z",
          payload_json:
            '{"currency":"GBP","current_total_price":"12.50","id":820982911946154508,"line_items":[],"processed_at":"2026-07-23T10:00:00Z"}',
          payload_sha256: "a".repeat(64),
          provider: "shopify",
          received_at: "2026-07-23T10:00:01Z",
          workspace_id: "20000000-0000-4000-8000-000000000002",
        },
      ],
    }));

    const result = await new PostgresProcessingStore({
      query,
    } as never).claimById("10000000-0000-4000-8000-000000000001");

    expect(result).toMatchObject({
      event: {
        payload: { id: "820982911946154508" },
      },
      status: "claimed",
    });
    expect(String(query.mock.calls[0]?.[0])).toContain(
      "claimed.payload::text AS payload_json",
    );
  });

  it("distinguishes an active lease from a terminal duplicate", async () => {
    const activeQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ lease_active: true, processing_state: "processing" }],
      });
    const terminalQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ lease_active: false, processing_state: "normalized" }],
      });

    await expect(
      new PostgresProcessingStore({ query: activeQuery } as never).claimById(
        "10000000-0000-4000-8000-000000000001",
      ),
    ).resolves.toEqual({ status: "active_lease" });
    await expect(
      new PostgresProcessingStore({ query: terminalQuery } as never).claimById(
        "10000000-0000-4000-8000-000000000001",
      ),
    ).resolves.toEqual({ status: "terminal" });
  });

  it("claims expired leases and stale queued deliveries for recovery", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rows: [],
    }));
    const store = new PostgresProcessingStore({ query } as never, 120);

    await expect(store.claimNextRecoverable()).resolves.toBeNull();

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("processing_lease_until < now()");
    expect(sql).toContain("dispatch_state = 'queued'");
    expect(sql).toContain("dispatched_at < now()");
    expect(query.mock.calls[0]?.[1]?.[1]).toBe(120);
  });

  it("does not let an expired owner complete another worker's lease", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rowCount: 0,
      rows: [],
    }));
    const store = new PostgresProcessingStore({ query } as never);

    await expect(
      store.completeFailed(
        {
          ...normalizableEvent(),
          leaseToken: "40000000-0000-4000-8000-000000000004",
        },
        "unexpected_error",
      ),
    ).rejects.toBeInstanceOf(ProcessingLeaseLostError);
    expect(String(query.mock.calls[0]?.[0])).toContain(
      "processing_lease_token = $2",
    );
  });
});
