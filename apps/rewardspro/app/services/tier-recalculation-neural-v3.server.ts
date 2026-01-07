/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║        NEURAL TIER RECALCULATION ENGINE v3.0 - ANATOMICAL CNS            ║
 * ║                                                                           ║
 * ║   Human Brain-Inspired Architecture with Multi-Level Clustering          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * CNS ANATOMICAL MAPPING:
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                         CEREBRAL CORTEX                                     │
 * │  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐         │
 * │  │  PREFRONTAL       │ │    PARIETAL       │ │    TEMPORAL       │         │
 * │  │  Executive Ctrl   │ │  Integration      │ │  Pattern Memory   │         │
 * │  │  Priority Decide  │ │  Multi-Source     │ │  Tier History     │         │
 * │  └─────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘         │
 * │            └─────────────────────┼─────────────────────┘                    │
 * └──────────────────────────────────┼──────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                         THALAMUS (Relay Hub)                                │
 * │  ┌─────────────────────────────────────────────────────────────────────┐   │
 * │  │   Sensory Relay ◄──── Afferent Data                                 │   │
 * │  │   Motor Relay   ────► Efferent Commands                             │   │
 * │  │   Attention Gate ──── Priority Filtering                            │   │
 * │  └─────────────────────────────────────────────────────────────────────┘   │
 * └──────────────────────────────────┬──────────────────────────────────────────┘
 *                                    │
 *         ┌──────────────────────────┼──────────────────────────┐
 *         ▼                          ▼                          ▼
 * ┌───────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐
 * │   LIMBIC SYSTEM   │  │    BASAL GANGLIA      │  │     CEREBELLUM        │
 * │  ┌─────────────┐  │  │  ┌─────────────────┐  │  │  ┌─────────────────┐  │
 * │  │ Hippocampus │  │  │  │    Striatum     │  │  │  │  Timing Coord   │  │
 * │  │ Context Mem │  │  │  │  Action Select  │  │  │  │  Batch Smooth   │  │
 * │  ├─────────────┤  │  │  ├─────────────────┤  │  │  ├─────────────────┤  │
 * │  │  Amygdala   │  │  │  │ Globus Pallidus │  │  │  │  Error Correct  │  │
 * │  │ Importance  │  │  │  │  Output Gate    │  │  │  │  Fine Tuning    │  │
 * │  └─────────────┘  │  │  └─────────────────┘  │  │  └─────────────────┘  │
 * └───────────────────┘  └───────────────────────┘  └───────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                         BRAINSTEM (Autonomic)                               │
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
 * │  │     MEDULLA     │  │      PONS       │  │   MIDBRAIN      │             │
 * │  │  Basic Reflexes │  │  Region Bridge  │  │  Motor Control  │             │
 * │  │  DB Operations  │  │  Data Routing   │  │  Write Exec     │             │
 * │  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * MULTI-LEVEL CLUSTERING HIERARCHY:
 *
 *   L1: SOURCE CLUSTER     (Override | Subscription | Purchase | Spending | Base)
 *        │
 *        └─► L2: CHANGE CLUSTER    (Upgrade | Downgrade | Unchanged | Initial)
 *                  │
 *                  └─► L3: VALUE CLUSTER    (Premium | Standard | Entry)
 *                            │
 *                            └─► L4: PRIORITY CLUSTER  (Immediate | Batch | Deferred)
 */

import db from "~/db.server";
import type { Tier, Customer, TierSubscription, TierPurchase, TierSource as TierSourceEnum } from "@prisma/client";
import { createLogger } from "./logger.server";
import { v4 as uuidv4 } from "uuid";

const logger = createLogger('NeuralV3');

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    CRYSTALLINE TYPE DEFINITIONS                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export type TierSource = 'MANUAL_OVERRIDE' | 'TIER_SUBSCRIPTION' | 'TIER_PURCHASE' | 'SPENDING_BASED' | 'DEFAULT_BASE_TIER' | 'NONE';
export type ChangeType = 'UPGRADE' | 'DOWNGRADE' | 'UNCHANGED' | 'INITIAL';
export type ValueTier = 'PREMIUM' | 'STANDARD' | 'ENTRY';
export type ProcessingPriority = 'IMMEDIATE' | 'BATCH' | 'DEFERRED';

