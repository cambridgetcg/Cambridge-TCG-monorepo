import { XYChart, AnimatedAxis, AnimatedGrid, BarSeries, Tooltip } from "@visx/xychart";

export function BarChartVisx({
  data,
  xKey,
  yKey,
  horizontal = false,
  height = 240,
  onBarClick,
}: {
  data: Array<Record<string, number | string>>;
  xKey: string;
  yKey: string;
  height?: number;
  horizontal?: boolean;
  onBarClick?: (d: any) => void;
}) {
  const xType = horizontal ? "linear" : "band";
  const yType = horizontal ? "band" : "linear";

  return (
    <XYChart
      height={height}
      xScale={{ type: xType as any }}
      yScale={{ type: yType as any }}
    >
      <AnimatedGrid columns={!horizontal} rows={horizontal} numTicks={4} />
      <AnimatedAxis orientation="bottom" numTicks={4} />
      <AnimatedAxis orientation="left" numTicks={4} />
      <BarSeries
        dataKey={yKey}
        data={data as any}
        xAccessor={(d: any) => (horizontal ? Number(d[yKey]) : String(d[xKey]))}
        yAccessor={(d: any) => (horizontal ? String(d[xKey]) : Number(d[yKey]))}
        onPointerUp={(e) => {
          const d = (e as any).datum;
          if (onBarClick) onBarClick(d);
        }}
      />
      <Tooltip
        renderTooltip={({ tooltipData }) => {
          const d = tooltipData?.nearestDatum?.datum as any;
          if (!d) return null;
          return (
            <div style={{ fontSize: 12 }}>
              <div><b>{String(d[xKey])}</b></div>
              <div>{yKey}: {Number(d[yKey]).toLocaleString()}</div>
            </div>
          );
        }}
      />
    </XYChart>
  );
}