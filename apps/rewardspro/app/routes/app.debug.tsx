import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  Badge,
  Box,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  Divider,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { getEnabledFeatures, getCurrencyBranding } from "~/services/points-config.server";
import { getRaffleStreakInfo } from "~/services/raffle-streak.server";

// ─── Types ────────────────────────────────────────────────────

interface StepResult {
  step: string;
  label: string;
  status: "pass" | "fail" | "skip";
  durationMs: number;
  detail?: string;
  error?: string;
  data?: unknown;
}

interface ModuleResult {
  module: string;
  steps: StepResult[];
  overallStatus: "pass" | "fail" | "partial";
}

interface DiagnosticData {
  shop: string;
  timestamp: string;
  modules: ModuleResult[];
  dbConnected: boolean;
  dbResponseMs: number;
}

// ─── Diagnostic Runner ───────────────────────────────────────

async function runStep(
  step: string,
  label: string,
  fn: () => Promise<{ detail?: string; data?: unknown }>
): Promise<StepResult> {
  const start = performance.now();
  try {
    const result = await fn();
    return {
      step,
      label,
      status: "pass",
      durationMs: Math.round(performance.now() - start),
      detail: result.detail,
      data: result.data,
    };
  } catch (error: any) {
    return {
      step,
      label,
      status: "fail",
      durationMs: Math.round(performance.now() - start),
      error: error.message,
      detail: error.code ? `Error code: ${error.code}` : undefined,
    };
  }
}

async function diagnoseRaffles(shop: string): Promise<ModuleResult> {
  const steps: StepResult[] = [];

  // Step 1: Feature flags
  const step1 = await runStep("features", "Load feature flags (getEnabledFeatures)", async () => {
    const features = await getEnabledFeatures(shop);
    return {
      detail: `raffles=${features.raffles}, mysteryBoxes=${features.mysteryBoxes}, challenges=${features.challenges}`,
      data: features,
    };
  });
  steps.push(step1);

  if (step1.status === "fail") {
    return { module: "Raffles", steps, overallStatus: "fail" };
  }

  // Step 2: Query active raffles (no nested select — Data API adapter ignores them)
  const step2 = await runStep("raffle.findMany", "Query active public raffles", async () => {
    const raffles = await db.raffle.findMany({
      where: {
        shop,
        status: "ACTIVE",
        isPublic: true,
        endsAt: { gt: new Date() },
      },
      orderBy: { endsAt: "asc" },
      take: 10,
    });
    return {
      detail: `Found ${raffles.length} active raffle(s)`,
      data: raffles.map((r: any) => ({ id: r.id, name: r.name, entries: r.totalEntries })),
    };
  });
  steps.push(step2);

  // Step 3: Find a test customer
  const step3 = await runStep("customer.findFirst", "Find a customer record", async () => {
    const customer = await db.customer.findFirst({
      where: { shop },
      select: { id: true, shopifyCustomerId: true, pointsBalance: true },
    });
    if (!customer) {
      return { detail: "No customers found in database (OK for new stores)" };
    }
    return {
      detail: `Customer found: shopifyId=${customer.shopifyCustomerId}, balance=${customer.pointsBalance}`,
      data: { id: customer.id, shopifyCustomerId: customer.shopifyCustomerId },
    };
  });
  steps.push(step3);

  // Step 4: Test groupBy query (the likely failure point)
  const raffleIds = (step2.data as any[])?.map((r: any) => r.id) || [];
  const customerId = (step3.data as any)?.id;

  if (raffleIds.length > 0 && customerId) {
    const step4 = await runStep("raffleEntry.groupBy", "GroupBy entry counts (common failure point)", async () => {
      const entries = await db.raffleEntry.groupBy({
        by: ["raffleId"],
        where: {
          customerId,
          raffleId: { in: raffleIds },
        },
        _sum: { entriesCount: true },
      });
      return {
        detail: `GroupBy returned ${entries.length} group(s)`,
        data: entries,
      };
    });
    steps.push(step4);
  } else {
    steps.push({
      step: "raffleEntry.groupBy",
      label: "GroupBy entry counts",
      status: "skip",
      durationMs: 0,
      detail: raffleIds.length === 0 ? "No active raffles to test" : "No customer to test with",
    });
  }

  // Step 5: Test streak info
  if (customerId) {
    const step5 = await runStep("getRaffleStreakInfo", "Load streak/free entry info", async () => {
      const streakInfo = await getRaffleStreakInfo(shop, customerId);
      return {
        detail: `canClaimFreeEntry=${streakInfo.canClaimFreeEntry}`,
        data: streakInfo,
      };
    });
    steps.push(step5);
  } else {
    steps.push({
      step: "getRaffleStreakInfo",
      label: "Load streak info",
      status: "skip",
      durationMs: 0,
      detail: "No customer to test with",
    });
  }

  // Step 6: Test currency branding
  const step6 = await runStep("getCurrencyBranding", "Load currency branding", async () => {
    const branding = await getCurrencyBranding(shop);
    return {
      detail: `name="${branding.name}", icon="${branding.icon}"`,
      data: branding,
    };
  });
  steps.push(step6);

  const hasFail = steps.some((s) => s.status === "fail");
  const allPass = steps.every((s) => s.status === "pass" || s.status === "skip");

  return {
    module: "Raffles",
    steps,
    overallStatus: allPass ? "pass" : hasFail ? "fail" : "partial",
  };
}

