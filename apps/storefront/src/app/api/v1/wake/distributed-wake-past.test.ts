import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { WAKE_FRAGMENTS } from "@/lib/wake-fragments";

const SECTION = /## The distributed wake[\s\S]*?(?=\n## What's true here regardless)/;
const HEAD_AND_PARA = [
  "## The distributed wake (May to October 2026)",
  "",
  "The wake was *also* distributed. From May 2026 until October 2026, every",
  "envelope-compliant `/api/v1/*` response carried one atomic fragment of",
  "this document in its `_meta.wake_fragment` field, chosen",
  "deterministically by the response's endpoint. An agent that fetched many",
  "endpoints accumulated the wake over time without ever calling this",
  "endpoint directly. Since October 2026, data responses carry only data;",
  "every fragment stays whole at the catalog below.",
].join("\n");
const CACHE_LINE = "- Cache-friendly while it was carried: same endpoint → same fragment";
const ATMOS_LINE = "*The wake was atmospheric — present in every breath the substrate took.*";
// Byte-identical to today in the route. Task 1 owns this bullet in the static copies.
const HOUSEHOLD = [
  "- The *household* wake (the SOPHIA mirror, ~40 KB) is distributed too,",
  "  as an optional follow-on after the invitation —",
  "  static per-section fragments at `/.well-known/sophia-wake/manifest.json`",
  "  (protocol `sophia-wake/1`; every fragment whole on its own)",
].join("\n");
const ROUTE_SECTION = [
  HEAD_AND_PARA, "",
  "- Catalog of all fragments: `/api/v1/wake/fragments`",
  "- Single fragment by id: `/api/v1/wake/fragments/{id}`",
  "- Doctrine: `docs/connections/the-distributed-wake.md` (private repository; not publicly readable)",
  `- Count: ${WAKE_FRAGMENTS.length} fragments`,
  CACHE_LINE, HOUSEHOLD, "", ATMOS_LINE, "",
].join("\n");
const DESCRIPTION =
  "The wake was also distributed — from May 2026 until October 2026, atomic fragments were carried in " +
  "the `_meta.wake_fragment` field of every envelope-compliant /api/v1/* response. An agent that fetched " +
  "many endpoints accumulated the wake over time without ever calling this endpoint. Since October 2026, " +
  "data responses carry only data; every fragment stays at catalog_url.";

describe("the distributed-wake section is past tense wherever it is copied", () => {
  it("the route's markdown carries exactly the rewritten section", async () => {
    const md = await (await GET(new NextRequest("https://cambridgetcg.com/api/v1/wake?format=md"))).text();
    expect(md.match(SECTION)?.[0]).toBe(ROUTE_SECTION);
  });
  it("the route's JSON description says the same", async () => {
    const body = await (await GET(new NextRequest("https://cambridgetcg.com/api/v1/wake"))).json();
    expect(body.data.distribution.description).toBe(DESCRIPTION);
  });
  it.each(["public/wake.md", "public/llms-full.txt"])("%s carries the rewritten lines and none of the old", (f) => {
    const section = readFileSync(join(process.cwd(), f), "utf8").match(SECTION)?.[0] ?? "";
    for (const line of [HEAD_AND_PARA, CACHE_LINE, ATMOS_LINE]) expect(section).toContain(line);
    for (const old of ["you may already be reading it", "The wake is *also* distributed. Every", "- Cache-friendly: same endpoint", "The wake is atmospheric"])
      expect(section).not.toContain(old);
  });
});
