import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * customers/data_request and customers/redact against the schema (RP-25).
 * shop/redact's erasure is derived from the data model and guarded by
 * merchantErasureOrder's test (compliance.postgres.test.ts); the buyer's two
 * webhooks work from hand-written lists. This holds those lists to the
 * schema: every model holding a buyer's data is in BUYER_DATA, which says how
 * the data report (buildPrivacyReport) includes it and what customers/redact
 * (redactCustomer) does to it, and every other model is in NOT_BUYER with the
 * reason it holds none. Both functions are run against a recording stand-in
 * for the app's client, which also checks that each of their calls on a
 * buyer model is scoped to the one buyer and store.
 */

type Model = (typeof Prisma.dmmf.datamodel.models)[number];
type Field = Model["fields"][number];
const SCHEMA: readonly Model[] = Prisma.dmmf.datamodel.models;

type Reasons = Record<string, string>;
type Redact =
  | { blanks: string[]; keeps?: Reasons } // the row stays, these columns are nulled
  | { deletes: string } // the buyer's rows go
  | { closes: string; keeps: Reasons } // open rows are closed, the rows stay
  | { keeps: Reasons }; // the rows stay as they are
type Handling = {
  /** What of the buyer the model holds. */
  holds: string;
  /** "read": a row of it is in the data report; otherwise why it is left out. */
  report: "read" | { exempt: string };
  redact: Redact;
};

const PSEUDONYMOUS = "Shopify's id for the store's own record, kept on a row redact unlinks from the buyer (spec 7)";
const ISO_CODE = "an ISO 4217 code";

const BUYER_DATA: Record<string, Handling> = {
  Customer: {
    holds: "the buyer's Shopify customer id, their tier and the merchant's lock on it",
    report: "read",
    redact: { blanks: ["externalCustomerId", "lockedTierId"] },
  },
  Order: {
    holds: "the buyer's orders: amounts, dates and Shopify's order ids",
    report: "read",
    redact: {
      keeps: {
        externalOrderId: PSEUDONYMOUS,
        name: "Shopify's order name, such as #1001; " + PSEUDONYMOUS,
        currency: ISO_CODE,
        importRefundIds: "Shopify's refund ids; " + PSEUDONYMOUS,
      },
    },
  },
  Refund: {
    holds: "refunds of the buyer's orders (in the report under their order)",
    report: "read",
    redact: { keeps: { externalRefundId: PSEUDONYMOUS } },
  },
  LedgerEntry: {
    holds: "what was issued to the buyer and taken back",
    report: "read",
    redact: {
      keeps: {
        currency: ISO_CODE,
        tierName: "the merchant's name for a tier",
        idempotencyKey: "cashback:<order id>, reversal:<connection id>:<Shopify refund id>, shortfall: or close:<payout id>; " + PSEUDONYMOUS,
      },
    },
  },
  Payout: {
    holds: "store credit sent to the buyer or taken from them",
    report: "read",
    redact: {
      closes: "pending, held and needs_look payouts are closed without sending (CLOSED_AT_ERASURE)",
      keeps: {
        currency: ISO_CODE,
        externalTransactionId: "Shopify's store-credit transaction id; " + PSEUDONYMOUS,
        lastError:
          "error text from Shopify or the network, or the app's own (payouts.server.ts afterAnswer); redact overwrites it on the payouts it closes, and the buyer's other payouts keep it",
      },
    },
  },
  PrivacyRequest: {
    holds: "the buyer's data requests, by their Shopify customer id",
    report: "read",
    redact: { deletes: "the buyer's data requests go with them" },
  },
};

const NOT_BUYER: Record<string, string> = {
  Merchant: "the store's settings",
  Connection: "the store's install and import; Customer points at it, not the other way",
  Tier: "the merchant's ladder; Customer points at it, not the other way",
  Session: "the merchant's staff, not buyers; app/uninstalled and shop/redact delete it",
  CronLock: "the app's jobs",
  CronRun: "the app's jobs; errorMessage is a job's error text, the latest run per outcome",
};

// ---- the schema's buyer models, and what the tables leave out ----

const BUYER_KEYS = new Set(["customerId", "externalCustomerId"]);
const pointsAt = (field: Field, names: Set<string>) =>
  field.kind === "object" && (field.relationFromFields?.length ?? 0) > 0 && names.has(field.type);

