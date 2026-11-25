/** The credit lines of the official English images on screen, each once: for
 * a page whose pictures are too small or too many to caption one by one. A
 * catalogue photo carries no credit line, so it adds none. */
export function ImageCredits({ credits, className = "" }: { credits: readonly (string | null | undefined)[]; className?: string }) {
  const lines = [...new Set(credits.filter((line): line is string => Boolean(line?.trim())))];
  if (lines.length === 0) return null;
  return (
    <p className={`text-[11px] leading-relaxed text-ink-muted ${className}`}>
      English reference images · printing not verified · {lines.join(" · ")}
    </p>
  );
}
