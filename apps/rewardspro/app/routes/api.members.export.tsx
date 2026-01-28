import type { LoaderFunctionArgs } from "@remix-run/node";
import type { Prisma } from "@prisma/client";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { getEntitlements } from "~/services/entitlements.server";
import { getMemberExportRowsLimit } from "~/constants/plan-limits";

/**
 * CSV Export API for Members (STREAMING VERSION)
 *
 * Exports customer data as CSV with the following columns:
 * - Email
 * - Shopify Customer ID
 * - Tier Name
 * - Tier Cashback %
 * - Store Credit
 * - Member Since
 * - Last Updated
 *
 * SCALABILITY: Uses streaming to handle large datasets without memory issues.
 * Data is fetched in batches and streamed to the client progressively.
 *
 * ENTITLEMENTS: Export row count is limited by plan:
 * - Free: 100 rows
 * - Pro: 1,000 rows
 * - Max: 10,000 rows
 * - Ultra: Unlimited
 *
 * Supports filtering by:
 * - tier: Filter by tier ID or "none" for no tier
 * - search: Search by email
 * - ids: Comma-separated customer IDs for selected export
 */

const BATCH_SIZE = 500; // Smaller batches for true row-by-row streaming

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get entitlements to determine export limit
  const entitlements = await getEntitlements(shop);
  const maxExportRows = getMemberExportRowsLimit(entitlements.effectivePlan);

  const url = new URL(request.url);
  const tierFilter = url.searchParams.get("tier") || "all";
  const searchQuery = url.searchParams.get("search") || "";
  const selectedIds = url.searchParams.get("ids")?.split(",").filter(Boolean) || [];

  // Build where clause with proper Prisma typing
  const whereClause: Prisma.CustomerWhereInput = { shop };

  // If specific IDs provided, use those
  if (selectedIds.length > 0) {
    whereClause.id = { in: selectedIds };
  } else {
    // Apply filters
    if (tierFilter !== "all") {
      if (tierFilter === "none") {
        whereClause.currentTierId = null;
      } else {
        whereClause.currentTierId = tierFilter;
      }
    }

    if (searchQuery) {
      whereClause.email = {
        contains: searchQuery,
        mode: 'insensitive'
      };
    }
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `members-export-${timestamp}.csv`;

  // CSV headers
  const headers = [
    'Email',
    'Shopify Customer ID',
    'Tier Name',
    'Tier Cashback %',
    'Store Credit',
    'Member Since',
    'Last Updated',
  ];

  // Create a readable stream for the CSV data
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Write CSV header
        controller.enqueue(encoder.encode(headers.join(',') + '\n'));

        let cursor: string | undefined = undefined;
        let hasMore = true;
        let totalExported = 0;

        // Stream data in batches using cursor-based pagination
        while (hasMore) {
          // Check if we've hit the export limit
          if (totalExported >= maxExportRows) {
            console.log(`[Members Export] Hit export limit of ${maxExportRows} rows for plan ${entitlements.effectivePlan}`);
            break;
          }

          // Calculate how many more rows we can export
          const remainingRows = maxExportRows - totalExported;
          const batchLimit = Math.min(BATCH_SIZE, remainingRows);

          const customers = await db.customer.findMany({
            where: whereClause,
            include: {
              currentTier: true,
            },
            orderBy: { id: 'asc' }, // Consistent ordering for cursor pagination
            take: batchLimit,
            ...(cursor ? {
              skip: 1, // Skip the cursor record itself
              cursor: { id: cursor }
            } : {}),
          });

          if (customers.length === 0) {
            hasMore = false;
            break;
          }

          // Stream each row individually for true streaming (reduces memory pressure)
          for (const customer of customers) {
            const row = [
              escapeCSV(customer.email ?? ''),
              escapeCSV(customer.shopifyCustomerId ?? ''),
              escapeCSV(customer.currentTier?.name ?? 'No Tier'),
              (customer.currentTier?.cashbackPercent?.toString() ?? '0'),
              parseFloat((customer.storeCredit ?? 0).toString()).toFixed(2),
              formatDate(customer.createdAt),
              formatDate(customer.updatedAt),
            ];
            controller.enqueue(encoder.encode(row.join(',') + '\n'));
            totalExported++;
          }

          // Update cursor for next batch
          cursor = customers[customers.length - 1].id;

          // Check if we have more records
          hasMore = customers.length === batchLimit && totalExported < maxExportRows;

          // Log progress for large exports
          if (totalExported % 5000 === 0) {
            console.log(`[Members Export] Streamed ${totalExported} records...`);
          }
        }

        // Log completion with limit info if applicable
        if (totalExported >= maxExportRows && maxExportRows !== Infinity) {
          console.log(`[Members Export] Complete: ${totalExported} records exported (limited by ${entitlements.effectivePlan} plan)`);
        } else {
          console.log(`[Members Export] Complete: ${totalExported} records exported`);
        }

        controller.close();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Members Export] Streaming error:', errorMessage);

        // Send error message as CSV comment for client visibility
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`\n# Export error: ${errorMessage}\n`));
        controller.close();
      }
    },
  });

  // Add export limit header for client awareness
  const responseHeaders: HeadersInit = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache',
    'Transfer-Encoding': 'chunked',
    'X-Export-Limit': maxExportRows.toString(),
    'X-Plan': entitlements.effectivePlan,
  };

  return new Response(stream, {
    status: 200,
    headers: responseHeaders,
  });
};

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCSV(value: string): string {
  if (!value) return '';
  // If value contains comma, quote, or newline, wrap in quotes and escape existing quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format date for CSV
 */
function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}
