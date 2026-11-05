import type { Decimal } from "decimal.js";
import { Money } from "~/lib/money";
import styles from "./admin.module.css";

/**
 * The small line chart (spec 4.3: cashback given against store credit spent,
 * by day). Polaris has no chart, so it is a plain SVG: the first series in
 * navy, the second in teal inside a navy edge, Polaris greys for the grid
 * and labels, and a legend under it.
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
  /** One or two series: there are two brand colours */
  series: [ChartSeries] | [ChartSeries, ChartSeries];
  /** How the top and bottom of the scale are labelled (an amount, say) */
  formatValue?: (value: Decimal) => string;
}

const WIDTH = 640;
const HEIGHT = 200;
const TOP = 24;
const BOTTOM = HEIGHT - 28;

const COLOURS = ["navy", "teal"] as const;

const dayFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });

function dayLabel(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(day.getTime()) ? date : dayFormat.format(day);
}

export function Chart({ series, formatValue = (value) => value.toString() }: ChartProps) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  if (dates.length === 0) {
    return <s-text color="subdued">Nothing to show yet.</s-text>;
  }

  const values = series.flatMap((s) => s.points.map((p) => new Money(p.value)));
  const low = Money.min(0, ...values);
  let high = Money.max(0, ...values);
  if (high.eq(low)) high = low.plus(1);

  // Pixel positions only: the amounts themselves are never rounded here
  const x = (date: string) => (dates.length === 1 ? WIDTH / 2 : (dates.indexOf(date) / (dates.length - 1)) * WIDTH);
  const y = (value: Decimal) => BOTTOM - value.minus(low).div(high.minus(low)).times(BOTTOM - TOP).toNumber();

  const polyline = (points: { x: number; y: number }[]) => points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const lines = series.map((s, i) => {
    const colour = COLOURS[i];
    const points = [...s.points]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((p) => ({ x: x(p.date), y: y(new Money(p.value)) }));
    return { label: s.label, colour, points };
  });

  const zeroY = y(new Money(0));
  const labels = series.map((s) => s.label).join(" and ");
  const range = dates.length === 1 ? dayLabel(dates[0]) : `${dayLabel(dates[0])} to ${dayLabel(dates[dates.length - 1])}`;

  return (
    <div>
      <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${labels}, ${range}`}>
        <line className={styles.gridLine} x1={0} x2={WIDTH} y1={TOP} y2={TOP} />
        <line className={styles.gridLine} x1={0} x2={WIDTH} y1={zeroY} y2={zeroY} />
        {low.lt(0) ? <line className={styles.gridLine} x1={0} x2={WIDTH} y1={BOTTOM} y2={BOTTOM} /> : null}
        <text className={styles.axisLabel} x={0} y={TOP - 8}>
          {formatValue(high)}
        </text>
        {low.lt(0) ? (
          <text className={styles.axisLabel} x={0} y={BOTTOM - 6}>
            {formatValue(low)}
          </text>
        ) : null}
        <text className={styles.axisLabel} x={0} y={HEIGHT - 6}>
          {dayLabel(dates[0])}
        </text>
        {dates.length > 1 ? (
          <text className={styles.axisLabel} x={WIDTH} y={HEIGHT - 6} textAnchor="end">
            {dayLabel(dates[dates.length - 1])}
          </text>
        ) : null}
        {lines.map(({ label, colour, points }) =>
          points.length === 1 ? (
            <circle
              key={label}
              className={`${styles.dot} ${styles[colour]}`}
              cx={points[0].x}
              cy={points[0].y}
              r={4}
            />
          ) : (
            <g key={label}>
              {colour === "teal" ? <polyline className={`${styles.line} ${styles.tealEdge}`} points={polyline(points)} /> : null}
              <polyline className={`${styles.line} ${styles[colour]}`} points={polyline(points)} />
            </g>
          ),
        )}
      </svg>
      <ul className={styles.legend}>
        {lines.map(({ label, colour }) => (
          <li key={label} className={styles.legendItem}>
            <span className={`${styles.swatch} ${colour === "navy" ? styles.swatchNavy : styles.swatchTeal}`} aria-hidden="true" />
            <s-text>{label}</s-text>
          </li>
        ))}
      </ul>
    </div>
  );
}
