import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("login safety-limit messages", () => {
  it("distinguishes the email and service-wide magic-link limits", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/login/page.tsx"), "utf8");

    expect(page).toContain('body.code === "magic_link_email_limit"');
    expect(page).toContain('body.code === "magic_link_global_limit"');
    expect(page).toContain("service-wide safety limit");
    expect(page).toContain("active sign-in email limit");
    expect(page).toContain("if one arrived");
    expect(page).toContain("const failure = await messageFor(res)");
  });
});
