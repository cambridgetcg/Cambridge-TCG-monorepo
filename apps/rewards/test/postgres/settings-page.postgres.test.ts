import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { REPORT_DUE_DAYS, REPORT_RETENTION_DAYS, openPrivacyRequest } from "~/lib/erasure.server";
import { homeBanners } from "~/lib/home-rules";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { homeState } from "~/lib/stats.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * Settings and customer data requests (spec 4.7): the email switch, the
 * list of data requests with their dates, and the download, which only
 * gives the merchant's own report before it expires and clears Home's
 * data-request banner. The admin session is the library's job
 * (requireMerchant), so it is replaced here by the store's connection and an
 * Admin API client that answers only the buyers' names the request list
 * reads live (DESIGN-17); nothing else here asks Shopify anything.
 */

vi.mock("~/admin/require-merchant.server", () => ({ requireMerchant: vi.fn() }));

const SHOP = "settings-page.myshopify.com";
const OTHER_SHOP = "other-settings-page.myshopify.com";
const TIMEZONE = "Europe/London";
const DAY = 24 * 60 * 60 * 1000;

/** Shopify's names, by numeric customer id; any other document fails the test. */
const NAMES: Record<string, { firstName: string; lastName: string | null }> = { "7001": { firstName: "Ann", lastName: "Smith" } };
const namesOnly: GraphqlClient & { asked: string[][] } = {
  asked: [],
  async graphql(query, options) {
    if (!/query RewardsCustomerNames\b/.test(query)) throw new Error(`These pages ask Shopify only for names, but asked: ${query}`);
    const ids = options?.variables?.ids as string[];
    namesOnly.asked.push(ids);
    const nodes = ids.map((gid) => {
      const person = NAMES[gid.split("/").pop()!];
      return person ? { id: gid, ...person } : null;
    });
    return { json: async () => ({ data: { nodes } }) };
  },
};

type SettingsRoute = typeof import("~/routes/app.settings._index");
type PrivacyRoute = typeof import("~/routes/app.settings.privacy");
type DownloadRoute = typeof import("~/routes/app.settings.privacy.download");
let settingsRoute: SettingsRoute;
let privacyRoute: PrivacyRoute;
let downloadRoute: DownloadRoute;
let requireMerchant: ReturnType<typeof vi.fn>;

let conn: ConnectionContext;
let other: ConnectionContext;

async function signIn(shop = SHOP) {
  const signedIn = (await findConnection(shop))!;
  requireMerchant.mockResolvedValue({ admin: namesOnly, session: { shop }, conn: signedIn });
}

type SettingsData = Exclude<Awaited<ReturnType<SettingsRoute["loader"]>>, Response>;
type PrivacyData = Exclude<Awaited<ReturnType<PrivacyRoute["loader"]>>, Response>;

async function loadSettings(): Promise<SettingsData> {
  await signIn();
  return (await settingsRoute.loader({ request: new Request("https://test.example.com/app/settings"), params: {}, context: {} } as never)) as SettingsData;
}

async function loadPrivacy(): Promise<PrivacyData> {
  await signIn();
  const request = new Request("https://test.example.com/app/settings/privacy");
  return (await privacyRoute.loader({ request, params: {}, context: {} } as never)) as PrivacyData;
}

type Result = { ok: boolean; error?: string; status?: number };

async function actSettings(fields: Record<string, string>): Promise<Result> {
  await signIn();
  const request = new Request("https://test.example.com/app/settings", { method: "POST", body: new URLSearchParams(fields) });
  const result = await settingsRoute.action({ request, params: {}, context: {} } as never);
  // A 400 comes back wrapped by data()
  if (result && typeof result === "object" && "type" in result && (result as { type: string }).type === "DataWithResponseInit") {
    const wrapped = result as unknown as { data: Result; init: { status?: number } };
    return { ...wrapped.data, status: wrapped.init.status };
  }
  return result as Result;
}

async function download(fields: Record<string, string>): Promise<Response> {
  await signIn();
  const request = new Request("https://test.example.com/app/settings/privacy/download", { method: "POST", body: new URLSearchParams(fields) });
  return (await downloadRoute.action({ request, params: {}, context: {} } as never)) as Response;
}

/** A data request received `daysAgo` days before `from`, as customers/data_request opens it. */
const received = (c: ConnectionContext, shopifyRequestId: string, daysAgo: number, from = Date.now(), externalCustomerId: string | null = "7001") =>
  openPrivacyRequest(c, {
    externalCustomerId,
    shopifyRequestId,
    ordersRequested: [],
    now: new Date(from - daysAgo * DAY),
  });

const requestRow = (id: string) =>
  prisma.privacyRequest.findUniqueOrThrow({ where: { id }, select: { status: true, downloadedAt: true } });

