/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║           NEURAL TIER RECALCULATION ENGINE v2.0                          ║
 * ║                                                                           ║
 * ║   CNS/PNS Partitioned Architecture with Crystalline Transformations      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Architecture Overview:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                    PERIPHERAL NERVOUS SYSTEM (PNS)                      │
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
 * │  │ AFFERENT STREAM │  │ AFFERENT STREAM │  │ AFFERENT STREAM │         │
 * │  │   (Tiers)       │  │  (Overrides)    │  │ (Subscriptions) │         │
 * │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘         │
 * │           │                    │                    │                   │
 * │           └────────────────────┼────────────────────┘                   │
 * │                                ▼                                        │
 * │  ┌─────────────────────────────────────────────────────────────────┐   │
 * │  │                    SENSORY GANGLION                              │   │
 * │  │              (Data Aggregation & Clustering)                     │   │
 * │  └─────────────────────────────┬───────────────────────────────────┘   │
 * └────────────────────────────────┼───────────────────────────────────────┘
 *                                  │
 *                                  ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                    CENTRAL NERVOUS SYSTEM (CNS)                         │
 * │                                                                         │
 * │  ┌─────────────────────────────────────────────────────────────────┐   │
 * │  │                    CRYSTAL CORTEX                                │   │
 * │  │              (Pure Function Processing)                          │   │
 * │  │                                                                  │   │
 * │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
 * │  │  │ PRIORITY     │  │ RESOLUTION   │  │ PROGRESS     │           │   │
 * │  │  │ NUCLEUS      │  │ NUCLEUS      │  │ NUCLEUS      │           │   │
 * │  │  └──────────────┘  └──────────────┘  └──────────────┘           │   │
 * │  └─────────────────────────────┬───────────────────────────────────┘   │
 * │                                │                                       │
 * │  ┌─────────────────────────────▼───────────────────────────────────┐   │
 * │  │                    CLUSTER PROCESSOR                             │   │
 * │  │         (Parallel Processing by Source Type)                     │   │
 * │  │                                                                  │   │
 * │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │   │
 * │  │  │Override│ │Subscr. │ │Purchase│ │Spending│ │  Base  │        │   │
 * │  │  │Cluster │ │Cluster │ │Cluster │ │Cluster │ │Cluster │        │   │
 * │  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │   │
 * │  └─────────────────────────────┬───────────────────────────────────┘   │
 * └────────────────────────────────┼───────────────────────────────────────┘
 *                                  │
 *                                  ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                    PERIPHERAL NERVOUS SYSTEM (PNS)                      │
 * │  ┌─────────────────────────────────────────────────────────────────┐   │
 * │  │                    MOTOR GANGLION                                │   │
 * │  │              (Batched Output Clustering)                         │   │
 * │  └─────────────────────────────┬───────────────────────────────────┘   │
 * │           ┌────────────────────┼────────────────────┐                   │
 * │           ▼                    ▼                    ▼                   │
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
 * │  │ EFFERENT STREAM │  │ EFFERENT STREAM │  │ EFFERENT STREAM │         │
 * │  │  (Customers)    │  │  (ChangeLogs)   │  │   (States)      │         │
 * │  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import prisma from "~/db.server";
import type { Tier, Customer, TierSubscription, TierPurchase, TierSource as TierSourceEnum } from "@prisma/client";
import { createLogger } from "./logger.server";
import { v4 as uuidv4 } from "uuid";

const logger = createLogger('NeuralTierEngine');

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                         CRYSTAL TYPE LATTICE                              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export type TierSource =
  | 'MANUAL_OVERRIDE'
  | 'TIER_SUBSCRIPTION'
  | 'TIER_PURCHASE'
  | 'SPENDING_BASED'
  | 'DEFAULT_BASE_TIER'
  | 'NONE';

// Priority values - lower is higher priority (like interrupt levels)
const PRIORITY_MATRIX: Readonly<Record<TierSource, number>> = {
  MANUAL_OVERRIDE: 1,
  TIER_SUBSCRIPTION: 2,
  TIER_PURCHASE: 3,
  SPENDING_BASED: 4,
  DEFAULT_BASE_TIER: 5,
  NONE: 999,
} as const;

