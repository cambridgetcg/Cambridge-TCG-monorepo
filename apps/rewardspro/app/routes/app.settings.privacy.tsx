import { useCallback, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { Badge, Banner, BlockStack, Button, Card, DataTable, EmptyState, Layout, Page, Text } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { APP_ROUTES } from "~/navigation/routes";
import { listDataRequests, REPORT_RETENTION_DAYS } from "~/services/customer-data-request.server";

/**
 * Privacy requests: customer data reports Shopify asked for
 * (customers/data_request), for the merchant to download and send to the
 * customer. See services/customer-data-request.server.ts.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const requests = await listDataRequests(session.shop);
  return json({ requests, retentionDays: REPORT_RETENTION_DAYS });
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function PrivacyRequests() {
  const { requests, retentionDays } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // fetch keeps the embedded session token; the report arrives as a file
  const download = useCallback(async (id: string) => {
    setDownloading(id);
    setError(null);
    try {
      const response = await fetch(`${APP_ROUTES.SETTINGS.PRIVACY}/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(response.statusText);
      const filename = response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "customer-data-request.json";
      const url = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      revalidator.revalidate();
    } catch {
      setError("The report could not be downloaded. Please try again.");
    } finally {
      setDownloading(null);
    }
  }, [revalidator]);

  const rows = requests.map((r) => [
    formatDate(r.createdAt),
    r.shopifyRequestId,
    r.shopifyCustomerId,
    String(r.recordCount),
    r.downloadedAt ? <Badge key={`${r.id}-status`} tone="success">{`Downloaded ${formatDate(r.downloadedAt)}`}</Badge> : <Badge key={`${r.id}-status`} tone="attention">Not downloaded</Badge>,
    formatDate(r.expiresAt),
    <Button key={`${r.id}-download`} size="slim" loading={downloading === r.id} onClick={() => download(r.id)}>
      Download
    </Button>,
  ]);

  return (
    <Page
      title="Privacy requests"
      subtitle="Customer data requests sent by Shopify"
      backAction={{ content: "Settings", onAction: () => navigate(APP_ROUTES.SETTINGS.ROOT) }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <p>
                When a customer asks for their data, Shopify sends RewardsPro a data request. Download the
                report and send it to the customer within 30 days. Each report lists every record RewardsPro
                holds about the customer and is deleted {retentionDays} days after it was made.
              </p>
            </Banner>
            {error && (
              <Banner tone="critical">
                <p>{error}</p>
              </Banner>
            )}
            <Card padding={requests.length ? "0" : undefined}>
              {requests.length === 0 ? (
                <EmptyState heading="No data requests" image="">
                  <Text as="p">Reports appear here when Shopify sends a customer data request.</Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "numeric", "text", "text", "text"]}
                  headings={["Requested", "Request ID", "Shopify customer ID", "Records", "Status", "Deleted on", ""]}
                  rows={rows}
                />
              )}
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
