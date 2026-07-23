import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Select,
  TextField,
  Divider,
  InlineGrid,
  Banner,
  Checkbox,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "~/db.server";
import { guardInHouseRoute } from "~/services/marketing-mode.server";
import { checkLimitAccess } from "~/utils/require-feature.server";
import { PageLimitStatus } from "~/components/Billing/UpgradePrompt";
import {
  ChoiceCardGroup,
  type ChoiceCardOption,
  type ChoiceCardSection,
} from "~/components/ChoiceCardGroup";

// ============================================
// TYPES
// ============================================

interface Tier {
  id: string;
  name: string;
  cashbackPercent: number;
}

interface Template {
  id: string;
  name: string;
}

interface LoaderData {
  shop: string;
  tiers: Tier[];
  templates: Template[];
  limitAccess: {
    canCreate: boolean;
    current: number;
    max: number;
    message?: string;
  };
}

type AutomationStep = 1 | 2 | 3 | 4;

type TriggerType =
  | "tier_change"
  | "purchase"
  | "birthday"
  | "inactive"
  | "cashback_earned"
  | "points_milestone"
  | "raffle_entered"
  | "raffle_won"
  | "raffle_ending"
  | "mystery_box_opened"
  | "mystery_box_won"
  | "rewards_dormant"
  | "gift_card_purchased"
  | "gift_card_received"
  | "store_credit_earned"
  | "store_credit_converted"
  | "store_credit_milestone"
  | "store_credit_balance_reminder";

type ActionType = "send_email" | "add_tag" | "award_points" | "create_discount";

const CUSTOMER_ACTIVITY_TRIGGERS = [
  {
    value: "tier_change",
    label: "Tier Change",
    description: "Triggered when a customer moves to a new tier",
  },
  {
    value: "purchase",
    label: "Purchase Made",
    description: "Triggered after a customer completes a purchase",
  },
  {
    value: "birthday",
    label: "Customer Birthday",
    description: "Triggered on the customer's birthday",
  },
  {
    value: "inactive",
    label: "Inactive Customer",
    description: "Triggered when a customer hasn't purchased in 30+ days",
  },
  {
    value: "cashback_earned",
    label: "Cashback Earned",
    description: "Triggered when a customer earns cashback",
  },
  {
    value: "points_milestone",
    label: "Points Milestone",
    description: "Triggered when customer reaches specific points",
  },
] satisfies readonly ChoiceCardOption<TriggerType>[];

const REWARDS_ENGAGEMENT_TRIGGERS = [
  {
    value: "raffle_entered",
    label: "Raffle Entry",
    description: "Triggered when customer enters a raffle",
  },
  {
    value: "raffle_won",
    label: "Raffle Win",
    description: "Triggered when customer wins a raffle prize",
  },
  {
    value: "raffle_ending",
    label: "Raffle Ending Soon",
    description: "Reminder when a raffle is about to close",
  },
  {
    value: "mystery_box_opened",
    label: "Mystery Box Opened",
    description: "Triggered when customer opens a mystery box",
  },
  {
    value: "mystery_box_won",
    label: "Mystery Box Prize",
    description: "Triggered when customer wins a prize",
  },
  {
    value: "rewards_dormant",
    label: "Rewards Dormant",
    description: "Customer hasn't used rewards in a while",
  },
] satisfies readonly ChoiceCardOption<TriggerType>[];

const STORE_VALUE_TRIGGERS = [
  {
    value: "gift_card_purchased",
    label: "Gift Card Purchased",
    description: "Triggered when customer buys a gift card",
  },
  {
    value: "gift_card_received",
    label: "Gift Card Received",
    description: "Triggered when customer receives a gift card",
  },
  {
    value: "store_credit_earned",
    label: "Store Credit Earned",
    description: "Triggered when customer earns store credit",
  },
  {
    value: "store_credit_converted",
    label: "Credit Converted",
    description: "Store credit converted to gift card",
  },
  {
    value: "store_credit_milestone",
    label: "Store Credit Milestone",
    description: "Customer reaches credit balance milestone",
  },
  {
    value: "store_credit_balance_reminder",
    label: "Balance Reminder",
    description: "Remind about unused store credit",
  },
] satisfies readonly ChoiceCardOption<TriggerType>[];

