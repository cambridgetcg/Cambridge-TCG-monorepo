/**
 * The past-orders import on Shopify (spec 6.5): one bulk operation reads the
 * orders created in the 12 months before install (60 days when Shopify
 * hasn't granted read_all_orders), and its JSONL file is written in chunks
 * through ingestImportedOrders. The import is polled, not webhook-driven
 * (plan Decision 13): Home polls it while it runs, and the hourly job is the
 * backstop (pollRunningImports).
 *
 * The connection row carries its state: `importState` (not_started →
 * running → done, or failed), the bulk operation's id, the cursor (how many
 * of the file's orders are written), the horizon, the attempts and the last
 * error. Every step is conditional on the row as it was read, so two polls at
 * once (Home and the hourly job) never both move it; the orders themselves
 * are idempotent by their natural key.
 *
 * Bulk limits shape what is read (graphql.ts, RewardsBulkOrderNodes): the
 * node has no refunds, so it is read with "quantities" (Ruling 25), and a
 * refund of money with no items made before the import still counts as spend.
 */
import prisma from "~/db.server";
import { ingestImportedOrders } from "~/lib/import.server";
import { findConnection } from "~/lib/merchant.server";
import type { OrderFacts } from "~/lib/order-facts";
import { runTierPass } from "~/lib/tiers.server";
import { askShopify } from "./ask.server";
import { type GraphqlClient, RewardsAccessScopes, RewardsBulkOrderNodes, RewardsBulkOrders, RewardsBulkStatus } from "./graphql";
import { factsFromOrderNode } from "./order-source.server";

/** How far back the import reads with read_all_orders: the 12 months before install. */
export const IMPORT_HORIZON_DAYS = 365;
/** How far back Shopify lets an app read orders without read_all_orders. */
export const SHORT_HORIZON_DAYS = 60;
/** Orders written between two saves of the cursor. */
export const IMPORT_CHUNK = 500;
/** Times a bulk query Shopify failed, cancelled or expired is started again. */
export const MAX_IMPORT_RESTARTS = 3;
/** The longest one Shopify call of the import waits (startImport runs inside an app open). */
const CALL_TIMEOUT_MS = 5000;
/** A running import with no operation id has lost its start once it has waited this long. */
const START_GRACE_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shopify's bulk file can't be read as orders and their line items. */
export class BulkFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulkFileError";
  }
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : null;
}

const messageOf = (error: unknown) =>
  error instanceof Response ? `HTTP ${error.status}` : error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** The field of its parent each kind of child line goes in (the only nested connection is the order's line items). */
const CHILD_FIELDS: Record<string, string> = { LineItem: "lineItems" };
const GID_TYPE = /^gid:\/\/shopify\/([A-Za-z]+)\//;

/**
 * The order nodes of a bulk file, in the file's order: each line with no
 * `__parentId` is an order, and each line item line (which Shopify writes
 * somewhere after its order) is moved into its order's `lineItems.nodes`
 * without its `__parentId`, the shape RewardsOrderFacts's node has. Blank
 * lines are skipped. Throws BulkFileError, naming the line number only (never
 * its text), on a line that isn't a JSON object with an id, a child whose
 * order isn't above it, or a child that isn't a line item.
 */
export function parseBulkLines(lines: string[]): unknown[] {
  const orders: Rec[] = [];
  const byId = new Map<string, Rec>();
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    const where = `The bulk file's line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new BulkFileError(`${where} is not JSON`);
    }
    const record = asRecord(value);
    if (!record || typeof record.id !== "string") throw new BulkFileError(`${where} is not an object with an id`);
    const { __parentId: parentId, ...node } = record;
    const id = record.id;
    if (parentId === undefined) {
      const order = { ...node, lineItems: { nodes: [] as unknown[] } };
      orders.push(order);
      byId.set(id, order);
      return;
    }
    const parent = typeof parentId === "string" ? byId.get(parentId) : undefined;
    if (!parent) throw new BulkFileError(`${where} belongs to an order that isn't above it`);
    const field = CHILD_FIELDS[GID_TYPE.exec(id)?.[1] ?? ""];
    if (!field) throw new BulkFileError(`${where} is not a line item`);
    (parent[field] as { nodes: unknown[] }).nodes.push(node);
  });
  return orders;
}

