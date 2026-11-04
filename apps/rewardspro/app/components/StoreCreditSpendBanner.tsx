/**
 * StoreCreditSpendBanner - the dashboard's warning when shoppers can't spend
 * the store credit RewardsPro issues
 *
 * Its own banner, not a step in the first-run setup card: the card hides once
 * its steps are done or it is dismissed, and these problems stay until the
 * merchant fixes them. For the same reason it has no Dismiss. Every fix is in
 * Settings > Customer accounts, so it links there.
 */

import { Banner, BlockStack, List, Text } from "@shopify/polaris";
import type { StoreCreditSpendProblem } from "~/services/store-credit-spend.server";

const PROBLEM_TEXT: Record<StoreCreditSpendProblem, string> = {
  "legacy-accounts":
    "Your store uses legacy customer accounts, which don't support store credit. Upgrade to new customer accounts.",
  "sign-in-links-hidden":
    "Your store hides its sign-in links, so shoppers can't sign in at checkout. Show the sign-in links.",
  "store-credit-off": "Store credit is turned off, so checkout doesn't offer it. Turn on Store credit.",
};

export interface StoreCreditSpendBannerProps {
  shop: string;
  problems: StoreCreditSpendProblem[];
}

export function StoreCreditSpendBanner({ shop, problems }: StoreCreditSpendBannerProps) {
  if (problems.length === 0) return null;

  return (
    <Banner
      title="Make sure shoppers can spend their store credit"
      tone="warning"
      action={{
        content: "Open customer account settings",
        url: `https://${shop}/admin/settings/customer_accounts`,
        target: "_blank",
      }}
    >
      <BlockStack gap="200">
        <Text as="p" variant="bodySm">
          RewardsPro pays cashback as Shopify store credit. Shoppers can spend it at checkout only when they sign in
          with new customer accounts or pay with Shop Pay.
        </Text>
        <List>
          {problems.map((problem) => (
            <List.Item key={problem}>{PROBLEM_TEXT[problem]}</List.Item>
          ))}
        </List>
      </BlockStack>
    </Banner>
  );
}