/** A day as the admin shows it, in the shop's time zone. */
const day = (at: Date) => new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: TIMEZONE }).format(at);

describe.skipIf(!hasTestDatabase)("Settings and customer data requests", () => {
  beforeEach(async () => {
    await resetDatabase();
    await ensureMerchant({ shop: SHOP, name: "Settings Page", currency: "GBP", timezone: TIMEZONE, now: new Date("2024-01-01T00:00:00Z") });
    await ensureMerchant({ shop: OTHER_SHOP, name: "Other", currency: "GBP", timezone: TIMEZONE, now: new Date("2024-01-01T00:00:00Z") });
    conn = (await findConnection(SHOP))!;
    other = (await findConnection(OTHER_SHOP))!;
    if (!settingsRoute) {
      settingsRoute = await import("~/routes/app.settings._index");
      privacyRoute = await import("~/routes/app.settings.privacy");
      downloadRoute = await import("~/routes/app.settings.privacy.download");
      ({ requireMerchant } = (await import("~/admin/require-merchant.server")) as unknown as { requireMerchant: ReturnType<typeof vi.fn> });
    }
  });

  afterEach(() => {
    namesOnly.asked = [];
    requireMerchant?.mockReset();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("the email switch", () => {
    it("is off by default and keeps what the merchant sets", async () => {
      await expect(loadSettings()).resolves.toEqual({ notifyBuyers: false });

      await expect(actSettings({ intent: "notify", notify: "on" })).resolves.toEqual({ ok: true });
      await expect(prisma.merchant.findUniqueOrThrow({ where: { id: conn.merchantId } })).resolves.toMatchObject({ notifyBuyers: true });
      // The next credit reads it from the connection
      await expect(findConnection(SHOP)).resolves.toMatchObject({ notifyBuyers: true });
      await expect(loadSettings()).resolves.toEqual({ notifyBuyers: true });

      await expect(actSettings({ intent: "notify", notify: "off" })).resolves.toEqual({ ok: true });
      await expect(loadSettings()).resolves.toEqual({ notifyBuyers: false });
      // Another store's switch is its own
      await expect(prisma.merchant.findUniqueOrThrow({ where: { id: other.merchantId } })).resolves.toMatchObject({ notifyBuyers: false });
    });

    // A23-F3: only on or off moves the email switch
    it("answers 400 to an email post that says neither on nor off, and changes nothing", async () => {
      await expect(actSettings({ intent: "notify", notify: "on" })).resolves.toEqual({ ok: true });
      for (const fields of [{ intent: "notify", notify: "true" }, { intent: "notify", notify: "" }, { intent: "notify" }] as Record<string, string>[]) {
        await expect(actSettings(fields), JSON.stringify(fields)).resolves.toEqual({ ok: false, error: "Unknown action.", status: 400 });
      }
      await expect(prisma.merchant.findUniqueOrThrow({ where: { id: conn.merchantId } })).resolves.toMatchObject({ notifyBuyers: true });
    });

    it("refuses an unknown action and changes nothing", async () => {
      await expect(actSettings({ intent: "running", running: "on" })).resolves.toEqual({ ok: false, error: "Unknown action.", status: 400 });
      await expect(prisma.merchant.findUniqueOrThrow({ where: { id: conn.merchantId } })).resolves.toMatchObject({ notifyBuyers: false, running: false });
    });
  });

  describe("the data requests", () => {
    it("lists the store's requests, newest first, with their received, due and expiry dates", async () => {
      const from = Date.now();
      const fresh = await received(conn, "101", 2, from);
      const downloaded = await received(conn, "102", 10, from);
      // Past its expiry, before the nightly housekeeping marked it expired
      const lapsed = await received(conn, "103", REPORT_RETENTION_DAYS + 1, from);
      const expired = await received(conn, "104", 60, from, "8888885678");
      await prisma.privacyRequest.update({ where: { id: expired.id }, data: { status: "expired" } });
      const downloadedAt = new Date(from - 5 * DAY);
      await prisma.privacyRequest.update({ where: { id: downloaded.id }, data: { status: "downloaded", downloadedAt } });
      // Shopify named no customer
      const unnamed = await received(conn, "105", 70, from, null);
      await received(other, "201", 1);

      const d = await loadPrivacy();

      const dates = (daysAgo: number) => {
        const at = from - daysAgo * DAY;
        return {
          received: day(new Date(at)),
          due: day(new Date(at + REPORT_DUE_DAYS * DAY)),
          expires: day(new Date(at + REPORT_RETENTION_DAYS * DAY)),
        };
      };
      expect(d.dueDays).toBe(30);
      expect(d.retentionDays).toBe(45);
      // DESIGN-17: whose request each is, read live from Shopify and never stored
      expect(d.requests).toEqual([
        { id: fresh.id, buyer: "Ann Smith", ...dates(2), state: "open", downloaded: null },
        { id: downloaded.id, buyer: "Ann Smith", ...dates(10), state: "downloaded", downloaded: day(downloadedAt) },
        { id: lapsed.id, buyer: "Ann Smith", ...dates(REPORT_RETENTION_DAYS + 1), state: "expired", downloaded: null },
        { id: expired.id, buyer: "Customer ····5678", ...dates(60), state: "expired", downloaded: null },
        { id: unnamed.id, buyer: "No customer named", ...dates(70), state: "expired", downloaded: null },
      ]);
      expect(namesOnly.asked).toEqual([["gid://shopify/Customer/7001", "gid://shopify/Customer/8888885678"]]);
    });

    it("shows none when no customer has asked", async () => {
      await received(other, "201", 1);
      await expect(loadPrivacy()).resolves.toMatchObject({ requests: [] });
    });

    it("downloads the report as a JSON attachment, marks it downloaded and clears Home's banner", async () => {
      const request = await received(conn, "301", 3);
      const before = await homeState(conn, new Date(), 0);
      expect(before.privacyDueAt).not.toBeNull();
      expect(homeBanners({ privacyDueAt: before.privacyDueAt, spendProblems: [], needsLook: 0, timezone: TIMEZONE, themeEditorUrl: "" }, true).map((b) => b.kind)).toEqual([
        "privacy",
      ]);

      const response = await download({ id: request.id });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
      expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="customer-data-request-301.json"');
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const report = (await response.json()) as { request: { id: string; shopifyRequestId: string }; customerFound: boolean };
      expect(report.request).toMatchObject({ id: request.id, shopifyRequestId: "301" });
      expect(report.customerFound).toBe(false);

      await expect(requestRow(request.id)).resolves.toMatchObject({ status: "downloaded", downloadedAt: expect.any(Date) });
      const after = await homeState(conn, new Date(), 0);
      expect(after.privacyDueAt).toBeNull();
      expect(homeBanners({ privacyDueAt: after.privacyDueAt, spendProblems: [], needsLook: 0, timezone: TIMEZONE, themeEditorUrl: "" }, true)).toEqual([]);
      await expect(loadPrivacy()).resolves.toMatchObject({ requests: [{ id: request.id, state: "downloaded" }] });

      // It can be downloaded again until it expires
      const again = await download({ id: request.id });
      expect(again.status).toBe(200);
    });

    it("gives only the merchant's own report", async () => {
      const theirs = await received(other, "401", 3);

      const asked: Array<Record<string, string>> = [{ id: theirs.id }, { id: crypto.randomUUID() }, { id: "not-a-request-id" }, {}];
      for (const fields of asked) {
        const response = await download(fields);
        expect(response.status).toBe(404);
        expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
        await expect(response.text()).resolves.toBe("This report is no longer available.");
      }
      await expect(requestRow(theirs.id)).resolves.toEqual({ status: "open", downloadedAt: null });
      // The other store's banner stays
      await expect(homeState(other, new Date(), 0)).resolves.toMatchObject({ privacyDueAt: expect.any(Date) });
    });

    // BOUNDARY-8: a merchant with two stores downloads each store's reports from that store only
    it("gives only the connection's own report, under one merchant with two stores", async () => {
      const now = new Date();
      const second = await prisma.connection.create({
        data: { merchantId: conn.merchantId, platform: "shopify", externalAccountId: "second-settings-page.myshopify.com", status: "active", installedAt: now, activatedAt: now },
      });
      const theirs = await received({ ...conn, connectionId: second.id, shop: second.externalAccountId }, "601", 3);

      const response = await download({ id: theirs.id });

      expect(response.status).toBe(404);
      await expect(response.text()).resolves.toBe("This report is no longer available.");
      await expect(requestRow(theirs.id)).resolves.toEqual({ status: "open", downloadedAt: null });
    });

    it("refuses an expired report, whether or not housekeeping has marked it yet", async () => {
      const lapsed = await received(conn, "501", REPORT_RETENTION_DAYS + 1);
      const expired = await received(conn, "502", 60);
      await prisma.privacyRequest.update({ where: { id: expired.id }, data: { status: "expired" } });

      for (const { id } of [lapsed, expired]) {
        const response = await download({ id });
        expect(response.status).toBe(404);
        await expect(response.text()).resolves.toBe("This report is no longer available.");
      }
      await expect(requestRow(lapsed.id)).resolves.toEqual({ status: "open", downloadedAt: null });
      await expect(requestRow(expired.id)).resolves.toEqual({ status: "expired", downloadedAt: null });
    });
  });
});