async function diagnoseMysteryBoxes(shop: string): Promise<ModuleResult> {
  const steps: StepResult[] = [];

  const step1 = await runStep("mysteryBox.findMany", "Query active mystery boxes", async () => {
    const boxes = await db.mysteryBox.findMany({
      where: {
        shop,
        status: "ACTIVE",
        isPublic: true,
        endsAt: { gt: new Date() },
      },
      take: 10,
    });
    return {
      detail: `Found ${boxes.length} active box(es)`,
      data: boxes.map((b: any) => ({ id: b.id, name: b.name, cost: b.openCost })),
    };
  });
  steps.push(step1);

  const hasFail = steps.some((s) => s.status === "fail");
  return {
    module: "Mystery Boxes",
    steps,
    overallStatus: hasFail ? "fail" : "pass",
  };
}

async function diagnoseMissions(shop: string): Promise<ModuleResult> {
  const steps: StepResult[] = [];

  const step1 = await runStep("missionTemplate.findMany", "Query active mission templates", async () => {
    const missions = await db.missionTemplate.findMany({
      where: {
        shop,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        cadence: true,
        category: true,
      },
      take: 10,
    });
    return {
      detail: `Found ${missions.length} active template(s)`,
      data: missions.map((m) => ({ id: m.id, name: m.name, cadence: m.cadence })),
    };
  });
  steps.push(step1);

  const hasFail = steps.some((s) => s.status === "fail");
  return {
    module: "Missions",
    steps,
    overallStatus: hasFail ? "fail" : "pass",
  };
}

// ─── Loader ──────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return json({ shop: session.shop, diagnostics: null as DiagnosticData | null });
}

// ─── Action (runs diagnostics on demand) ─────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!session?.shop) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const shop = session.shop;

  // Test basic DB connectivity
  let dbConnected = false;
  let dbResponseMs = 0;
  const dbStart = performance.now();
  try {
    await db.$queryRaw`SELECT 1`;
    dbConnected = true;
    dbResponseMs = Math.round(performance.now() - dbStart);
  } catch {
    dbResponseMs = Math.round(performance.now() - dbStart);
  }

  // Run all module diagnostics in parallel
  const [raffles, mysteryBoxes, missions] = await Promise.all([
    diagnoseRaffles(shop),
    diagnoseMysteryBoxes(shop),
    diagnoseMissions(shop),
  ]);

  const diagnostics: DiagnosticData = {
    shop,
    timestamp: new Date().toISOString(),
    modules: [raffles, mysteryBoxes, missions],
    dbConnected,
    dbResponseMs,
  };

  return json({ shop, diagnostics });
}

// ─── Component ───────────────────────────────────────────────

function StatusBadge({ status }: { status: "pass" | "fail" | "skip" | "partial" }) {
  const map = {
    pass: { children: "Pass", tone: "success" as const },
    fail: { children: "Fail", tone: "critical" as const },
    skip: { children: "Skip", tone: "info" as const },
    partial: { children: "Partial", tone: "warning" as const },
  };
  return <Badge {...map[status]} />;
}

export default function DebugPage() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [hasRun, setHasRun] = useState(false);

  const diagnostics = fetcher.data?.diagnostics || loaderData.diagnostics;
  const isRunning = fetcher.state !== "idle";

  const runDiagnostics = () => {
    setHasRun(true);
    fetcher.submit({}, { method: "POST" });
  };

  return (
    <Page
      title="Theme Extension Diagnostics"
      subtitle={`Shop: ${loaderData.shop}`}
      primaryAction={{
        content: isRunning ? "Running..." : "Run Diagnostics",
        onAction: runDiagnostics,
        loading: isRunning,
        icon: RefreshIcon,
      }}
    >
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            This page tests each database query used by the storefront theme
            extension modules (raffles, mystery boxes, missions). Click "Run
            Diagnostics" to identify which step is failing if customers see
            errors.
          </p>
        </Banner>

        {!hasRun && !diagnostics && (
          <Card>
            <Box padding="800">
              <BlockStack gap="200" align="center">
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  Click "Run Diagnostics" to test all theme extension module
                  queries.
                </Text>
              </BlockStack>
            </Box>
          </Card>
        )}

        {diagnostics && (
          <>
            {/* DB Connectivity */}
            <Card>
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Database Connection
                    </Text>
                    <StatusBadge status={diagnostics.dbConnected ? "pass" : "fail"} />
                  </InlineStack>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {diagnostics.dbResponseMs}ms
                  </Text>
                </InlineStack>
              </Box>
            </Card>

            {/* Module Results */}
            {diagnostics.modules.map((mod) => (
              <Card key={mod.module}>
                <Box padding="400">
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="h2" variant="headingMd">
                          {mod.module}
                        </Text>
                        <StatusBadge status={mod.overallStatus} />
                      </InlineStack>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {mod.steps.reduce((sum, s) => sum + s.durationMs, 0)}ms
                        total
                      </Text>
                    </InlineStack>

                    <Divider />

                    {mod.steps.map((step) => (
                      <Box key={step.step} paddingBlockStart="200">
                        <BlockStack gap="100">
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                          >
                            <InlineStack gap="200" blockAlign="center">
                              <Text
                                as="span"
                                variant="bodySm"
                                fontWeight="semibold"
                              >
                                {step.label}
                              </Text>
                              <StatusBadge status={step.status} />
                            </InlineStack>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {step.durationMs}ms
                            </Text>
                          </InlineStack>

                          {step.detail && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              {step.detail}
                            </Text>
                          )}

                          {step.error && (
                            <Banner tone="critical">
                              <p
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: "12px",
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-all",
                                }}
                              >
                                {step.error}
                              </p>
                            </Banner>
                          )}
                        </BlockStack>
                      </Box>
                    ))}
                  </BlockStack>
                </Box>
              </Card>
            ))}

            {/* Timestamp */}
            <Box paddingBlockEnd="400">
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Last run: {new Date(diagnostics.timestamp).toLocaleString()}
              </Text>
            </Box>
          </>
        )}
      </BlockStack>
    </Page>
  );
}
