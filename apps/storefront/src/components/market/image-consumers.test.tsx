import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ImageReference } from "@/lib/cards/image-reference";
import { createSameLanguageImageReference, type SameLanguageImageReference } from "@/lib/cards/same-language-image-reference";
import type { CatalogCard, CatalogQuery } from "./catalog";
import MarketBrowser from "./MarketBrowser";
import CardMarketClient, { type CardIdentitySeed } from "@/app/market/[sku]/CardMarketClient";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/market/OP-OP01-001-JP-V1" }));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));
vi.mock("@/lib/wardrobe/context", () => ({ useVoice: () => (key: string) => key }));
vi.mock("@/lib/fx/Money", () => ({ Money: ({ value }: { value: number }) => createElement("span", null, value) }));
vi.mock("@/app/market/[sku]/ListingsPanel", () => ({ ListingsPanel: () => null }));
vi.mock("@/lib/ui", () => ({
  Badge: () => null, EmptyState: () => null, ErrorAlert: () => null,
  Icon: () => null, WhyLink: () => null, Money: () => null,
  Palettes: { RarityPalette: {} },
}));

const reference: ImageReference = {
  requested_sku: "OP-OP01-001-JP-V1", requested_canonical_sku: "op-op01-001-ja-v1",
  depicted_sku: "OP-OP01-001-EN", depicted_canonical_sku: "op-op01-001-en",
  relationship: "reference", scope: "syntax_only", reason: "english_base_reference",
};
const referenceLabel = "English reference image · printing not verified";
const catalogLabel = "Catalog image · source and printing unverified";
const officialUrl = "https://ctcg-card-images.s3.us-east-1.amazonaws.com/op/OP01-001.png";
const catalogUrl = "https://jp-op-photos.s3.us-east-1.amazonaws.com/OP01/001.jpg";
const imageFields = { image_url: officialUrl, image_attribution: "© Publisher", image_reference: reference, image_language: "en" as const, image_same_language_reference: null };
const jaCredit = "©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション";
const jaFields = (requested: string) => ({
  image_url: "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-001-JA.png", image_attribution: jaCredit,
  image_reference: null, image_language: "ja" as const, image_same_language_reference: createSameLanguageImageReference(requested, "OP-OP01-001-JA"),
});
const card: CatalogCard & typeof imageFields = {
  sku: reference.requested_sku, card_number: "OP01-001", name: "Leader",
  set_code: "OP01", set_name: "Romance Dawn", rarity: "L", stock: 0,
  spot_price: null, market_price: 0, best_ask: null, best_bid: null,
  p2p_sellers: 0, p2p_buyers: 0, has_p2p: false, ...imageFields,
};
const identity: CardIdentitySeed = {
  sku: card.sku, card_number: card.card_number, card_name: card.name, set_code: card.set_code,
  set_name: card.set_name, rarity: card.rarity, ...imageFields, effect_text: null,
  attributes: null, artist: null, artist_slug: null, reference_price: null,
};

function renderBrowser(view: CatalogQuery["view"], image: {
  image_url: string | null; image_attribution: string | null; image_reference: ImageReference | null;
  image_language?: "en" | "ja" | null; image_same_language_reference?: SameLanguageImageReference | null;
}) {
  return renderToStaticMarkup(<MarketBrowser
    initial={{ game: "one-piece", q: "", set: null, sort: "name_asc", page: 1, view }}
    initialCatalog={{ ok: true, cards: [{ ...card, ...image }], total: 1, source: "wholesale-db" }}
    initialSets={{ ok: true, sets: [], source: "wholesale-db" }}
    statsProvenance={null}
    sourceBadges={{ "wholesale-api": null, "wholesale-db": null, unavailable: null }}
  />);
}

describe.each(["table", "grid"] as const)("market %s image presentation", (view) => {
  it("labels the English reference in visible copy and alt text with its copyright", () => {
    const markup = renderBrowser(view, imageFields);
    expect(markup).toContain(`alt="Leader: ${referenceLabel}"`);
    expect(markup).toMatch(new RegExp(`>[^<]*${referenceLabel}[^<]*<`));
    expect(markup).toContain("© Publisher");
    expect(markup).not.toContain(catalogLabel);
  });

  it("retains a catalog fallback with an explicit unverified label and no invented copyright", () => {
    const markup = renderBrowser(view, { image_url: catalogUrl, image_attribution: null, image_reference: null });
    expect(markup).toContain(`src="${catalogUrl}"`);
    expect(markup).toContain(`alt="Leader: ${catalogLabel}"`);
    expect(markup).toMatch(new RegExp(`>[^<]*${catalogLabel}[^<]*<`));
    expect(markup).not.toContain("© Publisher");
    expect(markup).not.toContain(referenceLabel);
  });

  it("labels a Japanese card's own-language image as Japanese, matched by SKU, with its credit marked Japanese", () => {
    const base = renderBrowser(view, jaFields("OP-OP01-001-JP"));
    expect(base).toContain('alt="Leader: Official image · this printing (Japanese), matched by SKU, not verified"');
    expect(base).toContain(`lang="ja"`);
    expect(base).toContain(jaCredit);
    expect(base).not.toContain(referenceLabel);
    const variant = renderBrowser(view, jaFields("OP-OP01-001-JP-V1"));
    expect(variant).toContain('alt="Leader: Official Japanese base print · art may differ, not verified"');
  });

  it("treats a payload without the language fields as before", () => {
    const markup = renderBrowser(view, { image_url: officialUrl, image_attribution: "© Publisher", image_reference: reference });
    expect(markup).toContain(`alt="Leader: ${referenceLabel}"`);
    expect(markup).not.toContain('lang="ja"');
  });

  it("does not show stale attribution or image labels without a URL", () => {
    const markup = renderBrowser(view, { ...imageFields, image_url: null });
    expect(markup).not.toContain(referenceLabel);
    expect(markup).not.toContain(catalogLabel);
    expect(markup).not.toContain("© Publisher");
  });
});

describe("market detail image presentation", () => {
  it("renders seeded reference metadata and copyright together", () => {
    const markup = renderToStaticMarkup(<CardMarketClient sku={identity.sku} identity={identity} />);
    expect(markup).toContain(`alt="Leader: ${referenceLabel}"`);
    expect(markup).toMatch(new RegExp(`>[^<]*${referenceLabel}[^<]*<`));
    expect(markup).toContain("© Publisher");
    expect(markup).not.toContain(catalogLabel);
  });

  it("renders a seeded Japanese image with its Japanese label and credit", () => {
    const markup = renderToStaticMarkup(<CardMarketClient sku={identity.sku} identity={{ ...identity, ...jaFields(identity.sku) }} />);
    expect(markup).toContain('alt="Leader: Official Japanese base print · art may differ, not verified"');
    expect(markup).toMatch(/<p lang="ja"[^>]*>©尾田栄一郎/);
    expect(markup).not.toContain(referenceLabel);
  });

  it("keeps catalog fallback visible without an exact-printing or copyright claim", () => {
    const markup = renderToStaticMarkup(<CardMarketClient sku={identity.sku} identity={{
      ...identity, image_url: catalogUrl, image_attribution: null, image_reference: null, image_language: null,
    }} />);
    expect(markup).toContain(`src="${catalogUrl}"`);
    expect(markup).toContain(`alt="Leader: ${catalogLabel}"`);
    expect(markup).toMatch(new RegExp(`>[^<]*${catalogLabel}[^<]*<`));
    expect(markup).not.toContain("© Publisher");
  });
});
