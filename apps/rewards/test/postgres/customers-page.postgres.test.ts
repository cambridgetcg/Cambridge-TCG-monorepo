import { Prisma, type LedgerEntryKind, type LookReason, type PayoutDirection, type PayoutState } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/db.server";
import { type ConnectionContext, ensureMerchant, findConnection } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import { customerRows } from "~/lib/stats.server";
import { tierSpend } from "~/lib/tiers.server";
import { flushWaitUntil } from "~/lib/wait-until.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { GraphqlQueryError } from "../helpers/shopify-api-errors";
import { hasTestDatabase, resetDatabase } from "./helpers/database";

/**
 * Customers and the buyer panel (spec 4.4): the list's pages and tier
 * filter, the search through Shopify mapped to known buyers, the CSV export
 * and its escaping, the lock and its 404 for another merchant's buyer, and
 * the panel's numbers, history and live balance. The admin session is the
 * library's job (requireMerchant), so it is replaced here by the store's
 * connection and a stand-in Admin API client that answers by operation name.
 */

vi.mock("~/admin/require-merchant.server", () => ({ requireMerchant: vi.fn() }));

const SHOP = "customers-page.myshopify.com";
const OTHER_SHOP = "other-customers-page.myshopify.com";
const DAY = 24 * 60 * 60 * 1000;

type Call = { operation: string; variables: Record<string, unknown> };
type Person = { firstName?: string; lastName?: string; email?: string };

/**
 * An Admin API client that answers the documents these pages send, by
 * operation name, and records each call:
 * - RewardsCustomerNames from `people` (by numeric id; each node also
 *   carries an email, which the pages must never show);
 * - RewardsCustomerSearch with `search` (numeric ids), or a failure;
 * - RewardsBalance with `balance` (GBP) or the `accounts` given, or no
 *   answer until the request is aborted ("hang"), as when Shopify is slow.
 */
function fakeAdmin(
  o: {
    people?: Record<string, Person>;
    search?: string[] | "fail";
    searchMore?: boolean;
    /** Shopify's search warnings, as when it couldn't read the search */
    searchWarnings?: string[];
    /** The first RewardsCustomerNames call is throttled, with a 3 s wait: longer than a page's 2.5 s */
    throttleNamesOnce?: boolean;
    balance?: string | "hang";
    accounts?: Array<{ amount: string; currencyCode: string }>;
  } = {},
): GraphqlClient & { calls: Call[] } {
  const calls: Call[] = [];
  let throttled = false;
  return {
    calls,
    async graphql(query, options) {
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "unknown";
      const variables = options?.variables ?? {};
      calls.push({ operation, variables });
      let answer: unknown;
      switch (operation) {
        case "RewardsCustomerNames":
          if (o.throttleNamesOnce && !throttled) {
            throttled = true;
            throw new GraphqlQueryError({
              message: "Throttled",
              response: {},
              body: {
                errors: { networkStatusCode: 200, message: "GraphQL Client", graphQLErrors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] },
                // (100 − 50) ÷ 100 is under the 1 s floor, so the retry waits 1 s (M3c-F5)
                extensions: { cost: { requestedQueryCost: 100, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 50, restoreRate: 100 } } },
              },
            });
          }
          answer = {
            data: {
              nodes: (variables.ids as string[]).map((gid) => {
                const person = o.people?.[gid.split("/").pop()!];
                return person ? { id: gid, firstName: person.firstName ?? null, lastName: person.lastName ?? null, email: person.email ?? null } : null;
              }),
            },
          };
          break;
        case "RewardsCustomerSearch":
          if (o.search === undefined || o.search === "fail") throw new Error("fetch failed");
          answer = {
            data: {
              customers: { pageInfo: { hasNextPage: o.searchMore ?? false }, nodes: o.search.map((id) => ({ id: `gid://shopify/Customer/${id}` })) },
            },
            ...(o.searchWarnings
              ? { extensions: { search: [{ path: ["customers"], query: variables.query, warnings: o.searchWarnings.map((message) => ({ field: "x", message })) }] } }
              : {}),
          };
          break;
        case "RewardsBalance":
          if (o.balance === "hang") {
            await new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
          }
          answer = {
            data: {
              customer: {
                storeCreditAccounts: {
                  nodes: (o.accounts ?? [{ amount: o.balance ?? "0.00", currencyCode: "GBP" }]).map((balance) => ({ balance })),
                  pageInfo: { hasNextPage: false },
                },
              },
            },
          };
          break;
        default:
          throw new Error(`The test answers no ${operation}`);
      }
      return { json: async () => answer };
    },
  };
}

type ListRoute = typeof import("~/routes/app.customers._index");
type PanelRoute = typeof import("~/routes/app.customers.$id");
type ExportRoute = typeof import("~/routes/app.customers.export");
let listRoute: ListRoute;
let panelRoute: PanelRoute;
let exportRoute: ExportRoute;
let requireMerchant: ReturnType<typeof vi.fn>;

async function signIn(admin: GraphqlClient) {
  const signedIn = (await findConnection(SHOP))!;
  requireMerchant.mockResolvedValue({ admin, session: { shop: SHOP }, conn: signedIn });
}

type ListData = Exclude<Awaited<ReturnType<ListRoute["loader"]>>, Response>;
type PanelData = Exclude<Awaited<ReturnType<PanelRoute["loader"]>>, Response>;

async function loadList(search: string, admin: GraphqlClient = fakeAdmin()): Promise<ListData> {
  await signIn(admin);
  const request = new Request(`https://test.example.com/app/customers${search}`);
  return (await listRoute.loader({ request, params: {}, context: {} } as never)) as ListData;
}

async function loadPanel(id: string, admin: GraphqlClient = fakeAdmin()): Promise<PanelData> {
  await signIn(admin);
  const request = new Request(`https://test.example.com/app/customers/${id}`);
  return (await panelRoute.loader({ request, params: { id }, context: {} } as never)) as PanelData;
}

async function actOnPanel(id: string, fields: Record<string, string>, admin: GraphqlClient = fakeAdmin()) {
  await signIn(admin);
  const request = new Request(`https://test.example.com/app/customers/${id}`, { method: "POST", body: new URLSearchParams(fields) });
  const result = await panelRoute.action({ request, params: { id }, context: {} } as never);
  // A 400 comes back wrapped by data()
  if (result && typeof result === "object" && "type" in result && (result as { type: string }).type === "DataWithResponseInit") {
    const wrapped = result as unknown as { data: { ok: boolean; error?: string }; init: { status?: number } };
    return { ...wrapped.data, status: wrapped.init.status };
  }
  return result as { ok: boolean; error?: string };
}

