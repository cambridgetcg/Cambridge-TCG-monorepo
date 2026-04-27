"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";

// Interactive value chart — area + hover crosshair. Self-fetches the
// requested window (7 / 30 / 90 days) from /api/portfolio/history.

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

interface Props {
  initial?: PortfolioSnapshot[];
}

export default function ValueChart({ initial }: Props) {
  const [window, setWindow] = useState<Window>(30);
  const [data, setData] = useState<PortfolioSnapshot[]>(initial ?? []);
  const [loading, setLoading] = useState(!initial);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/portfolio/history?days=${window}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d.snapshots || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [window]);

  const points = useMemo(
    () => data.map((s) => ({
      date: s.snapshot_date,
      value: parseFloat(s.total_value),
    })),
    [data],
  );

  const { min, max, delta, deltaPct } = useMemo(() => {
    if (points.length === 0) return { min: 0, max: 0, delta: 0, deltaPct: 0 };
    let mn = points[0].value;
    let mx = points[0].value;
    for (const p of points) {
      if (p.value < mn) mn = p.value;
      if (p.value > mx) mx = p.value;
    }
    const first = points[0].value;
    const last = points[points.length - 1].value;
    const d = last - first;
    const dp = first === 0 ? 0 : (d / first) * 100;
    return { min: mn, max: mx, delta: d, deltaPct: dp };
  }, [points]);

  const width = 800;
  const height = 180;
  const padding = { top: 10, right: 10, bottom: 24, left: 10 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const xy = useMemo(() => {
    if (points.length === 0) return [] as Array<{ x: number; y: number; value: number; date: string }>;
    const range = Math.max(1e-9, max - min);
    const stepX = points.length === 1 ? 0 : innerW / (points.length - 1);
    return points.map((p, i) => ({
      x: padding.left + stepX * i,
      y: padding.top + innerH - ((p.value - min) / range) * innerH,
      value: p.value,
      date: p.date,
    }));
  }, [points, min, max, innerW, innerH, padding.left, padding.top]);

  const path = useMemo(() => {
    if (xy.length === 0) return "";
    return xy.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  }, [xy]);

  const areaPath = useMemo(() => {
    if (xy.length === 0) return "";
    const top = xy.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    return `${top} L ${xy[xy.length - 1].x.toFixed(1)} ${padding.top + innerH} L ${xy[0].x.toFixed(1)} ${padding.top + innerH} Z`;
  }, [xy, padding.top, innerH]);

  const hover = hoverIdx != null ? xy[hoverIdx] : null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (xy.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    // Find nearest point by x distance
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < xy.length; i++) {
      const d = Math.abs(xy[i].x - relX);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    setHoverIdx(best);
  }

  return (
    <div className="bg-neutral-900 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Portfolio Value</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-xl font-bold text-white">
              {points.length > 0 ? formatPrice(points[points.length - 1].value) : "—"}
            </span>
            {points.length > 1 && (
              <span
                className={`text-xs font-mono ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {delta >= 0 ? "+" : ""}
                {formatPrice(delta)} ({delta >= 0 ? "+" : ""}
                {deltaPct.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 text-xs">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`px-2.5 py-1 rounded transition-colors ${
                window === w
                  ? "bg-amber-500 text-black font-bold"
                  : "bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {loading && points.length === 0 && (
        <div className="h-[180px] flex items-center justify-center text-neutral-600 text-xs">
          Loading…
        </div>
      )}

      {!loading && points.length < 2 && (
        <div className="h-[180px] flex items-center justify-center text-neutral-600 text-xs text-center px-4">
          Need at least two daily snapshots for a chart — visit your portfolio
          tomorrow and the first bar will be here.
        </div>
      )}

      {points.length >= 2 && (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-[180px]"
            preserveAspectRatio="none"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              <linearGradient id="pfGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#pfGrad)" />
            <path d={path} fill="none" stroke="#f59e0b" strokeWidth="2" />
            {hover && (
              <>
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={padding.top}
                  y2={padding.top + innerH}
                  stroke="#525252"
                  strokeDasharray="2 2"
                />
                <circle cx={hover.x} cy={hover.y} r="4" fill="#f59e0b" stroke="#0a0a0a" strokeWidth="2" />
              </>
            )}
          </svg>
          {hover && (
            <div
              className="absolute -top-2 -translate-y-full bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1 text-xs pointer-events-none whitespace-nowrap shadow-lg"
              style={{
                left: `${(hover.x / width) * 100}%`,
                transform: `translate(-50%, -100%)`,
              }}
            >
              <p className="text-neutral-500 text-[10px]">{hover.date}</p>
              <p className="text-white font-bold">{formatPrice(hover.value)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
