/**
 * Tests for the bandai-en source — fixture-based, no network.
 *
 * The fixture is a trimmed verbatim sample of
 * https://en.onepiece-cardgame.com/cardlist/?series=569101 (OP-01,
 * fetched 2026-07-11): leader OP01-001 + its _p1 parallel, character
 * OP01-006 (Notes/errata row), event OP01-026 (Trigger + Notes).
 *
 * Coverage:
 *   1. parseCardlistPage — block extraction, field fidelity, parallels,
 *      image URL resolution, Notes/remarks exclusion
 *   2. normalizeBandaiEn — SKU shape, policy quartet in extra,
 *      oracle_text = Effect + Trigger (rules only), quarantine paths
 *   3. read() — generator over an injected fetch; honest User-Agent;
 *      stubbed games yield nothing and emit an actionable error
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCardlistPage, parseSeriesOptions } from "../bandai-en/parse";
import { normalizeBandaiEn } from "../bandai-en/normalize";
import { bandaiEn, BANDAI_EN_USER_AGENT, type BandaiEnContext } from "../bandai-en/index";
import type { BandaiEnCard } from "../bandai-en/types";
import type { IngestEvent } from "../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, "fixtures", "bandai-en-op01-sample.html"), "utf8");

const PAGE_URL = "https://en.onepiece-cardgame.com/cardlist/?series=569101";
const RETRIEVED_AT = "2026-07-11T00:00:00.000Z";

function parseFixture(): BandaiEnCard[] {
  return parseCardlistPage(FIXTURE, PAGE_URL, "op", RETRIEVED_AT);
}

// ── parseCardlistPage ────────────────────────────────────────────────

describe("parseCardlistPage", () => {
  it("extracts every card block, parallels as separate rows", () => {
    const cards = parseFixture();
    expect(cards.map((c) => c.card_id)).toEqual([
      "OP01-001",
      "OP01-001_p1",
      "OP01-006",
      "OP01-026",
    ]);
  });

  it("reads number | rarity | category from the info row", () => {
    const [leader, , character, event] = parseFixture();
    expect(leader.card_number).toBe("OP01-001");
    expect(leader.rarity).toBe("L");
    expect(leader.category).toBe("LEADER");
    expect(character.rarity).toBe("UC");
    expect(character.category).toBe("CHARACTER");
    expect(event.rarity).toBe("R");
    expect(event.category).toBe("EVENT");
  });

  it("splits the parallel suffix off the card number", () => {
    const [base, parallel] = parseFixture();
    expect(base.parallel).toBeNull();
    expect(parallel.card_number).toBe("OP01-001");
    expect(parallel.parallel).toBe("p1");
  });

  it("resolves the lazy-loaded image to an absolute URL (parallel gets _p1)", () => {
    const [base, parallel] = parseFixture();
    expect(base.image_url).toBe(
      "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?260701",
    );
    expect(parallel.image_url).toBe(
      "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001_p1.png?260701",
    );
  });

  it("distinguishes Life (leaders) from Cost and reads stat boxes, '-' as null", () => {
    const [leader, , character, event] = parseFixture();
    expect(leader.cost_kind).toBe("life");
    expect(leader.cost).toBe("5");
    expect(leader.power).toBe("5000");
    expect(leader.counter).toBeNull(); // DOM shows "-"
    expect(character.cost_kind).toBe("cost");
    expect(character.cost).toBe("1");
    expect(character.counter).toBe("2000");
    expect(event.power).toBeNull();
    expect(event.attribute).toBeNull(); // events have an empty <i></i>
  });

  it("captures effect and trigger rules text verbatim", () => {
    const [leader, , , event] = parseFixture();
    expect(leader.effect_text).toBe(
      "[DON!! x1] [Your Turn] All of your Characters gain +1000 power.",
    );
    expect(leader.trigger_text).toBeNull();
    expect(event.effect_text).toContain("[Counter] Up to 1 of your Leader or Character cards");
    expect(event.trigger_text).toBe(
      "[Trigger] Give up to 1 of your opponent's Leader or Character cards −10000 power during this turn.",
    );
  });

  it("captures the Card Set(s) row but never the Notes/errata remarks row", () => {
    const cards = parseFixture();
    for (const c of cards) {
      expect(c.card_sets_text).toBe("-ROMANCE DAWN- [OP01]");
    }
    // OP01-006 and OP01-026 carry <div class="getInfo remarks"> Errata
    // links in the fixture; policy (docs/EN-CARD-DATA.md §3) says non-
    // rules text is never captured. No parsed field may contain it.
    for (const c of cards) {
      for (const v of Object.values(c)) {
        if (typeof v === "string") expect(v).not.toContain("Errata");
      }
    }
  });

  it("stamps game, source_url and retrieved_at onto every row", () => {
    for (const c of parseFixture()) {
      expect(c.game).toBe("op");
      expect(c.source_url).toBe(PAGE_URL);
      expect(c.retrieved_at).toBe(RETRIEVED_AT);
    }
  });
});

// ── parseSeriesOptions ───────────────────────────────────────────────

describe("parseSeriesOptions", () => {
  const SELECT_HTML = `
    <select name="series" class="selectModal" id="series">
      <option value>Recording</option>
      <option value>ALL</option>
      <option value="569102" >BOOSTER PACK &lt;br class=&quot;spInline&quot;&gt;-PARAMOUNT WAR- [OP-02]</option>
      <option value="569101" >BOOSTER PACK &lt;br class=&quot;spInline&quot;&gt;-ROMANCE DAWN- [OP-01]</option>
    </select>
    <select name="amount"><option value="999">decoy</option></select>`;

  it("reads ids + labels from the series select only, skipping empty options", () => {
    const options = parseSeriesOptions(SELECT_HTML);
    expect(options).toEqual([
      { id: "569102", label: "BOOSTER PACK -PARAMOUNT WAR- [OP-02]" },
      { id: "569101", label: "BOOSTER PACK -ROMANCE DAWN- [OP-01]" },
    ]);
  });

  it("returns [] when no series select exists", () => {
    expect(parseSeriesOptions("<html><body>nothing</body></html>")).toEqual([]);
  });
});

// ── normalizeBandaiEn ────────────────────────────────────────────────

describe("normalizeBandaiEn", () => {
  it("builds the canonical SKU (op-op01-001-en; parallel gets the -p1 tail)", () => {
    const [base, parallel] = parseFixture();
    const r1 = normalizeBandaiEn(base);
    const r2 = normalizeBandaiEn(parallel);
    expect(r1.ok && r1.record.sku).toBe("op-op01-001-en");
    expect(r2.ok && r2.record.sku).toBe("op-op01-001-en-p1");
    if (!r1.ok || !r2.ok) throw new Error("expected ok");
    expect(r1.record.game).toBe("op");
    expect(r1.record.set).toBe("op01");
    expect(r1.record.number).toBe("001");
    expect(r1.record.lang).toBe("en");
    expect(r1.record.variant).toBeUndefined();
    expect(r2.record.variant).toBe("p1");
    expect(r1.record.name).toBe("Roronoa Zoro");
    expect(r1.record.type).toBe("LEADER");
    expect(r1.record.rarity).toBe("L");
    expect(r1.record.upstream_id).toBe("OP01-001");
    expect(r2.record.upstream_id).toBe("OP01-001_p1");
  });

  it("carries the policy quartet in extra on every record (EN-CARD-DATA.md)", () => {
    for (const raw of parseFixture()) {
      const r = normalizeBandaiEn(raw);
      if (!r.ok) throw new Error(r.reason);
      expect(r.record.extra?.source_url).toBe(PAGE_URL);
      expect(r.record.extra?.image_kind).toBe("official_sample");
      expect(r.record.extra?.attribution).toBe(
        "©Eiichiro Oda/Shueisha, Toei Animation ©BANDAI CO., LTD.",
      );
      expect(r.record.extra?.retrieved_at).toBe(RETRIEVED_AT);
    }
  });

  it("oracle_text is rules text only: Effect, plus Trigger when present", () => {
    const [leader, , , event] = parseFixture();
    const rLeader = normalizeBandaiEn(leader);
    const rEvent = normalizeBandaiEn(event);
    if (!rLeader.ok || !rEvent.ok) throw new Error("expected ok");
    expect(rLeader.record.oracle_text).toBe(
      "[DON!! x1] [Your Turn] All of your Characters gain +1000 power.",
    );
    expect(rEvent.record.oracle_text).toContain("[Counter]");
    expect(rEvent.record.oracle_text).toContain("\n[Trigger]");
    // Never the Notes/errata row, never flavor (absent from this DOM).
    expect(rEvent.record.oracle_text).not.toContain("Errata");
    expect(rEvent.record.extra?.has_trigger).toBe(true);
    expect(rLeader.record.extra?.has_trigger).toBe(false);
  });

  it("quarantines unparseable card numbers instead of throwing", () => {
    const [base] = parseFixture();
    const r = normalizeBandaiEn({ ...base, card_number: "NOTANUMBER" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("unparseable card number");
  });

  it("quarantines rows missing a name", () => {
    const [base] = parseFixture();
    const r = normalizeBandaiEn({ ...base, name: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("missing card name");
  });
});

// ── read() ───────────────────────────────────────────────────────────

describe("bandaiEn.read", () => {
  it("yields one RawRow per block with provenance, using the honest User-Agent", async () => {
    const seenUserAgents: (string | null)[] = [];
    const mockFetch: typeof fetch = async (_url, init) => {
      seenUserAgents.push(new Headers(init?.headers).get("User-Agent"));
      return new Response(FIXTURE, { status: 200 });
    };

    const ctx: BandaiEnContext = {
      fetch: mockFetch,
      rate_limit: { rps: 1000, burst: 1000 }, // don't wait in tests
      bandai_en: { game: "op", series: ["569101"] },
    };

    const rows = [];
    for await (const row of bandaiEn.read(ctx)) rows.push(row);

    expect(rows).toHaveLength(4);
    expect(rows[0].provenance.source).toBe("bandai-en");
    expect(rows[0].provenance.retrieved_at).toBe(rows[0].provenance.as_of);
    expect(rows[0].raw.card_id).toBe("OP01-001");
    expect(seenUserAgents).toEqual([BANDAI_EN_USER_AGENT]);
  });

  it("stubbed games (dbf/dmw/una/bsr) yield nothing and emit an actionable error", async () => {
    const events: IngestEvent[] = [];
    const ctx: BandaiEnContext = {
      fetch: async () => {
        throw new Error("stub must not fetch");
      },
      on_event: (e) => {
        events.push(e);
      },
      bandai_en: { game: "dbf" },
    };

    const rows = [];
    for await (const row of bandaiEn.read(ctx)) rows.push(row);

    expect(rows).toHaveLength(0);
    const error = events.find((e) => e.kind === "error");
    expect(error).toBeTruthy();
    expect(String(error?.detail.reason)).toContain("stub");
    expect(String(error?.detail.action)).toContain("config.ts");
  });

  it("declares the polite rate limit and non-redistributable license in meta", () => {
    expect(bandaiEn.meta.rate_limit).toEqual({ rps: 0.5, burst: 1 });
    expect(bandaiEn.meta.redistribute).toBe(false);
    expect(bandaiEn.meta.status).toBe("partial");
    expect(bandaiEn.meta.games).toEqual(["op", "dbf", "dmw", "una", "bsr"]);
  });
});
