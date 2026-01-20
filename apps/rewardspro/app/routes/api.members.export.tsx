import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

/**
 * CSV Export API for Members
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
 * Supports filtering by:
 * - tier: Filter by tier ID or "none" for no tier
 * - search: Search by email
 * - ids: Comma-separated customer IDs for selected export
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const tierFilter = url.searchParams.get("tier") || "all";
  const searchQuery = url.searchParams.get("search") || "";
  const selectedIds = url.searchParams.get("ids")?.split(",").filter(Boolean) || [];

  try {
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

    // Fetch customers with their current tier
    const customers = await db.customer.findMany({
      where: whereClause,
      include: {
        currentTier: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10000, // Limit to prevent massive exports
    });

    // Generate CSV content
    const headers = [
      'Email',
      'Shopify Customer ID',
      'Tier Name',
      'Tier Cashback %',
      'Store Credit',
      'Member Since',
      'Last Updated',
    ];

    const rows = customers.map(customer => [
      escapeCSV(customer.email),
      escapeCSV(customer.shopifyCustomerId),
      escapeCSV(customer.currentTier?.name || 'No Tier'),
      customer.currentTier?.cashbackPercent?.toString() || '0',
      parseFloat(customer.storeCredit.toString()).toFixed(2),
      formatDate(customer.createdAt),
      formatDate(customer.updatedAt),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `members-export-${timestamp}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('[Members Export] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
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
