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
 * are idempotent by their natural key. The file is read as a stream, one line
 * at a time (bulk-file.ts, Ruling 48), so it is never held as one string.
 *
 * Bulk limits shape what is read (graphql.ts, RewardsBulkOrderNodes): the
 * node has no refunds' items, so it is read with "quantities" (Ruling 25),
 * and a refund of money with no items that the file lists on its order
 * (made before the import, or while it ran but before Shopify read that
 * order) still counts as spend. It does list each order's refund ids, which the order keeps
 * (`importRefundIds`, Ruling 54): its quantities count those refunds, so
 * recording one later adds no spend again.
 */
import prisma from "~/db.server";
import { importStillWriting, ingestImportedOrders } from "~/lib/import.server";
import { type ConnectionContext, findConnection } from "~/lib/merchant.server";
import type { OrderFacts } from "~/lib/order-facts";
import { runTierPass } from "~/lib/tiers.server";
import { askShopify } from "./ask.server";
import { BulkFileError, streamBulkOrders } from "./bulk-file";
import { type GraphqlClient, RewardsAccessScopes, RewardsBulkOrderNodes, RewardsBulkOrders, RewardsBulkStatus } from "./graphql";
import { factsFromOrderNode } from "./order-source.server";
import { RenewalBusyError } from "./renewal-busy";

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
/**
 * A running import with no operation id has lost its start this long after
 * its launch was claimed (`importLaunchedAt`), whatever else has written the
 * row since: the hourly sweep stamps it seconds before it polls imports.
 */
const START_GRACE_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : null;
}

const messageOf = (error: unknown) =>
  error instanceof Response ? `HTTP ${error.status}` : error instanceof Error ? `${error.name}: ${error.message}` : String(error);

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
 * and thrown; the import then waits START_GRACE_MS from its claim's
 * `importLaunchedAt` and is started again by a poll, as one more attempt.
 */
