// Resource route kept outside the analytics UI route while preserving its public URL.
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { csvHeader, csvRow } from "../utils/csv";
import prisma from "../db.server";
import { getEntitlements } from "../services/entitlements.server";

/**
 * SECURITY: Audit logging for data exports
 * Logs who downloaded what data and when for compliance tracking
 */
async function logExportAudit(
  shop: string,
  exportType: string,
  metadata: Record<string, any>
): Promise<void> {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    shop,
    exportType,
    action: 'DATA_EXPORT',
    ...metadata,
  };

  // Structured console log for log aggregation services (DataDog, CloudWatch, etc.)
  console.log('[AUDIT:DATA_EXPORT]', JSON.stringify(auditEntry));

  // Also try to persist to database for long-term retention
  try {
    await prisma.billingAuditLog.create({
      data: {
        id: crypto.randomUUID(),
        shop,
        action: `export-${exportType}`,
        planName: null,
        success: true,
        ipAddress: metadata.ipAddress || null,
        userAgent: metadata.userAgent || null,
        attemptedAt: new Date(),
        metadata: {
          exportType,
          rowCount: metadata.rowCount,
          dateRange: metadata.dateRange,
        },
      },
    });
  } catch (err) {
    // Non-critical - audit logging shouldn't block exports
    console.warn('[AUDIT:DATA_EXPORT] Failed to persist audit log:', err);
  }
}

async function* iterateTransactions(shopId: string, batchSize = 5000) {
  let lastCreatedAt: string | null = null;
  let lastId: string | null = null;

  while (true) {
    const rows = await prisma.$queryRaw`
      SELECT id, "createdAt", "customerId", "netAmount", cashback_amount
       FROM "Order"
       WHERE shop = ${shopId}
         AND (
           ${lastCreatedAt}::timestamp IS NULL
           OR "createdAt" > ${lastCreatedAt}::timestamp
           OR ("createdAt" = ${lastCreatedAt}::timestamp AND id > ${lastId})
         )
       ORDER BY "createdAt", id
       LIMIT ${batchSize}` as any[];
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

  // Historical capacity is advisory during the free-first rollout. Exports always
  // contain the merchant's complete transaction history.
  const entitlements = await getEntitlements(session.shop);
  const maxHistoricalDays = entitlements.limitMaxHistoricalDays;

  // SECURITY: Extract request metadata for audit trail
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                    request.headers.get('x-real-ip') ||
                    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Log the export request (async - don't block the export)
  logExportAudit(session.shop, 'transactions-csv', {
    ipAddress,
    userAgent,
    requestedAt: new Date().toISOString(),
    dateRange: 'All time',
    advisoryMaxHistoricalDays: maxHistoricalDays,
  }).catch(err => console.error('[AUDIT:DATA_EXPORT] Logging failed:', err));

  const cols = ["id", "createdAt", "customerId", "netAmount", "cashback_amount"];

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
      "X-History-Advisory-Days": String(maxHistoricalDays),
    },
  });
}
