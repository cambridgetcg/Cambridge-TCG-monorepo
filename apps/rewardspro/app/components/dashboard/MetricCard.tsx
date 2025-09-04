import { Card, BlockStack, InlineStack, Text, Badge, Icon, Box } from "@shopify/polaris";
import type { FunctionComponent, SVGProps } from "react";
import { memo } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: FunctionComponent<SVGProps<SVGSVGElement>>;
  badge?: {
    content: string;
    tone: "success" | "warning" | "critical" | "info" | "attention" | "new";
  };
  trend?: {
    value: string;
    positive: boolean;
  };
  onClick?: () => void;
}

export const MetricCard = memo(function MetricCard({
  title,
  value,
  subtitle,
  icon,
  badge,
  trend,
  onClick,
}: MetricCardProps) {
  const cardContent = (
    <Card roundedAbove="sm">
      <Box padding="400">
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Box
              background="bg-fill-secondary"
              padding="200"
              borderRadius="200"
            >
              <Icon source={icon} tone="base" />
            </Box>
            {badge && (
              <Badge tone={badge.tone} size="small">
                {badge.content}
              </Badge>
            )}
          </InlineStack>
          
          <BlockStack gap="100">
            <Text as="p" variant="heading2xl" fontWeight="bold">
              {typeof value === "number" ? value.toLocaleString() : value}
            </Text>
            
            {trend && (
              <Text 
                as="span" 
                variant="bodySm" 
                tone={trend.positive ? "success" : "critical"}
              >
                {trend.positive ? "↑" : "↓"} {trend.value}
              </Text>
            )}
            
            <Text as="h3" variant="headingSm" tone="subdued">
              {title}
            </Text>
            
            <Text as="p" variant="bodySm" tone="subdued">
              {subtitle}
            </Text>
          </BlockStack>
        </BlockStack>
      </Box>
    </Card>
  );

  if (onClick) {
    return (
      <div 
        onClick={onClick} 
        style={{ cursor: "pointer" }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        aria-label={`${title}: ${value}`}
      >
        {cardContent}
      </div>
    );
  }

  return cardContent;
});