async function launch(admin: GraphqlClient, connectionId: string, installedAt: Date, timeoutMs: number): Promise<void> {
  const waiting = { id: connectionId, importState: "running" as const, importOperationId: null };
  try {
    const horizonDays = (await grantedScopes(admin, timeoutMs)).has("read_all_orders") ? IMPORT_HORIZON_DAYS : SHORT_HORIZON_DAYS;
    const from = new Date(installedAt.getTime() - horizonDays * DAY_MS);
    const search = `created_at:>='${from.toISOString()}' AND created_at:<'${installedAt.toISOString()}'`;
    // If this call times out after Shopify started the query, that operation
    // is orphaned: a later poll starts another, using an attempt (A17-F8).
    // Harmless on 2026-10, which runs several bulk queries at once.
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
    data: {
      importState: "running",
      importOperationId: null,
      importCursor: 0,
      importAttempts: 1,
      importedCount: 0,
      importError: null,
      importFileRefusals: 0,
      importLaunchedAt: new Date(),
    },
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
  importFileRefusals: number;
  tierPassRequestedAt: Date | null;
  importLaunchedAt: Date | null;
};

/**
 * Start the bulk query again (`reason` is why), or, after MAX_IMPORT_RESTARTS
 * restarts, end the import as failed with `reason` as its error. Conditional
 * on the operation and attempts as read, so two polls restart it once.
 * Throws when the relaunch fails, after the claim: the import is running
 * with no operation, the claim's new grace stands, and launch has stored the
 * failure as its error. Every failure is wrapped in an Error, a thrown
 * Response (the embedded admin's answer to any Shopify HTTP error) included,
 * so a 5xx or 429 during a relaunch from Home is logged there and never
 * thrown from its loader; the hourly job counts it as a problem.
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
    data: {
      importOperationId: null,
      importCursor: 0,
      importAttempts: { increment: 1 },
      importError: reason,
      importFileRefusals: 0,
      importLaunchedAt: new Date(),
    },
  });
  if (count === 0) return "running";
  try {
    await launch(admin, row.id, row.installedAt, timeoutMs);
  } catch (error) {
    throw new Error(`The bulk query could not be started again: ${messageOf(error)}`, { cause: error });
  }
  return "running";
}

/**
 * The bulk file's answer, to read as a stream. A 4xx from its signed address
 * twice in a row (counted on the row, conditional on it as read) means the
 * file can't be had: a BulkFileError, which uses up an attempt. Any other
 * failure throws plainly, and the next poll fetches again.
 */
async function openFile(row: ImportRow, url: string, timeoutMs: number): Promise<ReadableStream<Uint8Array>> {
  if (!url.startsWith("https://")) throw new Error("The bulk file's address is not https");
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const refused = response.status >= 400 && response.status < 500;
  if (refused || row.importFileRefusals > 0) {
    await prisma.connection.updateMany({
      where: { id: row.id, importOperationId: row.importOperationId, importFileRefusals: row.importFileRefusals },
      data: { importFileRefusals: refused ? { increment: 1 } : 0 },
    });
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    if (refused && row.importFileRefusals >= 1) throw new BulkFileError(`The bulk file answered HTTP ${response.status} twice in a row`);
    throw new Error(`The bulk file answered HTTP ${response.status}`);
  }
  return response.body;
}

/** How many order ids an unreadable-orders summary names before it says "and N more". */
const NAMED_UNREADABLE = 5;
const countFormat = new Intl.NumberFormat("en-GB");

/**
 * The orders of a file that could not be read, counted as the file is read
 * (only the first few ids are kept), and the import's error once it is done:
 * null when every order could be read, else how many could not, out of how
 * many, naming the first few by their numeric order id (never buyer data).
 */
class Unreadable {
  private named: string[] = [];
  private count = 0;

  /** The node's facts, or (counted) why and which order when it can't be read. */
  read(node: unknown, shopCurrency: string): { facts: OrderFacts } | { error: unknown; id: string | null } {
    try {
      return { facts: factsFromOrderNode(node, shopCurrency, "quantities") };
    } catch (error) {
      const id = asRecord(node)?.id;
      this.count++;
      if (this.named.length < NAMED_UNREADABLE) {
        this.named.push(typeof id === "string" ? id.replace(/^gid:\/\/shopify\/Order\//, "") : "(no id)");
      }
      return { error, id: typeof id === "string" ? id : null };
    }
  }

  summary(total: number): string | null {
    if (this.count === 0) return null;
    const more = this.count > NAMED_UNREADABLE ? ` and ${countFormat.format(this.count - NAMED_UNREADABLE)} more` : "";
    const summary = `${countFormat.format(this.count)} of ${countFormat.format(total)} past orders could not be read, so their spend is not counted: ${this.named.join(", ")}${more}`;
    return summary.slice(0, 500);
  }
}

/** The import's error for these order nodes (see Unreadable). Pure; the reasons are in the per-order log lines. */
export function unreadableSummary(nodes: unknown[], shopCurrency: string): string | null {
  const unreadable = new Unreadable();
  for (const node of nodes) unreadable.read(node, shopCurrency);
  return unreadable.summary(nodes.length);
}

/** A count Shopify gives as an UnsignedInt64 string; null when it can't be read. */
function countOf(value: unknown): number | null {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : typeof value === "number" ? value : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * Write the file's orders from `importCursor` on, `chunkSize` at a time,
 * saving the cursor after each chunk and stopping (`running`) before a chunk
 * once the deadline has passed. Every order before the cursor is read again
 * only to count the ones that can't be read; those after it that can't be
 * are logged by their id and skipped, so one bad order never stops the
 * import. With the last chunk the cursor reaches the file's order count and
 * the row keeps the unreadable-orders summary, which is returned.
 */
async function writeFile(
  row: ImportRow,
  conn: ConnectionContext,
  body: ReadableStream<Uint8Array>,
  deadline: number,
  chunkSize: number,
): Promise<{ summary: string | null } | "running"> {
  const current = { id: row.id, importState: "running" as const, importOperationId: row.importOperationId };
  const unreadable = new Unreadable();
  let cursor = row.importCursor;
  let index = 0;
  let chunk: OrderFacts[] = [];
  let inChunk = 0;
  /** Writes the chunk and saves the cursor past it; false when out of time or another poll moved the cursor. */
  const save = async (data: { importError?: string | null } = {}): Promise<boolean> => {
    if (Date.now() >= deadline) return false;
    await ingestImportedOrders(conn, chunk);
    const next = cursor + inChunk;
    const { count } = await prisma.connection.updateMany({ where: { ...current, importCursor: cursor }, data: { importCursor: next, ...data } });
    // Another poll is writing the same file
    if (count === 0) return false;
    cursor = next;
    chunk = [];
    inChunk = 0;
    return true;
  };
  try {
    for await (const node of streamBulkOrders(body)) {
      // A full chunk is written once the next order comes, so the last one is
      // written below, with the summary
      if (inChunk >= chunkSize && !(await save())) return "running";
      // Reading the orders before the cursor takes time too
      if (index > 0 && index % chunkSize === 0 && Date.now() >= deadline) return "running";
      const read = unreadable.read(node, conn.currency);
      if (index >= cursor) {
        if ("facts" in read) chunk.push(read.facts);
        else console.error(`[import] Could not read imported order ${read.id ?? "(no id)"} for ${conn.shop}: ${messageOf(read.error)}`);
        inChunk++;
      }
      index++;
    }
  } catch (error) {
    if (error instanceof BulkFileError) throw error;
    // The read was cut off by the deadline (the fetch's timeout): the next poll carries on
    if (Date.now() >= deadline) return "running";
    throw error;
  }
  const summary = unreadable.summary(index);
  if (!(await save({ importError: summary }))) return "running";
  return { summary };
}

/**
 * Follow one connection's import until `deadline` (a Date.now() time):
 * - not started: start it (`running`);
 * - Shopify still running the query, or out of time: `running`;
 * - COMPLETED: stream the file and, from `importCursor`, write its orders
 *   `chunkSize` (IMPORT_CHUNK) at a time, saving the cursor after each chunk
 *   and stopping at the deadline (writeFile). Once all are written (when the
 *   cursor already equals the file's order count, Shopify's rootObjectCount,
 *   without downloading it again, A17-F5), place the buyers in tiers
 *   (runTierPass, resolving everyone resolved before now), set `done`,
 *   `importedCount`, and `importError` to how many of the file's orders could
 *   not be read (null when none). A tier pass the deadline cuts short is left
 *   to the nightly pass (`tierPassRequestedAt`).
 * - no operation id (a start that failed or was cut off): `running` for
 *   START_GRACE_MS after `importLaunchedAt`, while the start may still be in
 *   flight; after it, or with no launch time (a row claimed by an older
 *   build, or reactivated), the start is lost and is started again.
 * - FAILED, CANCELED or EXPIRED (or a file that can't be read, BulkFileError):
 *   start it again, up to MAX_IMPORT_RESTARTS times, then `failed` with the error.
 * Throws when Shopify or the file can't be reached, the next poll trying
 * again, and when a restart's relaunch fails (restart).
 */
export async function pollImport(
  admin: GraphqlClient,
  connectionId: string,
  deadline: number,
  o: { chunkSize?: number } = {},
): Promise<"running" | "done" | "failed"> {
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
      importFileRefusals: true,
      tierPassRequestedAt: true,
      importLaunchedAt: true,
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
    // A start in flight, or one that failed or was cut off before its id was
    // stored. Timed from the claim's own stamp, never the row's last write.
    const launchedAt = row.importLaunchedAt?.getTime();
    if (launchedAt !== undefined && Date.now() - launchedAt < START_GRACE_MS) return "running";
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
  const current = { id: connectionId, importState: "running" as const, importOperationId: row.importOperationId };
  const total = countOf(operation.rootObjectCount);
  let summary: string | null;
  if (row.importCursor > 0 && total !== null && row.importCursor >= total) {
    // Every order is written; its last chunk stored the summary (writeFile)
    summary = row.importError;
  } else if (typeof operation.url !== "string") {
    // The query found no orders
    summary = null;
  } else {
    let written: { summary: string | null } | "running";
    try {
      const body = await openFile(row, operation.url, Math.max(1, deadline - Date.now()));
      written = await writeFile(row, conn, body, deadline, o.chunkSize ?? IMPORT_CHUNK);
    } catch (error) {
      if (error instanceof BulkFileError) return restart(admin, row, error.message, timeout());
      throw error;
    }
    if (written === "running") return "running";
    summary = written.summary;
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
      importError: summary,
      ...(unfinished
        ? { tierPassRequestedAt: new Date(Math.max(resolvedBefore.getTime(), row.tierPassRequestedAt?.getTime() ?? 0)) }
        : {}),
    },
  });
  return count === 1 ? "done" : "running";
}

/**
 * The hourly backstop: poll every connection whose import can still write
 * (importStillWriting: active, and not started or running, Ruling 53, so an
 * import left not started is started within the hour: pollImport starts
 * it), through its offline session (unauthenticated.admin, which refreshes
 * an expiring token), until `deadline`. One store failing is logged and never
 * stops the others; it is counted in `failed`, with the first error, so the
 * hourly run is recorded as partial (A17-F3). A restart whose relaunch fails
 * is counted there too. So a lost start is a problem only when its relaunch,
 * after the grace, fails; one inside its grace is normal. That deliberately
 * narrows the audit's "count a start still missing after the grace" (RP-25):
 * a start found missing is started again, and counted only if that fails.
 * `polled` counts the polls that finished. A store whose token another call
 * is renewing right now is left for the next run, as no failure (Ruling 85).
 */
export async function pollRunningImports(deadline: number): Promise<{ polled: number; failed: number; firstProblem?: unknown }> {
  const running = await prisma.connection.findMany({
    where: importStillWriting,
    orderBy: { id: "asc" },
    select: { id: true, externalAccountId: true },
  });
  if (running.length === 0) return { polled: 0, failed: 0 };
  // Loaded here, not at the top: ~/shopify.server imports install.server,
  // which imports this module, and builds the app (checking the Session
  // table) as it loads.
  const { unauthenticated } = await import("../shopify.server");
  const result: { polled: number; failed: number; firstProblem?: unknown } = { polled: 0, failed: 0 };
  for (const connection of running) {
    if (Date.now() >= deadline) break;
    const shop = connection.externalAccountId;
    try {
      const { admin } = await unauthenticated.admin(shop);
      await pollImport(admin, connection.id, deadline);
      result.polled++;
    } catch (error) {
      if (error instanceof RenewalBusyError) {
        console.warn(`[import] Another renewal of ${shop}'s token is running; its past-orders import is polled next run`);
        continue;
      }
      console.error(`[import] Could not poll the past-orders import of ${shop}: ${messageOf(error)}`);
      if (result.failed === 0) result.firstProblem = error instanceof Response ? new Error(`Polling ${shop}'s import: ${messageOf(error)}`) : error;
      result.failed++;
    }
  }
  return result;
}
