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
    expect(markup).toContain('href="#browse-by-game"');
  });

  it("puts the games with the broadest live coverage first", () => {
    const markup = renderToStaticMarkup(
      <CardPriceSearchForm games={games} />,
    );

    expect(markup.indexOf("Pokémon TCG")).toBeLessThan(
      markup.indexOf("One Piece TCG"),
    );
  });
});