/** Customer, and every model whose foreign key reaches it (through Order, Payout, ...), or that holds a buyer's id. */
function buyerModels(models: readonly Model[]): string[] {
  const found = new Set(["Customer"]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const model of models) {
      if (found.has(model.name)) continue;
      if (model.fields.some((f) => pointsAt(f, found) || (f.kind === "scalar" && BUYER_KEYS.has(f.name)))) {
        found.add(model.name);
        grew = true;
      }
    }
  }
  return [...found].sort();
}

/**
 * The derived buyer models must be in BUYER_DATA (not misfiled under
 * NOT_BUYER), and every model must be in one table. BUYER_DATA may hold more
 * than the derivation finds: a table Customer points at, such as a
 * membership, is the authors' call.
 */
function unnamed(models: readonly Model[], buyerData = BUYER_DATA, notBuyer = NOT_BUYER) {
  const buyer = buyerModels(models);
  return {
    buyer: buyer.filter((name) => !(name in buyerData)),
    unclassified: models
      .map((m) => m.name)
      .filter((name) => !(name in buyerData) && !(name in notBuyer))
      .sort(),
    misfiled: buyer.filter((name) => name in notBuyer),
  };
}

/** Table entries for a model the schema no longer has, or in both tables. */
function stale(models: readonly Model[], buyerData = BUYER_DATA, notBuyer = NOT_BUYER): string[] {
  const names = new Set(models.map((m) => m.name));
  const listed = new Set([...Object.keys(buyerData), ...Object.keys(notBuyer)]);
  return [...listed].filter((n) => !names.has(n) || (n in buyerData && n in notBuyer)).sort();
}

const columnsOf = (redact: Redact) => ({
  blanks: "blanks" in redact ? redact.blanks : [],
  keeps: "keeps" in redact && redact.keeps ? Object.keys(redact.keeps) : [],
});

/** Free text, an external id, or raw data: a column that could name or identify a buyer. Enums are kind "enum"; String[] counts. */
const canIdentify = (f: Field) =>
  f.kind === "scalar" && ((f.type === "String" && f.nativeType?.[0] !== "Uuid") || ["BigInt", "Json", "Bytes"].includes(f.type));

/** Identifying columns of a buyer model whose rows stay, neither blanked nor kept for a reason. */
function unreviewedColumns(models: readonly Model[], buyerData = BUYER_DATA): string[] {
  return models.flatMap((model) => {
    const handling = buyerData[model.name];
    if (!handling || "deletes" in handling.redact) return [];
    const { blanks, keeps } = columnsOf(handling.redact);
    const reviewed = new Set([...blanks, ...keeps]);
    return model.fields.filter((f) => canIdentify(f) && !reviewed.has(f.name)).map((f) => `${model.name}.${f.name}`);
  });
}

/** blanks and keeps entries naming no field of their model. */
function staleColumns(models: readonly Model[], buyerData = BUYER_DATA): string[] {
  return models.flatMap((model) => {
    const handling = buyerData[model.name];
    if (!handling) return [];
    const { blanks, keeps } = columnsOf(handling.redact);
    return [...blanks, ...keeps].filter((name) => !model.fields.some((f) => f.name === name)).map((name) => `${model.name}.${name}`);
  });
}

// ---- a recording stand-in for the app's client ----

