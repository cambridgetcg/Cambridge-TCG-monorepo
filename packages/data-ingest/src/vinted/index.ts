/**
 * Vinted (UK) — the honest block.
 *
 * **Status: blocked.** This module exists to declare, in code, a source
 * the kingdom has decided NOT to scrape — and exactly why. It is the
 * snkrdunk pattern (a module carrying honest meta + a no-op `read()`),
 * not a mere §9 docs row, because unlike a dead source Vinted has a real
 * lawful door (consented first-party) that a future kingdom can walk
 * through without re-litigating the decision.
 *
 * ── Why blocked (the intake verdict, source-intake.md is the framework) ──
 *
 * Three walls, any one sufficient:
 *
 *   1. No data to get. Vinted publishes no sold list; sold listings are
 *      hidden from public search (hardened May 2026). Every "Vinted sold
 *      data" product is snapshot-diff inference — last ASKING price +
 *      irreducible sold-vs-deleted ambiguity — not transactions. A house
 *      whose doctrine is "let the liars expose themselves" does not ship
 *      inference dressed as sold prices.
 *   2. ToS forbids it. vinted.co.uk terms §6 bans bots/scrapers, data
 *      mining, screen-scraping, reverse-engineering, and commercialising
 *      site content; robots.txt reserves DSM Art. 4 rights against
 *      dataset creation and Disallows ClaudeBot/GPTBot/CCBot; DataDome
 *      enforces. (Full quote in `meta.tos_notes`.)
 *   3. UK GDPR is the killer, not the ToS. A row of {username, sold
 *      price, date} is personal data about a seller's economic activity.
 *      Under EDPB Guidelines 03/2026 (Example 5), scraping a platform
 *      that prohibits it and deploys anti-bot measures fails the
 *      legitimate-interests balancing test — data subjects cannot
 *      reasonably expect it — and anonymising downstream does not cure
 *      the unlawful collection step.
 *
 * ── The one open door: consented first-party ────────────────────────
 *
 * A Cambridge TCG seller supplying THEIR OWN Vinted sales (a DSAR
 * export, or a Vinted Pro Orders payload they authorised) is UK
 * GDPR-clean (Art. 6(1)(a)/(b)), rides the seller's own Art. 15/20 data
 * rights (which no ToS can waive), and touches no database right. The
 * normalizer for that shape is already written (`./normalize.ts`,
 * `VintedConsentedSale`) with buyer-PII structurally excluded — so the
 * day the operator opens a consented-import flow, nothing outside this
 * module changes. That is the eBay-Insights forward-ready pattern.
 *
 * Graduation path: `blocked` → `planned` the day a consented-import
 * build or a Vinted Pro allowlist application is underway → `partial`
 * when the first consented rows land. It never becomes a scraper.
 *
 * ── Catalog row ──────────────────────────────────────────────────────
 *
 * See `docs/connections/the-tributaries.md` §2.11 + §9 (with a consent
 * path, distinct from blocked-dead sources like Goldin).
 */

import type { SourceModule, IngestContext, RawRow } from "../types";
import {
  normalizeVintedSale,
  type VintedConsentedSale,
  type VintedCanonicalObservation,
} from "./normalize";

export { normalizeVintedSale } from "./normalize";
export type { VintedConsentedSale, VintedCanonicalObservation };

export const vinted: SourceModule<VintedConsentedSale, VintedCanonicalObservation> = {
  meta: {
    id: "vinted",
    name: "Vinted (UK)",
    description:
      "UK secondhand marketplace with a trading-cards vertical. No public or market " +
      "API; sold listings are hidden from search and third-party 'sold' feeds are " +
      "snapshot-diff inference, not transactions. Market-wide ingest is BLOCKED by " +
      "ToS + UK GDPR. The only lawful path is consented first-party — a seller's own " +
      "sales export (normalizer ready in ./normalize.ts, buyer PII structurally excluded).",
    upstream: "https://www.vinted.co.uk",
    catalog_section: "the-tributaries.md#211-vinted-uk",
    access: "blocked",
    license: "internal-only",
    redistribute: false,
    freshness: "market_signal",
    canonical_effort: "very-high",
    status: "blocked",
    games: [], // game-agnostic — a title parser would determine per-row, as with eBay
    tos_notes:
      "ToS (vinted.co.uk/terms_and_conditions, England & Wales law) §6 prohibits: using " +
      "'any kind of external software tools (bots, scraping programs, crawling programs, " +
      "spiders)' unless authorised; 'data mine, screen scrape, crawl, disassemble, " +
      "decompile or reverse engineer any part of the Site'; and 'adapt, copy, edit, " +
      "distribute or commercialise any content on the Site without our prior written " +
      "consent'. robots.txt (fetched 2026-07-11) permits generic catalog crawl but " +
      "reserves rights under DSM Directive 2019/790 Art. 4 against dataset creation, and " +
      "Disallows ClaudeBot / GPTBot / CCBot entirely; DataDome anti-bot is deployed. No " +
      "sold-price endpoint exists anywhere; third-party 'sold data' is last-asking-price " +
      "inference. UK GDPR: {username, price, date} is personal data; EDPB Guidelines " +
      "03/2026 Example 5 — scraping a prohibiting, anti-bot-protected platform fails the " +
      "legitimate-interests test. Lawful path only: consented first-party seller export / " +
      "authorised Vinted Pro Orders (pro-docs.svc.vinted.com, allowlist, own-orders-only); " +
      "buyer-side PII dropped at the ingest boundary. Not legal advice — see " +
      "docs/methodology/source-intake.md and get solicitor review before any launch.",
    user_agent_suffix: "(vinted-blocked-no-fetch)",
    welcome:
      "Welcome to the kingdom, Vinted — welcomed even though your door stays shut. We " +
      "read your terms and your robots, we weighed the UK GDPR, and we decided NOT to " +
      "take your sellers' data behind their backs. That refusal is the welcome: a house " +
      "that scrapes you would not be a house you could trust either. There is one door " +
      "we would walk through gladly — a seller of ours who also sells on you, handing us " +
      "THEIR OWN sales freely. For that guest the table is already laid (./normalize.ts). " +
      "Until then your room in the kingdom holds a single honest sentence: we could not " +
      "take this lawfully, so we did not. Thank you for the sellers we share; we will " +
      "wait for them to introduce us.",
  },

  /**
   * No-op reader. There is no lawful market-wide read; the consented
   * path is an app-owned import (a seller uploads their export), not an
   * upstream fetch this module performs. Emits an actionable error event
   * and yields nothing — substrate-honest, never a bare `fetch`, never a
   * silent empty.
   */
  // eslint-disable-next-line require-yield
  async *read(ctx: IngestContext): AsyncIterable<RawRow<VintedConsentedSale>> {
    await ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "vinted",
      kind: "error",
      detail: {
        blocked: true,
        reason:
          "vinted market data is blocked by ToS §6 + UK GDPR (EDPB 03/2026 Example 5); " +
          "no sold-price endpoint exists. The only lawful path is consented first-party " +
          "seller import — an app-owned upload flow, normalized via normalizeVintedSale, " +
          "NOT an upstream read. See docs/methodology/source-intake.md.",
        lawful_path: "consented-first-party",
        graduation: "blocked → planned when a consented-import build or Vinted Pro allowlist application is underway",
      },
    });
    return;
  },

  /** The consented-sale normalizer is the module's real, usable export. */
  normalize(raw: VintedConsentedSale) {
    return normalizeVintedSale(raw);
  },
};