interface CrystalTier {
  readonly id: string;
  readonly name: string;
  readonly minSpend: number;
  readonly cashbackPercent: number;
}

interface CrystalCustomer {
  readonly id: string;
  readonly currentTierId: string | null;
  readonly currentTierMinSpend: number;
  readonly netSpent: number;
}

interface CrystalResolution {
  readonly tierId: string | null;
  readonly tierName: string | null;
  readonly tierMinSpend: number;
  readonly source: TierSource;
  readonly priority: number;
}

interface CrystalChange {
  readonly customerId: string;
  readonly previousTierId: string | null;
  readonly previousTierName: string | null;
  readonly previousMinSpend: number;
  readonly newTierId: string | null;
  readonly newTierName: string | null;
  readonly newMinSpend: number;
  readonly source: TierSource;
  readonly netSpent: number;
  readonly changeType: 'UPGRADE' | 'DOWNGRADE' | 'UNCHANGED' | 'INITIAL';
}

interface CrystalProgress {
  readonly progressPercent: number;
  readonly nextTierId: string | null;
  readonly nextTierName: string | null;
  readonly nextTierMinSpend: number | null;
  readonly amountToNextTier: number | null;
  readonly isMaxTier: boolean;
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    PNS - AFFERENT PATHWAYS (SENSORY INPUT)               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Sensory Ganglion - Aggregates all input data streams
 * Crystallizes raw database data into pure, immutable structures
 */
interface SensoryGanglion {
  readonly shop: string;

  // Crystallized tier data
  readonly tierCrystals: ReadonlyMap<string, CrystalTier>;
  readonly tiersDescending: readonly CrystalTier[];  // For resolution
  readonly tiersAscending: readonly CrystalTier[];   // For progress
  readonly baseTier: CrystalTier | null;

  // Source signal maps (O(1) lookup)
  readonly overrideSignals: ReadonlyMap<string, { tierId: string; expiresAt: Date | null }>;
  readonly subscriptionSignals: ReadonlyMap<string, { tierId: string; tierMinSpend: number }>;
  readonly purchaseSignals: ReadonlyMap<string, { tierId: string; tierMinSpend: number }>;

  // Pre-computed customer clusters by source type
  readonly customersBySource: {
    readonly override: ReadonlySet<string>;
    readonly subscription: ReadonlySet<string>;
    readonly purchase: ReadonlySet<string>;
    readonly spending: ReadonlySet<string>;  // Has spending but no other source
  };
}

/**
 * Afferent Stream - Parallel data loading pathways
 */
async function loadAfferentStreams(shop: string): Promise<{
  tiers: Tier[];
  overrides: { customerId: string; effectiveTierId: string | null; expiresAt: Date | null }[];
  subscriptions: (TierSubscription & { tier: Tier | null })[];
  purchases: (TierPurchase & { tier: Tier | null })[];
}> {
  const streamLogger = logger.withContext({ shop, phase: 'PNS_AFFERENT' });
  streamLogger.info('Initiating parallel afferent streams');

  const startTime = Date.now();

  // Parallel data retrieval - all streams fire simultaneously
  const [tiers, overrides, subscriptions, purchases] = await Promise.all([
    // Stream 1: Tier definitions
    prisma.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'desc' },
    }),

    // Stream 2: Manual override signals
    prisma.customerTierState.findMany({
      where: {
        shop,
        tierSource: 'MANUAL_OVERRIDE',
        effectiveTierId: { not: null },
      },
      select: {
        customerId: true,
        effectiveTierId: true,
        manualOverrideExpiresAt: true,
      },
    }).then(states => states.map(s => ({
      customerId: s.customerId,
      effectiveTierId: s.effectiveTierId,
      expiresAt: s.manualOverrideExpiresAt,
    }))),

    // Stream 3: Subscription signals
    prisma.tierSubscription.findMany({
      where: { shop, status: 'ACTIVE' },
      include: { tier: true },
    }),

