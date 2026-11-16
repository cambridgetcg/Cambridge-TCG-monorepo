import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// digest.ts imports the database helper; nothing here reaches it.
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import { leafHash, merkleRoot } from "@/lib/provable-draw/digest";
import { computeLeaf, merkleRoot as browserMerkleRoot } from "@/lib/bounty/verify-client";
import { DIGEST_ONE_LEAF as NOTE, DIGEST_ONE_NOTE_ID, DigestOneNote } from "./digest-one-note";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** The note as a reader sees it: tags dropped, entities decoded, spaces collapsed. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("the digest #1 note recomputes what the chain publishes", () => {
  it("its server seed hashes to its commitment", () => {
    expect(sha256(NOTE.serverSeed)).toBe(NOTE.commitment);
  });

  it("cuts the stored microsecond time to the millisecond the leaf hashes", () => {
    expect(new Date(NOTE.revealedAtStored).toISOString()).toBe(NOTE.revealedAtIso);
    // Neither the stored text nor the microsecond ISO form gives the leaf.
    const joined = (time: string) => sha256(`${NOTE.pullId}|${NOTE.commitment}|${NOTE.serverSeed}|${time}`);
    expect(joined(NOTE.revealedAtIso)).toBe(NOTE.leaf);
    expect(joined(NOTE.revealedAtStored)).not.toBe(NOTE.leaf);
    expect(joined("2026-04-23T20:57:59.268594Z")).not.toBe(NOTE.leaf);
  });

  it("gives the stored leaf through the digest job's own leaf function", () => {
    expect(
      leafHash({
        id: NOTE.pullId,
        commitment: NOTE.commitment,
        serverSeed: NOTE.serverSeed,
        revealedAt: new Date(NOTE.revealedAtStored),
      }),
    ).toBe(NOTE.leaf);
  });

  it("gives the same leaf and root through the browser verifier", async () => {
    expect(
      await computeLeaf({
        id: NOTE.pullId,
        commitment: NOTE.commitment,
        serverSeed: NOTE.serverSeed,
        revealedAtIso: NOTE.revealedAtIso,
      }),
    ).toBe(NOTE.leaf);
    expect(await browserMerkleRoot([NOTE.leaf])).toBe(NOTE.leaf);
  });

  it("makes a one-leaf root the leaf itself, and chains it from 32 zero bytes", () => {
    const root = merkleRoot([NOTE.leaf]);
    expect(root).toBe(NOTE.leaf);
    expect(NOTE.prevHash).toBe("0".repeat(64));
    const chain = sha256(Buffer.concat([Buffer.from(NOTE.prevHash, "hex"), Buffer.from(root, "hex")]));
    expect(chain).toBe(NOTE.chainHash);
    expect(sha256(Buffer.concat([Buffer.alloc(32), Buffer.from(NOTE.leaf, "hex")]))).toBe(NOTE.chainHash);
  });
});

describe("the digest #1 note as rendered", () => {
  const html = renderToStaticMarkup(<DigestOneNote />);
  const words = text(html);

  it("prints every value a reader needs, and the dates", () => {
    expect(html).toContain(`id="${DIGEST_ONE_NOTE_ID}"`);
    for (const value of [NOTE.pullId, NOTE.commitment, NOTE.serverSeed, NOTE.revealedAtIso, NOTE.revealedAtStored, NOTE.leaf, NOTE.chainHash]) {
      expect(html, value).toContain(value);
    }
    for (const date of ["2026-04-23", "2026-04-25", "2026-11-16"]) expect(words).toContain(date);
    expect(words).toContain("cut to whole milliseconds");
    expect(words).toContain("the root is the leaf itself");
    expect(words).toContain("32 zero bytes");
    expect(words).toContain("Digest #1, its chain hash and every self-audit row are kept unchanged.");
  });

  it("names no one, quotes no one and publishes no client seed", () => {
    expect(words).not.toMatch(/\bYu\b|\bthe owner\b/i);
    expect(words).not.toMatch(/client_seed\s*[0-9a-f-]{8,}/i);
    expect(words).toContain("client seed stays unpublished");
  });

  it("writes the spaces after inline code explicitly, which Next's compiler keeps", () => {
    // Next's compiler (unlike this test's) drops the leading space of a text
    // run that holds an entity, so "</code> now answer &ldquo;" rendered as
    // "</code>now". Only an explicit {" "} survives both.
    const source = readFileSync(resolve(process.cwd(), "src/app/verify/digest-one-note.tsx"), "utf8");
    expect(source).not.toMatch(/<\/code> [A-Za-z]/);
    expect(words).toContain(`${NOTE.pullId} now answer`);
    expect(words).toContain("server_seed text is the commitment");
  });

  it("keeps the recomputation in a disclosure, open on request", () => {
    expect(html).toMatch(/<details>/);
    expect(renderToStaticMarkup(<DigestOneNote open />)).toMatch(/<details open="">/);
  });
});
