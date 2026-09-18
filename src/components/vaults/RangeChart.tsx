"use client";

import { memo, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";

export type PricePoint = { date: string; price: number };

const W = 760;

export function buildRangeChart(points: PricePoint[], lower: number | null, upper: number | null, current: number | null, height: number) {
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const hasBand = lower !== null && upper !== null && Number.isFinite(lower) && Number.isFinite(upper) && lower > 0 && upper > lower;
  const hasCurrent = current !== null && Number.isFinite(current) && current > 0;
  const all = [...prices];
  if (hasBand) all.push(lower, upper);
  if (hasCurrent) all.push(current);
  let floor = Math.min(...all);
  let ceiling = Math.max(...all);
  const pad = 0.12 * (ceiling - floor || 0.02 * ceiling || 1);
  floor -= pad;
  ceiling += pad;
  const y = (v: number) => height - ((v - floor) / (ceiling - floor)) * height;
  return {
    path: points.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * W).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" "),
    bandTop: hasBand ? y(upper) : null,
    bandBottom: hasBand ? y(lower) : null,
    currentY: hasCurrent ? y(current) : null,
    lastX: W,
    lastY: y(prices[prices.length - 1]),
    floor,
    ceiling,
  };
}

const edgeLabel = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", ...(iso.includes("T") ? { hour: "numeric", minute: "2-digit" } : {}) }) : "";

export const RangeChart = memo(function RangeChart({
  points,
  lower,
  upper,
  current,
  symbol,
  height = 220,
  unavailable = false,
}: {
  points: PricePoint[];
  lower: number | null;
  upper: number | null;
  current: number | null;
  symbol: string;
  height?: number;
  unavailable?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const chart = useMemo(() => buildRangeChart(points, lower, upper, current, height), [points, lower, upper, current, height]);
  if (!chart) {
    return (
      <div className="range-chart-empty" role="status">
        <strong>Price history is building.</strong>
        <span>The chart draws once at least two recorded price observations exist for this pool. The current range and pool price are shown below.</span>
      </div>
    );
  }
  const hasBand = chart.bandTop !== null && chart.bandBottom !== null;
  const idx = hover === null ? null : Math.min(hover, points.length - 1);
  const point = idx === null ? null : points[idx];
  const hx = idx === null ? 0 : (idx / (points.length - 1)) * W;
  const hy = point ? height - ((point.price - chart.floor) / (chart.ceiling - chart.floor)) * height : 0;
  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width) setHover(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (points.length - 1)));
  };
  const when = point
    ? new Date(point.date).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        ...(point.date.includes("T") ? { hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" } : { timeZone: "UTC" }),
      })
    : "";
  return (
    <figure className="range-chart">
      <div
        className="range-chart-plot"
        tabIndex={0}
        role="group"
        aria-label={`${symbol} price history. Hover or tap for price and time. Use left and right arrow keys to explore observations.`}
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch") setHover(null);
        }}
        onPointerCancel={() => setHover(null)}
        onFocus={() => setHover((v) => v ?? points.length - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          const n = idx ?? points.length - 1;
          const next =
            e.key === "ArrowLeft" ? Math.max(0, n - 1) : e.key === "ArrowRight" ? Math.min(points.length - 1, n + 1) : e.key === "Home" ? 0 : e.key === "End" ? points.length - 1 : e.key === "Escape" ? null : undefined;
          if (next !== undefined) {
            e.preventDefault();
            setHover(next);
          }
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${symbol} DEX price across ${points.length} observations${hasBand && lower !== null && upper !== null ? `, LP range ${formatPrice(lower)} to ${formatPrice(upper)}` : ""}`}
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} className="range-chart-grid" x1="0" x2={W} y1={(height * f).toFixed(1)} y2={(height * f).toFixed(1)} />
          ))}
          {hasBand ? (
            <>
              <rect className="range-chart-band" x="0" y={chart.bandTop!.toFixed(1)} width={W} height={Math.max(0, chart.bandBottom! - chart.bandTop!).toFixed(1)} />
              <line className="range-chart-bound" x1="0" x2={W} y1={chart.bandTop!.toFixed(1)} y2={chart.bandTop!.toFixed(1)} />
              <line className="range-chart-bound" x1="0" x2={W} y1={chart.bandBottom!.toFixed(1)} y2={chart.bandBottom!.toFixed(1)} />
            </>
          ) : null}
          <path className="range-chart-line" d={chart.path} />
          {chart.currentY !== null ? <circle className="range-chart-now" cx={chart.lastX} cy={chart.currentY.toFixed(1)} r="4" /> : null}
          {point ? (
            <g className="range-chart-hover" aria-hidden="true">
              <line x1={hx} x2={hx} y1="0" y2={height} />
              <circle cx={hx} cy={hy} r="4" />
            </g>
          ) : null}
        </svg>
        {point ? (
          <div className="range-chart-tooltip" role="status" aria-live="polite" style={{ left: `clamp(8px, ${(hx / W) * 100}%, max(8px, calc(100% - 216px)))` }}>
            <time dateTime={point.date}>{when}</time>
            <strong>
              {formatPrice(point.price)} <span>USDG</span>
            </strong>
            <small>{point.date.includes("T") ? "Recorded pool price" : "Daily close"}</small>
          </div>
        ) : null}
      </div>
      <figcaption>
        <span suppressHydrationWarning>{edgeLabel(points[0]?.date)}</span>
        <span className="range-chart-legend">
          {hasBand && lower !== null && upper !== null ? (
            <>
              <i /> LP range {formatPrice(lower)} – {formatPrice(upper)}
            </>
          ) : unavailable ? (
            "Range data unavailable"
          ) : (
            "No active LP range"
          )}
        </span>
        <span suppressHydrationWarning>{edgeLabel(points[points.length - 1]?.date)}</span>
      </figcaption>
    </figure>
  );
});
