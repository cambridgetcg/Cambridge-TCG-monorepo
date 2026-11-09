import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useNavigation, Form, useActionData } from "@remix-run/react";
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
  Badge,
  FormLayout,
} from "@shopify/polaris";
import { Prisma } from "@prisma/client";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { v4 as uuidv4 } from "uuid";
import { guardInHouseRoute } from "~/services/marketing-mode.server";
import {
  atomicWithinLimit,
  LimitExceededError,
} from "~/utils/atomic-limit-control.server";
import { checkLimitAccess } from "~/utils/require-feature.server";
import { PageLimitStatus } from "~/components/Billing/UpgradePrompt";
import { type CampaignSendOutcome, sendCampaign, shopTimeZone } from "~/services/campaign-send.server";
import { MARKETING_AUDIENCE } from "~/services/marketing-consent.server";
import { MARKETING_EMAIL_OFF, marketingEmailBlockedReason } from "~/services/marketing-email.server";
import { zonedTimeToUtc } from "~/utils/zoned-time";

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
  /** The id of the campaign this page creates, so pressing its button twice creates one */
  createKey: string;
  shop: string;
  templates: Template[];
  segments: Segment[];
  limitAccess: {
    canCreate: boolean;
    current: number;
    max: number;
    message?: string;
  };
  marketingBlocked: string | null;
  timeZone: string;
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

    // Check campaign limit for rate-based gating
    const campaignCount = await prisma.emailCampaign.count({ where: { shop } });
    const limitAccess = await checkLimitAccess(shop, 'maxCampaigns', campaignCount);

    // Fetch email templates
    let templates: Template[] = [];
    try {
      console.log("[Create Campaign] Fetching email templates...");
      const dbTemplates = await prisma.emailTemplate.findMany({
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
      const tiers = await prisma.tier.findMany({
        where: { shop },
        orderBy: { minSpend: 'asc' },
      });
      console.log("[Create Campaign] Found", tiers.length, "tiers");

      // Count only customers who agreed to marketing: no one else gets it
      const [reachable, tierAssignments] = await Promise.all([
        prisma.customer.count({ where: { shop, ...MARKETING_AUDIENCE } }),
        prisma.customer.findMany({
          where: { shop, ...MARKETING_AUDIENCE, currentTierId: { in: tiers.map(t => t.id) } },
          select: { currentTierId: true },
        }),
      ]);
      segments[0].customerCount = reachable;

      // Add tier segments
      for (const tier of tiers) {
        segments.push({
          id: tier.id,
          name: tier.name,
          customerCount: tierAssignments.filter(c => c.currentTierId === tier.id).length,
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
      createKey: uuidv4(),
      shop,
      templates,
      segments,
      limitAccess: {
        canCreate: limitAccess.hasAccess,
        current: campaignCount,
        max: limitAccess.error?.maxLimit ?? 999999,
        message: limitAccess.error?.message,
      },
      marketingBlocked: marketingEmailBlockedReason() ? MARKETING_EMAIL_OFF : null,
      timeZone: await shopTimeZone(shop),
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  // The page's key becomes the campaign's id: a second press of its button,
  // even one sent while the first is still sending, finds the campaign made
  const campaignId = String(formData.get("createKey") ?? "");
  if (!UUID.test(campaignId)) {
    return json({ error: "Reload the page and create the campaign again." }, { status: 400 });
  }
  const campaignName = formData.get("campaignName") as string;
  const contentMode = formData.get("contentMode") as string;
  const templateId = formData.get("templateId") as string;
  const segmentId = formData.get("segmentId") as string;
  const scheduleType = formData.get("scheduleType") as string;
  const scheduledDate = formData.get("scheduledDate") as string;
  const scheduledTime = formData.get("scheduledTime") as string;

  // Inline content fields
  const inlineSubject = formData.get("inlineSubject") as string;
  const inlinePreviewText = formData.get("inlinePreviewText") as string;
  const inlineContent = formData.get("inlineContent") as string;

  if (!campaignName) {
    return json({ error: "Campaign name is required" }, { status: 400 });
  }

  // Validate content based on mode
  if (contentMode === "inline") {
    if (!inlineSubject) {
      return json({ error: "Subject line is required" }, { status: 400 });
    }
    if (!inlineContent) {
      return json({ error: "Email content is required" }, { status: 400 });
    }
  }

  // Nothing can be sent or scheduled while marketing email is off; a draft can be saved
  if (marketingEmailBlockedReason() && (scheduleType === "immediate" || scheduleType === "scheduled")) {
    return json({ error: MARKETING_EMAIL_OFF }, { status: 409 });
  }

  // The date and time are the shop's local time
  let scheduledFor: Date | null = null;
  if (scheduleType === "scheduled") {
    scheduledFor = zonedTimeToUtc(scheduledDate ?? "", scheduledTime ?? "", await shopTimeZone(shop));
    if (!scheduledFor) {
      return json({ error: "Schedule date is required" }, { status: 400 });
    }
    if (scheduledFor.getTime() <= Date.now()) {
      return json({ error: "Choose a date and time in the future." }, { status: 400 });
    }
  }

  // Determine subject and content based on mode
  let subject = campaignName;
  let previewText = "";
  let finalTemplateId: string;
  let inlineTemplateId: string | null = null;

  if (contentMode === "inline") {
    // For inline mode, create an EmailTemplate first, then reference it
    subject = inlineSubject;
    previewText = inlinePreviewText || "";

    inlineTemplateId = uuidv4();
    await prisma.emailTemplate.create({
      data: {
        id: inlineTemplateId,
        shop,
        name: `Campaign: ${campaignName}`,
        type: "promotional",
        subject: inlineSubject,
        content: {},
        previewText: inlinePreviewText || "",
        htmlContent: inlineContent,
        isActive: true,
      },
    });
    finalTemplateId = inlineTemplateId;
  } else if (templateId) {
    finalTemplateId = templateId;
    try {
      const template = await prisma.emailTemplate.findFirst({
        where: { id: templateId, shop },
      });
      if (template) {
        subject = template.subject || campaignName;
        previewText = template.previewText || "";
      }
    } catch (e) {
      // Use campaign name as subject
    }
  } else {
    return json({ error: "Please select a template or create inline content" }, { status: 400 });
  }

  try {
    const now = new Date();

    // Send immediately starts as a draft and is sent below
    const status = scheduledFor ? "scheduled" : "draft";

    // Atomic campaign creation with limit check
    // This prevents TOCTOU race conditions where two concurrent requests
    // could both pass the limit check and create campaigns exceeding the limit
    await atomicWithinLimit(
      shop,
      "maxCampaigns",
      (tx) => tx.emailCampaign.count({ where: { shop } }),
      (tx) => tx.emailCampaign.create({
        data: {
          id: campaignId,
          shop,
          name: campaignName,
          subject,
          previewText,
          templateId: finalTemplateId,
          status,
          // One audience shape, read by services/campaign-send.server.ts
          segmentRules: segmentId && segmentId !== "all" ? { tierIds: [segmentId] } : { allCustomers: true },
          scheduledFor,
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    // Send immediately goes out the same way as the send page's Send now
    if (scheduleType === "immediate") {
      let outcome: CampaignSendOutcome;
      try {
        outcome = await sendCampaign(shop, campaignId, "draft");
      } catch (e) {
        console.error(`[Create Campaign] Error sending campaign ${campaignId}:`, e);
        return json(
          { error: "Something went wrong while sending your campaign. Open it to see whether it went out before you send it again.", campaignId },
          { status: 500 }
        );
      }
      if (outcome.status === "not_sent") {
        return json(
          { error: `Your campaign was saved as a draft but not sent. ${outcome.reason}`, draftId: campaignId },
          { status: 400 }
        );
      }
      if (outcome.status === "may_have_sent") {
        return json({ error: outcome.reason, campaignId }, { status: 500 });
      }
    }

    return redirect(`/app/marketing/campaigns/${campaignId}`);
  } catch (e: any) {
    if (e instanceof LimitExceededError) {
      return e.toJsonResponse();
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // This page already created its campaign: go to it, and send nothing
      if (inlineTemplateId) {
        await prisma.emailTemplate.deleteMany({ where: { id: inlineTemplateId, shop } }).catch(() => {});
      }
      return redirect(`/app/marketing/campaigns/${campaignId}`);
    }
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
  // Busy from the press until the next page is shown
  const busy = useNavigation().state !== "idle";
  // The key the page opened with: reloading its data after a press brings a new one
  const [createKey] = useState(data.createKey);

  // Form state
  const [campaignName, setCampaignName] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("engagement");
  const [contentMode, setContentMode] = useState<"template" | "inline">("template");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedSegment, setSelectedSegment] = useState("all");
  const [scheduleType, setScheduleType] = useState(data.marketingBlocked ? "draft" : "immediate");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");

  // Inline content state
  const [inlineSubject, setInlineSubject] = useState("");
  const [inlinePreviewText, setInlinePreviewText] = useState("");
  const [inlineContent, setInlineContent] = useState("");

  const isValid = campaignName.trim().length > 0 &&
    (contentMode === "template" ? selectedTemplate !== "" : inlineSubject.trim().length > 0 && inlineContent.trim().length > 0);

  return (
    <Page
      title="Create Campaign"
      subtitle="Create a new email campaign for your customers"
      backAction={{ content: "Campaigns", onAction: () => navigate("/app/marketing/campaigns") }}
    >
      <Form method="post">
        <input type="hidden" name="createKey" value={createKey} />
        <Layout>
          {/* Subtle limit status hint (shows when 50%+ used) */}
          <Layout.Section>
            <PageLimitStatus
              current={data.limitAccess.current}
              limit={data.limitAccess.max}
              resource="campaign"
              action="create"
              nextTierLimit={data.limitAccess.max * 5}
              nextTierName="Pro"
            />
          </Layout.Section>

          {actionData?.error && (
            <Layout.Section>
              <Banner
                tone="critical"
                title={(actionData as any).code === "LIMIT_EXCEEDED" ? "Campaign Limit Reached" : "Error"}
                action={
                  (actionData as any).draftId
                    ? { content: "Open the draft", onAction: () => navigate(`/app/marketing/campaigns/${(actionData as any).draftId}`) }
                    : (actionData as any).campaignId
                      ? { content: "Open the campaign", onAction: () => navigate(`/app/marketing/campaigns/${(actionData as any).campaignId}`) }
                      : undefined
                }
              >
                <p>{(actionData as any).message || actionData.error}</p>
              </Banner>
            </Layout.Section>
          )}

          {data.marketingBlocked && (
            <Layout.Section>
              <Banner tone="warning" title="Marketing email is off">
                <p>{data.marketingBlocked}</p>
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

          {/* Email Content */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Email Content</Text>

                {/* Content Mode Toggle */}
                <InlineStack gap="300">
                  <Box
                    padding="300"
                    background={contentMode === "template" ? "bg-surface-selected" : "bg-surface-secondary"}
                    borderRadius="200"
                    borderWidth="025"
                    borderColor={contentMode === "template" ? "border-success" : "border"}
                  >
                    <InlineStack gap="200" blockAlign="center">
                      <RadioButton
                        label="Use Template"
                        checked={contentMode === "template"}
                        onChange={() => setContentMode("template")}
                        name="contentMode"
                      />
                    </InlineStack>
                  </Box>
                  <Box
                    padding="300"
                    background={contentMode === "inline" ? "bg-surface-selected" : "bg-surface-secondary"}
                    borderRadius="200"
                    borderWidth="025"
                    borderColor={contentMode === "inline" ? "border-success" : "border"}
                  >
                    <InlineStack gap="200" blockAlign="center">
                      <RadioButton
                        label="Write Content"
                        checked={contentMode === "inline"}
                        onChange={() => setContentMode("inline")}
                        name="contentMode"
                      />
                    </InlineStack>
                  </Box>
                </InlineStack>

                <input type="hidden" name="contentMode" value={contentMode} />

                {/* Template Selection */}
                {contentMode === "template" && (
                  <>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm" tone="subdued">Select an existing template</Text>
                      <Button
                        size="slim"
                        onClick={() => navigate("/app/marketing/templates/new")}
                      >
                        Create New Template
                      </Button>
                    </InlineStack>

                    {data.templates.length === 0 ? (
                      <Banner tone="info">
                        <p>No email templates found. Create a template or switch to "Write Content" mode.</p>
                      </Banner>
                    ) : (
                      <BlockStack gap="300">
                        {data.templates.map((template: any) => (
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
                                label={template.name}
                                labelHidden
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
                  </>
                )}

                {/* Inline Editor */}
                {contentMode === "inline" && (
                  <BlockStack gap="400">
                    <TextField
                      label="Subject Line"
                      name="inlineSubject"
                      value={inlineSubject}
                      onChange={setInlineSubject}
                      placeholder="e.g., Don't miss our Summer Sale!"
                      autoComplete="off"
                      requiredIndicator
                    />
                    <TextField
                      label="Preview Text"
                      name="inlinePreviewText"
                      value={inlinePreviewText}
                      onChange={setInlinePreviewText}
                      placeholder="This appears next to the subject in inbox"
                      autoComplete="off"
                      helpText="Shown in email clients alongside the subject line"
                    />
                    <TextField
                      label="Email Content (HTML)"
                      name="inlineContent"
                      value={inlineContent}
                      onChange={setInlineContent}
                      placeholder="<h1>Hello!</h1><p>Your email content here...</p>"
                      autoComplete="off"
                      multiline={8}
                      requiredIndicator
                      helpText="Enter HTML content for your email. Use basic HTML tags like <h1>, <p>, <a>, etc."
                    />
                    <Banner tone="info">
                      <p>For rich email designs, consider creating a template in the Templates section first.</p>
                    </Banner>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Target Audience */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Target Audience</Text>
                <BlockStack gap="300">
                  {data.segments.map((segment: any) => (
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
                            label={segment.name}
                            labelHidden
                            checked={selectedSegment === segment.id}
                            onChange={() => setSelectedSegment(segment.id)}
                            name="segmentRadio"
                          />
                          <Text as="span" fontWeight="semibold">{segment.name}</Text>
                        </InlineStack>
                        <Badge tone="info" children={`${segment.customerCount.toLocaleString()} agreed to marketing`} />
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
                <input type="hidden" name="segmentId" value={selectedSegment} />
                <Banner tone="info">
                  <p>
                    Campaigns go only to customers who subscribed to email marketing in Shopify and have not
                    unsubscribed. Every email includes an unsubscribe link.
                  </p>
                </Banner>
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
                        label="Send immediately"
                        labelHidden
                        checked={scheduleType === "immediate"}
                        onChange={() => setScheduleType("immediate")}
                        name="scheduleRadio"
                        disabled={Boolean(data.marketingBlocked)}
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
                          label="Schedule for later"
                          labelHidden
                          checked={scheduleType === "scheduled"}
                          onChange={() => setScheduleType("scheduled")}
                          name="scheduleRadio"
                          disabled={Boolean(data.marketingBlocked)}
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
                                { label: "7:00 AM", value: "07:00" },
                                { label: "8:00 AM", value: "08:00" },
                                { label: "9:00 AM", value: "09:00" },
                                { label: "10:00 AM", value: "10:00" },
                                { label: "11:00 AM", value: "11:00" },
                                { label: "12:00 PM", value: "12:00" },
                                { label: "1:00 PM", value: "13:00" },
                                { label: "2:00 PM", value: "14:00" },
                                { label: "3:00 PM", value: "15:00" },
                                { label: "4:00 PM", value: "16:00" },
                                { label: "5:00 PM", value: "17:00" },
                                { label: "6:00 PM", value: "18:00" },
                                { label: "7:00 PM", value: "19:00" },
                                { label: "8:00 PM", value: "20:00" },
                                { label: "9:00 PM", value: "21:00" },
                                { label: "10:00 PM", value: "22:00" },
                              ]}
                              value={scheduledTime}
                              onChange={setScheduledTime}
                              helpText={`Your store's time zone (${data.timeZone})`}
                            />
                          </div>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Box>

                  <Box
                    padding="400"
                    background={scheduleType === "draft" ? "bg-surface-selected" : "bg-surface-secondary"}
                    borderRadius="200"
                    borderWidth="025"
                    borderColor={scheduleType === "draft" ? "border-success" : "border"}
                  >
                    <InlineStack gap="300" blockAlign="start">
                      <RadioButton
                        label="Save as draft"
                        labelHidden
                        checked={scheduleType === "draft"}
                        onChange={() => setScheduleType("draft")}
                        name="scheduleRadio"
                      />
                      <BlockStack gap="100">
                        <Text as="span" fontWeight="semibold">Save as Draft</Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Send or schedule it later from the campaign's page
                        </Text>
                      </BlockStack>
                    </InlineStack>
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
                      <Text as="span" tone="subdued">Content:</Text>
                      <Text as="span" fontWeight="semibold">
                        {contentMode === "template"
                          ? (data.templates.find((t: any) => t.id === selectedTemplate)?.name || "No template selected")
                          : (inlineSubject || "Inline content")
                        }
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Audience:</Text>
                      <Text as="span" fontWeight="semibold">
                        {data.segments.find((s: any) => s.id === selectedSegment)?.name || "All Customers"}
                        {" "}({data.segments.find((s: any) => s.id === selectedSegment)?.customerCount || 0} who agreed to marketing email)
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Schedule:</Text>
                      <Text as="span" fontWeight="semibold">
                        {scheduleType === "immediate"
                          ? "Send immediately"
                          : scheduleType === "draft"
                            ? "Save as a draft"
                            : scheduledDate
                              ? `${scheduledDate} at ${scheduledTime} (${data.timeZone})`
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
                    disabled={!isValid || (Boolean(data.marketingBlocked) && scheduleType !== "draft")}
                    loading={busy}
                  >
                    {scheduleType === "immediate" ? "Launch Campaign" : scheduleType === "draft" ? "Save Draft" : "Schedule Campaign"}
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
