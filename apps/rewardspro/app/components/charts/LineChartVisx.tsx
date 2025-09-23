import { XYChart, AnimatedAxis, AnimatedGrid, AnimatedLineSeries, Tooltip } from "@visx/xychart";

export function LineChartVisx({
  data,
  xKey,
  yKey,
  height = 240,
}: {
  data: Array<Record<string, number | string | Date>>;
  xKey: string;
  yKey: string;
  height?: number;
}) {
  const accessors = {
    xAccessor: (d: any) => new Date(d[xKey] as any),
    yAccessor: (d: any) => Number(d[yKey]),
  };
  return (
    <XYChart
      height={height}
      xScale={{ type: "time" }}
      yScale={{ type: "linear" }}
    >
      <AnimatedGrid columns={false} numTicks={4} />
      <AnimatedAxis orientation="bottom" numTicks={4} />
      <AnimatedAxis orientation="left" numTicks={4} />
      <AnimatedLineSeries dataKey={yKey} data={data} {...accessors} />
      <Tooltip
        showVerticalCrosshair
        renderTooltip={({ tooltipData }) => {
          const d = tooltipData?.nearestDatum?.datum as any;
          if (!d) return null;
          return (
            <div style={{ fontSize: 12 }}>
              <div><b>{new Date(d[xKey]).toLocaleString()}</b></div>
              <div>{yKey}: {Number(d[yKey]).toLocaleString()}</div>
            </div>
          );
        }}
      />
    </XYChart>
  );
}