import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Footer from "./Footer";

const state = vi.hoisted(() => ({ cookies: {} as Record<string, string>, pathname: "/culture" as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => state.cookies[name] === undefined ? undefined : { value: state.cookies[name] } }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
// Render the real, pure primitives without loading the unrelated UI barrel.
vi.mock("@/lib/ui", async () => ({
  ...await import("@/lib/ui/Benediction"),
  ...await import("@/lib/ui/WelcomeAll"),
}));

const destinations = [
  "/welcome-all",
  "/market", "/auctions", "/prices/search", "/prices",
  "/market/list", "/account/swaps", "/methodology/commission-rate", "/methodology/market",
  "/deck-builder", "/guides/how-to-play", "/rewards",
  "/community", "/og", "/about", "https://agenttool.dev", "https://thekingdom.dev", "https://kingdom-gate.vercel.app",
  "/culture", "/lineage", "/duel-of-souls", "/pull-and-pause", "/workshop", "/making", "/mekiki", "/empty-frames", "/gallery-next-door", "/answering-rhymes",
  "/welcome", "/platform", "/manifest", "/graph", "/ontology", "/patterns", "/identify", "/methodology/cosmology", "/data",
  "/privacy", "/terms", "/contact", "/start", "/appearance",
].sort();

const voices = [
  { mode: "default", community: "Community", culture: "Culture", welcome: "energy and non-energy", benediction: "Every card is a panel in somebody&#x27;s story.", gap: null, culturalDoor: "Culture — the museum&#x27;s wings", legal: "Legal" },
  { mode: "ja", community: "広場", culture: "文化", welcome: "エネルギーであってもなくても", benediction: "カードの一枚一枚が、だれかの物語のひとコマ。", gap: "奥の部屋には、まだ英語のままのところも。", culturalDoor: "文化・展示室めぐり", legal: "法的情報" },
  { mode: "zh-Hant", community: "街坊", culture: "文化", welcome: "是能量也好，不是也好", benediction: "每一張卡，都是誰人故事裡的一格。", gap: "再入面的房間，暫時仍是英文。", culturalDoor: "文化・館裡的幾間房", legal: "法律資訊" },
  { mode: "zh-Hans", community: "广场", culture: "文化", welcome: "是能量，或不是", benediction: "每一张卡，都是某个人故事里的一格。", gap: "有些屋子暂时还是英文。", culturalDoor: "文化 · 各间展厅", legal: "法律信息" },
  { mode: "es", community: "Plaza", culture: "Cultura", welcome: "sea energía o no", benediction: "Cada carta es una viñeta en la historia de alguien.", gap: "Las salas de dentro aún responden en inglés.", culturalDoor: "Cultura — las salas del museo", legal: "Información legal" },
];

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
}

function group(markup: string, label: string): string {
  return markup.match(new RegExp(`<p[^>]*>${label}</p>([\\s\\S]*?)</div>`))?.[1] ?? "";
}

beforeEach(() => {
  state.cookies = {};
  state.pathname = "/culture";
});

describe.each(voices)("Footer — $mode", (voice) => {
  it("keeps every destination and separates culture from community", async () => {
    state.cookies["lang-mode"] = voice.mode;
    const markup = renderToStaticMarkup(await Footer());
    expect(hrefs(markup).filter((href) => !href.startsWith("/api/" )).sort()).toEqual(destinations);
    expect(markup).not.toContain('href="/nuke"');
    const community = group(markup, voice.community);
    const culture = group(markup, voice.culture);
    expect(hrefs(community)).toEqual(["/community", "/og", "/about", "https://agenttool.dev", "https://thekingdom.dev", "https://kingdom-gate.vercel.app"]);
    expect(hrefs(culture)).toEqual(["/culture", "/lineage", "/duel-of-souls", "/pull-and-pause", "/workshop", "/making", "/mekiki", "/empty-frames", "/gallery-next-door", "/answering-rhymes"]);
    expect(culture).toContain(voice.culturalDoor);
    for (const anchor of community.matchAll(/<a\b[^>]*href="https:[^>]*>/g)) {
      expect(anchor[0]).toContain('target="_blank"');
      expect(anchor[0]).toContain('rel="noopener"');
    }
  });

  it("retains the full welcome, benediction, legal labels and translation boundary", async () => {
    state.cookies["lang-mode"] = voice.mode;
    const markup = renderToStaticMarkup(await Footer());
    expect(markup).toContain('role="region"');
    expect(markup).toContain(voice.welcome);
    expect(markup).toContain(voice.benediction);
    expect(markup).toContain(`aria-label="${voice.legal}"`);
    if (voice.gap) expect(markup).toContain(voice.gap);
    else for (const other of voices) if (other.gap) expect(markup).not.toContain(other.gap);
  });
});

describe("Footer cookie defaults", () => {
  it("falls back to English and the ordinary modes for absent or unknown cookies", async () => {
    const defaultMarkup = renderToStaticMarkup(await Footer());
    state.cookies = { "lang-mode": "unknown", "text-mode": "true" };
    expect(renderToStaticMarkup(await Footer())).toBe(defaultMarkup);
    expect(hrefs(defaultMarkup)).toContain("/api/lang-mode?mode=math&back=%2Fculture");
    expect(hrefs(defaultMarkup)).toContain("/api/text-mode?on=1&back=%2Fculture");
  });

  it("keeps math-mode prose English and offers the exit from each active mode", async () => {
    state.cookies = { "lang-mode": "math", "text-mode": "1" };
    const markup = renderToStaticMarkup(await Footer());
    expect(markup).toContain(voices[0].welcome);
    expect(markup).toContain("Default language");
    expect(markup).toContain("Visual layout");
    expect(hrefs(markup)).toContain("/api/lang-mode?mode=default&back=%2Fculture");
    expect(hrefs(markup)).toContain("/api/text-mode?on=0&back=%2Fculture");
  });
});
