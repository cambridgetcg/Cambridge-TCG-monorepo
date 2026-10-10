export type BorderError = "empty" | "negative" | "not-number" | "not-finite";

export type CenteringRatio =
  | { status: "not-measurable" }
  | { status: "invalid"; firstError?: BorderError; secondError?: BorderError; pairError?: "zero-total" }
  | { status: "measured"; firstPercent: number; secondPercent: number };

export const BORDER_ERRORS: Record<BorderError, string> = {
  empty: "Enter a border width.",
  negative: "Use zero or a positive border width.",
  "not-number": "Enter a decimal number (for example, 2.5).",
  "not-finite": "Use a finite number within the supported numeric range.",
};

function parseBorder(raw: string): { value: number } | { error: BorderError } {
  const text = raw.trim();
  if (!text) return { error: "empty" };
  const value = Number(text);
  if (Number.isNaN(value)) return { error: "not-number" };
  if (!Number.isFinite(value)) return { error: "not-finite" };
  // Decimal/scientific notation only; don't quietly interpret hex or binary.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    return { error: "not-number" };
  }
  if (value < 0 || (value === 0 && /^-/.test(text) && /[1-9]/.test(text.split(/e/i)[0]))) {
    return { error: "negative" };
  }
  // A nonzero decimal that underflows must not masquerade as a measured zero.
  if (value === 0 && /[1-9]/.test(text.split(/e/i)[0])) return { error: "not-finite" };
  return { value };
}

/** Same-unit opposing borders only. Axes/faces are never combined or graded. */
export function calculateCenteringRatio(first: string, second: string, measurable = true): CenteringRatio {
  if (!measurable) return { status: "not-measurable" };
  const a = parseBorder(first);
  const b = parseBorder(second);
  if ("error" in a || "error" in b) {
    return {
      status: "invalid",
      ...("error" in a ? { firstError: a.error } : {}),
      ...("error" in b ? { secondError: b.error } : {}),
    };
  }
  const scale = Math.max(a.value, b.value);
  if (scale === 0) return { status: "invalid", pairError: "zero-total" };
  // Normalize before adding: MAX_VALUE + MAX_VALUE would otherwise overflow.
  const scaledA = a.value / scale;
  const scaledB = b.value / scale;
  const total = scaledA + scaledB;
  return {
    status: "measured",
    firstPercent: (scaledA / total) * 100,
    secondPercent: (scaledB / total) * 100,
  };
}

/** Presentation only; calculation retains its floating-point precision. */
export function formatBorderPercent(value: number): string {
  return Number(value.toFixed(2)).toString();
}
