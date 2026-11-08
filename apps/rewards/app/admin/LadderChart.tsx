import { useRef, type PointerEvent } from "react";
import { snap } from "~/lib/ladder";
import styles from "./admin.module.css";

/**
 * The guide's picture of a store's buyers (RP-24 spec 4.3): a bar per bin of
 * spend, with two lines where tiers 2 and 3 start. Plain SVG on Chart.tsx's
 * pattern:
 * - `role="img"` with the page's spoken summary as its label, and no text
 *   inside it: the page shows the picture's label above it, and the ends of
 *   its scale are Polaris text below it;
 * - stretched to the width at a fixed height (preserveAspectRatio none), one
 *   unit per bin, with strokes that keep their pixel width;
 * - the tiers told apart by fill and edge, not colour alone: tier 1 light
 *   teal, tier 2 teal, tier 3 navy, every bar inside a navy edge. A bar
 *   belongs to the tier its bin's start falls in, as countsFor counts it;
 * - the lines mirror the fields, which are the real control: they are
 *   hidden from the accessibility tree, and dragging one (pointer events
 *   with capture, so mouse, pen and touch all work) reports the new starts,
 *   snapped to the bin grid and one bin apart. A drag moves a line by how
 *   far the pointer has gone since it took hold, not to the pointer, and
 *   only once the pointer has gone DEAD_ZONE px sideways: touching a line,
 *   or a scroll that starts on one, leaves a typed start (off the grid, or
 *   beyond the picture) as it was.
 */

interface LadderChartProps {
  /** The picture's spoken summary (GUIDE.chartSummary), worked out by the page */
  ariaLabel: string;
  /** Buyers per bin; the last bin holds every spend above the picture */
  buyers: number[];
  binWidth: number;
  /** Where tiers 2 and 3 start, from validStarts; null draws the bars only */
  starts: [number, number] | null;
  /** How a whole amount in the shop's currency is written */
  formatAmount: (whole: number) => string;
  /** Tier 2 and 3 starts after a drag, snapped */
  onStartsChange: (next: [number, number]) => void;
}

/** The plot's height in its own units; each bin is one unit wide. */
const HEIGHT = 100;
/** Room above the tallest bar */
const TOP = 4;
/** The lowest a bar with any buyers is drawn, so one buyer still shows beside thousands */
const MIN_BAR = 2;
/** Where the grips sit: high up, above most bars */
const GRIP_TOP = 8;
const GRIP_BOTTOM = 32;
/** How far, in CSS px, the pointer goes sideways before a press on a line becomes a drag */
const DEAD_ZONE = 3;

const round = (n: number) => Number(n.toFixed(2));

export function LadderChart({ ariaLabel, buyers, binWidth, starts, formatAmount, onStartsChange }: LadderChartProps) {
  const svg = useRef<SVGSVGElement>(null);
  // The line being dragged (0 for tier 2, 1 for tier 3), the pointer dragging it, where the
  // pointer took hold and the line's start then, and whether it has gone past the dead zone
  const drag = useRef<{ line: 0 | 1; pointerId: number; fromX: number; fromStart: number; live: boolean } | null>(null);

  const bins = Math.max(buyers.length, 1);
  const highest = Math.max(0, ...buyers);
  const barHeight = (count: number) => (count > 0 ? round(Math.max(MIN_BAR, (count / highest) * (HEIGHT - TOP))) : 0);
  // The same rule as countsFor: a bin is in the tier its start falls in
  const barClass = (bin: number) => {
    if (starts === null) return styles.bar;
    const binStart = bin * binWidth;
    if (binStart >= starts[1]) return `${styles.bar} ${styles.barTop}`;
    if (binStart >= starts[0]) return `${styles.bar} ${styles.barMid}`;
    return styles.bar;
  };

  /** How much spend a sideways move of the pointer covers, from the SVG's laid-out width and its viewBox. */
  function amountOver(pixels: number): number | null {
    const box = svg.current?.getBoundingClientRect();
    if (!box || !(box.width > 0)) return null;
    return (pixels / box.width) * bins * binWidth;
  }

  /** A dragged line's start on the grid, at least one bin from the other line. */
  function moved(line: 0 | 1, amount: number, current: [number, number]): [number, number] | null {
    const value = snap(amount, binWidth);
    if (line === 0) {
      const highestStart = Math.floor((current[1] - binWidth) / binWidth) * binWidth;
      if (highestStart < binWidth) return null;
      return [Math.min(value, highestStart), current[1]];
    }
    const lowestStart = Math.ceil((current[0] + binWidth) / binWidth) * binWidth;
    return [current[0], Math.max(value, lowestStart)];
  }

  function onPointerDown(line: 0 | 1, event: PointerEvent<SVGGElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    if (starts === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { line, pointerId: event.pointerId, fromX: event.clientX, fromStart: starts[line], live: false };
  }

  function onPointerMove(event: PointerEvent<SVGGElement>) {
    const dragging = drag.current;
    if (dragging === null || dragging.pointerId !== event.pointerId || starts === null) return;
    const pixels = event.clientX - dragging.fromX;
    if (!dragging.live && Math.abs(pixels) < DEAD_ZONE) return;
    dragging.live = true;
    const shift = amountOver(pixels);
    if (shift === null) return;
    // From where the line is drawn (a start beyond the picture sits on its edge), kept on the picture
    const drawn = Math.min(Math.max(dragging.fromStart, 0), bins * binWidth);
    const amount = Math.min(Math.max(drawn + shift, 0), (bins - 1) * binWidth);
    const next = moved(dragging.line, amount, starts);
    if (next === null || (next[0] === starts[0] && next[1] === starts[1])) return;
    // A line never moves against the pointer: pushing one outward past an end of the picture,
    // or into the other line, leaves a start the merchant typed there as it was
    const to = next[dragging.line];
    if (pixels > 0 ? to < dragging.fromStart : to > dragging.fromStart) return;
    onStartsChange(next);
  }

  function onPointerEnd(event: PointerEvent<SVGGElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const lineX = (start: number) => round(Math.min(Math.max(start / binWidth, 0), bins));

  return (
    <s-stack gap="small-200">
      <svg ref={svg} className={styles.ladder} viewBox={`0 0 ${bins} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        {buyers.map((count, bin) => {
          const height = barHeight(count);
          return <rect key={bin} className={barClass(bin)} x={bin} width={1} y={round(HEIGHT - height)} height={height} />;
        })}
        {starts === null
          ? null
          : starts.map((start, index) => {
              const line = index as 0 | 1;
              const x = lineX(start);
              return (
                <g
                  key={line}
                  className={styles.threshold}
                  aria-hidden="true"
                  onPointerDown={(event) => onPointerDown(line, event)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerEnd}
                  onPointerCancel={onPointerEnd}
                  onLostPointerCapture={() => {
                    if (drag.current?.line === line) drag.current = null;
                  }}
                >
                  <line className={styles.thresholdHit} x1={x} x2={x} y1={0} y2={HEIGHT} />
                  <line x1={x} x2={x} y1={0} y2={HEIGHT} />
                  <line className={styles.thresholdGrip} x1={x} x2={x} y1={GRIP_TOP} y2={GRIP_BOTTOM} />
                </g>
              );
            })}
      </svg>
      {/* The ends of the scale, as Chart.tsx gives its first and last day */}
      <s-stack direction="inline" justifyContent="space-between">
        <s-text color="subdued">{formatAmount(0)}</s-text>
        <s-text color="subdued">{formatAmount(bins * binWidth)}</s-text>
      </s-stack>
    </s-stack>
  );
}
