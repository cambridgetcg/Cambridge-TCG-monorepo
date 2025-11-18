import { json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "@remix-run/node";
import { useNavigate, useActionData, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Select,
  Button,
  Banner,
  FormLayout,
  Text,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { v4 as uuidv4 } from "uuid";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const name = formData.get('name') as string;
  const type = formData.get('type') as string;
  const subject = formData.get('subject') as string;
  const previewText = formData.get('previewText') as string;
  const bodyHtml = formData.get('bodyHtml') as string;

  if (!name || !type || !subject) {
    return json({ error: 'Name, type, and subject are required' }, { status: 400 });
  }

  try {
    const template = await db.emailTemplate.create({
      data: {
        id: uuidv4(),
        shop,
        name,
        type,
        subject,
        previewText: previewText || '',
        bodyHtml: bodyHtml || '<p>Email body content here...</p>',
        bodyText: bodyHtml || 'Email body content here...',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return redirect(`/app/marketing/templates/${template.id}`);
  } catch (error: any) {
    console.error('[New Template] Error creating template:', error);
    return json({ error: error.message }, { status: 500 });
  }
};

export default function NewEmailTemplate() {
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();

  return (
    <Page
      title="Create Email Template"
      backAction={{ content: 'Templates', onAction: () => navigate('/app/marketing/templates') }}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error creating template">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Form method="post">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Template Details
                </Text>

                <FormLayout>
                  <TextField
                    label="Template Name"
                    name="name"
                    placeholder="e.g., VIP Tier Welcome Email"
                    autoComplete="off"
                    requiredIndicator
                  />

                  <Select
                    label="Template Type"
                    name="type"
                    options={[
                      { label: 'Select a type', value: '' },
                      { label: 'Tier Welcome', value: 'tier_welcome' },
                      { label: 'Tier Upgrade', value: 'tier_upgrade' },
                      { label: 'Tier Downgrade', value: 'tier_downgrade' },
                      { label: 'Reward Expiry', value: 'reward_expiry' },
                      { label: 'Inactive Re-engagement', value: 'inactive_reengagement' },
                      { label: 'Abandoned Cart', value: 'abandoned_cart' },
                      { label: 'Promotional', value: 'promotional' },
                      { label: 'Transactional', value: 'transactional' },
                    ]}
                    requiredIndicator
                  />

                  <TextField
                    label="Subject Line"
                    name="subject"
                    placeholder="e.g., Welcome to VIP Status!"
                    autoComplete="off"
                    requiredIndicator
                  />

                  <TextField
                    label="Preview Text"
                    name="previewText"
                    placeholder="This appears in the inbox preview"
                    autoComplete="off"
                    helpText="Optional text that appears alongside the subject in the inbox"
                  />

                  <TextField
                    label="Email Body (HTML)"
                    name="bodyHtml"
                    multiline={10}
                    placeholder="<p>Your email content here...</p>"
                    autoComplete="off"
                    helpText="You can use HTML to format your email"
                  />
                </FormLayout>

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">
                    Available Variables
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Use these variables in your subject and body:
                  </Text>
                  <ul style={{ marginLeft: '20px', fontSize: '13px', color: '#6d7175' }}>
                    <li><code>{'{{customer_name}}'}</code> - Customer's first name</li>
                    <li><code>{'{{tier_name}}'}</code> - Current tier name</li>
                    <li><code>{'{{store_credit}}'}</code> - Store credit balance</li>
                    <li><code>{'{{shop_name}}'}</code> - Your shop name</li>
                  </ul>
                </BlockStack>

                <InlineStack gap="200" align="end">
                  <Button onClick={() => navigate('/app/marketing/templates')}>
                    Cancel
                  </Button>
                  <Button variant="primary" submit>
                    Create Template
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Form>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
