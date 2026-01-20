import { json, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  EmptyState,
  Badge,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { guardInHouseRoute } from "~/services/marketing-mode.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log('[Marketing Templates] === Loader Started ===');

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log('[Marketing Templates] ✓ Authenticated for shop:', shop);

    // Guard: Redirect Klaviyo mode users to main Marketing Hub
    const guardRedirect = await guardInHouseRoute(shop);
    if (guardRedirect) return guardRedirect;

    // Fetch email templates
    let templates: any[] = [];
    try {
      templates = await db.emailTemplate.findMany({
        where: { shop },
        orderBy: { updatedAt: 'desc' },
      });
      console.log('[Marketing Templates] ✓ Found', templates.length, 'templates');
    } catch (error: any) {
      console.error('[Marketing Templates] ⚠️ Error fetching templates:', error.message);
    }

    return json({ shop, templates });
  } catch (error: any) {
    // If it's a Response (auth redirect), rethrow it
    if (error instanceof Response) {
      throw error;
    }
    console.error('[Marketing Templates] ❌ Fatal error:', error.message || error);
    return json({ shop: 'unknown', templates: [] }, { status: 500 });
  }
};

export default function EmailTemplates() {
  const { templates } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTypeBadge = (type: string) => {
    const typeMap: Record<string, { tone: any; text: string }> = {
      tier_welcome: { tone: 'info', text: 'Tier Welcome' },
      tier_upgrade: { tone: 'success', text: 'Tier Upgrade' },
      tier_downgrade: { tone: 'warning', text: 'Tier Downgrade' },
      reward_expiry: { tone: 'attention', text: 'Reward Expiry' },
      inactive_reengagement: { tone: 'info', text: 'Re-engagement' },
      abandoned_cart: { tone: 'warning', text: 'Abandoned Cart' },
      promotional: { tone: 'magic', text: 'Promotional' },
      transactional: { tone: 'success', text: 'Transactional' },
    };
    const config = typeMap[type] || { tone: 'info', text: type };
    return <Badge tone={config.tone}>{config.text}</Badge>;
  };

  if (templates.length === 0) {
    return (
      <Page
        title="Email Templates"
        subtitle="Create and manage email templates for your campaigns"
        backAction={{ content: 'Marketing Hub', onAction: () => navigate('/app/marketing') }}
        primaryAction={{
          content: 'Create Template',
          onAction: () => navigate('/app/marketing/templates/new'),
        }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No email templates yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Create reusable email templates for your loyalty campaigns.
                  Templates can include personalized content, tier-specific messaging, and dynamic rewards information.
                </p>
                <Button variant="primary" onClick={() => navigate('/app/marketing/templates/new')}>
                  Create Your First Template
                </Button>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const rows = templates.map((template) => [
    <BlockStack gap="100" key={template.id}>
      <Text as="p" fontWeight="semibold">
        {template.name}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        {template.subject || 'No subject'}
      </Text>
    </BlockStack>,
    getTypeBadge(template.type),
    <Text as="p" variant="bodySm" tone="subdued">
      {formatDate(template.updatedAt)}
    </Text>,
    <InlineStack gap="200" align="end">
      <Button size="slim" onClick={() => navigate(`/app/marketing/templates/${template.id}`)}>
        Edit
      </Button>
      <Button size="slim" onClick={() => navigate(`/app/marketing/campaigns/smart-create?template=${template.id}`)}>
        Use in Campaign
      </Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title="Email Templates"
      subtitle={`${templates.length} template${templates.length === 1 ? '' : 's'}`}
      backAction={{ content: 'Marketing Hub', onAction: () => navigate('/app/marketing') }}
      primaryAction={{
        content: 'Create Template',
        onAction: () => navigate('/app/marketing/templates/new'),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text']}
              headings={['Template Name', 'Type', 'Last Updated', 'Actions']}
              rows={rows}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
