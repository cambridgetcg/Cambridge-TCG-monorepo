import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Badge,
  Divider,
  Banner,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { SubscriptionOptionsManager, type SubscriptionOption } from "../components/SubscriptionOptionsManager";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }
  
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop: session.shop }
  });
  
  return json({
    shop: session.shop,
    currency: shopSettings?.storeCurrency || "USD"
  });
};

export default function SubscriptionDemo() {
  const { currency } = useLoaderData<typeof loader>();
  
  // Demo states
  const [basePrice, setBasePrice] = useState("29.99");
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(true);
  const [subscriptionOptions, setSubscriptionOptions] = useState<SubscriptionOption>({
    enableMonthly: true,
    enableQuarterly: true,
    enableAnnual: true,
    monthlyDiscount: "0",
    quarterlyDiscount: "10",
    annualDiscount: "20",
    trialDays: "7",
    anchorType: 'MONTHDAY',
    anchorDay: "1",
    deliveryPolicy: 'IMMEDIATE',
    inventoryPolicy: 'CONTINUE'
  });
  
  // Compact mode state
  const [compactEnabled, setCompactEnabled] = useState(false);
  const [compactOptions, setCompactOptions] = useState<SubscriptionOption>({
    enableMonthly: true,
    enableQuarterly: false,
    enableAnnual: false,
    monthlyDiscount: "0",
    quarterlyDiscount: "5",
    annualDiscount: "15",
  });
  
  const handleExport = () => {
    const config = {
      enabled: subscriptionEnabled,
      basePrice,
      options: subscriptionOptions
    };
    console.log("Subscription Configuration:", config);
    alert("Configuration exported to console!");
  };
  
  return (
    <Page
      title="Subscription Options Manager Demo"
      subtitle="Interactive demonstration of the subscription pricing component"
      backAction={{ content: "Products", url: "/app/tier-products" }}
      primaryAction={{
        content: "Export Configuration",
        onAction: handleExport,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {/* Information Banner */}
            <Banner
              title="Component Demonstration"
              tone="info"
            >
              <p>
                This page demonstrates the SubscriptionOptionsManager component with various configurations.
                Try adjusting the base price and subscription options to see real-time pricing calculations.
              </p>
            </Banner>
            
            {/* Configuration Card */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Test Configuration
                </Text>
                <TextField
                  label="Base Product Price"
                  type="number"
                  value={basePrice}
                  onChange={setBasePrice}
                  prefix={currency}
                  helpText="This is the regular price before any subscription discounts"
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
            
            {/* Full Feature Mode */}
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingLg" as="h2">
                  Full Feature Mode
                </Text>
                <Badge tone="success">Advanced Options Enabled</Badge>
              </InlineStack>
              
              <SubscriptionOptionsManager
                enabled={subscriptionEnabled}
                onEnabledChange={setSubscriptionEnabled}
                options={subscriptionOptions}
                onOptionsChange={setSubscriptionOptions}
                basePrice={basePrice}
                currency={currency}
                showAdvanced={true}
                compactMode={false}
              />
            </BlockStack>
            
            <Divider />
            
            {/* Compact Mode */}
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingLg" as="h2">
                  Compact Mode
                </Text>
                <Badge>Simplified UI</Badge>
              </InlineStack>
              
              <Card>
                <SubscriptionOptionsManager
                  enabled={compactEnabled}
                  onEnabledChange={setCompactEnabled}
                  options={compactOptions}
                  onOptionsChange={setCompactOptions}
                  basePrice={basePrice}
                  currency={currency}
                  showAdvanced={false}
                  compactMode={true}
                />
              </Card>
            </BlockStack>
            
            {/* Current Configuration Display */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Current Configuration (Full Mode)
                </Text>
                
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold" as="span">
                        Status:
                      </Text>
                      <Badge tone={subscriptionEnabled ? "success" : "critical"}>
                        {subscriptionEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </InlineStack>
                    
                    {subscriptionEnabled && (
                      <>
                        <InlineStack gap="200">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            Enabled Intervals:
                          </Text>
                          <InlineStack gap="100">
                            {subscriptionOptions.enableMonthly && <Badge>Monthly</Badge>}
                            {subscriptionOptions.enableQuarterly && <Badge>Quarterly</Badge>}
                            {subscriptionOptions.enableAnnual && <Badge>Annual</Badge>}
                          </InlineStack>
                        </InlineStack>
                        
                        <InlineStack gap="200">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            Discounts:
                          </Text>
                          <Text variant="bodyMd" as="span">
                            M: {subscriptionOptions.monthlyDiscount}% | 
                            Q: {subscriptionOptions.quarterlyDiscount}% | 
                            A: {subscriptionOptions.annualDiscount}%
                          </Text>
                        </InlineStack>
                        
                        {subscriptionOptions.trialDays && (
                          <InlineStack gap="200">
                            <Text variant="bodyMd" fontWeight="semibold" as="span">
                              Trial Period:
                            </Text>
                            <Text variant="bodyMd" as="span">
                              {subscriptionOptions.trialDays} days
                            </Text>
                          </InlineStack>
                        )}
                        
                        <InlineStack gap="200">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            Billing Anchor:
                          </Text>
                          <Text variant="bodyMd" as="span">
                            {subscriptionOptions.anchorType}
                            {subscriptionOptions.anchorDay && ` (Day ${subscriptionOptions.anchorDay})`}
                          </Text>
                        </InlineStack>
                      </>
                    )}
                  </BlockStack>
                </Box>
                
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    JSON Output
                  </Text>
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <pre style={{ 
                      fontSize: '12px', 
                      lineHeight: '1.5',
                      overflow: 'auto',
                      fontFamily: 'monospace'
                    }}>
                      {JSON.stringify({
                        enabled: subscriptionEnabled,
                        basePrice,
                        currency,
                        options: subscriptionOptions
                      }, null, 2)}
                    </pre>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>
            
            {/* Features Card */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Component Features
                </Text>
                
                <BlockStack gap="300">
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold" as="span">✅</Text>
                      <Text variant="bodyMd" as="span">
                        Real-time pricing calculations with discount preview
                      </Text>
                    </InlineStack>
                  </Box>
                  
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold" as="span">✅</Text>
                      <Text variant="bodyMd" as="span">
                        Support for monthly, quarterly, and annual billing cycles
                      </Text>
                    </InlineStack>
                  </Box>
                  
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold" as="span">✅</Text>
                      <Text variant="bodyMd" as="span">
                        Advanced options: trial periods, billing anchors, delivery policies
                      </Text>
                    </InlineStack>
                  </Box>
                  
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold" as="span">✅</Text>
                      <Text variant="bodyMd" as="span">
                        Compact mode for modal/inline usage
                      </Text>
                    </InlineStack>
                  </Box>
                  
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold" as="span">✅</Text>
                      <Text variant="bodyMd" as="span">
                        Customer-friendly pricing preview with savings badges
                      </Text>
                    </InlineStack>
                  </Box>
                  
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold" as="span">✅</Text>
                      <Text variant="bodyMd" as="span">
                        Input validation and error prevention
                      </Text>
                    </InlineStack>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}