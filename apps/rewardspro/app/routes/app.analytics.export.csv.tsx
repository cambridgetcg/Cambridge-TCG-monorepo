import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { query } from "../services/db/rds-data";
import { csvHeader, csvRow } from "../utils/csv";

async function* iterateTransactions(shopId: string, batchSize = 5000) {
  let lastCreatedAt: string | null = null;
  let lastId: string | null = null;

  while (true) {
    const rows = await query<any>(
      `SELECT id, "createdAt", "customerId", total_price, cashback_amount
         FROM "Order"
        WHERE shop = :shopId
          AND (
            :lastCreatedAt IS NULL
            OR "createdAt" > :lastCreatedAt
            OR ("createdAt" = :lastCreatedAt AND id > :lastId)
          )
        ORDER BY "createdAt", id
        LIMIT :batch`,
      {
        shopId,
        lastCreatedAt,
        lastId,
        batch: batchSize,
      }
    );
    if (!rows.length) return;
    for (const r of rows) yield r;
    const tail = rows[rows.length - 1];
    lastCreatedAt = tail.createdAt;
    lastId = tail.id;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const cols = ["id", "createdAt", "customerId", "total_price", "cashback_amount"];

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(csvHeader(cols));
      (async () => {
        for await (const row of iterateTransactions(session.shop)) {
          controller.enqueue(csvRow(row, cols));
        }
        controller.close();
      })().catch((err) => controller.error(err));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions_${new Date().toISOString().split('T')[0]}.csv"`,
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}