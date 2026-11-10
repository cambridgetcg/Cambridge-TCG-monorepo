import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sfQuery: vi.fn(),
  redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` }); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/admin/db", () => ({ sfQuery: mocks.sfQuery }));

import AdminLayout from "../../layout";
import MonitorPage from "./page";
import { ADMIN_NAV } from "@/components/admin/AdminShell";
import { config as proxyConfig } from "@/proxy";

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
    for (const title of ["1. Collectors", "2. Derivation", "3. Data API", "4. Agents", "5. Traffic", "6. Errors", "Retention", "Vercel-seen only"]) expect(markup).toContain(title);
    expect(markup).toContain("ops_job_outcomes is not provisioned here (migration 0148)");
    expect(markup).toContain("traffic_pulls is not provisioned here (migration 0148)");
    expect(markup).toContain("market_derivation_runs is not provisioned here (migration 0141)");
    expect((markup.match(/>Unknown</g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(markup).not.toContain("<script");
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
      ["DISTINCT ON (job)", [{ job: "collect/tcgplayer", started_at: now, finished_at: now, http_status: 200, outcome: "ran", counts: { setsWritten: 3, crosswalks: { setWritten: 1 } } }]],
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
      ["AS expired FROM", [{ rows: "10", oldest: day, expired: "0" }]],
    ];
    mocks.sfQuery.mockImplementation(async (sql: string) => ({ rows: answers.find(([needle]) => sql.includes(needle))?.[1] ?? [] }));
    const markup = renderToStaticMarkup(await MonitorPage());
    for (const text of ["www.cardrush-pokemon.jp", "suspended", "1,236", "collect/tcgplayer", "refused:no-inputs", "cardmarket derivation-off", "tools/list",
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
      if (sql.includes("DISTINCT ON (job)")) return { rows: [{ job: "sweep/held-keys", started_at: swept, finished_at: swept, http_status: 200, outcome: "ran", counts: { nonces: 41, pendingKeys: 1 } }] };
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
