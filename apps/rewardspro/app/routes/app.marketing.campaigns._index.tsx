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
  Filters,
  ChoiceList,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { PlusIcon } from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { guardInHouseRoute } from "~/services/marketing-mode.server";

interface Campaign {
  id: string;
  name: string;
  status: string;
  subject: string;
  scheduledFor: string | null;
  sentAt: string | null;
  metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    revenue: number;
  } | null;
  createdAt: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Guard: Redirect Klaviyo mode users to main Marketing Hub
  const guardRedirect = await guardInHouseRoute(shop);
  if (guardRedirect) return guardRedirect;

  let campaigns: Campaign[] = [];
  try {
    const dbCampaigns = await db.emailCampaign.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    campaigns = dbCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      subject: c.subject || "",
      scheduledFor: c.scheduledFor?.toISOString() || null,
      sentAt: c.sentAt?.toISOString() || null,
      metrics: c.metrics as Campaign["metrics"],
      createdAt: c.createdAt.toISOString(),
    }));
  } catch (e) {
    console.error("[Campaigns] Error fetching campaigns:", e);
  }

  return json({
    shop,
    campaigns,
  });
};

export default function CampaignsList() {
  const { campaigns } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [queryValue, setQueryValue] = useState("");

  const handleStatusChange = useCallback(
    (value: string[]) => setStatusFilter(value),
    []
  );

  const handleQueryChange = useCallback(
    (value: string) => setQueryValue(value),
    []
  );

  const handleQueryClear = useCallback(() => setQueryValue(""), []);

  const handleStatusRemove = useCallback(() => setStatusFilter([]), []);

  const handleClearAll = useCallback(() => {
    setStatusFilter([]);
    setQueryValue("");
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { tone: any; label: string }> = {
      draft: { tone: "info", label: "Draft" },
      scheduled: { tone: "warning", label: "Scheduled" },
      sending: { tone: "attention", label: "Sending" },
      sent: { tone: "success", label: "Sent" },
      failed: { tone: "critical", label: "Failed" },
      paused: { tone: "warning", label: "Paused" },
    };
    const config = statusConfig[status] || { tone: "info", label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  // Filter campaigns
  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesStatus =
      statusFilter.length === 0 || statusFilter.includes(campaign.status);
    const matchesQuery =
      queryValue === "" ||
      campaign.name.toLowerCase().includes(queryValue.toLowerCase()) ||
      campaign.subject.toLowerCase().includes(queryValue.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "Draft", value: "draft" },
            { label: "Scheduled", value: "scheduled" },
            { label: "Sending", value: "sending" },
            { label: "Sent", value: "sent" },
            { label: "Failed", value: "failed" },
          ]}
          selected={statusFilter}
          onChange={handleStatusChange}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = [];
  if (statusFilter.length > 0) {
    appliedFilters.push({
      key: "status",
      label: `Status: ${statusFilter.join(", ")}`,
      onRemove: handleStatusRemove,
    });
  }

  if (campaigns.length === 0) {
    return (
      <Page
        title="Email Campaigns"
        backAction={{
          content: "Marketing Hub",
          onAction: () => navigate("/app/marketing"),
        }}
        primaryAction={{
          content: "Create Campaign",
          icon: PlusIcon,
          onAction: () => navigate("/app/marketing/campaigns/create"),
        }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Create your first email campaign"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{
                  content: "Create Campaign",
                  onAction: () => navigate("/app/marketing/campaigns/create"),
                }}
                secondaryAction={{
                  content: "Learn about campaigns",
                  url: "https://docs.rewardspro.io/features/email-campaigns",
                  target: "_blank",
                }}
              >
                <p>
                  Send targeted email campaigns to your loyalty program members.
                  Segment by tier, activity, or custom criteria to maximize
                  engagement.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const rows = filteredCampaigns.map((campaign) => [
    <BlockStack gap="100" key={campaign.id}>
      <Button
        variant="plain"
        textAlign="left"
        onClick={() => navigate(`/app/marketing/campaigns/${campaign.id}`)}
      >
        <Text as="span" fontWeight="semibold">
          {campaign.name}
        </Text>
      </Button>
      <Text as="p" variant="bodySm" tone="subdued">
        {campaign.subject || "No subject"}
      </Text>
    </BlockStack>,
    getStatusBadge(campaign.status),
    <Text as="p" variant="bodySm">
      {campaign.status === "sent"
        ? formatDate(campaign.sentAt)
        : campaign.status === "scheduled"
        ? formatDate(campaign.scheduledFor)
        : formatDate(campaign.createdAt)}
    </Text>,
    campaign.metrics ? (
      <BlockStack gap="100">
        <Text as="p" variant="bodySm">
          {campaign.metrics.sent.toLocaleString()} sent
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {campaign.metrics.sent > 0
            ? `${((campaign.metrics.opened / campaign.metrics.sent) * 100).toFixed(1)}% opened`
            : "—"}
        </Text>
      </BlockStack>
    ) : (
      <Text as="p" variant="bodySm" tone="subdued">
        —
      </Text>
    ),
    <InlineStack gap="200" align="end">
      <Button
        size="slim"
        onClick={() => navigate(`/app/marketing/campaigns/${campaign.id}`)}
      >
        {campaign.status === "draft" ? "Edit" : "View"}
      </Button>
      {campaign.status === "draft" && (
        <Button
          size="slim"
          variant="primary"
          onClick={() =>
            navigate(`/app/marketing/campaigns/${campaign.id}/send`)
          }
        >
          Send
        </Button>
      )}
    </InlineStack>,
  ]);

  return (
    <Page
      title="Email Campaigns"
      subtitle={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`}
      backAction={{
        content: "Marketing Hub",
        onAction: () => navigate("/app/marketing"),
      }}
      primaryAction={{
        content: "Create Campaign",
        icon: PlusIcon,
        onAction: () => navigate("/app/marketing/campaigns/create"),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Box padding="400">
              <Filters
                queryValue={queryValue}
                queryPlaceholder="Search campaigns..."
                filters={filters}
                appliedFilters={appliedFilters}
                onQueryChange={handleQueryChange}
                onQueryClear={handleQueryClear}
                onClearAll={handleClearAll}
              />
            </Box>
            {filteredCampaigns.length === 0 ? (
              <Box padding="400">
                <Text as="p" tone="subdued" alignment="center">
                  No campaigns match your filters
                </Text>
              </Box>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Campaign", "Status", "Date", "Performance", "Actions"]}
                rows={rows}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