    // Stream 4: Purchase signals
    prisma.tierPurchase.findMany({
      where: {
        shop,
        status: 'ACTIVE',
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } },
        ],
      },
      include: { tier: true },
    }),
  ]);

  streamLogger.info('Afferent streams complete', {
    tiersCount: tiers.length,
    overridesCount: overrides.length,
    subscriptionsCount: subscriptions.length,
    purchasesCount: purchases.length,
    loadTimeMs: Date.now() - startTime,
  });

  return { tiers, overrides, subscriptions, purchases };
}

/**
 * Crystallize - Transform raw data into immutable crystal structures
 */
function crystallizeSensoryData(
  shop: string,
  rawData: Awaited<ReturnType<typeof loadAfferentStreams>>
): SensoryGanglion {
  const now = new Date();

  // Crystallize tiers
  const tierCrystals = new Map<string, CrystalTier>();
  const tiersDescending: CrystalTier[] = [];

  for (const tier of rawData.tiers) {
    const crystal: CrystalTier = Object.freeze({
      id: tier.id,
      name: tier.name,
      minSpend: tier.minSpend,
      cashbackPercent: tier.cashbackPercent,
    });
    tierCrystals.set(tier.id, crystal);
    tiersDescending.push(crystal);
  }

  const tiersAscending = [...tiersDescending].reverse();
  const baseTier = tiersAscending[0] || null;

  // Crystallize override signals (filter expired)
  const overrideSignals = new Map<string, { tierId: string; expiresAt: Date | null }>();
  const overrideCustomers = new Set<string>();

  for (const o of rawData.overrides) {
    if (o.expiresAt && o.expiresAt < now) continue;
    if (o.effectiveTierId) {
      overrideSignals.set(o.customerId, {
        tierId: o.effectiveTierId,
        expiresAt: o.expiresAt,
      });
      overrideCustomers.add(o.customerId);
    }
  }

  // Crystallize subscription signals (keep highest tier per customer)
  const subscriptionSignals = new Map<string, { tierId: string; tierMinSpend: number }>();
  const subscriptionCustomers = new Set<string>();

  for (const sub of rawData.subscriptions) {
    if (!sub.tier) continue;
    const existing = subscriptionSignals.get(sub.customerId);
    if (!existing || sub.tier.minSpend > existing.tierMinSpend) {
      subscriptionSignals.set(sub.customerId, {
        tierId: sub.tierId ?? "",
        tierMinSpend: sub.tier.minSpend,
      });
      subscriptionCustomers.add(sub.customerId);
    }
  }

  // Crystallize purchase signals (keep highest tier per customer)
  const purchaseSignals = new Map<string, { tierId: string; tierMinSpend: number }>();
  const purchaseCustomers = new Set<string>();

  for (const purchase of rawData.purchases) {
    if (!purchase.tier) continue;
    const existing = purchaseSignals.get(purchase.customerId);
    if (!existing || purchase.tier.minSpend > existing.tierMinSpend) {
      purchaseSignals.set(purchase.customerId, {
        tierId: purchase.tierId ?? "",
        tierMinSpend: purchase.tier.minSpend,
      });
      purchaseCustomers.add(purchase.customerId);
    }
  }

  return Object.freeze({
    shop,
    tierCrystals,
    tiersDescending: Object.freeze(tiersDescending),
    tiersAscending: Object.freeze(tiersAscending),
    baseTier,
    overrideSignals,
    subscriptionSignals,
    purchaseSignals,
    customersBySource: Object.freeze({
      override: overrideCustomers,
      subscription: subscriptionCustomers,
      purchase: purchaseCustomers,
      spending: new Set<string>(), // Populated during processing
    }),
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    CNS - CRYSTAL CORTEX (CORE PROCESSING)                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Priority Nucleus - Determines winning tier source
 * Pure crystalline function with O(1) complexity
 */
function priorityNucleus(
  customerId: string,
  netSpent: number,
  ganglion: SensoryGanglion
): CrystalResolution {
  // Check Priority 1: Manual Override
  const override = ganglion.overrideSignals.get(customerId);
  if (override) {
    const tier = ganglion.tierCrystals.get(override.tierId);
    if (tier) {
      return Object.freeze({
        tierId: tier.id,
        tierName: tier.name,
        tierMinSpend: tier.minSpend,
        source: 'MANUAL_OVERRIDE',
        priority: PRIORITY_MATRIX.MANUAL_OVERRIDE,
      });
    }
  }

  // Check Priority 2: Tier Subscription
  const subscription = ganglion.subscriptionSignals.get(customerId);
  if (subscription) {
    const tier = ganglion.tierCrystals.get(subscription.tierId);
    if (tier) {
      return Object.freeze({
        tierId: tier.id,
        tierName: tier.name,
        tierMinSpend: tier.minSpend,
        source: 'TIER_SUBSCRIPTION',
        priority: PRIORITY_MATRIX.TIER_SUBSCRIPTION,
      });
    }
  }

  // Check Priority 3: Tier Purchase
  const purchase = ganglion.purchaseSignals.get(customerId);
  if (purchase) {
    const tier = ganglion.tierCrystals.get(purchase.tierId);
    if (tier) {
      return Object.freeze({
        tierId: tier.id,
        tierName: tier.name,
        tierMinSpend: tier.minSpend,
        source: 'TIER_PURCHASE',
        priority: PRIORITY_MATRIX.TIER_PURCHASE,
      });
    }
  }

  // Check Priority 4: Spending-Based (binary search on sorted tiers)
  for (const tier of ganglion.tiersDescending) {
    if (netSpent >= tier.minSpend) {
      return Object.freeze({
        tierId: tier.id,
        tierName: tier.name,
        tierMinSpend: tier.minSpend,
        source: 'SPENDING_BASED',
        priority: PRIORITY_MATRIX.SPENDING_BASED,
      });
    }
  }

  // Check Priority 5: Base Tier Fallback
  if (ganglion.baseTier) {
    return Object.freeze({
      tierId: ganglion.baseTier.id,
      tierName: ganglion.baseTier.name,
      tierMinSpend: ganglion.baseTier.minSpend,
      source: 'DEFAULT_BASE_TIER',
      priority: PRIORITY_MATRIX.DEFAULT_BASE_TIER,
    });
  }

  // No tier available
  return Object.freeze({
    tierId: null,
    tierName: null,
    tierMinSpend: 0,
    source: 'NONE',
    priority: PRIORITY_MATRIX.NONE,
  });
}

/**
 * Progress Nucleus - Calculates tier progress
 * Pure crystalline function
 */
function progressNucleus(
  netSpent: number,
  currentTierId: string | null,
  tiersAscending: readonly CrystalTier[]
): CrystalProgress {
  if (tiersAscending.length === 0) {
    return Object.freeze({
      progressPercent: 0,
      nextTierId: null,
      nextTierName: null,
      nextTierMinSpend: null,
      amountToNextTier: null,
      isMaxTier: true,
    });
  }

  const currentIndex = currentTierId
    ? tiersAscending.findIndex(t => t.id === currentTierId)
    : -1;

  const maxIndex = tiersAscending.length - 1;

  if (currentIndex === maxIndex) {
    return Object.freeze({
      progressPercent: 100,
      nextTierId: null,
      nextTierName: null,
      nextTierMinSpend: null,
      amountToNextTier: null,
      isMaxTier: true,
    });
  }

  const nextTier = tiersAscending[currentIndex + 1];
  if (!nextTier) {
    return Object.freeze({
      progressPercent: 0,
      nextTierId: null,
      nextTierName: null,
      nextTierMinSpend: null,
      amountToNextTier: null,
      isMaxTier: true,
    });
  }

  const currentMinSpend = currentIndex >= 0 ? tiersAscending[currentIndex].minSpend : 0;
  const range = nextTier.minSpend - currentMinSpend;
  const progress = netSpent - currentMinSpend;
  const progressPercent = range > 0
    ? Math.min(Math.round((progress / range) * 100), 99)
    : 0;

  return Object.freeze({
    progressPercent,
    nextTierId: nextTier.id,
    nextTierName: nextTier.name,
    nextTierMinSpend: nextTier.minSpend,
    amountToNextTier: Math.max(0, nextTier.minSpend - netSpent),
    isMaxTier: false,
  });
}

/**
 * Resolution Nucleus - Transforms customer into change record
 * Pure crystalline function
 */
function resolutionNucleus(
  customer: CrystalCustomer,
  ganglion: SensoryGanglion
): CrystalChange {
  const resolution = priorityNucleus(customer.id, customer.netSpent, ganglion);

  const tierChanged = customer.currentTierId !== resolution.tierId;
  const isUpgrade = tierChanged && resolution.tierMinSpend > customer.currentTierMinSpend;
  const isDowngrade = tierChanged && resolution.tierMinSpend < customer.currentTierMinSpend;

  const changeType: CrystalChange['changeType'] =
    !customer.currentTierId && resolution.tierId ? 'INITIAL' :
    isUpgrade ? 'UPGRADE' :
    isDowngrade ? 'DOWNGRADE' :
    'UNCHANGED';

  const currentTier = customer.currentTierId
    ? ganglion.tierCrystals.get(customer.currentTierId)
    : null;

  return Object.freeze({
    customerId: customer.id,
    previousTierId: customer.currentTierId,
    previousTierName: currentTier?.name || null,
    previousMinSpend: customer.currentTierMinSpend,
    newTierId: resolution.tierId,
    newTierName: resolution.tierName,
    newMinSpend: resolution.tierMinSpend,
    source: resolution.source,
    netSpent: customer.netSpent,
    changeType,
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    CNS - CLUSTER PROCESSOR                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Cluster configuration for parallel processing optimization
 */
interface ProcessingCluster {
  source: TierSource;
  changes: CrystalChange[];
  count: number;
}

/**
 * Cluster Processor - Groups changes by source for optimized batch processing
 */
function clusterChanges(changes: readonly CrystalChange[]): Map<TierSource, ProcessingCluster> {
  const clusters = new Map<TierSource, ProcessingCluster>();

  // Initialize clusters
  const sources: TierSource[] = [
    'MANUAL_OVERRIDE',
    'TIER_SUBSCRIPTION',
    'TIER_PURCHASE',
    'SPENDING_BASED',
    'DEFAULT_BASE_TIER',
    'NONE',
  ];

  for (const source of sources) {
    clusters.set(source, { source, changes: [], count: 0 });
  }

  // Distribute changes to clusters
  for (const change of changes) {
    const cluster = clusters.get(change.source)!;
    cluster.changes.push(change);
    cluster.count++;
  }

  return clusters;
}

/**
 * Process customer chunk and return crystallized changes
 */
function processCustomerCluster(
  customers: readonly { id: string; currentTierId: string | null; currentTier: Tier | null; netSpent: any }[],
  ganglion: SensoryGanglion
): CrystalChange[] {
  const changes: CrystalChange[] = [];

  for (const customer of customers) {
    const crystalCustomer: CrystalCustomer = {
      id: customer.id,
      currentTierId: customer.currentTierId,
      currentTierMinSpend: customer.currentTier?.minSpend || 0,
      netSpent: Number(customer.netSpent || 0),
    };

    changes.push(resolutionNucleus(crystalCustomer, ganglion));
  }

  return changes;
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    PNS - EFFERENT PATHWAYS (MOTOR OUTPUT)                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Motor Ganglion - Coordinates batched database writes
 */
interface MotorGanglionResult {
  updated: number;
  errors: number;
  byCluster: Map<TierSource, { updated: number; errors: number }>;
}

/**
 * Efferent Stream - Batched write operations by cluster
 */
async function executeEfferentStream(
  clusters: Map<TierSource, ProcessingCluster>,
  ganglion: SensoryGanglion
): Promise<MotorGanglionResult> {
  const motorLogger = logger.withContext({ shop: ganglion.shop, phase: 'PNS_EFFERENT' });

  let totalUpdated = 0;
  let totalErrors = 0;
  const byCluster = new Map<TierSource, { updated: number; errors: number }>();

  // Process clusters in priority order for optimal resource allocation
  const priorityOrder: TierSource[] = [
    'MANUAL_OVERRIDE',
    'TIER_SUBSCRIPTION',
    'TIER_PURCHASE',
    'SPENDING_BASED',
    'DEFAULT_BASE_TIER',
    'NONE',
  ];

  for (const source of priorityOrder) {
    const cluster = clusters.get(source);
    if (!cluster || cluster.count === 0) {
      byCluster.set(source, { updated: 0, errors: 0 });
      continue;
    }

    // Filter to actual changes only
    const actualChanges = cluster.changes.filter(c => c.changeType !== 'UNCHANGED');
    const unchangedChanges = cluster.changes.filter(c => c.changeType === 'UNCHANGED');

    motorLogger.debug(`Processing ${source} cluster`, {
      total: cluster.count,
      changes: actualChanges.length,
      unchanged: unchangedChanges.length,
    });

    let clusterUpdated = 0;
    let clusterErrors = 0;

    // Process actual tier changes
    if (actualChanges.length > 0) {
      const result = await writeTierChangeBatch(actualChanges, ganglion);
      clusterUpdated += result.updated;
      clusterErrors += result.errors;
    }

    // Update progress for unchanged customers (parallel with changes)
    if (unchangedChanges.length > 0) {
      await writeProgressUpdateBatch(unchangedChanges, ganglion);
    }

    byCluster.set(source, { updated: clusterUpdated, errors: clusterErrors });
    totalUpdated += clusterUpdated;
    totalErrors += clusterErrors;
  }

  return { updated: totalUpdated, errors: totalErrors, byCluster };
}

/**
 * Write tier changes in optimized batches
 */
async function writeTierChangeBatch(
  changes: CrystalChange[],
  ganglion: SensoryGanglion
): Promise<{ updated: number; errors: number }> {
  const BATCH_SIZE = 100;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);

    try {
      await prisma.$transaction(async (tx) => {
        for (const change of batch) {
          // Update customer
          await tx.customer.update({
            where: { id: change.customerId },
            data: {
              currentTierId: change.newTierId,
              updatedAt: new Date(),
            },
          });

          // Create change log
          await tx.tierChangeLog.create({
            data: {
              id: uuidv4(),
              customerId: change.customerId,
              shop: ganglion.shop,
              fromTierId: change.previousTierId,
              fromTierName: change.previousTierName,
              toTierId: change.newTierId,
              toTierName: change.newTierName,
              changeType: change.changeType === 'INITIAL' ? 'INITIAL_ASSIGNMENT' : change.changeType,
              triggerType: 'PERIODIC_REVIEW',
              totalSpending: change.netSpent,
              periodSpending: change.netSpent,
              metadata: {
                source: change.source,
                neuralEngine: 'v2.0',
                cluster: change.source,
              },
              createdAt: new Date(),
            },
          });

          // Calculate and update progress
          const progress = progressNucleus(
            change.netSpent,
            change.newTierId,
            ganglion.tiersAscending
          );

          const tierSourceMap: Record<TierSource, TierSourceEnum> = {
            MANUAL_OVERRIDE: 'MANUAL_OVERRIDE',
            TIER_SUBSCRIPTION: 'TIER_SUBSCRIPTION',
            TIER_PURCHASE: 'TIER_PURCHASE',
            SPENDING_BASED: 'SPENDING_BASED',
            DEFAULT_BASE_TIER: 'DEFAULT_BASE_TIER',
            NONE: 'NONE',
          };

          await tx.customerTierState.upsert({
            where: { customerId: change.customerId },
            create: {
              id: uuidv4(),
              customerId: change.customerId,
              shop: ganglion.shop,
              effectiveTierId: change.newTierId,
              tierSource: tierSourceMap[change.source],
              progressPercent: progress.progressPercent,
              nextTierId: progress.nextTierId,
              nextTierName: progress.nextTierName,
              nextTierMinSpend: progress.nextTierMinSpend,
              amountToNextTier: progress.amountToNextTier,
              isMaxTier: progress.isMaxTier,
              progressCalculatedAt: new Date(),
              lastResolvedAt: new Date(),
              resolutionReason: `Neural Engine v2.0 [${change.source}]`,
            },
            update: {
              effectiveTierId: change.newTierId,
              tierSource: tierSourceMap[change.source],
              progressPercent: progress.progressPercent,
              nextTierId: progress.nextTierId,
              nextTierName: progress.nextTierName,
              nextTierMinSpend: progress.nextTierMinSpend,
              amountToNextTier: progress.amountToNextTier,
              isMaxTier: progress.isMaxTier,
              progressCalculatedAt: new Date(),
              lastResolvedAt: new Date(),
              resolutionReason: `Neural Engine v2.0 [${change.source}]`,
              updatedAt: new Date(),
            },
          });
        }
      });

      updated += batch.length;
    } catch (error) {
      logger.error('Batch write failed', { batchStart: i, error });
      errors += batch.length;
    }
  }

  return { updated, errors };
}

/**
 * Write progress updates for unchanged customers
 */
async function writeProgressUpdateBatch(
  changes: CrystalChange[],
  ganglion: SensoryGanglion
): Promise<void> {
  const BATCH_SIZE = 200;

  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);

    try {
      await prisma.$transaction(async (tx) => {
        for (const change of batch) {
          const progress = progressNucleus(
            change.netSpent,
            change.newTierId,
            ganglion.tiersAscending
          );

          const tierSourceMap: Record<TierSource, TierSourceEnum> = {
            MANUAL_OVERRIDE: 'MANUAL_OVERRIDE',
            TIER_SUBSCRIPTION: 'TIER_SUBSCRIPTION',
            TIER_PURCHASE: 'TIER_PURCHASE',
            SPENDING_BASED: 'SPENDING_BASED',
            DEFAULT_BASE_TIER: 'DEFAULT_BASE_TIER',
            NONE: 'NONE',
          };

          await tx.customerTierState.upsert({
            where: { customerId: change.customerId },
            create: {
              id: uuidv4(),
              customerId: change.customerId,
              shop: ganglion.shop,
              effectiveTierId: change.newTierId,
              tierSource: tierSourceMap[change.source],
              progressPercent: progress.progressPercent,
              nextTierId: progress.nextTierId,
              nextTierName: progress.nextTierName,
              nextTierMinSpend: progress.nextTierMinSpend,
              amountToNextTier: progress.amountToNextTier,
              isMaxTier: progress.isMaxTier,
              progressCalculatedAt: new Date(),
              lastResolvedAt: new Date(),
            },
            update: {
              progressPercent: progress.progressPercent,
              nextTierId: progress.nextTierId,
              nextTierName: progress.nextTierName,
              nextTierMinSpend: progress.nextTierMinSpend,
              amountToNextTier: progress.amountToNextTier,
              isMaxTier: progress.isMaxTier,
              progressCalculatedAt: new Date(),
              lastResolvedAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
      });
    } catch (error) {
      logger.error('Progress update batch failed', { batchStart: i, error });
    }
  }
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    NEURAL ENGINE - MAIN ORCHESTRATOR                      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export interface NeuralRecalculationResult {
  processed: number;
  upgraded: number;
  downgraded: number;
  unchanged: number;
  initial: number;
  errors: number;
  bySource: Record<TierSource, number>;
  byCluster: Record<TierSource, { processed: number; changed: number }>;
  timing: {
    afferentMs: number;
    crystallizationMs: number;
    cortexMs: number;
    efferentMs: number;
    totalMs: number;
  };
  architecture: 'CNS_PNS_v2';
}

/**
 * Neural Tier Recalculation Engine v2.0
 *
 * Full CNS/PNS partitioned architecture with crystalline transformations
 */
export async function recalculateTiersNeural(
  shop: string
): Promise<NeuralRecalculationResult> {
  const engineLogger = logger.withContext({ shop, engine: 'Neural_v2.0' });
  engineLogger.info('Neural Engine initiating');

  const totalStart = Date.now();
  const timing = {
    afferentMs: 0,
    crystallizationMs: 0,
    cortexMs: 0,
    efferentMs: 0,
    totalMs: 0,
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1: PNS AFFERENT - Load sensory data
  // ═══════════════════════════════════════════════════════════════════════
  const afferentStart = Date.now();
  const rawData = await loadAfferentStreams(shop);
  timing.afferentMs = Date.now() - afferentStart;

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2: CRYSTALLIZATION - Transform to pure structures
  // ═══════════════════════════════════════════════════════════════════════
  const crystallizationStart = Date.now();
  const ganglion = crystallizeSensoryData(shop, rawData);
  timing.crystallizationMs = Date.now() - crystallizationStart;

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3: CNS CORTEX - Process customers through crystal nuclei
  // ═══════════════════════════════════════════════════════════════════════
  const cortexStart = Date.now();
  const allChanges: CrystalChange[] = [];

  const CHUNK_SIZE = 1000;
  let offset = 0;

  while (true) {
    const customers = await prisma.customer.findMany({
      where: { shop },
      include: { currentTier: true },
      skip: offset,
      take: CHUNK_SIZE,
    });

    if (customers.length === 0) break;

    const chunkChanges = processCustomerCluster(customers, ganglion);
    allChanges.push(...chunkChanges);

    offset += customers.length;
    if (customers.length < CHUNK_SIZE) break;
  }

  // Cluster changes by source
  const clusters = clusterChanges(allChanges);
  timing.cortexMs = Date.now() - cortexStart;

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 4: PNS EFFERENT - Execute batched writes
  // ═══════════════════════════════════════════════════════════════════════
  const efferentStart = Date.now();
  const motorResult = await executeEfferentStream(clusters, ganglion);
  timing.efferentMs = Date.now() - efferentStart;

  timing.totalMs = Date.now() - totalStart;

  // ═══════════════════════════════════════════════════════════════════════
  // AGGREGATE RESULTS
  // ═══════════════════════════════════════════════════════════════════════
  const bySource: Record<TierSource, number> = {
    MANUAL_OVERRIDE: 0,
    TIER_SUBSCRIPTION: 0,
    TIER_PURCHASE: 0,
    SPENDING_BASED: 0,
    DEFAULT_BASE_TIER: 0,
    NONE: 0,
  };

  const byCluster: Record<TierSource, { processed: number; changed: number }> = {
    MANUAL_OVERRIDE: { processed: 0, changed: 0 },
    TIER_SUBSCRIPTION: { processed: 0, changed: 0 },
    TIER_PURCHASE: { processed: 0, changed: 0 },
    SPENDING_BASED: { processed: 0, changed: 0 },
    DEFAULT_BASE_TIER: { processed: 0, changed: 0 },
    NONE: { processed: 0, changed: 0 },
  };

  for (const change of allChanges) {
    bySource[change.source]++;
    byCluster[change.source].processed++;
    if (change.changeType !== 'UNCHANGED') {
      byCluster[change.source].changed++;
    }
  }

  const result: NeuralRecalculationResult = {
    processed: allChanges.length,
    upgraded: allChanges.filter(c => c.changeType === 'UPGRADE').length,
    downgraded: allChanges.filter(c => c.changeType === 'DOWNGRADE').length,
    unchanged: allChanges.filter(c => c.changeType === 'UNCHANGED').length,
    initial: allChanges.filter(c => c.changeType === 'INITIAL').length,
    errors: motorResult.errors,
    bySource,
    byCluster,
    timing,
    architecture: 'CNS_PNS_v2',
  };

  engineLogger.info('Neural Engine complete', {
    ...result,
    avgTimePerCustomer: result.processed > 0
      ? `${(timing.totalMs / result.processed).toFixed(2)}ms`
      : 'N/A',
    throughput: result.processed > 0
      ? `${Math.round(result.processed / (timing.totalMs / 1000))}/sec`
      : 'N/A',
  });

  return result;
}
