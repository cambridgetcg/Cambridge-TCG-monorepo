import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { requireMerchant } from "~/admin/require-merchant.server";
import { setNotifyBuyers } from "~/lib/merchant.server";

/**
 * Settings (spec 4.7), one short page: the cashback email switch (Shopify
 * sends the email, through the credit's `notify`), the way to the customer
 * data requests, and help. The widget's look lives in the theme block's own
 * settings, not here.
 */

const DOCS_URL = "https://docs.rewardspro.io";
const CONTACT_EMAIL = "contact@rewardspro.io";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { conn } = await requireMerchant(request);
  return { notifyBuyers: conn.notifyBuyers };
};

type ActionResult = { ok: true } | { ok: false; error: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { conn } = await requireMerchant(request);
  const form = await request.formData();

  if (form.get("intent") === "notify") {
    await setNotifyBuyers(conn.merchantId, form.get("notify") === "on");
    return { ok: true } satisfies ActionResult;
  }
  return data({ ok: false, error: "Unknown action." } satisfies ActionResult, { status: 400 });
};

export default function Settings() {
  const d = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const pending = fetcher.formData?.get("intent") === "notify" ? fetcher.formData.get("notify") === "on" : null;
  const notify = pending ?? d.notifyBuyers;

  return (
    <s-page heading="Settings" inlineSize="base">
      <s-section heading="Cashback emails">
        <s-switch
          label="Email buyers when they earn store credit"
          details="Shopify sends this email itself. RewardsPro sends no email."
          checked={notify}
          onChange={(event) => fetcher.submit({ intent: "notify", notify: event.currentTarget.checked ? "on" : "off" }, { method: "post" })}
        />
        {fetcher.data && !fetcher.data.ok ? <s-text tone="critical">{fetcher.data.error}</s-text> : null}
      </s-section>

      <s-section heading="Privacy">
        <s-link href="/app/settings/privacy">Customer data requests</s-link>
      </s-section>

      <s-section heading="Help">
        <s-stack gap="small-200">
          <s-link href={DOCS_URL} target="_blank">
            Read the RewardsPro docs
          </s-link>
          <s-text>
            Email us at <s-link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</s-link>
          </s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
