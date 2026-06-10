import { useEffect, useRef, useState, ReactNode } from "react";

export function ChartContainer({
  height = 240,
  minHeight,
  children,
}: {
  height?: number;
  minHeight?: number;
  children: (dims: { width: number; height: number }) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "100%", height, minHeight }}>
      {w ? children({ width: w, height }) : null}
    </div>
  );
}