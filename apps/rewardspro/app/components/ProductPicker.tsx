/**
 * ProductPicker Component
 *
 * A modal component for searching and browsing Shopify products
 * to use as raffle prizes.
 *
 * Features:
 * - Browse products without searching (initial load)
 * - Search by name/SKU
 * - Filter by collection
 * - Variant selection
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Modal,
  TextField,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  EmptyState,
  Spinner,
  Select,
  Box,
  Tabs,
  Filters,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

// ============================================
// TYPES
// ============================================

export interface ProductVariant {
  id: string;
  title: string;
  price: string;
  sku: string | null;
  inventoryQuantity: number | null;
}

export interface ProductResult {
  id: string;
  title: string;
  handle: string;
  status: string;
  featuredImage: { url: string } | null;
  totalInventory: number | null;
  priceRange: {
    minPrice: string;
    maxPrice: string;
    currencyCode: string;
  };
  variants: ProductVariant[];
}

export interface SelectedProduct {
  productId: string;
  variantId: string;
  title: string;
  handle: string;
  variantTitle: string | null;
  image: string | null;
  price: string;
  sku: string | null;
}

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  productsCount: number;
}

interface ProductPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (product: SelectedProduct) => void;
  /** Function to search products - receives query, returns results */
  onSearch: (query: string) => Promise<ProductResult[]>;
  /** Function to browse products without search (optional) */
  onBrowse?: () => Promise<ProductResult[]>;
  /** Function to get collections (optional) */
  onGetCollections?: () => Promise<ShopifyCollection[]>;
  /** Function to get products in a collection (optional) */
  onGetCollectionProducts?: (collectionId: string) => Promise<ProductResult[]>;
}

// ============================================
// COMPONENT
// ============================================