type Args = { where?: unknown; include?: Record<string, unknown>; select?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
type Call = { model: string; method: string; args: Args };
type Delegate = Record<string, (args?: Args) => Promise<unknown>>;

const calls: Call[] = [];
const overrides = new Map<string, (args: Args) => unknown>();
const keyOf = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
const marker = (model: string) => `row-of-${model}`;

const REQUEST = "00000000-0000-4000-8000-000000000001";
const MERCHANT = "00000000-0000-4000-8000-0000000000aa";
const CONNECTION = "00000000-0000-4000-8000-0000000000bb";
const BUYER = "buyer-ext-1001";

// What buildPrivacyReport checks on the request it finds: this store's, open, not expired.
const FIELDS: Record<string, Record<string, unknown>> = {
  PrivacyRequest: {
    merchantId: MERCHANT,
    connectionId: CONNECTION,
    externalCustomerId: BUYER,
    shopifyRequestId: "77",
    ordersRequested: [],
    status: "open",
    receivedAt: new Date(0),
    expiresAt: new Date("2999-01-01T00:00:00Z"),
  },
};

/** One row of the model, its id a marker, with a row of each relation the call includes or selects. */
function rowOf(model: string, args: Args): Record<string, unknown> {
  const row: Record<string, unknown> = { id: marker(model), ...(FIELDS[model] ?? {}) };
  const def = SCHEMA.find((m) => m.name === model)!;
  for (const [name, spec] of Object.entries({ ...(args?.include ?? {}), ...(args?.select ?? {}) })) {
    const field = def.fields.find((f) => f.name === name && f.kind === "object");
    if (!field || !spec) continue;
    const child = rowOf(field.type, spec === true ? undefined : (spec as Args));
    row[name] = field.isList ? [child] : child;
  }
  return row;
}

const client: Record<string, unknown> = new Proxy(
  {},
  {
    get: (_target, key: string) => {
      if (key === "$transaction") return (fn: (tx: unknown) => unknown) => fn(client);
      const model = SCHEMA.find((m) => keyOf(m.name) === key)?.name;
      if (!model) return undefined;
      return new Proxy(
        {},
        {
          get: (_delegate, method: string) => async (args: Args) => {
            calls.push({ model, method, args });
            const own = overrides.get(`${model}.${method}`);
            if (own) return own(args);
            if (method === "findMany") return [rowOf(model, args)];
            if (method.startsWith("find")) return rowOf(model, args);
            if (method === "count") return 0;
            return { count: 1 };
          },
        },
      );
    },
  },
);
const delegate = (model: string) => client[keyOf(model)] as Delegate;

vi.mock("~/db.server", () => ({ default: client, databaseSchema: "rewards" }));
const { buildPrivacyReport, redactCustomer } = await import("~/lib/erasure.server");

/** Every string inside a value, however deep. */
function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(stringsIn);
}

// A call is scoped when its where names the buyer (the request or their
// Shopify id) and the store, or names a buyer row the stand-in handed back:
// that row came from a call checked the same way.
const BUYER_TOKENS = new Set([REQUEST, BUYER]);
const STORE_TOKENS = new Set([MERCHANT, CONNECTION]);
const ROW_TOKENS = new Set(Object.keys(BUYER_DATA).map(marker));
function unscoped(recorded: readonly Call[]): string[] {
  return recorded
    .filter((call) => {
      if (!(call.model in BUYER_DATA)) return false;
      const where = stringsIn(call.args?.where);
      const scoped = where.some((s) => ROW_TOKENS.has(s)) || (where.some((s) => BUYER_TOKENS.has(s)) && where.some((s) => STORE_TOKENS.has(s)));
      return !scoped;
    })
    .map((call) => `${call.model}.${call.method}`);
}

const conn = { merchantId: MERCHANT, connectionId: CONNECTION } as Parameters<typeof redactCustomer>[0];

beforeEach(() => {
  calls.length = 0;
  overrides.clear();
});

