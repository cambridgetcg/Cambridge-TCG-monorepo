/**
 * The one "no image" card: a 5:7 hairline card with the mark's diamond pip,
 * and the reason in words beneath the pip. It stands where a card image would,
 * when there is none to show or the image did not load, so a page never shows
 * a broken-image icon or its alt text spilled into the frame.
 *
 * The two shapes are those of `marketing/placeholder/card-placeholder.svg`,
 * drawn with VectorCraft by `marketing/placeholder/build.py`; change them
 * there and copy the paths here. They paint in `currentColor`
 * (`text-border-strong`, the control edge), and the outline stays one CSS
 * pixel wide at any size. Nothing moves.
 *
 * Size it from the outside: pass a width (`w-full`) or a height (`h-full
 * w-auto`); the 5:7 aspect gives the other side.
 */
export function CardImagePlaceholder({
  label = "No image",
  compact = false,
  className = "",
}: {
  /** Says why there is no image: "No image" (none to show), "Image did not load". */
  label?: string;
  /** A thumbnail too small for words: the label is kept for screen readers only. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative aspect-[5/7] text-border-strong ${className}`}>
      <svg
        viewBox="0 0 250 350"
        aria-hidden="true"
        focusable="false"
        className="absolute inset-0 h-full w-full"
      >
        <path
          d="M12.5 0.5 L237.5 0.5 C244.13 0.5 249.5 5.87 249.5 12.5 L249.5 337.5 C249.5 344.13 244.13 349.5 237.5 349.5 L12.5 349.5 C5.87 349.5 0.5 344.13 0.5 337.5 L0.5 12.5 C0.5 5.87 5.87 0.5 12.5 0.5 Z"
          fill="none"
          stroke="currentColor"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        <path d="M125 138.5 L140 158 L125 177.5 L110 158 Z" fill="currentColor" />
      </svg>
      <span
        className={
          compact
            ? "sr-only"
            : "absolute inset-x-2 top-[56%] text-center text-xs leading-snug text-ink-muted"
        }
      >
        {label}
      </span>
    </div>
  );
}
