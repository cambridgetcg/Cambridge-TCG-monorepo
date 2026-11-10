import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A past-orders import whose start was lost (RP-25): running, with no bulk
 * operation id, because the first open's call to Shopify failed or was cut
 * off. Its 5-minute grace runs from its own launch time, so the hourly
 * sweep's write to the row (lastSweptAt) seconds before the import poll
 * never holds it back, and a relaunch that fails is thrown, in both of the
 * shapes Shopify's failures arrive in.
 *
 * The connection row is held in memory: updateMany honours its `where` and
 * `{ increment }`, and every write moves updatedAt, as Prisma's @updatedAt does.
 */
const { row } = vi.hoisted(() => ({ row: {} as Record<string, unknown> }));

vi.mock("~/db.server", () => {
  const matches = (where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => row[key] === value);
  const apply = (data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      const increment = typeof value === "object" && value !== null && "increment" in value ? (value as { increment: number }).increment : null;
      row[key] = increment === null ? value : (row[key] as number) + increment;
    }
    row.updatedAt = new Date();
  };
  return {
    default: {
      connection: {
        findUniqueOrThrow: async () => ({ ...row }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          apply(data);
          return { ...row };
        },
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (!matches(where)) return { count: 0 };
          apply(data);
          return { count: 1 };
        },
      },
    },
  };
});

import prisma from "~/db.server";
import { MAX_IMPORT_RESTARTS, pollImport, startImport } from "~/shopify/bulk-import.server";
import type { GraphqlClient } from "~/shopify/graphql";

const MIN = 60_000;
const T0 = Date.parse("2026-11-09T10:00:00Z");
const ID = "connection-1";
const SHOP = "lost-start.myshopify.com";

/** Shopify failing as the hourly job's client (unauthenticated.admin) reports it: a plain Error. */
const cronFailure = (): GraphqlClient => ({
  graphql: vi.fn(async () => {
    throw new Error("Received an error response (503 Service Unavailable) from Shopify");
  }),
});

/** Shopify failing as the embedded admin's client reports it: the library's handleClientError throws a Response. */
const homeFailure = (): GraphqlClient => ({
  graphql: vi.fn(async () => {
    throw new Response(null, { status: 503 });
  }),
});

/** Shopify starting each bulk query asked for; `asked` names the documents sent. */
function workingShopify() {
  const asked: string[] = [];
  const admin: GraphqlClient = {
    graphql: vi.fn(async (query: string) => {
      const name = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "(unnamed)";
      asked.push(name);
      const body =
        name === "RewardsAccessScopes"
          ? { data: { currentAppInstallation: { accessScopes: [{ handle: "read_orders" }, { handle: "read_all_orders" }] } } }
          : { data: { bulkOperationRunQuery: { bulkOperation: { id: `gid://shopify/BulkOperation/${asked.length}` }, userErrors: [] } } };
      return { json: async () => body };
    }),
  };
  return { admin, asked };
}

/** At T0 the first open claims the import and Shopify fails its start: running, with no operation id. */
async function lostStart(failure: () => GraphqlClient = cronFailure) {
  vi.setSystemTime(T0);
  for (const key of Object.keys(row)) delete row[key];
  Object.assign(row, {
    id: ID,
    externalAccountId: SHOP,
    installedAt: new Date(T0 - MIN),
    importState: "not_started",
    importOperationId: null,
    importCursor: 0,
    importAttempts: 0,
    importError: null,
    importFileRefusals: 0,
    importLaunchedAt: null,
    tierPassRequestedAt: null,
    updatedAt: new Date(T0),
  });
  await expect(startImport(failure(), ID, row.installedAt as Date)).rejects.toBeDefined();
  expect(row).toMatchObject({ importState: "running", importOperationId: null, importAttempts: 1 });
}

/** The hourly payout sweep's write to the same row (payout-check.server.ts), just before it polls imports. */
const sweepStamp = () => prisma.connection.update({ where: { id: ID }, data: { lastSweptAt: new Date() } });

