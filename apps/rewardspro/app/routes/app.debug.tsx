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
  Banner,
  Divider,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getEnabledFeatures, getCurrencyBranding } from "~/services/points-config.server";
import { getRaffleStreakInfo } from "~/services/raffle-streak.server";
import { getCustomerActiveChallenges } from "~/services/challenge-progress.server";
import { getMissionsForCustomer } from "~/services/mission-stats.server";

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
    const raffles = await prisma.raffle.findMany({
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
    const customer = await prisma.customer.findFirst({
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
      const entries = await prisma.raffleEntry.groupBy({
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

  // Step 1: Feature flags
  const step1 = await runStep("features", "Load feature flags (mysteryBoxes)", async () => {
    const features = await getEnabledFeatures(shop);
    return {
      detail: `mysteryBoxes=${features.mysteryBoxes}`,
      data: { mysteryBoxes: features.mysteryBoxes },
    };
  });
  steps.push(step1);

  if (step1.status === "fail") {
    return { module: "Mystery Boxes", steps, overallStatus: "fail" };
  }

  // Step 2: Query active boxes (flat — no nested select/include)
  const step2 = await runStep("mysteryBox.findMany", "Query active mystery boxes (flat)", async () => {
    const boxes = await prisma.mysteryBox.findMany({
      where: {
        shop,
        status: "ACTIVE",
        isPublic: true,
        endsAt: { gt: new Date() },
      },
      orderBy: { endsAt: "asc" },
      take: 10,
    });

    // Verify scalar totalOpens exists (replaced _count.opens)
    for (const box of boxes) {
      if ((box as any).totalOpens === undefined) {
        throw new Error(`box.totalOpens is undefined for box ${box.id} — scalar field missing from flat query`);
      }
    }

    return {
      detail: `Found ${boxes.length} active box(es)`,
      data: boxes.map((b: any) => ({
        id: b.id,
        name: b.name,
        cost: b.openCost,
        totalOpens: b.totalOpens,
        hasTotalOpensField: b.totalOpens !== undefined,
      })),
    };
  });
  steps.push(step2);

  // Step 3: Test separate rewards query (Data API adapter compat)
  const boxIds = (step2.data as any[])?.map((b: any) => b.id) || [];

  if (boxIds.length > 0) {
    const step3 = await runStep(
      "mysteryBoxReward.findMany",
      "Query rewards separately (Data API compat — was nested include)",
      async () => {
        const rewards = await prisma.mysteryBoxReward.findMany({
          where: { boxId: { in: boxIds } },
          orderBy: { probability: "desc" },
        });

        // Verify expected fields exist
        for (const reward of rewards) {
          if (reward.rarity === undefined) {
            throw new Error(`reward.rarity is undefined for reward ${reward.id} — field missing`);
          }
          if (reward.probability === undefined) {
            throw new Error(`reward.probability is undefined for reward ${reward.id} — field missing`);
          }
        }

        // Group by box
        const byBox: Record<string, number> = {};
        for (const r of rewards) {
          byBox[r.boxId] = (byBox[r.boxId] || 0) + 1;
        }

        return {
          detail: `Found ${rewards.length} reward(s) across ${Object.keys(byBox).length} box(es)`,
          data: { total: rewards.length, perBox: byBox },
        };
      }
    );
    steps.push(step3);
  } else {
    steps.push({
      step: "mysteryBoxReward.findMany",
      label: "Query rewards separately",
      status: "skip",
      durationMs: 0,
      detail: "No active boxes to test rewards for",
    });
  }

  // Step 4: Verify _count.opens would fail (regression canary)
  if (boxIds.length > 0) {
    const step4 = await runStep(
      "canary._count",
      "Canary: _count.opens on flat query (should be undefined)",
      async () => {
        const box = await prisma.mysteryBox.findFirst({
          where: { id: boxIds[0] },
        });
        const hasCount = (box as any)?._count !== undefined;
        if (hasCount) {
          return {
            detail: "_count exists on flat query — adapter may support nested aggregates (unexpected)",
          };
        }
        return {
          detail: "_count is undefined on flat query — confirms Data API drops nested aggregates. Use box.totalOpens instead.",
        };
      }
    );
    steps.push(step4);
  } else {
    steps.push({
      step: "canary._count",
      label: "Canary: _count.opens test",
      status: "skip",
      durationMs: 0,
      detail: "No boxes to test",
    });
  }

  // Step 5: Find test customer
  const step5 = await runStep("customer.findFirst", "Find a customer record", async () => {
    const customer = await prisma.customer.findFirst({
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
  steps.push(step5);

  // Step 6: Test customer opens count (separate query — replaced nested _count)
  const customerId = (step5.data as any)?.id;

  if (boxIds.length > 0 && customerId) {
    const step6 = await runStep(
      "mysteryBoxOpen.findMany",
      "Query customer opens per box (separate query)",
      async () => {
        const customerOpens = await prisma.mysteryBoxOpen.findMany({
          where: {
            customerId,
            boxId: { in: boxIds },
          },
          select: { boxId: true },
        });

        const countByBox: Record<string, number> = {};
        for (const open of customerOpens) {
          countByBox[open.boxId] = (countByBox[open.boxId] || 0) + 1;
        }

        return {
          detail: `Customer has ${customerOpens.length} open(s) across ${Object.keys(countByBox).length} box(es)`,
          data: countByBox,
        };
      }
    );
    steps.push(step6);
  } else {
    steps.push({
      step: "mysteryBoxOpen.findMany",
      label: "Query customer opens per box",
      status: "skip",
      durationMs: 0,
      detail: boxIds.length === 0 ? "No active boxes" : "No customer to test with",
    });
  }

  // Step 7: Test open prerequisites (box + rewards separate — mirrors openMysteryBox service)
  if (boxIds.length > 0) {
    const step7 = await runStep(
      "openMysteryBox.prereqs",
      "Open prerequisites: box flat + rewards separate (Data API compat)",
      async () => {
        // Mirrors the flattened pattern in mystery-box-open.server.ts
        const box = await prisma.mysteryBox.findFirst({
          where: { id: boxIds[0], shop },
        });
        if (!box) throw new Error("Box not found in findFirst");

        const rewards = await prisma.mysteryBoxReward.findMany({
          where: { boxId: boxIds[0] },
          orderBy: { position: "asc" },
        });

        // Verify the reward fields needed by selectRewardByProbability
        for (const r of rewards) {
          if (r.probability === undefined) throw new Error(`reward ${r.id} missing probability`);
          if (r.name === undefined) throw new Error(`reward ${r.id} missing name`);
          if (r.description === undefined && r.description !== null) {
            // description is nullable, but the field must exist
          }
        }

        return {
          detail: `Box "${box.name}" has ${rewards.length} reward(s) — open flow prerequisites OK`,
          data: { boxId: box.id, rewardCount: rewards.length },
        };
      }
    );
    steps.push(step7);
  } else {
    steps.push({
      step: "openMysteryBox.prereqs",
      label: "Open prerequisites test",
      status: "skip",
      durationMs: 0,
      detail: "No active boxes to test",
    });
  }

  // Step 8: Canary: include { box: true } on reward (the removeReward/updateReward root cause)
  const anyRewardId = boxIds.length > 0
    ? (await prisma.mysteryBoxReward.findFirst({ where: { boxId: { in: boxIds } }, select: { id: true } }))?.id
    : null;

  if (anyRewardId) {
    const step8 = await runStep(
      "canary.reward.include.box",
      "Canary: include { box: true } on reward (root cause of remove bug)",
      async () => {
        const reward = await prisma.mysteryBoxReward.findFirst({
          where: { id: anyRewardId },
          include: { box: true },
        } as any);
        const hasBox = (reward as any)?.box !== undefined;
        if (hasBox) {
          return {
            detail: "reward.box is populated — adapter supports single-level include on this model (unexpected)",
          };
        }
        return {
          detail: "reward.box is undefined — confirms Data API drops include { box: true }. Use separate queries for reward + box.",
        };
      }
    );
    steps.push(step8);
  } else {
    steps.push({
      step: "canary.reward.include.box",
      label: "Canary: include { box: true } on reward",
      status: "skip",
      durationMs: 0,
      detail: "No rewards to test",
    });
  }

  // Step 9: Flattened reward-then-box lookup (the fix pattern for removeReward/updateReward)
  if (anyRewardId) {
    const step9 = await runStep(
      "reward.flat.then.box",
      "Flattened: reward.findFirst flat + box.findFirst by reward.boxId (fix pattern)",
      async () => {
        const reward = await prisma.mysteryBoxReward.findFirst({
          where: { id: anyRewardId },
        });
        if (!reward) throw new Error("Reward not found in flat query");

        const box = await prisma.mysteryBox.findFirst({
          where: { id: reward.boxId, shop },
        });
        if (!box) throw new Error(`Box ${reward.boxId} not found for shop ${shop}`);

        return {
          detail: `reward "${reward.name}" → box "${box.name}" (status=${box.status}) — flattened lookup OK`,
          data: { rewardId: reward.id, boxId: box.id, boxStatus: box.status },
        };
      }
    );
    steps.push(step9);
  } else {
    steps.push({
      step: "reward.flat.then.box",
      label: "Flattened reward → box lookup",
      status: "skip",
      durationMs: 0,
      detail: "No rewards to test",
    });
  }

  // Step 10: Currency branding
  const step10 = await runStep("getCurrencyBranding", "Load currency branding", async () => {
    const branding = await getCurrencyBranding(shop);
    return {
      detail: `name="${branding.name}", icon="${branding.icon}"`,
      data: branding,
    };
  });
  steps.push(step10);

  const hasFail = steps.some((s) => s.status === "fail");
  const allPass = steps.every((s) => s.status === "pass" || s.status === "skip");

  return {
    module: "Mystery Boxes",
    steps,
    overallStatus: allPass ? "pass" : hasFail ? "fail" : "partial",
  };
}

async function diagnoseMissions(shop: string): Promise<ModuleResult> {
  const steps: StepResult[] = [];
  const now = new Date();

  // Step 1: Basic challenge fetch (flat — no includes)
  const step1 = await runStep("challenge.findMany", "Query active challenges (flat)", async () => {
    const challenges = await prisma.challenge.findMany({
      where: {
        shop,
        status: "ACTIVE",
        startsAt: { lte: now },
        endsAt: { gt: now },
        isPublic: true,
      },
      orderBy: { sortOrder: "asc" },
      take: 10,
    });
    return {
      detail: `Found ${challenges.length} active challenge(s)`,
      data: challenges.map((c: any) => ({ id: c.id, name: c.name })),
    };
  });
  steps.push(step1);

  const challengeIds = (step1.data as any[])?.map((c: any) => c.id) || [];

  // Step 2: Separate reward lookup
  if (challengeIds.length > 0) {
    const step2 = await runStep("challengeReward.findMany", "Query rewards separately (Data API compat)", async () => {
      const rewards = await prisma.challengeReward.findMany({
        where: { challengeId: { in: challengeIds } },
      });
      return {
        detail: `Found ${rewards.length} reward(s) for ${challengeIds.length} challenge(s)`,
        data: rewards.map((r: any) => ({ id: r.id, challengeId: r.challengeId, type: r.rewardType })),
      };
    });
    steps.push(step2);
  } else {
    steps.push({ step: "challengeReward.findMany", label: "Query rewards separately", status: "skip", durationMs: 0, detail: "No active challenges" });
  }

  // Step 3: Separate participant lookup
  const customerId = await getTestCustomerId(shop);

  if (challengeIds.length > 0 && customerId) {
    const step3 = await runStep("challengeParticipant.findMany", "Query participants separately (Data API compat)", async () => {
      const participants = await prisma.challengeParticipant.findMany({
        where: { challengeId: { in: challengeIds }, customerId },
      });
      return {
        detail: `Found ${participants.length} participant record(s) for customer`,
        data: participants.map((p: any) => ({ id: p.id, challengeId: p.challengeId, status: p.status })),
      };
    });
    steps.push(step3);
  } else {
    steps.push({ step: "challengeParticipant.findMany", label: "Query participants separately", status: "skip", durationMs: 0, detail: challengeIds.length === 0 ? "No active challenges" : "No customer to test with" });
  }

  // Step 4: Single-level include (adapter supported — reward only)
  if (challengeIds.length > 0) {
    const step4 = await runStep("challenge.include.reward", "Challenge with include: { reward: true } (adapter supported)", async () => {
      const challenges = await prisma.challenge.findMany({
        where: { id: { in: challengeIds.slice(0, 3) } },
        include: { reward: true },
      });
      const withReward = challenges.filter((c: any) => c.reward).length;
      return {
        detail: `${challenges.length} challenge(s) fetched, ${withReward} with reward attached`,
      };
    });
    steps.push(step4);
  } else {
    steps.push({ step: "challenge.include.reward", label: "Challenge with include: { reward: true }", status: "skip", durationMs: 0, detail: "No active challenges" });
  }

  // Step 5: Filtered include pattern (the P0-1 bug — expected to fail on adapter)
  if (challengeIds.length > 0 && customerId) {
    const step5 = await runStep("challenge.include.participants.where", "Challenge with filtered include: participants (P0-1 pattern)", async () => {
      try {
        const challenges = await prisma.challenge.findMany({
          where: { id: { in: challengeIds.slice(0, 1) } },
          include: {
            reward: true,
            participants: { where: { customerId } },
          },
        });
        // If we get here, check if participants actually populated
        const first = challenges[0] as any;
        if (!first?.participants) {
          throw new Error("participants is undefined — adapter dropped filtered include");
        }
        return {
          detail: `Filtered include worked (unexpected for Data API) — ${first.participants.length} participant(s)`,
        };
      } catch (err: any) {
        throw new Error(`Filtered include fails as expected: ${err.message}. Use separate queries instead.`);
      }
    });
    steps.push(step5);
  } else {
    steps.push({ step: "challenge.include.participants.where", label: "Filtered include pattern (P0-1)", status: "skip", durationMs: 0, detail: "No data to test" });
  }

  // Step 6: Double-nested include pattern (the P0-2/P0-3 bug — expected to fail)
  if (customerId) {
    const step6 = await runStep("participant.include.challenge.include.reward", "Double-nested include: participant → challenge → reward (P0-2/P0-3 pattern)", async () => {
      try {
        const participants = await prisma.challengeParticipant.findMany({
          where: { customerId, shop },
          include: {
            challenge: { include: { reward: true } },
          },
          take: 1,
        });
        if (participants.length > 0) {
          const first = participants[0] as any;
          if (!first?.challenge) {
            throw new Error("challenge is undefined — adapter dropped double-nested include");
          }
        }
        return {
          detail: `Double-nested include returned ${participants.length} result(s) — challenge field ${participants.length > 0 ? "present" : "untested (no data)"}`,
        };
      } catch (err: any) {
        throw new Error(`Double-nested include fails as expected: ${err.message}. Use separate queries instead.`);
      }
    });
    steps.push(step6);
  } else {
    steps.push({ step: "participant.include.challenge.include.reward", label: "Double-nested include (P0-2/P0-3)", status: "skip", durationMs: 0, detail: "No customer to test with" });
  }

  // Step 7: Full mission flow (uses safe separate queries)
  if (customerId) {
    const step7 = await runStep("getMissionsForCustomer", "Full mission flow (safe separate queries)", async () => {
      const missions = await getMissionsForCustomer(shop, customerId);
      const totalMissions =
        missions.missions.daily.length +
        missions.missions.weekly.length +
        missions.missions.monthly.length +
        missions.missions.special.length;
      return {
        detail: `Returned ${totalMissions} mission(s): ${missions.missions.daily.length} daily, ${missions.missions.weekly.length} weekly, ${missions.missions.monthly.length} monthly, ${missions.missions.special.length} special`,
        data: { totalMissions },
      };
    });
    steps.push(step7);
  } else {
    steps.push({ step: "getMissionsForCustomer", label: "Full mission flow", status: "skip", durationMs: 0, detail: "No customer to test with" });
  }

  // Step 8: The caller that used to crash (now fixed with separate queries)
  if (customerId) {
    const step8 = await runStep("getCustomerActiveChallenges", "getCustomerActiveChallenges (was P0-1 crash source)", async () => {
      const challenges = await getCustomerActiveChallenges(shop, customerId);
      return {
        detail: `Returned ${challenges.length} challenge(s) with progress`,
        data: { count: challenges.length, statuses: challenges.map((c) => c.status) },
      };
    });
    steps.push(step8);
  } else {
    steps.push({ step: "getCustomerActiveChallenges", label: "getCustomerActiveChallenges", status: "skip", durationMs: 0, detail: "No customer to test with" });
  }

  const hasFail = steps.some((s) => s.status === "fail");
  const allPass = steps.every((s) => s.status === "pass" || s.status === "skip");

  return {
    module: "Missions",
    steps,
    overallStatus: allPass ? "pass" : hasFail ? "fail" : "partial",
  };
}

/** Helper: find a test customer for diagnostic queries */
async function getTestCustomerId(shop: string): Promise<string | null> {
  const customer = await prisma.customer.findFirst({
    where: { shop },
    select: { id: true },
  });
  return customer?.id || null;
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

  // Test basic DB connectivity. Aurora Data API adapter requires aliased
  // columns to materialise scalar results — bare `SELECT 1` fails silently.
  let dbConnected = false;
  let dbResponseMs = 0;
  const dbStart = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1 as test`;
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
