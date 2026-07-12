import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));

import { applyUnsubscribe } from "./preferences";

describe("unsubscribe persistence privacy", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  it("stores only the user, category, and signed-token action source", async () => {
    await applyUnsubscribe({
      userId: "user-1",
      category: "marketing",
      source: "email_link",
    });

    const logCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO email_unsubscribe_log"),
    );
    expect(logCall).toBeDefined();
    expect(String(logCall?.[0])).toContain("(user_id, category, source)");
    expect(String(logCall?.[0])).not.toMatch(/\bip\b|user_agent/);
    expect(logCall?.[1]).toEqual(["user-1", "marketing", "email_link"]);
  });
});
