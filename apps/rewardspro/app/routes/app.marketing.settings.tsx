import { json, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  InlineStack,
  FormLayout,
  Checkbox,
  Select,
  Frame,
  Toast,
  Banner,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get email settings or create default
  let emailSettings = await db.emailSettings.findUnique({
    where: { shop },
  });

  // Get shop settings for defaults
  const shopSettings = await db.shopSettings.findUnique({
    where: { shop },
    select: {
      storeName: true,
      storeUrl: true,
    },
  });

  return json({
    shop,
    emailSettings,
    shopSettings,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "saveSettings") {
    const senderName = formData.get("senderName") as string;
    const senderEmail = formData.get("senderEmail") as string;
    const replyToEmail = formData.get("replyToEmail") as string || null;
    const primaryColor = formData.get("primaryColor") as string;
    const secondaryColor = formData.get("secondaryColor") as string;
    const fontFamily = formData.get("fontFamily") as string;
    const includeUnsubscribe = formData.get("includeUnsubscribe") === "true";
    const includePhysicalAddress = formData.get("includePhysicalAddress") === "true";
    const gdprEnabled = formData.get("gdprEnabled") === "true";
    const footerText = formData.get("footerText") as string;
    const dailyLimit = parseInt(formData.get("dailyLimit") as string);
    const hourlyLimit = parseInt(formData.get("hourlyLimit") as string);
    const preferredTime = formData.get("preferredTime") as string;
    const timezone = formData.get("timezone") as string;

    const brandColors = { primary: primaryColor, secondary: secondaryColor };
    const typography = { fontFamily };
    const footerContent = { text: footerText };
    const sendTimePrefs = { preferredTime, timezone, dailyLimit, hourlyLimit };

    // Upsert settings
    await db.emailSettings.upsert({
      where: { shop },
      create: {
        shop,
        senderName,
        senderEmail,
        replyToEmail,
        brandColors,
        typography,
        footerContent,
        includeUnsubscribe,
        includePhysicalAddress,
        gdprEnabled,
        sendTimePrefs,
      },
      update: {
        senderName,
        senderEmail,
        replyToEmail,
        brandColors,
        typography,
        footerContent,
        includeUnsubscribe,
        includePhysicalAddress,
        gdprEnabled,
        sendTimePrefs,
      },
    });

    return json({ success: true, message: "Settings saved successfully!" });
  }

  return json({ success: false, message: "Invalid request" }, { status: 400 });
};

export default function EmailSettings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  // Initialize form state
  const [formValues, setFormValues] = useState({
    senderName: data.emailSettings?.senderName || data.shopSettings?.storeName || "",
    senderEmail: data.emailSettings?.senderEmail || "",
    replyToEmail: data.emailSettings?.replyToEmail || "",
    primaryColor: (data.emailSettings?.brandColors as any)?.primary || "#5C6AC4",
    secondaryColor: (data.emailSettings?.brandColors as any)?.secondary || "#F4F6F8",
    fontFamily: (data.emailSettings?.typography as any)?.fontFamily || "Inter",
    includeUnsubscribe: data.emailSettings?.includeUnsubscribe ?? true,
    includePhysicalAddress: data.emailSettings?.includePhysicalAddress ?? true,
    gdprEnabled: data.emailSettings?.gdprEnabled ?? true,
    footerText: (data.emailSettings?.footerContent as any)?.text || `© ${new Date().getFullYear()} ${data.shopSettings?.storeName}. All rights reserved.`,
    dailyLimit: (data.emailSettings?.sendTimePrefs as any)?.dailyLimit || 1000,
    hourlyLimit: (data.emailSettings?.sendTimePrefs as any)?.hourlyLimit || 100,
    preferredTime: (data.emailSettings?.sendTimePrefs as any)?.preferredTime || "10:00",
    timezone: (data.emailSettings?.sendTimePrefs as any)?.timezone || "America/New_York",
  });

  const [toastActive, setToastActive] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success) {
      setToastActive(true);
    }
  }, [fetcher.data]);

  const handleChange = (field: string) => (value: string | boolean) => {
    setFormValues({ ...formValues, [field]: value });
  };

  const handleSubmit = () => {
    const formData = new FormData();
    formData.append("intent", "saveSettings");
    Object.entries(formValues).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    fetcher.submit(formData, { method: "post" });
  };

  const isSaving = fetcher.state === "submitting";

  const timezoneOptions = [
    { label: "Eastern Time (ET)", value: "America/New_York" },
    { label: "Central Time (CT)", value: "America/Chicago" },
    { label: "Mountain Time (MT)", value: "America/Denver" },
    { label: "Pacific Time (PT)", value: "America/Los_Angeles" },
    { label: "UTC", value: "UTC" },
  ];

  const fontOptions = [
    { label: "Inter", value: "Inter" },
    { label: "Helvetica", value: "Helvetica" },
    { label: "Arial", value: "Arial" },
    { label: "Georgia", value: "Georgia" },
    { label: "Times New Roman", value: "Times New Roman" },
  ];

  return (
    <Frame>
      <Page
        title="Email Settings"
        subtitle="Configure sender, brand, and compliance settings"
        backAction={{ content: "Marketing Hub", url: "/app/marketing" }}
      >
        <Layout>
          {/* Sender Configuration */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Sender Configuration
                </Text>

                <FormLayout>
                  <TextField
                    label="From Name"
                    value={formValues.senderName}
                    onChange={handleChange("senderName")}
                    helpText="The name that appears in the 'From' field"
                    autoComplete="off"
                  />

                  <FormLayout.Group>
                    <TextField
                      label="From Email"
                      type="email"
                      value={formValues.senderEmail}
                      onChange={handleChange("senderEmail")}
                      helpText="Must be verified domain email"
                      autoComplete="email"
                    />

                    <TextField
                      label="Reply-To Email"
                      type="email"
                      value={formValues.replyToEmail}
                      onChange={handleChange("replyToEmail")}
                      helpText="Where replies are sent (optional)"
                      autoComplete="email"
                    />
                  </FormLayout.Group>
                </FormLayout>

                <Banner tone="info">
                  <Text variant="bodySm" as="p">
                    Domain verification (SPF, DKIM, DMARC) is recommended for better deliverability.
                  </Text>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Brand Customization */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Brand Customization
                </Text>

                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Primary Color"
                      type="color"
                      value={formValues.primaryColor}
                      onChange={handleChange("primaryColor")}
                      helpText="Main brand color for buttons and links"
                      autoComplete="off"
                    />

                    <TextField
                      label="Secondary Color"
                      type="color"
                      value={formValues.secondaryColor}
                      onChange={handleChange("secondaryColor")}
                      helpText="Background and accent color"
                      autoComplete="off"
                    />
                  </FormLayout.Group>

                  <Select
                    label="Font Family"
                    options={fontOptions}
                    value={formValues.fontFamily}
                    onChange={handleChange("fontFamily")}
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Compliance */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Compliance
                </Text>

                <BlockStack gap="300">
                  <Checkbox
                    label="Include unsubscribe link"
                    checked={formValues.includeUnsubscribe}
                    onChange={handleChange("includeUnsubscribe")}
                    helpText="Required by CAN-SPAM Act"
                  />

                  <Checkbox
                    label="Add physical address"
                    checked={formValues.includePhysicalAddress}
                    onChange={handleChange("includePhysicalAddress")}
                    helpText="Required by CAN-SPAM Act"
                  />

                  <Checkbox
                    label="GDPR consent tracking"
                    checked={formValues.gdprEnabled}
                    onChange={handleChange("gdprEnabled")}
                    helpText="Track and honor consent for EU customers"
                  />

                  <Divider />

                  <TextField
                    label="Footer Text"
                    value={formValues.footerText}
                    onChange={handleChange("footerText")}
                    multiline={2}
                    helpText="Copyright and legal text in email footer"
                    autoComplete="off"
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Send Controls */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">
                  Send Controls
                </Text>

                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Daily Limit"
                      type="number"
                      value={String(formValues.dailyLimit)}
                      onChange={handleChange("dailyLimit")}
                      helpText="Maximum emails per day"
                      autoComplete="off"
                      min="1"
                    />

                    <TextField
                      label="Hourly Limit"
                      type="number"
                      value={String(formValues.hourlyLimit)}
                      onChange={handleChange("hourlyLimit")}
                      helpText="Maximum emails per hour"
                      autoComplete="off"
                      min="1"
                    />
                  </FormLayout.Group>

                  <FormLayout.Group>
                    <TextField
                      label="Preferred Send Time"
                      type="time"
                      value={formValues.preferredTime}
                      onChange={handleChange("preferredTime")}
                      helpText="Default time for scheduled emails"
                      autoComplete="off"
                    />

                    <Select
                      label="Timezone"
                      options={timezoneOptions}
                      value={formValues.timezone}
                      onChange={handleChange("timezone")}
                    />
                  </FormLayout.Group>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Save Button */}
          <Layout.Section>
            <Card>
              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  loading={isSaving}
                >
                  Save Settings
                </Button>
              </InlineStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {toastActive && (
        <Toast
          content={fetcher.data?.message || "Settings saved!"}
          onDismiss={() => setToastActive(false)}
        />
      )}
    </Frame>
  );
}