describe("buyer data against the schema", () => {
  it("names every model: what holds a buyer's data, and why the rest holds none", () => {
    expect(unnamed(SCHEMA)).toEqual({ buyer: [], unclassified: [], misfiled: [] });
    expect(stale(SCHEMA)).toEqual([]);
  });

  it("catches a new table under a buyer table, however deep, and one that only knows the store", () => {
    const base = SCHEMA.find((m) => m.name === "CronRun")!;
    const fk = (name: string, type: string) => ({ ...base.fields[0], name, kind: "object", type, relationFromFields: ["merchantId", `${name}Id`] }) as Field;
    const referral = { ...base, name: "Referral", fields: [...base.fields, fk("customer", "Customer")] } as Model;
    const attempt = { ...base, name: "PayoutAttempt", fields: [...base.fields, fk("payout", "Payout")] } as Model;
    const invite = { ...base, name: "Invite", fields: [...base.fields] } as Model;

    expect(unnamed([...SCHEMA, referral, attempt, invite])).toEqual({
      buyer: ["PayoutAttempt", "Referral"],
      unclassified: ["Invite", "PayoutAttempt", "Referral"],
      misfiled: [],
    });
    expect(unnamed(SCHEMA, BUYER_DATA, { ...NOT_BUYER, Order: "misfiled" }).misfiled).toEqual(["Order"]);
  });

  it("lets BUYER_DATA hold a table Customer points at, and fails an entry for a table that is gone", () => {
    const base = SCHEMA.find((m) => m.name === "CronRun")!;
    const customer = SCHEMA.find((m) => m.name === "Customer")!;
    const toMembership = { ...base.fields[0], name: "membership", kind: "object", type: "Membership", relationFromFields: ["merchantId", "membershipId"] } as Field;
    const models = [
      ...SCHEMA.filter((m) => m.name !== "Customer"),
      { ...customer, fields: [...customer.fields, toMembership] } as Model,
      { ...base, name: "Membership", fields: [...base.fields] } as Model,
    ];
    const withMembership = { ...BUYER_DATA, Membership: { holds: "the buyer's membership", report: "read", redact: { keeps: {} } } satisfies Handling };

    // The foreign key points away from the buyer, so only the authors can say it holds their data.
    expect(buyerModels(models)).not.toContain("Membership");
    expect(unnamed(models, withMembership)).toEqual({ buyer: [], unclassified: [], misfiled: [] });
    expect(stale(models, withMembership)).toEqual([]);

    expect(stale(SCHEMA, { ...BUYER_DATA, RaffleEntry: withMembership.Membership })).toEqual(["RaffleEntry"]);
    expect(stale(SCHEMA, BUYER_DATA, { ...NOT_BUYER, Payout: "both" })).toEqual(["Payout"]);
  });

  it("every column that could identify a buyer is blanked by customers/redact or kept for a stated reason", () => {
    expect(unreviewedColumns(SCHEMA)).toEqual([]);
    expect(staleColumns(SCHEMA)).toEqual([]);

    const customer = SCHEMA.find((m) => m.name === "Customer")!;
    const email = { ...customer.fields.find((f) => f.name === "externalCustomerId")!, name: "email" };
    expect(unreviewedColumns([{ ...customer, fields: [...customer.fields, email] } as Model])).toEqual(["Customer.email"]);
    const payout = BUYER_DATA.Payout.redact as { closes: string; keeps: Reasons };
    const misspelt = { ...BUYER_DATA, Payout: { ...BUYER_DATA.Payout, redact: { ...payout, keeps: { ...payout.keeps, lastErorr: "typo" } } } };
    expect(staleColumns(SCHEMA, misspelt)).toEqual(["Payout.lastErorr"]);
  });

  it("the data report holds a row of every buyer model it reads, and reads only this buyer's rows", async () => {
    const report = await buildPrivacyReport(conn, REQUEST);

    expect(report).not.toBeNull();
    const values = new Set(stringsIn(JSON.parse(report!.json)));
    const missing = Object.entries(BUYER_DATA)
      .filter(([, handling]) => handling.report === "read")
      .map(([model]) => model)
      .filter((model) => !values.has(marker(model)));
    expect(missing).toEqual([]);
    expect(unscoped(calls)).toEqual([]);

    // A read of the store's whole ledger would put every buyer's in this download.
    await delegate("LedgerEntry").findMany({ where: { merchantId: MERCHANT, connectionId: CONNECTION } });
    expect(unscoped(calls)).toEqual(["LedgerEntry.findMany"]);
  });

  it("customers/redact does what BUYER_DATA says, to this buyer only", async () => {
    // No open payouts: lockPayout's raw SQL stays out of the stand-in (closing is covered in Postgres).
    overrides.set("Payout.findMany", () => []);

    await expect(redactCustomer(conn, BUYER)).resolves.toEqual({ found: true });

    for (const [model, { redact }] of Object.entries(BUYER_DATA)) {
      const mine = calls.filter((c) => c.model === model);
      if ("blanks" in redact) {
        const update = mine.find((c) => c.method === "update");
        for (const column of redact.blanks) expect(update?.args?.data?.[column], `${model}.${column}`).toBeNull();
      }
      if ("deletes" in redact) expect(mine.some((c) => c.method === "deleteMany"), model).toBe(true);
      if ("closes" in redact) {
        const byState = mine.some((c) => c.method === "findMany" && (c.args?.where as { state?: unknown } | undefined)?.state !== undefined);
        expect(byState, model).toBe(true);
      }
    }
    expect(unscoped(calls)).toEqual([]);

    // A delete of the store's data requests would take every buyer's.
    await delegate("PrivacyRequest").deleteMany({ where: { merchantId: MERCHANT } });
    expect(unscoped(calls)).toEqual(["PrivacyRequest.deleteMany"]);
  });
});
