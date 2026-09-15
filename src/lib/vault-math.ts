import type { HoldingsPosition, VaultHoldings } from "./snapshot-types";

/** Uniswap tick → price of token1 in token0, adjusted for decimals. */
export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1);
}

/**
 * Price of the Stock Token in USDG for the given tick, regardless of token ordering.
 * When USDG is token0 the pool quotes stock-per-USDG, so the value is inverted.
 */
export function stockPriceAtTick(tick: number, usdgIsToken0: boolean, decimals0: number, decimals1: number): number {
  const p = tickToPrice(tick, decimals0, decimals1);
  return usdgIsToken0 ? 1 / p : p;
}

/** Where the current price sits inside [lower, upper], as a percentage 0–100. */
export function rangePosition(lower: number | null, upper: number | null, current: number | null): number | null {
  if (lower === null || upper === null || current === null) return null;
  if (![lower, upper, current].every(Number.isFinite) || lower <= 0 || upper <= lower || current <= 0) return null;
  return Math.max(0, Math.min(100, ((current - lower) / (upper - lower)) * 100));
}

export function rangeDistances(lower: number | null, upper: number | null, current: number | null) {
  if (lower === null || upper === null || current === null) return null;
  if (![lower, upper, current].every((v) => Number.isFinite(v) && v > 0) || upper <= lower) return null;
  return { toLower: ((lower - current) / current) * 100, toUpper: ((upper - current) / current) * 100, width: ((upper - lower) / lower) * 100 };
}

export type DepositStatus = { key: "unknown" | "paused" | "open" | "closed"; label: string };

export function depositStatus(enabled: boolean | null | undefined, paused: boolean | null | undefined): DepositStatus {
  if (enabled == null || paused == null) return { key: "unknown", label: "Checking" };
  if (!enabled) return { key: "closed", label: "Deposits closed" };
  return paused ? { key: "paused", label: "Deposits paused" } : { key: "open", label: "Open" };
}

export type RangeStatus = {
  key: "unknown" | "none" | "recovery" | "in-range" | "out-of-range" | "waiting";
  label: string;
};

export function rangeStatus(positions: HoldingsPosition[] | null | undefined): RangeStatus {
  if (!positions) return { key: "unknown", label: "Checking" };
  if (positions.length === 0) return { key: "none", label: "No pool yet" };
  if (positions.some((p) => p.status === "recovery")) return { key: "recovery", label: "Recovery" };
  const active = positions.find((p) => p.status === "active");
  if (active) {
    if (active.inRange === null) return { key: "unknown", label: "Price unavailable" };
    return active.inRange ? { key: "in-range", label: "In range" } : { key: "out-of-range", label: "Out of range" };
  }
  if (positions.some((p) => p.status === "unavailable")) return { key: "unknown", label: "Unavailable" };
  return { key: "waiting", label: "Awaiting allocation" };
}

export function primaryPosition(positions: HoldingsPosition[] | null | undefined): HoldingsPosition | null {
  if (!positions || positions.length === 0) return null;
  return positions.find((p) => p.status === "active") ?? positions.find((p) => p.lower !== null && p.upper !== null) ?? positions[0];
}

export function describeAprWindow(info?: { source?: string; observedSeconds?: number; stale?: boolean } | null): string {
  if (info?.source !== "vault-fees-v1" || !Number.isFinite(info.observedSeconds) || (info.observedSeconds ?? 0) < 60) {
    return "Collecting fee history";
  }
  const hours = (info.observedSeconds ?? 0) / 3600;
  const span = hours >= 24 ? "24 hours" : hours >= 1 ? `${hours.toFixed(1)} hours` : `${Math.floor((info.observedSeconds ?? 0) / 60)} minutes`;
  return `Based on ${span} of observations${info.stale ? " · refresh delayed" : ""}`;
}

/** Sum a raw-integer column across snapshot rows; null if any row is missing. */
export function sumColumn<T extends Record<string, unknown>>(rows: T[], key: keyof T): string | null {
  const seen = new Set<string>();
  let total = 0n;
  for (const row of rows) {
    const vault = String(row.vault).toLowerCase();
    if (seen.has(vault)) return null;
    seen.add(vault);
    const v = row[key];
    if (v === null || typeof v !== "string" || !/^\d+$/.test(v)) return null;
    total += BigInt(v);
  }
  return total.toString();
}

export function ownerPositionValue(
  ownerShares: string | null | undefined,
  shareDecimals: number | null | undefined,
  totalAssets: string | null | undefined,
  totalSupply: string | null | undefined,
): number | null {
  if (ownerShares == null || shareDecimals == null || !totalAssets || !totalSupply) return null;
  if (!/^\d+$/.test(totalAssets) || !/^\d+$/.test(totalSupply)) return null;
  const supply = BigInt(totalSupply);
  const shares = BigInt(ownerShares);
  if (supply === 0n) return shares === 0n ? 0 : null;
  const v = Number((shares * BigInt(totalAssets)) / supply) / 1e6;
  return Number.isFinite(v) ? v : null;
}

export function holdingsAreFresh(h: VaultHoldings | null, now = Date.now()) {
  if (!h) return false;
  const t = Date.parse(h.observedAt);
  return Number.isFinite(t) && now - t <= 90_000 && t <= now + 30_000;
}
