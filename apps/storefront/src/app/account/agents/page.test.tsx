import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  listSigningKeys: vi.fn(),
  client: vi.fn<
    (props: {
      keys: Record<string, unknown>[];
      signedActs: { open: boolean };
      signingKeys: Record<string, unknown>;
    }) => null
  >(() => null),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/agents/signing-key-actions", () => ({ listSigningKeys: mocks.listSigningKeys }));
// Capture the props the server page hands to the browser.
vi.mock("./_client", () => ({ AgentsClient: mocks.client }));

import AgentsAccountPage from "./page";
import { expiredAgentKeySql } from "@/lib/agents/key-expiry";

const USER_ID = "00000000-0000-4000-8000-0000000000a1";
const STAFF_NOTE = "admin revoke: leaked in support ticket 4411 by 203.0.113.9";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("AGENT_SIGNED_ACTS", "");
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
              // postgres.js returns a timestamptz as a Date.
              expires_at: new Date("2026-11-05T10:00:00Z"),
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
    // Not every key has an expiry, and agent.revoke_key's answers carry no header.
    expect(text).toContain("Each key stops working at the expiry chosen when it was minted, if one was chosen");
    expect(text).toContain("a key minted with never, or before expiry existed, has none");
    expect(text).toContain("each successful authenticated tool result (not agent.revoke_key's answers) carries an X-Agent-Key-Expires header");
    expect(text).toContain("Nothing is sent to you before a key expires.");
    expect(text).toContain("mint a new key, move the agent to it, check the old key's last use here, then revoke the old key");
    expect(html).toContain('href="/methodology/agents#key-expiry"');
  });

  it("decides expiry in the key query, by the database's clock, with the one rule", async () => {
    renderToStaticMarkup(await AgentsAccountPage());

    const keySql = String(mocks.query.mock.calls.find(([sql]) => String(sql).includes("FROM agent_keys"))![0]);
    expect(keySql).toContain(`(k.revoked_at IS NULL AND ${expiredAgentKeySql("k")}) AS expired`);
    const [props] = mocks.client.mock.calls[0];
    // The client gets an ISO 8601 string, as KeyRow says, not the driver's Date.
    expect(props.keys[0]).toMatchObject({ expires_at: "2026-11-05T10:00:00.000Z", expired: false });
  });

  it("reads no signing key and no mint mark while signed acts are closed", async () => {
    renderToStaticMarkup(await AgentsAccountPage());

    expect(mocks.listSigningKeys).not.toHaveBeenCalled();
    for (const [sql] of mocks.query.mock.calls) {
      expect(String(sql)).not.toMatch(/agent_signing_keys|agent_act_events|minted_by_event/);
    }
    const [props] = mocks.client.mock.calls[0];
    expect(props.signedActs).toEqual({ open: false });
    expect(props.signingKeys).toEqual({});
    expect(props.keys[0].minted_by_signed_act).toBe(false);
  });

  it("lists each operator-managed agent's signing keys and marks signed mints while open", async () => {
    vi.stubEnv("AGENT_SIGNED_ACTS", "on");
    vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", "https://cambridgetcg.com");
    const agentRows = [
      { id: "a1", registered_via: "operator", status: "active" },
      { id: "a2", registered_via: "self-serve", status: "active" },
      { id: "a3", registered_via: "operator", status: "archived" },
    ];
    const keyRow = { id: "k1", agent_id: "a1", key_prefix: "ctcg_agt_abc", name: "laptop", rate_limit_tier: "free", last_used_at: null, revoked_at: null, revoked_reason: null, created_at: "2026-11-10T10:00:00Z", expires_at: null, expired: false };
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("FROM agent_keys") ? [keyRow, { ...keyRow, id: "k2" }] : agentRows }));
    mocks.listSigningKeys.mockImplementation(async ({ agent_id }: { agent_id: string }) => {
      if (agent_id === "a3") throw new Error("read failed");
      return {
        ok: true,
        data: {
          open: true,
          max_live_signing_keys: 2,
          signing_keys: [{ id: "s1", kid: "A".repeat(43), state: "confirmed" }],
          signed_mints: [{ key_id: "k1", minted_by_kid: "A".repeat(43) }],
        },
      };
    });

    renderToStaticMarkup(await AgentsAccountPage());

    // Operator-managed agents only, one at a time.
    expect(mocks.listSigningKeys.mock.calls.map(([input]) => input)).toEqual([{ agent_id: "a1" }, { agent_id: "a3" }]);
    const [props] = mocks.client.mock.calls[0];
    expect(props.signedActs).toEqual({ open: true });
    expect(props.signingKeys).toEqual({ a1: [{ id: "s1", kid: "A".repeat(43), state: "confirmed" }], a3: null });
    expect(props.keys.map((key) => [key.id, key.minted_by_signed_act, key.minted_by_kid])).toEqual([["k1", true, "A".repeat(43)], ["k2", false, null]]);
  });
});
