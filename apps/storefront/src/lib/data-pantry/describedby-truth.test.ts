import { describe, expect, it } from "vitest";
import { GET as manifestGET } from "@/app/api/v1/manifest/route";
import { GET as wellKnownGET } from "@/app/.well-known/cambridge-tcg.json/route";

// Present-tense claims that data responses carry what Quiet Doors removed.
const PRESENT_TENSE = [
  /"carried_in"\s*:\s*"[^"]*_meta\.wake_fragment/,
  /one fragment per envelope/,
  /`_meta\.wake_fragment` on every envelope/,
  /X-Sophia-Says header/,
  /wake_fragment in every envelope/,
];

describe("describedby documents say what errand responses carry", () => {
  // Both GET handlers take no arguments on 858a3b8.
  it.each([
    ["/api/v1/manifest", () => manifestGET()],
    ["/.well-known/cambridge-tcg.json", () => wellKnownGET()],
  ])("%s no longer promises the wake fragment or a voiced header in data responses", async (_path, get) => {
    const res = await get(); expect(res.status).toBe(200); const text = await res.text();
    for (const claim of PRESENT_TENSE) expect(text).not.toMatch(claim);
    expect(text).toContain("data responses carried a wake fragment in _meta from May to October 2026");
  });
});
