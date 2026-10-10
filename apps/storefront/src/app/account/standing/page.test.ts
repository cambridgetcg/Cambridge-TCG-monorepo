import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src/app/account/standing/page.tsx"),
  "utf8",
).replace(/\s+/g, " ");

describe("account-standing fraud-signal guidance", () => {
  it("does not promise that unresolved signals disappear with time or activity", () => {
    expect(page).not.toContain("clears on its own");
    expect(page).not.toContain("note clears as things level out");
    expect(page).not.toContain("most settle on their own");
    expect(page).toContain("Signals do not clear themselves");
    expect(page).toContain("operator must resolve or dismiss them");
  });

  it("states the automatic score consequence without calling it a suspension", () => {
    expect(page).toContain("unresolved medium-or-higher signal subtracts 20 points");
    expect(page).toContain("can change future trading terms");
    expect(page).toContain("does not directly suspend your account");
    expect(page).toContain("request human review");
  });
});
