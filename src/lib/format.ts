/** Formatting helpers shared by the app. Mirrors the original site's number presentation. */

export const formatUsd = (value: number | null): string =>
  value === null
    ? "—"
    : Math.abs(value) >= 1e6
      ? `$${(value / 1e6).toFixed(2)}M`
      : Math.abs(value) >= 1e4
        ? `$${(value / 1e3).toFixed(1)}K`
        : value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: value >= 1e3 ? 0 : 2 });

export const usdgToNumber = (raw: string | bigint | null | undefined): number | null =>
  raw == null ? null : Number(raw) / 1e6;

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1e15 ? "scientific" : value >= 1e6 ? "compact" : "standard",
    maximumFractionDigits: value >= 1e6 ? 2 : value >= 1e3 ? 0 : 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0 || !Number.isFinite(value * 100)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    notation: value >= 1e7 ? "scientific" : value >= 1e3 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Formats a raw integer amount with the given decimals, thousands separators and fixed fraction digits. */
export function formatUnitsFixed(raw: string | bigint | null, decimals = 6, fraction = 2): string {
  if (raw === null) return "Unavailable";
  let v = BigInt(raw);
  const sign = v < 0n ? "−" : "";
  if (v < 0n) v = -v;
  const base = 10n ** BigInt(decimals);
  const whole = (v / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = fraction ? "." + (v % base).toString().padStart(decimals, "0").slice(0, fraction).padEnd(fraction, "0") : "";
  return sign + whole + frac;
}

/** Formats a 1e18-scaled rate (e.g. borrow APR) as a percentage with two decimals. */
export function formatRate18(raw: string | bigint | null): string {
  return raw === null ? "—" : formatUnitsFixed((BigInt(raw) * 100n).toString(), 18, 2) + "%";
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/** Renders a timestamp (unix seconds string, ISO string or Date) as "Sep 15, 2026, 4:04 PM UTC". */
export function formatUtc(value: string | Date | number): string {
  let date: Date;
  if (typeof value === "number") date = new Date(value);
  else if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0x386d4380 || n > 0x3afff4417f) return "Unavailable";
    date = new Date(n * 1000);
  } else if (typeof value === "string") {
    if (!ISO.test(value)) return "Unavailable";
    date = new Date(value);
  } else date = new Date(value.getTime());
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return `${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`;
}

export const formatPrice = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: value < 1 ? 6 : 2,
      });

export function shortHex(value: string, head = 6, tail = 6) {
  return `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
}

export function formatTokenAmount(raw: bigint, decimals: number, maxSignificant = 6) {
  const n = Number(raw) / 10 ** decimals;
  return n.toLocaleString(undefined, { maximumSignificantDigits: maxSignificant });
}
