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
  Checkbox,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

interface Automation {
  id: string;
  name: string;
  trigger: string;
  templateId: string | null;
  isEnabled: boolean;
  delayMinutes: number;
  conditions: string | null;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: string;
  name: string;
  subject: string;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    throw new Response("Automation ID required", { status: 400 });
  }

  // Fetch automation
  let automation: Automation | null = null;
  try {
    const dbAutomation = await db.emailAutomation.findFirst({
      where: { id, shop },
    });

    if (!dbAutomation) {
      throw new Response("Automation not found", { status: 404 });
    }

    automation = {
      id: dbAutomation.id,
      name: dbAutomation.name,
      trigger: dbAutomation.trigger,
      templateId: dbAutomation.templateId,
      isEnabled: dbAutomation.isEnabled,
      delayMinutes: dbAutomation.delayMinutes,
      conditions: dbAutomation.conditions as string | null,
      totalSent: dbAutomation.totalSent,
      totalOpened: dbAutomation.totalOpened,
      totalClicked: dbAutomation.totalClicked,
      createdAt: dbAutomation.createdAt.toISOString(),
      updatedAt: dbAutomation.updatedAt.toISOString(),
    };
  } catch (e: any) {
    if (e instanceof Response) throw e;
    console.error("[Automation Detail] Error:", e);
    throw new Response("Error loading automation", { status: 500 });
  }

  // Fetch templates for dropdown
  let templates: Template[] = [];
  try {
    const dbTemplates = await db.emailTemplate.findMany({
      where: { shop },
      orderBy: { name: "asc" },
    });
    templates = dbTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject || "",
    }));
  } catch (e) {
    // Table might not exist
  }

  return json({ automation, templates });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  if (!id) {
    return json({ error: "Automation ID required" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    try {
      await db.emailAutomation.deleteMany({
        where: { id, shop },
      });
      return redirect("/app/marketing/automation/workflows");
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  if (intent === "update") {
    const name = formData.get("name") as string;
    const trigger = formData.get("trigger") as string;
    const templateId = formData.get("templateId") as string;
    const delayMinutes = parseInt(formData.get("delayMinutes") as string) || 0;
    const isEnabled = formData.get("isEnabled") === "true";

    if (!name || !trigger) {
      return json({ error: "Name and trigger are required" }, { status: 400 });
    }

    try {
      await db.emailAutomation.updateMany({
        where: { id, shop },
        data: {
          name,
          trigger,
          templateId: templateId || null,
          delayMinutes,
          isEnabled,
          updatedAt: new Date(),
        },
      });
      return json({ success: true });
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  if (intent === "toggle") {
    try {
      const automation = await db.emailAutomation.findFirst({
        where: { id, shop },
      });

      if (!automation) {
        return json({ error: "Automation not found" }, { status: 404 });
      }

      await db.emailAutomation.updateMany({
        where: { id, shop },
        data: {
          isEnabled: !automation.isEnabled,
          updatedAt: new Date(),
        },
      });
      return json({
        success: true,
        message: `Automation ${automation.isEnabled ? "paused" : "activated"}`,
      });
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function AutomationDetail() {
  const { automation, templates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  const [name, setName] = useState(automation.name);
  const [trigger, setTrigger] = useState(automation.trigger);
  const [templateId, setTemplateId] = useState(automation.templateId || "");
  const [delayMinutes, setDelayMinutes] = useState(automation.delayMinutes.toString());
  const [isEnabled, setIsEnabled] = useState(automation.isEnabled);

  const triggerOptions = [
    { label: "Welcome (New Customer)", value: "welcome" },
    { label: "Tier Upgrade", value: "tier_upgrade" },
    { label: "Tier Downgrade", value: "tier_downgrade" },
    { label: "Points Expiring", value: "points_expiry" },
    { label: "Birthday", value: "birthday" },
    { label: "Win Back (Inactive)", value: "win_back" },
    { label: "Post Purchase", value: "post_purchase" },
  ];

  const delayOptions = [
    { label: "Immediately", value: "0" },
    { label: "1 hour", value: "60" },
    { label: "6 hours", value: "360" },
    { label: "1 day", value: "1440" },
    { label: "3 days", value: "4320" },
    { label: "7 days", value: "10080" },
    { label: "14 days", value: "20160" },
    { label: "30 days", value: "43200" },
  ];

  const formatDate = (dateStr: string) => {
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
      title={automation.name}
      titleMetadata={
        <Badge tone={automation.isEnabled ? "success" : "info"}>
          {automation.isEnabled ? "Active" : "Paused"}
        </Badge>
      }
      backAction={{
        content: "Automations",
        onAction: () => navigate("/app/marketing/automation/workflows"),
      }}
      primaryAction={
        <Form method="post" style={{ display: "inline" }}>
          <input type="hidden" name="intent" value="toggle" />
          <Button variant="primary" submit>
            {automation.isEnabled ? "Pause Automation" : "Activate Automation"}
          </Button>
        </Form>
      }
      secondaryActions={[
        {
          content: "Delete",
          destructive: true,
          onAction: () => {
            if (confirm("Are you sure you want to delete this automation?")) {
              const form = document.createElement("form");
              form.method = "POST";
              form.innerHTML = '<input type="hidden" name="intent" value="delete" />';
              document.body.appendChild(form);
              form.submit();
            }
          },
        },
      ]}
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
            <Banner tone="success" title="Success">
              <p>{actionData.message || "Automation updated successfully"}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Performance Stats */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Performance
              </Text>
              <InlineStack gap="800">
                <BlockStack gap="100">
                  <Text as="p" variant="heading2xl">
                    {automation.totalSent.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Emails Sent
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="heading2xl">
                    {automation.totalSent > 0
                      ? `${((automation.totalOpened / automation.totalSent) * 100).toFixed(1)}%`
                      : "—"}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Open Rate
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="heading2xl">
                    {automation.totalOpened > 0
                      ? `${((automation.totalClicked / automation.totalOpened) * 100).toFixed(1)}%`
                      : "—"}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Click Rate
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Automation Settings */}
        <Layout.Section>
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="isEnabled" value={isEnabled.toString()} />
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Automation Settings
                </Text>

                <FormLayout>
                  <TextField
                    label="Automation Name"
                    name="name"
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                  />

                  <Select
                    label="Trigger"
                    name="trigger"
                    options={triggerOptions}
                    value={trigger}
                    onChange={setTrigger}
                    helpText="When should this automation be triggered?"
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
                  />

                  <Select
                    label="Delay Before Sending"
                    name="delayMinutes"
                    options={delayOptions}
                    value={delayMinutes}
                    onChange={setDelayMinutes}
                    helpText="How long to wait after the trigger before sending"
                  />
                </FormLayout>

                <Divider />

                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Created
                    </Text>
                    <Text as="span">{formatDate(automation.createdAt)}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">
                      Last Updated
                    </Text>
                    <Text as="span">{formatDate(automation.updatedAt)}</Text>
                  </InlineStack>
                </BlockStack>

                <Divider />

                <InlineStack align="end" gap="200">
                  <Button onClick={() => navigate("/app/marketing/automation/workflows")}>
                    Cancel
                  </Button>
                  <Button variant="primary" submit>
                    Save Changes
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </Card>
        </Layout.Section>

        {/* Template Preview */}
        {templateId && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Email Template
                  </Text>
                  <Button
                    size="slim"
                    onClick={() => navigate(`/app/marketing/templates/${templateId}`)}
                  >
                    Edit Template
                  </Button>
                </InlineStack>
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text as="p" fontWeight="semibold">
                      {templates.find((t) => t.id === templateId)?.name || "Template"}
                    </Text>
                    <Text as="p" tone="subdued">
                      Subject: {templates.find((t) => t.id === templateId)?.subject || "—"}
                    </Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
