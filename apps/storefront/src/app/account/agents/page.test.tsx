import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  client: vi.fn<(props: { keys: Record<string, unknown>[] }) => null>(() => null),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
// Capture the props the server page hands to the browser.
vi.mock("./_client", () => ({ AgentsClient: mocks.client }));

import AgentsAccountPage from "./page";
import { expiredAgentKeySql } from "@/lib/agents/key-expiry";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const STAFF_NOTE = "admin revoke: leaked in support ticket 4411 by 203.0.113.9";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes("FROM agent_keys")
      ? {
          rows: [
            {
              id: "k1",
              agent_id: "a1",
              key_prefix: "ctcg_agt_abc",
              name: "laptop",
              rate_limit_tier: "free",
              last_used_at: null,
              revoked_at: "2026-10-29T11:00:00Z",
              revoked_reason: STAFF_NOTE,
              created_at: "2026-10-29T10:00:00Z",
              expires_at: "2026-11-05T10:00:00Z",
              expired: false,
            },
          ],
        }
      : { rows: [] },
  );
});

describe("/account/agents page", () => {
  it("hands the client a revocation category, never the stored reason", async () => {
    renderToStaticMarkup(await AgentsAccountPage());

    expect(mocks.client).toHaveBeenCalledTimes(1);
    const [props] = mocks.client.mock.calls[0];
    expect(props.keys).toHaveLength(1);
    expect(props.keys[0]).not.toHaveProperty("revoked_reason");
    expect(props.keys[0].revoked_by).toBe("revoked by Cambridge TCG staff");
    expect(JSON.stringify(props)).not.toContain("4411");
    expect(JSON.stringify(props)).not.toContain("203.0.113.9");
    // Both reads are scoped to the signed-in operator.
    for (const [, args] of mocks.query.mock.calls) expect(args).toEqual([USER_ID]);
  });

  it("tells the operator where a key's expiry shows, that nothing is sent, and how to rotate", async () => {
    const html = renderToStaticMarkup(await AgentsAccountPage());
    const text = html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

    expect(text).toContain("agent.self returns key_expires_at");
    expect(text).toContain("X-Agent-Key-Expires");
    expect(text).toContain("Nothing is sent to you before a key expires.");
    expect(text).toContain("mint a new key, move the agent to it, check the old key's last use here, then revoke the old key");
    expect(html).toContain('href="/methodology/agents#key-expiry"');
  });

  it("decides expiry in the key query, by the database's clock, with the one rule", async () => {
    renderToStaticMarkup(await AgentsAccountPage());

    const keySql = String(mocks.query.mock.calls.find(([sql]) => String(sql).includes("FROM agent_keys"))![0]);
    expect(keySql).toContain(`(k.revoked_at IS NULL AND ${expiredAgentKeySql("k")}) AS expired`);
    const [props] = mocks.client.mock.calls[0];
    expect(props.keys[0]).toMatchObject({ expires_at: "2026-11-05T10:00:00Z", expired: false });
  });
});