export function ProductPicker({
  open,
  onClose,
  onSelect,
  onSearch,
  onBrowse,
  onGetCollections,
  onGetCollectionProducts,
}: ProductPickerProps) {
  // Tab state: 0 = Browse, 1 = Search
  const [selectedTab, setSelectedTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get the currently selected product
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Tab configuration
  const tabs = [
    { id: "browse", content: "Browse Products", panelID: "browse-panel" },
    { id: "search", content: "Search", panelID: "search-panel" },
  ];

  // Load initial products and collections when modal opens
  useEffect(() => {
    if (open && !initialLoadDone && onBrowse) {
      setIsLoading(true);
      Promise.all([
        onBrowse().catch(() => []),
        onGetCollections?.().catch(() => []) || Promise.resolve([]),
      ])
        .then(([browseProducts, collectionList]) => {
          setProducts(browseProducts);
          setCollections(collectionList);
          setInitialLoadDone(true);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load products");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, initialLoadDone, onBrowse, onGetCollections]);

  // Handle collection filter change
  const handleCollectionChange = useCallback(
    async (collectionId: string) => {
      setSelectedCollectionId(collectionId);
      setIsLoading(true);
      setError(null);

      try {
        if (collectionId && onGetCollectionProducts) {
          const results = await onGetCollectionProducts(collectionId);
          setProducts(results);
        } else if (onBrowse) {
          const results = await onBrowse();
          setProducts(results);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load products");
      } finally {
        setIsLoading(false);
      }
    },
    [onBrowse, onGetCollectionProducts]
  );

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      setError(null);

      // Clear existing timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Don't search if query is too short
      if (value.trim().length < 2) {
        // If in browse mode with onBrowse, show browse results
        if (selectedTab === 0 && onBrowse) {
          onBrowse().then(setProducts).catch(() => setProducts([]));
        } else {
          setProducts([]);
        }
        return;
      }

      // Debounce search by 300ms
      searchTimeoutRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          const results = await onSearch(value.trim());
          setProducts(results);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Search failed");
          setProducts([]);
        } finally {
          setIsLoading(false);
        }
      }, 300);
    },
    [onSearch, onBrowse, selectedTab]
  );

  // Handle tab change
  const handleTabChange = useCallback(
    (index: number) => {
      setSelectedTab(index);
      setSearchQuery("");
      setSelectedCollectionId("");
      setError(null);

      if (index === 0 && onBrowse) {
        // Browse tab - load products
        setIsLoading(true);
        onBrowse()
          .then(setProducts)
          .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
          .finally(() => setIsLoading(false));
      } else {
        // Search tab - clear products until user searches
        setProducts([]);
      }
    },
    [onBrowse]
  );

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setProducts([]);
      setSelectedProductId(null);
      setSelectedVariantId(null);
      setSelectedCollectionId("");
      setSelectedTab(0);
      setError(null);
      setInitialLoadDone(false);
    }
  }, [open]);

  // Handle product selection
  const handleProductSelect = useCallback((productId: string) => {
    setSelectedProductId(productId);
    // Auto-select first variant
    const product = products.find((p) => p.id === productId);
    if (product && product.variants.length > 0) {
      setSelectedVariantId(product.variants[0].id);
    }
  }, [products]);

  // Handle variant selection
  const handleVariantChange = useCallback((variantId: string) => {
    setSelectedVariantId(variantId);
  }, []);

  // Handle confirm selection
  const handleConfirm = useCallback(() => {
    if (!selectedProduct || !selectedVariantId) return;

    const variant = selectedProduct.variants.find(
      (v) => v.id === selectedVariantId
    );
    if (!variant) return;

    onSelect({
      productId: selectedProduct.id,
      variantId: variant.id,
      title: selectedProduct.title,
      handle: selectedProduct.handle,
      variantTitle:
        variant.title !== "Default Title" ? variant.title : null,
      image: selectedProduct.featuredImage?.url || null,
      price: variant.price,
      sku: variant.sku,
    });

    onClose();
  }, [selectedProduct, selectedVariantId, onSelect, onClose]);

  // Format price for display
  const formatPrice = (amount: string, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(parseFloat(amount));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Select Product"
      primaryAction={{
        content: "Select Product",
        onAction: handleConfirm,
        disabled: !selectedProductId || !selectedVariantId,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {/* Tabs for Browse/Search */}
          {onBrowse && (
            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
          )}

          {/* Browse Mode: Collection Filter */}
          {selectedTab === 0 && onBrowse && collections.length > 0 && (
            <Select
              label="Filter by collection"
              options={[
                { label: "All products", value: "" },
                ...collections.map((c) => ({
                  label: `${c.title} (${c.productsCount})`,
                  value: c.id,
                })),
              ]}
              value={selectedCollectionId}
              onChange={handleCollectionChange}
            />
          )}

          {/* Search Mode: Search Input */}
          {(selectedTab === 1 || !onBrowse) && (
            <TextField
              label="Search products"
              labelHidden
              placeholder="Search by product name, SKU, or handle..."
              value={searchQuery}
              onChange={handleSearchChange}
              autoComplete="off"
              prefix={<SearchIcon />}
              clearButton
              onClearButtonClick={() => handleSearchChange("")}
            />
          )}

          {/* Error State */}
          {error && (
            <Text as="p" tone="critical">
              {error}
            </Text>
          )}

          {/* Loading State */}
          {isLoading && (
            <Box padding="400">
              <InlineStack align="center" gap="200">
                <Spinner size="small" />
                <Text as="span">{selectedTab === 0 ? "Loading products..." : "Searching..."}</Text>
              </InlineStack>
            </Box>
          )}

          {/* Empty State - Browse Mode */}
          {!isLoading && selectedTab === 0 && onBrowse && products.length === 0 && (
            <EmptyState
              heading="No products available"
              image=""
            >
              <Text as="p">
                No active products found. Add products to your Shopify store first.
              </Text>
            </EmptyState>
          )}

          {/* Empty State - Search Mode */}
          {!isLoading && (selectedTab === 1 || !onBrowse) && searchQuery.length >= 2 && products.length === 0 && (
            <EmptyState
              heading="No products found"
              image=""
            >
              <Text as="p">
                Try adjusting your search terms or check the product status in Shopify.
              </Text>
            </EmptyState>
          )}

          {/* Search Prompt - Search Mode */}
          {!isLoading && (selectedTab === 1 || !onBrowse) && searchQuery.length < 2 && products.length === 0 && (
            <Box padding="400">
              <Text as="p" tone="subdued" alignment="center">
                Enter at least 2 characters to search for products
              </Text>
            </Box>
          )}

          {/* Product List */}
          {!isLoading && products.length > 0 && (
            <ResourceList
              items={products}
              renderItem={(product) => {
                const isSelected = product.id === selectedProductId;
                const priceDisplay =
                  product.priceRange.minPrice === product.priceRange.maxPrice
                    ? formatPrice(product.priceRange.minPrice)
                    : `${formatPrice(product.priceRange.minPrice)} - ${formatPrice(product.priceRange.maxPrice)}`;

                return (
                  <ResourceItem
                    id={product.id}
                    onClick={() => handleProductSelect(product.id)}
                    media={
                      <Thumbnail
                        source={product.featuredImage?.url || ""}
                        alt={product.title}
                        size="medium"
                      />
                    }
                    accessibilityLabel={`Select ${product.title}`}
                  >
                    <BlockStack gap="100">
                      <InlineStack gap="200" align="space-between">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" fontWeight="semibold">
                            {product.title}
                          </Text>
                          {isSelected && (
                            <Badge tone="success">Selected</Badge>
                          )}
                        </InlineStack>
                        <Text as="span" tone="subdued">
                          {priceDisplay}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200">
                        {product.status !== "ACTIVE" && (
                          <Badge tone="warning">{product.status}</Badge>
                        )}
                        <Text as="span" tone="subdued">
                          {product.totalInventory !== null
                            ? `${product.totalInventory} in stock`
                            : "Inventory not tracked"}
                        </Text>
                        {product.variants.length > 1 && (
                          <Text as="span" tone="subdued">
                            {product.variants.length} variants
                          </Text>
                        )}
                      </InlineStack>
                    </BlockStack>
                  </ResourceItem>
                );
              }}
            />
          )}

          {/* Variant Selector (shown when product is selected) */}
          {selectedProduct && selectedProduct.variants.length > 1 && (
            <Box
              background="bg-surface-secondary"
              padding="400"
              borderRadius="200"
            >
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Select Variant
                </Text>
                <Select
                  label="Variant"
                  labelHidden
                  options={selectedProduct.variants.map((v) => ({
                    label: `${v.title} - ${formatPrice(v.price)}${
                      v.inventoryQuantity !== null
                        ? ` (${v.inventoryQuantity} in stock)`
                        : ""
                    }`,
                    value: v.id,
                  }))}
                  value={selectedVariantId || ""}
                  onChange={handleVariantChange}
                />
              </BlockStack>
            </Box>
          )}

          {/* Selected Product Summary */}
          {selectedProduct && selectedVariantId && (
            <Box
              background="bg-surface-success"
              padding="400"
              borderRadius="200"
            >
              <InlineStack gap="400" blockAlign="center">
                <Thumbnail
                  source={selectedProduct.featuredImage?.url || ""}
                  alt={selectedProduct.title}
                  size="small"
                />
                <BlockStack gap="050">
                  <Text as="span" fontWeight="semibold">
                    {selectedProduct.title}
                  </Text>
                  {selectedProduct.variants.length > 1 && (
                    <Text as="span" tone="subdued">
                      {
                        selectedProduct.variants.find(
                          (v) => v.id === selectedVariantId
                        )?.title
                      }
                    </Text>
                  )}
                  <Text as="span">
                    {formatPrice(
                      selectedProduct.variants.find(
                        (v) => v.id === selectedVariantId
                      )?.price || "0"
                    )}
                  </Text>
                </BlockStack>
              </InlineStack>
            </Box>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

export default ProductPicker;
