import { json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, Form, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  TextField,
  Select,
  FormLayout,
  Banner,
  Divider,
  Box,
  InlineGrid,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  revenue: number;
  orders: number;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    throw new Response("Campaign ID required", { status: 400 });
  }

  let campaign = null;
  try {
    campaign = await db.emailCampaign.findFirst({
      where: { id, shop },
    });
  } catch (e) {
    console.error("[Campaign Detail] Error fetching campaign:", e);
  }

  if (!campaign) {
    throw new Response("Campaign not found", { status: 404 });
  }

  // Fetch templates for the dropdown
  let templates: { id: string; name: string }[] = [];
  try {
    templates = await db.emailTemplate.findMany({
      where: { shop },
      orderBy: { name: "asc" },
    });
  } catch (e) {
    // Table might not exist
  }

  return json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      subject: campaign.subject || "",
      previewText: campaign.previewText || "",
      templateId: campaign.templateId || "",
      scheduledFor: campaign.scheduledFor?.toISOString() || null,
      sentAt: campaign.sentAt?.toISOString() || null,
      metrics: campaign.metrics as CampaignMetrics | null,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    },
    templates,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    return json({ error: "Campaign ID required" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    try {
      await db.emailCampaign.deleteMany({
        where: { id, shop },
      });
      return redirect("/app/marketing/campaigns");
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  if (intent === "update") {
    const name = formData.get("name") as string;
    const subject = formData.get("subject") as string;
    const previewText = formData.get("previewText") as string;
    const templateId = formData.get("templateId") as string;

    if (!name || !subject) {
      return json({ error: "Name and subject are required" }, { status: 400 });
    }

    try {
      await db.emailCampaign.updateMany({
        where: { id, shop },
        data: {
          name,
          subject,
          previewText,
          templateId: templateId || null,
          updatedAt: new Date(),
        },
      });
      return json({ success: true });
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

function MetricCard({ label, value, subValue }: { label: string; value: string | number; subValue?: string }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
        <Text as="p" variant="headingLg">{typeof value === 'number' ? value.toLocaleString() : value}</Text>
        {subValue && <Text as="span" variant="bodySm" tone="subdued">{subValue}</Text>}
      </BlockStack>
    </Card>
  );
}

export default function CampaignDetail() {
  const { campaign, templates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject);
  const [previewText, setPreviewText] = useState(campaign.previewText);
  const [templateId, setTemplateId] = useState(campaign.templateId);

  const isDraft = campaign.status === "draft";
  const isSent = campaign.status === "sent";

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { tone: any; label: string }> = {
      draft: { tone: "info", label: "Draft" },
      scheduled: { tone: "warning", label: "Scheduled" },
      sending: { tone: "attention", label: "Sending" },
      sent: { tone: "success", label: "Sent" },
      failed: { tone: "critical", label: "Failed" },
    };
    const config = statusConfig[status] || { tone: "info", label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Page
      title={campaign.name}
      titleMetadata={getStatusBadge(campaign.status)}
      backAction={{
        content: "Campaigns",
        onAction: () => navigate("/app/marketing/campaigns"),
      }}
      primaryAction={
        isDraft
          ? {
              content: "Send Campaign",
              onAction: () => navigate(`/app/marketing/campaigns/${campaign.id}/send`),
            }
          : undefined
      }
      secondaryActions={
        isDraft
          ? [
              {
                content: "Delete",
                destructive: true,
                onAction: () => {
                  if (confirm("Are you sure you want to delete this campaign?")) {
                    const form = document.createElement("form");
                    form.method = "POST";
                    form.innerHTML = '<input type="hidden" name="intent" value="delete" />';
                    document.body.appendChild(form);
                    form.submit();
                  }
                },
              },
            ]
          : undefined
      }
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Campaign updated">
              <p>Your changes have been saved.</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Performance Metrics (for sent campaigns) */}
        {isSent && campaign.metrics && (
          <Layout.Section>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Performance</Text>
              <InlineGrid columns={{ xs: 2, sm: 3, md: 6 }} gap="400">
                <MetricCard
                  label="Sent"
                  value={campaign.metrics.sent}
                />
                <MetricCard
                  label="Delivered"
                  value={campaign.metrics.delivered}
                  subValue={campaign.metrics.sent > 0 ? `${((campaign.metrics.delivered / campaign.metrics.sent) * 100).toFixed(1)}%` : undefined}
                />
                <MetricCard
                  label="Opened"
                  value={campaign.metrics.opened}
                  subValue={campaign.metrics.delivered > 0 ? `${((campaign.metrics.opened / campaign.metrics.delivered) * 100).toFixed(1)}%` : undefined}
                />
                <MetricCard
                  label="Clicked"
                  value={campaign.metrics.clicked}
                  subValue={campaign.metrics.opened > 0 ? `${((campaign.metrics.clicked / campaign.metrics.opened) * 100).toFixed(1)}%` : undefined}
                />
                <MetricCard
                  label="Bounced"
                  value={campaign.metrics.bounced || 0}
                  subValue={campaign.metrics.sent > 0 ? `${(((campaign.metrics.bounced || 0) / campaign.metrics.sent) * 100).toFixed(1)}%` : undefined}
                />
                <MetricCard
                  label="Revenue"
                  value={`$${(campaign.metrics.revenue || 0).toLocaleString()}`}
                  subValue={`${campaign.metrics.orders || 0} orders`}
                />
              </InlineGrid>
            </BlockStack>
          </Layout.Section>
        )}

        {/* Campaign Details */}
        <Layout.Section>
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="update" />
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  {isDraft ? "Campaign Details" : "Campaign Information"}
                </Text>

                <FormLayout>
                  <TextField
                    label="Campaign Name"
                    name="name"
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                    disabled={!isDraft}
                  />

                  <TextField
                    label="Subject Line"
                    name="subject"
                    value={subject}
                    onChange={setSubject}
                    autoComplete="off"
                    disabled={!isDraft}
                  />

                  <TextField
                    label="Preview Text"
                    name="previewText"
                    value={previewText}
                    onChange={setPreviewText}
                    autoComplete="off"
                    helpText="Text shown alongside the subject in the inbox"
                    disabled={!isDraft}
                  />

                  <Select
                    label="Email Template"
                    name="templateId"
                    options={[
                      { label: "Select a template", value: "" },
                      ...templates.map((t) => ({ label: t.name, value: t.id })),
                    ]}
                    value={templateId}
                    onChange={setTemplateId}
                    disabled={!isDraft}
                  />
                </FormLayout>

                <Divider />

                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Created</Text>
                    <Text as="span">{formatDate(campaign.createdAt)}</Text>
                  </InlineStack>
                  {campaign.sentAt && (
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Sent</Text>
                      <Text as="span">{formatDate(campaign.sentAt)}</Text>
                    </InlineStack>
                  )}
                  {campaign.scheduledFor && campaign.status === "scheduled" && (
                    <InlineStack align="space-between">
                      <Text as="span" tone="subdued">Scheduled for</Text>
                      <Text as="span">{formatDate(campaign.scheduledFor)}</Text>
                    </InlineStack>
                  )}
                </BlockStack>

                {isDraft && (
                  <>
                    <Divider />
                    <InlineStack align="end" gap="200">
                      <Button onClick={() => navigate("/app/marketing/campaigns")}>
                        Cancel
                      </Button>
                      <Button variant="primary" submit>
                        Save Changes
                      </Button>
                    </InlineStack>
                  </>
                )}
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
