import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ query }));

import { applyUnsubscribe } from "./preferences";

beforeEach(() => {
  query.mockReset();
});

describe("unsubscribe persistence", () => {
  it("stores only the preference transition and reports replays as no-ops", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ user_id: "user-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(applyUnsubscribe({
      userId: "user-1",
      category: "marketing",
    })).resolves.toEqual({ changed: true });
    await expect(applyUnsubscribe({
      userId: "user-1",
      category: "marketing",
    })).resolves.toEqual({ changed: false });

    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("ON CONFLICT (user_id) DO UPDATE");
    expect(sql).toContain("user_email_preferences.marketing IS DISTINCT FROM FALSE");
    expect(sql).not.toContain("email_unsubscribe_log");
    expect(query.mock.calls[0]?.[1]).toEqual(["user-1"]);
  });
});
