import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  EmptyState,
  Toast,
  Frame,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getPointsConfig, getEnabledFeatures, updatePointsConfig } from "../services/points-config.server";
import { checkFeatureAccess, requireChallenges } from "~/utils/require-feature.server";
import { FeatureLockedCard } from "~/components/Billing/UpgradePrompt";

// ============================================
// TYPE DEFINITIONS
// ============================================

interface LoaderData {
  challengesEnabled: boolean;
  planAccess: {
    hasAccess: boolean;
    currentPlan?: string;
    requiredPlan?: string;
    message?: string;
  };
  pointsConfig: {
    currencyName: string;
    currencyIcon: string;
    currencyPlural: string;
  };
  challenges: Array<{
    id: string;
    name: string;
    status: string;
    objectiveType: string;
    targetValue: number;
    totalParticipants: number;
    completedCount: number;
    startsAt: string;
    endsAt: string;
  }>;
  stats: {
    totalChallenges: number;
    activeChallenges: number;
    totalParticipants: number;
    totalCompletions: number;
  };
}

interface ActionData {
  success: boolean;
  message?: string;
  error?: string;
  challengeId?: string;
}

// ============================================
// LOADER
// ============================================

const LOG_PREFIX = "[app.points_.challenges]";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`${LOG_PREFIX} Loader starting...`);

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    console.log(`${LOG_PREFIX} Authenticated for shop: ${shop}`);

    // Check plan access for challenges feature
    const planAccess = await checkFeatureAccess(shop, 'challenges');

    // Fetch config and features
    const [config, features] = await Promise.all([
      getPointsConfig(shop),
      getEnabledFeatures(shop),
    ]);

    // TODO: Replace with actual challenge service calls once implemented
    // const [challenges, stats] = await Promise.all([
    //   getChallenges(shop),
    //   getChallengeStats(shop),
    // ]);

    return json<LoaderData>({
      challengesEnabled: features.challenges,
      planAccess: {
        hasAccess: planAccess.hasAccess,
        currentPlan: planAccess.error?.currentPlan,
        requiredPlan: planAccess.error?.requiredPlan,
        message: planAccess.error?.message,
      },
      pointsConfig: {
        currencyName: config.currencyName,
        currencyIcon: config.currencyIcon,
        currencyPlural: config.currencyNamePlural,
      },
      challenges: [], // Placeholder - will be populated when services are implemented
      stats: {
        totalChallenges: 0,
        activeChallenges: 0,
        totalParticipants: 0,
        totalCompletions: 0,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} LOADER ERROR:`, error);
    throw error;
  }
};

// ============================================
// ACTION
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  console.log(`${LOG_PREFIX} Action: ${intent}`);

  try {
    if (intent === "enableFeature") {
      // Enforce feature access before enabling
      await requireChallenges(shop);
      await updatePointsConfig(shop, { challengesEnabled: true });
      return json<ActionData>({ success: true, message: "Challenges enabled" });
    }

    if (intent === "disableFeature") {
      await updatePointsConfig(shop, { challengesEnabled: false });
      return json<ActionData>({ success: true, message: "Challenges disabled" });
    }

    // TODO: Add create, delete, and transition actions once services are implemented

    return json<ActionData>({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error(`${LOG_PREFIX} ACTION ERROR:`, error);
    return json<ActionData>({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// ============================================
// COMPONENT
// ============================================

export default function ChallengesPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  // Show toast on action completion
  useEffect(() => {
    if (actionData) {
      if (actionData.success && actionData.message) {
        setToastMessage(actionData.message);
        setToastError(false);
        setToastActive(true);
      } else if (actionData.error) {
        setToastMessage(actionData.error);
        setToastError(true);
        setToastActive(true);
      }
    }
  }, [actionData]);

  const handleEnableFeature = () => {
    const formData = new FormData();
    formData.append("intent", "enableFeature");
    submit(formData, { method: "post" });
  };

  const handleDisableFeature = () => {
    const formData = new FormData();
    formData.append("intent", "disableFeature");
    submit(formData, { method: "post" });
  };

  // If plan doesn't have access to challenges feature
  if (!data.planAccess.hasAccess) {
    return (
      <Frame>
        <Page
          title="Challenges"
          subtitle="Create goal-based engagement activities for your customers"
          backAction={{ content: "Points", url: "/app/rewards" }}
        >
          <Layout>
            <Layout.Section>
              <FeatureLockedCard
                feature="Challenges"
                description="Create goal-based challenges where customers earn rewards by completing specific objectives like spending thresholds, purchase counts, or buying from specific collections."
                requiredPlan={data.planAccess.requiredPlan?.toLowerCase().includes('max') ? 'max' : 'pro'}
                benefits={[
                  "Spending goal challenges",
                  "Purchase count objectives",
                  "Collection-based challenges",
                  "Streak and consistency rewards",
                  "Detailed progress tracking",
                ]}
              />
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  // Feature not enabled state
  if (!data.challengesEnabled) {
    return (
      <Frame>
        <Page
          title="Challenges"
          subtitle="Create goal-based engagement activities for your customers"
          backAction={{ content: "Points", url: "/app/rewards" }}
        >
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Enable Challenges"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Enable Challenges",
                    onAction: handleEnableFeature,
                    loading: isSubmitting,
                  }}
                >
                  <p>
                    Create challenges where customers earn rewards by completing specific goals
                    like spending thresholds, purchase counts, or buying from specific collections.
                  </p>
                </EmptyState>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
        {toastActive && (
          <Toast
            content={toastMessage}
            error={toastError}
            onDismiss={() => setToastActive(false)}
          />
        )}
      </Frame>
    );
  }

  // Main challenges page (placeholder for now)
  return (
    <Frame>
      <Page
        title="Challenges"
        subtitle="Create goal-based engagement activities for your customers"
        backAction={{ content: "Points", url: "/app/rewards" }}
        primaryAction={{
          content: "Create Challenge",
          disabled: true, // TODO: Enable when services are implemented
        }}
        secondaryActions={[
          {
            content: "Disable Challenges",
            onAction: handleDisableFeature,
            destructive: true,
          },
        ]}
      >
        <Layout>
          {/* Stats Cards */}
          <Layout.Section>
            <InlineStack gap="400" wrap={false}>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Total Challenges</Text>
                  <Text as="p" variant="heading2xl">{data.stats.totalChallenges}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Active</Text>
                  <Text as="p" variant="heading2xl">{data.stats.activeChallenges}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Participants</Text>
                  <Text as="p" variant="heading2xl">{data.stats.totalParticipants}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Completions</Text>
                  <Text as="p" variant="heading2xl">{data.stats.totalCompletions}</Text>
                </BlockStack>
              </Card>
            </InlineStack>
          </Layout.Section>

          <Layout.Section>
            <Divider />
          </Layout.Section>

          {/* Coming Soon Banner */}
          <Layout.Section>
            <Banner
              title="Challenges Module - Coming Soon"
              tone="info"
            >
              <BlockStack gap="200">
                <Text as="p">
                  The Challenges module is currently being developed. Soon you'll be able to create
                  engaging challenges for your customers with various objective types:
                </Text>
                <InlineStack gap="200" wrap>
                  <Badge tone="info">Spending Goals</Badge>
                  <Badge tone="info">Purchase Counts</Badge>
                  <Badge tone="info">Collection Challenges</Badge>
                  <Badge tone="info">Streak Challenges</Badge>
                  <Badge tone="info">Referral Goals</Badge>
                  <Badge tone="info">Milestone Achievements</Badge>
                </InlineStack>
              </BlockStack>
            </Banner>
          </Layout.Section>

          {/* Empty State */}
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No Challenges Yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Challenge creation will be available soon. Check back for updates!
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      {toastActive && (
        <Toast
          content={toastMessage}
          error={toastError}
          onDismiss={() => setToastActive(false)}
        />
      )}
    </Frame>
  );
}
