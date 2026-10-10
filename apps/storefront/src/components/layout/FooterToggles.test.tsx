import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UI_LANGS } from "@/lib/lang-mode";
import FooterToggles from "./FooterToggles";

const location = vi.hoisted(() => ({ pathname: "/prices/search" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));

function links(markup: string) {
  return [...markup.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => ({
    url: new URL(match[1].replaceAll("&amp;", "&"), "https://fixture.invalid"),
    content: match[2],
  }));
}

beforeEach(() => { location.pathname = "/prices/search"; });

describe.each(UI_LANGS)("FooterToggles — $lang", ({ lang }) => {
  it("offers the other four named voices without changing the current route", () => {
    const markup = renderToStaticMarkup(<FooterToggles mathLang={false} textMode={false} uiLang={lang} />);
    const languageLinks = links(markup).filter(({ url }) => url.pathname === "/api/lang-mode" && url.searchParams.get("mode") !== "math");
    expect(languageLinks).toHaveLength(4);
    for (const language of UI_LANGS.filter((other) => other.lang !== lang)) {
      const mode = language.lang === "en" ? "default" : language.lang;
      const link = languageLinks.find(({ url }) => url.searchParams.get("mode") === mode);
      expect(link?.content).toBe(`<span lang="${language.lang}">${language.label}</span>`);
    }
    for (const { url } of links(markup).filter(({ url }) => url.pathname.startsWith("/api/"))) {
      expect(url.searchParams.get("back")).toBe("/prices/search");
    }
    expect(links(markup).some(({ url }) => url.pathname === "/appearance")).toBe(true);
    expect(markup.match(/^<div[^>]*class="([^"]*)"/)?.[1].split(/\s+/)).toContain("flex-wrap");
  });
});

describe("FooterToggles return paths", () => {
  it("defaults to English and falls back to home while pathname is unavailable", () => {
    location.pathname = null;
    const markup = renderToStaticMarkup(<FooterToggles mathLang={false} textMode={false} />);
    expect(markup).toBe(renderToStaticMarkup(<FooterToggles mathLang={false} textMode={false} uiLang="en" />));
    for (const { url } of links(markup).filter(({ url }) => url.pathname.startsWith("/api/"))) {
      expect(url.searchParams.get("back")).toBe("/");
    }
  });

  it("round-trips a pathname containing spaces and non-Latin characters", () => {
    location.pathname = "/u/カード room";
    const markup = renderToStaticMarkup(<FooterToggles mathLang textMode />);
    for (const { url } of links(markup).filter(({ url }) => url.pathname.startsWith("/api/"))) {
      expect(url.searchParams.get("back")).toBe(location.pathname);
    }
  });
});
