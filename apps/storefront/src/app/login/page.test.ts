import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("login account-enumeration boundary", () => {
  it("uses a generic confirmation without claiming that a link was sent", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/login/page.tsx"), "utf8");

    expect(page).toContain("If an eligible existing account exists for");
    expect(page).toContain("a sign-in");
    expect(page).toContain("link will arrive");
    expect(page).not.toContain("We sent a sign-in link");
    expect(page).toContain("const failure = await messageFor(res)");
  });

  it("does not expose admission or address-specific capacity decisions", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/login/page.tsx"), "utf8");

    expect(page).not.toContain('body.code === "ACCOUNT_ADMISSION_PAUSED"');
    expect(page).not.toContain('body.code === "magic_link_email_limit"');
    expect(page).not.toContain('body.code === "magic_link_global_limit"');
    expect(page).toContain("Sign-in requests always receive the same confirmation");
    expect(page).not.toContain("One will be created automatically");
  });
});
