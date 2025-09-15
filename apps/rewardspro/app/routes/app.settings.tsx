import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
export { ErrorBoundary } from "../components/ErrorBoundary";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  RadioButton,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Divider,
  Box,
  Badge,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ============= TYPES =============
type Currency = 
  | "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "CHF" | "CNY" 
  | "SEK" | "NZD" | "NOK" | "MXN" | "SGD" | "HKD" | "KRW" | "TRY" 
  | "INR" | "RUB" | "BRL" | "ZAR" | "AED" | "PLN" | "DKK" | "THB" 
  | "IDR" | "HUF" | "CZK" | "ILS" | "CLP" | "PHP" | "RON" | "MYR";

type CurrencyDisplayType = "SYMBOL" | "CODE";

type ShopSettings = {
  id: string;
  shop: string;
  storeName: string;
  storeUrl: string;
  storeCurrency: Currency;
  currencyDisplayType: CurrencyDisplayType;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

type LoaderData = {
  settings: ShopSettings;
  shop: string;
  shopifyTimezone?: string;
};

// ============= CONSTANTS =============
const CURRENCY_OPTIONS = [
  { label: "🇺🇸 US Dollar (USD)", value: "USD", symbol: "$" },
  { label: "🇪🇺 Euro (EUR)", value: "EUR", symbol: "€" },
  { label: "🇬🇧 British Pound (GBP)", value: "GBP", symbol: "£" },
  { label: "🇨🇦 Canadian Dollar (CAD)", value: "CAD", symbol: "C$" },
  { label: "🇦🇺 Australian Dollar (AUD)", value: "AUD", symbol: "A$" },
  { label: "🇯🇵 Japanese Yen (JPY)", value: "JPY", symbol: "¥" },
  { label: "🇨🇭 Swiss Franc (CHF)", value: "CHF", symbol: "CHF" },
  { label: "🇨🇳 Chinese Yuan (CNY)", value: "CNY", symbol: "¥" },
  { label: "🇸🇪 Swedish Krona (SEK)", value: "SEK", symbol: "kr" },
  { label: "🇳🇿 New Zealand Dollar (NZD)", value: "NZD", symbol: "NZ$" },
  { label: "🇳🇴 Norwegian Krone (NOK)", value: "NOK", symbol: "kr" },
  { label: "🇲🇽 Mexican Peso (MXN)", value: "MXN", symbol: "$" },
  { label: "🇸🇬 Singapore Dollar (SGD)", value: "SGD", symbol: "S$" },
  { label: "🇭🇰 Hong Kong Dollar (HKD)", value: "HKD", symbol: "HK$" },
  { label: "🇰🇷 South Korean Won (KRW)", value: "KRW", symbol: "₩" },
  { label: "🇹🇷 Turkish Lira (TRY)", value: "TRY", symbol: "₺" },
  { label: "🇮🇳 Indian Rupee (INR)", value: "INR", symbol: "₹" },
  { label: "🇷🇺 Russian Ruble (RUB)", value: "RUB", symbol: "₽" },
  { label: "🇧🇷 Brazilian Real (BRL)", value: "BRL", symbol: "R$" },
  { label: "🇿🇦 South African Rand (ZAR)", value: "ZAR", symbol: "R" },
  { label: "🇦🇪 UAE Dirham (AED)", value: "AED", symbol: "د.إ" },
  { label: "🇵🇱 Polish Zloty (PLN)", value: "PLN", symbol: "zł" },
  { label: "🇩🇰 Danish Krone (DKK)", value: "DKK", symbol: "kr" },
  { label: "🇹🇭 Thai Baht (THB)", value: "THB", symbol: "฿" },
  { label: "🇮🇩 Indonesian Rupiah (IDR)", value: "IDR", symbol: "Rp" },
  { label: "🇭🇺 Hungarian Forint (HUF)", value: "HUF", symbol: "Ft" },
  { label: "🇨🇿 Czech Koruna (CZK)", value: "CZK", symbol: "Kč" },
  { label: "🇮🇱 Israeli Shekel (ILS)", value: "ILS", symbol: "₪" },
  { label: "🇨🇱 Chilean Peso (CLP)", value: "CLP", symbol: "$" },
  { label: "🇵🇭 Philippine Peso (PHP)", value: "PHP", symbol: "₱" },
  { label: "🇷🇴 Romanian Leu (RON)", value: "RON", symbol: "lei" },
  { label: "🇲🇾 Malaysian Ringgit (MYR)", value: "MYR", symbol: "RM" },
];

// Timezone options removed - now automatically synced from Shopify

// ============= HELPERS =============
const getCurrencySymbol = (currency: Currency): string => {
  const option = CURRENCY_OPTIONS.find(opt => opt.value === currency);
  return option?.symbol || currency;
};

const formatCurrencyExample = (currency: Currency, displayType: CurrencyDisplayType): string => {
  const symbol = getCurrencySymbol(currency);
  const amount = "100.00";
  
  if (displayType === "SYMBOL") {
    return `${symbol}${amount}`;
  } else {
    return `${currency} ${amount}`;
  }
};

// getCurrentTimeInTimezone function removed - timezone display simplified

const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// ============= RATE LIMITING =============
const rateLimitMap = new Map<string, number[]>();

const checkRateLimit = (shop: string) => {
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const maxRequests = 10; // 10 requests per minute for settings

  const key = `settings:${shop}`;
  const timestamps = rateLimitMap.get(key) || [];
  
  const recentTimestamps = timestamps.filter(t => now - t < windowMs);
  
  if (recentTimestamps.length >= maxRequests) {
    throw new Response("Too many requests. Please wait a moment.", { status: 429 });
  }
  
  recentTimestamps.push(now);
  rateLimitMap.set(key, recentTimestamps);
};

// ============= LOADER =============
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;

    // Fetch shop details from Shopify to get timezone and currency
    let shopifyTimezone = "America/New_York"; // Default fallback
    let shopifyCurrency = "USD"; // Default fallback
    let shopName = shop.split('.')[0];
    
    try {
      const shopQuery = `#graphql
        query getShopDetails {
          shop {
            name
            currencyCode
            ianaTimezone
            url
            billingAddress {
              country
            }
          }
        }
      `;
      
      const response = await admin.graphql(shopQuery);
      const shopData = await response.json();
      
      if (shopData.data?.shop) {
        shopifyTimezone = shopData.data.shop.ianaTimezone || shopifyTimezone;
        shopifyCurrency = shopData.data.shop.currencyCode || shopifyCurrency;
        shopName = shopData.data.shop.name || shopName;
      }
    } catch (error) {
      console.error("Failed to fetch shop details from Shopify:", error);
      // Continue with defaults
    }

    // Try to fetch existing settings
    let settings = await db.shopSettings.findUnique({
      where: { shop },
    });

    // If no settings exist, create with Shopify defaults
    if (!settings) {
      const now = new Date();
      settings = await db.shopSettings.create({
        data: {
          id: crypto.randomUUID(),
          shop,
          storeName: shopName,
          storeUrl: `https://${shop}`,
          storeCurrency: shopifyCurrency as Currency,
          currencyDisplayType: "SYMBOL",
          timezone: shopifyTimezone,
          createdAt: now,
          updatedAt: now,
        },
      });
    } else {
      // Update timezone if it differs from Shopify
      if (settings.timezone !== shopifyTimezone) {
        settings = await db.shopSettings.update({
          where: { id: settings.id },
          data: {
            timezone: shopifyTimezone,
            updatedAt: new Date(),
          },
        });
      }
    }

    // Serialize dates for JSON
    const serializedSettings = {
      ...settings,
      createdAt: settings.createdAt instanceof Date 
        ? settings.createdAt.toISOString() 
        : settings.createdAt,
      updatedAt: settings.updatedAt instanceof Date 
        ? settings.updatedAt.toISOString() 
        : settings.updatedAt,
    };

    return json<LoaderData>({ 
      settings: serializedSettings as ShopSettings, 
      shop,
      shopifyTimezone // Pass Shopify's timezone to show it's synced
    });
  } catch (error) {
    console.error("Settings loader error:", error);
    throw new Response("Failed to load settings", { status: 500 });
  }
};

