import { useState, useCallback } from "react";
import { useNavigate, useSubmit } from "@remix-run/react";
import {
  Card,
  BlockStack,
  Text,
  InlineStack,
  Button,
  Icon,
  Box,
  ProgressBar,
  Banner,
  Divider,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  CircleIcon,
  RefreshIcon,
  PersonIcon,
  CashDollarIcon,
  ProductIcon,
  SettingsIcon,
} from "~/utils/polaris-icons";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface OnboardingProgress {
  syncedOrders: boolean;
  createdTiers: boolean;
  syncedCustomers: boolean;
  configuredSettings: boolean;
  completed: boolean;
  dismissed: boolean;
}

export interface OnboardingChecklistProps {
  progress: OnboardingProgress;
  shop: string;
  onDismiss?: () => void;
}

interface ChecklistStep {
  id: keyof OnboardingProgress;
  title: string;
  description: string;
  icon: React.ComponentType;
  actionLabel: string;
  actionUrl: string;
  completed: boolean;
  helpText?: string;
}

// ============================================
// COMPONENT
// ============================================

export function OnboardingChecklist({
  progress,
  shop,
  onDismiss
}: OnboardingChecklistProps) {
  const navigate = useNavigate();
  const submit = useSubmit();
  const [isDismissing, setIsDismissing] = useState(false);

  // Calculate completion percentage
  const steps: ChecklistStep[] = [
    {
      id: "configuredSettings",
      title: "Set currency for store credit",
      description: "Configure your store currency and display preferences",
      icon: SettingsIcon,
      actionLabel: "Configure settings",
      actionUrl: "/app/settings",
      completed: progress.configuredSettings,
      helpText: "This determines how cashback amounts are displayed to customers",
    },
    {
      id: "createdTiers",
      title: "Create tier products",
      description: "Set up your loyalty tiers with cashback percentages",
      icon: ProductIcon,
      actionLabel: "Create tiers",
      actionUrl: "/app/tier-products",
      completed: progress.createdTiers,
      helpText: "Tiers let you reward your best customers with higher cashback rates",
    },
    {
      id: "syncedCustomers",
      title: "Sync customers",
      description: "Import your existing customers from Shopify",
      icon: PersonIcon,
      actionLabel: "Sync customers",
      actionUrl: "/app/customers",
      completed: progress.syncedCustomers,
      helpText: "Connect your existing customer base to start tracking rewards",
    },
    {
      id: "syncedOrders",
      title: "Sync orders",
      description: "Import historical orders to calculate customer spending and tiers",
      icon: CashDollarIcon,
      actionLabel: "Sync orders",
      actionUrl: "/app/orders-sync",
      completed: progress.syncedOrders,
      helpText: "Historical data helps assign customers to the right tier automatically",
    },
  ];

  const completedCount = steps.filter(step => step.completed).length;
  const totalSteps = steps.length;
  const completionPercentage = (completedCount / totalSteps) * 100;
  const isFullyComplete = completedCount === totalSteps;

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    if (window.confirm("Are you sure you want to dismiss this checklist? You can always complete these steps later.")) {
      setIsDismissing(true);

      const formData = new FormData();
      formData.set("action", "dismiss_onboarding");
      submit(formData, { method: "post" });

      if (onDismiss) {
        onDismiss();
      }
    }
  }, [submit, onDismiss]);

  // Handle complete checklist
  const handleComplete = useCallback(() => {
    const formData = new FormData();
    formData.set("action", "complete_onboarding");
    submit(formData, { method: "post" });
  }, [submit]);

  // Don't show if dismissed
  if (progress.dismissed) {
    return null;
  }

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          {/* Header */}
          <InlineStack align="space-between" blockAlign="start">
            <BlockStack gap="200">
              <InlineStack gap="200" align="start">
                <Icon source={isFullyComplete ? CheckCircleIcon : RefreshIcon} tone={isFullyComplete ? "success" : "base"} />
                <Text as="h2" variant="headingMd">
                  {isFullyComplete ? "Setup Complete!" : "Get Started with RewardsPro"}
                </Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                {isFullyComplete
                  ? "Congratulations! Your rewards program is ready to go."
                  : "Complete these steps to set up your loyalty rewards program"}
              </Text>
            </BlockStack>
            {!isFullyComplete && (
              <Button
                plain
                onClick={handleDismiss}
                loading={isDismissing}
              >
                Dismiss
              </Button>
            )}
          </InlineStack>

          {/* Progress Bar */}
          <BlockStack gap="200">
            <InlineStack align="space-between">
              <Text as="span" variant="bodySm" fontWeight="semibold">
                {completedCount} of {totalSteps} completed
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {Math.round(completionPercentage)}%
              </Text>
            </InlineStack>
            <ProgressBar
              progress={completionPercentage}
              tone={isFullyComplete ? "success" : completionPercentage > 50 ? "primary" : "subdued"}
              size="small"
            />
          </BlockStack>

          {/* Completion Banner */}
          {isFullyComplete && !progress.completed && (
            <>
              <Banner
                title="You're all set!"
                tone="success"
                onDismiss={handleDismiss}
              >
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Your rewards program is configured and ready to start rewarding customers.
                    New orders will automatically earn cashback based on customer tiers.
                  </Text>
                  <InlineStack gap="200">
                    <Button onClick={handleComplete} variant="primary">
                      Mark as complete
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Banner>
            </>
          )}

          <Divider />

          {/* Checklist Items */}
          <BlockStack gap="300">
            {steps.map((step, index) => (
              <Box
                key={step.id}
                paddingBlock="300"
                paddingInline="300"
                background={step.completed ? "bg-fill-success-secondary" : "bg-fill"}
                borderRadius="200"
              >
                <InlineStack align="space-between" blockAlign="start">
                  <InlineStack gap="300" align="start" blockAlign="start">
                    {/* Icon or Checkmark */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: step.completed
                          ? 'var(--p-color-bg-fill-success)'
                          : 'var(--p-color-bg-fill-tertiary)',
                        border: step.completed
                          ? '2px solid var(--p-color-border-success)'
                          : '2px solid var(--p-color-border)',
                      }}
                    >
                      <Icon
                        source={step.completed ? CheckCircleIcon : step.icon}
                        tone={step.completed ? "success" : "base"}
                      />
                    </div>

                    {/* Content */}
                    <BlockStack gap="100">
                      <InlineStack gap="200" align="start" blockAlign="center">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {step.title}
                        </Text>
                        {step.completed && (
                          <Icon source={CheckCircleIcon} tone="success" />
                        )}
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {step.description}
                      </Text>
                      {step.helpText && !step.completed && (
                        <Text as="p" variant="bodySm" tone="info">
                          💡 {step.helpText}
                        </Text>
                      )}
                    </BlockStack>
                  </InlineStack>

                  {/* Action Button */}
                  {!step.completed && (
                    <Button
                      onClick={() => navigate(step.actionUrl)}
                      variant="primary"
                      size="slim"
                    >
                      {step.actionLabel}
                    </Button>
                  )}
                </InlineStack>
              </Box>
            ))}
          </BlockStack>

          {/* Bottom Help Text */}
          {!isFullyComplete && (
            <Banner tone="info">
              <Text as="p" variant="bodySm">
                <strong>Need help?</strong> Complete these steps in order for the best experience.
                You can come back to this checklist anytime from your dashboard.
              </Text>
            </Banner>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}
