import { Card, BlockStack, InlineStack, Text, Button, Icon, Box } from "@shopify/polaris";
import { ArrowRightIcon } from "@shopify/polaris-icons";
import type { FunctionComponent, SVGProps } from "react";
import { memo } from "react";

interface QuickActionCardProps {
  title: string;
  description: string;
  icon: FunctionComponent<SVGProps<SVGSVGElement>>;
  buttonText?: string;
  buttonVariant?: "primary" | "secondary" | "plain";
  isHighPriority?: boolean;
  badge?: string;
  onClick: () => void;
}

export const QuickActionCard = memo(function QuickActionCard({
  title,
  description,
  icon,
  buttonText = "Get Started",
  buttonVariant = "secondary",
  isHighPriority = false,
  badge,
  onClick,
}: QuickActionCardProps) {
  return (
    <Card roundedAbove="sm">
      <Box 
        padding="400"
        background={isHighPriority ? "bg-surface-caution-hover" : undefined}
      >
        <BlockStack gap="400">
          <InlineStack gap="300" align="space-between" wrap={false}>
            <InlineStack gap="300" blockAlign="start">
              <Box
                background={isHighPriority ? "bg-fill-caution" : "bg-fill-secondary"}
                padding="200"
                borderRadius="200"
                minWidth="40px"
                minHeight="40px"
              >
                <Icon source={icon} tone={isHighPriority ? "caution" : "base"} />
              </Box>
              
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingSm" fontWeight="semibold">
                    {title}
                  </Text>
                  {badge && (
                    <Box
                      padding="050"
                      paddingInlineStart="150"
                      paddingInlineEnd="150"
                      background="bg-fill-warning"
                      borderRadius="100"
                    >
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        {badge}
                      </Text>
                    </Box>
                  )}
                </InlineStack>
                
                <Text as="p" variant="bodyMd" tone="subdued">
                  {description}
                </Text>
              </BlockStack>
            </InlineStack>
          </InlineStack>
          
          <Button
            fullWidth
            variant={buttonVariant === "primary" || isHighPriority ? "primary" : buttonVariant === "plain" ? "plain" : undefined}
            onClick={onClick}
            icon={ArrowRightIcon}
            accessibilityLabel={`${buttonText} for ${title}`}
          >
            {buttonText}
          </Button>
        </BlockStack>
      </Box>
    </Card>
  );
});