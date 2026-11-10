import { describe, expect, it } from "vitest";
import {
  ARCHIVE_REVOCATION_REASON,
  HOLDER_REVOCATION_REASON,
  SIGNED_ACT_REVOCATION_REASON,
} from "@/lib/agents/revocation-reasons";
import { keyRevocationLabel, toKeyRows, type StoredKeyRow } from "./key-revocation-label";

const KEY_ROW_FIELDS = [
  "agent_id",
  "created_at",
  "expired",
  "expires_at",
  "id",
  "key_prefix",
  "last_used_at",
  "name",
  "rate_limit_tier",
  "revoked_at",
  "revoked_by",
].sort();

function stored(overrides: Partial<StoredKeyRow>): StoredKeyRow {
  return {
    id: "key-1",
    agent_id: "agent-1",
    key_prefix: "ctcg_agt_abc",
    name: "laptop",
    rate_limit_tier: "free",
    last_used_at: null,
    revoked_at: null,
    revoked_reason: null,
    expires_at: null,
    expired: false,
    created_at: "2026-10-29T10:00:00Z",
    ...overrides,
  };
}

describe("toKeyRows", () => {
  const STAFF_NOTE = "admin archive: repeated abuse from 203.0.113.9 (ticket 4411)";
  const OPERATOR_NOTE = "rotated after laptop loss at the Cambridge office";

  it("sends a category in place of the stored reason, and no reason text at all", () => {
    const rows = toKeyRows([
      stored({ id: "k1", revoked_at: "2026-10-29T11:00:00Z", revoked_reason: STAFF_NOTE }),
      stored({ id: "k2", revoked_at: "2026-10-29T11:00:00Z", revoked_reason: OPERATOR_NOTE }),
      stored({ id: "k3", revoked_at: "2026-10-29T11:00:00Z", revoked_reason: HOLDER_REVOCATION_REASON }),
      stored({ id: "k4", revoked_at: "2026-10-29T11:00:00Z", revoked_reason: ARCHIVE_REVOCATION_REASON }),
      stored({ id: "k5" }),
    ]);

    expect(rows.map((row) => row.revoked_by)).toEqual([
      "revoked by Cambridge TCG staff",
      "revoked from this page",
      "revoked by the key holder",
      "revoked when the agent was archived",
      null,
    ]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(KEY_ROW_FIELDS);
      expect(row).not.toHaveProperty("revoked_reason");
    }
    const wire = JSON.stringify(rows);
    for (const text of ["203.0.113.9", "ticket 4411", "abuse", "laptop loss", "Cambridge office"]) {
      expect(wire).not.toContain(text);
    }
  });

  it("drops columns it does not name, so a wider query cannot leak through", () => {
    const wider = {
      ...stored({ revoked_at: "2026-10-29T11:00:00Z", revoked_reason: STAFF_NOTE }),
      key_hash: "f".repeat(64),
      operated_by_user_id: "user-1",
    };

    const [row] = toKeyRows([wider]);

    expect(Object.keys(row).sort()).toEqual(KEY_ROW_FIELDS);
    expect(JSON.stringify(row)).not.toContain("f".repeat(64));
    expect(JSON.stringify(row)).not.toContain("user-1");
  });

  it("labels nothing for a live key, whatever the reason column holds", () => {
    const [row] = toKeyRows([stored({ revoked_reason: STAFF_NOTE })]);
    expect(row.revoked_by).toBeNull();
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
  });

  it("passes the stored expiry and the SQL's expired flag, and nothing else reads as expired", () => {
    const rows = toKeyRows([
      stored({ id: "never", expires_at: null, expired: false }),
      stored({ id: "future", expires_at: "2027-01-28T15:04:00.000Z", expired: false }),
      stored({ id: "past", expires_at: "2026-10-30T00:00:00.000Z", expired: true }),
      // A row whose flag is missing or not a boolean is not called expired.
      { ...stored({ id: "odd" }), expired: "t" as unknown as boolean },
    ]);
    expect(rows.map((row) => [row.id, row.expires_at, row.expired])).toEqual([
      ["never", null, false],
      ["future", "2027-01-28T15:04:00.000Z", false],
      ["past", "2026-10-30T00:00:00.000Z", true],
      ["odd", null, false],
    ]);
  });

  it("sends the expiry as an ISO 8601 string when the driver returns a Date, as postgres.js does", () => {
    const [row] = toKeyRows([stored({ expires_at: new Date("2027-01-28T15:04:07.000Z") })]);
    expect(row.expires_at).toBe("2027-01-28T15:04:07.000Z");
    expect(typeof row.expires_at).toBe("string");
  });
});

describe("keyRevocationLabel", () => {
  it.each([
    [HOLDER_REVOCATION_REASON, "revoked by the key holder"],
    [ARCHIVE_REVOCATION_REASON, "revoked when the agent was archived"],
    [SIGNED_ACT_REVOCATION_REASON, "revoked by a signed act"],
    ["admin archive: repeated abuse from 203.0.113.9", "revoked by Cambridge TCG staff"],
    ["admin revoke: leaked in a support ticket", "revoked by Cambridge TCG staff"],
    ["rotated after laptop loss", "revoked from this page"],
    [null, "revoked from this page"],
    ["", "revoked from this page"],
  ])("maps %j to a category", (reason, label) => {
    expect(keyRevocationLabel(reason)).toBe(label);
  });

  it("never carries the reason text into the label", () => {
    for (const reason of [
      "admin archive: private staff note",
      "my own private note",
      `${HOLDER_REVOCATION_REASON} extra`,
    ]) {
      const label = keyRevocationLabel(reason);
      expect(label).not.toContain("private");
      expect(label).not.toContain("extra");
    }
  });

  it("matches the sentinels exactly", () => {
    expect(keyRevocationLabel(`${HOLDER_REVOCATION_REASON} extra`)).toBe("revoked from this page");
    expect(keyRevocationLabel(`${ARCHIVE_REVOCATION_REASON} `)).toBe("revoked from this page");
    expect(keyRevocationLabel(`${SIGNED_ACT_REVOCATION_REASON}.`)).toBe("revoked from this page");
  });
});
