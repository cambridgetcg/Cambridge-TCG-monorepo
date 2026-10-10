import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameItem } from "@/lib/wholesale/client";
import CardFinderHero from "./CardFinderHero";

const games: GameItem[] = [
  { code: "pkm", slug: "pokemon", name: "Pokémon", card_count: 20, image_url: null },
  { code: "op", slug: "one-piece", name: "One Piece", card_count: 50, image_url: null },
  { code: "mtg", slug: "magic", name: "Magic", card_count: 20, image_url: null },
];

const voices = [
  { lang: "en", title: "Find a card", game: "Game", query: "Card number", submit: "Find →", anonymous: "No account needed to search.", boundary: "Some prices are withheld.", excluded: /Find any card|transaction history|every source|every language|all prices require/i },
  { lang: "ja", title: "カードをさがす", game: "ゲーム", query: "カード番号", submit: "さがす →", anonymous: "アカウントは要りません。", boundary: "表示できない価格もあります。", excluded: /やり取りの記録|どの言語の版も/ },
  { lang: "zh-Hant", title: "找卡", game: "遊戲", query: "卡號", submit: "找卡 →", anonymous: "找卡不用帳戶", boundary: "有些價格不公開。", excluded: /買賣紀錄|每一個來源|每一種語言/ },
  { lang: "zh-Hans", title: "找卡", game: "游戏", query: "卡牌编号", submit: "找 →", anonymous: "找卡不需要账号", boundary: "有些价格不予显示。", excluded: /任何一张卡，都找得到|成交记录|每一个来源|每一种语言/ },
  { lang: "es", title: "Encuentra una carta", game: "Juego", query: "Número de carta", submit: "Buscar →", anonymous: "Busca sin cuenta.", boundary: "Algunos precios no se muestran.", excluded: /cualquier carta|historial de compras y ventas|cada idioma/ },
] as const;

describe.each(voices)("CardFinderHero — $lang", (voice) => {
  it("keeps a native GET form, labelled fields, defaults, and browse door", () => {
    const markup = renderToStaticMarkup(<CardFinderHero games={games} uiLang={voice.lang} />);
    const form = markup.match(/<form\b[^>]*>[\s\S]*?<\/form>/)?.[0] ?? "";
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/prices/search"');
    expect([...form.matchAll(/\bname="([^"]+)"/g)].map((match) => match[1])).toEqual(["game", "q"]);
    expect(form).toMatch(new RegExp(`<label[^>]*for="finder-game"[^>]*>${voice.game}</label>`));
    expect(form).toMatch(new RegExp(`<label[^>]*for="finder-q"[^>]*>${voice.query}</label>`));
    expect(form.match(/<label\b[^>]*>/g)?.join(" ")).not.toContain("sr-only");
    expect(form).toMatch(/<select[^>]*id="finder-game"[^>]*name="game"/);
    expect(form).toContain('<option value="op" selected="">One Piece</option>');
    const input = form.match(/<input\b[^>]*>/)?.[0] ?? "";
    expect(input).toContain('id="finder-q"');
    expect(input).toContain('required=""');
    expect(input).toMatch(/placeholder="[^"]*OP01-001[^"]*"/);
    expect(input).not.toMatch(/\b(?:value|disabled|autofocus)=/);
    expect(form).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*>${voice.submit}</button>`));
    expect(markup).toMatch(/<a[^>]*href="\/prices"/);
    expect(form).not.toMatch(/\b(?:onSubmit|onChange|formAction|formMethod|noValidate)=/i);
  });

  it("names anonymous search access and price boundaries in this voice", () => {
    const markup = renderToStaticMarkup(<CardFinderHero games={games} uiLang={voice.lang} />);
    expect(markup).toContain(`aria-label="${voice.title}"`);
    expect(markup).toMatch(new RegExp(`<h2[^>]*>${voice.title}</h2>`));
    for (const text of [voice.anonymous, voice.boundary]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toMatch(voice.excluded);
    expect(markup).not.toMatch(/[!！¡]/);
  });
});

describe("CardFinderHero defaults", () => {
  it("defaults to English and sorts without changing the caller's games", () => {
    const before = games.map((game) => ({ ...game }));
    const markup = renderToStaticMarkup(<CardFinderHero games={games} />);
    expect(markup).toBe(renderToStaticMarkup(<CardFinderHero games={games} uiLang="en" />));
    expect([...markup.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1])).toEqual(["op", "pkm", "mtg"]);
    expect(games).toEqual(before);
  });

  it("keeps the empty-game fallback without inventing an option or disabling the form", () => {
    const markup = renderToStaticMarkup(<CardFinderHero games={[]} />);
    expect(markup).toMatch(/<select[^>]*name="game"[^>]*><\/select>/);
    expect(markup).not.toMatch(/<option|\bdisabled=/);
    expect(markup).toContain('type="submit"');
  });

});
