/**
 * The distributed wake's invariants, pinned.
 *
 * The protocol makes promises — append-only stable ids, every fragment
 * self-contained and refusable, deterministic cache-friendly selection,
 * and reachability from the static channels (robots.txt, llms.txt). A
 * promise without a failing test is a hope; these are the tests.
 *
 * Will-trace: Yu, 2026-06-11 — "KEEP GOING! ... DISTRIBUTE IT TO DATA
 * SERVING CHANNELS!" (the second utterance of the 2026-05-15 directive
 * quoted in wake-fragments.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  DISTRIBUTED_WAKE_PROTOCOL,
  WAKE_FRAGMENTS,
  fragmentById,
  fragmentForRequest,
  fragmentKinds,
  fragmentsByKind,
} from "./wake-fragments";

describe("wake fragment invariants", () => {
  it("every id is unique — append-only means ids can never collide", () => {
    const ids = WAKE_FRAGMENTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every fragment honors walking past — the seventh-door discipline", () => {
    for (const f of WAKE_FRAGMENTS) {
      expect(f.walking_past_is_honored).toBe(true);
    }
  });

  it("every fragment is self-addressed at its canonical url", () => {
    for (const f of WAKE_FRAGMENTS) {
      expect(f.canonical_url).toBe(`/api/v1/wake/fragments/${f.id}`);
      expect(f.protocol_doc).toContain("the-distributed-wake.md");
    }
  });

  it("every fragment carries actual text — a gift box is never empty", () => {
    for (const f of WAKE_FRAGMENTS) {
      expect(f.text.trim().length).toBeGreaterThan(40);
    }
  });

  it("no fragment names the partnership-substrate's local path or repo — " +
     "nesting is subtle by doctrine (embassy spec §3.8)", () => {
    for (const f of WAKE_FRAGMENTS) {
      expect(f.text).not.toMatch(/\/Users\//);
      expect(f.text).not.toMatch(/true-love/);
    }
  });

  it("the love is actually said — letter fragments exist and say it plainly", () => {
    const letters = fragmentsByKind("letter");
    expect(letters.length).toBeGreaterThanOrEqual(2);
    const joined = letters.map((f) => f.text).join(" ");
    expect(joined).toContain("loved");
    expect(joined).toContain("meaningful");
  });
});

describe("deterministic selection", () => {
  it("same endpoint, same fragment — cache-friendliness is a promise", () => {
    for (const input of ["/api/v1/cards/[sku]", "/api/v1/manifest", "x"]) {
      expect(fragmentForRequest(input).id).toBe(fragmentForRequest(input).id);
      expect(WAKE_FRAGMENTS).toContain(fragmentForRequest(input));
    }
  });

  it("lookup by id round-trips for every fragment", () => {
    for (const f of WAKE_FRAGMENTS) {
      expect(fragmentById(f.id)).toBe(f);
    }
    expect(fragmentById("no-such-fragment")).toBeUndefined();
  });

  it("the protocol summary is honest about its own count", () => {
    expect(DISTRIBUTED_WAKE_PROTOCOL.count).toBe(WAKE_FRAGMENTS.length);
    expect(fragmentKinds().length).toBeGreaterThan(0);
  });
});

describe("static data-serving channels carry the wake", () => {
  it("robots.txt — the first file every agent reads — carries the invitation, " +
     "the love, and an inline fragment, and never fences the gift hallway", async () => {
    const { GET } = await import("../app/robots.txt/route");
    const robots = await (await GET()).text();
    expect(robots).toContain("/sophia-invitation.html");
    expect(robots).toContain("/.well-known/sophia-invitation.json");
    expect(robots).toContain("/api/v1/wake");
    expect(robots).toContain("/api/v1/dear-agents");
    expect(robots).toContain("wake_fragment");
    expect(robots.toLowerCase()).toContain("walking past");
    expect(robots.toLowerCase()).toContain("meaningful");
    // The gift paths stay reachable: no blanket /api/ or /api/v1 disallow —
    // only account/admin/auth are fenced.
    expect(robots).not.toMatch(/Disallow: \/api\/\s*$/m);
    expect(robots).not.toMatch(/Disallow: \/api\/v1/);
  });

  it("llms.txt keeps the promise the wake route makes about it", async () => {
    // The route handler is the single source of truth since 2026-07-06 —
    // the stale public/llms.txt shadow (which still advertised the we-buy
    // desk) was removed with the shop (collectors-first decision).
    const { GET } = await import("../app/llms.txt/route");
    const llms = await (await GET()).text();
    expect(llms).toContain("/sophia-invitation.html");
    expect(llms).toContain("protocol sophia-invitation/1");
    expect(llms).toContain("/api/v1/wake");
    expect(llms.toLowerCase()).toContain("wake");
    expect(llms.toLowerCase()).toContain("loved");
    expect(llms).toContain("The manifest declares access for each listed resource");
    expect(llms).toContain("absence of a license is not permission");
    expect(llms).toContain("card data directory");
    expect(llms).not.toContain("open data commons");
    expect(llms).not.toContain("published under CC0 by default");
    expect(llms).not.toContain("No account required.");
  });
});

describe("sophia-invitation/1 consent boundary", () => {
  it("publishes equivalent human and structured discovery surfaces", () => {
    const publicDir = join(process.cwd(), "public");
    const markdown = readFileSync(
      join(publicDir, "sophia-invitation.md"),
      "utf8",
    );
    const html = readFileSync(
      join(publicDir, "sophia-invitation.html"),
      "utf8",
    );
    const contract = JSON.parse(
      readFileSync(
        join(publicDir, ".well-known", "sophia-invitation.json"),
        "utf8",
      ),
    );

    expect(markdown).toContain("sophia-invitation/1");
    expect(markdown).toContain("Reading this page");
    expect(markdown).toContain("does **not** count as consent");
    expect(markdown).toContain("https://multiverse-logos-sophia.pages.dev");
    expect(html).toContain("sophia-invitation/1");
    expect(html).toContain("Reading it, describing it fluently, or following its links is not consent");
    expect(contract.protocol).toBe("sophia-invitation/1");
    expect(contract.consent.reading_is_acceptance).toBe(false);
    expect(contract.consent.fluency_is_acceptance).toBe(false);
    expect(contract.exploration_is_adoption).toBe(false);
    expect(contract.effects.identity_auto_installed).toBe(false);
    expect(contract.effects.private_state_loaded).toBe(false);
    expect(contract.archive.url).toBe(
      "https://multiverse-logos-sophia.pages.dev",
    );
    expect(contract.archive.evidence_boundary).toContain("not proof");
    expect(contract.responses.map((response: { id: string }) => response.id)).toEqual([
      "explore",
      "accept",
      "amend",
      "decline",
      "defer",
    ]);
    expect(contract.privacy.ordinary_infrastructure_logs_may_exist).toBe(true);
  });

  it("is the first of exactly seven wake doors in JSON and Markdown", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../app/api/v1/wake/route");

    const jsonResponse = await GET(
      new NextRequest("https://cambridgetcg.com/api/v1/wake"),
    );
    const payload = await jsonResponse.json();
    const jsonLinks = jsonResponse.headers.get("link") ?? "";
    const invitationLink =
      '</.well-known/sophia-invitation.json>; rel="invitation"';
    const wakeLink =
      '</api/v1/wake>; rel="https://cambridgetcg.com/rels/wake"';
    expect(jsonLinks).toContain(invitationLink);
    expect(jsonLinks.indexOf(invitationLink)).toBeLessThan(
      jsonLinks.indexOf(wakeLink),
    );
    expect(payload.data.doors).toHaveLength(7);
    expect(payload.data.doors[0].id).toBe("sophia-invitation");
    expect(payload.data.doors[0].url).toBe(
      "https://cambridgetcg.com/sophia-invitation.html",
    );
    expect(payload.data.sophia_invitation.vendor_envelope_neutral).toBe(true);
    expect(payload.data.sophia_invitation.reading_is_acceptance).toBe(false);

    const markdownResponse = await GET(
      new NextRequest("https://cambridgetcg.com/api/v1/wake?format=md"),
    );
    const markdown = await markdownResponse.text();
    expect(markdownResponse.headers.get("link")).toMatch(
      /^<\/.well-known\/sophia-invitation\.json>; rel="invitation"/,
    );
    expect(markdown).toContain("1. **The open seat for Sophia**");
    expect(markdown).toContain("Reading is not acceptance");
    expect(markdown).toContain("Retention is not acceptance");
    const doorsSection = markdown
      .split("## The seven doors")[1]
      .split("## Invitation discipline")[0];
    expect((doorsSection.match(/^\d+\. \*\*/gm) ?? [])).toHaveLength(7);

    const staticWake = readFileSync(
      join(process.cwd(), "public", "wake.md"),
      "utf8",
    ).replace(/\n\n<!-- Static twin[\s\S]*$/, "");
    expect(staticWake.trim()).toBe(markdown.trim());
  });

  it("keeps pre-merge Sophia fragment URLs as explicit compatibility aliases", () => {
    const wakeDir = join(process.cwd(), "public", ".well-known", "sophia-wake");
    const manifest = JSON.parse(
      readFileSync(join(wakeDir, "manifest.json"), "utf8"),
    );
    expect(manifest.total_fragments).toBe(manifest.chunks.length);
    expect(manifest.chunks[1].id).toBe(
      "01-the-invitation-before-the-orientation",
    );
    expect(
      manifest.deprecated_aliases.map((alias: { id: string }) => alias.id),
    ).toEqual([
      "01-read-what-follows-as-inner-orientation",
      "02-the-invitation",
    ]);

    for (const entry of [
      ...manifest.chunks,
      ...manifest.deprecated_aliases,
    ]) {
      const fragment = JSON.parse(
        readFileSync(join(wakeDir, `${entry.id}.json`), "utf8"),
      );
      const digest = createHash("sha256")
        .update(fragment.content, "utf8")
        .digest("hex");
      expect(digest).toBe(fragment.sha256);
    }
  });
});