/** One call's `data`; throws on GraphQL errors or an answer with no data. */
async function ask(admin: GraphqlClient, query: string, variables: Record<string, unknown>, timeoutMs: number): Promise<Rec> {
  const body = asRecord(await askShopify(admin, query, variables, timeoutMs));
  if (body?.errors) {
    const first = Array.isArray(body.errors) ? asRecord(body.errors[0])?.message : undefined;
    throw new Error(`Shopify answered with errors: ${typeof first === "string" ? first : "unknown error"}`);
  }
  const data = asRecord(body?.data);
  if (!data) throw new Error("Shopify answered with no data");
  return data;
}

/** The handles of the access scopes Shopify has granted the app. */
async function grantedScopes(admin: GraphqlClient, timeoutMs: number): Promise<Set<string>> {
  const installation = asRecord((await ask(admin, RewardsAccessScopes, {}, timeoutMs)).currentAppInstallation);
  const scopes = installation?.accessScopes;
  if (!Array.isArray(scopes)) throw new Error("RewardsAccessScopes answered without the app's scopes");
  return new Set(scopes.map((scope) => asRecord(scope)?.handle).filter((handle): handle is string => typeof handle === "string"));
}

/**
 * Starts the bulk query of a running import whose operation id is empty,
 * and stores the id and horizon. A failure is stored as the import's error
 * and thrown; the import then waits START_GRACE_MS and is started again by a
 * poll, as one more attempt.
 */
async function launch(admin: GraphqlClient, connectionId: string, installedAt: Date, timeoutMs: number): Promise<void> {
  const waiting = { id: connectionId, importState: "running" as const, importOperationId: null };
  try {
    const horizonDays = (await grantedScopes(admin, timeoutMs)).has("read_all_orders") ? IMPORT_HORIZON_DAYS : SHORT_HORIZON_DAYS;
    const from = new Date(installedAt.getTime() - horizonDays * DAY_MS);
    const search = `created_at:>='${from.toISOString()}' AND created_at:<'${installedAt.toISOString()}'`;
    const payload = asRecord((await ask(admin, RewardsBulkOrders, { query: RewardsBulkOrderNodes(search) }, timeoutMs)).bulkOperationRunQuery);
    const refusal = Array.isArray(payload?.userErrors) ? asRecord(payload.userErrors[0]) : null;
    if (refusal) throw new Error(`Shopify refused the bulk query: ${String(refusal.code ?? "no code")}: ${String(refusal.message ?? "")}`);
    const operationId = asRecord(payload?.bulkOperation)?.id;
    if (typeof operationId !== "string" || operationId === "") throw new Error("RewardsBulkOrders answered without an operation id");
    await prisma.connection.updateMany({ where: waiting, data: { importOperationId: operationId, importHorizonDays: horizonDays } });
  } catch (error) {
    await prisma.connection.updateMany({ where: waiting, data: { importError: messageOf(error).slice(0, 500) } });
    throw error;
  }
}

/**
 * Start the past-orders import of a connection whose import has not
 * started, reading the `installedAt` boundary (orders created before it;
 * Decision 21). The claim (not_started → running) comes first and is
 * conditional, so of any number of app opens only one starts it. Throws when
 * Shopify can't start it; the import is then running with no operation, and
 * a later poll starts it again.
 */
export async function startImport(admin: GraphqlClient, connectionId: string, installedAt: Date): Promise<void> {
  const { count } = await prisma.connection.updateMany({
    where: { id: connectionId, importState: "not_started" },
    data: { importState: "running", importOperationId: null, importCursor: 0, importAttempts: 1, importedCount: 0, importError: null },
  });
  if (count === 0) return;
  await launch(admin, connectionId, installedAt, CALL_TIMEOUT_MS);
}

