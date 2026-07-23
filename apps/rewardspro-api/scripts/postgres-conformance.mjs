import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import pg from "pg";
import { uuidv7 } from "yutabase/uuidv7";

import { checkDatabase } from "../dist/db.js";
import {
  CommerceEventProcessor,
  PostgresProcessingStore,
} from "../dist/processing.js";
import { CommerceEventInbox } from "../dist/repositories/commerce-event-inbox.js";

const adminDatabaseUrl = process.env.DATABASE_URL;
const apiDatabaseUrl = process.env.API_DATABASE_URL;
const workerDatabaseUrl = process.env.WORKER_DATABASE_URL;

if (!adminDatabaseUrl || !apiDatabaseUrl || !workerDatabaseUrl) {
  throw new Error("PostgreSQL conformance URLs are missing");
}
const runningInGitHubActions =
  process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true";
const githubActionsMode =
  runningInGitHubActions &&
  process.env.REWARDSPRO_CI_DATABASE_CONFORMANCE === "true";
const localDisposableMode =
  !runningInGitHubActions &&
  process.env.REWARDSPRO_LOCAL_DISPOSABLE_DATABASE_CONFORMANCE === "true";
if (!githubActionsMode && !localDisposableMode) {
  throw new Error(
    "PostgreSQL conformance requires an explicit GitHub Actions or local-disposable opt-in",
  );
}
const expectedAdminUsername = githubActionsMode
  ? "postgres"
  : process.env.REWARDSPRO_CONFORMANCE_ADMIN_USERNAME;
if (!expectedAdminUsername) {
  throw new Error(
    "Local-disposable conformance requires REWARDSPRO_CONFORMANCE_ADMIN_USERNAME",
  );
}
if (process.env.REWARDSPRO_POSTGRES_CONFORMANCE !== "local-test-only") {
  throw new Error(
    "Set REWARDSPRO_POSTGRES_CONFORMANCE=local-test-only to acknowledge fixture writes",
  );
}
const expectedUsers = [
  expectedAdminUsername,
  "rewardspro_ci_api",
  "rewardspro_ci_worker",
];
const parsedUrls = [
  adminDatabaseUrl,
  apiDatabaseUrl,
  workerDatabaseUrl,
].map((databaseUrl, index) => {
  const parsed = new URL(databaseUrl);
  if (
    process.env.NODE_ENV !== "test" ||
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.pathname !== "/rewardspro" ||
    decodeURIComponent(parsed.username) !== expectedUsers[index]
  ) {
    throw new Error(
      "PostgreSQL conformance URLs must use the expected local CI users and rewardspro database",
    );
  }
  return parsed;
});
const [adminUrl] = parsedUrls;
for (const parsed of parsedUrls.slice(1)) {
  if (
    parsed.protocol !== adminUrl?.protocol ||
    parsed.hostname !== adminUrl.hostname ||
    parsed.port !== adminUrl.port ||
    parsed.pathname !== adminUrl.pathname
  ) {
    throw new Error(
      "PostgreSQL conformance URLs must agree on protocol, host, port, and database",
    );
  }
}

const admin = new pg.Pool({ connectionString: adminDatabaseUrl, max: 2 });
const api = new pg.Pool({ connectionString: apiDatabaseUrl, max: 2 });
const worker = new pg.Pool({ connectionString: workerDatabaseUrl, max: 2 });
const inbox = new CommerceEventInbox(api);
const processor = new CommerceEventProcessor(
  new PostgresProcessingStore(worker, 30),
);

const workspaceOne = "20000000-0000-4000-8000-000000000001";
const workspaceTwo = "20000000-0000-4000-8000-000000000002";
const connectionOne = "30000000-0000-4000-8000-000000000001";
const connectionTwo = "30000000-0000-4000-8000-000000000002";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function eventInput({
  eventId,
  payloadJson,
  shop = "one.myshopify.com",
  topic = "orders/paid",
}) {
  return {
    dispatch: false,
    externalEventId: eventId,
    externalEventType: topic,
    occurredAt: "2026-07-23T10:00:00Z",
    payloadJson,
    payloadSha256: sha256(payloadJson),
    provider: "shopify",
    sourceAccountId: shop,
  };
}

async function expectPgCode(action, expectedCode) {
  try {
    await action();
    assert.fail(`Expected PostgreSQL error ${expectedCode}`);
  } catch (error) {
    assert.equal(error?.code, expectedCode);
  }
}

