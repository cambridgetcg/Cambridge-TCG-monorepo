import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublishedPassport } = vi.hoisted(() => ({
  getPublishedPassport: vi.fn(),
}));
vi.mock("@/lib/collector-passport/db", () => ({ getPublishedPassport }));

import { GET } from "./route";

const context = (username: string) => ({ params: Promise.resolve({ username }) });

describe("public Collector Passport route", () => {
  beforeEach(() => getPublishedPassport.mockReset());

  it("returns the narrow projection with withdrawal-safe headers", async () => {
    getPublishedPassport.mockResolvedValue({
      username: "quiet_collector",
      status: "self_attested_unverified",
      published_item_count: 1,
      items: [{
        public_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        label: "My own label",
        story: "My own story",
        display_order: 0,
        published_at: "2026-07-12T10:00:00.000Z",
        updated_at: "2026-07-12T11:00:00.000Z",
      }],
    });

    const response = await GET(
      new Request("https://example.test/api/v1/collectors/quiet_collector/passport"),
      context("quiet_collector"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(response.headers.get("X-Content-License")).toBe("NOASSERTION");
    expect(body.passport).toEqual({
      username: "quiet_collector",
      status: "self_attested_unverified",
      published_item_count: 1,
      items: [{
        public_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        label: "My own label",
        story: "My own story",
        display_order: 0,
        published_at: "2026-07-12T10:00:00.000Z",
        updated_at: "2026-07-12T11:00:00.000Z",
      }],
    });
    expect(body.publication).toMatchObject({
      terms_url: "https://cambridgetcg.com/licenses/collector-passport-public-display-v1",
      methodology_url: "https://cambridgetcg.com/methodology/collector-passport",
      correction_url: "https://cambridgetcg.com/contact?topic=collector-passport&collector=quiet_collector",
    });
  });

  it("makes unknown, private, suspended, and withdrawn states indistinguishable", async () => {
    getPublishedPassport.mockResolvedValue(null);
    const response = await GET(
      new Request("https://example.test/api/v1/collectors/nobody/passport"),
      context("nobody"),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Collector Passport not found." });
  });

  it("rejects malformed handles without touching storage", async () => {
    const response = await GET(
      new Request("https://example.test/api/v1/collectors/bad/passport"),
      context("bad handle"),
    );
    expect(response.status).toBe(404);
    expect(getPublishedPassport).not.toHaveBeenCalled();
  });
});
