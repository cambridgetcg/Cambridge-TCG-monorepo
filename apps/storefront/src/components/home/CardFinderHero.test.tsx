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
  { lang: "en", title: "Find a card", game: "Game", query: "Card number", submit: "Find →", details: "Card details, known variants and source publication status.", anonymous: "No account needed to search.", boundary: "Prices follow publication and access rules; some are withheld.", free: "No fee to look.", excluded: /Find any card|transaction history|every source|every language|all prices require/i },
  { lang: "ja", title: "カードをさがす", game: "ゲーム", query: "カード番号", submit: "さがす →", details: "カードの情報、登録済みの別版、出どころごとの公開状況", anonymous: "さがすのに、アカウントは要りません。", boundary: "価格は公開や閲覧の条件に従い、表示できないものもあります。", free: "見るのに、お金はかかりません。", excluded: /やり取りの記録|どの言語の版も/ },
  { lang: "zh-Hant", title: "找卡", game: "遊戲", query: "卡號", submit: "找卡 →", details: "卡片資料、已知版本、各來源的公開狀況。", anonymous: "不用帳戶也能找卡。", boundary: "價格按公開及閱覽條件顯示，有些不公開。", free: "看，不用錢。", excluded: /買賣紀錄|每一個來源|每一種語言/ },
  { lang: "zh-Hans", title: "找卡", game: "游戏", query: "卡牌编号", submit: "找 →", details: "卡牌信息、已收录的版本和来源公开状态。", anonymous: "找卡不需要账号。", boundary: "价格能否显示，要看公开和查看条件；有些不予显示。", free: "看，不花钱。", excluded: /任何一张卡，都找得到|成交记录|每一个来源|每一种语言/ },
  { lang: "es", title: "Encuentra una carta", game: "Juego", query: "Número de carta", submit: "Buscar →", details: "Datos de la carta, variantes conocidas y estado de publicación de las fuentes.", anonymous: "Busca sin cuenta.", boundary: "Los precios siguen reglas de publicación y acceso; algunos no se muestran.", free: "Mirar no cuesta nada.", excluded: /cualquier carta|historial de compras y ventas|cada idioma/ },
] as const;

describe.each(voices)("CardFinderHero — $lang", (voice) => {
  it("keeps a native GET form, labelled fields, defaults, and browse door", () => {
    const markup = renderToStaticMarkup(<CardFinderHero games={games} uiLang={voice.lang} />);
    const form = markup.match(/<form\b[^>]*>[\s\S]*?<\/form>/)?.[0] ?? "";
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/prices/search"');
    expect([...form.matchAll(/\bname="([^"]+)"/g)].map((match) => match[1])).toEqual(["game", "q"]);
    expect(form).toMatch(new RegExp(`<label[^>]*class="sr-only"[^>]*for="finder-game"[^>]*>${voice.game}</label>`));
    expect(form).toMatch(new RegExp(`<label[^>]*class="sr-only"[^>]*for="finder-q"[^>]*>${voice.query}</label>`));
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

  it("promises supported details and names price boundaries in this voice", () => {
    const markup = renderToStaticMarkup(<CardFinderHero games={games} uiLang={voice.lang} />);
    expect(markup).toContain(`aria-label="${voice.title}"`);
    expect(markup).toMatch(new RegExp(`<h2[^>]*>${voice.title}</h2>`));
    for (const text of [voice.details, voice.anonymous, voice.boundary, voice.free]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toMatch(voice.excluded);
    expect(markup).not.toMatch(/[!！¡]/);
  });
});

describe("CardFinderHero defaults and control geometry", () => {
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

  it("uses comfortable shared controls and the hero mount exception", () => {
    const markup = renderToStaticMarkup(<CardFinderHero games={games} />);
    for (const tag of ["input", "select"]) {
      const control = markup.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0] ?? "";
      const classes = control.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
      expect(classes).toEqual(expect.arrayContaining(["min-h-11", "text-base", "rounded-lg", "focus:ring-2"]));
      expect(classes).not.toContain("text-sm");
    }
    const button = markup.match(/<button\b[^>]*>/)?.[0] ?? "";
    expect(button).toContain("min-h-11");
    expect(button).toContain("bg-ink text-page");
    expect(markup).toContain("wardrobe-mat rounded-xl");
    expect(markup).not.toMatch(/\bdensity=/);
  });
});
