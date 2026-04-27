interface TierBadgeProps {
  name: string;
  icon: string;
  color: string;
  size?: "sm" | "md";
}

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string }> = {
  "amber-700":   { bg: "bg-amber-700/20",   text: "text-amber-600",  border: "border-amber-700/40" },
  "neutral-400": { bg: "bg-neutral-500/20",  text: "text-neutral-300", border: "border-neutral-500/40" },
  "amber-400":   { bg: "bg-amber-400/20",    text: "text-amber-400",  border: "border-amber-400/40" },
};

const DEFAULT_COLORS = { bg: "bg-neutral-700/20", text: "text-neutral-300", border: "border-neutral-500/40" };

export default function TierBadge({ name, icon, color, size = "sm" }: TierBadgeProps) {
  const c = COLOR_CLASSES[color] ?? DEFAULT_COLORS;
  const sizeClasses = size === "md"
    ? "px-3 py-1.5 text-sm gap-1.5"
    : "px-2.5 py-1 text-xs gap-1";

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full border ${c.bg} ${c.text} ${c.border} ${sizeClasses}`}
    >
      <span>{icon}</span>
      {name}
    </span>
  );
}
