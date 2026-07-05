interface TierBadgeProps {
  name: string;
  /** Kept for caller compatibility — the quiet gallery drops emoji chrome,
   *  so the icon is accepted but no longer rendered. */
  icon: string;
  color: string;
  size?: "sm" | "md";
}

// Keyed by the tier `color` field from the DB. Bronze ("amber-700") and
// Gold ("amber-400") share the bronze accent family (Gold the stronger
// wash); Silver ("neutral-400") is quiet neutral. Platinum carries no key
// here, so the default is the plum status literal.
const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string }> = {
  "amber-700":   { bg: "bg-accent/10",        text: "text-accent",        border: "border-accent/20" },
  "neutral-400": { bg: "bg-surface-subtle",   text: "text-ink-muted",     border: "border-border-subtle" },
  "amber-400":   { bg: "bg-accent-wash",      text: "text-accent-strong", border: "border-accent/30" },
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
