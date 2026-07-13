/**
 * Tests for the bandai-en source — fixture-based, no network.
 *
 * "modal-page" (op) fixture: a trimmed verbatim sample of
 * https://en.onepiece-cardgame.com/cardlist/?series=569101 (OP-01,
 * fetched 2026-07-11): leader OP01-001 + its _p1 parallel, character
 * OP01-006 (Notes/errata row), event OP01-026 (Trigger + Notes).
 *
 * "list-detail" (dbf) fixtures: trimmed verbatim samples of
 * https://www.dbs-cardgame.com/fw/en/cardlist/ (FB10, fetched
 * 2026-07-13): the thumbnail-grid series page plus three detail pages
 * — double-faced leader FB10-001, its _p1 parallel, battle FB10-002.
 *
 * Coverage:
 *   1. parseCardlistPage — block extraction, field fidelity, parallels,
 *      image URL resolution, Notes/remarks exclusion
 *   2. parseCardRefs / parseDetailPage / parseSeriesAnchors — the dbf
 *      DOM family: grid refs, detail fields, leader faces, Q&A exclusion
 *   3. normalizeBandaiEn — SKU shape, policy quartet in extra,
 *      oracle_text = rules only (op: Effect + Trigger; dbf: both leader
 *      faces), quarantine paths
 *   4. read() — generator over an injected fetch; honest User-Agent;
 *      dbf list→detail flow with max_cards; stubbed games yield nothing
 *      and emit an actionable error
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseCardlistPage,
  parseCardRefs,
  parseDetailPage,
  parseSeriesAnchors,
  parseSeriesOptions,
} from "../bandai-en/parse";
import { normalizeBandaiEn } from "../bandai-en/normalize";
import { bandaiEn, BANDAI_EN_USER_AGENT, type BandaiEnContext } from "../bandai-en/index";
import type { BandaiEnCard } from "../bandai-en/types";
import type { IngestEvent } from "../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, "fixtures", "bandai-en-op01-sample.html"), "utf8");

function dbfFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", `bandai-en-dbf-${name}.html`), "utf8");
}
const DBF_LIST = dbfFixture("fb10-list");
const DBF_LEADER = dbfFixture("fb10-001-detail");
const DBF_LEADER_P1 = dbfFixture("fb10-001-p1-detail");
const DBF_BATTLE = dbfFixture("fb10-002-detail");

const DBF_LIST_URL =
  "https://www.dbs-cardgame.com/fw/en/cardlist/?search=true&category%5B%5D=583010";
const DBF_LEADER_URL =
  "https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=FB10-001";
const DBF_RETRIEVED_AT = "2026-07-13T00:00:00.000Z";
const DBF_ATTRIBUTION =
  "©BIRD STUDIO/SHUEISHA ©BIRD STUDIO/SHUEISHA, TOEI ANIMATION ©Bandai Namco Entertainment Inc.";

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

  it("stubbed games (dmw/una/bsr) yield nothing and emit an actionable error", async () => {
    const events: IngestEvent[] = [];
    const ctx: BandaiEnContext = {
      fetch: async () => {
        throw new Error("stub must not fetch");
      },
      on_event: (e) => {
        events.push(e);
      },
      bandai_en: { game: "dmw" },
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

// ═════════════════════════════════════════════════════════════════════
// "list-detail" DOM family — DBS Fusion World (dbf), verified 2026-07-13
// ═════════════════════════════════════════════════════════════════════

describe("parseCardRefs (dbf series page)", () => {
  it("extracts every cardItem ref, parallels via the p query value", () => {
    const refs = parseCardRefs(DBF_LIST);
    expect(refs.map((r) => [r.card_no, r.p])).toEqual([
      ["FB10-001", null],
      ["FB10-001", "_p1"],
      ["FB10-002", null],
      ["FB10-006", null],
      ["FB10-006", "_p1"],
    ]);
  });

  it("carries the lazy thumbnail data-src and alt text", () => {
    const [leader, leaderP1, battle] = parseCardRefs(DBF_LIST);
    // Leaders carry the _f front suffix; single-faced cards don't.
    expect(leader.image_src).toBe("../../images/cards/card/en/FB10-001_f.webp");
    expect(leaderP1.image_src).toBe("../../images/cards/card/en/FB10-001_f_p1.webp");
    expect(battle.image_src).toBe("../../images/cards/card/en/FB10-002.webp");
    expect(leader.alt).toBe("FB10-001 Son Goku");
  });
});

describe("parseSeriesAnchors (dbf series discovery)", () => {
  it("reads ids + labels from the category dropdown only, skipping ALL", () => {
    // The fixture keeps the language-switcher UL (same data-val markup)
    // as a decoy — scoping via the category[] input must exclude it.
    expect(parseSeriesAnchors(DBF_LIST)).toEqual([
      { id: "583010", label: "BOOSTER PACK -CROSS FORCE- [FB10]" },
      { id: "583009", label: "BOOSTER PACK -DUAL EVOLUTION- [FB09]" },
      { id: "583001", label: "BOOSTER PACK -AWAKENED PULSE- [FB01]" },
      { id: "583901", label: "Promotion Card" },
    ]);
  });

  it("returns [] when no category input exists", () => {
    expect(parseSeriesAnchors("<html><body>nothing</body></html>")).toEqual([]);
  });
});

describe("parseDetailPage (dbf)", () => {
  const leader = parseDetailPage(DBF_LEADER, DBF_LEADER_URL, "dbf", DBF_RETRIEVED_AT, null);
  const leaderP1 = parseDetailPage(
    DBF_LEADER_P1,
    `${DBF_LEADER_URL}&p=_p1`,
    "dbf",
    DBF_RETRIEVED_AT,
    "_p1",
  );
  const battle = parseDetailPage(
    DBF_BATTLE,
    "https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=FB10-002",
    "dbf",
    DBF_RETRIEVED_AT,
    null,
  );

  it("reads number, rarity, category, name from the detail header", () => {
    expect(leader?.card_number).toBe("FB10-001");
    expect(leader?.rarity).toBe("L");
    expect(leader?.category).toBe("LEADER");
    expect(leader?.name).toBe("Son Goku"); // front h1, never the is-back one
    expect(battle?.card_number).toBe("FB10-002");
    expect(battle?.rarity).toBe("C");
    expect(battle?.category).toBe("BATTLE");
    expect(battle?.name).toBe("Upa");
  });

  it("resolves _f/_b leader images and single-face battle images", () => {
    expect(leader?.image_url).toBe(
      "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-001_f.webp",
    );
    expect(leader?.back_image_url).toBe(
      "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-001_b.webp",
    );
    expect(battle?.image_url).toBe(
      "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-002.webp",
    );
    expect(battle?.back_image_url).toBeNull();
  });

  it("keeps the parallel tail aligned with the publisher's image naming", () => {
    expect(leaderP1?.card_id).toBe("FB10-001_p1");
    expect(leaderP1?.card_number).toBe("FB10-001");
    expect(leaderP1?.parallel).toBe("p1");
    expect(leaderP1?.image_url).toBe(
      "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-001_f_p1.webp",
    );
    expect(leaderP1?.back_image_url).toBe(
      "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-001_b_p1.webp",
    );
    expect(leader?.card_id).toBe("FB10-001");
    expect(leader?.parallel).toBeNull();
  });

  it("reads the stat cells; '-' as null; leader faces split", () => {
    expect(leader?.cost).toBeNull(); // leaders print "-"
    expect(leader?.cost_kind).toBeNull();
    expect(leader?.specified_cost).toBeNull();
    expect(leader?.power).toBe("15000"); // front face
    expect(leader?.power_back).toBe("20000"); // back face
    expect(leader?.combo_power).toBeNull();
    expect(leader?.color).toBe("Red");
    expect(leader?.type_feature).toBe("Saiyan");
    expect(leader?.traits_back).toBe("Saiyan");

    expect(battle?.cost).toBe("2");
    expect(battle?.cost_kind).toBe("cost");
    expect(battle?.specified_cost).toBe("R");
    expect(battle?.power).toBe("5000");
    expect(battle?.combo_power).toBe("10000");
    expect(battle?.type_feature).toBe("Earthling"); // Bandai's "is-nomal" class
    expect(battle?.power_back).toBeNull();
    expect(battle?.traits_back).toBeNull();
    expect(battle?.effect_back_text).toBeNull();
  });

  it("captures Skills rules text per face, never the Q&A rulings block", () => {
    expect(leader?.effect_text).toContain("[When Attacking] Draw 1 card.");
    expect(leader?.effect_text).toContain("[Awaken]");
    expect(leader?.effect_back_text).toContain("[Activate Main][Once Per Turn]");
    expect(battle?.effect_text).toContain("[On Play] This card gets +1 [Ki].");
    expect(battle?.trigger_text).toBeNull(); // op-only concept
    // The leader fixture carries a cardQACol rulings block (Q576);
    // policy: rulings are not card text — no parsed field may leak it.
    for (const card of [leader, leaderP1, battle]) {
      for (const v of Object.values(card ?? {})) {
        if (typeof v === "string") {
          expect(v).not.toContain("Q576");
          expect(v).not.toContain("cardQA");
        }
      }
    }
  });

  it("reads the Where to get it row and stamps provenance", () => {
    for (const card of [leader, leaderP1, battle]) {
      expect(card?.card_sets_text).toBe("BOOSTER PACK -CROSS FORCE- [FB10]");
      expect(card?.game).toBe("dbf");
      expect(card?.retrieved_at).toBe(DBF_RETRIEVED_AT);
    }
    expect(leader?.source_url).toBe(DBF_LEADER_URL);
  });

  it("returns null for a page with no card block instead of an empty husk", () => {
    expect(parseDetailPage("<html><body>404</body></html>", DBF_LEADER_URL, "dbf", DBF_RETRIEVED_AT, null)).toBeNull();
  });
});

describe("normalizeBandaiEn (dbf)", () => {
  const leader = parseDetailPage(DBF_LEADER, DBF_LEADER_URL, "dbf", DBF_RETRIEVED_AT, null)!;
  const leaderP1 = parseDetailPage(
    DBF_LEADER_P1,
    `${DBF_LEADER_URL}&p=_p1`,
    "dbf",
    DBF_RETRIEVED_AT,
    "_p1",
  )!;
  const battle = parseDetailPage(
    DBF_BATTLE,
    "https://www.dbs-cardgame.com/fw/en/cardlist/detail.php?card_no=FB10-002",
    "dbf",
    DBF_RETRIEVED_AT,
    null,
  )!;

  it("builds the canonical SKU (dbf-fb10-001-en; parallel gets the -p1 tail)", () => {
    const r1 = normalizeBandaiEn(leader);
    const r2 = normalizeBandaiEn(leaderP1);
    expect(r1.ok && r1.record.sku).toBe("dbf-fb10-001-en");
    expect(r2.ok && r2.record.sku).toBe("dbf-fb10-001-en-p1");
    if (!r1.ok || !r2.ok) throw new Error("expected ok");
    expect(r1.record.game).toBe("dbf");
    expect(r1.record.set).toBe("fb10");
    expect(r1.record.number).toBe("001");
    expect(r1.record.lang).toBe("en");
    expect(r2.record.variant).toBe("p1");
    expect(r1.record.upstream_id).toBe("FB10-001");
    expect(r2.record.upstream_id).toBe("FB10-001_p1");
  });

  it("carries the policy quartet with the site footer's verbatim attribution", () => {
    for (const raw of [leader, leaderP1, battle]) {
      const r = normalizeBandaiEn(raw);
      if (!r.ok) throw new Error(r.reason);
      expect(r.record.extra?.source_url).toBe(raw.source_url);
      expect(r.record.extra?.image_kind).toBe("official_sample");
      expect(r.record.extra?.attribution).toBe(DBF_ATTRIBUTION);
      expect(r.record.extra?.retrieved_at).toBe(DBF_RETRIEVED_AT);
    }
  });

  it("oracle_text carries both leader faces under the DOM's own labels", () => {
    const r = normalizeBandaiEn(leader);
    if (!r.ok) throw new Error(r.reason);
    expect(r.record.oracle_text).toMatch(/^\[FRONT\]\n\[When Attacking\] Draw 1 card\./);
    expect(r.record.oracle_text).toContain("\n[BACK]\n[When Attacking] Draw 1 card.");
    // Single-faced cards keep the plain op shape — no face labels.
    const rb = normalizeBandaiEn(battle);
    if (!rb.ok) throw new Error(rb.reason);
    expect(rb.record.oracle_text).toMatch(/^\[On Play\]/);
    expect(rb.record.oracle_text).not.toContain("[FRONT]");
  });

  it("carries the list-detail facts in extra, absent on modal-page games", () => {
    const r = normalizeBandaiEn(battle);
    if (!r.ok) throw new Error(r.reason);
    expect(r.record.extra?.specified_cost).toBe("R");
    expect(r.record.extra?.combo_power).toBe("10000");
    const rl = normalizeBandaiEn(leader);
    if (!rl.ok) throw new Error(rl.reason);
    expect(rl.record.extra?.power_back).toBe("20000");
    expect(rl.record.extra?.back_image_url).toBe(
      "https://www.dbs-cardgame.com/fw/images/cards/card/en/FB10-001_b.webp",
    );
    // op records never grow these keys.
    const op = normalizeBandaiEn(parseCardlistPage(FIXTURE, PAGE_URL, "op", RETRIEVED_AT)[0]);
    if (!op.ok) throw new Error(op.reason);
    expect("specified_cost" in (op.record.extra ?? {})).toBe(false);
    expect("power_back" in (op.record.extra ?? {})).toBe(false);
  });
});

describe("bandaiEn.read (dbf list→detail flow)", () => {
  const detailByUrl: Record<string, string> = {
    "detail.php?card_no=FB10-001": DBF_LEADER,
    "detail.php?card_no=FB10-001&p=_p1": DBF_LEADER_P1,
    "detail.php?card_no=FB10-002": DBF_BATTLE,
    // FB10-006 (+_p1) reuse the battle fixture — shape is what matters.
    "detail.php?card_no=FB10-006": DBF_BATTLE,
    "detail.php?card_no=FB10-006&p=_p1": DBF_BATTLE,
  };

  function mockDbfFetch(fetched: string[]): typeof fetch {
    return async (url, init) => {
      const u = String(url);
      fetched.push(u);
      const ua = new Headers(init?.headers).get("User-Agent");
      if (ua !== BANDAI_EN_USER_AGENT) throw new Error(`wrong UA: ${ua}`);
      if (u.includes("detail.php")) {
        const key = decodeURIComponent(u.slice(u.indexOf("detail.php")));
        const body = detailByUrl[key];
        if (!body) return new Response("not found", { status: 404 });
        return new Response(body, { status: 200 });
      }
      return new Response(DBF_LIST, { status: 200 });
    };
  }

  it("fetches the series page, then one detail page per card, and yields parsed cards", async () => {
    const fetched: string[] = [];
    const ctx: BandaiEnContext = {
      fetch: mockDbfFetch(fetched),
      rate_limit: { rps: 1000, burst: 1000 },
      bandai_en: { game: "dbf", series: ["583010"] },
    };

    const rows = [];
    for await (const row of bandaiEn.read(ctx)) rows.push(row);

    expect(fetched[0]).toBe(DBF_LIST_URL);
    expect(fetched).toHaveLength(6); // 1 list + 5 details
    expect(rows.map((r) => r.raw.card_id)).toEqual([
      "FB10-001",
      "FB10-001_p1",
      "FB10-002",
      // FB10-006 (+_p1) served the FB10-002 fixture: the number comes
      // from the page, the parallel tail from the list ref's p value.
      "FB10-002",
      "FB10-002_p1",
    ]);
    expect(rows[0].provenance.source).toBe("bandai-en");
    expect(rows[0].provenance.retrieved_at).toBe(rows[0].provenance.as_of);
    expect(rows[1].raw.parallel).toBe("p1");
  });

  it("max_cards caps the detail fetches, not just the yields", async () => {
    const fetched: string[] = [];
    const ctx: BandaiEnContext = {
      fetch: mockDbfFetch(fetched),
      rate_limit: { rps: 1000, burst: 1000 },
      bandai_en: { game: "dbf", series: ["583010"], max_cards: 2 },
    };

    const rows = [];
    for await (const row of bandaiEn.read(ctx)) rows.push(row);

    expect(rows).toHaveLength(2);
    expect(fetched).toHaveLength(3); // 1 list + 2 details, never the other 3
  });

  it("discovers series from the category dropdown when none are given", async () => {
    const fetched: string[] = [];
    const ctx: BandaiEnContext = {
      fetch: mockDbfFetch(fetched),
      rate_limit: { rps: 1000, burst: 1000 },
      bandai_en: { game: "dbf", max_series: 1, max_cards: 1 },
    };

    const rows = [];
    for await (const row of bandaiEn.read(ctx)) rows.push(row);

    // discovery (empty category) → first discovered series → 1 detail
    expect(fetched[0]).toBe(
      "https://www.dbs-cardgame.com/fw/en/cardlist/?search=true&category%5B%5D=",
    );
    expect(fetched[1]).toBe(DBF_LIST_URL);
    expect(rows).toHaveLength(1);
  });
});

describe("reprint suffix (_r1) — EB01 Memorial Collection, live 2026-07-12", () => {
  it("parses EB01-009_r1 as card EB01-009 with variant r1", () => {
    const html = `<dl class="modalCol" id="EB01-009_r1"><dt><div class="infoCol"><span>EB01-009</span> | <span>SR</span> | <span>CHARACTER</span></div><div class="cardName">Nami</div></dt><dd><div class="frontCol"><img data-src="../images/cardlist/card/EB01-009_r1.png?250301" src="dummy.gif"></div></dd></dl>`;
    const cards = parseCardlistPage(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].card_number).toBe("EB01-009");
    expect(cards[0].parallel).toBe("r1");
    // image_url resolution needs the page base URL — covered by the
    // fixture-based tests above; this minimal block only guards the
    // _r-suffix split.
  });
});
