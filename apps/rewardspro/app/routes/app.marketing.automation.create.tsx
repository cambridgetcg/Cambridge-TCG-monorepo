import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState } from "react";
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
  Box,
  InlineGrid,
  ChoiceList,
  RadioButton,
  Banner,
  Checkbox,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "~/db.server";

// ============================================
// TYPES
// ============================================

interface Tier {
  id: string;
  name: string;
  cashbackPercent: number;
}

interface LoaderData {
  shop: string;
  tiers: Tier[];
}

type AutomationStep = 1 | 2 | 3 | 4;

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch tiers for the shop
  const tiers = await db.tier.findMany({
    where: { shop },
    select: {
      id: true,
      name: true,
      cashbackPercent: true,
    },
    orderBy: { minSpend: 'asc' },
  });

  return json<LoaderData>({
    shop,
    tiers,
  });
};

// ============================================
// COMPONENT
// ============================================

export default function CreateAutomation() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Step state
  const [currentStep, setCurrentStep] = useState<AutomationStep>(1);

  // Step 1: Setup
  const [automationName, setAutomationName] = useState("");
  const [description, setDescription] = useState("");

  // Step 2: Trigger
  const [trigger, setTrigger] = useState("tier_change");
  const [tierFilter, setTierFilter] = useState("");
  const [minSpend, setMinSpend] = useState("");

  // Step 3: Action
  const [action, setAction] = useState("send_email");
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

  const handleSaveDraft = () => {
    // TODO: Save automation as draft
    console.log("Saving draft...");
  };

  const handleActivate = () => {
    // TODO: Activate automation
    console.log("Activating automation...");
  };

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
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              {/* Progress Steps - Bordered Cards */}
              <InlineGrid columns={4} gap="300">
                <Card background={currentStep === 1 ? "bg-surface-brand-subdued" : currentStep > 1 ? "bg-surface-success-subdued" : "bg-surface"}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" fontWeight="semibold">Step 1</Text>
                      <Badge tone={currentStep > 1 ? "success" : currentStep === 1 ? "info" : undefined}>
                        {currentStep > 1 ? "Done" : currentStep === 1 ? "Active" : "Pending"}
                      </Badge>
                    </InlineStack>
                    <Text variant="headingSm">Setup</Text>
                    <Text variant="bodySm" tone="subdued">
                      Basic information
                    </Text>
                  </BlockStack>
                </Card>

                <Card background={currentStep === 2 ? "bg-surface-brand-subdued" : currentStep > 2 ? "bg-surface-success-subdued" : "bg-surface"}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" fontWeight="semibold" tone={currentStep < 2 ? "subdued" : undefined}>Step 2</Text>
                      <Badge tone={currentStep > 2 ? "success" : currentStep === 2 ? "info" : undefined}>
                        {currentStep > 2 ? "Done" : currentStep === 2 ? "Active" : "Pending"}
                      </Badge>
                    </InlineStack>
                    <Text variant="headingSm" tone={currentStep < 2 ? "subdued" : undefined}>Trigger</Text>
                    <Text variant="bodySm" tone="subdued">
                      When to run
                    </Text>
                  </BlockStack>
                </Card>

                <Card background={currentStep === 3 ? "bg-surface-brand-subdued" : currentStep > 3 ? "bg-surface-success-subdued" : "bg-surface"}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" fontWeight="semibold" tone={currentStep < 3 ? "subdued" : undefined}>Step 3</Text>
                      <Badge tone={currentStep > 3 ? "success" : currentStep === 3 ? "info" : undefined}>
                        {currentStep > 3 ? "Done" : currentStep === 3 ? "Active" : "Pending"}
                      </Badge>
                    </InlineStack>
                    <Text variant="headingSm" tone={currentStep < 3 ? "subdued" : undefined}>Action</Text>
                    <Text variant="bodySm" tone="subdued">
                      What to do
                    </Text>
                  </BlockStack>
                </Card>

                <Card background={currentStep === 4 ? "bg-surface-brand-subdued" : "bg-surface"}>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" fontWeight="semibold" tone={currentStep < 4 ? "subdued" : undefined}>Step 4</Text>
                      <Badge tone={currentStep === 4 ? "info" : undefined}>
                        {currentStep === 4 ? "Active" : "Pending"}
                      </Badge>
                    </InlineStack>
                    <Text variant="headingSm" tone={currentStep < 4 ? "subdued" : undefined}>Review</Text>
                    <Text variant="bodySm" tone="subdued">
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
                        <Text variant="bodyMd" tone="subdued">
                          Step 1 of 4
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd" tone="subdued">
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
                        <Text variant="bodyMd" tone="subdued">
                          Step 2 of 4
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd" tone="subdued">
                        Choose the event that will activate this automation workflow
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h3">
                        Trigger Type
                      </Text>

                      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                        <div onClick={() => setTrigger("tier_change")} style={{ cursor: "pointer" }}>
                          <Card background={trigger === "tier_change" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={trigger === "tier_change"}
                                  onChange={() => setTrigger("tier_change")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Tier Change
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Triggered when a customer moves to a new tier
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>

                        <div onClick={() => setTrigger("purchase")} style={{ cursor: "pointer" }}>
                          <Card background={trigger === "purchase" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={trigger === "purchase"}
                                  onChange={() => setTrigger("purchase")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Purchase Made
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Triggered after a customer completes a purchase
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>

                        <div onClick={() => setTrigger("birthday")} style={{ cursor: "pointer" }}>
                          <Card background={trigger === "birthday" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={trigger === "birthday"}
                                  onChange={() => setTrigger("birthday")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Customer Birthday
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Triggered on the customer's birthday
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>

                        <div onClick={() => setTrigger("inactive")} style={{ cursor: "pointer" }}>
                          <Card background={trigger === "inactive" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={trigger === "inactive"}
                                  onChange={() => setTrigger("inactive")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Inactive Customer
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Triggered when a customer hasn't purchased in 30+ days
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>

                        <div onClick={() => setTrigger("cashback_earned")} style={{ cursor: "pointer" }}>
                          <Card background={trigger === "cashback_earned" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={trigger === "cashback_earned"}
                                  onChange={() => setTrigger("cashback_earned")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Cashback Earned
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Triggered when a customer earns cashback
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>

                        <div onClick={() => setTrigger("points_milestone")} style={{ cursor: "pointer" }}>
                          <Card background={trigger === "points_milestone" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={trigger === "points_milestone"}
                                  onChange={() => setTrigger("points_milestone")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Points Milestone
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Triggered when customer reaches specific points
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>
                      </InlineGrid>

                      <Divider />

                      <Text variant="headingMd" as="h3">
                        Conditions (Optional)
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        Add filters to target specific customers
                      </Text>

                      {trigger === "tier_change" && (
                        <Select
                          label="Target specific tier"
                          options={[
                            { label: "All tiers", value: "" },
                            ...data.tiers.map((tier) => ({
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
                        <Text variant="bodyMd" tone="subdued">
                          Step 3 of 4
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd" tone="subdued">
                        Choose what happens when this automation is triggered
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h3">
                        Action Type
                      </Text>

                      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                        <div onClick={() => setAction("send_email")} style={{ cursor: "pointer" }}>
                          <Card background={action === "send_email" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={action === "send_email"}
                                  onChange={() => setAction("send_email")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Send Email
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Send a templated email to the customer
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>

                        <div onClick={() => setAction("add_tag")} style={{ cursor: "pointer" }}>
                          <Card background={action === "add_tag" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={action === "add_tag"}
                                  onChange={() => setAction("add_tag")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Add Customer Tag
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Add a tag to the customer in Shopify
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>

                        <div onClick={() => setAction("award_points")} style={{ cursor: "pointer" }}>
                          <Card background={action === "award_points" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={action === "award_points"}
                                  onChange={() => setAction("award_points")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Award Bonus Points
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Give the customer bonus loyalty points
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>

                        <div onClick={() => setAction("create_discount")} style={{ cursor: "pointer" }}>
                          <Card background={action === "create_discount" ? "bg-surface-brand" : "bg-surface"}>
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <RadioButton
                                  label=""
                                  checked={action === "create_discount"}
                                  onChange={() => setAction("create_discount")}
                                />
                                <BlockStack gap="200">
                                  <Text variant="headingSm" fontWeight="semibold">
                                    Create Discount Code
                                  </Text>
                                  <Text variant="bodySm" tone="subdued">
                                    Generate a unique discount code for the customer
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </BlockStack>
                          </Card>
                        </div>
                      </InlineGrid>

                      <Divider />

                      {action === "send_email" && (
                        <BlockStack gap="400">
                          <Text variant="headingMd" as="h3">
                            Email Settings
                          </Text>

                          <Select
                            label="Email Template"
                            options={[
                              { label: "Select a template...", value: "" },
                              { label: "Tier Upgrade Congratulations", value: "tier_upgrade" },
                              { label: "Welcome to VIP", value: "welcome_vip" },
                              { label: "Birthday Special Offer", value: "birthday" },
                              { label: "We Miss You", value: "winback" },
                              { label: "Cashback Earned Notification", value: "cashback_earned" },
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

                      <Text variant="headingMd" as="h3">
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
                        <Text variant="bodyMd" tone="subdued">
                          Step 4 of 4
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd" tone="subdued">
                        Review your automation settings before activating
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="400">
                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h3">
                            Basic Information
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" tone="subdued">Name:</Text>
                            <Text variant="bodyMd" fontWeight="semibold">
                              {automationName || "Untitled Automation"}
                            </Text>
                          </InlineStack>
                          {description && (
                            <InlineStack gap="200" blockAlign="start">
                              <Text variant="bodyMd" tone="subdued">Description:</Text>
                              <Text variant="bodyMd">{description}</Text>
                            </InlineStack>
                          )}
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h3">
                            Trigger
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" tone="subdued">Event:</Text>
                            <Text variant="bodyMd" fontWeight="semibold">
                              {trigger === "tier_change" && "Tier Change"}
                              {trigger === "purchase" && "Purchase Made"}
                              {trigger === "birthday" && "Customer Birthday"}
                              {trigger === "inactive" && "Inactive Customer"}
                              {trigger === "cashback_earned" && "Cashback Earned"}
                              {trigger === "points_milestone" && "Points Milestone"}
                            </Text>
                          </InlineStack>
                          {tierFilter && (
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" tone="subdued">Tier Filter:</Text>
                              <Badge>
                                {data.tiers.find(t => t.id === tierFilter)?.name || tierFilter}
                              </Badge>
                            </InlineStack>
                          )}
                          {minSpend && (
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" tone="subdued">Minimum Spend:</Text>
                              <Text variant="bodyMd" fontWeight="semibold">${minSpend}</Text>
                            </InlineStack>
                          )}
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h3">
                            Action
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" tone="subdued">Type:</Text>
                            <Text variant="bodyMd" fontWeight="semibold">
                              {action === "send_email" && "Send Email"}
                              {action === "add_tag" && "Add Customer Tag"}
                              {action === "award_points" && "Award Bonus Points"}
                              {action === "create_discount" && "Create Discount Code"}
                            </Text>
                          </InlineStack>
                          {action === "send_email" && template && (
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" tone="subdued">Template:</Text>
                              <Badge tone="info">{template}</Badge>
                            </InlineStack>
                          )}
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" tone="subdued">Delay:</Text>
                            <Text variant="bodyMd">
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

                      <Card background="bg-surface-success-subdued">
                        <BlockStack gap="200">
                          <Text variant="headingSm" fontWeight="semibold">
                            Estimated Impact
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            Based on your current customer base and activity:
                          </Text>
                          <InlineStack gap="400">
                            <BlockStack gap="100">
                              <Text variant="bodySm" tone="subdued">Estimated Reach</Text>
                              <Text variant="headingMd" fontWeight="bold">~150 customers/month</Text>
                            </BlockStack>
                            <BlockStack gap="100">
                              <Text variant="bodySm" tone="subdued">Potential Engagement</Text>
                              <Text variant="headingMd" fontWeight="bold">~45 actions/month</Text>
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
                <Text variant="bodyMd" tone="subdued">
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
