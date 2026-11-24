import { Decimal } from "decimal.js";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Home's loader, with each read it makes replaced by one the test answers by
 * hand, so the test sees which reads are under way together (Built for
 * Shopify 2.1.1: the reads that don't wait on each other run together). What
 * the reads return, and how the page words it, is the Postgres suite's.
 */

vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));
vi.mock("~/shopify.server", () => ({ authenticate: {}, unauthenticated: {} }));
vi.mock("~/admin/require-merchant.server", () => ({ requireMerchant: vi.fn() }));
vi.mock("~/lib/stats.server", () => ({ homeStats: vi.fn(), homeState: vi.fn() }));
vi.mock("~/shopify/names.server", () => ({ customerNames: vi.fn() }));
vi.mock("~/shopify/shop-checks.server", () => ({ storeCreditSpendProblems: vi.fn() }));
vi.mock("~/shopify/bulk-import.server", () => ({ pollImport: vi.fn() }));

const { loader } = await import("~/routes/app._index");
const { requireMerchant } = await import("~/admin/require-merchant.server");
const { homeState, homeStats } = await import("~/lib/stats.server");
const { customerNames } = await import("~/shopify/names.server");
const { storeCreditSpendProblems } = await import("~/shopify/shop-checks.server");
const { pollImport } = await import("~/shopify/bulk-import.server");

/** A promise the test settles by hand. */
function later<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const conn = { connectionId: "c1", merchantId: "m1", shop: "loader.myshopify.com", running: true, currency: "GBP", timezone: "Europe/London" };
const stats = {
  cashbackGiven: new Decimal(0),
  creditSpent: new Decimal(0),
  cameBack: 0,
  daily: [],
  recent: [
    { orderId: "o1", orderName: "#1001", customerId: "gid://shopify/Customer/1", tierName: "Everyone", ratePercent: null, kind: "cashback", amount: new Decimal("2.50"), currency: "GBP", payout: null },
  ],
  tiers: [],
  needsLook: 0,
  needsLookOrderId: null,
};
const state = (importState: string) => ({
  privacyDueAt: null,
  setupCompleted: false,
  importState,
  importError: null,
  importDismissed: false,
  importHorizonDays: 365,
  importedOrders: 0,
  importedBuyers: 0,
  placing: false,
  reviewDue: false,
});

const load = () => loader({ request: new Request("https://test.example.com/app"), params: {}, context: {} } as never);
/** Let every promise that can move on do so. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Home's loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SHOPIFY_API_KEY;
  });

  it("reads the numbers, the store credit check and the setup state together, and the buyers' names as soon as the numbers name them", async () => {
    process.env.SHOPIFY_API_KEY = "k1";
    vi.mocked(requireMerchant).mockResolvedValue({ admin: {}, session: {}, conn } as never);
    const numbers = later<typeof stats>();
    const setup = later<ReturnType<typeof state>>();
    vi.mocked(homeStats).mockReturnValue(numbers.promise as never);
    vi.mocked(homeState).mockReturnValue(setup.promise as never);
    vi.mocked(storeCreditSpendProblems).mockResolvedValue({ state: "ok" } as never);
    vi.mocked(customerNames).mockResolvedValue(new Map([["gid://shopify/Customer/1", "Sam K."]]) as never);

    const loaded = load();
    await settle();
    // All three asked before any has answered
    expect([homeStats, storeCreditSpendProblems, homeState].map((read) => vi.mocked(read).mock.calls.length)).toEqual([1, 1, 1]);
    expect(customerNames).not.toHaveBeenCalled();

    numbers.resolve(stats);
    await settle();
    // The names don't wait for the setup state
    expect(customerNames).toHaveBeenCalledWith({}, ["gid://shopify/Customer/1"]);

    setup.resolve(state("done"));
    const data = (await loaded) as { stats: { recent: Array<{ buyer: string }> }; setup: { importState: string } };
    expect(data.stats.recent[0].buyer).toBe("Sam K.");
    expect(data.setup.importState).toBe("done");
    expect(pollImport).not.toHaveBeenCalled();
  });

  it("moves a running import on only once every read has answered, then reads the setup state again", async () => {
    process.env.SHOPIFY_API_KEY = "k1";
    vi.mocked(requireMerchant).mockResolvedValue({ admin: {}, session: {}, conn } as never);
    const names = later<Map<string, string>>();
    vi.mocked(homeStats).mockResolvedValue(stats as never);
    vi.mocked(homeState).mockResolvedValueOnce(state("running") as never).mockResolvedValueOnce(state("done") as never);
    vi.mocked(storeCreditSpendProblems).mockResolvedValue({ state: "ok" } as never);
    vi.mocked(customerNames).mockReturnValue(names.promise as never);
    vi.mocked(pollImport).mockResolvedValue(undefined as never);

    const loaded = load();
    await settle();
    expect(pollImport).not.toHaveBeenCalled();

    names.resolve(new Map([["gid://shopify/Customer/1", "Sam K."]]));
    const data = (await loaded) as { setup: { importState: string } };
    expect(pollImport).toHaveBeenCalledTimes(1);
    expect(homeState).toHaveBeenCalledTimes(2);
    expect(data.setup.importState).toBe("done");
  });
});
