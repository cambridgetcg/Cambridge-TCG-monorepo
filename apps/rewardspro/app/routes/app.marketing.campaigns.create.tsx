import { json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, Form, useActionData } from "@remix-run/react";
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
  FormLayout,
} from "@shopify/polaris";
import {
  EmailIcon,
  PersonIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { guardInHouseRoute } from "~/services/marketing-mode.server";

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
  console.log("[Create Campaign] ========== LOADER STARTED ==========");

  try {
    console.log("[Create Campaign] Authenticating...");
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log("[Create Campaign] Authenticated for shop:", shop);

    // Guard: Redirect Klaviyo mode users to main Marketing Hub
    const guardRedirect = await guardInHouseRoute(shop);
    if (guardRedirect) return guardRedirect;

    // Fetch email templates
    let templates: Template[] = [];
    try {
      console.log("[Create Campaign] Fetching email templates...");
      const dbTemplates = await db.emailTemplate.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
      });
      console.log("[Create Campaign] Found", dbTemplates.length, "templates");
      templates = dbTemplates.map(t => ({
        id: t.id,
        name: t.name,
        subject: t.subject || '',
      }));
    } catch (e: any) {
      console.error("[Create Campaign] Error fetching templates:", e.message);
    }

    // Get tiers as segments
    let segments: Segment[] = [
      { id: "all", name: "All Customers", customerCount: 0 },
    ];

    try {
      console.log("[Create Campaign] Fetching tiers...");
      const tiers = await db.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      });
      console.log("[Create Campaign] Found", tiers.length, "tiers");

      // Get total customer count
      console.log("[Create Campaign] Fetching customers...");
      const allCustomers = await db.customer.findMany({
        where: { shop },
      });
      console.log("[Create Campaign] Found", allCustomers.length, "customers");
      segments[0].customerCount = allCustomers.length;

      // Add tier segments
      for (const tier of tiers) {
        const tierCustomers = allCustomers.filter(c => c.tierId === tier.id);
        segments.push({
          id: tier.id,
          name: tier.name,
          customerCount: tierCustomers.length,
        });
      }
    } catch (e: any) {
      console.error("[Create Campaign] Error fetching segments:", e.message);
    }

    console.log("[Create Campaign] Returning data:", {
      shop,
      templatesCount: templates.length,
      segmentsCount: segments.length
    });

    return json<LoaderData>({
      shop,
      templates,
      segments,
    });
  } catch (error: any) {
    console.error("[Create Campaign] ========== LOADER ERROR ==========");
    console.error("[Create Campaign] Error:", error.message);
    console.error("[Create Campaign] Stack:", error.stack);
    throw error;
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const campaignName = formData.get("campaignName") as string;
  const campaignGoal = formData.get("campaignGoal") as string;
  const templateId = formData.get("templateId") as string;
  const segmentId = formData.get("segmentId") as string;
  const scheduleType = formData.get("scheduleType") as string;
  const scheduledDate = formData.get("scheduledDate") as string;
  const scheduledTime = formData.get("scheduledTime") as string;

  if (!campaignName) {
    return json({ error: "Campaign name is required" }, { status: 400 });
  }

  // Get template subject if selected
  let subject = campaignName;
  if (templateId) {
    try {
      const template = await db.emailTemplate.findFirst({
        where: { id: templateId, shop },
      });
      if (template) {
        subject = template.subject || campaignName;
      }
    } catch (e) {
      // Use campaign name as subject
    }
  }

  try {
    const campaignId = uuidv4();
    const now = new Date();

    let status = "draft";
    let scheduledFor: Date | null = null;

    if (scheduleType === "immediate") {
      status = "sending";
    } else if (scheduleType === "scheduled" && scheduledDate && scheduledTime) {
      status = "scheduled";
      scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`);
    }

    await db.emailCampaign.create({
      data: {
        id: campaignId,
        shop,
        name: campaignName,
        subject,
        previewText: "",
        templateId: templateId || null,
        status,
        scheduledFor,
        sentAt: status === "sending" ? now : null,
        metrics: status === "sending" ? {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
          revenue: 0,
          orders: 0,
        } : null,
        createdAt: now,
        updatedAt: now,
      },
    });

    // If immediate send, mark as sent (in production would trigger actual sending)
    if (status === "sending") {
      await db.emailCampaign.updateMany({
        where: { id: campaignId, shop },
        data: {
          status: "sent",
          updatedAt: new Date(),
        },
      });
    }

    return redirect(`/app/marketing/campaigns/${campaignId}`);
  } catch (e: any) {
    console.error("[Create Campaign] Error creating campaign:", e);
    return json({ error: e.message }, { status: 500 });
  }
};

// ============================================
// COMPONENT
// ============================================

export default function CreateCampaign() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  // Form state
  const [campaignName, setCampaignName] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("engagement");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedSegment, setSelectedSegment] = useState("all");
  const [scheduleType, setScheduleType] = useState("immediate");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");

  const isValid = campaignName.trim().length > 0;

  return (
    <Page
      title="Create Campaign"
      subtitle="Create a new email campaign for your customers"
      backAction={{ content: "Campaigns", onAction: () => navigate("/app/marketing/campaigns") }}
    >
      <Form method="post">
        <Layout>
          {actionData?.error && (
            <Layout.Section>
              <Banner tone="critical" title="Error">
                <p>{actionData.error}</p>
              </Banner>
            </Layout.Section>
          )}

          {/* Campaign Details */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Campaign Details</Text>
                <FormLayout>
                  <TextField
                    label="Campaign Name"
                    name="campaignName"
                    value={campaignName}
                    onChange={setCampaignName}
                    placeholder="e.g., Summer Sale 2024"
                    autoComplete="off"
                    requiredIndicator
                  />
                  <Select
                    label="Campaign Goal"
                    name="campaignGoal"
                    options={[
                      { label: "Engagement - Increase opens and clicks", value: "engagement" },
                      { label: "Sales - Drive purchases", value: "sales" },
                      { label: "Retention - Keep customers active", value: "retention" },
                      { label: "Awareness - Build brand recognition", value: "awareness" },
                    ]}
                    value={campaignGoal}
                    onChange={setCampaignGoal}
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Email Template */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Email Template</Text>
                  <Button
                    size="slim"
                    onClick={() => navigate("/app/marketing/templates/new")}
                  >
                    Create New Template
                  </Button>
                </InlineStack>

                {data.templates.length === 0 ? (
                  <Banner tone="info">
                    <p>No email templates found. Create a template first to use in your campaign.</p>
                  </Banner>
                ) : (
                  <BlockStack gap="300">
                    {data.templates.map((template) => (
                      <Box
                        key={template.id}
                        padding="400"
                        background={selectedTemplate === template.id ? "bg-surface-selected" : "bg-surface-secondary"}
                        borderRadius="200"
                        borderWidth="025"
                        borderColor={selectedTemplate === template.id ? "border-success" : "border"}
                      >
                        <InlineStack gap="300" blockAlign="center">
                          <RadioButton
                            label=""
                            checked={selectedTemplate === template.id}
                            onChange={() => setSelectedTemplate(template.id)}
                            name="templateRadio"
                          />
                          <BlockStack gap="100">
                            <Text as="span" fontWeight="semibold">{template.name}</Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              Subject: {template.subject || "No subject set"}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}
                <input type="hidden" name="templateId" value={selectedTemplate} />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Target Audience */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Target Audience</Text>
                <BlockStack gap="300">
                  {data.segments.map((segment) => (
                    <Box
                      key={segment.id}
                      padding="400"
                      background={selectedSegment === segment.id ? "bg-surface-selected" : "bg-surface-secondary"}
                      borderRadius="200"
                      borderWidth="025"
                      borderColor={selectedSegment === segment.id ? "border-success" : "border"}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <RadioButton
                            label=""
                            checked={selectedSegment === segment.id}
                            onChange={() => setSelectedSegment(segment.id)}
                            name="segmentRadio"
                          />
                          <Text as="span" fontWeight="semibold">{segment.name}</Text>
                        </InlineStack>
                        <Badge tone="info">{segment.customerCount.toLocaleString()} customers</Badge>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
                <input type="hidden" name="segmentId" value={selectedSegment} />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Schedule */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">When to Send</Text>
                <BlockStack gap="300">
                  <Box
                    padding="400"
                    background={scheduleType === "immediate" ? "bg-surface-selected" : "bg-surface-secondary"}
                    borderRadius="200"
                    borderWidth="025"
                    borderColor={scheduleType === "immediate" ? "border-success" : "border"}
                  >
                    <InlineStack gap="300" blockAlign="start">
                      <RadioButton
                        label=""
                        checked={scheduleType === "immediate"}
                        onChange={() => setScheduleType("immediate")}
                        name="scheduleRadio"
                      />
                      <BlockStack gap="100">
                        <Text as="span" fontWeight="semibold">Send Immediately</Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Campaign will be sent as soon as you click Launch
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </Box>

                  <Box
                    padding="400"
                    background={scheduleType === "scheduled" ? "bg-surface-selected" : "bg-surface-secondary"}
                    borderRadius="200"
                    borderWidth="025"
                    borderColor={scheduleType === "scheduled" ? "border-success" : "border"}
                  >
                    <BlockStack gap="300">
                      <InlineStack gap="300" blockAlign="start">
                        <RadioButton
                          label=""
                          checked={scheduleType === "scheduled"}
                          onChange={() => setScheduleType("scheduled")}
                          name="scheduleRadio"
                        />
                        <BlockStack gap="100">
                          <Text as="span" fontWeight="semibold">Schedule for Later</Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            Choose a specific date and time
                          </Text>
                        </BlockStack>
                      </InlineStack>

                      {scheduleType === "scheduled" && (
                        <InlineStack gap="400">
                          <div style={{ flex: 1 }}>
                            <TextField
                              label="Date"
                              type="date"
                              name="scheduledDate"
                              value={scheduledDate}
                              onChange={setScheduledDate}
                              autoComplete="off"
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <Select
                              label="Time"
                              name="scheduledTime"
                              options={[
                                { label: "6:00 AM", value: "06:00" },
                                { label: "9:00 AM", value: "09:00" },
                                { label: "12:00 PM", value: "12:00" },
                                { label: "3:00 PM", value: "15:00" },
                                { label: "6:00 PM", value: "18:00" },
                                { label: "9:00 PM", value: "21:00" },
                              ]}
                              value={scheduledTime}
                              onChange={setScheduledTime}
                            />
                          </div>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Box>
                </BlockStack>
                <input type="hidden" name="scheduleType" value={scheduleType} />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Summary & Actions */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Campaign Summary</Text>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Campaign Name:</Text>
                      <Text as="span" fontWeight="semibold">{campaignName || "Not set"}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Template:</Text>
                      <Text as="span" fontWeight="semibold">
                        {data.templates.find(t => t.id === selectedTemplate)?.name || "None selected"}
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Audience:</Text>
                      <Text as="span" fontWeight="semibold">
                        {data.segments.find(s => s.id === selectedSegment)?.name || "All Customers"}
                        {" "}({data.segments.find(s => s.id === selectedSegment)?.customerCount || 0} customers)
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Schedule:</Text>
                      <Text as="span" fontWeight="semibold">
                        {scheduleType === "immediate"
                          ? "Send immediately"
                          : scheduledDate
                            ? `${scheduledDate} at ${scheduledTime}`
                            : "Date not set"
                        }
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Box>

                <Divider />

                <InlineStack align="end" gap="300">
                  <Button onClick={() => navigate("/app/marketing/campaigns")}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    submit
                    disabled={!isValid}
                  >
                    {scheduleType === "immediate" ? "Launch Campaign" : "Schedule Campaign"}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
