import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("registration-paused auth result", () => {
  it("provides an honest branded destination for first-time Google sign-in", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/login/error/page.tsx"),
      "utf8",
    );

    expect(page).toContain("RegistrationPaused");
    expect(page).toContain("New registration is paused");
    expect(page).toContain("limiting sign-in to existing account holders");
    expect(page).toContain("adult-account and terms boundary is reviewed");
    expect(page).toContain('action: "Back to sign in"');
  });
});