async function exportCsv(search: string, admin: GraphqlClient = fakeAdmin()): Promise<Response> {
  await signIn(admin);
  const request = new Request(`https://test.example.com/app/customers/export${search}`);
  return (await exportRoute.loader({ request, params: {}, context: {} } as never)) as Response;
}

/** What a thrown loader or action Response says, or the error itself. */
async function thrown(promise: Promise<unknown>): Promise<{ status: number } | unknown> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Response ? { status: error.status } : error;
  }
  throw new Error("expected it to throw");
}

/** What the console printed until the test ends, kept out of the test output. */
function captureLogs(): string[] {
  const logged: string[] = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...parts: unknown[]) => void logged.push(parts.map(String).join(" ")));
  }
  return logged;
}

let conn: ConnectionContext;
let bronze: { id: string };
let silver: { id: string };
let gold: { id: string };

const addTier = (merchantId: string, name: string, minSpend: string, percent: string, position: number) =>
  prisma.tier.create({
    data: { merchantId, name, minSpend: new Prisma.Decimal(minSpend), cashbackPercent: new Prisma.Decimal(percent), position },
    select: { id: true },
  });

const FIRST_SEEN = new Date("2026-01-01T00:00:00Z").getTime();
let buyerNumber = 0;

/** A buyer, each one seen a minute after the last unless `createdAt` says otherwise. */
const addBuyer = (o: { tierId?: string | null; externalId?: string | null; c?: ConnectionContext; tierSince?: Date; lockedTierId?: string } = {}) => {
  const c = o.c ?? conn;
  buyerNumber++;
  return prisma.customer.create({
    data: {
      merchantId: c.merchantId,
      connectionId: c.connectionId,
      externalCustomerId: o.externalId === undefined ? String(8000 + buyerNumber) : o.externalId,
      tierId: o.tierId === undefined ? bronze.id : o.tierId,
      tierSince: o.tierSince ?? new Date("2026-01-02T12:00:00Z"),
      lockedTierId: o.lockedTierId ?? null,
      createdAt: new Date(FIRST_SEEN + buyerNumber * 60_000),
    },
    select: { id: true, externalCustomerId: true },
  });
};

let orderNumber = 0;

/** An order of `amount` of products in GBP, `daysAgo` days ago. */
async function addOrder(
  customerId: string,
  amount: string,
  daysAgo: number,
  o: { refunded?: string; test?: boolean; cancelled?: boolean; source?: "live" | "import"; total?: string; c?: ConnectionContext } = {},
) {
  const c = o.c ?? conn;
  orderNumber++;
  const at = new Date(Date.now() - daysAgo * DAY);
  return prisma.order.create({
    data: {
      merchantId: c.merchantId,
      connectionId: c.connectionId,
      customerId,
      externalOrderId: `gid://shopify/Order/${7000 + orderNumber}`,
      name: `#${7000 + orderNumber}`,
      source: o.source ?? "live",
      currency: "GBP",
      totalAmount: o.total ?? amount,
      productAmount: amount,
      shopProductAmount: amount,
      storeCreditUsed: "0",
      shopStoreCreditUsed: "0",
      giftCardUsed: "0",
      cashbackBase: amount,
      refundedProductAmount: o.refunded ?? "0",
      shopRefundedProductAmount: o.refunded ?? "0",
      orderedAt: at,
      paidAt: at,
      cancelledAt: o.cancelled ? at : null,
      test: o.test ?? false,
      noCashbackReason: o.source === "import" ? "import" : null,
    },
    select: { id: true, name: true },
  });
}

let entryNumber = 0;

async function addEntry(
  customerId: string,
  o: {
    orderId?: string;
    kind: LedgerEntryKind;
    amount: string;
    currency?: string;
    shopAmount?: string;
    createdAt?: Date;
    tierName?: string;
    rate?: string;
    key?: string;
  },
) {
  entryNumber++;
  return prisma.ledgerEntry.create({
    data: {
      merchantId: conn.merchantId,
      connectionId: conn.connectionId,
      customerId,
      orderId: o.orderId ?? null,
      kind: o.kind,
      amount: o.amount,
      currency: o.currency ?? "GBP",
      shopAmount: o.shopAmount ?? o.amount,
      tierName: o.tierName ?? "Bronze",
      ratePercent: o.rate ?? "5",
      idempotencyKey: o.key ?? `${o.kind}:${entryNumber}`,
      createdAt: o.createdAt ?? new Date(),
    },
    select: { id: true, customerId: true, amount: true },
  });
}

async function addPayout(
  entry: { id: string; customerId: string; amount: { toString(): string } },
  state: PayoutState,
  o: { direction?: PayoutDirection; lookReason?: LookReason; debitedAmount?: string; shortfall?: string; unconfirmedAt?: Date; lastError?: string } = {},
) {
  return prisma.payout.create({
    data: {
      merchantId: conn.merchantId,
      ledgerEntryId: entry.id,
      customerId: entry.customerId,
      rail: "shopify_store_credit",
      direction: o.direction ?? "credit",
      amount: state === "nothing_to_send" ? "0" : entry.amount.toString().replace("-", ""),
      currency: "GBP",
      state,
      lookReason: o.lookReason ?? null,
      debitedAmount: o.debitedAmount ?? null,
      shortfall: o.shortfall ?? null,
      unconfirmedAt: o.unconfirmedAt ?? null,
      lastError: o.lastError ?? null,
      nextAttemptAt: new Date(),
    },
    select: { id: true },
  });
}

const plain = (value: { toString(): string }) => new Money(value.toString()).toFixed();

