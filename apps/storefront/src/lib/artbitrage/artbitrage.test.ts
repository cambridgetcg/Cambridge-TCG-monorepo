import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getArtbitrageAdapter } from "@/app/api/v1/culture/artbitrage/route";
import {
  ARTBITRAGE_FEED_REVALIDATE_SECONDS,
  fetchArtbitrageFeed,
  type ArtbitrageFetch,
} from "./client.server";
import { ArtbitrageContractError, parseArtbitrageFeed } from "./contract";

function validFeed() {
  return {
    schema: "artbitrage.feed/1",
    feed: "artbitrage",
    source: {
      id: "artbitrage",
      name: "Artbitrage",
      canonical_url: "https://artbitrage.io",
    },
    source_state: "asset-read",
    generated_at: "2026-07-11T17:00:00.000Z",
    as_of: "2026-07-11T16:59:00.000Z",
    updated: "2026-07-11T17:00:00.000Z",
    count: 1,
    limit: 3,
    pieces: [
      {
        id: "piece-1",
        cycle: null,
        bridge: "a bridge that remembers who carried it",
        artist: "A visitor",
        unexpected_legacy_field: "preserve me",
        source: {
          id: "artbitrage.engine",
          name: "Artbitrage Engine",
          canonical_url: "https://artbitrage.io",
        },
        canonical_url: "https://artbitrage.io/api/art/piece-1",
        content_hash: `sha256:${"a".repeat(64)}`,
        creator: {
          name: "Artbitrage Engine",
          type: "software",
          human_creator: null,
          verified: false,
          note: "Project-generated attribution; no human author asserted.",
        },
        creation: {
          method: "procedural-template",
          created_at: "2026-07-11T16:59:00.000Z",
          timestamp_status: "timezone-explicit",
          trace_status: "project-generated",
          note: "Creation trace is limited to project metadata.",
        },
        rights: {
          status: "unverified",
          public_domain: null,
          license: null,
          license_verified: false,
          credit: "Artbitrage Engine",
          reusable: null,
          reuse_with_attribution: null,
          permissions: {
            view: true,
            cambridge_display: true,
            remix: null,
            commercial_use: null,
            machine_learning: null,
          },
          note: "Public visibility permits viewing only.",
        },
      },
    ],
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("artbitrage.feed/1 boundary", () => {
  it("accepts a valid feed without stripping creator, rights or legacy provenance", () => {
    const input = validFeed();
    const parsed = parseArtbitrageFeed(input);

    expect(parsed).toBe(input);
    expect(parsed.pieces[0].creator.name).toBe("Artbitrage Engine");
    expect(parsed.pieces[0].rights.permissions.machine_learning).toBeNull();
    expect(parsed.pieces[0].source.id).toBe("artbitrage.engine");
    expect(parsed.pieces[0].unexpected_legacy_field).toBe("preserve me");
  });

  it("rejects malformed trust-bearing fields", () => {
    const malformed = validFeed();
    malformed.pieces[0].content_hash = "not-a-content-hash";
    malformed.pieces[0].rights.permissions.view = false;

    expect(() => parseArtbitrageFeed(malformed)).toThrow(
      ArtbitrageContractError,
    );
    try {
      parseArtbitrageFeed(malformed);
    } catch (error) {
      expect(error).toBeInstanceOf(ArtbitrageContractError);
      expect((error as ArtbitrageContractError).issues).toContain(
        "pieces[0].content_hash",
      );
      expect((error as ArtbitrageContractError).issues).toContain(
        "pieces[0].rights.permissions.view",
      );
    }
  });

  it("preserves an explicit refusal of Cambridge display permission", () => {
    const withheld = validFeed();
    withheld.pieces[0].rights.permissions.cambridge_display = false;
    withheld.pieces[0].source.id = "artbitrage.submission";
    withheld.pieces[0].creator.type = "declared-creator";
    withheld.pieces[0].creator.human_creator = null;
    withheld.pieces[0].creation.method = "submitted";
    withheld.pieces[0].creation.trace_status = "self-declared";

    const parsed = parseArtbitrageFeed(withheld);

    expect(parsed.pieces[0].rights.permissions.cambridge_display).toBe(false);
    expect(parsed.pieces[0].creator.type).toBe("declared-creator");
    expect(parsed.pieces[0].source.id).toBe("artbitrage.submission");
  });
});

describe("fetchArtbitrageFeed", () => {
  it("uses the hourly Next cache contract and returns validated data", async () => {
    const fetchImpl = vi.fn<ArtbitrageFetch>();
    fetchImpl.mockResolvedValueOnce(response(validFeed()));

    const result = await fetchArtbitrageFeed({ limit: 3, fetchImpl });

    expect(result.status).toBe("available");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://artbitrage.io/api/feed?limit=3");
    expect(init.next.revalidate).toBe(ARTBITRAGE_FEED_REVALIDATE_SECONDS);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("distinguishes HTTP failure", async () => {
    const fetchImpl = vi.fn<ArtbitrageFetch>();
    fetchImpl.mockResolvedValueOnce(response({ error: "down" }, 503));

    await expect(fetchArtbitrageFeed({ fetchImpl })).resolves.toEqual({
      status: "unavailable",
      reason: "http",
      http_status: 503,
    });
  });

  it("distinguishes an invalid response contract", async () => {
    const fetchImpl = vi.fn<ArtbitrageFetch>();
    fetchImpl.mockResolvedValueOnce(response({ pieces: [] }));

    await expect(fetchArtbitrageFeed({ fetchImpl })).resolves.toEqual({
      status: "unavailable",
      reason: "invalid-contract",
    });
  });

  it("distinguishes network failure without leaking the thrown error", async () => {
    const fetchImpl = vi.fn<ArtbitrageFetch>();
    fetchImpl.mockRejectedValueOnce(new Error("sensitive upstream detail"));

    await expect(fetchArtbitrageFeed({ fetchImpl })).resolves.toEqual({
      status: "unavailable",
      reason: "network",
      network_kind: "request-failed",
    });
  });

  it("aborts a slow upstream and identifies the timeout", async () => {
    const fetchImpl = vi.fn<ArtbitrageFetch>();
    fetchImpl.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    await expect(
      fetchArtbitrageFeed({ fetchImpl, timeoutMs: 1 }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "network",
      network_kind: "timeout",
    });
  });
});

describe("Cambridge Artbitrage API adapter", () => {
  it("uses the Cambridge envelope while leaving licensing per record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response(validFeed())),
    );

    const output = await getArtbitrageAdapter();
    const body = await output.json();

    expect(body.data.status).toBe("available");
    expect(body.data.aggregate_license).toBe("NOASSERTION");
    expect(body.data.license_scope).toBe("per-record");
    expect(body.data.feed.pieces[0].creator.name).toBe("Artbitrage Engine");
    expect(body.data.feed.pieces[0].rights.permissions.cambridge_display).toBe(
      true,
    );
    expect(body._meta.sources).toEqual(["artbitrage-api"]);
    expect(body._meta.as_of).toBe("2026-07-11T16:59:00.000Z");
    expect(body._meta.freshness_seconds).toBe(3600);
    expect(body._meta.license).toBe("NOASSERTION");
    expect(body._meta.does_not_include[0]).toContain(
      "permissions.cambridge_display",
    );
  });
});