// Synaptic weights for priority routing
const SYNAPTIC_WEIGHTS = Object.freeze({
  SOURCE: Object.freeze({
    MANUAL_OVERRIDE: 100,
    TIER_SUBSCRIPTION: 80,
    TIER_PURCHASE: 60,
    SPENDING_BASED: 40,
    DEFAULT_BASE_TIER: 20,
    NONE: 0,
  }),
  CHANGE: Object.freeze({
    UPGRADE: 90,
    INITIAL: 70,
    DOWNGRADE: 50,
    UNCHANGED: 10,
  }),
  VALUE: Object.freeze({
    PREMIUM: 100,
    STANDARD: 50,
    ENTRY: 25,
  }),
}) as const;

// ═══════════════════════════════════════════════════════════════════════════
// CRYSTAL STRUCTURES (Immutable Data Types)
// ═══════════════════════════════════════════════════════════════════════════

interface CrystalTier {
  readonly id: string;
  readonly name: string;
  readonly minSpend: number;
  readonly cashbackPercent: number;
  readonly valueTier: ValueTier;
}

interface CrystalCustomer {
  readonly id: string;
  readonly currentTierId: string | null;
  readonly currentTierMinSpend: number;
  readonly netSpent: number;
}

interface CrystalSignal {
  readonly customerId: string;
  readonly source: TierSource;
  readonly tierId: string;
  readonly tierMinSpend: number;
  readonly weight: number;
}

interface CrystalChange {
  readonly customerId: string;
  readonly previousTierId: string | null;
  readonly previousTierName: string | null;
  readonly newTierId: string | null;
  readonly newTierName: string | null;
  readonly newMinSpend: number;
  readonly source: TierSource;
  readonly changeType: ChangeType;
  readonly valueTier: ValueTier;
  readonly priority: ProcessingPriority;
  readonly netSpent: number;
  readonly synapticWeight: number;
}

interface CrystalProgress {
  readonly progressPercent: number;
  readonly nextTierId: string | null;
  readonly nextTierName: string | null;
  readonly nextTierMinSpend: number | null;
  readonly amountToNextTier: number | null;
  readonly isMaxTier: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-LEVEL CLUSTER STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

interface L4PriorityCluster {
  readonly priority: ProcessingPriority;
  readonly changes: CrystalChange[];
  readonly totalWeight: number;
}

interface L3ValueCluster {
  readonly valueTier: ValueTier;
  readonly byPriority: Map<ProcessingPriority, L4PriorityCluster>;
  readonly totalWeight: number;
}

interface L2ChangeCluster {
  readonly changeType: ChangeType;
  readonly byValue: Map<ValueTier, L3ValueCluster>;
  readonly totalWeight: number;
}

interface L1SourceCluster {
  readonly source: TierSource;
  readonly byChange: Map<ChangeType, L2ChangeCluster>;
  readonly totalWeight: number;
  readonly customerCount: number;
}

interface ClusterHierarchy {
  readonly root: Map<TierSource, L1SourceCluster>;
  readonly totalCustomers: number;
  readonly totalWeight: number;
  readonly processingOrder: readonly TierSource[];
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    THALAMUS - CENTRAL RELAY HUB                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

interface ThalamusState {
  readonly shop: string;

  // Sensory Relay - Crystallized input data
  readonly tierCrystals: ReadonlyMap<string, CrystalTier>;
  readonly tiersDescending: readonly CrystalTier[];
  readonly tiersAscending: readonly CrystalTier[];
  readonly baseTier: CrystalTier | null;

  // Signal Maps - Pre-indexed by customer
  readonly overrideSignals: ReadonlyMap<string, CrystalSignal>;
  readonly subscriptionSignals: ReadonlyMap<string, CrystalSignal>;
  readonly purchaseSignals: ReadonlyMap<string, CrystalSignal>;

