import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  fetchPrices: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/wholesale/client", () => ({ fetchPrices: mocks.fetchPrices }));

import { GET as getStarters } from "@/app/api/v1/play/starters/route";
import { GET as getStarter } from "@/app/api/v1/play/starters/[id]/route";
import { GET as loadStarter } from "@/app/api/play/load-starter/route";
import { resolveStarter } from "./starter-resolve";
import { fetchStarterAsSavedDeck } from "./client-deck";
import { PLAY_RESOURCES } from "./resources";

describe("starter publication boundary", () => {
  it("returns a membership-free collection gap", async () => {
    const response = await getStarters();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      publication_status: "withheld-untraced-lineage",
      catalog_membership_included: false,
      collection_complete: false,
      count: null,
      starters: [],
    });
    expect(body._meta.license).toBe("NOASSERTION");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetchPrices).not.toHaveBeenCalled();
  });

  it("fails detail and game-ready loading closed", async () => {
    const detail = await getStarter(new Request("https://example.test"), {
      params: Promise.resolve({ id: "caller-token" }),
    });
    const load = await loadStarter(
      new Request("https://example.test/api/play/load-starter?id=caller-token"),
    );

    expect(detail.status).toBe(503);
    expect(await detail.json()).toMatchObject({
      requested_id: "caller-token",
      catalog_membership_asserted: false,
      resolved: false,
    });
    expect(load.status).toBe(503);
    expect(await load.json()).toMatchObject({
      requested_id: "caller-token",
      catalog_membership_asserted: false,
      resolved: false,
    });
    expect(mocks.fetchPrices).not.toHaveBeenCalled();
  });

  it("keeps server and client resolver seams at zero work", async () => {
    expect(await resolveStarter("anything")).toBeNull();
    expect(await fetchStarterAsSavedDeck("anything")).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetchPrices).not.toHaveBeenCalled();
  });

  it("marks starter surfaces paused and removes picker fetches", () => {
    const resources = new Map(
      PLAY_RESOURCES.map((resource) => [resource.id, resource.status]),
    );
    for (const id of [
      "page_starters",
      "api_starters",
      "api_starter_deck",
      "lib_starter_decks",
      "lib_starter_resolve",
    ]) {
      expect(resources.get(id), id).toBe("paused");
    }

    const page = readFileSync(
      `${process.cwd()}/src/app/play/starters/page.tsx`,
      "utf8",
    );
    expect(page).toContain("Starter decks are temporarily paused");
    expect(page).not.toContain("fetch(");
  });
});
