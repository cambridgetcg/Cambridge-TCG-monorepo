import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTION_SERVICES } from "@/content/services";
import ServicesPage from "@/app/services/page";
import { ServiceCards } from "./ServiceCards";

const { linkVisits } = vi.hoisted(() => ({ linkVisits: [] as { href: string; prefetch: unknown }[] }));
vi.mock("next/link", () => ({
  default: ({ href, prefetch, ...props }: ComponentProps<"a"> & { href: string; prefetch?: boolean }) => {
    linkVisits.push({ href, prefetch });
    return <a href={href} {...props} />;
  },
}));

beforeEach(() => { linkVisits.length = 0; });

describe("collection service navigation", () => {
  it("links to implemented human pages, including the source browser history mode", () => {
    for (const service of COLLECTION_SERVICES) {
      const { pathname } = new URL(service.href, "https://example.test");
      const page = new URL(`../../app${pathname}/page.tsx`, import.meta.url);
      expect(existsSync(fileURLToPath(page)), service.href).toBe(true);
      expect(pathname).not.toMatch(/^\/(?:admin|api|market|auctions)(?:\/|$)/);
    }
    const history = COLLECTION_SERVICES.find((service) => service.id === "history")!;
    expect(new URL(history.href, "https://example.test").searchParams.get("mode")).toBe("history");
  });

  it("keeps home shortcuts to four tasks and labels private access without prefetching it", () => {
    const html = renderToStaticMarkup(<ServiceCards featured />);
    expect(linkVisits.map(({ href }) => href)).toEqual([
      "/prices", "/account/portfolio", "/guides/condition/checklist", "/account/data",
    ]);
    const cards = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
    expect(cards).toHaveLength(4);
    for (const card of cards.filter((entry) => entry.includes('href="/account/'))) {
      expect(card).toContain("Existing account");
    }
    expect(cards[0]).toContain("sign-in for prices");
    for (const visit of linkVisits) expect(visit.prefetch).toBe(false);
  });

  it("gives the full hub one main landmark and exposes stored-price context beside the tasks", () => {
    const html = renderToStaticMarkup(<ServicesPage />);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1\b[^>]*>Tools for your collection<\/h1>/);
    expect(html).toContain("current means latest stored");
    expect(html).toContain('href="/agents"');
    expect(html).not.toContain('href="/account/tools"');
    for (const service of COLLECTION_SERVICES) {
      expect(linkVisits.some(({ href }) => href === service.href), service.href).toBe(true);
    }
  });
});
