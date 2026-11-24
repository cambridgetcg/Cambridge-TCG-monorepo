import { useEffect, useRef, type PointerEvent } from "react";
import { snap, tierOfBin } from "~/lib/ladder";
import styles from "./admin.module.css";
import { GUIDE } from "./guide-words";

/**
 * The guide's picture of a store's buyers (RP-24 spec 4.3): a bar per bin of
 * spend, each tier's bars drawn as one stepped shape (R20), with two lines
 * where tiers 2 and 3 start. Plain SVG on Chart.tsx's pattern:
 * - `role="img"` with the page's spoken summary as its label, and no text
 *   inside it: the page shows the picture's label above it, and the ends of
 *   its scale are Polaris text below it, the right-hand one the last bar's
 *   start "and above", since that bar holds every spend from there up;
 * - stretched to the width at a fixed height (preserveAspectRatio none), one
 *   unit per bin, with strokes that keep their pixel width;
 * - one shape per tier, not a rect per bar, so a narrow screen shows each
 *   tier's outline rather than stripes of edges: tier 1 light teal, tier 2
 *   teal, tier 3 navy, each inside one navy edge. The tiers are told apart by
 *   their fills' lightness and by the lines between them, not by colour
 *   alone (every edge is the same navy). A bar belongs to the tier its bin's
 *   start falls in, by tierOfBin, as countsFor counts it;
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
  /** Buyers per bin, from pictureBins; the last bin holds every spend from its start up */
  buyers: number[];
  binWidth: number;
  /** Where tiers 2 and 3 start, from validStarts on the grid (onGrid); null draws one tier-1 shape and no lines */
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

/** Each tier's shape, by tier */
const SHAPE_CLASS = [styles.tier1Shape, styles.tier2Shape, styles.tier3Shape] as const;

export function LadderChart({ ariaLabel, buyers, binWidth, starts, formatAmount, onStartsChange }: LadderChartProps) {
  const svg = useRef<SVGSVGElement>(null);
  // The line being dragged (0 for tier 2, 1 for tier 3), the pointer dragging it, where the
  // pointer took hold and the line's start then, and whether it has gone past the dead zone
  const drag = useRef<{ line: 0 | 1; pointerId: number; fromX: number; fromStart: number; live: boolean } | null>(null);
  // Starts gone (a field emptied mid-drag) take the lines away, and the drag with them: when they
  // come back, only a new press takes a line
  const hasStarts = starts !== null;
  useEffect(() => {
    if (!hasStarts) drag.current = null;
  }, [hasStarts]);

  const bins = Math.max(buyers.length, 1);
  const highest = Math.max(0, ...buyers);
  const barHeight = (count: number) => (count > 0 ? round(Math.max(MIN_BAR, (count / highest) * (HEIGHT - TOP))) : 0);
  const shapes = tierShapes(buyers, binWidth, starts, barHeight);

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
    // No button pressed: a hover, or a release the page never saw (outside the frame), not a drag
    if (dragging === null || dragging.pointerId !== event.pointerId || starts === null || event.buttons === 0) return;
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
        {shapes.map((shape) => (
          <path key={shape.tier} className={SHAPE_CLASS[shape.tier]} d={shape.d} />
        ))}
        {/* Tier 3's line first, so tier 2's is on top: with both starts beyond the picture, both sit on its edge,
            and tier 3 can't move inward past tier 2, so tier 2's is the one a press there must take */}
        {starts === null
          ? null
          : ([1, 0] as const).map((line) => {
              const x = lineX(starts[line]);
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
        <s-text color="subdued">{GUIDE.andAbove(formatAmount((bins - 1) * binWidth))}</s-text>
      </s-stack>
    </s-stack>
  );
}

/**
 * Each tier's run of bars as one stepped outline: up from the baseline at the
 * run's first bin, across each bar's top (an empty bin on the baseline), and
 * back along the baseline from the run's end. A tier with no bins in the
 * picture has no shape; with no starts, every bin is tier 1's.
 */
function tierShapes(
  buyers: number[],
  binWidth: number,
  starts: [number, number] | null,
  barHeight: (count: number) => number,
): { tier: 0 | 1 | 2; d: string }[] {
  const tierOf = (bin: number) => (starts === null ? 0 : tierOfBin(bin, binWidth, [0, starts[0], starts[1]]));
  const shapes: { tier: 0 | 1 | 2; d: string }[] = [];
  let bin = 0;
  while (bin < buyers.length) {
    const tier = tierOf(bin);
    const path = [`M${bin} ${HEIGHT}`];
    // Where the outline is: it only turns where a bar's top changes
    let x = bin;
    let y = HEIGHT;
    for (; bin < buyers.length && tierOf(bin) === tier; bin += 1) {
      const top = round(HEIGHT - barHeight(buyers[bin]));
      if (top === y) continue;
      if (bin !== x) path.push(`H${bin}`);
      path.push(`V${top}`);
      x = bin;
      y = top;
    }
    path.push(`H${bin}`);
    if (y !== HEIGHT) path.push(`V${HEIGHT}`);
    path.push("Z");
    shapes.push({ tier, d: path.join("") });
  }
  return shapes;
}
