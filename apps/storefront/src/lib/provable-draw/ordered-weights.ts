export interface OrderedWeightSnapshot {
  weights: Record<string, number>;
  weightOrder: string[];
}

/**
 * Capture the exact key order the application will use before a draw is
 * committed. PostgreSQL jsonb preserves the values but not object key order,
 * so the order must travel separately as a JSON array.
 */
export function captureOrderedWeights(
  value: Record<string, number>,
): OrderedWeightSnapshot {
  const weightOrder = Object.keys(value);
  const weights: Record<string, number> = {};
  let total = 0;

  if (weightOrder.length === 0) {
    throw new Error("A weighted draw needs at least one option.");
  }

  for (const key of weightOrder) {
    const weight = value[key];
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(`Invalid weight for ${key}.`);
    }
    weights[key] = weight;
    total += weight;
  }

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("A weighted draw needs a positive total weight.");
  }

  return { weights, weightOrder };
}

/**
 * Accept an ordered-weight marker only when it names every stored weight key
 * exactly once. Missing or malformed markers are legacy/inconclusive, never a
 * reason to guess at jsonb's current object order.
 */
export function validatedWeightOrder(
  weightsValue: unknown,
  orderValue: unknown,
): string[] | null {
  if (!isRecord(weightsValue) || !Array.isArray(orderValue)) return null;

  const weightKeys = Object.keys(weightsValue);
  if (weightKeys.length === 0 || orderValue.length !== weightKeys.length) return null;

  const seen = new Set<string>();
  let total = 0;
  for (const key of orderValue) {
    if (
      typeof key !== "string" ||
      seen.has(key) ||
      !Object.prototype.hasOwnProperty.call(weightsValue, key)
    ) {
      return null;
    }

    const weight = weightsValue[key];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      return null;
    }
    seen.add(key);
    total += weight;
  }

  if (!Number.isFinite(total) || total <= 0) return null;
  return [...orderValue];
}

export function pickWeightedInOrder<T extends string>(
  weights: Record<T, number>,
  weightOrder: readonly T[],
  roll: number,
): T {
  const order = validatedWeightOrder(weights, weightOrder) as T[] | null;
  if (!order) throw new Error("Ordered weight contract is missing or invalid.");
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new Error("Roll must be a finite number in [0, 1).");
  }

  const total = order.reduce((sum, key) => sum + weights[key], 0);
  let cursor = roll * total;
  for (const key of order) {
    cursor -= weights[key];
    if (cursor <= 0) return key;
  }
  return order[order.length - 1];
}

export function withWeightOrder<T extends object>(
  outcome: T,
  weightOrder: readonly string[],
): T & { weight_order: string[] } {
  return { ...outcome, weight_order: [...weightOrder] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
