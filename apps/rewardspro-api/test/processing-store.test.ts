import { describe, expect, it, vi } from "vitest";

import {
  CommerceProjectionConflictError,
  PostgresProcessingStore,
  ProcessingLeaseLostError,
} from "../src/processing.js";
import { normalizeCommerceEvent } from "../src/domain/normalized-order-paid.js";
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
      "payload.payload::text AS payload_json",
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

  it("writes exact projections and semantic threads in the lease transaction", async () => {
    const source = normalizableEvent({
      payload: {
        currency: "GBP",
        current_total_price: "12.50",
        id: "820982911946154508",
        line_items: [
          {
            id: "820982911946154510",
            product_id: "820982911946154511",
            quantity: 1,
            title: "Exact identity",
            variant_id: "820982911946154512",
          },
        ],
        processed_at: "2026-07-23T10:00:00Z",
      },
    });
    const event = {
      ...source,
      leaseToken: "40000000-0000-4000-8000-000000000004",
    };
    const query = vi.fn(async (sql: string, _values?: unknown[]) => {
      if (sql.includes("SELECT event_id")) {
        return { rowCount: 1, rows: [{ event_id: event.eventId }] };
      }
      if (sql.includes("UPDATE public.rp_commerce_event_state")) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: null, rows: [] };
    });
    const release = vi.fn();
    const store = new PostgresProcessingStore({
      connect: vi.fn(async () => ({ query, release })),
    } as never);

    await store.completeNormalized(event, normalizeCommerceEvent(source));

    const orderInsert = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO commerce.orders"),
    );
    const lineItemInsert = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO commerce.line_items"),
    );
    const threadInserts = query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO yu.threads"),
    );
    expect(orderInsert?.[1]?.[4]).toBe("820982911946154508");
    expect(lineItemInsert?.[1]?.[5]).toBe("820982911946154510");
    expect(lineItemInsert?.[1]?.[6]).toBe("820982911946154511");
    expect(lineItemInsert?.[1]?.[7]).toBe("820982911946154512");
    expect(JSON.parse(String(lineItemInsert?.[1]?.[13]))).toMatchObject({
      fields: {
        externalLineItemId: {
          sourcePath: "payload.line_items[0].id",
        },
      },
    });
    expect(threadInserts.map(([sql]) => String(sql))).toEqual([
      expect.stringContaining("'derived_from'"),
      expect.stringContaining("'contains'"),
    ]);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining("FOR UPDATE"),
      expect.stringContaining("INSERT INTO commerce.orders"),
      expect.stringContaining("INSERT INTO commerce.line_items"),
      expect.stringContaining("INSERT INTO yu.threads"),
      expect.stringContaining("INSERT INTO yu.threads"),
      expect.stringContaining("UPDATE public.rp_commerce_event_state"),
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back before projection when the normalization lease is lost", async () => {
    const source = normalizableEvent();
    const event = {
      ...source,
      leaseToken: "40000000-0000-4000-8000-000000000004",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT event_id")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: null, rows: [] };
    });
    const store = new PostgresProcessingStore({
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as never);

    await expect(
      store.completeNormalized(event, normalizeCommerceEvent(source)),
    ).rejects.toBeInstanceOf(ProcessingLeaseLostError);
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO")),
    ).toBe(false);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("maps only named business uniqueness conflicts after rollback", async () => {
    const source = normalizableEvent();
    const event = {
      ...source,
      leaseToken: "40000000-0000-4000-8000-000000000004",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT event_id")) {
        return { rowCount: 1, rows: [{ event_id: event.eventId }] };
      }
      if (sql.includes("INSERT INTO commerce.orders")) {
        throw {
          code: "23505",
          constraint: "commerce_orders_external_unique",
        };
      }
      return { rowCount: null, rows: [] };
    });
    const store = new PostgresProcessingStore({
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as never);

    await expect(
      store.completeNormalized(event, normalizeCommerceEvent(source)),
    ).rejects.toBeInstanceOf(CommerceProjectionConflictError);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("does not hide an unexpected database uniqueness failure", async () => {
    const source = normalizableEvent();
    const event = {
      ...source,
      leaseToken: "40000000-0000-4000-8000-000000000004",
    };
    const unexpected = {
      code: "23505",
      constraint: "commerce_orders_pkey",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT event_id")) {
        return { rowCount: 1, rows: [{ event_id: event.eventId }] };
      }
      if (sql.includes("INSERT INTO commerce.orders")) {
        throw unexpected;
      }
      return { rowCount: null, rows: [] };
    });
    const store = new PostgresProcessingStore({
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as never);

    await expect(
      store.completeNormalized(event, normalizeCommerceEvent(source)),
    ).rejects.toBe(unexpected);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("terminalizes unprocessed expiry and deletes only bounded payload rows", async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rows: [{ deleted_payloads: 4, terminalized_events: 2 }],
    }));
    const store = new PostgresProcessingStore({ query } as never);

    await expect(store.sweepExpiredPayloads(10)).resolves.toEqual({
      deletedPayloads: 4,
      terminalizedEvents: 2,
    });
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("LIMIT $1");
    expect(sql).toContain("FOR UPDATE OF state SKIP LOCKED");
    expect(sql).toContain("processing_state = 'failed'");
    expect(sql).toContain("DELETE FROM commerce.event_payloads");
    expect(sql).not.toContain("DELETE FROM commerce.events");
    expect(query.mock.calls[0]?.[1]).toEqual([10]);
  });
});
