import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { formatDay } from "~/admin/customer-history.server";
import { requireMerchant } from "~/admin/require-merchant.server";
import { REPORT_DUE_DAYS, REPORT_RETENTION_DAYS, listPrivacyRequests, reportExpired } from "~/lib/erasure.server";

/**
 * Customer data requests (spec 4.7, a Settings sub-page, not in the menu):
 * each customers/data_request Shopify delivered, newest first, with the day
 * it came, the day it is due (REPORT_DUE_DAYS) and the day its report
 * expires (REPORT_RETENTION_DAYS). They are the rows Home's data-request
 * banner reads. Download fetches the report (app.settings.privacy.download),
 * built live by buildPrivacyReport, which marks the request downloaded and so
 * clears that banner. A request past its expiry can't be downloaded, whether
 * or not the nightly housekeeping has marked it `expired` yet.
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { conn } = await requireMerchant(request);
  const now = new Date();
  const rows = await listPrivacyRequests(conn);
  const day = (date: Date) => formatDay(date, conn.timezone);

  return {
    dueDays: REPORT_DUE_DAYS,
    retentionDays: REPORT_RETENTION_DAYS,
    requests: rows.map((row) => {
      const expired = reportExpired(row, now);
      return {
        id: row.id,
        received: day(row.receivedAt),
        due: day(row.dueAt),
        expires: day(row.expiresAt),
        state: expired ? ("expired" as const) : row.status === "downloaded" ? ("downloaded" as const) : ("open" as const),
        downloaded: row.downloadedAt && !expired ? day(row.downloadedAt) : null,
      };
    }),
  };
};

const UNAVAILABLE = "This report is no longer available.";
const DOWNLOAD_FAILED = "The report couldn't be downloaded. Try again.";

type Row = ReturnType<typeof useLoaderData<typeof loader>>["requests"][number];

export default function PrivacyRequests() {
  const d = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  // fetch carries App Bridge's session token; a plain form post would not
  const download = async (id: string) => {
    setDownloading(id);
    setError(null);
    try {
      const response = await fetch("/app/settings/privacy/download", { method: "POST", body: new URLSearchParams({ id }) });
      if (response.status === 404) {
        setError({ id, text: UNAVAILABLE });
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "customer-data-request.json";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError({ id, text: DOWNLOAD_FAILED });
    } finally {
      setDownloading(null);
      // The request is now downloaded, or gone
      void revalidator.revalidate();
    }
  };

  const status = (row: Row) =>
    row.state === "expired" ? (
      <s-text color="subdued">This report has expired</s-text>
    ) : (
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-button loading={downloading === row.id} disabled={downloading !== null && downloading !== row.id} onClick={() => void download(row.id)}>
          Download
        </s-button>
        {row.downloaded ? <s-text color="subdued">Downloaded {row.downloaded}</s-text> : null}
      </s-stack>
    );

  return (
    <s-page heading="Customer data requests" inlineSize="base">
      <s-link slot="breadcrumb-actions" href="/app/settings">
        Settings
      </s-link>
      <s-section>
        <s-paragraph>
          {`When a customer asks your store for their data, Shopify tells RewardsPro and the request appears here. Download the report and send it to the customer within ${d.dueDays} days. Each report can be downloaded for ${d.retentionDays} days.`}
        </s-paragraph>
      </s-section>
      {d.requests.length === 0 ? (
        <s-section>
          <s-text color="subdued">No customer has asked for their data.</s-text>
        </s-section>
      ) : (
        <s-section padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Received</s-table-header>
              <s-table-header listSlot="labeled">Due</s-table-header>
              <s-table-header listSlot="labeled">Expires</s-table-header>
              <s-table-header listSlot="secondary">Report</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.requests.map((row) => (
                <s-table-row key={row.id}>
                  <s-table-cell>{row.received}</s-table-cell>
                  <s-table-cell>{row.due}</s-table-cell>
                  <s-table-cell>{row.expires}</s-table-cell>
                  <s-table-cell>
                    <s-stack gap="small-200">
                      {status(row)}
                      {error?.id === row.id ? <s-text tone="critical">{error.text}</s-text> : null}
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
