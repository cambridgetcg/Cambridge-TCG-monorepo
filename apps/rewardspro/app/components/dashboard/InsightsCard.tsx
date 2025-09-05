import { 
  Card, 
  BlockStack, 
  Text, 
  Icon,
  InlineStack,
  Box 
} from "@shopify/polaris";
import { 
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon
} from "@shopify/polaris-icons";

interface Metrics {
  totalCustomers: number;
  customersChange: number;
  activeTiers: number;
  tiersWithCustomers: number;
}

export default function InsightsCard({ metrics }: { metrics: Metrics }) {
  const insights = {
    needsMoreTiers: metrics.activeTiers < 3,
    goodCustomerGrowth: metrics.customersChange > 5,
    highEngagement: metrics.tiersWithCustomers > metrics.activeTiers / 2,
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack gap="200" blockAlign="center">
          <Icon source={AlertTriangleIcon} tone="warning" />
          <Text variant="headingMd" as="h3">
            Insights
          </Text>
        </InlineStack>

        <BlockStack gap="300">
          {insights.needsMoreTiers && (
            <Box
              padding="300"
              background="bg-surface-warning"
              borderRadius="200"
            >
              <BlockStack gap="100">
                <Text variant="bodyMd" fontWeight="semibold" as="p">
                  Add More Tiers
                </Text>
                <Text variant="bodySm" as="p">
                  Consider adding more tiers to provide better progression for
                  customers.
                </Text>
              </BlockStack>
            </Box>
          )}

          {insights.goodCustomerGrowth && (
            <Box
              padding="300"
              background="bg-surface-success"
              borderRadius="200"
            >
              <BlockStack gap="100">
                <InlineStack gap="100" blockAlign="center">
                  <Icon source={CheckCircleIcon} tone="success" />
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    Growing Customer Base
                  </Text>
                </InlineStack>
                <Text variant="bodySm" as="p">
                  Great job! Your customer base is growing steadily.
                </Text>
              </BlockStack>
            </Box>
          )}

          {!insights.highEngagement && (
            <Box
              padding="300"
              background="bg-surface-info"
              borderRadius="200"
            >
              <BlockStack gap="100">
                <InlineStack gap="100" blockAlign="center">
                  <Icon source={InfoIcon} tone="info" />
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    Boost Engagement
                  </Text>
                </InlineStack>
                <Text variant="bodySm" as="p">
                  Consider promotional campaigns to move customers to higher
                  tiers.
                </Text>
              </BlockStack>
            </Box>
          )}

          {!insights.needsMoreTiers && !insights.goodCustomerGrowth && insights.highEngagement && (
            <Box
              padding="300"
              background="bg-surface-success"
              borderRadius="200"
            >
              <BlockStack gap="100">
                <InlineStack gap="100" blockAlign="center">
                  <Icon source={CheckCircleIcon} tone="success" />
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    Excellent Performance
                  </Text>
                </InlineStack>
                <Text variant="bodySm" as="p">
                  Your loyalty program is performing optimally with good tier
                  distribution and customer engagement.
                </Text>
              </BlockStack>
            </Box>
          )}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}