const TRIGGER_SECTIONS = [
  {
    heading: "Customer activity",
    options: CUSTOMER_ACTIVITY_TRIGGERS,
  },
  {
    heading: "Rewards engagement",
    options: REWARDS_ENGAGEMENT_TRIGGERS,
  },
  {
    heading: "Gift cards and store credit",
    options: STORE_VALUE_TRIGGERS,
  },
] satisfies readonly ChoiceCardSection<TriggerType>[];

const ACTION_OPTIONS = [
  {
    value: "send_email",
    label: "Send Email",
    description: "Send a templated email to the customer",
  },
  {
    value: "add_tag",
    label: "Add Customer Tag",
    description: "Add a tag to the customer in Shopify",
  },
  {
    value: "award_points",
    label: "Award Bonus Points",
    description: "Give the customer bonus loyalty points",
  },
  {
    value: "create_discount",
    label: "Create Discount Code",
    description: "Generate a unique discount code for the customer",
  },
] satisfies readonly ChoiceCardOption<ActionType>[];

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Rate-based model: All plans have access to automations

  // Guard: Redirect Klaviyo mode users to main Marketing Hub
  const guardRedirect = await guardInHouseRoute(shop);
  if (guardRedirect) return guardRedirect;

  // Check automation limit for rate-based gating
  const automationCount = await prisma.emailAutomation.count({ where: { shop } });
  const limitAccess = await checkLimitAccess(shop, 'maxAutomations', automationCount);

  // Fetch tiers for the shop
  const tiers = await prisma.tier.findMany({
    where: { shop },
    select: {
      id: true,
      name: true,
      cashbackPercent: true,
    },
    orderBy: { minSpend: 'asc' },
  });

  // Fetch templates for the action step
  let templates: Template[] = [];
  try {
    const dbTemplates = await prisma.emailTemplate.findMany({
      where: { shop, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    templates = dbTemplates;
  } catch (e) {
    // Table might not exist
  }

  return json<LoaderData>({
    shop,
    tiers,
    templates,
    limitAccess: {
      canCreate: limitAccess.hasAccess,
      current: automationCount,
      max: limitAccess.error?.maxLimit ?? 999999,
      message: limitAccess.error?.message,
    },
  });
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const trigger = formData.get("trigger") as string;
  const tierFilter = formData.get("tierFilter") as string;
  const minSpend = formData.get("minSpend") as string;
  const actionType = formData.get("actionType") as string;
  const templateId = formData.get("templateId") as string;
  const delay = formData.get("delay") as string;
  const respectBusinessHours = formData.get("respectBusinessHours") === "true";
  const respectTimezone = formData.get("respectTimezone") === "true";

  if (!name?.trim()) {
    return json({ error: "Automation name is required" }, { status: 400 });
  }

  if (!trigger) {
    return json({ error: "Trigger is required" }, { status: 400 });
  }

  // Check automation limit
  const automationCount = await prisma.emailAutomation.count({ where: { shop } });
  const limitAccess = await checkLimitAccess(shop, 'maxAutomations', automationCount);
  if (!limitAccess.hasAccess) {
    return json({ error: limitAccess.error?.message || "Automation limit reached" }, { status: 403 });
  }

  // Map delay string to minutes
  const delayMinutesMap: Record<string, number> = {
    immediate: 0,
    "1h": 60,
    "24h": 1440,
    "3d": 4320,
    "7d": 10080,
  };
  const delayMinutes = delayMinutesMap[delay] ?? 0;

  // Build conditions JSON
  const conditions: Record<string, unknown> = {
    actionType: actionType || "send_email",
    description: description || undefined,
    respectBusinessHours,
    respectTimezone,
  };
  if (tierFilter) conditions.tierFilter = tierFilter;
  if (minSpend) conditions.minSpend = parseFloat(minSpend);

  // Resolve templateId — if action is send_email but no template selected,
  // we still need a templateId for the required FK. If no template provided,
  // return an error for send_email actions.
  let resolvedTemplateId = templateId || "";
  if (actionType === "send_email" && !resolvedTemplateId) {
    return json({ error: "An email template is required for send_email actions" }, { status: 400 });
  }

  // For non-email actions, we need a placeholder template or the FK is violated.
  // Check if template exists when provided.
  if (resolvedTemplateId) {
    const templateExists = await prisma.emailTemplate.findFirst({
      where: { id: resolvedTemplateId, shop },
      select: { id: true },
    });
    if (!templateExists) {
      return json({ error: "Selected template not found" }, { status: 400 });
    }
  }

  const isActive = intent === "activate";

  try {
    const automation = await prisma.emailAutomation.create({
      data: {
        shop,
        name: name.trim(),
        trigger,
        templateId: resolvedTemplateId,
        isEnabled: isActive,
        conditions,
        delayMinutes,
      },
    });

    return redirect(`/app/marketing/automation/${automation.id}`);
  } catch (e: any) {
    console.error("[Automation Create] Error:", e);
    return json({ error: "Failed to create automation" }, { status: 500 });
  }
};

// ============================================
// COMPONENT
// ============================================

export default function CreateAutomation() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();
  const submit = useSubmit();

  // Step state
  const [currentStep, setCurrentStep] = useState<AutomationStep>(1);

  // Step 1: Setup
  const [automationName, setAutomationName] = useState("");
  const [description, setDescription] = useState("");

  // Step 2: Trigger
  const [trigger, setTrigger] = useState<TriggerType>("tier_change");
  const [tierFilter, setTierFilter] = useState("");
  const [minSpend, setMinSpend] = useState("");

  // Step 3: Action
  const [action, setAction] = useState<ActionType>("send_email");
  const [template, setTemplate] = useState("");
  const [delay, setDelay] = useState("immediate");
  const [respectBusinessHours, setRespectBusinessHours] = useState(false);
  const [respectTimezone, setRespectTimezone] = useState(true);

  // Navigation handlers
  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((currentStep + 1) as AutomationStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as AutomationStep);
    }
  };

  const submitAutomation = useCallback((intent: "draft" | "activate") => {
    const formData = new FormData();
    formData.append("intent", intent);
    formData.append("name", automationName);
    formData.append("description", description);
    formData.append("trigger", trigger);
    formData.append("tierFilter", tierFilter);
    formData.append("minSpend", minSpend);
    formData.append("actionType", action);
    formData.append("templateId", template);
    formData.append("delay", delay);
    formData.append("respectBusinessHours", respectBusinessHours.toString());
    formData.append("respectTimezone", respectTimezone.toString());
    submit(formData, { method: "post" });
  }, [automationName, description, trigger, tierFilter, minSpend, action, template, delay, respectBusinessHours, respectTimezone, submit]);

  const handleSaveDraft = () => submitAutomation("draft");
  const handleActivate = () => submitAutomation("activate");

  // Validation
  const isStepValid = (step: AutomationStep): boolean => {
    switch (step) {
      case 1:
        return automationName.trim().length > 0;
      case 2:
        return trigger.length > 0;
      case 3:
        return action.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <Page
      title="Create Automation"
      backAction={{
        content: "Automations",
        url: "/app/marketing/automation/workflows",
      }}
      primaryAction={{
        content: currentStep === 4 ? "Activate Automation" : "Save as Draft",
        onAction: currentStep === 4 ? handleActivate : handleSaveDraft,
      }}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Subtle limit status hint (shows when 50%+ used) */}
        <Layout.Section>
          <PageLimitStatus
            current={data.limitAccess.current}
            limit={data.limitAccess.max}
            resource="automation"
            action="create"
            nextTierLimit={data.limitAccess.max * 4}
            nextTierName="Pro"
          />
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              {/* Progress Steps - Bordered Cards */}
              <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
                <Card background={(currentStep === 1 ? "bg-surface-brand-subdued" : currentStep > 1 ? "bg-surface-success-subdued" : "bg-surface") as any}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" as="span" fontWeight="semibold">Step 1</Text>
                      <Badge tone={currentStep > 1 ? "success" : currentStep === 1 ? "info" : undefined}>
                        {currentStep > 1 ? "Done" : currentStep === 1 ? "Active" : "Pending"}
                      </Badge>
                    </InlineStack>
                    <Text variant="headingSm" as="h3">Setup</Text>
                    <Text variant="bodySm" as="span" tone="subdued">
                      Basic information
                    </Text>
                  </BlockStack>
                </Card>

                <Card background={(currentStep === 2 ? "bg-surface-brand-subdued" : currentStep > 2 ? "bg-surface-success-subdued" : "bg-surface") as any}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" as="span" fontWeight="semibold" tone={currentStep < 2 ? "subdued" : undefined}>Step 2</Text>
                      <Badge tone={currentStep > 2 ? "success" : currentStep === 2 ? "info" : undefined}>
                        {currentStep > 2 ? "Done" : currentStep === 2 ? "Active" : "Pending"}
                      </Badge>
                    </InlineStack>
                    <Text variant="headingSm" as="h3" tone={currentStep < 2 ? "subdued" : undefined}>Trigger</Text>
                    <Text variant="bodySm" as="span" tone="subdued">
                      When to run
                    </Text>
                  </BlockStack>
                </Card>

                <Card background={(currentStep === 3 ? "bg-surface-brand-subdued" : currentStep > 3 ? "bg-surface-success-subdued" : "bg-surface") as any}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" as="span" fontWeight="semibold" tone={currentStep < 3 ? "subdued" : undefined}>Step 3</Text>
                      <Badge tone={currentStep > 3 ? "success" : currentStep === 3 ? "info" : undefined}>
                        {currentStep > 3 ? "Done" : currentStep === 3 ? "Active" : "Pending"}
                      </Badge>
                    </InlineStack>
                    <Text variant="headingSm" as="h3" tone={currentStep < 3 ? "subdued" : undefined}>Action</Text>
                    <Text variant="bodySm" as="span" tone="subdued">
                      What to do
                    </Text>
                  </BlockStack>
                </Card>

                <Card background={(currentStep === 4 ? "bg-surface-brand-subdued" : "bg-surface") as any}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" as="span" fontWeight="semibold" tone={currentStep < 4 ? "subdued" : undefined}>Step 4</Text>
                      <Badge tone={currentStep === 4 ? "info" : undefined}>
                        {currentStep === 4 ? "Active" : "Pending"}
                      </Badge>
                    </InlineStack>
                    <Text variant="headingSm" as="h3" tone={currentStep < 4 ? "subdued" : undefined}>Review</Text>
                    <Text variant="bodySm" as="span" tone="subdued">
                      Confirm & launch
                    </Text>
                  </BlockStack>
                </Card>
              </InlineGrid>

              <Divider />

              {/* STEP 1: SETUP */}
              {currentStep === 1 && (
                <Card background="bg-surface-secondary">
                  <BlockStack gap="500">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingLg" as="h2">
                          Basic Information
                        </Text>
                        <Text variant="bodyMd" as="span" tone="subdued">
                          Step 1 of 4
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd" as="span" tone="subdued">
                        Give your automation a name and description
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="400">
                      <TextField
                        label="Automation Name"
                        value={automationName}
                        onChange={setAutomationName}
                        placeholder="e.g., Welcome New VIP Members"
                        helpText="Choose a descriptive name to identify this automation"
                        autoComplete="off"
                        requiredIndicator
                      />

                      <TextField
                        label="Description"
                        value={description}
                        onChange={setDescription}
                        placeholder="Brief description of what this automation does"
                        multiline={4}
                        helpText="Optional: Add notes about this automation's purpose"
                        autoComplete="off"
                      />

                      <Banner>
                        This automation will run automatically based on the trigger you configure in the next step. You can pause or modify it at any time.
                      </Banner>
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

              {/* STEP 2: TRIGGER */}
              {currentStep === 2 && (
                <Card background="bg-surface-secondary">
                  <BlockStack gap="500">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingLg" as="h2">
                          Select Trigger Event
                        </Text>
                        <Text variant="bodyMd" as="span" tone="subdued">
                          Step 2 of 4
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd" as="span" tone="subdued">
                        Choose the event that will activate this automation workflow
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="400">
                      <ChoiceCardGroup
                        legend="Trigger event"
                        name="automation-trigger"
                        value={trigger}
                        sections={TRIGGER_SECTIONS}
                        onChange={setTrigger}
                      />

                      <Divider />

                      <Text variant="headingMd" as="h2">
                        Conditions (Optional)
                      </Text>
                      <Text variant="bodySm" as="span" tone="subdued">
                        Add filters to target specific customers
                      </Text>

                      {trigger === "tier_change" && (
                        <Select
                          label="Target specific tier"
                          options={[
                            { label: "All tiers", value: "" },
                            ...data.tiers.map((tier: any) => ({
                              label: `${tier.name} (${tier.cashbackPercent}% cashback)`,
                              value: tier.id,
                            })),
                          ]}
                          value={tierFilter}
                          onChange={setTierFilter}
                          helpText="Leave blank to trigger for all tier changes"
                        />
                      )}

                      {trigger === "purchase" && (
                        <TextField
                          label="Minimum purchase amount"
                          type="number"
                          value={minSpend}
                          onChange={setMinSpend}
                          prefix="$"
                          helpText="Only trigger for purchases above this amount"
                          autoComplete="off"
                        />
                      )}
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

              {/* STEP 3: ACTION */}
              {currentStep === 3 && (
                <Card background="bg-surface-secondary">
                  <BlockStack gap="500">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingLg" as="h2">
                          Configure Action
                        </Text>
                        <Text variant="bodyMd" as="span" tone="subdued">
                          Step 3 of 4
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd" as="span" tone="subdued">
                        Choose what happens when this automation is triggered
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="400">
                      <ChoiceCardGroup
                        legend="Action type"
                        name="automation-action"
                        value={action}
                        options={ACTION_OPTIONS}
                        onChange={setAction}
                      />

                      <Divider />

                      {action === "send_email" && (
                        <BlockStack gap="400">
                          <Text variant="headingMd" as="h2">
                            Email Settings
                          </Text>

                          <Select
                            label="Email Template"
                            options={[
                              { label: "Select a template...", value: "" },
                              ...data.templates.map((t: any) => ({
                                label: t.name,
                                value: t.id,
                              })),
                            ]}
                            value={template}
                            onChange={setTemplate}
                          />

                          <InlineStack gap="300">
                            <Button>Preview Template</Button>
                            <Button>Create New Template</Button>
                          </InlineStack>
                        </BlockStack>
                      )}

                      <Divider />

                      <Text variant="headingMd" as="h2">
                        Timing & Delivery
                      </Text>

                      <Select
                        label="Send Delay"
                        options={[
                          { label: "Immediately", value: "immediate" },
                          { label: "1 hour later", value: "1h" },
                          { label: "24 hours later", value: "24h" },
                          { label: "3 days later", value: "3d" },
                          { label: "1 week later", value: "7d" },
                        ]}
                        value={delay}
                        onChange={setDelay}
                        helpText="How long to wait before performing the action"
                      />

                      <Checkbox
                        label="Only send during business hours (9 AM - 5 PM)"
                        checked={respectBusinessHours}
                        onChange={setRespectBusinessHours}
                        helpText="Delays sending until the next business day if outside hours"
                      />

                      <Checkbox
                        label="Respect customer's time zone"
                        checked={respectTimezone}
                        onChange={setRespectTimezone}
                        helpText="Send based on the customer's local time zone"
                      />
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

              {/* STEP 4: REVIEW */}
              {currentStep === 4 && (
                <Card background="bg-surface-secondary">
                  <BlockStack gap="500">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingLg" as="h2">
                          Review & Activate
                        </Text>
                        <Text variant="bodyMd" as="span" tone="subdued">
                          Step 4 of 4
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd" as="span" tone="subdued">
                        Review your automation settings before activating
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="400">
                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h2">
                            Basic Information
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" as="span" tone="subdued">Name:</Text>
                            <Text variant="bodyMd" as="span" fontWeight="semibold">
                              {automationName || "Untitled Automation"}
                            </Text>
                          </InlineStack>
                          {description && (
                            <InlineStack gap="200" blockAlign="start">
                              <Text variant="bodyMd" as="span" tone="subdued">Description:</Text>
                              <Text variant="bodyMd" as="span">{description}</Text>
                            </InlineStack>
                          )}
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h2">
                            Trigger
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" as="span" tone="subdued">Event:</Text>
                            <Text variant="bodyMd" as="span" fontWeight="semibold">
                              {trigger === "tier_change" && "Tier Change"}
                              {trigger === "purchase" && "Purchase Made"}
                              {trigger === "birthday" && "Customer Birthday"}
                              {trigger === "inactive" && "Inactive Customer"}
                              {trigger === "cashback_earned" && "Cashback Earned"}
                              {trigger === "points_milestone" && "Points Milestone"}
                              {trigger === "raffle_entered" && "Raffle Entry"}
                              {trigger === "raffle_won" && "Raffle Win"}
                              {trigger === "raffle_ending" && "Raffle Ending Soon"}
                              {trigger === "mystery_box_opened" && "Mystery Box Opened"}
                              {trigger === "mystery_box_won" && "Mystery Box Prize"}
                              {trigger === "rewards_dormant" && "Rewards Dormant"}
                              {trigger === "gift_card_purchased" && "Gift Card Purchased"}
                              {trigger === "gift_card_received" && "Gift Card Received"}
                              {trigger === "store_credit_earned" && "Store Credit Earned"}
                              {trigger === "store_credit_converted" && "Credit Converted to Gift Card"}
                              {trigger === "store_credit_milestone" && "Store Credit Milestone"}
                              {trigger === "store_credit_balance_reminder" && "Balance Reminder"}
                            </Text>
                          </InlineStack>
                          {tierFilter && (
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" as="span" tone="subdued">Tier Filter:</Text>
                              <Badge>
                                {data.tiers.find((t: any) => t.id === tierFilter)?.name || tierFilter}
                              </Badge>
                            </InlineStack>
                          )}
                          {minSpend && (
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" as="span" tone="subdued">Minimum Spend:</Text>
                              <Text variant="bodyMd" as="span" fontWeight="semibold">${minSpend}</Text>
                            </InlineStack>
                          )}
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h2">
                            Action
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" as="span" tone="subdued">Type:</Text>
                            <Text variant="bodyMd" as="span" fontWeight="semibold">
                              {action === "send_email" && "Send Email"}
                              {action === "add_tag" && "Add Customer Tag"}
                              {action === "award_points" && "Award Bonus Points"}
                              {action === "create_discount" && "Create Discount Code"}
                            </Text>
                          </InlineStack>
                          {action === "send_email" && template && (
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" as="span" tone="subdued">Template:</Text>
                              <Badge tone="info">{template}</Badge>
                            </InlineStack>
                          )}
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" as="span" tone="subdued">Delay:</Text>
                            <Text variant="bodyMd" as="span">
                              {delay === "immediate" && "Immediately"}
                              {delay === "1h" && "1 hour"}
                              {delay === "24h" && "24 hours"}
                              {delay === "3d" && "3 days"}
                              {delay === "7d" && "1 week"}
                            </Text>
                          </InlineStack>
                          {respectBusinessHours && (
                            <InlineStack gap="200" blockAlign="center">
                              <Badge tone="success">Business hours only</Badge>
                            </InlineStack>
                          )}
                          {respectTimezone && (
                            <InlineStack gap="200" blockAlign="center">
                              <Badge tone="success">Respects timezone</Badge>
                            </InlineStack>
                          )}
                        </BlockStack>
                      </Card>

                      <Banner tone="info">
                        Once activated, this automation will run automatically based on your settings. You can pause, edit, or delete it at any time from the Automations page.
                      </Banner>

                      <Card background={"bg-surface-success-subdued" as any}>
                        <BlockStack gap="200">
                          <Text variant="headingSm" as="h3" fontWeight="semibold">
                            Estimated Impact
                          </Text>
                          <Text variant="bodySm" as="span" tone="subdued">
                            Based on your current customer base and activity:
                          </Text>
                          <InlineStack gap="400">
                            <BlockStack gap="100">
                              <Text variant="bodySm" as="span" tone="subdued">Estimated Reach</Text>
                              <Text variant="headingMd" as="h2" fontWeight="bold">~150 customers/month</Text>
                            </BlockStack>
                            <BlockStack gap="100">
                              <Text variant="bodySm" as="span" tone="subdued">Potential Engagement</Text>
                              <Text variant="headingMd" as="h2" fontWeight="bold">~45 actions/month</Text>
                            </BlockStack>
                          </InlineStack>
                        </BlockStack>
                      </Card>
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

              {/* Navigation */}
              <Divider />
              <InlineStack align="space-between">
                <Text variant="bodyMd" as="span" tone="subdued">
                  {currentStep} of 4 steps completed
                </Text>
                <InlineStack gap="300">
                  {currentStep > 1 && (
                    <Button onClick={handleBack}>Previous</Button>
                  )}
                  {currentStep < 4 ? (
                    <Button
                      variant="primary"
                      onClick={handleNext}
                      disabled={!isStepValid(currentStep)}
                    >
                      Next Step
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={handleActivate}>
                      Activate Automation
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
