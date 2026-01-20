import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

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
 * Supports filtering by:
 * - tier: Filter by tier ID or "none" for no tier
 * - search: Search by email
 * - ids: Comma-separated customer IDs for selected export
 */

const BATCH_SIZE = 1000; // Fetch 1000 records at a time for streaming

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const tierFilter = url.searchParams.get("tier") || "all";
  const searchQuery = url.searchParams.get("search") || "";
  const selectedIds = url.searchParams.get("ids")?.split(",").filter(Boolean) || [];

  // Build where clause
  const whereClause: any = { shop };

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
      try {
        // Write CSV header
        controller.enqueue(new TextEncoder().encode(headers.join(',') + '\n'));

        let cursor: string | undefined = undefined;
        let hasMore = true;
        let totalExported = 0;

        // Stream data in batches using cursor-based pagination
        while (hasMore) {
          const customers = await db.customer.findMany({
            where: whereClause,
            include: {
              currentTier: true,
            },
            orderBy: { id: 'asc' }, // Consistent ordering for cursor pagination
            take: BATCH_SIZE,
            ...(cursor ? {
              skip: 1, // Skip the cursor record itself
              cursor: { id: cursor }
            } : {}),
          });

          if (customers.length === 0) {
            hasMore = false;
            break;
          }

          // Convert batch to CSV rows
          const csvRows = customers.map(customer => {
            const row = [
              escapeCSV(customer.email),
              escapeCSV(customer.shopifyCustomerId),
              escapeCSV(customer.currentTier?.name || 'No Tier'),
              customer.currentTier?.cashbackPercent?.toString() || '0',
              parseFloat(customer.storeCredit.toString()).toFixed(2),
              formatDate(customer.createdAt),
              formatDate(customer.updatedAt),
            ];
            return row.join(',');
          });

          // Stream this batch
          controller.enqueue(new TextEncoder().encode(csvRows.join('\n') + '\n'));
          totalExported += customers.length;

          // Update cursor for next batch
          cursor = customers[customers.length - 1].id;

          // Check if we have more records
          hasMore = customers.length === BATCH_SIZE;

          // Log progress for large exports
          if (totalExported % 5000 === 0) {
            console.log(`[Members Export] Streamed ${totalExported} records...`);
          }
        }

        console.log(`[Members Export] Complete: ${totalExported} records exported`);
        controller.close();
      } catch (error: any) {
        console.error('[Members Export] Streaming error:', error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked', // Enable chunked transfer for streaming
    },
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
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}