// ============= ACTION =============
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    if (!session?.shop) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const shop = session.shop;
    
    // Rate limiting
    checkRateLimit(shop);

    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent !== "update") {
      return json({ error: "Invalid action" }, { status: 400 });
    }

    // Extract and validate form data
    const storeName = formData.get("storeName") as string;
    const storeUrl = formData.get("storeUrl") as string;
    const storeCurrency = formData.get("storeCurrency") as Currency;
    const currencyDisplayType = formData.get("currencyDisplayType") as CurrencyDisplayType;
    // Timezone is now synced from Shopify and not editable

    // Validation
    const errors: string[] = [];

    if (!storeName || storeName.trim().length === 0) {
      errors.push("Store name is required");
    } else if (storeName.length > 100) {
      errors.push("Store name must be less than 100 characters");
    }

    if (!storeUrl || !validateUrl(storeUrl)) {
      errors.push("Valid store URL is required");
    }

    if (!CURRENCY_OPTIONS.some(opt => opt.value === storeCurrency)) {
      errors.push("Invalid currency selected");
    }

    if (!["SYMBOL", "CODE"].includes(currencyDisplayType)) {
      errors.push("Invalid currency display type");
    }

    if (errors.length > 0) {
      return json({ error: errors.join(", ") }, { status: 400 });
    }

    // Update settings (timezone stays as-is, synced from Shopify)
    const updatedSettings = await db.shopSettings.update({
      where: { shop },
      data: {
        storeName: storeName.trim(),
        storeUrl: storeUrl.trim(),
        storeCurrency,
        currencyDisplayType,
        // timezone is synced from Shopify, not updated here
        updatedAt: new Date(),
      },
    });

    return json({ 
      success: true, 
      settings: updatedSettings 
    });
  } catch (error) {
    console.error("Settings action error:", error);
    
    if (error instanceof Response) {
      throw error;
    }
    
    if (error instanceof Error) {
      return json({ error: error.message }, { status: 400 });
    }
    
    return json({ error: "An unexpected error occurred" }, { status: 500 });
  }
};

