/**
 * Cardmarket — European marketplace integration, currently blocked.
 *
 * The OAuth1 signer (`./oauth1.ts`), entity types (`./types.ts`), and
 * normalizer (`./normalize.ts`) remain as dormant integration code. The
 * current Cardmarket help page says new API applications are not being
 * accepted, while existing dedicated credentials are account-specific and
 * must not be shared with third-party software. API v2 remains live at
 * `apiv2.cardmarket.com`; a live interface is not present permission for this
 * application to call or redistribute it.
 *
 * `read()` therefore never fetches, even when CARDMARKET_* variables exist.
 * A future change must begin with written Cardmarket approval, record the
 * exact allowed endpoints and data/image terms in `meta.rights`, and receive
 * a fresh review before this block is lifted.
 *
 * See `docs/connections/the-tributaries.md` §2.2.
 */

import type { SourceModule, IngestContext, RawRow } from "../types";
import type { CanonicalPrice } from "../canonical";
import type { CardmarketCreds } from "./oauth1";
import { normalizeCardmarket, type CardmarketRaw } from "./normalize";

/** Cardmarket-specific config retained for a future, approved integration. */
export interface CardmarketContext extends IngestContext {
  cardmarket?: {
    /** Dedicated-app credentials. Credentials alone do not unlock read(). */
    creds?: CardmarketCreds;
    /** Operator-curated product ids for a future approved watch-list. */
    productIds?: number[];
    /** Approved API base, once supplied and reviewed by Cardmarket. */
    base_url?: string;
  };
}

export const cardmarket: SourceModule<CardmarketRaw, CanonicalPrice> = {
  meta: {
    id: "cardmarket",
    name: "Cardmarket",
    description:
      "European marketplace integration code held dormant. Current API access is manually approved and closed to new applications; this module performs no fetch without a reviewed Cardmarket agreement.",
    upstream: "https://help.cardmarket.com/en/cardmarket-api",
    catalog_section: "the-tributaries.md#22-cardmarket-eu-market-leader",
    access: "blocked",
    license: "internal-only",
    redistribute: false,
    rights: {
      code: {
        license: "proprietary",
        notes:
          "Cardmarket's API and documentation are provider-owned. Cambridge TCG's dormant OAuth signer is local code; it grants no rights in Cardmarket data.",
      },
      data: {
        terms: "approved-account API terms; exact rights depend on written Cardmarket approval",
        notes:
          "Cardmarket says it is not accepting new API applications and existing users must protect dedicated credentials. Its current v2 documentation confirms a live interface, but does not establish approval or reuse rights for this application.",
      },
      images: {
        terms: "provider and publisher rights; no image reuse permission reviewed",
        notes:
          "No reviewed Cardmarket agreement grants this integration rights to copy or redistribute product or card images.",
      },
      redistribution: {
        verdict: "contract-required",
        notes:
          "Any display, derived use, or export must follow the exact written app approval. No agreement is recorded here, so raw redistribution is disabled.",
      },
      safe_default: "no-fetch",
      reviewed_at: "2026-07-11",
      evidence_urls: [
        "https://help.cardmarket.com/en/cardmarket-api",
        "https://api.cardmarket.com/ws/documentation",
        "https://api.cardmarket.com/ws/documentation/API:Auth_Overview",
        "https://api.cardmarket.com/ws/documentation/API_2.0:Main_Page",
      ],
      notes:
        "Do not revive a historical base URL merely because credentials exist. Record current approval, allowed endpoints, storage, display, deletion, image, and redistribution terms before changing safe_default or read().",
    },
    freshness: "price_current",
    canonical_effort: "medium",
    status: "blocked",
    games: ["mtg", "pkm", "ygo", "op", "lgr", "fab", "dmw"],
    tos_notes:
      "Current help page: https://help.cardmarket.com/en/cardmarket-api — Cardmarket is not accepting new API applications; existing users must not share dedicated credentials with third-party software. API v2 remains live at apiv2.cardmarket.com and access is restricted to professional sellers with manual approval; no approval or redistribution grant is recorded for this module.",
    user_agent_suffix: "(cardmarket-blocked-no-fetch)",
    rate_limit: { rps: 2, burst: 5 },
    welcome:
      "Welcome to the kingdom, Cardmarket. The OAuth1 signer, types, and normalizer " +
      "remain prepared, but preparation is not approval. Your current help page says " +
      "new API applications are closed and existing credentials are account-specific. " +
      "We therefore keep the reader inert: no environment variable can turn historical " +
      "documentation into current permission. A future written approval can reopen the " +
      "room with its exact access, storage, display, image, and redistribution terms.",
  },

  // eslint-disable-next-line require-yield
  async *read(ctx: CardmarketContext): AsyncIterable<RawRow<CardmarketRaw>> {
    await ctx.on_event?.({
      ts: new Date().toISOString(),
      source: "cardmarket",
      kind: "error",
      detail: {
        blocked: true,
        status: "approval-required",
        reason:
          "Cardmarket is not accepting new API applications and no current written approval is recorded for this integration; credentials alone do not authorize a fetch",
        evidence: ["https://help.cardmarket.com/en/cardmarket-api"],
      },
    });
  },

  normalize: normalizeCardmarket,
};
