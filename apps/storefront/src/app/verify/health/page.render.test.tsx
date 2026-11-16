import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HealthPage from "./page";
import { HealthBody, readHealth, type HealthResponse } from "./health-view";
import { DIGEST_ONE_NOTE_ID } from "../digest-one-note";

// The page holds only state; its fetch is readHealth and its three states are
// HealthBody, so both are tested here without a DOM. Effects do not run in a
// static render, so the page itself renders as it first paints.

const answer: HealthResponse = {
  digest: { tip: null, total: 0, last_7d: 0, last_24h: 0, leaves_7d: 0, has_undigested_draws: false },
  self_audit: {
    lookback_days: 7,
    total: 0,
    passed: 0,
    failed: 0,
    has_auditable_draws: false,
    recent_failures: [],
    daily_series: [],
  },
  drift_alerts: { open: [], raised_30d: 0 },
};

const fakeFetch = (respond: () => Promise<Response>) => (async () => respond()) as unknown as typeof fetch;

describe("/verify/health first paint", () => {
  const html = renderToStaticMarkup(<HealthPage />);

  it("carries the digest #1 note before the feed arrives", () => {
    expect(html).toContain(`id="${DIGEST_ONE_NOTE_ID}"`);
    expect(html).toContain("Loading…");
    expect(html.indexOf(`id="${DIGEST_ONE_NOTE_ID}"`)).toBeLessThan(html.indexOf("Loading…"));
    expect(html).toContain('href="/api/verify/health"');
  });
});

describe("HealthBody", () => {
  it("says the feed could not be read when the read failed", () => {
    const html = renderToStaticMarkup(<HealthBody loaded={null} failed />);
    expect(html).toContain("The health feed could not be read just now.");
    expect(html).not.toContain("Loading…");
  });

  it("waits until there is an answer", () => {
    expect(renderToStaticMarkup(<HealthBody loaded={null} failed={false} />)).toContain("Loading…");
  });

  it("shows the answer once it has one", () => {
    const html = renderToStaticMarkup(<HealthBody loaded={{ data: answer, at: Date.parse("2026-11-24T00:00:00Z") }} failed={false} />);
    expect(html).toContain('data-audit-state="nothing-to-audit"');
    expect(html).not.toContain("Loading…");
    expect(html).not.toContain("could not be read");
  });
});

describe("readHealth", () => {
  it("returns the answer", async () => {
    const read = await readHealth(fakeFetch(async () => Response.json(answer)));
    expect(read).toEqual(answer);
  });

  it("returns null for an HTTP error, a body that is not JSON, or no answer", async () => {
    expect(await readHealth(fakeFetch(async () => Response.json({ error: "x" }, { status: 503 })))).toBeNull();
    expect(await readHealth(fakeFetch(async () => new Response("<html>", { status: 200 })))).toBeNull();
    expect(await readHealth(fakeFetch(async () => { throw new TypeError("network"); }))).toBeNull();
  });
});
