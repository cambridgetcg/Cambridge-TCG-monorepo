import { describe, expect, it, vi } from "vitest";
import type { CompatQueryResult } from "@cambridge-tcg/db/compat";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import {
  createCollectorObservation,
  listCollectorObservations,
  updateCollectorObservation,
} from "./db";
import type { CreateCollectorObservationInput } from "./types";

type QueryCall = { sql: string; params: unknown[] };

function ownerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "123e4567-e89b-42d3-a456-426614174001",
    submission_key: "123e4567-e89b-42d3-a456-426614174000",
    sku: "op-op01-001-ja",
    observation_kind: "purchase",
    condition: "NM",
    price_amount: "12.30",
    price_currency: "GBP",
    observed_on: "2026-07-11",
    first_party_attested_at: "2026-07-12T10:00:00.000Z",
    sharing_mode: "private",
    sharing_terms_version: "collector-witness-v1",
    sharing_changed_at: "2026-07-12T10:00:00.000Z",
    cc0_acknowledged_at: null,
    evidence_sha256: null,
    revision: 1,
    created_at: "2026-07-12T10:00:00.000Z",
    updated_at: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

function scriptedQuery(results: Array<Record<string, unknown>[]>) {
  const calls: QueryCall[] = [];
  const q = async (sql: string, params: unknown[] = []): Promise<CompatQueryResult> => {
    calls.push({ sql, params });
    const rows = results.shift() ?? [];
    return { rows, rowCount: rows.length };
  };
  return { q, calls };
}

describe("collector observation database boundary", () => {
  it("normalizes an uppercase owner SKU before the owner-scoped list query", async () => {
    const { q, calls } = scriptedQuery([[ownerRow()]]);
    const rows = await listCollectorObservations(
      "123e4567-e89b-42d3-a456-426614174099",
      { limit: 20, sku: "OP-OP01-001-JP" },
      q,
    );

    expect(rows).toHaveLength(1);
    expect(calls[0]!.params).toEqual([
      "123e4567-e89b-42d3-a456-426614174099",
      "op-op01-001-ja",
      20,
    ]);
    expect(calls[0]!.sql).toContain("WHERE user_id = $1");
    expect(calls[0]!.sql).toContain("AND sku = $2");
  });

  it("makes a submission-key replay idempotent for the same owner", async () => {
    const { q, calls } = scriptedQuery([[], [ownerRow()]]);
    const input: CreateCollectorObservationInput = {
      submission_key: "123e4567-e89b-42d3-a456-426614174000",
      sku: "op-op01-001-ja",
      observation_kind: "purchase",
      condition: "NM",
      price_amount: "12.30",
      price_currency: "GBP",
      observed_on: "2026-07-11",
      first_party_attested: true,
      sharing_mode: "private",
      evidence_sha256: null,
      cc0_acknowledged: false,
    };

    const result = await createCollectorObservation(
      "123e4567-e89b-42d3-a456-426614174099",
      input,
      q,
    );
    expect(result.created).toBe(false);
    expect(calls[0]!.sql).toContain("ON CONFLICT (user_id, submission_key) DO NOTHING");
    expect(calls[1]!.sql).toContain("WHERE user_id = $1::uuid AND submission_key = $2::uuid");
  });

  it("clears stale evidence on a factual correction and scopes by owner+revision", async () => {
    const { q, calls } = scriptedQuery([[ownerRow({ price_amount: "13.00", revision: 2 })]]);
    const result = await updateCollectorObservation(
      "123e4567-e89b-42d3-a456-426614174099",
      "123e4567-e89b-42d3-a456-426614174001",
      { revision: 1, price_amount: "13.00" },
      q,
    );

    expect(result.status).toBe("updated");
    expect(calls[0]!.sql).toContain("evidence_sha256 = NULL");
    expect(calls[0]!.sql).toContain(
      "WHERE id = $1::uuid AND user_id = $2::uuid AND revision = $3",
    );
  });

});
