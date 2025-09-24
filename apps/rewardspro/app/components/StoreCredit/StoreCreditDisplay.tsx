import { Text, Badge } from "@shopify/polaris";
import { formatCurrency } from "~/utils/currency";

interface StoreCreditDisplayProps {
  amount: number | string;
  shopSettings?: {
    storeCurrency: string;
    currencyDisplayType: string;
  } | null;
  size?: "small" | "medium" | "large";
  tone?: "success" | "warning" | "critical" | "subdued";
}

export function StoreCreditDisplay({
  amount,
  shopSettings,
  size = "medium",
  tone
}: StoreCreditDisplayProps) {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  const formattedAmount = shopSettings
    ? formatCurrency(numAmount, shopSettings as any)
    : `$${numAmount.toFixed(2)}`;

  const getTone = () => {
    if (tone) return tone;
    if (numAmount > 100) return "success";
    if (numAmount > 0) return undefined;
    return "subdued";
  };

  const getTextVariant = () => {
    switch (size) {
      case "small": return "bodySm";
      case "large": return "headingMd";
      default: return "bodyMd";
    }
  };

  if (size === "large") {
    return (
      <Badge tone={getTone() as any}>
        {formattedAmount}
      </Badge>
    );
  }

  return (
    <Text as="span" variant={getTextVariant()} fontWeight="semibold" tone={getTone()}>
      {formattedAmount}
    </Text>
  );
}