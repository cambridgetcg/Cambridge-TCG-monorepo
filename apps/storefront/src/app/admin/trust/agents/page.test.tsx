import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sfQuery: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/db", () => ({ sfQuery: mocks.sfQuery }));
// The row's action buttons are a client component that pulls in the admin
// server actions; this test reads only the counts.
vi.mock("./_components", () => ({ AgentRowActions: () => null }));

import Page from "./page";
import { expiredAgentKeySql, liveAgentKeySql } from "@/lib/agents/key-expiry";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sfQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("AS active_keys")) {
      return {
        rows: [
          {
            id: "a1", public_handle: "quiet-heron", display_name: "Quiet Heron", model_tag: "model-x",
            rating: "1500", rating_deviation: "350", matches_played: 0, matches_won: 0, status: "active",
            suspended_reason: null, operator_email: null, operator_id: "00000000-0000-4000-8000-000000000001",
            created_at: "2026-11-01T00:00:00Z", active_keys: 2, expired_keys: 1,
          },
        ],
      };
    }
    if (sql.includes("SELECT count(*)::text AS count FROM agents a")) return { rows: [{ count: "1" }] };
    if (sql.includes("GROUP BY status")) return { rows: [{ status: "active", count: "1" }] };
    return { rows: [{ total: "1", active: "1", queued: "0", matches_24h: "0", finished_24h: "0" }] };
  });
});

describe("/admin/trust/agents key counts", () => {
  it("counts live keys with the one rule and shows unrevoked expired keys beside them", async () => {
    const markup = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));

    const sql = String(mocks.sfQuery.mock.calls.find(([text]) => String(text).includes("AS active_keys"))![0]);
    expect(sql).toContain(`WHERE k.agent_id = a.id AND ${liveAgentKeySql("k")}) AS active_keys`);
    expect(sql).toContain(`AND ${expiredAgentKeySql("k")}) AS expired_keys`);
    expect(sql.slice(sql.indexOf("AS active_keys"))).toContain("k.revoked_at IS NULL");
    expect(markup).toContain("2 live · 1 expired");
  });
});