  // Value tier thresholds
  readonly premiumThreshold: number;
  readonly standardThreshold: number;
}

/**
 * THALAMUS: Sensory Relay
 * Loads and crystallizes all input data with attention gating
 */
async function thalamusSensoryRelay(shop: string): Promise<ThalamusState> {
  const relayLogger = logger.withContext({ shop, region: 'THALAMUS' });
  relayLogger.info('Sensory relay initiating');

  const startTime = Date.now();

  // Parallel afferent streams
  const [tiers, overrideStates, subscriptions, purchases] = await Promise.all([
    db.tier.findMany({ where: { shop }, orderBy: { minSpend: 'desc' } }),
    db.customerTierState.findMany({
      where: { shop, tierSource: 'MANUAL_OVERRIDE', effectiveTierId: { not: null } },
      select: { customerId: true, effectiveTierId: true, manualOverrideExpiresAt: true },
    }),
    db.tierSubscription.findMany({ where: { shop, status: 'ACTIVE' }, include: { tier: true } }),
    db.tierPurchase.findMany({
      where: { shop, status: 'ACTIVE', OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
      include: { tier: true },
    }),
  ]);

  // Calculate value tier thresholds (top 20% = premium, middle 50% = standard, bottom 30% = entry)
  const maxSpend = tiers.length > 0 ? tiers[0].minSpend : 0;
  const premiumThreshold = maxSpend * 0.6;
  const standardThreshold = maxSpend * 0.2;

  // Crystallize tiers with value classification
  const tierCrystals = new Map<string, CrystalTier>();
  const tiersDescending: CrystalTier[] = [];

  for (const tier of tiers) {
    const valueTier: ValueTier =
      tier.minSpend >= premiumThreshold ? 'PREMIUM' :
      tier.minSpend >= standardThreshold ? 'STANDARD' : 'ENTRY';

    const crystal: CrystalTier = Object.freeze({
      id: tier.id,
      name: tier.name,
      minSpend: tier.minSpend,
      cashbackPercent: tier.cashbackPercent,
      valueTier,
    });
    tierCrystals.set(tier.id, crystal);
    tiersDescending.push(crystal);
  }

  const tiersAscending = Object.freeze([...tiersDescending].reverse());
  const baseTier = tiersAscending[0] || null;

  // Crystallize signals with synaptic weights
  const now = new Date();
  const overrideSignals = new Map<string, CrystalSignal>();
  const subscriptionSignals = new Map<string, CrystalSignal>();
  const purchaseSignals = new Map<string, CrystalSignal>();

  for (const o of overrideStates) {
    if (o.manualOverrideExpiresAt && o.manualOverrideExpiresAt < now) continue;
    if (o.effectiveTierId) {
      const tier = tierCrystals.get(o.effectiveTierId);
      if (tier) {
        overrideSignals.set(o.customerId, Object.freeze({
          customerId: o.customerId,
          source: 'MANUAL_OVERRIDE',
          tierId: o.effectiveTierId,
          tierMinSpend: tier.minSpend,
          weight: SYNAPTIC_WEIGHTS.SOURCE.MANUAL_OVERRIDE,
        }));
      }
    }
  }

  for (const sub of subscriptions) {
    if (!sub.tier) continue;
    const existing = subscriptionSignals.get(sub.customerId);
    if (!existing || sub.tier.minSpend > existing.tierMinSpend) {
      subscriptionSignals.set(sub.customerId, Object.freeze({
        customerId: sub.customerId,
        source: 'TIER_SUBSCRIPTION',
        tierId: sub.tierId,
        tierMinSpend: sub.tier.minSpend,
        weight: SYNAPTIC_WEIGHTS.SOURCE.TIER_SUBSCRIPTION,
      }));
    }
  }

  for (const purchase of purchases) {
    if (!purchase.tier) continue;
    const existing = purchaseSignals.get(purchase.customerId);
    if (!existing || purchase.tier.minSpend > existing.tierMinSpend) {
      purchaseSignals.set(purchase.customerId, Object.freeze({
        customerId: purchase.customerId,
        source: 'TIER_PURCHASE',
        tierId: purchase.tierId,
        tierMinSpend: purchase.tier.minSpend,
        weight: SYNAPTIC_WEIGHTS.SOURCE.TIER_PURCHASE,
      }));
    }
  }

  relayLogger.info('Sensory relay complete', {
    tiers: tiers.length,
    overrides: overrideSignals.size,
    subscriptions: subscriptionSignals.size,
    purchases: purchaseSignals.size,
    loadTimeMs: Date.now() - startTime,
  });

  return Object.freeze({
    shop,
    tierCrystals,
    tiersDescending: Object.freeze(tiersDescending),
    tiersAscending,
    baseTier,
    overrideSignals,
    subscriptionSignals,
    purchaseSignals,
    premiumThreshold,
    standardThreshold,
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    CEREBRAL CORTEX - HIGHER PROCESSING                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * PREFRONTAL CORTEX: Executive Control
 * Determines tier priority and makes final decisions
 */
function prefrontalCortex(
  customerId: string,
  netSpent: number,
  thalamus: ThalamusState
): { tierId: string | null; tierName: string | null; tierMinSpend: number; source: TierSource; weight: number } {
  // Check signals in priority order
  const override = thalamus.overrideSignals.get(customerId);
  if (override) {
    const tier = thalamus.tierCrystals.get(override.tierId);
    return { tierId: override.tierId, tierName: tier?.name || null, tierMinSpend: override.tierMinSpend, source: 'MANUAL_OVERRIDE', weight: override.weight };
  }

  const subscription = thalamus.subscriptionSignals.get(customerId);
  if (subscription) {
    const tier = thalamus.tierCrystals.get(subscription.tierId);
    return { tierId: subscription.tierId, tierName: tier?.name || null, tierMinSpend: subscription.tierMinSpend, source: 'TIER_SUBSCRIPTION', weight: subscription.weight };
  }

  const purchase = thalamus.purchaseSignals.get(customerId);
  if (purchase) {
    const tier = thalamus.tierCrystals.get(purchase.tierId);
    return { tierId: purchase.tierId, tierName: tier?.name || null, tierMinSpend: purchase.tierMinSpend, source: 'TIER_PURCHASE', weight: purchase.weight };
  }

  // Spending-based resolution
  for (const tier of thalamus.tiersDescending) {
    if (netSpent >= tier.minSpend) {
      return { tierId: tier.id, tierName: tier.name, tierMinSpend: tier.minSpend, source: 'SPENDING_BASED', weight: SYNAPTIC_WEIGHTS.SOURCE.SPENDING_BASED };
    }
  }

  // Base tier fallback
  if (thalamus.baseTier) {
    return { tierId: thalamus.baseTier.id, tierName: thalamus.baseTier.name, tierMinSpend: thalamus.baseTier.minSpend, source: 'DEFAULT_BASE_TIER', weight: SYNAPTIC_WEIGHTS.SOURCE.DEFAULT_BASE_TIER };
  }

  return { tierId: null, tierName: null, tierMinSpend: 0, source: 'NONE', weight: 0 };
}

/**
 * PARIETAL CORTEX: Multi-Source Integration
 * Integrates all signals and classifies change type
 */
function parietalCortex(
  customer: CrystalCustomer,
  resolution: ReturnType<typeof prefrontalCortex>,
  thalamus: ThalamusState
): { changeType: ChangeType; valueTier: ValueTier } {
  const tierChanged = customer.currentTierId !== resolution.tierId;

  // Determine change type
  let changeType: ChangeType;
  if (!customer.currentTierId && resolution.tierId) {
    changeType = 'INITIAL';
  } else if (tierChanged && resolution.tierMinSpend > customer.currentTierMinSpend) {
    changeType = 'UPGRADE';
  } else if (tierChanged && resolution.tierMinSpend < customer.currentTierMinSpend) {
    changeType = 'DOWNGRADE';
  } else {
    changeType = 'UNCHANGED';
  }

  // Classify value tier
  const valueTier: ValueTier =
    resolution.tierMinSpend >= thalamus.premiumThreshold ? 'PREMIUM' :
    resolution.tierMinSpend >= thalamus.standardThreshold ? 'STANDARD' : 'ENTRY';

  return { changeType, valueTier };
}

/**
 * TEMPORAL CORTEX: Pattern Memory
 * Calculates progress patterns and tier advancement
 */
function temporalCortex(
  netSpent: number,
  currentTierId: string | null,
  tiersAscending: readonly CrystalTier[]
): CrystalProgress {
  if (tiersAscending.length === 0) {
    return Object.freeze({ progressPercent: 0, nextTierId: null, nextTierName: null, nextTierMinSpend: null, amountToNextTier: null, isMaxTier: true });
  }

  const currentIndex = currentTierId ? tiersAscending.findIndex(t => t.id === currentTierId) : -1;
  const maxIndex = tiersAscending.length - 1;

  if (currentIndex === maxIndex) {
    return Object.freeze({ progressPercent: 100, nextTierId: null, nextTierName: null, nextTierMinSpend: null, amountToNextTier: null, isMaxTier: true });
  }

  const nextTier = tiersAscending[currentIndex + 1];
  if (!nextTier) {
    return Object.freeze({ progressPercent: 0, nextTierId: null, nextTierName: null, nextTierMinSpend: null, amountToNextTier: null, isMaxTier: true });
  }

  const currentMinSpend = currentIndex >= 0 ? tiersAscending[currentIndex].minSpend : 0;
  const range = nextTier.minSpend - currentMinSpend;
  const progress = netSpent - currentMinSpend;
  const progressPercent = range > 0 ? Math.min(Math.round((progress / range) * 100), 99) : 0;

  return Object.freeze({
    progressPercent,
    nextTierId: nextTier.id,
    nextTierName: nextTier.name,
    nextTierMinSpend: nextTier.minSpend,
    amountToNextTier: Math.max(0, nextTier.minSpend - netSpent),
    isMaxTier: false,
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    LIMBIC SYSTEM - IMPORTANCE & CONTEXT                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * AMYGDALA: Importance Assessment
 * Calculates processing priority based on importance signals
 */
function amygdala(
  changeType: ChangeType,
  valueTier: ValueTier,
  source: TierSource
): ProcessingPriority {
  // Calculate composite importance score
  const sourceWeight = SYNAPTIC_WEIGHTS.SOURCE[source];
  const changeWeight = SYNAPTIC_WEIGHTS.CHANGE[changeType];
  const valueWeight = SYNAPTIC_WEIGHTS.VALUE[valueTier];

  const importanceScore = (sourceWeight * 0.4) + (changeWeight * 0.4) + (valueWeight * 0.2);

  // Immediate: High-value changes (upgrades, premium customers, manual overrides)
  if (importanceScore >= 70 || source === 'MANUAL_OVERRIDE') {
    return 'IMMEDIATE';
  }

  // Batch: Standard processing
  if (importanceScore >= 30) {
    return 'BATCH';
  }

  // Deferred: Low-priority unchanged customers
  return 'DEFERRED';
}

/**
 * HIPPOCAMPUS: Context Memory
 * Retrieves and updates tier history context
 */
function hippocampus(
  customer: CrystalCustomer,
  resolution: ReturnType<typeof prefrontalCortex>,
  thalamus: ThalamusState
): { previousTierName: string | null } {
  const previousTier = customer.currentTierId
    ? thalamus.tierCrystals.get(customer.currentTierId)
    : null;

  return { previousTierName: previousTier?.name || null };
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    BASAL GANGLIA - ACTION SELECTION                      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * STRIATUM: Action Selection
 * Selects the appropriate action path for each customer
 */
function striatum(
  customer: CrystalCustomer,
  thalamus: ThalamusState
): CrystalChange {
  // Prefrontal decision
  const resolution = prefrontalCortex(customer.id, customer.netSpent, thalamus);

  // Parietal integration
  const { changeType, valueTier } = parietalCortex(customer, resolution, thalamus);

  // Hippocampal context
  const { previousTierName } = hippocampus(customer, resolution, thalamus);

  // Amygdala priority
  const priority = amygdala(changeType, valueTier, resolution.source);

  // Calculate synaptic weight
  const synapticWeight =
    (SYNAPTIC_WEIGHTS.SOURCE[resolution.source] * 0.4) +
    (SYNAPTIC_WEIGHTS.CHANGE[changeType] * 0.4) +
    (SYNAPTIC_WEIGHTS.VALUE[valueTier] * 0.2);

  return Object.freeze({
    customerId: customer.id,
    previousTierId: customer.currentTierId,
    previousTierName,
    newTierId: resolution.tierId,
    newTierName: resolution.tierName,
    newMinSpend: resolution.tierMinSpend,
    source: resolution.source,
    changeType,
    valueTier,
    priority,
    netSpent: customer.netSpent,
    synapticWeight,
  });
}

/**
 * GLOBUS PALLIDUS: Output Gating
 * Gates and organizes changes into multi-level cluster hierarchy
 */
function globusPallidus(changes: readonly CrystalChange[]): ClusterHierarchy {
  const root = new Map<TierSource, L1SourceCluster>();

  // Initialize L1 clusters
  const sources: TierSource[] = ['MANUAL_OVERRIDE', 'TIER_SUBSCRIPTION', 'TIER_PURCHASE', 'SPENDING_BASED', 'DEFAULT_BASE_TIER', 'NONE'];
  const changeTypes: ChangeType[] = ['UPGRADE', 'DOWNGRADE', 'UNCHANGED', 'INITIAL'];
  const valueTiers: ValueTier[] = ['PREMIUM', 'STANDARD', 'ENTRY'];
  const priorities: ProcessingPriority[] = ['IMMEDIATE', 'BATCH', 'DEFERRED'];

  for (const source of sources) {
    const byChange = new Map<ChangeType, L2ChangeCluster>();

    for (const changeType of changeTypes) {
      const byValue = new Map<ValueTier, L3ValueCluster>();

      for (const valueTier of valueTiers) {
        const byPriority = new Map<ProcessingPriority, L4PriorityCluster>();

        for (const priority of priorities) {
          byPriority.set(priority, { priority, changes: [], totalWeight: 0 });
        }

        byValue.set(valueTier, { valueTier, byPriority, totalWeight: 0 });
      }

      byChange.set(changeType, { changeType, byValue, totalWeight: 0 });
    }

    root.set(source, { source, byChange, totalWeight: 0, customerCount: 0 });
  }

  // Distribute changes to clusters
  let totalWeight = 0;

  for (const change of changes) {
    const l1 = root.get(change.source)!;
    const l2 = l1.byChange.get(change.changeType)!;
    const l3 = l2.byValue.get(change.valueTier)!;
    const l4 = l3.byPriority.get(change.priority)!;

    l4.changes.push(change);
    (l4 as any).totalWeight += change.synapticWeight;
    (l3 as any).totalWeight += change.synapticWeight;
    (l2 as any).totalWeight += change.synapticWeight;
    (l1 as any).totalWeight += change.synapticWeight;
    (l1 as any).customerCount++;
    totalWeight += change.synapticWeight;
  }

  // Calculate processing order (highest weight first)
  const processingOrder = [...sources].sort((a, b) => {
    const weightA = root.get(a)?.totalWeight || 0;
    const weightB = root.get(b)?.totalWeight || 0;
    return weightB - weightA;
  });

  return Object.freeze({
    root,
    totalCustomers: changes.length,
    totalWeight,
    processingOrder: Object.freeze(processingOrder),
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    CEREBELLUM - TIMING & COORDINATION                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * CEREBELLUM: Batch Timing Coordinator
 * Coordinates smooth batch execution with error correction
 */
async function cerebellum(
  hierarchy: ClusterHierarchy,
  thalamus: ThalamusState
): Promise<{ updated: number; errors: number; bySource: Record<TierSource, number> }> {
  const cerebLogger = logger.withContext({ shop: thalamus.shop, region: 'CEREBELLUM' });
  cerebLogger.info('Cerebellum coordinating batch execution');

  let totalUpdated = 0;
  let totalErrors = 0;
  const bySource: Record<TierSource, number> = {
    MANUAL_OVERRIDE: 0,
    TIER_SUBSCRIPTION: 0,
    TIER_PURCHASE: 0,
    SPENDING_BASED: 0,
    DEFAULT_BASE_TIER: 0,
    NONE: 0,
  };

  // Process in optimized order (highest weight clusters first)
  for (const source of hierarchy.processingOrder) {
    const l1Cluster = hierarchy.root.get(source);
    if (!l1Cluster || l1Cluster.customerCount === 0) continue;

    // Collect all changes from this source cluster
    const sourceChanges: CrystalChange[] = [];

    for (const [, l2Cluster] of l1Cluster.byChange) {
      for (const [, l3Cluster] of l2Cluster.byValue) {
        for (const [, l4Cluster] of l3Cluster.byPriority) {
          sourceChanges.push(...l4Cluster.changes);
        }
      }
    }

    // Sort by priority within source
    sourceChanges.sort((a, b) => {
      const priorityOrder: Record<ProcessingPriority, number> = { IMMEDIATE: 0, BATCH: 1, DEFERRED: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Execute via brainstem
    const result = await brainstemExecute(sourceChanges, thalamus);
    totalUpdated += result.updated;
    totalErrors += result.errors;
    bySource[source] = result.updated;
  }

  cerebLogger.info('Cerebellum coordination complete', { totalUpdated, totalErrors });
  return { updated: totalUpdated, errors: totalErrors, bySource };
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    BRAINSTEM - AUTONOMIC EXECUTION                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * BRAINSTEM: Medulla + Pons + Midbrain
 * Executes database operations with basic reflexes and routing
 */
async function brainstemExecute(
  changes: CrystalChange[],
  thalamus: ThalamusState
): Promise<{ updated: number; errors: number }> {
  // Filter to actual changes only
  const actualChanges = changes.filter(c => c.changeType !== 'UNCHANGED');
  const unchangedChanges = changes.filter(c => c.changeType === 'UNCHANGED');

  let updated = 0;
  let errors = 0;

  // MEDULLA: Execute actual tier changes
  if (actualChanges.length > 0) {
    const result = await medullaReflex(actualChanges, thalamus);
    updated += result.updated;
    errors += result.errors;
  }

  // PONS: Route progress updates for unchanged
  if (unchangedChanges.length > 0) {
    await ponsRelay(unchangedChanges, thalamus);
  }

  return { updated, errors };
}

/**
 * MEDULLA: Basic Reflexes
 * Core database write operations
 */
async function medullaReflex(
  changes: CrystalChange[],
  thalamus: ThalamusState
): Promise<{ updated: number; errors: number }> {
  const BATCH_SIZE = 100;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);

    try {
      await db.$transaction(async (tx) => {
        for (const change of batch) {
          // Update customer
          await tx.customer.update({
            where: { id: change.customerId },
            data: { currentTierId: change.newTierId, updatedAt: new Date() },
          });

          // Create change log
          await tx.tierChangeLog.create({
            data: {
              id: uuidv4(),
              customerId: change.customerId,
              shop: thalamus.shop,
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
                valueTier: change.valueTier,
                priority: change.priority,
                synapticWeight: change.synapticWeight,
                neuralEngine: 'v3.0-anatomical',
              },
              createdAt: new Date(),
            },
          });

          // Calculate progress
          const progress = temporalCortex(change.netSpent, change.newTierId, thalamus.tiersAscending);

          // Upsert state
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
              shop: thalamus.shop,
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
              resolutionReason: `Neural v3.0 [${change.source}/${change.valueTier}/${change.priority}]`,
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
              resolutionReason: `Neural v3.0 [${change.source}/${change.valueTier}/${change.priority}]`,
              updatedAt: new Date(),
            },
          });
        }
      }, { timeout: 30000 });

      updated += batch.length;
    } catch (error) {
      logger.error('Medulla reflex failed', { batchStart: i, error });
      errors += batch.length;
    }
  }

  return { updated, errors };
}

/**
 * PONS: Inter-Region Relay
 * Routes progress updates for unchanged customers
 */
async function ponsRelay(
  changes: CrystalChange[],
  thalamus: ThalamusState
): Promise<void> {
  const BATCH_SIZE = 200;

  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);

    try {
      await db.$transaction(async (tx) => {
        for (const change of batch) {
          const progress = temporalCortex(change.netSpent, change.newTierId, thalamus.tiersAscending);

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
              shop: thalamus.shop,
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
      }, { timeout: 30000 });
    } catch (error) {
      logger.error('Pons relay failed', { batchStart: i, error });
    }
  }
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    NEURAL ENGINE v3.0 - MAIN ORCHESTRATOR                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export interface NeuralV3Result {
  processed: number;
  upgraded: number;
  downgraded: number;
  unchanged: number;
  initial: number;
  errors: number;
  bySource: Record<TierSource, number>;
  byChange: Record<ChangeType, number>;
  byValue: Record<ValueTier, number>;
  byPriority: Record<ProcessingPriority, number>;
  clustering: {
    l1Sources: number;
    l2Changes: number;
    l3Values: number;
    l4Priorities: number;
    totalWeight: number;
  };
  timing: {
    thalamusMs: number;
    cortexMs: number;
    gangliaMs: number;
    cerebellumMs: number;
    totalMs: number;
  };
  architecture: 'ANATOMICAL_CNS_v3';
}

/**
 * Neural Tier Recalculation Engine v3.0 - Anatomical CNS
 *
 * Full human brain-inspired architecture with multi-level clustering
 */
export async function recalculateTiersAnatomical(
  shop: string
): Promise<NeuralV3Result> {
  const engineLogger = logger.withContext({ shop, engine: 'Neural_v3.0_Anatomical' });
  engineLogger.info('Anatomical Neural Engine initiating');

  const totalStart = Date.now();
  const timing = { thalamusMs: 0, cortexMs: 0, gangliaMs: 0, cerebellumMs: 0, totalMs: 0 };

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1: THALAMUS - Sensory Relay
  // ═══════════════════════════════════════════════════════════════════════
  const thalamusStart = Date.now();
  const thalamus = await thalamusSensoryRelay(shop);
  timing.thalamusMs = Date.now() - thalamusStart;

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2: CEREBRAL CORTEX + LIMBIC - Process Customers
  // ═══════════════════════════════════════════════════════════════════════
  const cortexStart = Date.now();
  const allChanges: CrystalChange[] = [];

  const CHUNK_SIZE = 1000;
  let offset = 0;

  while (true) {
    const customers = await db.customer.findMany({
      where: { shop },
      include: { currentTier: true },
      skip: offset,
      take: CHUNK_SIZE,
    });

    if (customers.length === 0) break;

    for (const customer of customers) {
      const crystalCustomer: CrystalCustomer = {
        id: customer.id,
        currentTierId: customer.currentTierId,
        currentTierMinSpend: customer.currentTier?.minSpend || 0,
        netSpent: Number(customer.netSpent || 0),
      };

      // Process through striatum (action selection)
      const change = striatum(crystalCustomer, thalamus);
      allChanges.push(change);
    }

    offset += customers.length;
    if (customers.length < CHUNK_SIZE) break;
  }
  timing.cortexMs = Date.now() - cortexStart;

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3: BASAL GANGLIA - Cluster Organization
  // ═══════════════════════════════════════════════════════════════════════
  const gangliaStart = Date.now();
  const hierarchy = globusPallidus(allChanges);
  timing.gangliaMs = Date.now() - gangliaStart;

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 4: CEREBELLUM + BRAINSTEM - Coordinated Execution
  // ═══════════════════════════════════════════════════════════════════════
  const cerebellumStart = Date.now();
  const execResult = await cerebellum(hierarchy, thalamus);
  timing.cerebellumMs = Date.now() - cerebellumStart;

  timing.totalMs = Date.now() - totalStart;

  // ═══════════════════════════════════════════════════════════════════════
  // AGGREGATE RESULTS
  // ═══════════════════════════════════════════════════════════════════════
  const bySource: Record<TierSource, number> = { MANUAL_OVERRIDE: 0, TIER_SUBSCRIPTION: 0, TIER_PURCHASE: 0, SPENDING_BASED: 0, DEFAULT_BASE_TIER: 0, NONE: 0 };
  const byChange: Record<ChangeType, number> = { UPGRADE: 0, DOWNGRADE: 0, UNCHANGED: 0, INITIAL: 0 };
  const byValue: Record<ValueTier, number> = { PREMIUM: 0, STANDARD: 0, ENTRY: 0 };
  const byPriority: Record<ProcessingPriority, number> = { IMMEDIATE: 0, BATCH: 0, DEFERRED: 0 };

  for (const change of allChanges) {
    bySource[change.source]++;
    byChange[change.changeType]++;
    byValue[change.valueTier]++;
    byPriority[change.priority]++;
  }

  // Count active clusters
  let l1Count = 0, l2Count = 0, l3Count = 0, l4Count = 0;
  for (const [, l1] of hierarchy.root) {
    if (l1.customerCount > 0) l1Count++;
    for (const [, l2] of l1.byChange) {
      if (l2.totalWeight > 0) l2Count++;
      for (const [, l3] of l2.byValue) {
        if (l3.totalWeight > 0) l3Count++;
        for (const [, l4] of l3.byPriority) {
          if (l4.changes.length > 0) l4Count++;
        }
      }
    }
  }

  const result: NeuralV3Result = {
    processed: allChanges.length,
    upgraded: byChange.UPGRADE,
    downgraded: byChange.DOWNGRADE,
    unchanged: byChange.UNCHANGED,
    initial: byChange.INITIAL,
    errors: execResult.errors,
    bySource,
    byChange,
    byValue,
    byPriority,
    clustering: {
      l1Sources: l1Count,
      l2Changes: l2Count,
      l3Values: l3Count,
      l4Priorities: l4Count,
      totalWeight: hierarchy.totalWeight,
    },
    timing,
    architecture: 'ANATOMICAL_CNS_v3',
  };

  engineLogger.info('Anatomical Neural Engine complete', {
    ...result,
    avgTimePerCustomer: result.processed > 0 ? `${(timing.totalMs / result.processed).toFixed(2)}ms` : 'N/A',
    throughput: result.processed > 0 ? `${Math.round(result.processed / (timing.totalMs / 1000))}/sec` : 'N/A',
  });

  return result;
}
