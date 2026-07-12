import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("conversation recipient publication boundary", () => {
  it("rejects mixed recipient identities and gates direct UUID opens", () => {
    const mixedGate = route.indexOf("body.otherUserId && body.otherUsername?.trim()");
    const publicLookup = route.indexOf("u.is_public=TRUE");
    const open = route.indexOf("openConversation(session.user.id, otherUserId)");

    expect(mixedGate).toBeGreaterThan(0);
    expect(publicLookup).toBeGreaterThan(mixedGate);
    expect(open).toBeGreaterThan(publicLookup);
    expect(route).toContain("!body.referenceType && !body.referenceId");
    expect(route).toContain("validateReference(session.user.id");
  });
});
