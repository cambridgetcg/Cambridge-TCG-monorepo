import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));

import ChainPage from "./page";
import { DIGEST_ONE_NOTE_ID } from "../digest-one-note";

/** One digest with one leaf, as the chain stands; the hashes are stand-ins. */
function oneDigest() {
  query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("COUNT(*)")
      ? [{ n: "1" }]
      : [{
          id: "1",
          root: "a".repeat(64),
          prev_hash: "0".repeat(64),
          chain_hash: "b".repeat(64),
          leaf_count: 1,
          window_from: "2026-04-23 20:57:59.268+00",
          window_to: "2026-04-23 20:57:59.268+00",
          created_at: "2026-04-25 17:10:06.707725+00",
        }],
  }));
}

const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("/verify/chain", () => {
  beforeEach(() => {
    query.mockReset();
    oneDigest();
  });

  it("carries the dated digest #1 note, open, between the tip and the digests", async () => {
    const html = renderToStaticMarkup(await ChainPage());
    expect(html).toContain(`id="${DIGEST_ONE_NOTE_ID}"`);
    expect(html).toMatch(/<details open="">/);
    const tip = html.indexOf("Current chain tip");
    const note = html.indexOf(`id="${DIGEST_ONE_NOTE_ID}"`);
    const table = html.indexOf("Recent digests");
    expect(tip).toBeLessThan(note);
    expect(note).toBeLessThan(table);
  });

  it("writes one leaf in the singular", async () => {
    const text = words(renderToStaticMarkup(await ChainPage()));
    expect(text).toContain("1 leaf ·");
    expect(text).not.toContain("1 leaves");
  });

  it("claims only what a matching chain hash shows", async () => {
    const text = words(renderToStaticMarkup(await ChainPage()));
    expect(text).toContain("no digest up to that one has been altered");
    expect(text).toContain("The chain does not show whether the records behind its leaves are still stored.");
    expect(text).not.toContain("no prior commitment has been altered");
  });
});
