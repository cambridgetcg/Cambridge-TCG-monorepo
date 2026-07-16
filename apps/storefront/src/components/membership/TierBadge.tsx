interface TierBadgeProps {
  name: string;
  color: string;
  size?: "sm" | "md";
}

// Keyed by the tier `color` field from the DB, which stores HEX (tiers.color
// is VARCHAR(7), seeded '#CD7F32' etc.) — the old tailwind-name keys never
// matched, so every badge fell to the plum default. Bronze and Gold share the
// bronze accent family (Gold the stronger wash); Silver is quiet neutral.
// Platinum + Pro carry no key here, so they take the plum status default.
const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string }> = {
  "#CD7F32":   { bg: "bg-accent/10",        text: "text-accent",        border: "border-accent/20" },   // Bronze
  "#C0C0C0":   { bg: "bg-surface-subtle",   text: "text-ink-muted",     border: "border-border-subtle" }, // Silver
  "#FFD700":   { bg: "bg-accent-wash",      text: "text-accent-strong", border: "border-accent/30" },   // Gold / OG
};

// Platinum (and any unmapped tier colour) — plum status literal.
const DEFAULT_COLORS = { bg: "bg-[#6a5a8f]/15", text: "text-[#6a5a8f]", border: "border-[#6a5a8f]/30" };

export default function TierBadge({ name, color, size = "sm" }: TierBadgeProps) {
  const c = COLOR_CLASSES[color] ?? DEFAULT_COLORS;
  const sizeClasses = size === "md"
    ? "px-3 py-1.5 text-sm gap-1.5"
    : "px-2.5 py-1 text-xs gap-1";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${c.bg} ${c.text} ${c.border} ${sizeClasses}`}
    >
      {name}
    </span>
  );
}
