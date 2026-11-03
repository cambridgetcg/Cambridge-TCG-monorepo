/**
 * FirstRunSetupCard - the dashboard's setup steps for a new shop
 *
 * A fresh install earns nothing until the shop has a tier, and issues
 * nothing to Shopify until automatic cashback is on; shoppers see nothing
 * until the widget's app embed is on in the theme. Each step links to where
 * it is done and shows Done once it is.
 */

import { Badge, BlockStack, Button, Card, Divider, InlineStack, Text } from "@shopify/polaris";
import { Fragment, type ReactNode } from "react";

export interface FirstRunSetupState {
  hasTier: boolean;
  autoCashbackOn: boolean;
  widgetOn: boolean;
  /** Theme editor deep link that opens with the membership widget embed switched on */
  themeEditorUrl: string;
}

export interface FirstRunSetupCardProps extends FirstRunSetupState {
  onCreateTier: () => void;
  onTurnOnCashback: () => void;
  onDismiss: () => void;
  /** Shop-specific warnings shown above the steps */
  notices?: ReactNode;
}

export function shouldShowFirstRunSetup(state: FirstRunSetupState, dismissed: boolean): boolean {
  return !dismissed && !(state.hasTier && state.autoCashbackOn && state.widgetOn);
}

export function FirstRunSetupCard({
  hasTier,
  autoCashbackOn,
  widgetOn,
  themeEditorUrl,
  onCreateTier,
  onTurnOnCashback,
  onDismiss,
  notices,
}: FirstRunSetupCardProps) {
  const steps = [
    {
      title: "Create your first tier",
      description:
        "Cashback is a percentage of each order, set by the customer's tier. Until a tier exists, orders earn nothing.",
      done: hasTier,
      action: <Button onClick={onCreateTier}>Create a tier</Button>,
    },
    {
      title: "Turn on automatic cashback",
      description:
        "Sends each order's cashback to the customer as Shopify store credit. While it's off, cashback waits on the Orders page for you to issue.",
      done: autoCashbackOn,
      action: <Button onClick={onTurnOnCashback}>Turn on</Button>,
    },
    {
      title: "Turn on the rewards widget",
      description:
        "Opens your theme editor with the RewardsPro widget switched on, so shoppers can see their tier and store credit. Click Save in the theme editor to publish it.",
      done: widgetOn,
      action: (
        <Button url={themeEditorUrl} target="_blank">
          Open theme editor
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text variant="headingMd" as="h2">
              Get RewardsPro ready
            </Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Finish these steps so customers earn cashback and can see it.
            </Text>
          </BlockStack>
          <Button variant="plain" onClick={onDismiss}>
            Dismiss
          </Button>
        </InlineStack>

        {notices}

        {steps.map((step) => (
          <Fragment key={step.title}>
            <Divider />
            <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
              <BlockStack gap="050">
                <Text variant="headingSm" as="h3">
                  {step.title}
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  {step.description}
                </Text>
              </BlockStack>
              {step.done ? <Badge tone="success">Done</Badge> : step.action}
            </InlineStack>
          </Fragment>
        ))}
      </BlockStack>
    </Card>
  );
}
