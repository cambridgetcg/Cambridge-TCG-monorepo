import { Box, InlineStack, BlockStack, Text, Badge, Icon, Button } from "@shopify/polaris";
import { StarFilledIcon, EditIcon } from "@shopify/polaris-icons";
import { memo } from "react";

interface TierCardProps {
  tier: {
    id: string;
    name: string;
    minSpend: number;
    cashbackPercent: number;
    evaluationPeriod: string;
    customerCount?: number;
  };
  isActive?: boolean;
  onEdit?: () => void;
}

export const TierCard = memo(function TierCard({
  tier,
  isActive = false,
  onEdit,
}: TierCardProps) {
  return (
    <Box
      padding="400"
      background={isActive ? "bg-surface-success-hover" : "bg-surface-secondary"}
      borderRadius="300"
      borderColor={isActive ? "border-success" : "border"}
      borderWidth="025"
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" wrap={false}>
          <InlineStack gap="300" align="start" blockAlign="center">
            <Box
              background="bg-fill-warning"
              padding="150"
              borderRadius="200"
            >
              <Icon source={StarFilledIcon} tone="warning" />
            </Box>
            
            <BlockStack gap="050">
              <Text as="h3" variant="headingMd" fontWeight="semibold">
                {tier.name}
              </Text>
              <InlineStack gap="200">
                <Badge size="small" tone="info">
                  ${tier.minSpend}+ {tier.evaluationPeriod.toLowerCase()}
                </Badge>
                <Badge size="small" tone="success">
                  {tier.cashbackPercent}% cashback
                </Badge>
              </InlineStack>
            </BlockStack>
          </InlineStack>

          {onEdit && (
            <Button
              icon={EditIcon}
              size="slim"
              onClick={onEdit}
              accessibilityLabel={`Edit ${tier.name} tier`}
            />
          )}
        </InlineStack>

        {tier.customerCount !== undefined && (
          <Box paddingBlockStart="200" borderBlockStartWidth="025" borderColor="border">
            <Text as="p" variant="bodySm" tone="subdued">
              {tier.customerCount} {tier.customerCount === 1 ? "customer" : "customers"} in this tier
            </Text>
          </Box>
        )}
      </BlockStack>
    </Box>
  );
});