import { validatedWeightOrder } from "@/lib/provable-draw/ordered-weights";

export interface PublicDrawSlot {
  picked: string;
  roll: number;
}

export type PublicDrawOutcome =
  | PublicDrawSlot
  | { slots: PublicDrawSlot[] };

export type WeightOrderStatus = "valid" | "missing" | "invalid";
export type DrawOutcomeReplayReason =
  | "not_revealed"
  | "server_seed_missing"
  | "ordered_weight_contract_missing"
  | "ordered_weight_contract_invalid"
  | "client_seed_withheld"
  | "outcome_missing_or_incomplete";

export interface PublicDrawProof {
  weights: Record<string, number>;
  weightOrder: string[] | null;
  weightOrderStatus: WeightOrderStatus;
  outcome: PublicDrawOutcome | null;
}

export function drawOutcomeReplayReason(args: {
  revealed: boolean;
  hasServerSeed: boolean;
  weightOrderStatus: WeightOrderStatus;
  clientSeedAvailable: boolean;
  hasExpectedOutcome: boolean;
}): DrawOutcomeReplayReason | null {
  if (!args.revealed) return "not_revealed";
  if (!args.hasServerSeed) return "server_seed_missing";
  if (args.weightOrderStatus === "missing") return "ordered_weight_contract_missing";
  if (args.weightOrderStatus === "invalid") return "ordered_weight_contract_invalid";
  if (!args.clientSeedAvailable) return "client_seed_withheld";
  if (!args.hasExpectedOutcome) return "outcome_missing_or_incomplete";
  return null;
}

export function hasPublicDistributionSample(
  drawCount: number,
  observationCount: number,
  minimum: number,
): boolean {
  return drawCount >= minimum && observationCount >= minimum;
}

export function aliasDistributionRows<T extends { key: string }>(rows: T[]): T[] {
  return rows.map((row, index) => ({ ...row, key: `option_${index + 1}` }));
}

/**
 * Keep the deterministic weight order needed for replay while replacing
 * database row ids with labels that have meaning only inside this receipt.
 */
export function projectDrawProof(
  weightsValue: unknown,
  outcomeValue: unknown,
): PublicDrawProof {
  const rawWeights = isRecord(weightsValue) ? weightsValue : {};
  const sourceWeights: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawWeights)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      sourceWeights[key] = value;
    }
  }

  const rawWeightOrder = isRecord(outcomeValue)
    ? outcomeValue.weight_order
    : undefined;
  const storedWeightOrder = validatedWeightOrder(weightsValue, rawWeightOrder);
  const weightOrderStatus: WeightOrderStatus = storedWeightOrder
    ? "valid"
    : rawWeightOrder === undefined
      ? "missing"
      : "invalid";
  const aliases = new Map<string, string>();
  const weights: Record<string, number> = {};

  const aliasFor = (key: string): string => {
    const existing = aliases.get(key);
    if (existing) return existing;
    const alias = `option_${aliases.size + 1}`;
    aliases.set(key, alias);
    return alias;
  };

  const projectionOrder = storedWeightOrder ?? Object.keys(sourceWeights);
  for (const key of projectionOrder) {
    weights[aliasFor(key)] = sourceWeights[key];
  }
  const weightOrder = storedWeightOrder?.map(aliasFor) ?? null;

  if (!isRecord(outcomeValue)) {
    return { weights, weightOrder, weightOrderStatus, outcome: null };
  }

  if (Array.isArray(outcomeValue.slots)) {
    const slots = outcomeValue.slots
      .map((slot) => projectSlot(slot, aliasFor))
      .filter((slot): slot is PublicDrawSlot => slot !== null);
    return { weights, weightOrder, weightOrderStatus, outcome: { slots } };
  }

  return {
    weights,
    weightOrder,
    weightOrderStatus,
    outcome: projectSlot(outcomeValue, aliasFor),
  };
}

function projectSlot(
  value: unknown,
  aliasFor: (key: string) => string,
): PublicDrawSlot | null {
  if (!isRecord(value) || typeof value.picked !== "string") return null;
  if (typeof value.roll !== "number" || !Number.isFinite(value.roll)) return null;
  return { picked: aliasFor(value.picked), roll: value.roll };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
