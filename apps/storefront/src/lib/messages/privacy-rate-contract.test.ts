import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/lib/messages/db.ts"), "utf8");

describe("direct-message abuse-control contract", () => {
  it("uses atomic privacy buckets for message and new-thread limits", () => {
    expect(source).toContain('action: "dm-send"');
    expect(source).toContain('action: "dm-thread-open"');
    expect(source.match(/consumeActionRateLimit\(/g)).toHaveLength(2);
    expect(source).not.toContain("COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute')");
    expect(source).not.toContain("FROM dm_conversations\n      WHERE created_by = $1 AND created_at > NOW() - INTERVAL '1 hour'");
  });

  it("fails closed when rate-limit storage or hashing is unavailable", () => {
    expect(source).toContain("its abuse control is unavailable");
    expect(source.match(/status: 503/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