const firstPayload =
  '{"id":820982911946154508,"customer":{"id":820982911946154509},' +
  '"currency":"GBP","current_total_price":"12.50",' +
  '"processed_at":"2026-07-23T10:00:00Z","line_items":[' +
  '{"id":820982911946154510,"product_id":820982911946154511,' +
  '"variant_id":820982911946154512,"quantity":1,' +
  '"title":"Exact identity","price":"12.50"}]}';
const secondPayload =
  '{"id":920982911946154508,"currency":"GBP","total_price":"5.00",' +
  '"processed_at":"2026-07-23T10:01:00Z","line_items":[' +
  '{"id":920982911946154510,"quantity":1,"title":"Other order"}]}';

try {
  await admin.query(
    `INSERT INTO public.rp_workspace (id, handle, display_name)
     VALUES ($1, 'workspace-one', 'Workspace One'),
            ($2, 'workspace-two', 'Workspace Two')`,
    [workspaceOne, workspaceTwo],
  );
  await admin.query(
    `INSERT INTO public.rp_commerce_connection (
       id, workspace_id, provider, external_account_id, display_name
     )
     VALUES
       ($1, $2, 'shopify', 'one.myshopify.com', 'Shop One'),
       ($3, $4, 'shopify', 'two.myshopify.com', 'Shop Two')`,
    [connectionOne, workspaceOne, connectionTwo, workspaceTwo],
  );

  await checkDatabase(api, "api");
  await checkDatabase(worker, "worker");

  await expectPgCode(
    () => api.query("SELECT id FROM commerce.orders LIMIT 1"),
    "42501",
  );
  await expectPgCode(
    () =>
      worker.query(
        `SELECT *
         FROM public.rp_ingest_shopify_event(
           $1, $2, $3, $4, $5, $6::jsonb, $7, false
         )`,
        [
          uuidv7(),
          "one.myshopify.com",
          "forbidden-worker-ingest",
          "orders/paid",
          sha256(firstPayload),
          firstPayload,
          "2026-07-23T10:00:00Z",
        ],
    ),
    "42501",
  );

  const concurrentInput = eventInput({
    eventId: "webhook-concurrent",
    payloadJson: firstPayload,
  });
  const concurrentResults = await Promise.all([
    inbox.ingest(concurrentInput),
    inbox.ingest(concurrentInput),
  ]);
  assert.deepEqual(
    concurrentResults.map((result) => result.duplicate).sort(),
    [false, true],
  );
  assert.equal(concurrentResults[0].eventId, concurrentResults[1].eventId);
  const concurrentRows = await admin.query(
    `SELECT
       count(DISTINCT event.id)::integer AS event_count,
       count(DISTINCT payload.event_id)::integer AS payload_count,
       count(DISTINCT state.event_id)::integer AS state_count
     FROM commerce.events event
     LEFT JOIN commerce.event_payloads payload
       ON payload.event_id = event.id
     LEFT JOIN public.rp_commerce_event_state state
       ON state.event_id = event.id
     WHERE event.commerce_connection_id = $1
       AND event.external_event_id = 'webhook-concurrent'`,
    [connectionOne],
  );
  assert.deepEqual(concurrentRows.rows[0], {
    event_count: 1,
    payload_count: 1,
    state_count: 1,
  });

  const firstEvent = await inbox.ingest(
    eventInput({
      eventId: "webhook-exact-one",
      payloadJson: firstPayload,
    }),
  );
  const replay = await inbox.ingest(
    eventInput({
      eventId: "webhook-exact-one",
      payloadJson: firstPayload,
    }),
  );
  assert.equal(replay.duplicate, true);
  assert.equal(replay.eventId, firstEvent.eventId);
  assert.equal(await processor.processById(firstEvent.eventId), "normalized");

  const secondEvent = await inbox.ingest(
    eventInput({
      eventId: "webhook-exact-two",
      payloadJson: secondPayload,
      shop: "two.myshopify.com",
    }),
  );
  assert.equal(await processor.processById(secondEvent.eventId), "normalized");

  const projection = await admin.query(
    `SELECT
       order_card.id AS order_id,
       order_card.external_order_id,
       order_card.external_customer_id,
       line_item.id AS line_item_id,
       line_item.external_line_item_id,
       line_item.external_product_id,
       line_item.external_variant_id
     FROM commerce.orders order_card
     JOIN commerce.line_items line_item
       ON line_item.order_id = order_card.id
     WHERE order_card.source_event_id = $1`,
    [firstEvent.eventId],
  );
  assert.deepEqual(projection.rows[0], {
    external_customer_id: "820982911946154509",
    external_line_item_id: "820982911946154510",
    external_order_id: "820982911946154508",
    external_product_id: "820982911946154511",
    external_variant_id: "820982911946154512",
    line_item_id: projection.rows[0]?.line_item_id,
    order_id: projection.rows[0]?.order_id,
  });

  const words = await admin.query(
    "SELECT word FROM yu.lexicon WHERE status = 'live' ORDER BY word",
  );
  assert.deepEqual(
    words.rows.map((row) => row.word),
    ["contains", "derived_from"],
  );
  const threads = await admin.query(
    `SELECT word, count(*)::integer AS count
     FROM yu.threads
     GROUP BY word
     ORDER BY word`,
  );
  assert.deepEqual(threads.rows, [
    { count: 2, word: "contains" },
    { count: 2, word: "derived_from" },
  ]);
  const via = await worker.query(
    `SELECT
       (SELECT count(*)::integer FROM via.contains) AS contains_count,
       (SELECT count(*)::integer FROM via.derived_from) AS derived_count`,
  );
  assert.deepEqual(via.rows[0], {
    contains_count: 2,
    derived_count: 2,
  });

  const secondProjection = await admin.query(
    `SELECT order_card.id AS order_id, line_item.id AS line_item_id
     FROM commerce.orders order_card
     JOIN commerce.line_items line_item
       ON line_item.order_id = order_card.id
     WHERE order_card.source_event_id = $1`,
    [secondEvent.eventId],
  );
  await expectPgCode(
    () =>
      worker.query(
        `INSERT INTO yu.threads (
           id, word, from_book, from_deck, from_id,
           to_book, to_deck, to_id, at, by, how, src
         )
         VALUES (
           $1, 'contains', 'commerce', 'orders', $2,
           'commerce', 'line_items', $3, now(),
           'system:rewardspro/conformance', 'computed', ARRAY[$4]::text[]
         )`,
        [
          uuidv7(),
          projection.rows[0].order_id,
          secondProjection.rows[0].line_item_id,
          `commerce/events/${firstEvent.eventId}`,
        ],
      ),
    "23503",
  );
  await expectPgCode(
    () =>
      worker.query(
        `INSERT INTO yu.threads (
           id, word, from_book, from_deck, from_id,
           to_book, to_deck, to_id, at, by, how, src
         )
         VALUES (
           $1, 'derived_from', 'commerce', 'orders', $2,
           'commerce', 'events', $3, now(),
           'system:rewardspro/conformance', 'computed', ARRAY[$4]::text[]
         )`,
        [
          uuidv7(),
          projection.rows[0].order_id,
          secondEvent.eventId,
          `commerce/events/${firstEvent.eventId}`,
        ],
      ),
    "23503",
  );

  await expectPgCode(
    () =>
      admin.query(
        "UPDATE commerce.events SET occurred_at = now() WHERE id = $1",
        [firstEvent.eventId],
      ),
    "23514",
  );

  const conflict = await inbox.ingest(
    eventInput({
      eventId: "webhook-projection-conflict",
      payloadJson: firstPayload,
    }),
  );
  assert.equal(await processor.processById(conflict.eventId), "failed");
  const conflictState = await admin.query(
    `SELECT processing_state, last_processing_error_code
     FROM public.rp_commerce_event_state
     WHERE event_id = $1`,
    [conflict.eventId],
  );
  assert.deepEqual(conflictState.rows[0], {
    last_processing_error_code: "projection_conflict",
    processing_state: "failed",
  });

  const expiring = await inbox.ingest(
    eventInput({
      eventId: "webhook-expiring",
      payloadJson: "{}",
      topic: "orders/cancelled",
    }),
  );
  await admin.query(
    `UPDATE commerce.event_payloads
     SET stored_at = now() - interval '31 days',
         retention_until = now() - interval '1 day'
     WHERE event_id = $1`,
    [expiring.eventId],
  );
  assert.deepEqual(await processor.sweepExpiredPayloads(1), {
    deletedPayloads: 1,
    terminalizedEvents: 1,
  });
  const retained = await admin.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM commerce.events WHERE id = $1
       ) AS event_exists,
       EXISTS (
         SELECT 1 FROM commerce.event_payloads WHERE event_id = $1
       ) AS payload_exists,
       (
         SELECT processing_state
         FROM public.rp_commerce_event_state
         WHERE event_id = $1
       ) AS processing_state`,
    [expiring.eventId],
  );
  assert.deepEqual(retained.rows[0], {
    event_exists: true,
    payload_exists: false,
    processing_state: "failed",
  });
} finally {
  await Promise.all([admin.end(), api.end(), worker.end()]);
}

console.log("PostgreSQL 16 RewardsPro/YUTABASE conformance passed");
