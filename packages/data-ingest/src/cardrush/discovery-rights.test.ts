import { describe, expect, it, vi } from "vitest";
import type { IngestContext } from "../types";
import type { Fetcher } from "../http";
import {
  createDiscoveryCache,
  createDiscoveryFetcher,
  fetchAndParseProduct,
  fetchSitemap,
  pickDiscoveryFetcher,
} from "./discovery";

function approval(...approved_use_cases: string[]): IngestContext {
  return {
    source_approval: {
      source_id: "cardrush",
      agreement_reference: "written-approval-2026-07",
      reviewed_at: "2026-07-11",
      approved_use_cases,
    },
  };
}

function fakeFetcher(): Fetcher {
  return Object.assign(vi.fn(), {
    count: 0,
    via_proxy: null,
    via_proxy_label: null,
  }) as unknown as Fetcher;
}

describe("CardRush discovery source approval", () => {
  it("does not fetch a sitemap or product without discovery approval", async () => {
    const fetcher = fakeFetcher();

    await expect(fetchSitemap("cardrush-op.jp", fetcher, {})).rejects.toThrow(
      /written approval for 'sitemap-discovery'/,
    );
    await expect(
      fetchAndParseProduct("https://cardrush-op.jp/product/1", fetcher, {}),
    ).rejects.toThrow(/written approval for 'sitemap-discovery'/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not create or select a discovery fetcher without approval", () => {
    expect(() => createDiscoveryFetcher({})).toThrow(
      /written approval for 'sitemap-discovery'/,
    );
    expect(
      pickDiscoveryFetcher("cardrush-op.jp", {}, createDiscoveryCache()),
    ).toEqual({
      fetcher: null,
      reason: "written_source_approval_required_for_sitemap-discovery",
    });
  });

  it("requires separate WAF-bypass approval for a WAF-gated host", () => {
    const selected = pickDiscoveryFetcher(
      "cardrush-pokemon.jp",
      {
        ...approval("sitemap-discovery"),
        cardrush: { bright_data_proxy_url: "http://example.invalid:1234" },
      },
      createDiscoveryCache(),
    );

    expect(selected).toEqual({
      fetcher: null,
      reason: "written_source_approval_required_for_waf-bypass",
    });
  });
});
