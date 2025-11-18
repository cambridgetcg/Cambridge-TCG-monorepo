import { json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useActionData, Form } from "@remix-run/react";
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
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const templateId = params.id;

  if (!templateId) {
    throw new Response("Template ID is required", { status: 400 });
  }

  try {
    const template = await db.emailTemplate.findFirst({
      where: {
        id: templateId,
        shop,
      },
    });

    if (!template) {
      throw new Response("Template not found", { status: 404 });
    }

    return json({ template });
  } catch (error: any) {
    console.error('[Edit Template] Error:', error);
    throw new Response(error.message, { status: 500 });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const templateId = params.id;

  if (!templateId) {
    return json({ error: 'Template ID is required' }, { status: 400 });
  }

  const formData = await request.formData();
  const action = formData.get('_action') as string;

  if (action === 'delete') {
    try {
      await db.emailTemplate.delete({
        where: { id: templateId },
      });
      return redirect('/app/marketing/templates');
    } catch (error: any) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  const name = formData.get('name') as string;
  const type = formData.get('type') as string;
  const subject = formData.get('subject') as string;
  const previewText = formData.get('previewText') as string;
  const bodyHtml = formData.get('bodyHtml') as string;

  if (!name || !type || !subject) {
    return json({ error: 'Name, type, and subject are required' }, { status: 400 });
  }

  try {
    await db.emailTemplate.update({
      where: { id: templateId },
      data: {
        name,
        type,
        subject,
        previewText: previewText || '',
        bodyHtml: bodyHtml || '<p>Email body content here...</p>',
        bodyText: bodyHtml || 'Email body content here...',
        updatedAt: new Date(),
      },
    });

    return json({ success: true });
  } catch (error: any) {
    console.error('[Edit Template] Error updating:', error);
    return json({ error: error.message }, { status: 500 });
  }
};

export default function EditEmailTemplate() {
  const { template } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const actionData = useActionData<typeof action>();

  return (
    <Page
      title={`Edit: ${template.name}`}
      backAction={{ content: 'Templates', onAction: () => navigate('/app/marketing/templates') }}
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
            <Banner tone="success" title="Template updated successfully">
              <p>Your changes have been saved.</p>
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
                    defaultValue={template.name}
                    autoComplete="off"
                    requiredIndicator
                  />

                  <Select
                    label="Template Type"
                    name="type"
                    value={template.type}
                    options={[
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
                    defaultValue={template.subject}
                    autoComplete="off"
                    requiredIndicator
                  />

                  <TextField
                    label="Preview Text"
                    name="previewText"
                    defaultValue={template.previewText || ''}
                    autoComplete="off"
                    helpText="Optional text that appears alongside the subject in the inbox"
                  />

                  <TextField
                    label="Email Body (HTML)"
                    name="bodyHtml"
                    defaultValue={template.bodyHtml}
                    multiline={10}
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

                <InlineStack gap="200" align="space-between">
                  <Button
                    tone="critical"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this template?')) {
                        const form = document.createElement('form');
                        form.method = 'post';
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = '_action';
                        input.value = 'delete';
                        form.appendChild(input);
                        document.body.appendChild(form);
                        form.submit();
                      }
                    }}
                  >
                    Delete Template
                  </Button>
                  <InlineStack gap="200">
                    <Button onClick={() => navigate('/app/marketing/templates')}>
                      Cancel
                    </Button>
                    <Button variant="primary" submit>
                      Save Changes
                    </Button>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            </Card>
          </Form>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
