import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  Select,
  RadioButton,
  Divider,
  Banner,
  Box,
  InlineGrid,
  Badge,
  Icon,
} from "@shopify/polaris";
import {
  EmailIcon,
  CalendarIcon,
  PersonIcon,
  FilterIcon,
} from "~/utils/polaris-icons";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

// ============================================
// TYPES
// ============================================

interface Template {
  id: string;
  name: string;
  subject: string;
}

interface Segment {
  id: string;
  name: string;
  customerCount: number;
}

interface LoaderData {
  shop: string;
  templates: Template[];
  segments: Segment[];
}

// ============================================
// LOADER
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch email templates
  const templates = await db.emailTemplate.findMany({
    where: { shop },
    select: {
      id: true,
      name: true,
      subject: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Mock segments for now (you can implement real segments later)
  const segments: Segment[] = [
    { id: "all", name: "All Customers", customerCount: 0 },
    { id: "vip", name: "VIP Customers", customerCount: 0 },
    { id: "bronze", name: "Bronze Tier", customerCount: 0 },
    { id: "silver", name: "Silver Tier", customerCount: 0 },
    { id: "gold", name: "Gold Tier", customerCount: 0 },
  ];

  // Get actual customer counts per tier
  const customers = await db.customer.findMany({
    where: { shop },
    select: { currentTierId: true },
  });

  const totalCount = customers.length;
  segments[0].customerCount = totalCount;

  return json<LoaderData>({
    shop,
    templates,
    segments,
  });
};

// ============================================
// COMPONENT
// ============================================

export default function CreateCampaign() {
  const data = useLoaderData<typeof loader>();
  const [selectedVariation, setSelectedVariation] = useState<"option1" | "option2" | "option3">("option1");

  // Campaign state
  const [campaignName, setCampaignName] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("engagement");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedSegment, setSelectedSegment] = useState("all");
  const [scheduleType, setScheduleType] = useState("immediate");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  return (
    <Page
      title="Create Campaign"
      subtitle="Choose a campaign creation style that works for you"
      backAction={{ content: "Marketing", url: "/app/marketing" }}
    >
      <Layout>
        {/* Variation Selector */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Choose Your Preferred Layout
              </Text>
              <InlineStack gap="300">
                <Button
                  pressed={selectedVariation === "option1"}
                  onClick={() => setSelectedVariation("option1")}
                >
                  Option 1: Wizard Flow
                </Button>
                <Button
                  pressed={selectedVariation === "option2"}
                  onClick={() => setSelectedVariation("option2")}
                >
                  Option 2: All-in-One
                </Button>
                <Button
                  pressed={selectedVariation === "option3"}
                  onClick={() => setSelectedVariation("option3")}
                >
                  Option 3: Tabbed
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* OPTION 1: Wizard Flow (Step-by-Step) */}
        {selectedVariation === "option1" && (
          <Option1WizardFlow
            data={data}
            campaignName={campaignName}
            setCampaignName={setCampaignName}
            campaignGoal={campaignGoal}
            setCampaignGoal={setCampaignGoal}
            selectedTemplate={selectedTemplate}
            setSelectedTemplate={setSelectedTemplate}
            selectedSegment={selectedSegment}
            setSelectedSegment={setSelectedSegment}
            scheduleType={scheduleType}
            setScheduleType={setScheduleType}
            scheduledDate={scheduledDate}
            setScheduledDate={setScheduledDate}
            scheduledTime={scheduledTime}
            setScheduledTime={setScheduledTime}
          />
        )}

        {/* OPTION 2: All-in-One View */}
        {selectedVariation === "option2" && (
          <Option2AllInOne
            data={data}
            campaignName={campaignName}
            setCampaignName={setCampaignName}
            campaignGoal={campaignGoal}
            setCampaignGoal={setCampaignGoal}
            selectedTemplate={selectedTemplate}
            setSelectedTemplate={setSelectedTemplate}
            selectedSegment={selectedSegment}
            setSelectedSegment={setSelectedSegment}
            scheduleType={scheduleType}
            setScheduleType={setScheduleType}
            scheduledDate={scheduledDate}
            setScheduledDate={setScheduledDate}
            scheduledTime={scheduledTime}
            setScheduledTime={setScheduledTime}
          />
        )}

        {/* OPTION 3: Tabbed Interface */}
        {selectedVariation === "option3" && (
          <Option3Tabbed
            data={data}
            campaignName={campaignName}
            setCampaignName={setCampaignName}
            campaignGoal={campaignGoal}
            setCampaignGoal={setCampaignGoal}
            selectedTemplate={selectedTemplate}
            setSelectedTemplate={setSelectedTemplate}
            selectedSegment={selectedSegment}
            setSelectedSegment={setSelectedSegment}
            scheduleType={scheduleType}
            setScheduleType={setScheduleType}
            scheduledDate={scheduledDate}
            setScheduledDate={setScheduledDate}
            scheduledTime={scheduledTime}
            setScheduledTime={setScheduledTime}
          />
        )}
      </Layout>
    </Page>
  );
}

// ============================================
// OPTION 1: Wizard Flow (Multi-Step)
// ============================================

interface CampaignProps {
  data: LoaderData;
  campaignName: string;
  setCampaignName: (value: string) => void;
  campaignGoal: string;
  setCampaignGoal: (value: string) => void;
  selectedTemplate: string;
  setSelectedTemplate: (value: string) => void;
  selectedSegment: string;
  setSelectedSegment: (value: string) => void;
  scheduleType: string;
  setScheduleType: (value: string) => void;
  scheduledDate: string;
  setScheduledDate: (value: string) => void;
  scheduledTime: string;
  setScheduledTime: (value: string) => void;
}

function Option1WizardFlow(props: CampaignProps) {
  const [currentStep, setCurrentStep] = useState(1);

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return props.campaignName.trim().length > 0;
      case 2:
        return props.selectedTemplate.length > 0;
      case 3:
        return props.selectedSegment.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <>
      {/* Progress Steps */}
      <Layout.Section>
        <Card>
          <InlineGrid columns={4} gap="300">
            <StepIndicator
              stepNumber={1}
              title="Campaign Details"
              isActive={currentStep === 1}
              isCompleted={currentStep > 1}
            />
            <StepIndicator
              stepNumber={2}
              title="Choose Template"
              isActive={currentStep === 2}
              isCompleted={currentStep > 2}
            />
            <StepIndicator
              stepNumber={3}
              title="Select Audience"
              isActive={currentStep === 3}
              isCompleted={currentStep > 3}
            />
            <StepIndicator
              stepNumber={4}
              title="Schedule & Launch"
              isActive={currentStep === 4}
              isCompleted={currentStep > 4}
            />
          </InlineGrid>
        </Card>
      </Layout.Section>

      {/* Step Content */}
      <Layout.Section>
        <Card>
          <BlockStack gap="500">
            {currentStep === 1 && (
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Step 1: Campaign Details
                </Text>
                <TextField
                  label="Campaign Name"
                  value={props.campaignName}
                  onChange={props.setCampaignName}
                  placeholder="e.g., Summer Sale 2024"
                  autoComplete="off"
                  requiredIndicator
                />
                <Select
                  label="Campaign Goal"
                  options={[
                    { label: "Engagement", value: "engagement" },
                    { label: "Sales", value: "sales" },
                    { label: "Retention", value: "retention" },
                    { label: "Awareness", value: "awareness" },
                  ]}
                  value={props.campaignGoal}
                  onChange={props.setCampaignGoal}
                />
              </BlockStack>
            )}

            {currentStep === 2 && (
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Step 2: Choose Email Template
                </Text>
                <BlockStack gap="300">
                  {props.data.templates.length === 0 ? (
                    <Banner tone="info">
                      <p>No templates found. Create a template first.</p>
                    </Banner>
                  ) : (
                    props.data.templates.map((template) => (
                      <div
                        key={template.id}
                        onClick={() => props.setSelectedTemplate(template.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <Card
                          background={
                            props.selectedTemplate === template.id
                              ? "bg-surface-brand"
                              : "bg-surface"
                          }
                        >
                          <InlineStack gap="300" blockAlign="start">
                            <RadioButton
                              label=""
                              checked={props.selectedTemplate === template.id}
                              onChange={() => props.setSelectedTemplate(template.id)}
                            />
                            <BlockStack gap="100">
                              <Text variant="headingSm" fontWeight="semibold">
                                {template.name}
                              </Text>
                              <Text variant="bodySm" tone="subdued">
                                Subject: {template.subject}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                        </Card>
                      </div>
                    ))
                  )}
                </BlockStack>
              </BlockStack>
            )}

            {currentStep === 3 && (
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Step 3: Select Target Audience
                </Text>
                <BlockStack gap="300">
                  {props.data.segments.map((segment) => (
                    <div
                      key={segment.id}
                      onClick={() => props.setSelectedSegment(segment.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <Card
                        background={
                          props.selectedSegment === segment.id
                            ? "bg-surface-brand"
                            : "bg-surface"
                        }
                      >
                        <InlineStack gap="300" align="space-between" blockAlign="center">
                          <InlineStack gap="300" blockAlign="start">
                            <RadioButton
                              label=""
                              checked={props.selectedSegment === segment.id}
                              onChange={() => props.setSelectedSegment(segment.id)}
                            />
                            <BlockStack gap="100">
                              <Text variant="headingSm" fontWeight="semibold">
                                {segment.name}
                              </Text>
                              <Text variant="bodySm" tone="subdued">
                                {segment.customerCount.toLocaleString()} customers
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Badge tone="info">{segment.customerCount}</Badge>
                        </InlineStack>
                      </Card>
                    </div>
                  ))}
                </BlockStack>
              </BlockStack>
            )}

            {currentStep === 4 && (
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Step 4: Schedule Campaign
                </Text>
                <BlockStack gap="300">
                  <RadioButton
                    label="Send immediately"
                    checked={props.scheduleType === "immediate"}
                    onChange={() => props.setScheduleType("immediate")}
                  />
                  <RadioButton
                    label="Schedule for later"
                    checked={props.scheduleType === "scheduled"}
                    onChange={() => props.setScheduleType("scheduled")}
                  />
                </BlockStack>

                {props.scheduleType === "scheduled" && (
                  <InlineStack gap="300">
                    <TextField
                      label="Date"
                      type="date"
                      value={props.scheduledDate}
                      onChange={props.setScheduledDate}
                      autoComplete="off"
                    />
                    <TextField
                      label="Time"
                      type="time"
                      value={props.scheduledTime}
                      onChange={props.setScheduledTime}
                      autoComplete="off"
                    />
                  </InlineStack>
                )}

                <Divider />

                <Banner tone="success">
                  <BlockStack gap="200">
                    <Text variant="headingSm" fontWeight="semibold">
                      Campaign Summary
                    </Text>
                    <Text variant="bodySm">
                      Name: {props.campaignName || "Not set"}
                    </Text>
                    <Text variant="bodySm">
                      Template:{" "}
                      {props.data.templates.find((t) => t.id === props.selectedTemplate)
                        ?.name || "Not selected"}
                    </Text>
                    <Text variant="bodySm">
                      Audience:{" "}
                      {props.data.segments.find((s) => s.id === props.selectedSegment)
                        ?.name || "Not selected"}
                    </Text>
                    <Text variant="bodySm">
                      Schedule:{" "}
                      {props.scheduleType === "immediate"
                        ? "Send immediately"
                        : `Scheduled for ${props.scheduledDate} at ${props.scheduledTime}`}
                    </Text>
                  </BlockStack>
                </Banner>
              </BlockStack>
            )}

            <Divider />

            {/* Navigation Buttons */}
            <InlineStack align="space-between">
              <Button
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
              >
                Previous
              </Button>
              <InlineStack gap="300">
                {currentStep < 4 ? (
                  <Button
                    variant="primary"
                    onClick={() => setCurrentStep(currentStep + 1)}
                    disabled={!canProceed()}
                  >
                    Next Step
                  </Button>
                ) : (
                  <Button variant="primary" disabled={!canProceed()}>
                    Launch Campaign
                  </Button>
                )}
              </InlineStack>
            </InlineStack>
          </BlockStack>
        </Card>
      </Layout.Section>
    </>
  );
}

// ============================================
// OPTION 2: All-in-One View
// ============================================

function Option2AllInOne(props: CampaignProps) {
  return (
    <Layout.Section>
      <Layout>
        <Layout.Section variant="oneThird">
          {/* Sidebar - Campaign Settings */}
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Campaign Settings
                </Text>
                <TextField
                  label="Campaign Name"
                  value={props.campaignName}
                  onChange={props.setCampaignName}
                  placeholder="Summer Sale 2024"
                  autoComplete="off"
                  requiredIndicator
                />
                <Select
                  label="Goal"
                  options={[
                    { label: "Engagement", value: "engagement" },
                    { label: "Sales", value: "sales" },
                    { label: "Retention", value: "retention" },
                    { label: "Awareness", value: "awareness" },
                  ]}
                  value={props.campaignGoal}
                  onChange={props.setCampaignGoal}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Schedule
                </Text>
                <RadioButton
                  label="Send immediately"
                  checked={props.scheduleType === "immediate"}
                  onChange={() => props.setScheduleType("immediate")}
                />
                <RadioButton
                  label="Schedule for later"
                  checked={props.scheduleType === "scheduled"}
                  onChange={() => props.setScheduleType("scheduled")}
                />
                {props.scheduleType === "scheduled" && (
                  <BlockStack gap="300">
                    <TextField
                      label="Date"
                      type="date"
                      value={props.scheduledDate}
                      onChange={props.setScheduledDate}
                      autoComplete="off"
                    />
                    <TextField
                      label="Time"
                      type="time"
                      value={props.scheduledTime}
                      onChange={props.setScheduledTime}
                      autoComplete="off"
                    />
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            <Button variant="primary" size="large" fullWidth>
              Launch Campaign
            </Button>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          {/* Main Content - Template & Audience */}
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Email Template
                  </Text>
                  <Badge tone="info">Required</Badge>
                </InlineStack>
                <Select
                  label="Select template"
                  options={[
                    { label: "Choose a template...", value: "" },
                    ...props.data.templates.map((t) => ({
                      label: t.name,
                      value: t.id,
                    })),
                  ]}
                  value={props.selectedTemplate}
                  onChange={props.setSelectedTemplate}
                />
                {props.selectedTemplate && (
                  <Box
                    padding="400"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <BlockStack gap="200">
                      <Text variant="bodySm" fontWeight="semibold">
                        Preview
                      </Text>
                      <Text variant="bodySm">
                        Subject:{" "}
                        {
                          props.data.templates.find(
                            (t) => t.id === props.selectedTemplate
                          )?.subject
                        }
                      </Text>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Target Audience
                  </Text>
                  <Badge tone="info">Required</Badge>
                </InlineStack>
                <Select
                  label="Select audience"
                  options={props.data.segments.map((s) => ({
                    label: `${s.name} (${s.customerCount} customers)`,
                    value: s.id,
                  }))}
                  value={props.selectedSegment}
                  onChange={props.setSelectedSegment}
                />
                {props.selectedSegment && (
                  <Box
                    padding="400"
                    background="bg-surface-success-subdued"
                    borderRadius="200"
                  >
                    <InlineStack gap="200" blockAlign="center">
                      <Icon source={PersonIcon} />
                      <Text variant="bodySm" fontWeight="semibold">
                        This campaign will reach{" "}
                        {
                          props.data.segments.find(
                            (s) => s.id === props.selectedSegment
                          )?.customerCount
                        }{" "}
                        customers
                      </Text>
                    </InlineStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Layout.Section>
  );
}

// ============================================
// OPTION 3: Tabbed Interface
// ============================================

function Option3Tabbed(props: CampaignProps) {
  const [activeTab, setActiveTab] = useState<"details" | "template" | "audience" | "schedule">(
    "details"
  );

  return (
    <>
      {/* Tab Navigation */}
      <Layout.Section>
        <Card>
          <InlineStack gap="400">
            <Button
              pressed={activeTab === "details"}
              onClick={() => setActiveTab("details")}
            >
              1. Details
            </Button>
            <Button
              pressed={activeTab === "template"}
              onClick={() => setActiveTab("template")}
            >
              2. Template
            </Button>
            <Button
              pressed={activeTab === "audience"}
              onClick={() => setActiveTab("audience")}
            >
              3. Audience
            </Button>
            <Button
              pressed={activeTab === "schedule"}
              onClick={() => setActiveTab("schedule")}
            >
              4. Schedule
            </Button>
          </InlineStack>
        </Card>
      </Layout.Section>

      {/* Tab Content */}
      <Layout.Section>
        <Card>
          <BlockStack gap="500">
            {activeTab === "details" && (
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Campaign Details
                </Text>
                <TextField
                  label="Campaign Name"
                  value={props.campaignName}
                  onChange={props.setCampaignName}
                  placeholder="e.g., Summer Sale 2024"
                  autoComplete="off"
                  requiredIndicator
                  helpText="Give your campaign a memorable name"
                />
                <Select
                  label="Campaign Goal"
                  options={[
                    { label: "Engagement", value: "engagement" },
                    { label: "Sales", value: "sales" },
                    { label: "Retention", value: "retention" },
                    { label: "Awareness", value: "awareness" },
                  ]}
                  value={props.campaignGoal}
                  onChange={props.setCampaignGoal}
                  helpText="What's the main objective of this campaign?"
                />
              </BlockStack>
            )}

            {activeTab === "template" && (
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Choose Email Template
                </Text>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                  {props.data.templates.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => props.setSelectedTemplate(template.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <Card
                        background={
                          props.selectedTemplate === template.id
                            ? "bg-surface-brand"
                            : "bg-surface"
                        }
                      >
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <Icon source={EmailIcon} />
                            <RadioButton
                              label=""
                              checked={props.selectedTemplate === template.id}
                              onChange={() =>
                                props.setSelectedTemplate(template.id)
                              }
                            />
                          </InlineStack>
                          <BlockStack gap="100">
                            <Text variant="headingSm" fontWeight="semibold">
                              {template.name}
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              {template.subject}
                            </Text>
                          </BlockStack>
                        </BlockStack>
                      </Card>
                    </div>
                  ))}
                </InlineGrid>
              </BlockStack>
            )}

            {activeTab === "audience" && (
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Target Audience
                </Text>
                <BlockStack gap="300">
                  {props.data.segments.map((segment) => (
                    <Card
                      key={segment.id}
                      background={
                        props.selectedSegment === segment.id
                          ? "bg-surface-brand"
                          : "bg-surface"
                      }
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <RadioButton
                            label={segment.name}
                            checked={props.selectedSegment === segment.id}
                            onChange={() => props.setSelectedSegment(segment.id)}
                          />
                        </InlineStack>
                        <Badge tone="info">
                          {segment.customerCount.toLocaleString()} customers
                        </Badge>
                      </InlineStack>
                    </Card>
                  ))}
                </BlockStack>
              </BlockStack>
            )}

            {activeTab === "schedule" && (
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Schedule Campaign
                </Text>
                <BlockStack gap="400">
                  <Card>
                    <InlineStack gap="300" blockAlign="start">
                      <RadioButton
                        label=""
                        checked={props.scheduleType === "immediate"}
                        onChange={() => props.setScheduleType("immediate")}
                      />
                      <BlockStack gap="100">
                        <Text variant="headingSm" fontWeight="semibold">
                          Send Immediately
                        </Text>
                        <Text variant="bodySm" tone="subdued">
                          Campaign will be sent as soon as you launch
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </Card>

                  <Card>
                    <BlockStack gap="300">
                      <InlineStack gap="300" blockAlign="start">
                        <RadioButton
                          label=""
                          checked={props.scheduleType === "scheduled"}
                          onChange={() => props.setScheduleType("scheduled")}
                        />
                        <BlockStack gap="100">
                          <Text variant="headingSm" fontWeight="semibold">
                            Schedule for Later
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            Choose a specific date and time
                          </Text>
                        </BlockStack>
                      </InlineStack>

                      {props.scheduleType === "scheduled" && (
                        <InlineStack gap="300">
                          <TextField
                            label="Date"
                            type="date"
                            value={props.scheduledDate}
                            onChange={props.setScheduledDate}
                            autoComplete="off"
                          />
                          <TextField
                            label="Time"
                            type="time"
                            value={props.scheduledTime}
                            onChange={props.setScheduledTime}
                            autoComplete="off"
                          />
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Card>

                  <Banner tone="info">
                    <BlockStack gap="200">
                      <Text variant="headingSm" fontWeight="semibold">
                        Ready to Launch?
                      </Text>
                      <Text variant="bodySm">
                        Review your campaign settings before launching
                      </Text>
                    </BlockStack>
                  </Banner>
                </BlockStack>
              </BlockStack>
            )}

            <Divider />

            <InlineStack align="space-between">
              <Button
                onClick={() => {
                  const tabs: Array<
                    "details" | "template" | "audience" | "schedule"
                  > = ["details", "template", "audience", "schedule"];
                  const currentIndex = tabs.indexOf(activeTab);
                  if (currentIndex > 0) setActiveTab(tabs[currentIndex - 1]);
                }}
                disabled={activeTab === "details"}
              >
                Previous
              </Button>
              <InlineStack gap="300">
                {activeTab !== "schedule" ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      const tabs: Array<
                        "details" | "template" | "audience" | "schedule"
                      > = ["details", "template", "audience", "schedule"];
                      const currentIndex = tabs.indexOf(activeTab);
                      if (currentIndex < tabs.length - 1)
                        setActiveTab(tabs[currentIndex + 1]);
                    }}
                  >
                    Continue
                  </Button>
                ) : (
                  <Button variant="primary">Launch Campaign</Button>
                )}
              </InlineStack>
            </InlineStack>
          </BlockStack>
        </Card>
      </Layout.Section>
    </>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

interface StepIndicatorProps {
  stepNumber: number;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
}

function StepIndicator({
  stepNumber,
  title,
  isActive,
  isCompleted,
}: StepIndicatorProps) {
  return (
    <Card
      background={
        isActive
          ? "bg-surface-brand-subdued"
          : isCompleted
          ? "bg-surface-success-subdued"
          : "bg-surface"
      }
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodyMd" fontWeight="semibold">
            Step {stepNumber}
          </Text>
          <Badge tone={isCompleted ? "success" : isActive ? "info" : undefined}>
            {isCompleted ? "Done" : isActive ? "Active" : "Pending"}
          </Badge>
        </InlineStack>
        <Text variant="headingSm">{title}</Text>
      </BlockStack>
    </Card>
  );
}