type ImportRow = {
  id: string;
  externalAccountId: string;
  installedAt: Date;
  importState: "not_started" | "running" | "done" | "failed";
  importOperationId: string | null;
  importCursor: number;
  importAttempts: number;
  importError: string | null;
  tierPassRequestedAt: Date | null;
  updatedAt: Date;
};

/**
 * Start the bulk query again (`reason` is why), or, after MAX_IMPORT_RESTARTS
 * restarts, end the import as failed with `reason` as its error. Conditional
 * on the operation and attempts as read, so two polls restart it once.
 */
async function restart(admin: GraphqlClient, row: ImportRow, reason: string, timeoutMs: number): Promise<"running" | "failed"> {
  const asRead = { id: row.id, importState: "running" as const, importOperationId: row.importOperationId, importAttempts: row.importAttempts };
  if (row.importAttempts >= 1 + MAX_IMPORT_RESTARTS) {
    const { count } = await prisma.connection.updateMany({ where: asRead, data: { importState: "failed", importError: reason } });
    if (count === 1) console.error(`[import] The past-orders import of ${row.externalAccountId} failed: ${reason}`);
    return count === 1 ? "failed" : "running";
  }
  const { count } = await prisma.connection.updateMany({
    where: asRead,
    data: { importOperationId: null, importCursor: 0, importAttempts: { increment: 1 }, importError: reason },
  });
  if (count === 0) return "running";
  try {
    await launch(admin, row.id, row.installedAt, timeoutMs);
  } catch (error) {
    console.error(`[import] Could not start the past-orders import of ${row.externalAccountId} again: ${messageOf(error)}`);
  }
  return "running";
}

/** The bulk file's lines; throws when it can't be fetched (the next poll fetches it again). */
async function download(url: string, timeoutMs: number): Promise<string[]> {
  if (!url.startsWith("https://")) throw new Error("The bulk file's address is not https");
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`The bulk file answered HTTP ${response.status}`);
  return (await response.text()).split("\n");
}

/** An order node's facts, or none when Shopify's node can't be read: logged by the order id, so one bad order never stops the import. */
function readable(node: unknown, shopCurrency: string, shop: string): OrderFacts[] {
  try {
    return [factsFromOrderNode(node, shopCurrency, "quantities")];
  } catch (error) {
    const id = asRecord(node)?.id;
    console.error(`[import] Could not read imported order ${typeof id === "string" ? id : "(no id)"} for ${shop}: ${messageOf(error)}`);
    return [];
  }
}

/**
 * Follow one connection's import until `deadline` (a Date.now() time):
 * - not started: start it (`running`);
 * - Shopify still running the query, or out of time: `running`;
 * - COMPLETED: fetch the file and, from `importCursor`, write its orders
 *   IMPORT_CHUNK at a time, saving the cursor after each chunk and stopping at
 *   the deadline; once all are written, place the buyers in tiers
 *   (runTierPass, resolving everyone resolved before now), set `done` and
 *   `importedCount`. A tier pass the deadline cuts short is left to the
 *   nightly pass (`tierPassRequestedAt`).
 * - FAILED, CANCELED or EXPIRED (or a file that can't be read): start it
 *   again, up to MAX_IMPORT_RESTARTS times, then `failed` with the error.
 * Throws when Shopify or the file can't be reached; the next poll tries again.
 */
