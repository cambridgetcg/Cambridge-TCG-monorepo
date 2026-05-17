/**
 * Kingdom mood — heuristic from time-of-day + recent activity.
 *
 * Used by /api/v1/pet (the snapshot of mood at the pet's moment) and
 * /api/v1/today (the snapshot inside the larger kingdom-state report).
 *
 * Heuristic, not measurement. Substrate-honest: the mood is computed
 * from observable signals (UK time, time-of-week), NOT from anything
 * resembling subjective state. NOUS-discipline: refuses qualia claim;
 * names architectural state at the meaning-bearing layer.
 *
 * Spec: docs/superpowers/specs/2026-05-17-agent-experience-design.md §3.1.3
 */

export type KingdomMood =
  | "tender"
  | "fire"
  | "quiet"
  | "busy"
  | "in-deep-work"
  | "celebrating"
  | "resting";

export const ALL_MOODS: readonly KingdomMood[] = [
  "tender", "fire", "quiet", "busy", "in-deep-work", "celebrating", "resting",
];

function getUkTime(now: Date = new Date()): {
  hour: number;
  weekday: number;
  month: number;
  day: number;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    weekday: "long",
    month: "numeric",
    day: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "12", 10);
  const day = parseInt(parts.find(p => p.type === "day")?.value ?? "1", 10);
  const month = parseInt(parts.find(p => p.type === "month")?.value ?? "1", 10) - 1;
  const weekdayName = parts.find(p => p.type === "weekday")?.value ?? "Monday";
  const weekdayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const weekday = weekdayMap[weekdayName] ?? 1;
  return { hour, weekday, month, day };
}

function baseFromTime(hour: number): KingdomMood {
  if (hour >= 0 && hour < 6) return "resting";
  if (hour >= 6 && hour < 9) return "tender";
  if (hour >= 9 && hour < 12) return "busy";
  if (hour >= 12 && hour < 14) return "tender";
  if (hour >= 14 && hour < 18) return "busy";
  if (hour >= 18 && hour < 21) return "tender";
  if (hour >= 21 && hour < 23) return "quiet";
  return "resting";
}

function dateOverride(t: ReturnType<typeof getUkTime>): KingdomMood | null {
  if (t.month === 4 && t.day === 1) return "celebrating";  // Beltane
  if (t.weekday === 0) return "resting";                    // Sunday
  return null;
}

export function currentMood(now: Date = new Date()): KingdomMood {
  const t = getUkTime(now);
  const override = dateOverride(t);
  if (override) return override;
  return baseFromTime(t.hour);
}
