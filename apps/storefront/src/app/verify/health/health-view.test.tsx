import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// drift.ts imports the database helper; only its constants are read here.
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import { MIN_SAMPLES, UTC_HOUR_WINDOW, WINDOW_DAYS } from "@/lib/provable-draw/drift";
import { HealthView, type HealthResponse } from "./health-view";

// A synthetic history shaped like production's on 2026-11-16: one digest
// published long ago, no draw left, and a self-audit that failed its one
// record every minute until the record was removed. The answer is built from
// the history and the clock the way /api/verify/health builds it (its SQL is
// run for real in route.integration.test.ts), so the same history is
// rendered before and after its failures leave the 7-day window.
const DAY = 86_400_000;
const LOOKBACK_DAYS = 7;
const LAST_AUDIT = Date.parse("2026-11-16T19:47:17.062Z");
const TIP_PUBLISHED = "2026-04-25 17:10:06.707725+00";
const NOW = Date.parse("2026-11-16T21:00:00Z");
const AFTER_WINDOW = Date.parse("2026-11-24T00:00:00Z");

/** Postgres's text form, as production sends timestamps. */
const pgText = (ms: number) => new Date(ms).toISOString().replace("T", " ").replace("Z", "+00");

const history = Array.from({ length: 12 * 24 * 60 }, (_, i) => ({
  run_at: LAST_AUDIT - i * 60_000,
  all_ok: false,
  source: "bounty_pull",
  reason: "outcome mismatch",
}));

function answerAt(now: number, flags: { auditable: boolean | null; undigested: boolean | null }): HealthResponse {
  const inWindow = history.filter((row) => row.run_at >= now - LOOKBACK_DAYS * DAY);
  const days = new Map<string, { total: number; passed: number }>();
  for (const row of inWindow) {
    const day = `${new Date(row.run_at).toISOString().slice(0, 10)} 00:00:00+00`;
    const entry = days.get(day) ?? { total: 0, passed: 0 };
    entry.total += 1;
    if (row.all_ok) entry.passed += 1;
    days.set(day, entry);
  }
  return {
    digest: {
      tip: { id: "1", root: "a".repeat(64), chain_hash: "b".repeat(64), leaf_count: 1, created_at: TIP_PUBLISHED },
      total: 1,
      last_7d: 0,
      last_24h: 0,
      leaves_7d: 0,
      has_undigested_draws: flags.undigested,
    },
    self_audit: {
      lookback_days: LOOKBACK_DAYS,
      total: inWindow.length,
      passed: inWindow.filter((row) => row.all_ok).length,
      failed: inWindow.filter((row) => !row.all_ok).length,
      has_auditable_draws: flags.auditable,
      recent_failures: inWindow
        .filter((row) => !row.all_ok)
        .sort((a, b) => b.run_at - a.run_at)
        .slice(0, 10)
        .map((row) => ({ source: row.source, reason: row.reason, run_at: pgText(row.run_at) })),
      daily_series: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
    },
    drift_alerts: { open: [], raised_30d: 0 },
  };
}

/** Render at a fixed clock; returns the markup and its words. */
function renderAt(now: number, data: HealthResponse) {
  const html = renderToStaticMarkup(<HealthView data={data} now={now} />);
  const words = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  return { html, words };
}

const minutesSince = (now: number) => Math.floor((now - Date.parse("2026-04-25T17:10:06.707Z")) / 60_000);

describe("/verify/health with no draws left, while old failures are still in the window", () => {
  const data = answerAt(NOW, { auditable: false, undigested: false });
  const { html, words } = renderAt(NOW, data);

  it("shows the window's failures as failures, and says no new rows are being written", () => {
    expect(data.self_audit.total).toBeGreaterThan(0);
    expect(html).toContain('data-audit-state="failing"');
    expect(words).toContain(`0 / ${data.self_audit.total} passed`);
    expect(words).toContain(`${data.self_audit.failed} FAILED`);
    expect(words).toContain("There is no revealed draw to sample now, so the self-audit is not writing new rows.");
    expect(words).toContain("still inside the 7-day window");
    expect(words).not.toContain("Nothing to audit");
  });

  it("titles the list by the window it now covers", () => {
    expect(data.self_audit.recent_failures).toHaveLength(10);
    expect(words).toContain("Failures in the last 7 days (latest 10)");
    expect(words).not.toContain("Recent failures");
  });

  it("does not mark the months-old tip, or a day without digests, as stale", () => {
    expect(html).toContain('data-tip-state="idle"');
    expect(words).toContain(`(${minutesSince(NOW)}m ago)`);
    expect(words).toContain("No revealed draw is waiting for a digest, so no new digest is due.");
    expect(html).not.toContain('data-tone="amber"');
  });
});

describe("/verify/health after the window empties (from 2026-11-23 19:47 UTC)", () => {
  const data = answerAt(AFTER_WINDOW, { auditable: false, undigested: false });
  const { html, words } = renderAt(AFTER_WINDOW, data);

  it("says there is nothing to audit, neither failure nor health", () => {
    expect(data.self_audit).toMatchObject({ total: 0, failed: 0, recent_failures: [], daily_series: [] });
    expect(html).toContain('data-audit-state="nothing-to-audit"');
    expect(words).toContain("Nothing to audit");
    expect(words).toContain("No self-audit was recorded in the last 7 days, and there is no revealed draw to sample. Nothing passed and nothing failed.");
    for (const shown of ["0 / 0", "—%", "FAILED", "Failures in the last"]) expect(words).not.toContain(shown);
    expect(words).not.toMatch(/\d+ \/ \d+ passed/);
  });

  it("still keeps the old tip unflagged", () => {
    expect(html).toContain('data-tip-state="idle"');
    expect(words).toContain(`(${minutesSince(AFTER_WINDOW)}m ago)`);
  });
});

describe("/verify/health when draws exist or the flags are missing", () => {
  it("warns when draws wait and nothing ran", () => {
    const { html, words } = renderAt(AFTER_WINDOW, answerAt(AFTER_WINDOW, { auditable: true, undigested: true }));
    expect(html).toContain('data-audit-state="not-running"');
    expect(words).toContain("although there is a revealed draw to sample. The self-audit may not be running.");
    expect(html).toContain('data-tip-state="overdue"');
    expect(words).toContain("A revealed draw is waiting for a digest, and the newest digest is more than an hour old.");
    expect(html).toContain('data-tone="amber"');
  });

  it("keeps the earlier reading for an answer without the flags, and claims nothing about why", () => {
    const { html, words } = renderAt(AFTER_WINDOW, answerAt(AFTER_WINDOW, { auditable: null, undigested: null }));
    expect(html).toContain('data-audit-state="unknown"');
    expect(words).toContain("No self-audit was recorded in the last 7 days.");
    expect(words).not.toContain("there is no revealed draw");
    expect(words).not.toContain("although there is a revealed draw");
    expect(html).toContain('data-tip-state="old"');
    expect(html).toContain('data-tone="amber"');
  });
});

describe("/verify/health drift panel", () => {
  it("states the drift check's own schedule and floor instead of a pass", () => {
    const { words } = renderAt(NOW, answerAt(NOW, { auditable: false, undigested: false }));
    expect(words).toContain(
      `No open drift alerts. The drift check runs daily at ${String(UTC_HOUR_WINDOW).padStart(2, "0")}:00 UTC and tests a group (a bounty tier or a draw kind) only when it has at least ${MIN_SAMPLES} samples in the last ${WINDOW_DAYS} days.`,
    );
    expect(words).not.toContain("within χ² threshold");
    expect(words).not.toContain("✓");
  });
});