describe.skipIf(!hasTestDatabase)("Customers", () => {
  beforeEach(async () => {
    await resetDatabase();
    await ensureMerchant({ shop: SHOP, name: "Customers Page", currency: "GBP", timezone: "Europe/London", now: new Date("2025-01-01T00:00:00Z") });
    conn = (await findConnection(SHOP))!;
    bronze = await addTier(conn.merchantId, "Bronze", "0", "5", 0);
    silver = await addTier(conn.merchantId, "Silver", "200", "7", 1);
    gold = await addTier(conn.merchantId, "Gold", "500", "10", 2);
    if (!listRoute) {
      listRoute = await import("~/routes/app.customers._index");
      panelRoute = await import("~/routes/app.customers.$id");
      exportRoute = await import("~/routes/app.customers.export");
      ({ requireMerchant } = (await import("~/admin/require-merchant.server")) as unknown as { requireMerchant: ReturnType<typeof vi.fn> });
    }
  });

  afterEach(async () => {
    await flushWaitUntil();
    requireMerchant?.mockReset();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("the list", () => {
    it("holds 50 buyers a page, newest first, with spend as the tier engine counts it and cashback net of take-backs", async () => {
      const buyers = [];
      for (let i = 0; i < 53; i++) buyers.push(await addBuyer({ tierId: [bronze.id, silver.id, gold.id][i % 3] }));
      const newestFirst = [...buyers].reverse();

      // One buyer with every kind of order and ledger entry
      const busy = buyers[52];
      await addOrder(busy.id, "300.00", 30, { refunded: "40.00" });
      await addOrder(busy.id, "120.00", 60);
      await addOrder(busy.id, "999.00", 10, { test: true });
      await addOrder(busy.id, "50.00", 5, { cancelled: true });
      // Outside the 12-month window
      await addOrder(busy.id, "400.00", 400);
      // Refunds above the order's value add nothing
      await addOrder(busy.id, "10.00", 3, { refunded: "25.00" });
      await addEntry(busy.id, { kind: "cashback", amount: "15.00" });
      await addEntry(busy.id, { kind: "reversal", amount: "-5.00" });
      await addEntry(busy.id, { kind: "adjustment", amount: "2.00", key: "shortfall:x" });
      // Another buyer's order and entry
      await addOrder(buyers[51].id, "80.00", 2);
      await addEntry(buyers[51].id, { kind: "cashback", amount: "4.00" });

      // Not listed: an erased buyer and another store's buyer
      await addBuyer({ externalId: null });
      await ensureMerchant({ shop: OTHER_SHOP, name: "Other", currency: "GBP", timezone: "Europe/London" });
      const other = (await findConnection(OTHER_SHOP))!;
      const otherTier = await addTier(other.merchantId, "Theirs", "0", "3", 0);
      await addBuyer({ c: other, tierId: otherTier.id });

      const first = await customerRows(conn, { page: 1 });
      expect(first.rows).toHaveLength(50);
      expect(first.hasNext).toBe(true);
      expect(first.rows.map((row) => row.id)).toEqual(newestFirst.slice(0, 50).map((b) => b.id));

      const second = await customerRows(conn, { page: 2 });
      expect(second.rows.map((row) => row.id)).toEqual(newestFirst.slice(50).map((b) => b.id));
      expect(second.hasNext).toBe(false);
      expect(await customerRows(conn, { page: 3 })).toEqual({ rows: [], hasNext: false });

      const top = first.rows[0];
      expect({ ...top, spend: plain(top.spend), cashbackGiven: plain(top.cashbackGiven) }).toEqual({
        id: busy.id,
        externalCustomerId: busy.externalCustomerId,
        tierId: silver.id,
        tierName: "Silver",
        // Test orders count nowhere; cancelled and old ones are still orders
        orders: 5,
        // 300 − 40 + 120 + 0 (the over-refunded order)
        spend: "380",
        // 15 − 5 + 2
        cashbackGiven: "12",
      });
      expect(plain(first.rows[1].spend)).toBe("80");
      expect(plain(first.rows[1].cashbackGiven)).toBe("4");
      expect(first.rows[2]).toMatchObject({ orders: 0, tierName: "Gold" });
      expect(plain(first.rows[2].spend)).toBe("0");

      // The same figure as tierSpend, for every buyer
      for (const row of [...first.rows, ...second.rows]) {
        expect(plain(row.spend), row.id).toBe(plain(await tierSpend(row.id, "rolling_12_months", new Date())));
      }
      // Over all time, the old order counts too
      await prisma.merchant.update({ where: { id: conn.merchantId }, data: { tierWindow: "lifetime" } });
      const lifetime = (await findConnection(SHOP))!;
      expect(plain((await customerRows(lifetime, { page: 1 })).rows[0].spend)).toBe("780");
    });

    it("filters by tier, and by the buyers a search found", async () => {
      const bronzeBuyer = await addBuyer({ tierId: bronze.id });
      const goldA = await addBuyer({ tierId: gold.id });
      const goldB = await addBuyer({ tierId: gold.id });
      await addBuyer({ tierId: silver.id });

      expect((await customerRows(conn, { tierId: gold.id, page: 1 })).rows.map((row) => row.id)).toEqual([goldB.id, goldA.id]);
      // Not one of the merchant's tiers, or not an id at all: nobody
      await ensureMerchant({ shop: OTHER_SHOP, name: "Other", currency: "GBP", timezone: "Europe/London" });
      const theirs = await addTier((await findConnection(OTHER_SHOP))!.merchantId, "Theirs", "0", "3", 0);
      expect(await customerRows(conn, { tierId: theirs.id, page: 1 })).toEqual({ rows: [], hasNext: false });
      expect(await customerRows(conn, { tierId: "gold", page: 1 })).toEqual({ rows: [], hasNext: false });

      const found = await customerRows(conn, { externalIds: [goldA.externalCustomerId!, bronzeBuyer.externalCustomerId!, "99999"], page: 1 });
      expect(found.rows.map((row) => row.id)).toEqual([goldA.id, bronzeBuyer.id]);
      expect(await customerRows(conn, { externalIds: [], page: 1 })).toEqual({ rows: [], hasNext: false });
      expect((await customerRows(conn, { tierId: gold.id, externalIds: [goldA.externalCustomerId!, bronzeBuyer.externalCustomerId!], page: 1 })).rows).toHaveLength(1);
    });

    it("searches Shopify, shows only buyers RewardsPro knows, with their live names", async () => {
      const ann = await addBuyer({ tierId: gold.id });
      const bob = await addBuyer({ tierId: bronze.id });
      await addBuyer();
      const people = { [ann.externalCustomerId!]: { firstName: "Ann", lastName: "Smith", email: "ann@example.com" }, [bob.externalCustomerId!]: { firstName: "Bob" } };
      // Shopify also finds a customer RewardsPro has never seen
      const admin = fakeAdmin({ people, search: [ann.externalCustomerId!, "424242"] });

      const page = await loadList(`?q=${encodeURIComponent("  smith ")}`, admin);

      expect(admin.calls.find((call) => call.operation === "RewardsCustomerSearch")?.variables).toEqual({ query: "smith" });
      expect(page.query).toBe("smith");
      expect(page.searchFailed).toBe(false);
      expect(page.searchCut).toBe(false);
      expect(page.rows).toEqual([
        { id: ann.id, buyer: "Ann Smith", tierName: "Gold", tierPercent: "10", orders: 0, cashbackGiven: "£0.00" },
      ]);
      expect(JSON.stringify(page)).not.toContain("ann@example.com");

      // Without a search: everyone, the tier list for the filter, and pages
      const all = await loadList("?page=1", fakeAdmin({ people }));
      expect(all.rows.map((row) => row.buyer)).toEqual([expect.stringMatching(/^Customer ····\d{4}$/), "Bob", "Ann Smith"]);
      expect(all.tiers).toEqual([
        { id: bronze.id, name: "Bronze", percent: "5" },
        { id: silver.id, name: "Silver", percent: "7" },
        { id: gold.id, name: "Gold", percent: "10" },
      ]);
      expect(all).toMatchObject({ page: 1, hasNext: false, hasPrevious: false, tierId: "" });

      // The tier filter, and a filter that isn't one of the tiers is no filter
      expect((await loadList(`?tier=${gold.id}`, fakeAdmin({ people }))).rows.map((row) => row.id)).toEqual([ann.id]);
      expect(await loadList("?tier=nonsense&page=0", fakeAdmin({ people }))).toMatchObject({ tierId: "", page: 1 });
      expect((await loadList("?page=2", fakeAdmin({ people }))).rows).toEqual([]);

      // Shopify has more matches than one search reads
      expect((await loadList("?q=a", fakeAdmin({ people, search: [bob.externalCustomerId!], searchMore: true }))).searchCut).toBe(true);

      // BOUNDARY-5: the words are sent escaped, and the page says when Shopify couldn't read them
      const escaped = fakeAdmin({ people, search: [ann.externalCustomerId!], searchWarnings: ["Invalid search field for this query."] });
      const warned = await loadList(`?q=${encodeURIComponent("Name: -Smith")}`, escaped);
      expect(escaped.calls.find((call) => call.operation === "RewardsCustomerSearch")?.variables).toEqual({ query: "Name\\: Smith" });
      expect(warned).toMatchObject({ searchUnread: true, searchFailed: false, rows: [expect.objectContaining({ id: ann.id })] });
      expect(page.searchUnread).toBe(false);
    });

    it("says so when Shopify can't search, and shows no one", async () => {
      await addBuyer();
      const logged = captureLogs();

      const page = await loadList("?q=smith", fakeAdmin({ search: "fail" }));

      expect(page).toMatchObject({ searchFailed: true, rows: [], hasNext: false });
      // Why, never what the merchant searched for
      expect(logged.join("\n")).toMatch(/Could not search/);
      expect(logged.join("\n")).not.toContain("smith");
    });
  });

  describe("the CSV export", () => {
    it("has one line per buyer, every page of them, with formulas defused and cells quoted", async () => {
      const names = [
        { firstName: '=HYPERLINK("https://evil.example")', email: "one@example.com" },
        { firstName: "+44", lastName: "Smith" },
        { firstName: "-Neg" },
        { firstName: "@Admin" },
        { firstName: "Comma,", lastName: "Person" },
        { firstName: 'Quote "Q"', lastName: "Person" },
        { firstName: "Line\nBreak" },
        // BOUNDARY-1: no quote or comma, but a ; splits it into cells in a ; locale
        { firstName: "Ann", lastName: ";=1+1;" },
        // A name that reads as a number is still a name, not an amount the app wrote
        { firstName: "-5" },
      ];
      const atTop = await addTier(conn.merchantId, "@Top", "900", "12", 3);
      const people: Record<string, Person> = {};
      const named = [];
      for (const person of names) {
        const buyer = await addBuyer({ tierId: atTop.id });
        people[buyer.externalCustomerId!] = person;
        named.push(buyer);
      }
      await addOrder(named[0].id, "300.00", 30);
      await addEntry(named[0].id, { kind: "cashback", amount: "15.00" });
      await addEntry(named[0].id, { kind: "reversal", amount: "-20.00" });
      // A tier name carried over from the old app may start with a tab
      const tabbed = await addTier(conn.merchantId, "\tTabbed", "1200", "13", 4);
      const tabBuyer = await addBuyer({ tierId: tabbed.id });
      people[tabBuyer.externalCustomerId!] = { firstName: "Tab" };
      // 50 more, so the file runs past the first page
      for (let i = 0; i < 50; i++) await addBuyer();

      const response = await exportCsv("", fakeAdmin({ people }));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="customers-\d{4}-\d{2}-\d{2}\.csv"$/);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      // A UTF-8 byte order mark first, for spreadsheets (text() drops it)
      expect([...new Uint8Array(await response.clone().arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const body = await response.text();
      const lines = body.split("\r\n");
      expect(lines.at(-1)).toBe("");
      // TRUTH-15: the money columns name the shop's currency; MONEY-4: the spend column its window
      expect(lines[0]).toBe('"Buyer","Tier","Spend counted, last 12 months (GBP)","Cashback given (GBP)"');
      // Newest first: the 50 unnamed buyers, then the named ones from the last
      expect(lines.slice(1, -1)).toHaveLength(60);
      expect(lines.slice(1, 51).every((line) => /^"Customer ····\d{4}","Bronze","0\.00","0\.00"$/.test(line))).toBe(true);
      expect(lines.slice(51, -1).reverse()).toEqual([
        // Every cell quoted; a negative amount the app wrote stays a number a spreadsheet sums (Ruling 58)
        `"'=HYPERLINK(""https://evil.example"")","'@Top","300.00","-5.00"`,
        `"'+44 Smith","'@Top","0.00","0.00"`,
        `"'-Neg","'@Top","0.00","0.00"`,
        `"'@Admin","'@Top","0.00","0.00"`,
        `"Comma, Person","'@Top","0.00","0.00"`,
        `"Quote ""Q"" Person","'@Top","0.00","0.00"`,
        // A name's line break goes inside its quotes
        `"Line\nBreak","'@Top","0.00","0.00"`,
        `"Ann ;=1+1;","'@Top","0.00","0.00"`,
        `"'-5","'@Top","0.00","0.00"`,
        `"Tab","'\tTabbed","0.00","0.00"`,
      ]);
      expect(body).not.toContain("@example.com");
    });

    // MONEY-4: two exports either side of a window change carry different figures under different headers
    it("names the spend column's window: all time once the merchant counts all time", async () => {
      await addBuyer({ tierId: bronze.id });
      await prisma.merchant.update({ where: { id: conn.merchantId }, data: { tierWindow: "lifetime" } });

      const lines = (await (await exportCsv("")).text()).split("\r\n");

      expect(lines[0]).toBe('"Buyer","Tier","Spend counted, all time (GBP)","Cashback given (GBP)"');
    });

    it("exports what the list shows: the tier filter and the search", async () => {
      const ann = await addBuyer({ tierId: gold.id });
      const bob = await addBuyer({ tierId: gold.id });
      await addBuyer({ tierId: bronze.id });
      const people = { [ann.externalCustomerId!]: { firstName: "Ann" }, [bob.externalCustomerId!]: { firstName: "Bob" } };

      const byTier = await (await exportCsv(`?tier=${gold.id}`, fakeAdmin({ people }))).text();
      expect(byTier.split("\r\n").slice(1, -1)).toEqual(['"Bob","Gold","0.00","0.00"', '"Ann","Gold","0.00","0.00"']);

      const searched = await (await exportCsv("?q=ann", fakeAdmin({ people, search: [ann.externalCustomerId!] }))).text();
      expect(searched.split("\r\n").slice(1, -1)).toEqual(['"Ann","Gold","0.00","0.00"']);
    });

    // BOUNDARY-7: a tier filter that isn't the merchant's never widens to every buyer
    it("answers 404, not every buyer, for a tier that isn't there any more", async () => {
      const goneTier = await addTier(conn.merchantId, "Gone", "700", "11", 3);
      await addBuyer({ tierId: bronze.id });
      await prisma.tier.delete({ where: { id: goneTier.id } });

      for (const tier of [goneTier.id, "nonsense"]) {
        const response = await exportCsv(`?tier=${tier}`);
        expect(response.status, tier).toBe(404);
        expect(response.headers.get("Content-Disposition")).toBeNull();
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      }
    });

    // Ruling 63: a file that passes for complete must be complete
    it("answers an error the page shows, never part of the matches, when Shopify found more than one search reads", async () => {
      const ann = await addBuyer({ tierId: gold.id });

      const response = await exportCsv("?q=a", fakeAdmin({ search: [ann.externalCustomerId!], searchMore: true }));

      expect(response.status).toBe(422);
      expect(response.headers.get("Content-Disposition")).toBeNull();
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.text()).toBe("Too many buyers match this search for one file. Narrow the search, or export without one.");
    });

    // Ruling 79: a file that may not be what the merchant asked for is never made
    it("answers an error the page shows, with no names read, when Shopify couldn't read the search", async () => {
      const ann = await addBuyer({ tierId: gold.id });
      const admin = fakeAdmin({ people: { [ann.externalCustomerId!]: { firstName: "Ann" } }, search: [ann.externalCustomerId!], searchWarnings: ["Invalid search field for this query."] });

      const response = await exportCsv(`?q=${encodeURIComponent("Name: Ann")}`, admin);

      expect(response.status).toBe(422);
      expect(response.headers.get("Content-Disposition")).toBeNull();
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.text()).toBe("Shopify couldn't read all of this search, so the file could miss buyers. Try other words, or export without a search.");
      expect(admin.calls.map((call) => call.operation)).toEqual(["RewardsCustomerSearch"]);
    });

    // CONCURRENCY-5: a buyer leaving the tier mid-export moves no one else off the pages it reads
    it("names every buyer who stayed in the tier when a tier pass moves one out while the pages are read", async () => {
      const golds = [];
      for (let i = 0; i < 51; i++) golds.push(await addBuyer({ tierId: gold.id }));
      const people = Object.fromEntries(golds.map((buyer, i) => [buyer.externalCustomerId!, { firstName: `Gold${i}` }]));
      const newest = golds[50];
      // vi.spyOn's restore would leave the model method undefined (failNextCall), so it is patched by hand
      const delegate = prisma.customer as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const findMany = delegate.findMany;
      let reads = 0;
      delegate.findMany = async (...args: unknown[]) => {
        const rows = await findMany(...args);
        // After the first page is read, the tier pass moves the newest Gold buyer to Silver
        if (++reads === 1) await prisma.customer.update({ where: { id: newest.id }, data: { tierId: silver.id } });
        return rows;
      };

      try {
        const body = await (await exportCsv(`?tier=${gold.id}`, fakeAdmin({ people }))).text();
        const named = body.split("\r\n").slice(1, -1).map((line) => line.split(",")[0]);
        // Every buyer who stayed in Gold, the oldest included; the one who left was read before they left
        for (let i = 0; i < 50; i++) expect(named, `Gold${i}`).toContain(`"Gold${i}"`);
        expect(named).toHaveLength(51);
      } finally {
        delegate.findMany = findMany;
      }
    });

    // Ruling 78: a throttle partway through the names waits and asks again, within the export's own budget
    it("names every buyer when Shopify throttles the names once", async () => {
      const ann = await addBuyer();
      const admin = fakeAdmin({ people: { [ann.externalCustomerId!]: { firstName: "Ann" } }, throttleNamesOnce: true });

      const body = await (await exportCsv("", admin)).text();

      expect(body.split("\r\n")[1]).toBe('"Ann","Bronze","0.00","0.00"');
      expect(admin.calls.filter((call) => call.operation === "RewardsCustomerNames")).toHaveLength(2);
    });

    it("answers 503, not an empty file, when Shopify can't search", async () => {
      await addBuyer();
      captureLogs();

      const response = await exportCsv("?q=smith", fakeAdmin({ search: "fail" }));

      expect(response.ok).toBe(false);
      expect(response.status).toBe(503);
      expect(response.headers.get("Content-Disposition")).toBeNull();
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.text()).toBe("Shopify didn't answer the search. Try again.");
    });
  });

  describe("the buyer panel", () => {
    it("shows the tier, since when, progress from the same spend, history with each entry's tier and rate, and orders", async () => {
      const buyer = await addBuyer({ tierId: silver.id, tierSince: new Date("2026-06-04T23:30:00Z") });
      const people = { [buyer.externalCustomerId!]: { firstName: "Ann", lastName: "Smith", email: "ann@example.com" } };
      const paid = await addOrder(buyer.id, "300.00", 20, { total: "320.00" });
      const refunded = await addOrder(buyer.id, "100.00", 10);
      const old = await addOrder(buyer.id, "50.00", 400, { source: "import" });
      const t = (minutes: number) => new Date(Date.now() - 60 * DAY + minutes * 60_000);

      const issued = await addEntry(buyer.id, { orderId: paid.id, kind: "cashback", amount: "21.00", tierName: "Silver", rate: "7", createdAt: t(1) });
      await addPayout(issued, "sent");
      const cashback = await addEntry(buyer.id, { orderId: refunded.id, kind: "cashback", amount: "1.00", createdAt: t(2) });
      await addPayout(cashback, "sent");
      // Taken back, by an amount Shopify never told
      const unknown = await addEntry(buyer.id, { orderId: refunded.id, kind: "reversal", amount: "-0.50", createdAt: t(3) });
      await addPayout(unknown, "sent", { direction: "debit" });
      // Short: the buyer had spent 0.60 of it
      const short = await addEntry(buyer.id, { orderId: refunded.id, kind: "reversal", amount: "-1.00", createdAt: t(4) });
      const shortPayout = await addPayout(short, "sent", { direction: "debit", debitedAmount: "0.40", shortfall: "0.60" });
      await addEntry(buyer.id, { orderId: refunded.id, kind: "adjustment", amount: "0.60", key: `shortfall:${shortPayout.id}`, createdAt: t(5) });

      const page = await loadPanel(buyer.id, fakeAdmin({ people, balance: "12.50" }));

      expect(page).toMatchObject({
        id: buyer.id,
        buyer: "Ann Smith",
        adminUrl: `shopify://admin/customers/${buyer.externalCustomerId}`,
        tier: { id: silver.id, name: "Silver", percent: "7" },
        // In the shop's time zone (London is UTC+1 in June, so the 5th)
        tierSince: "June 5, 2026",
        lockedTierId: null,
        spend: "£400.00",
        windowLabel: "Last 12 months",
        // (400 − 200) × 100 ÷ (500 − 200), floored
        progress: { percent: 66, isTop: false, nextTierName: "Gold", nextTierPercent: "10", amountRemaining: "£100.00", movesTo: null },
        balances: [{ currency: "GBP", amount: "£12.50" }],
      });
      expect(page.tiers.map((tier) => tier.name)).toEqual(["Bronze", "Silver", "Gold"]);
      expect(page.history).toEqual([
        {
          date: expect.any(String),
          orderId: refunded.id,
          orderName: refunded.name,
          label: "Couldn't take back: the buyer had spent it",
          amount: "£0.60",
          tierName: "Bronze",
          ratePercent: "5",
          status: null,
          tone: null,
          detail: null,
        },
        expect.objectContaining({
          label: "Taken back for a refund",
          amount: "-£1.00",
          status: "Taken back",
          tone: "neutral",
          detail: "Took back £0.40 of £1.00; the buyer had spent the rest",
        }),
        expect.objectContaining({ label: "Taken back for a refund", amount: "-£0.50", status: "Taken back", detail: "Amount unknown" }),
        expect.objectContaining({ label: "Cashback", amount: "£1.00", status: "Issued", tone: "success", detail: null }),
        expect.objectContaining({ label: "Cashback", amount: "£21.00", tierName: "Silver", ratePercent: "7", status: "Issued", detail: null, orderName: paid.name }),
      ]);
      // Each order's status beside its cashback (TRUTH-14)
      expect(page.orders).toEqual([
        { id: refunded.id, name: refunded.name, processed: expect.any(String), total: "£100.00", cashback: "£1.00", status: "Issued", tone: "success", notes: [] },
        { id: paid.id, name: paid.name, processed: expect.any(String), total: "£320.00", cashback: "£21.00", status: "Issued", tone: "success", notes: [] },
        { id: old.id, name: old.name, processed: expect.any(String), total: "£50.00", cashback: null, status: "No cashback", tone: "neutral", notes: ["From before install"] },
      ]);
      expect(JSON.stringify(page)).not.toContain("ann@example.com");
    });

    it("shows an order taken back in full, or closed without sending, by its status and not only what it first earned", async () => {
      const buyer = await addBuyer();
      const refunded = await addOrder(buyer.id, "20.00", 5);
      await addPayout(await addEntry(buyer.id, { orderId: refunded.id, kind: "cashback", amount: "1.00" }), "sent");
      await addPayout(await addEntry(buyer.id, { orderId: refunded.id, kind: "reversal", amount: "-1.00" }), "sent", { direction: "debit", debitedAmount: "1.00", shortfall: "0" });
      const closed = await addOrder(buyer.id, "20.00", 4);
      const closedCredit = await addPayout(await addEntry(buyer.id, { orderId: closed.id, kind: "cashback", amount: "1.00" }), "closed");
      await addEntry(buyer.id, { orderId: closed.id, kind: "adjustment", amount: "-1.00", key: `close:${closedCredit.id}` });

      const page = await loadPanel(buyer.id);

      expect(page.orders.map(({ name, cashback, status }) => ({ name, cashback, status }))).toEqual([
        { name: closed.name, cashback: "£1.00", status: "No cashback" },
        { name: refunded.name, cashback: "£1.00", status: "Taken back" },
      ]);
    });

    it("says what happened to cashback that didn't simply go out", async () => {
      const buyer = await addBuyer();
      const order = await addOrder(buyer.id, "100.00", 5);
      const entries: Array<[PayoutState, Parameters<typeof addPayout>[2]]> = [
        ["needs_look", { lookReason: "refused", lastError: "ACCOUNT_LIMIT" }],
        // Settled from unclear, then refused: it may have arrived
        ["needs_look", { lookReason: "refused", unconfirmedAt: new Date(Date.now() - DAY), lastError: "ACCOUNT_LIMIT" }],
        // Refused because the buyer is gone from Shopify: there is no one to check (TRUTH-13)
        ["needs_look", { lookReason: "refused", unconfirmedAt: new Date(Date.now() - DAY), lastError: "The customer no longer exists in Shopify" }],
        ["needs_look", { lookReason: "kept_failing" }],
        ["needs_look", { lookReason: "could_not_confirm" }],
        ["nothing_to_send", {}],
        ["closed", {}],
        ["pending", {}],
      ];
      let minute = 0;
      for (const [state, options] of entries) {
        const entry = await addEntry(buyer.id, { orderId: order.id, kind: "cashback", amount: "1.00", createdAt: new Date(Date.now() - DAY + ++minute * 60_000) });
        const payout = await addPayout(entry, state, options);
        if (state === "closed") {
          await addEntry(buyer.id, { orderId: order.id, kind: "adjustment", amount: "-1.00", key: `close:${payout.id}`, createdAt: new Date(Date.now() - DAY + ++minute * 60_000) });
        }
      }
      const takeBacks: Array<[PayoutState, Parameters<typeof addPayout>[2]]> = [
        ["needs_look", { direction: "debit", lookReason: "could_not_confirm" }],
        ["needs_look", { direction: "debit", lookReason: "refused" }],
        ["needs_look", { direction: "debit", lookReason: "kept_failing" }],
        ["closed", { direction: "debit" }],
        // Taken in full
        ["sent", { direction: "debit", debitedAmount: "1.00", shortfall: "0.00" }],
      ];
      for (const [state, options] of takeBacks) {
        const takeBack = await addEntry(buyer.id, { orderId: order.id, kind: "reversal", amount: "-1.00", createdAt: new Date(Date.now() - DAY + ++minute * 60_000) });
        const payout = await addPayout(takeBack, state, options);
        // A take-back closed without taking: the buyer keeps the cashback (TRUTH-4)
        if (state === "closed") {
          await addEntry(buyer.id, { orderId: order.id, kind: "adjustment", amount: "1.00", key: `close:${payout.id}`, createdAt: new Date(Date.now() - DAY + ++minute * 60_000) });
        }
      }

      const page = await loadPanel(buyer.id);

      expect(page.history.map(({ label, status, detail }) => ({ label, status, detail })).reverse()).toEqual([
        { label: "Cashback", status: "Needs a look", detail: "Shopify refused it." },
        {
          label: "Cashback",
          status: "Needs a look",
          detail: "Shopify refused it after a send that wasn't clear, so it may have arrived. Check the buyer's store credit in Shopify.",
        },
        { label: "Cashback", status: "Needs a look", detail: "The buyer no longer exists in Shopify; close it without sending." },
        { label: "Cashback", status: "Needs a look", detail: "Sending kept failing." },
        { label: "Cashback", status: "Needs a look", detail: "RewardsPro couldn't confirm it arrived." },
        { label: "Cashback", status: "Taken back", detail: "A refund cancelled it before it was sent." },
        { label: "Cashback", status: "No cashback", detail: "Closed without sending." },
        { label: "Closed without sending", status: null, detail: null },
        { label: "Cashback", status: "Waiting", detail: null },
        { label: "Taken back for a refund", status: "Needs a look", detail: "RewardsPro couldn't confirm it was taken back." },
        { label: "Taken back for a refund", status: "Needs a look", detail: "Shopify refused to take it back." },
        { label: "Taken back for a refund", status: "Needs a look", detail: "Taking it back kept failing." },
        { label: "Taken back for a refund", status: "Not taken back", detail: "Closed without taking it back." },
        { label: "Take-back closed: the buyer keeps it", status: null, detail: null },
        { label: "Taken back for a refund", status: "Taken back", detail: null },
      ]);
      expect(page).toMatchObject({ moreHistory: false, moreOrders: false });
    });

    it("lists the newest 50 entries and orders, and says there are more", async () => {
      const buyer = await addBuyer();
      for (let i = 0; i < 51; i++) {
        const order = await addOrder(buyer.id, "10.00", 60 - i);
        // Every cashback is written with its payout
        await addPayout(await addEntry(buyer.id, { orderId: order.id, kind: "cashback", amount: "0.50", createdAt: new Date(Date.now() - (60 - i) * DAY) }), "sent");
      }

      const page = await loadPanel(buyer.id);

      expect(page).toMatchObject({ moreHistory: true, moreOrders: true, limit: 50 });
      expect(page.history).toHaveLength(50);
      expect(page.orders).toHaveLength(50);
      // The oldest is the one left out
      expect(page.orders.at(-1)!.name).not.toBe((await prisma.order.findFirstOrThrow({ orderBy: { orderedAt: "asc" } })).name);
    });

    it("shows the balance as unknown when Shopify doesn't answer in time", async () => {
      const answered = await addBuyer();
      const slow = await addBuyer();
      expect((await loadPanel(answered.id, fakeAdmin({ balance: "3.20" }))).balances).toEqual([{ currency: "GBP", amount: "£3.20" }]);

      const logged = captureLogs();
      const started = Date.now();
      const page = await loadPanel(slow.id, fakeAdmin({ balance: "hang" }));

      expect(page.balances).toBeNull();
      expect(Date.now() - started).toBeLessThan(4_000);
      expect(logged.join("\n")).toMatch(/Could not read a buyer's store credit balance/);
    });

    // Ruling 66 (TRUTH-3): cashback is issued in the buyer's currency, so a euro order on a GBP shop is paid in euros
    it("shows the balance in each currency RewardsPro issued the buyer, and the shop's", async () => {
      const buyer = await addBuyer();
      const order = await addOrder(buyer.id, "100.00", 5);
      await prisma.order.update({ where: { id: order.id }, data: { currency: "EUR" } });
      await addPayout(await addEntry(buyer.id, { orderId: order.id, kind: "cashback", amount: "5.00", currency: "EUR", shopAmount: "4.30" }), "sent");

      const eurOnly = await loadPanel(buyer.id, fakeAdmin({ accounts: [{ amount: "5.00", currencyCode: "EUR" }] }));
      expect(eurOnly.balances).toEqual([
        { currency: "GBP", amount: "£0.00" },
        { currency: "EUR", amount: "€5.00" },
      ]);
      // Credit the merchant added in pounds, beside the euro cashback
      const both = await loadPanel(
        buyer.id,
        fakeAdmin({
          accounts: [
            { amount: "5.00", currencyCode: "EUR" },
            { amount: "2.00", currencyCode: "GBP" },
          ],
        }),
      );
      expect(both.balances).toEqual([
        { currency: "GBP", amount: "£2.00" },
        { currency: "EUR", amount: "€5.00" },
      ]);
    });

    // A21-F6: the panel says "now", so it reads Shopify on every load
    it("reads the balance afresh on every load", async () => {
      const buyer = await addBuyer();
      expect((await loadPanel(buyer.id, fakeAdmin({ balance: "3.20" }))).balances).toEqual([{ currency: "GBP", amount: "£3.20" }]);
      expect((await loadPanel(buyer.id, fakeAdmin({ balance: "8.00" }))).balances).toEqual([{ currency: "GBP", amount: "£8.00" }]);
    });

    // TRUTH-11, A21-F2: progress is true for a locked buyer and for one the tier pass hasn't reached
    it("says a buyer who already qualifies for a higher tier moves at the next update, and a locked one doesn't", async () => {
      const waiting = await addBuyer({ tierId: silver.id });
      await addOrder(waiting.id, "600.00", 10);
      const locked = await addBuyer({ tierId: bronze.id, lockedTierId: bronze.id });
      await addOrder(locked.id, "600.00", 10);

      expect((await loadPanel(waiting.id)).progress).toMatchObject({ movesTo: "Gold" });
      expect((await loadPanel(locked.id)).progress).toMatchObject({ movesTo: null });
    });

    it("answers 404 for another merchant's buyer, an erased one, or no buyer", async () => {
      await ensureMerchant({ shop: OTHER_SHOP, name: "Other", currency: "GBP", timezone: "Europe/London" });
      const other = (await findConnection(OTHER_SHOP))!;
      const otherTier = await addTier(other.merchantId, "Theirs", "0", "3", 0);
      const theirs = await addBuyer({ c: other, tierId: otherTier.id });
      const erased = await addBuyer({ externalId: null });

      for (const id of [theirs.id, erased.id, "00000000-0000-4000-8000-000000000000", "not-a-buyer"]) {
        expect(await thrown(loadPanel(id)), id).toEqual({ status: 404 });
      }
    });
  });

  describe("the lock", () => {
    it("locks a buyer to a tier and returns them to automatic", async () => {
      const buyer = await addBuyer({ tierId: bronze.id });
      await addOrder(buyer.id, "250.00", 10);

      expect(await actOnPanel(buyer.id, { intent: "lock", tierId: gold.id })).toEqual({ ok: true });
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: buyer.id } })).toMatchObject({ lockedTierId: gold.id, tierId: gold.id });
      expect((await loadPanel(buyer.id)).lockedTierId).toBe(gold.id);

      expect(await actOnPanel(buyer.id, { intent: "automatic" })).toEqual({ ok: true });
      // Back to the tier the spend qualifies for
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: buyer.id } })).toMatchObject({ lockedTierId: null, tierId: silver.id });
    });

    it("answers 404 for another merchant's buyer and changes nothing", async () => {
      await ensureMerchant({ shop: OTHER_SHOP, name: "Other", currency: "GBP", timezone: "Europe/London" });
      const other = (await findConnection(OTHER_SHOP))!;
      const theirTier = await addTier(other.merchantId, "Theirs", "0", "3", 0);
      const theirs = await addBuyer({ c: other, tierId: theirTier.id });

      for (const fields of [{ intent: "lock", tierId: gold.id }, { intent: "lock", tierId: theirTier.id }, { intent: "automatic" }] as Record<string, string>[]) {
        expect(await thrown(actOnPanel(theirs.id, fields))).toEqual({ status: 404 });
      }
      expect(await thrown(actOnPanel("not-a-buyer", { intent: "automatic" }))).toEqual({ status: 404 });
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ lockedTierId: null, tierId: theirTier.id });
    });

    // A21-F5: the action checks the buyer is the store's with one light read, not the whole panel
    it("checks the buyer without reading their panel", async () => {
      const buyer = await addBuyer({ tierId: bronze.id });
      const erased = await addBuyer({ externalId: null });
      // The panel's reads, made to fail: the action must not need them
      const delegates = [prisma.ledgerEntry, prisma.order] as unknown as Array<Record<string, (...args: unknown[]) => Promise<unknown>>>;
      const originals = delegates.map((delegate) => delegate.findMany);
      for (const delegate of delegates) delegate.findMany = async () => Promise.reject(new Error("the action read the panel"));
      try {
        expect(await actOnPanel(buyer.id, { intent: "lock", tierId: gold.id })).toEqual({ ok: true });
        expect(await thrown(actOnPanel(erased.id, { intent: "automatic" }))).toEqual({ status: 404 });
      } finally {
        delegates.forEach((delegate, i) => (delegate.findMany = originals[i]));
      }
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: buyer.id } })).toMatchObject({ lockedTierId: gold.id });
    });

    it("refuses a tier that isn't the merchant's, or an unknown action", async () => {
      const buyer = await addBuyer({ tierId: bronze.id });
      await ensureMerchant({ shop: OTHER_SHOP, name: "Other", currency: "GBP", timezone: "Europe/London" });
      const theirTier = await addTier((await findConnection(OTHER_SHOP))!.merchantId, "Theirs", "0", "3", 0);

      for (const tierId of [theirTier.id, "00000000-0000-4000-8000-000000000000", "gold"]) {
        expect(await actOnPanel(buyer.id, { intent: "lock", tierId })).toEqual({ ok: false, error: "This tier is no longer there. Reload the page." });
      }
      // BOUNDARY-6: a lock that names no tier is no lock at all
      for (const fields of [{ intent: "lock", tierId: "" }, { intent: "lock" }] as Record<string, string>[]) {
        expect(await actOnPanel(buyer.id, fields), JSON.stringify(fields)).toEqual({ ok: false, error: "Unknown action.", status: 400 });
      }
      expect(await actOnPanel(buyer.id, { intent: "promote" })).toMatchObject({ ok: false, status: 400 });
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: buyer.id } })).toMatchObject({ lockedTierId: null, tierId: bronze.id });
    });
  });
});
