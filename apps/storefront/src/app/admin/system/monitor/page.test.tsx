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
    const day = now.toISOString().slice(0, 10);
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
      ["FROM mcp_daily WHERE day >= $1::date\n        GROUP BY 1, 2, 3, 4", [{ method: "tools/call", tool: "agent.self", authenticated: true, outcome: "ok", requests: "31" }]],
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
    for (const text of ["www.cardrush-pokemon.jp", "suspended", "1,236", "collect/tcgplayer", "refused:no-inputs", "cardmarket derivation-off", "tools/call", "agent.self",
      "browser-like-fleet", "/product/[sku]", "/market/[sku]", "25.0%", "fairness-audit", "80.0%", "5.0%"]) expect(markup).toContain(text);
    expect(markup).not.toContain(">Unknown<");
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
