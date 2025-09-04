import { memo, useState, useCallback } from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Icon,
  Box,
  Popover,
  ActionList,
  Avatar,
} from "@shopify/polaris";
import {
  StarFilledIcon,
  EditIcon,
  DeleteIcon,
  DuplicateIcon,
  PersonSegmentIcon,
  CashDollarFilledIcon,
  CalendarIcon,
  ChevronDownIcon,
} from "../../utils/polaris-icons";

export interface TierData {
  id: string;
  name: string;
  minSpend: number;
  cashbackPercent: number;
  evaluationPeriod: "ANNUAL" | "LIFETIME";
  description?: string;
  customerCount?: number;
  totalRewardsDistributed?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface TierCardProps {
  tier: TierData;
  onEdit: (tier: TierData) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (tier: TierData) => void;
  onViewCustomers?: (tierId: string) => void;
  isDeleting?: boolean;
  position?: number;
  totalTiers?: number;
}

export const TierCard = memo(function TierCard({
  tier,
  onEdit,
  onDelete,
  onDuplicate,
  onViewCustomers,
  isDeleting = false,
  position,
  totalTiers,
}: TierCardProps) {
  const [popoverActive, setPopoverActive] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  
  const togglePopover = useCallback(
    () => setPopoverActive((active) => !active),
    []
  );
  
  const handleDelete = useCallback(() => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
    } else {
      onDelete(tier.id);
      setDeleteConfirm(false);
      setPopoverActive(false);
    }
  }, [deleteConfirm, onDelete, tier.id]);
  
  const getTierColor = useCallback((name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("bronze")) return "warning-weak";
    if (lowerName.includes("silver")) return "info-weak";
    if (lowerName.includes("gold")) return "warning";
    if (lowerName.includes("platinum")) return "success";
    if (lowerName.includes("diamond")) return "magic";
    return "info";
  }, []);
  
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);
  
  const formatDate = useCallback((date?: string) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);
  
  const activator = (
    <Button
      variant="tertiary"
      icon={ChevronDownIcon}
      onClick={togglePopover}
      accessibilityLabel="More actions"
    />
  );
  
  return (
    <Card roundedAbove="sm">
      <Box padding="400">
        <BlockStack gap="400">
          {/* Header */}
          <InlineStack align="space-between" wrap={false}>
            <InlineStack gap="300" align="start" blockAlign="center">
              <Box
                background="bg-fill-warning"
                padding="200"
                borderRadius="200"
              >
                <Icon source={StarFilledIcon} tone="warning" />
              </Box>
              
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    {tier.name}
                  </Text>
                  {position && totalTiers && (
                    <Badge tone="info" size="small">
                      Tier {position} of {totalTiers}
                    </Badge>
                  )}
                </InlineStack>
                
                {tier.description && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {tier.description}
                  </Text>
                )}
              </BlockStack>
            </InlineStack>
            
            <InlineStack gap="200">
              <Button
                icon={EditIcon}
                onClick={() => onEdit(tier)}
                accessibilityLabel={`Edit ${tier.name} tier`}
              >
                Edit
              </Button>
              
              <Popover
                active={popoverActive}
                activator={activator}
                onClose={togglePopover}
                preferredAlignment="right"
              >
                <ActionList
                  items={[
                    {
                      content: "Edit tier",
                      icon: EditIcon,
                      onAction: () => {
                        onEdit(tier);
                        setPopoverActive(false);
                      },
                    },
                    ...(onDuplicate
                      ? [{
                          content: "Duplicate tier",
                          icon: DuplicateIcon,
                          onAction: () => {
                            onDuplicate(tier);
                            setPopoverActive(false);
                          },
                        }]
                      : []),
                    ...(onViewCustomers && tier.customerCount
                      ? [{
                          content: `View customers (${tier.customerCount})`,
                          icon: PersonSegmentIcon,
                          onAction: () => {
                            onViewCustomers(tier.id);
                            setPopoverActive(false);
                          },
                        }]
                      : []),
                    {
                      content: deleteConfirm ? "Click again to confirm" : "Delete tier",
                      icon: DeleteIcon,
                      destructive: true,
                      onAction: handleDelete,
                    },
                  ]}
                />
              </Popover>
            </InlineStack>
          </InlineStack>
          
          {/* Key Metrics */}
          <Box
            background="bg-surface-secondary"
            padding="300"
            borderRadius="200"
          >
            <InlineStack gap="600" wrap>
              {/* Minimum Spend */}
              <BlockStack gap="100">
                <InlineStack gap="100" blockAlign="center">
                  <Icon source={CashDollarFilledIcon} tone="subdued" />
                  <Text as="p" variant="bodySm" tone="subdued">
                    Minimum Spend
                  </Text>
                </InlineStack>
                <Text as="p" variant="headingMd" fontWeight="semibold">
                  {formatCurrency(tier.minSpend)}
                </Text>
              </BlockStack>
              
              {/* Cashback Rate */}
              <BlockStack gap="100">
                <InlineStack gap="100" blockAlign="center">
                  <Icon source={StarFilledIcon} tone="subdued" />
                  <Text as="p" variant="bodySm" tone="subdued">
                    Cashback Rate
                  </Text>
                </InlineStack>
                <Text as="p" variant="headingMd" fontWeight="semibold">
                  {tier.cashbackPercent}%
                </Text>
              </BlockStack>
              
              {/* Evaluation Period */}
              <BlockStack gap="100">
                <InlineStack gap="100" blockAlign="center">
                  <Icon source={CalendarIcon} tone="subdued" />
                  <Text as="p" variant="bodySm" tone="subdued">
                    Evaluation
                  </Text>
                </InlineStack>
                <Badge
                  tone={tier.evaluationPeriod === "ANNUAL" ? "info" : "success"}
                  size="medium"
                >
                  {tier.evaluationPeriod === "ANNUAL" ? "12 Months" : "Lifetime"}
                </Badge>
              </BlockStack>
              
              {/* Customer Count */}
              {tier.customerCount !== undefined && (
                <BlockStack gap="100">
                  <InlineStack gap="100" blockAlign="center">
                    <Icon source={PersonSegmentIcon} tone="subdued" />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Customers
                    </Text>
                  </InlineStack>
                  <Text as="p" variant="headingMd" fontWeight="semibold">
                    {tier.customerCount.toLocaleString()}
                  </Text>
                </BlockStack>
              )}
            </InlineStack>
          </Box>
          
          {/* Additional Stats */}
          {(tier.totalRewardsDistributed || tier.createdAt) && (
            <InlineStack gap="400">
              {tier.totalRewardsDistributed !== undefined && (
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total Rewards Distributed
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    {formatCurrency(tier.totalRewardsDistributed)}
                  </Text>
                </BlockStack>
              )}
              
              {tier.createdAt && (
                <BlockStack gap="050">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Created
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {formatDate(tier.createdAt)}
                  </Text>
                </BlockStack>
              )}
            </InlineStack>
          )}
          
          {/* Warning for high cashback */}
          {tier.cashbackPercent > 10 && (
            <Banner tone="warning">
              <Text as="p" variant="bodySm">
                High cashback rate ({tier.cashbackPercent}%). Ensure this aligns with your profit margins.
              </Text>
            </Banner>
          )}
          
          {/* Info for no customers */}
          {tier.customerCount === 0 && (
            <Banner tone="info">
              <Text as="p" variant="bodySm">
                No customers in this tier yet. They'll be automatically assigned based on their spending.
              </Text>
            </Banner>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
});