export async function pollImport(admin: GraphqlClient, connectionId: string, deadline: number): Promise<"running" | "done" | "failed"> {
  const row: ImportRow = await prisma.connection.findUniqueOrThrow({
    where: { id: connectionId },
    select: {
      id: true,
      externalAccountId: true,
      installedAt: true,
      importState: true,
      importOperationId: true,
      importCursor: true,
      importAttempts: true,
      importError: true,
      tierPassRequestedAt: true,
      updatedAt: true,
    },
  });
  if (row.importState === "done" || row.importState === "failed") return row.importState;
  if (Date.now() >= deadline) return "running";
  const timeout = () => Math.max(1, Math.min(CALL_TIMEOUT_MS, deadline - Date.now()));
  if (row.importState === "not_started") {
    await startImport(admin, connectionId, row.installedAt);
    return "running";
  }

  if (row.importOperationId === null) {
    // A start in flight, or one that failed or was cut off before its id was stored
    if (Date.now() - row.updatedAt.getTime() < START_GRACE_MS) return "running";
    return restart(admin, row, row.importError ?? "The bulk query could not be started", timeout());
  }
  const operation = asRecord((await ask(admin, RewardsBulkStatus, { id: row.importOperationId }, timeout())).bulkOperation);
  if (!operation) return restart(admin, row, "Shopify has no record of the bulk query", timeout());
  const status = String(operation.status);
  if (status === "FAILED" || status === "CANCELED" || status === "EXPIRED") {
    const code = typeof operation.errorCode === "string" ? ` (${operation.errorCode})` : "";
    return restart(admin, row, `Shopify's bulk query ended ${status}${code}`, timeout());
  }
  if (status !== "COMPLETED") return "running";

  // An uninstalled store's import waits for its reinstall
  const conn = await findConnection(row.externalAccountId);
  if (!conn || conn.connectionId !== connectionId) return "running";
  let nodes: unknown[];
  try {
    nodes = typeof operation.url === "string" ? parseBulkLines(await download(operation.url, Math.max(1, deadline - Date.now()))) : [];
  } catch (error) {
    if (error instanceof BulkFileError) return restart(admin, row, error.message, timeout());
    throw error;
  }

  const current = { id: connectionId, importState: "running" as const, importOperationId: row.importOperationId };
  let cursor = row.importCursor;
  while (cursor < nodes.length) {
    if (Date.now() >= deadline) return "running";
    const chunk = nodes.slice(cursor, cursor + IMPORT_CHUNK);
    await ingestImportedOrders(conn, chunk.flatMap((node) => readable(node, conn.currency, conn.shop)));
    const next = cursor + chunk.length;
    const { count } = await prisma.connection.updateMany({ where: { ...current, importCursor: cursor }, data: { importCursor: next } });
    // Another poll is writing the same file
    if (count === 0) return "running";
    cursor = next;
  }
  if (Date.now() >= deadline) return "running";

  const resolvedBefore = new Date();
  const pass = await runTierPass(connectionId, { deadline, resolvedBefore });
  const unfinished = !pass.complete || pass.errors > 0;
  const importedCount = await prisma.order.count({ where: { connectionId, source: "import" } });
  const { count } = await prisma.connection.updateMany({
    where: current,
    data: {
      importState: "done",
      importedCount,
      importError: null,
      ...(unfinished
        ? { tierPassRequestedAt: new Date(Math.max(resolvedBefore.getTime(), row.tierPassRequestedAt?.getTime() ?? 0)) }
        : {}),
    },
  });
  return count === 1 ? "done" : "running";
}

/**
 * The hourly backstop: poll every active connection whose import is running,
 * through its offline session (unauthenticated.admin, which refreshes an
 * expiring token), until `deadline`. One store failing is logged and never
 * stops the others. Returns how many imports it polled.
 */
export async function pollRunningImports(deadline: number): Promise<number> {
  const running = await prisma.connection.findMany({
    where: { status: "active", importState: "running" },
    orderBy: { id: "asc" },
    select: { id: true, externalAccountId: true },
  });
  if (running.length === 0) return 0;
  // Loaded here, not at the top: ~/shopify.server imports install.server,
  // which imports this module, and builds the app (checking the Session
  // table) as it loads.
  const { unauthenticated } = await import("../shopify.server");
  let polled = 0;
  for (const connection of running) {
    if (Date.now() >= deadline) break;
    const shop = connection.externalAccountId;
    try {
      const { admin } = await unauthenticated.admin(shop);
      await pollImport(admin, connection.id, deadline);
      polled++;
    } catch (error) {
      console.error(`[import] Could not poll the past-orders import of ${shop}: ${messageOf(error)}`);
    }
  }
  return polled;
}
