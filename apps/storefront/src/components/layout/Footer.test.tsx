import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Footer from "./Footer";

const state = vi.hoisted(() => ({ cookies: {} as Record<string, string>, pathname: "/culture" as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => state.cookies[name] === undefined ? undefined : { value: state.cookies[name] } }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

const voices = [
  { mode: "default", explore: "Explore", account: "Account &amp; help", agents: "Agents &amp; developers", legal: "Legal", gap: null },
  { mode: "ja", explore: "見てみる", account: "アカウントとヘルプ", agents: "エージェントと開発者", legal: "法的情報", gap: "一部のページは、まだ英語のみです。" },
  { mode: "zh-Hant", explore: "探索", account: "帳戶與幫助", agents: "智能體與開發者", legal: "法律資訊", gap: "部分頁面仍只有英文版本。" },
  { mode: "zh-Hans", explore: "探索", account: "账户与帮助", agents: "智能体与开发者", legal: "法律信息", gap: "部分页面仍只有英文版本。" },
  { mode: "es", explore: "Explorar", account: "Cuenta y ayuda", agents: "Agentes y desarrolladores", legal: "Información legal", gap: "Algunas páginas siguen disponibles solo en inglés." },
];

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
}

beforeEach(() => {
  state.cookies = {};
  state.pathname = "/culture";
});

describe.each(voices)("Footer — $mode", (voice) => {
  it("groups exploration, account help and agent documentation under labelled navigation", async () => {
    state.cookies["lang-mode"] = voice.mode;
    const markup = renderToStaticMarkup(await Footer());
    for (const [index, label] of [voice.explore, voice.account, voice.agents].entries()) {
      expect(markup).toContain(`aria-labelledby="footer-group-${index}"`);
      expect(markup).toMatch(new RegExp(`<h2[^>]*id="footer-group-${index}"[^>]*>\\s*${label}\\s*</h2>`));
    }
    const links = hrefs(markup);
    for (const target of ["/prices", "/play", "/culture", "/community", "/account", "/account/portfolio", "/account/trades", "/guides", "/agents", "/data", "/methodology", "/map"]) {
      expect(links).toContain(target);
    }
    expect(links).not.toContain("/market/list");
    expect(links).not.toContain("/auctions/sell");
    expect(links).not.toContain("/nuke");
    expect(links).not.toContain("/identify");
    expect(markup).not.toContain("Trade between collectors");
  });

  it("keeps legal links, appearance controls and the translation boundary", async () => {
    state.cookies["lang-mode"] = voice.mode;
    const markup = renderToStaticMarkup(await Footer());
    expect(markup).toContain(`aria-label="${voice.legal}"`);
    for (const target of ["/privacy", "/terms", "/contact", "/appearance"]) expect(hrefs(markup)).toContain(target);
    expect(hrefs(markup)).toContain("/api/text-mode?on=1&back=%2Fculture");
    if (voice.gap) expect(markup).toContain(voice.gap);
    else for (const other of voices) if (other.gap) expect(markup).not.toContain(other.gap);
  });
});

describe("Footer cookie defaults", () => {
  it("falls back to English for unknown cookies", async () => {
    const defaultMarkup = renderToStaticMarkup(await Footer());
    state.cookies = { "lang-mode": "unknown", "text-mode": "true" };
    expect(renderToStaticMarkup(await Footer())).toBe(defaultMarkup);
    expect(hrefs(defaultMarkup)).toContain("/api/lang-mode?mode=math&back=%2Fculture");
  });

  it("offers exits from active math and text modes without losing the current path", async () => {
    state.cookies = { "lang-mode": "math", "text-mode": "1" };
    const markup = renderToStaticMarkup(await Footer());
    expect(markup).toContain("Default language");
    expect(markup).toContain("Visual layout");
    expect(hrefs(markup)).toContain("/api/lang-mode?mode=default&back=%2Fculture");
    expect(hrefs(markup)).toContain("/api/text-mode?on=0&back=%2Fculture");
  });
});