// ============= COMPONENT =============
export default function SettingsPage() {
  const { settings, shop, shopifyTimezone } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  
  // Form state
  const [storeName, setStoreName] = useState(settings.storeName);
  const [storeUrl, setStoreUrl] = useState(settings.storeUrl);
  const [storeCurrency, setStoreCurrency] = useState<Currency>(settings.storeCurrency);
  const [currencyDisplayType, setCurrencyDisplayType] = useState<CurrencyDisplayType>(settings.currencyDisplayType);
  // Timezone is now read-only from Shopify
  const timezone = shopifyTimezone || settings.timezone;
  
  // UI state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Check for unsaved changes
  useEffect(() => {
    const hasChanges = 
      storeName !== settings.storeName ||
      storeUrl !== settings.storeUrl ||
      storeCurrency !== settings.storeCurrency ||
      currencyDisplayType !== settings.currencyDisplayType;
    
    setHasUnsavedChanges(hasChanges);
  }, [storeName, storeUrl, storeCurrency, currencyDisplayType, settings]);

  // Removed time display - timezone is now just shown as text

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "update");
    formData.append("storeName", storeName);
    formData.append("storeUrl", storeUrl);
    formData.append("storeCurrency", storeCurrency);
    formData.append("currencyDisplayType", currencyDisplayType);
    // Don't submit timezone - it's synced from Shopify

    fetcher.submit(formData, { method: "post" });
  }, [storeName, storeUrl, storeCurrency, currencyDisplayType, fetcher]);

  // Handle reset
  const handleReset = useCallback(() => {
    setStoreName(settings.storeName);
    setStoreUrl(settings.storeUrl);
    setStoreCurrency(settings.storeCurrency);
    setCurrencyDisplayType(settings.currencyDisplayType);
    // Timezone is read-only, no need to reset
  }, [settings]);

  // Show success/error messages
  const actionData = fetcher.data as { error?: string; success?: boolean } | undefined;
  const isLoading = navigation.state === "submitting" || fetcher.state === "submitting";

  // Reset unsaved changes flag on successful save
  useEffect(() => {
    if (actionData?.success) {
      setHasUnsavedChanges(false);
    }
  }, [actionData]);

  return (
    <Page
      title="Store Settings"
      primaryAction={{
        content: "Save Settings",
        onAction: handleSubmit,
        loading: isLoading,
        disabled: !hasUnsavedChanges,
      }}
      secondaryActions={[
        {
          content: "Reset",
          onAction: handleReset,
          disabled: !hasUnsavedChanges,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Status Messages */}
            {actionData?.error && (
              <Banner tone="critical">
                <p>{actionData.error}</p>
              </Banner>
            )}
            {actionData?.success && (
              <Banner tone="success">
                <p>Settings saved successfully!</p>
              </Banner>
            )}
            {hasUnsavedChanges && (
              <Banner tone="warning">
                <p>You have unsaved changes</p>
              </Banner>
            )}
            
            {/* Store Information */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Store Information
                </Text>
                <FormLayout>
                  <TextField
                    label="Store Name"
                    value={storeName}
                    onChange={setStoreName}
                    autoComplete="off"
                    helpText="The display name for your store"
                  />
                  <TextField
                    label="Store URL"
                    value={storeUrl}
                    onChange={setStoreUrl}
                    type="url"
                    autoComplete="off"
                    helpText="Your store's public URL"
                    error={storeUrl && !validateUrl(storeUrl) ? "Please enter a valid URL" : undefined}
                  />
                  <TextField
                    label="Shop Domain"
                    value={shop}
                    disabled
                    autoComplete="off"
                    helpText="This is your Shopify domain and cannot be changed"
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            {/* Currency Settings */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Currency Settings
                </Text>
                <FormLayout>
                  <Select
                    label="Store Currency"
                    options={CURRENCY_OPTIONS}
                    value={storeCurrency}
                    onChange={(value) => setStoreCurrency(value as Currency)}
                    helpText="The primary currency for your store"
                  />
                  
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      Currency Display Format
                    </Text>
                    <RadioButton
                      label={`Symbol Format (${getCurrencySymbol(storeCurrency)}100.00)`}
                      checked={currencyDisplayType === "SYMBOL"}
                      id="symbol"
                      name="displayType"
                      onChange={() => setCurrencyDisplayType("SYMBOL")}
                    />
                    <RadioButton
                      label={`Code Format (${storeCurrency} 100.00)`}
                      checked={currencyDisplayType === "CODE"}
                      id="code"
                      name="displayType"
                      onChange={() => setCurrencyDisplayType("CODE")}
                    />
                  </BlockStack>
                  
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Preview
                      </Text>
                      <Text as="p" variant="headingLg">
                        {formatCurrencyExample(storeCurrency, currencyDisplayType)}
                      </Text>
                    </BlockStack>
                  </Box>
                </FormLayout>
              </BlockStack>
            </Card>

            {/* Timezone Settings */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Timezone Settings
                </Text>
                <FormLayout>
                  <TextField
                    label="Store Timezone"
                    value={shopifyTimezone || timezone}
                    disabled
                    autoComplete="off"
                    helpText="Automatically synced from your Shopify store settings"
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            {/* Metadata */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Settings Information
                </Text>
                <InlineStack gap="400">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Created
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {new Date(settings.createdAt).toLocaleDateString()}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Last Updated
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {new Date(settings.updatedAt).toLocaleDateString()}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Settings ID
                    </Text>
                    <Badge tone="info">{`${settings.id.slice(0, 8)}...`}</Badge>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                About Settings
              </Text>
              <Text as="p" variant="bodyMd">
                Configure your store's display preferences and regional settings.
              </Text>
              <Divider />
              <Text as="p" variant="bodyMd">
                <strong>Currency:</strong> Determines how prices and store credit are displayed to customers.
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Timezone:</strong> Used for scheduling tier evaluations and calculating time-based metrics.
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Store Info:</strong> Displayed in customer communications and reports.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}