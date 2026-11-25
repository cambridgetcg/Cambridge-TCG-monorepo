import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sfQuery: vi.fn(),
  redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` }); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, usePathname: () => "/admin/system/monitor" }));
vi.mock("@/lib/admin/db", () => ({ sfQuery: mocks.sfQuery }));

import AdminLayout from "../../layout";
import MonitorPage from "./page";
import { ADMIN_NAV } from "@/components/admin/AdminShell";
import { config as proxyConfig } from "@/proxy";

/** The feedback panel's cards. */
const CARDS = ["Not read", "Read, not answered", "To be deleted within 14 days", "Held in all"];
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const session = (role: string | null) => mocks.auth.mockResolvedValue(role ? { user: { id: "u-1", email: "someone@example.test", role } } : null);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sfQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("to_regclass")) return { rows: [{ provisioned: false }] };
    throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
  });
});

describe("/admin/system/monitor behind the admin gate", () => {
  it.each([[null, "/login"], ["user", "/"], ["wholesale", "/"]])("sends a %s session to %s before reading anything", async (role, to) => {
    session(role);
    await expect(MonitorPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith(to);
    expect(mocks.sfQuery).not.toHaveBeenCalled();
    // The admin layout, which wraps every /admin page, refuses the same session.
    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
  });

  it("renders every panel for an admin, each unknown when its table is not there, never zero", async () => {
    session("admin");
    const markup = renderToStaticMarkup(await MonitorPage());
    expect(mocks.redirect).not.toHaveBeenCalled();
    for (const title of ["1. Collectors", "2. Derivation", "3. Data API", "4. Agents", "5. Traffic", "6. Errors", "7. Feedback", "Retention", "Vercel-seen only"]) expect(markup).toContain(title);
    expect(markup).toContain('href="#feedback"');
    expect(markup).toContain("public_feedback is not provisioned here (migration 0149)");
    // No card of that panel is drawn: a read that failed has no number.
    for (const label of CARDS) expect(markup).not.toContain(`>${label}<`);
    expect(markup).toContain("ops_job_outcomes is not provisioned here (migration 0148)");
    expect(markup).toContain("traffic_pulls is not provisioned here (migration 0148)");
    expect(markup).toContain("market_derivation_runs is not provisioned here (migration 0141)");
    expect((markup.match(/>Unknown</g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(markup).not.toContain("<script");
  });

  it("brings its own dark ground, so its light text is readable whatever theme the visitor wears", async () => {
    session("admin");
    const markup = renderToStaticMarkup(await MonitorPage());
    expect(markup).toMatch(/^<main class="min-h-screen bg-neutral-950 text-white">/);
    expect(markup).toMatch(/<\/main>$/);
    // AdminShell's ground, without its wait for a fetch.
    expect(source("../../../../components/admin/AdminShell.tsx")).toContain('<main className="min-h-screen bg-neutral-950 text-white">');
  });

  it("brings the admin bar, and does not pin it over the headings its own links lead to", async () => {
    session("admin");
    const bar = /^<main[^>]*><nav class="([^"]*)">([\s\S]*?)<\/nav>/.exec(renderToStaticMarkup(await MonitorPage()))!;
    for (const { href, label } of ADMIN_NAV.slice(1)) expect(bar[2]).toMatch(new RegExp(`<a [^>]*href="${href}"[^>]*>${label}</a>`));
    expect(bar[1]).not.toMatch(/sticky/);
    expect(bar[2].match(/amber-300[^>]*>[^<]*/g)).toEqual([expect.stringMatching(/>Monitor$/)]);
    // AdminShell's pages keep theirs where it was.
    expect(source("../../../../components/admin/AdminShell.tsx")).toContain("<AdminTopBar />");
  });

  it("renders populated panels as counts, with the source's words and no value", async () => {
    session("admin");
    const now = new Date();
    const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 - 3_600_000).toISOString();
    // The day is the counted hour's, not now's: between 00:00 and 01:00 UTC the
    // last whole hour is yesterday's, and today has no hour to count yet.
    const day = hour.slice(0, 10);
    const answers: [string, Record<string, unknown>[]][] = [
      ["to_regclass", [{ provisioned: true }]],
      ["FROM price_collector_hosts", [{ source: "cardrush", host: "www.cardrush-pokemon.jp", consecutive_refusals: 3, last_success_at: null, last_refusal_at: now, last_refusal_reason: "http-403", not_before: now, suspended_at: now, suspended_reason: "http-403" }]],
      ["inserted_at >= now() - interval '7 days'", [{ source: "cardrush", host: "www.cardrush-op.jp", batches: 12, source_rows: "1236", missing_prices: "0", quarantined: "14", last_inserted_at: now }]],
      ["DISTINCT ON (source)", [{ source: "cardrush", inserted_at: now, source_rows: 103, missing_prices: 0, quarantined: 2 }]],
      ["FROM price_collector_leases", [{ lease_key: "tcgplayer", spacing: false, held: true, acquired_at: now, expires_at: now }]],
      ["DISTINCT ON (job,", [{ job: "collect/tcgplayer", started_at: now, finished_at: now, http_status: 200, outcome: "ran", counts: { setsWritten: 3, crosswalks: { setWritten: 1 } } }]],
      ["job = 'derive/market'", [{ job: "derive/market", started_at: now, finished_at: now, http_status: 503, outcome: "refused:no-inputs", counts: { asOf: day, excludedSources: { cardmarket: "derivation-off" }, skipped: { unmapped: 7 } } }]],
      ["FROM ops_job_outcomes\n        WHERE started_at", [{ job: "collect/tcgplayer", outcome: "ran", runs: 24, last_at: now }]],
      ["ORDER BY as_of DESC, id DESC LIMIT 1", []],
      ["FROM data_api_usage_months", [{ month: `${day.slice(0, 7)}-01`, requests: "41", accounts: 1 }]],
      ["FROM mcp_daily WHERE day >= $1::date\n        GROUP BY 1, 2, 3, 4", [{ method: "tools/call", tool: "agent.self", authenticated: true, outcome: "ok", requests: "31" }, { method: "tools/list", tool: "none", authenticated: false, outcome: "ok", requests: "4" }]],
      ["path_group IN (", [{ path_group: "/api/v1/market/*", status_class: "2xx", requests: "777" }, { path_group: "/api/v1/market/*", status_class: "404", requests: "7" }]],
      ["FROM agent_keys", [{ keys: 4, active: 3, never: 1, last_hour: 1, last_day: 0, last_week: 1, last_month: 0, older: 0 }]],
      ["FROM agent_rate_buckets", [{ day, requests: "9", keys: 2, busiest: 7 }]],
      ["FROM traffic_pulls", [{ window_start: hour, window_end: new Date(Date.parse(hour) + 3_600_000).toISOString(), status: "ok", pulled_at: now }]],
      ["AS direct", [{ day, requests: "100", rsc: "80", direct: "5" }]],
      ["status_class, sum(count)", [{ day, status_class: "2xx", requests: "95" }, { day, status_class: "404", requests: "5" }]],
      ["SELECT (hour AT TIME ZONE 'UTC')::date::text AS day, actor_class", [{ day, actor_class: "browser-like-fleet", requests: "80" }, { day, actor_class: "ai-search", requests: "20" }]],
      ["SELECT actor_class, path_group", [{ actor_class: "browser-like-fleet", path_group: "/product/[sku]", requests: "80", rsc: "80" }]],
      ["AS not_found", [{ path_group: "/market/[sku]", not_found: "5", requests: "20" }]],
      ["FROM error_daily WHERE day", [{ day, tag: "fairness-audit", status: 200, count: 60 }]],
      ["FROM public_feedback", [{ held: 1209, unread: 3, unanswered: 1, expiring: 2, oldest_unread_hours: 5, oldest_unanswered_hours: 216 }]],
      ["AS expired FROM", [{ rows: "10", oldest: day, expired: "0" }]],
    ];
    mocks.sfQuery.mockImplementation(async (sql: string) => ({ rows: answers.find(([needle]) => sql.includes(needle))?.[1] ?? [] }));
    const markup = renderToStaticMarkup(await MonitorPage());
    // "setsWritten 3" comes only from the latest-run query: "collect/tcgplayer" is in the 7-day tally too.
    for (const text of ["www.cardrush-pokemon.jp", "suspended", "1,236", "collect/tcgplayer", "setsWritten 3", "refused:no-inputs", "cardmarket derivation-off", "tools/list",
      "browser-like-fleet", "/product/[sku]", "/market/[sku]", "25.0%", "fairness-audit", "80.0%", "5.0%"]) expect(markup).toContain(text);
    expect(markup).not.toContain(">Unknown<");
    // With one data-API account and two keys used, what they did is withheld.
    expect(markup).not.toContain("agent.self");
    expect(markup).toContain("Authenticated calls by method, tool and outcome are withheld");
    expect(markup).toContain("Other answers on key-gated routes are withheld");
    expect(markup).not.toMatch(/>777</);
    // A day's totals sit beside how many of its hours were counted.
    expect(markup).toContain("Hours counted");
    expect(markup).toMatch(/>1\/\d+</);
  });

  describe("the feedback panel", () => {
    const waiting = { held: 1209, unread: 3, unanswered: 1, expiring: 2, oldest_unread_hours: 47, oldest_unanswered_hours: 216 };
    async function panel(answer: () => Record<string, unknown>[]) {
      session("admin");
      mocks.sfQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("to_regclass")) return { rows: [{ provisioned: true }] };
        return { rows: sql.includes("FROM public_feedback") ? answer() : [] };
      });
      const markup = renderToStaticMarkup(await MonitorPage());
      const html = markup.slice(markup.indexOf('<section id="feedback"'), markup.indexOf('<section id="retention"'));
      const words = (part: string) => part.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
      /** A card's markup, its label to its number: the number's class carries the tone. */
      const card = (label: string) => { const at = html.indexOf(`>${label}<`); return at < 0 ? "" : html.slice(at, at + 160); };
      return { html, text: words(html), card };
    }
    const counted = (over: Record<string, unknown> = {}) => panel(() => [{ ...waiting, ...over }]);
    // Whatever the shell the tests run in exports.
    beforeEach(() => { vi.stubEnv("PUBLIC_FEEDBACK", ""); });
    afterEach(() => { vi.unstubAllEnvs(); });

    it("shows what waits as counts and whole-hour ages, and links to the messages", async () => {
      const { html, text } = await counted();
      for (const words of ["Not read 3 oldest 47 hours; the aim is 48 hours", "Read, not answered 1 oldest 216 hours (9 days)", "To be deleted within 14 days 2 of those neither answered nor closed", "Held in all 1,209 each kept 180 days from arrival"]) {
        expect(text).toContain(words);
      }
      // Each card that asks for something leads to the messages.
      expect(html.match(/<a [^>]*href="\/admin\/feedback"[^>]*><p [^>]*>[^<]*/g)?.map((card) => card.replace(/^.*>/, ""))).toEqual(CARDS.slice(0, 3));
      expect(text).not.toContain("Unknown");
      expect(text).toContain("Source public_feedback (0149); PUBLIC_FEEDBACK in this deployment. Covers Messages that have not expired, counted by status, with ages in whole hours on the database's clock. No message, id, reply address or time of arrival is read out. A message its holder erased is gone and not counted.");
    });

    it("shows whether the door is on here", async () => {
      vi.stubEnv("PUBLIC_FEEDBACK", "on");
      expect((await counted()).text).toContain("PUBLIC_FEEDBACK on");
      vi.stubEnv("PUBLIC_FEEDBACK", "");
      expect((await counted()).text).toContain("PUBLIC_FEEDBACK off");
    });

    it("warns once a message has waited the 48 hours it was told, and not before", async () => {
      expect((await counted()).card("Not read")).toMatch(/text-blue-400/);
      const overdue = await counted({ oldest_unread_hours: 48 });
      expect(overdue.card("Not read")).toMatch(/text-amber-400/);
      expect(overdue.text).toContain("oldest 48 hours (2 days); the aim is 48 hours");
      expect((await counted({ unread: 1, oldest_unread_hours: 48 })).card("Not read")).toMatch(/text-amber-400/);
      expect((await counted({ expiring: 1 })).card("To be deleted within 14 days")).toMatch(/text-amber-400/);
      expect((await counted({ expiring: 0 })).card("To be deleted within 14 days")).toMatch(/text-white/);
    });

    it("shows a counted zero as 0, in plain white", async () => {
      const none = await counted({ held: 0, unread: 0, unanswered: 0, expiring: 0, oldest_unread_hours: null, oldest_unanswered_hours: null });
      for (const words of ["Not read 0 none waiting", "Read, not answered 0 none waiting", "To be deleted within 14 days 0", "Held in all 0"]) expect(none.text).toContain(words);
      for (const label of CARDS) expect(none.card(label)).toMatch(/text-white/);
    });

    it.each([
      ["the table is not there", () => { throw Object.assign(new Error("relation does not exist"), { code: "42P01" }); }, "public_feedback is not provisioned here (migration 0149)"],
      ["the read fails", () => { throw new Error("connect ECONNREFUSED 10.0.0.1:5432"); }, "public_feedback could not be read"],
      ["no row comes back", () => [], "public_feedback could not be read"],
      ["a count is missing", () => [{ ...waiting, unread: null }], "public_feedback could not be read"],
      ["an age is missing", () => [{ ...waiting, oldest_unread_hours: null }], "public_feedback could not be read"],
    ])("says unknown and why, with no number, when %s", async (_when, answer, reason) => {
      const { html, text, card } = await panel(answer);
      expect(text).toContain(`Unknown ${reason}`);
      expect(text).toContain("PUBLIC_FEEDBACK off");
      for (const label of CARDS) expect(card(label)).toBe("");
      expect(html).not.toContain("10.0.0.1");
    });

    it("draws none of its text darker than neutral-400, which its smallest text needs on this ground", async () => {
      for (const { html } of [await counted(), await counted({ oldest_unread_hours: 98 }), await panel(() => [])]) expect(html).not.toMatch(/text-neutral-[56]00/);
    });

    it("reads counts and ages only: nothing a sender wrote, and no id", async () => {
      await counted();
      const read = mocks.sfQuery.mock.calls.map(([sql]) => String(sql)).filter((sql) => sql.includes("public_feedback"));
      expect(read).toHaveLength(1);
      expect(read[0]).not.toMatch(/\b(?:message|details|reply_to|reply_name|feedback_id|holder_key_sha256|answer|kind|topic)\b/);
    });
  });

  it("reads no held-keys table while signed acts are closed, and says so", async () => {
    session("admin");
    vi.stubEnv("AGENT_SIGNED_ACTS", "");
    mocks.sfQuery.mockImplementation(async (sql: string) => (sql.includes("to_regclass") ? { rows: [{ provisioned: true }] } : { rows: [] }));
    const markup = renderToStaticMarkup(await MonitorPage());
    expect(markup).toContain("Signed acts are closed here, so agent_act_nonces is not read");
    for (const [sql] of mocks.sfQuery.mock.calls) expect(String(sql)).not.toMatch(/agent_act_nonces|agent_signing_keys|agent_act_events|minted_by_event/);
    vi.unstubAllEnvs();
  });

  it("shows the nonce table as counts, the oldest past its time and the sweep's last run, while open", async () => {
    session("admin");
    vi.stubEnv("AGENT_SIGNED_ACTS", "on");
    vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", "https://cambridgetcg.com");
    const expired = new Date("2026-11-10T11:58:00Z");
    const swept = new Date("2026-11-10T11:23:01Z");
    mocks.sfQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ provisioned: true }] };
      if (sql.includes("FROM agent_act_nonces")) return { rows: [{ rows: "1234", expired: "3", oldest_expired: expired }] };
      if (sql.includes("DISTINCT ON (job,")) return { rows: [{ job: "sweep/held-keys", started_at: swept, finished_at: swept, http_status: 200, outcome: "ran", counts: { nonces: 41, pendingKeys: 1 } }] };
      return { rows: [] };
    });
    const markup = renderToStaticMarkup(await MonitorPage());
    const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("Act nonces 1,234");
    expect(text).toContain("Past their time 3");
    expect(markup).toContain("ran · 41 nonces, 1 pending keys deleted");
    expect(markup).not.toContain("Signed acts are closed here");
    // Counts only: nothing that names a key or a nonce is read.
    const read = mocks.sfQuery.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("FROM agent_act_nonces"))!;
    expect(read).not.toMatch(/\b(?:thumbprint|jti)\b/);
    vi.unstubAllEnvs();
  });

  it("warns about expired nonces only when the oldest has waited past the next sweep (90 minutes)", async () => {
    session("admin");
    vi.stubEnv("AGENT_SIGNED_ACTS", "on");
    vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", "https://cambridgetcg.com");
    const nonceCard = async (minutesAgo: number) => {
      const oldest = new Date(Date.now() - minutesAgo * 60_000);
      mocks.sfQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("to_regclass")) return { rows: [{ provisioned: true }] };
        if (sql.includes("FROM agent_act_nonces")) return { rows: [{ rows: "10", expired: "4", oldest_expired: oldest }] };
        return { rows: [] };
      });
      const markup = renderToStaticMarkup(await MonitorPage());
      const card = markup.slice(markup.indexOf("Past their time"), markup.indexOf("Oldest past its time"));
      return { card, markup };
    };
    // Between hourly sweeps, expired rows are normal: no warning.
    const normal = await nonceCard(70);
    expect(normal.card).toContain("4");
    expect(normal.card).not.toMatch(/amber/);
    expect(normal.markup).toContain("normal between hourly sweeps; a warning once the oldest is over 90 minutes past");
    const overdue = await nonceCard(95);
    expect(overdue.card).toMatch(/amber/);
    vi.unstubAllEnvs();
  });

  it("says the audience is missing when the flag is on without one, rather than showing the flag off", async () => {
    session("admin");
    vi.stubEnv("AGENT_SIGNED_ACTS", "on");
    vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", "");
    mocks.sfQuery.mockImplementation(async (sql: string) => (sql.includes("to_regclass") ? { rows: [{ provisioned: true }] } : { rows: [] }));
    const markup = renderToStaticMarkup(await MonitorPage());
    const text = markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    expect(text).toContain("AGENT_SIGNED_ACTS on");
    expect(text).toContain("AGENT_SIGNED_ACTS_AUDIENCE missing");
    expect(text).toContain("AGENT_SIGNED_ACTS is on, but AGENT_SIGNED_ACTS_AUDIENCE is not set to this deployment's origin, so signed acts stay closed and agent_act_nonces is not read.");
    for (const [sql] of mocks.sfQuery.mock.calls) expect(String(sql)).not.toMatch(/agent_act_nonces/);
    vi.unstubAllEnvs();
  });

  it("is reached through the gated paths and listed in the admin nav's system group", () => {
    expect(proxyConfig.matcher).toContain("/admin/:path*");
    expect(ADMIN_NAV).toContainEqual({ href: "/admin/system/monitor", label: "Monitor", group: "system" });
  });

  it("runs on the server only and sends nothing about the viewer anywhere", () => {
    for (const file of ["./page.tsx", "./_components.tsx"]) {
      const text = source(file);
      expect(text).not.toMatch(/^["']use client["']/m);
      for (const call of ["fetch(", "sendBeacon", "localStorage", "sessionStorage", "document.cookie", "<script"]) expect(text).not.toContain(call);
    }
    expect(source("./page.tsx")).toMatch(/await requireAdminPage\(\);\n\s+const data = await loadMonitor/);
  });
});
