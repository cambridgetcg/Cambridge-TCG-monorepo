/**
 * API Route: Product Search & Browse
 *
 * Provides GraphQL-based product search and browsing for the ProductPicker component.
 * Used when selecting products as raffle prizes.
 *
 * Endpoints:
 *   GET /api/products/search?q=query     - Search products by name/SKU
 *   GET /api/products/search?browse=1    - List products (no search required)
 *   GET /api/products/search?collections=1 - List available collections
 *   GET /api/products/search?collection=gid://... - List products in collection
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import {
  searchProducts,
  listProducts,
  listCollections,
  listCollectionProducts,
  type ProductSortKey,
} from "~/services/product-search.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const browse = url.searchParams.get("browse") === "1";
  const collections = url.searchParams.get("collections") === "1";
  const collectionId = url.searchParams.get("collection") || "";
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  const sortKey = (url.searchParams.get("sort") || "UPDATED_AT") as ProductSortKey;

  try {
    // List collections
    if (collections) {
      const collectionList = await listCollections(admin, 50);
      return json({ collections: collectionList });
    }

    // List products in a specific collection
    if (collectionId) {
      const products = await listCollectionProducts(admin, collectionId, Math.min(limit, 50));
      return json({ products });
    }

    // Browse mode - list products without search
    if (browse || !query.trim()) {
      const products = await listProducts(admin, {
        first: Math.min(limit, 50),
        sortKey,
        reverse: true, // Newest first
      });
      return json({ products });
    }

    // Search mode
    const products = await searchProducts(admin, query, Math.min(limit, 50));
    return json({ products });
  } catch (error) {
    console.error("[api.products.search] Error:", error);
    return json(
      {
        products: [],
        collections: [],
        error: error instanceof Error ? error.message : "Search failed"
      },
      { status: 500 }
    );
  }
}