const at = (ms: number) => vi.setSystemTime(ms);
const poll = (admin: GraphqlClient) => pollImport(admin, ID, Date.now() + MIN);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a lost import start", () => {
  it("is stamped with its launch time by the claim", async () => {
    await lostStart();

    expect(row.importLaunchedAt).toEqual(new Date(T0));
    expect(row.importError).toContain("503 Service Unavailable");
  });

  it("is restarted at the hourly poll although the sweep stamped the row seconds before", async () => {
    await lostStart();
    const { admin, asked } = workingShopify();
    at(T0 + 30 * MIN);
    await sweepStamp();
    at(T0 + 30 * MIN + 20_000);

    await expect(poll(admin)).resolves.toBe("running");

    expect(asked).toEqual(["RewardsAccessScopes", "RewardsBulkOrders"]);
    expect(row).toMatchObject({ importOperationId: "gid://shopify/BulkOperation/2", importAttempts: 2 });
    expect(row.importLaunchedAt).toEqual(new Date(T0 + 30 * MIN + 20_000));
  });

  it("is left alone inside its grace, whatever else wrote the row, and restarted once the grace is over", async () => {
    await lostStart();
    const { admin, asked } = workingShopify();
    at(T0 + 4 * MIN + 50_000);
    await sweepStamp();

    // The start may still be in flight
    at(T0 + 5 * MIN - 1);
    await expect(poll(admin)).resolves.toBe("running");
    expect(asked).toEqual([]);
    expect(row).toMatchObject({ importOperationId: null, importAttempts: 1 });

    // Exactly 5 minutes after the launch, ten seconds after the sweep's write
    at(T0 + 5 * MIN);
    await expect(poll(admin)).resolves.toBe("running");
    expect(asked).toEqual(["RewardsAccessScopes", "RewardsBulkOrders"]);
    expect(row).toMatchObject({ importOperationId: "gid://shopify/BulkOperation/2", importAttempts: 2 });
  });

  it("throws when the relaunch fails, leaving it running with no operation and a fresh grace", async () => {
    await lostStart();
    at(T0 + 30 * MIN);

    await expect(poll(cronFailure())).rejects.toThrow(/^The bulk query could not be started again: Error: .*503 Service Unavailable/);

    expect(row).toMatchObject({ importState: "running", importOperationId: null, importAttempts: 2 });
    expect(row.importError).toContain("503 Service Unavailable");
    expect(row.importLaunchedAt).toEqual(new Date(T0 + 30 * MIN));
    // The next poll inside the new grace waits
    const { admin, asked } = workingShopify();
    at(T0 + 33 * MIN);
    await expect(poll(admin)).resolves.toBe("running");
    expect(asked).toEqual([]);
  });

  // Option (ii): a Response is wrapped too, so a Home-triggered relaunch that
  // Shopify answers 5xx or 429 is logged by Home, never thrown from its loader.
  it("wraps a Shopify HTTP error from the embedded admin, so Home is never thrown a Response", async () => {
    await lostStart(homeFailure);
    at(T0 + 30 * MIN);

    const failure = await poll(homeFailure()).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(Response);
    expect((failure as Error).message).toBe("The bulk query could not be started again: HTTP 503");
    expect((failure as Error).cause).toBeInstanceOf(Response);
    expect(row).toMatchObject({ importState: "running", importOperationId: null, importAttempts: 2, importError: "HTTP 503" });
  });

  it("is restarted at once when it has no launch time (claimed by an older build)", async () => {
    await lostStart();
    row.importLaunchedAt = null;
    const { admin, asked } = workingShopify();
    at(T0 + MIN);
    await sweepStamp();

    await expect(poll(admin)).resolves.toBe("running");

    expect(asked).toEqual(["RewardsAccessScopes", "RewardsBulkOrders"]);
    expect(row).toMatchObject({ importOperationId: "gid://shopify/BulkOperation/2", importAttempts: 2 });
  });

  it("ends failed once the restarts are used up, each failed relaunch thrown", async () => {
    await lostStart();
    for (let hour = 1; hour <= MAX_IMPORT_RESTARTS; hour++) {
      at(T0 + hour * 60 * MIN);
      await sweepStamp();
      await expect(poll(cronFailure())).rejects.toThrow(/could not be started again/);
      expect(row).toMatchObject({ importState: "running", importAttempts: 1 + hour });
    }

    at(T0 + (MAX_IMPORT_RESTARTS + 1) * 60 * MIN);
    await sweepStamp();
    await expect(poll(cronFailure())).resolves.toBe("failed");

    expect(row).toMatchObject({ importState: "failed", importAttempts: 1 + MAX_IMPORT_RESTARTS });
    expect(row.importError).toContain("503 Service Unavailable");
  });
});
