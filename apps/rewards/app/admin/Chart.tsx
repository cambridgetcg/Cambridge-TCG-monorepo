import type { Decimal } from "decimal.js";
import { Money } from "~/lib/money";
import styles from "./admin.module.css";

/**
 * The small line chart (spec 4.3: cashback given against store credit spent,
 * by day). Polaris has no chart, so it is a plain SVG (Ruling 71):
 * - labelled with its range ("Last 30 days"), so it isn't read as the month's;
 * - a small fixed height, stretched to the width (preserveAspectRatio none)
 *   with strokes that keep their pixel width, and no text inside the SVG:
 *   the range, the first and last day and the legend are Polaris text, so
 *   nothing renders below Polaris's own sizes;
 * - no scale: the legend gives each series' total over the range, and the
 *   SVG's label says the same to a screen reader;
 * - the first series navy and solid, drawn last so nothing hides it; the
 *   second teal inside a navy edge and dashed, so the two differ by more
 *   than colour (a series of one point is a dot, the teal one solid);
 * - one plain sentence (`empty`) instead, when every value is 0.
 */

export interface ChartPoint {
  /** A calendar day, YYYY-MM-DD */
  date: string;
  value: Decimal | number | string;
}

export interface ChartSeries {
  label: string;
  points: ChartPoint[];
}

interface ChartProps {
  /** The range the chart covers, said above it and to a screen reader */
  label: string;
  /** The sentence shown instead of the chart when every value is 0 */
  empty: string;
  /** One or two series: there are two brand colours */
  series: [ChartSeries] | [ChartSeries, ChartSeries];
  /** How a series' total is written (an amount, say) */
  formatValue?: (value: Decimal) => string;
}

/** The plot's own units; the SVG is stretched to the chart's CSS size. */
const WIDTH = 100;
const HEIGHT = 40;
/** Room above and below the lines, so a 2 px stroke at the top or bottom isn't cut */
const TOP = 2;
const BOTTOM = HEIGHT - 2;

const COLOURS = ["navy", "teal"] as const;

const dayFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });

function dayLabel(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(day.getTime()) ? date : dayFormat.format(day);
}

export function Chart({ label, empty, series, formatValue = (value) => value.toString() }: ChartProps) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const values = series.flatMap((s) => s.points.map((p) => new Money(p.value)));
  // Nothing happened: no lines at zero and no scale to make up
  if (dates.length === 0 || values.every((value) => value.isZero())) {
    return <s-text color="subdued">{empty}</s-text>;
  }

  const low = Money.min(0, ...values);
  const high = Money.max(0, ...values);

  // Pixel positions only: the amounts themselves are never rounded here
  const x = (date: string) => (dates.length === 1 ? WIDTH / 2 : (dates.indexOf(date) / (dates.length - 1)) * WIDTH);
  const y = (value: Decimal) => BOTTOM - value.minus(low).div(high.minus(low)).times(BOTTOM - TOP).toNumber();
  // One point is a zero-length line, which its round caps draw as a dot; a
  // dash pattern (butt caps) would draw nothing there, so a teal series of
  // one point is solid, a teal dot in its navy edge (M3d-F4)
  const polyline = (points: { x: number; y: number }[]) =>
    (points.length === 1 ? [points[0], points[0]] : points).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

  const lines = series.map((s, i) => ({
    key: i,
    label: s.label,
    colour: COLOURS[i],
    total: formatValue(Money.sum(0, ...s.points.map((p) => new Money(p.value)))),
    dashed: s.points.length === 1 ? "" : ` ${styles.dashed}`,
    points: polyline(
      [...s.points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((p) => ({ x: x(p.date), y: y(new Money(p.value)) })),
    ),
  }));
  const first = dayLabel(dates[0]);
  const last = dayLabel(dates[dates.length - 1]);
  const range = dates.length === 1 ? first : `${first} to ${last}`;
  const totals = lines.map((line) => `${line.label} ${line.total}`).join(", ");
  const zeroY = y(new Money(0));

  return (
    <s-stack gap="small-200">
      <s-text color="subdued">{label}</s-text>
      <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${label}, ${range}: ${totals}`}>
        <line className={styles.gridLine} x1={0} x2={WIDTH} y1={zeroY} y2={zeroY} />
        {/* The navy series last, on top */}
        {[...lines].reverse().map((line) =>
          line.colour === "teal" ? (
            <g key={line.key}>
              <polyline className={`${styles.line}${line.dashed} ${styles.tealEdge}`} points={line.points} />
              <polyline className={`${styles.line}${line.dashed} ${styles.teal}`} points={line.points} />
            </g>
          ) : (
            <polyline key={line.key} className={`${styles.line} ${styles.navy}`} points={line.points} />
          ),
        )}
      </svg>
      {dates.length > 1 ? (
        <s-stack direction="inline" justifyContent="space-between">
          <s-text color="subdued">{first}</s-text>
          <s-text color="subdued">{last}</s-text>
        </s-stack>
      ) : null}
      <ul className={styles.legend}>
        {lines.map((line) => (
          <li key={line.key} className={styles.legendItem}>
            <svg className={styles.key} viewBox="0 0 16 8" aria-hidden="true">
              {line.colour === "teal" ? <line className={`${styles.line} ${styles.dashed} ${styles.tealEdge}`} x1={1} x2={15} y1={4} y2={4} /> : null}
              <line className={`${styles.line} ${line.colour === "teal" ? `${styles.dashed} ${styles.teal}` : styles.navy}`} x1={1} x2={15} y1={4} y2={4} />
            </svg>
            <s-text>{line.label}</s-text> <s-text>{line.total}</s-text>
          </li>
        ))}
      </ul>
    </s-stack>
  );
}
