import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameItem } from "@/lib/wholesale/client";
import { CardPriceSearchForm } from "./CardPriceSearchForm";

const games: GameItem[] = [
  {
    code: "op",
    name: "One Piece TCG",
    slug: "one-piece",
    image_url: null,
    card_count: 120,
  },
  {
    code: "pkm",
    name: "Pokémon TCG",
    slug: "pokemon",
    image_url: null,
    card_count: 850,
  },
];

describe("CardPriceSearchForm", () => {
  it("submits the existing URL-driven price lookup contract", () => {
    const markup = renderToStaticMarkup(
      <CardPriceSearchForm
        games={games}
        game="op"
        query="OP01-001"
        language="en"
        browseHref="#browse-by-game"
      />,
    );

    expect(markup).toContain('action="/prices/search"');
    expect(markup).toContain('method="get"');
    expect(markup).toContain('name="game"');
    expect(markup).toContain('name="q"');
    expect(markup).toContain('name="lang"');
    expect(markup).toContain('value="OP01-001"');
    expect(markup).toContain('value="op" selected=""');
    expect(markup).toContain('value="en" selected=""');
    expect(markup).toContain('aria-label="Find a card price"');
    expect(markup).toMatch(/<button\b[^>]*type="submit"[^>]*>Find prices<\/button>/);
    expect(markup).not.toContain('type="hidden"');
    expect(markup).toContain('href="#browse-by-game"');
  });

  it("puts the games with the broadest live coverage first", () => {
    const markup = renderToStaticMarkup(
      <CardPriceSearchForm games={games} />,
    );

    expect(markup.indexOf("Pokémon TCG")).toBeLessThan(
      markup.indexOf("One Piece TCG"),
    );
    expect(markup).toContain('value="pkm" selected=""');
    expect(games.map((game) => game.code)).toEqual(["op", "pkm"]);
  });

  it("keeps keyboard and visual order game, language, card number, submit", () => {
    const markup = renderToStaticMarkup(<CardPriceSearchForm games={games} />);
    const controls = [...markup.matchAll(/<(select|input|button)\b([^>]*)>/g)];

    expect(controls.map(([, tag, attributes]) => (
      tag === "button" ? "submit" : attributes!.match(/\bname="([^"]+)"/)?.[1]
    ))).toEqual(["game", "lang", "q", "submit"]);
    expect(markup).not.toMatch(/(?:\b|:)order-/);
    expect(markup).not.toContain("tabindex=");
    expect(markup).toContain("grid-cols-2");
    expect(markup).toContain("md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]");
    expect(markup).toContain('class="col-span-2 min-w-0 md:col-span-1"');
    expect(controls[3]![2]).toContain("col-span-2 min-h-11 md:col-span-1");
  });

  it("retains explicit labels and native query validation and autofocus", () => {
    const markup = renderToStaticMarkup(
      <CardPriceSearchForm games={games} autoFocus query="OP01-001" />,
    );
    const query = markup.match(/<input\b[^>]*>/)?.[0];

    for (const [id, label] of [
      ["price-search-game", "Game"],
      ["price-search-language", "Language"],
      ["price-search-query", "Card number"],
    ]) {
      expect(markup).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>${label}</label>`));
      expect(markup).toMatch(new RegExp(`<(?:select|input)[^>]*id="${id}"`));
    }
    expect(query).toContain('type="text"');
    expect(query).toContain('required=""');
    expect(query).toContain('autofocus=""');
    expect(query).toContain('placeholder="e.g. OP01-001"');
    expect(markup).toContain("Use the small code printed on the card");
    expect(markup).toContain("usually near the bottom edge");
  });

  it.each(["", "en", "ja"])("preserves language value %j and the full option list", (language) => {
    const markup = renderToStaticMarkup(
      <CardPriceSearchForm games={games} language={language} />,
    );
    const select = markup.match(/<select[^>]*name="lang"[^>]*>(.*?)<\/select>/)?.[1];

    expect(select).toContain(`value="${language}" selected=""`);
    expect(select).toContain("Any language");
    expect(select).toContain("English");
    expect(select).toContain("Japanese");
    expect(markup).not.toContain("autofocus=");
    expect(markup).toContain('name="q"');
    expect(markup).toContain('value=""');
    expect(markup).not.toContain("No code? Browse by game instead");
  });

  it("uses comfortable native controls and an ink submit without fixed heights", () => {
    const markup = renderToStaticMarkup(<CardPriceSearchForm games={games} />);
    const fields = markup.match(/<(?:select|input)\b[^>]*>/g) ?? [];
    const button = markup.match(/<button\b[^>]*>/)?.[0];

    expect(fields).toHaveLength(3);
    for (const field of fields) {
      expect(field).toContain("min-h-11");
      expect(field).toContain("text-base");
      expect(field).toContain("focus:ring-2");
      expect(field).toContain("bg-surface");
      expect(field).not.toContain("density=");
      expect(field).not.toMatch(/(?:[\s"]|:)h-\d/);
    }
    expect(button).toContain("min-h-11");
    expect(button).toContain("bg-ink");
    expect(button).toContain("text-page");
    expect(button).not.toContain("bg-accent");
    expect(button).not.toContain("disabled=");
  });

  it("preserves an empty catalog without inventing game options", () => {
    const markup = renderToStaticMarkup(<CardPriceSearchForm games={[]} />);

    expect(markup).toMatch(/<select[^>]*name="game"[^>]*><\/select>/);
    expect(markup).toContain('action="/prices/search"');
    expect(markup).toContain('method="get"');
    expect(markup).toContain('required=""');
  });
});
