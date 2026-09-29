import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MapPage from "@/app/map/page";
import { getPublicRoomDirectory } from "@/lib/rooms/directory";
import { ReadingTrails, RoomDirectory } from "./RoomDirectory";

vi.mock("server-only", () => ({}));

const { linkVisits } = vi.hoisted(() => ({ linkVisits: [] as { href: string; prefetch: unknown }[] }));
vi.mock("next/link", () => ({
  default: ({ href, prefetch, ...props }: ComponentProps<"a"> & { href: string; prefetch?: boolean }) => {
    linkVisits.push({ href, prefetch });
    return <a href={href} {...props} />;
  },
}));

const directory = getPublicRoomDirectory();
const textHtml = (value: string) => renderToStaticMarkup(<>{value}</>);
const hrefs = (html: string) => Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1]);

beforeEach(() => { linkVisits.length = 0; });

describe("room directory UI", () => {
  it("renders every room as a named second-level heading with its current entrance", () => {
    const html = renderToStaticMarkup(<RoomDirectory />);
    const headings = Array.from(html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g), (match) => match[1]);
    expect(headings).toHaveLength(directory.rooms.length);
    expect(hrefs(html)).toEqual(directory.rooms.map((room) => room.href));
    directory.rooms.forEach((room, index) => {
      expect(headings[index]).toContain(`href="${room.href}"`);
      expect(headings[index]).toContain(textHtml(room.title));
      expect(html).toContain(`id="${room.id}"`);
      expect(html).toContain(textHtml(room.taskLabel));
      expect(html).toContain(textHtml(room.introduction));
    });
  });

  it("shows the access explanation beside each room entrance", () => {
    const html = renderToStaticMarkup(<RoomDirectory />);
    const entries = Array.from(html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), (match) => match[1]);
    directory.rooms.forEach((room, index) => {
      expect(entries[index]).toContain(textHtml(room.accessDescription));
    });
    const collection = entries[directory.rooms.findIndex((room) => room.id === "collection")];
    expect(collection).toMatch(/Sign in to your existing account/);
  });

  it("does not prefetch destination pages while a visitor reads the directory", () => {
    renderToStaticMarkup(<RoomDirectory />);
    expect(linkVisits).toHaveLength(directory.rooms.length);
    for (const visit of linkVisits) expect(visit.prefetch).toBe(false);
  });

  it("marks English directory and trail copy independently of the surrounding UI language", () => {
    const rooms = renderToStaticMarkup(<RoomDirectory />);
    const trails = renderToStaticMarkup(<ReadingTrails />);
    expect(rooms).toMatch(/^<ul\b[^>]*lang="en"/);
    expect(trails).toMatch(/^<div\b[^>]*lang="en"/);
  });
});

describe("reading trail UI", () => {
  it("preserves ordered stops, reasons and links from the same public directory", () => {
    const html = renderToStaticMarkup(<ReadingTrails />);
    const articles = Array.from(html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g), (match) => match[1]);
    expect(articles).toHaveLength(directory.trails.length);
    directory.trails.forEach((trail, index) => {
      const article = articles[index];
      expect(article).toMatch(/<h3\b/);
      expect(article).toContain(textHtml(trail.title));
      expect(article.match(/<ol\b/g)).toHaveLength(1);
      expect(hrefs(article)).toEqual(trail.stops.map((stop) => stop.href));
      for (const stop of trail.stops) {
        expect(article).toContain(textHtml(stop.label));
        expect(article).toContain(textHtml(stop.why));
      }
    });
    for (const visit of linkVisits) expect(visit.prefetch).toBe(false);
  });

  it("labels sign-in at every private stop, including a trail entered on its own", () => {
    const html = renderToStaticMarkup(<ReadingTrails />);
    const stops = Array.from(html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), (match) => match[1]);
    directory.trails.flatMap((trail) => trail.stops).forEach((stop, index) => {
      if (stop.access === "sign-in") expect(stops[index]).toMatch(/sign[ -]in/i);
    });
  });
});

describe("map page composition", () => {
  it("provides one main heading, discoverable room headings and the public machine companion", () => {
    const html = renderToStaticMarkup(<MapPage />);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1\b[^>]*>The map<\/h1>/);
    expect(html.match(/<h2\b/g)).toHaveLength(directory.rooms.length + 1);
    expect(html.match(/<h3\b/g)).toHaveLength(directory.trails.length);
    expect(html).toContain('aria-labelledby="map-trails"');
    expect(html).toContain('id="map-trails"');
    expect(html).toContain('href="/api/v1/rooms"');
    expect(html).toContain('href="/standards/card-data"');
    expect(html).not.toMatch(/href="\/(?:collection|learn|sources|cards)"/);
    expect(html).not.toContain("modulePaths");
    expect(html).not.toContain("proposedCanonicalPath");
    const personalLinks = linkVisits.filter((visit) => /^\/account(?:\/|$)/.test(visit.href));
    expect(personalLinks.length).toBeGreaterThan(0);
    for (const visit of personalLinks) expect(visit.prefetch).toBe(false);
  });
});
