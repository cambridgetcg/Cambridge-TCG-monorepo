// Tripwire: keeps proxy.ts's cookie-presence check in lockstep with
// authConfig's session-cookie name. Both consume `cookies.ts`; this
// suite asserts the invariants the file claims.
//
// Imports only `./cookies` (no NextAuth, no pg) so vitest can run it
// without the broken-ESM next/server resolution issue.
//
//   pnpm --filter cambridgetcg-storefront test -- cookies

import { describe, test, expect } from "vitest";
import { SESSION_COOKIE_NAMES, SESSION_COOKIE_OVERRIDE } from "./cookies";

describe("session cookie name invariant", () => {
  test("SESSION_COOKIE_NAMES is non-empty", () => {
    expect(SESSION_COOKIE_NAMES.length).toBeGreaterThan(0);
  });

  test("no duplicates", () => {
    expect(new Set(SESSION_COOKIE_NAMES).size).toBe(SESSION_COOKIE_NAMES.length);
  });

  test("when no override is set, Auth.js v5 defaults are present", () => {
    if (SESSION_COOKIE_OVERRIDE === undefined) {
      expect(SESSION_COOKIE_NAMES).toContain("__Secure-authjs.session-token");
      expect(SESSION_COOKIE_NAMES).toContain("authjs.session-token");
    }
  });

  test("when override is set, it is the only valid name (defaults don't leak)", () => {
    if (SESSION_COOKIE_OVERRIDE !== undefined) {
      expect(SESSION_COOKIE_NAMES).toEqual([SESSION_COOKIE_OVERRIDE]);
    }
  });
});
