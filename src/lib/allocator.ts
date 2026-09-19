/**
 * Allocator v0: the scoring model behind /allocator.
 *
 * Pure functions over the same chain reads the vault pages use (the public
 * vault snapshots and the lending market rows). Nothing here touches a
 * wallet or a contract: it turns a USDG amount and a risk setting into a
 * proposed split, with a score and the reasons behind each position. The
 * user executes every leg from their own wallet, like the basket.
 *
 * Every candidate gets four component scores from 0 to 100:
 *
 *   yield      realized fee APR (or lending supply APR) relative to the best
 *              eligible candidate, on a square-root scale so one outlier does
 *              not flatten the rest; dampened while the fee sampler has seen
 *              less than a full day of trading.
 *   depth      capital already in the position, log scale from the $1,000
 *              floor (0) to $50,000 (100). Thin vaults produce noisy APRs.
 *   health     starts at 100 and loses points for a range that is out or near
 *              its edge, a stock feed older than 26 hours, a pool price that
 *              drifts from the Chainlink reference, or a stale APR sample.
 *   stability  how far the position can move before it needs attention: the
 *              width of the liquidity range and how centred the price sits in
 *              it. USDG lending has no stock price exposure and scores 100.
 *
 * A risk profile weights those components, limits the number of positions
 * and the weight of any one of them, and sets a floor for the lending sleeve.
 * Weights are proportional to score squared, capped, then rounded to USDG.
 *
 * Run it from the command line:  npm run allocator -- --amount 1000 --risk balanced
 */
import type { LendingMarketRow } from "@/server/lending";
import type { VaultPin } from "./registry";
import type { VaultSnapshotRow } from "./snapshot-types";

export const ALLOCATOR_MODEL = "v0.1";
export const RISK_PROFILES = ["conservative", "balanced", "aggressive"] as const;
export type RiskProfile = (typeof RISK_PROFILES)[number];

/** Vaults below this TVL are not ranked; their APR is too noisy to act on. */
export const ALLOCATOR_TVL_FLOOR = 1_000;
/** Depth scores 100 at this TVL. */
export const ALLOCATOR_TVL_FULL = 50_000;
/** Smallest amount the router accepts comfortably per leg. */
export const ALLOCATOR_MIN_PER_LEG = 10;
/** Positions under this weight are dropped and their share redistributed. */
export const ALLOCATOR_MIN_WEIGHT = 0.05;
/** A stock feed older than this counts as stale (US equities close overnight and at weekends). */
export const STOCK_FEED_FRESH_SECONDS = 26 * 3600;
/** Fee APR is trusted fully once the sampler has observed this much trading. */
export const APR_CONFIDENCE_SECONDS = 24 * 3600;
const EDGE_FRACTION = 0.15;
const RANGE_FULL_WIDTH = 0.4;

export type ComponentWeights = { yield: number; depth: number; health: number; stability: number };

export type ProfileSpec = {
  id: RiskProfile;
  weights: ComponentWeights;
  maxPositions: number;
  maxWeight: number;
  lendingFloor: number;
};

export const PROFILES: Record<RiskProfile, ProfileSpec> = {
  conservative: { id: "conservative", weights: { yield: 0.2, depth: 0.3, health: 0.25, stability: 0.25 }, maxPositions: 6, maxWeight: 0.25, lendingFloor: 0.3 },
  balanced: { id: "balanced", weights: { yield: 0.4, depth: 0.25, health: 0.2, stability: 0.15 }, maxPositions: 5, maxWeight: 0.35, lendingFloor: 0.1 },
  aggressive: { id: "aggressive", weights: { yield: 0.6, depth: 0.15, health: 0.15, stability: 0.1 }, maxPositions: 3, maxWeight: 0.5, lendingFloor: 0 },
};

/** Why a position scored the way it did; rendered as `reason.<code>` in the UI and in English by `describeReason`. */
export type Reason = { code: ReasonCode; params: Record<string, string | number> };
export type ReasonCode =
  | "apr"
  | "aprShort"
  | "aprStale"
  | "depth"
  | "inRange"
  | "nearEdge"
  | "outOfRange"
  | "oracleFresh"
  | "oracleStale"
  | "poolDrift"
  | "rangeWidth"
  | "lendingNoExposure"
  | "lendingRate"
  | "capped"
  | "floor";

export type ExclusionCode = "thin" | "closed" | "stale" | "noApr" | "unreadable" | "lendingInactive" | "lendingOracle" | "router";

export type Candidate = {
  kind: "vault" | "lending";
  id: string;
  symbol: string;
  href: string;
  /** Vault pin for vault legs; lending legs carry the market pin id in `id`. */
  pin: VaultPin | null;
  market: LendingMarketRow | null;
  apr: number;
  tvl: number;
  components: { yield: number; depth: number; health: number; stability: number };
  score: number;
  reasons: Reason[];
};

export type Excluded = { kind: "vault" | "lending"; id: string; symbol: string; code: ExclusionCode };

export type Position = Candidate & { weight: number; amount: bigint };

export type Proposal = {
  model: typeof ALLOCATOR_MODEL;
  profile: ProfileSpec;
  amount: bigint;
  positions: Position[];
  excluded: Excluded[];
  /** Every ranked candidate, best first, including the ones that did not make the cut. */
  ranking: Candidate[];
  /** Share of the total that ends up in lending. */
  lendingShare: number;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 10) / 10;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

type RawVault = {
  pin: VaultPin;
  apr: number;
  observedSeconds: number;
  aprStale: boolean;
  tvl: number;
  lower: number;
  upper: number;
  tick: number;
  oracleAgeSeconds: number | null;
  poolVsOracle: number | null;
};

function readVault(row: VaultSnapshotRow, pin: VaultPin, now: number): { raw: RawVault } | { code: ExclusionCode } {
  const s = row.snapshot;
  const m = s?.extras?.managedState;
  if (!s || !m) return { code: "unreadable" };
  if (!(m.open && !m.stopped && !m.recovery && !m.restart)) return { code: "closed" };
  if (!m.quote) return { code: "stale" };
  const fee = s.extras?.feeApr;
  if (s.apr === null || !fee || fee.source !== "vault-fees-v1") return { code: "noApr" };
  if (s.assets === null) return { code: "unreadable" };
  const tvl = Number(s.assets) / 1e6;
  if (tvl < ALLOCATOR_TVL_FLOOR) return { code: "thin" };
  const pos = s.holdings?.positions?.[0];
  const oracle = m.quote ? Number(m.quote.answer) / 10 ** m.quote.decimals : null;
  const poolVsOracle = oracle && pos?.current ? pos.current / oracle - 1 : null;
  return {
    raw: {
      pin,
      apr: s.apr,
      observedSeconds: fee.observedSeconds,
      aprStale: fee.stale,
      tvl,
      lower: m.lower,
      upper: m.upper,
      tick: m.tick,
      oracleAgeSeconds: m.quote ? Math.max(0, Math.floor(now / 1000) - Number(m.quote.updatedAt)) : null,
      poolVsOracle,
    },
  };
}

const depthScore = (tvl: number) => clamp((100 * Math.log10(Math.max(tvl, ALLOCATOR_TVL_FLOOR) / ALLOCATOR_TVL_FLOOR)) / Math.log10(ALLOCATOR_TVL_FULL / ALLOCATOR_TVL_FLOOR));
const yieldScore = (apr: number, best: number, confidence: number) => (best <= 0 || apr <= 0 ? 0 : clamp(100 * Math.sqrt(apr / best) * confidence));
const hours = (seconds: number) => round(seconds / 3600);

function scoreVault(v: RawVault, best: number): Candidate {
  const reasons: Reason[] = [];
  const confidence = Math.sqrt(Math.min(1, v.observedSeconds / APR_CONFIDENCE_SECONDS));
  const y = yieldScore(v.apr, best, confidence);
  const aprPct = round(v.apr * 100);
  if (v.aprStale) reasons.push({ code: "aprStale", params: { apr: aprPct } });
  else if (v.observedSeconds < APR_CONFIDENCE_SECONDS) reasons.push({ code: "aprShort", params: { apr: aprPct, hours: hours(v.observedSeconds) } });
  else reasons.push({ code: "apr", params: { apr: aprPct } });

  const d = depthScore(v.tvl);
  reasons.push({ code: "depth", params: { tvl: Math.round(v.tvl) } });

  let h = 100;
  const span = v.upper - v.lower;
  const position = span > 0 ? (v.tick - v.lower) / span : 0.5;
  if (position < 0 || position > 1) {
    h -= 40;
    reasons.push({ code: "outOfRange", params: {} });
  } else if (position < EDGE_FRACTION || position > 1 - EDGE_FRACTION) {
    h -= 20;
    reasons.push({ code: "nearEdge", params: { pct: Math.round(position * 100) } });
  } else {
    reasons.push({ code: "inRange", params: { pct: Math.round(position * 100) } });
  }
  if (v.oracleAgeSeconds !== null && v.oracleAgeSeconds > STOCK_FEED_FRESH_SECONDS) {
    h -= 25;
    reasons.push({ code: "oracleStale", params: { hours: hours(v.oracleAgeSeconds) } });
  } else if (v.oracleAgeSeconds !== null) {
    reasons.push({ code: "oracleFresh", params: { hours: hours(v.oracleAgeSeconds) } });
  }
  if (v.poolVsOracle !== null && Math.abs(v.poolVsOracle) > 0.01) {
    h -= 15;
    reasons.push({ code: "poolDrift", params: { pct: round(v.poolVsOracle * 100) } });
  }
  if (v.aprStale) h -= 20;
  h = clamp(h);

  const width = span > 0 ? Math.pow(1.0001, span) - 1 : 0;
  const widthScore = clamp((100 * width) / RANGE_FULL_WIDTH);
  const centre = clamp(100 * (1 - Math.abs(position - 0.5) * 2));
  const s = clamp(0.6 * widthScore + 0.4 * centre);
  reasons.push({ code: "rangeWidth", params: { pct: round(width * 100) } });

  return {
    kind: "vault",
    id: v.pin.id,
    symbol: v.pin.symbol,
    href: v.pin.href,
    pin: v.pin,
    market: null,
    apr: v.apr,
    tvl: v.tvl,
    components: { yield: round(y), depth: round(d), health: round(h), stability: round(s) },
    score: 0,
    reasons,
  };
}

function scoreLending(m: LendingMarketRow, best: number): Candidate {
  const apr = Number(m.rates.supplyApr) / 1e18;
  const supplied = Number(m.accounting.supplied) / 1e6;
  const util = m.rates.utilizationBps / 100;
  const reasons: Reason[] = [
    { code: "lendingNoExposure", params: {} },
    { code: "lendingRate", params: { apr: round(apr * 100), util: round(util) } },
    { code: "depth", params: { tvl: Math.round(supplied) } },
  ];
  return {
    kind: "lending",
    id: m.pinId,
    symbol: m.pin.symbol,
    href: `/lending/${m.pin.slug}`,
    pin: null,
    market: m,
    apr,
    tvl: supplied,
    components: { yield: round(yieldScore(apr, best, 1)), depth: round(depthScore(supplied)), health: 100, stability: 100 },
    score: 0,
    reasons,
  };
}

const total = (c: Candidate, w: ComponentWeights) => round(c.components.yield * w.yield + c.components.depth * w.depth + c.components.health * w.health + c.components.stability * w.stability);

export type RankInput = {
  rows: VaultSnapshotRow[];
  pins: VaultPin[];
  lending: LendingMarketRow[];
  profile: RiskProfile;
  now?: number;
  /** Vault addresses or market pin ids the router could not quote right now; they are skipped and the next candidate steps in. */
  exclude?: Record<string, ExclusionCode>;
};

/** Scores every eligible vault and lending market for a profile, best first. */
export function rank(input: RankInput): { ranking: Candidate[]; excluded: Excluded[] } {
  const now = input.now ?? Date.now();
  const spec = PROFILES[input.profile];
  const excluded: Excluded[] = [];
  const raws: RawVault[] = [];
  for (const pin of input.pins) {
    const forced = input.exclude?.[pin.vault.toLowerCase()] ?? input.exclude?.[pin.vault];
    if (forced) {
      excluded.push({ kind: "vault", id: pin.id, symbol: pin.symbol, code: forced });
      continue;
    }
    const row = input.rows.find((r) => same(r.descriptor.vault, pin.vault));
    if (!row) {
      excluded.push({ kind: "vault", id: pin.id, symbol: pin.symbol, code: "unreadable" });
      continue;
    }
    const r = readVault(row, pin, now);
    if ("code" in r) excluded.push({ kind: "vault", id: pin.id, symbol: pin.symbol, code: r.code });
    else raws.push(r.raw);
  }
  const markets: LendingMarketRow[] = [];
  for (const m of input.lending) {
    const forced = input.exclude?.[m.pinId];
    if (forced) excluded.push({ kind: "lending", id: m.pinId, symbol: m.pin.symbol, code: forced });
    else if (m.contractState.ordinal !== 0 || m.recoveryStarted) excluded.push({ kind: "lending", id: m.pinId, symbol: m.pin.symbol, code: "lendingInactive" });
    else if (!m.oracle.available) excluded.push({ kind: "lending", id: m.pinId, symbol: m.pin.symbol, code: "lendingOracle" });
    else markets.push(m);
  }
  const best = Math.max(0, ...raws.map((v) => v.apr), ...markets.map((m) => Number(m.rates.supplyApr) / 1e18));
  const ranking = [...raws.map((v) => scoreVault(v, best)), ...markets.map((m) => scoreLending(m, best))];
  for (const c of ranking) c.score = total(c, spec.weights);
  ranking.sort((a, b) => b.score - a.score || b.tvl - a.tvl);
  return { ranking, excluded };
}

/** Turns a ranking into weights: top N by score, proportional to score squared, capped per position, lending floor applied. */
export function allocate(ranking: Candidate[], spec: ProfileSpec): { candidate: Candidate; weight: number; reasons: Reason[] }[] {
  let picked = ranking.slice(0, spec.maxPositions);
  const lendingIn = picked.some((c) => c.kind === "lending");
  const bestLending = ranking.find((c) => c.kind === "lending");
  // The lending floor only applies when the profile asks for one and an active market exists.
  if (spec.lendingFloor > 0 && bestLending && !lendingIn) picked = [...picked.slice(0, spec.maxPositions - 1), bestLending];

  const solve = (list: Candidate[]) => {
    const weights = new Map<string, number>();
    const extra = new Map<string, Reason[]>();
    const base = list.map((c) => Math.max(c.score, 1) ** 2);
    const sum = base.reduce((a, b) => a + b, 0);
    list.forEach((c, i) => weights.set(c.id, base[i] / sum));
    // Cap the heaviest positions and hand the excess to the rest, repeatedly, until nothing exceeds the cap.
    for (let pass = 0; pass < list.length; pass++) {
      const over = list.filter((c) => weights.get(c.id)! > spec.maxWeight + 1e-9);
      if (!over.length) break;
      let excess = 0;
      for (const c of over) {
        excess += weights.get(c.id)! - spec.maxWeight;
        weights.set(c.id, spec.maxWeight);
        extra.set(c.id, [{ code: "capped", params: { pct: Math.round(spec.maxWeight * 100) } }]);
      }
      const free = list.filter((c) => weights.get(c.id)! < spec.maxWeight - 1e-9);
      if (!free.length) break;
      const freeSum = free.reduce((a, c) => a + weights.get(c.id)!, 0);
      for (const c of free) weights.set(c.id, weights.get(c.id)! + (excess * weights.get(c.id)!) / freeSum);
    }
    // With fewer positions than the cap allows, every one can hit the cap; the split must still add up to the whole amount.
    const capped = list.reduce((a, c) => a + weights.get(c.id)!, 0);
    if (capped > 0 && Math.abs(capped - 1) > 1e-9) for (const c of list) weights.set(c.id, weights.get(c.id)! / capped);
    const lending = list.find((c) => c.kind === "lending");
    if (lending && spec.lendingFloor > 0 && weights.get(lending.id)! < spec.lendingFloor) {
      const others = list.filter((c) => c.id !== lending.id);
      const othersSum = others.reduce((a, c) => a + weights.get(c.id)!, 0);
      for (const c of others) weights.set(c.id, othersSum > 0 ? (weights.get(c.id)! * (1 - spec.lendingFloor)) / othersSum : 0);
      weights.set(lending.id, spec.lendingFloor);
      extra.set(lending.id, [{ code: "floor", params: { pct: Math.round(spec.lendingFloor * 100) } }]);
    }
    return { weights, extra };
  };

  let { weights, extra } = solve(picked);
  const small = picked.filter((c) => weights.get(c.id)! < ALLOCATOR_MIN_WEIGHT);
  if (small.length && small.length < picked.length) {
    picked = picked.filter((c) => !small.includes(c));
    ({ weights, extra } = solve(picked));
  }
  return picked.map((c) => ({ candidate: c, weight: weights.get(c.id)!, reasons: extra.get(c.id) ?? [] }));
}

/** Splits a USDG amount (6 decimals) by weight; rounding dust goes to the first leg. */
export function splitByWeight(amount: bigint, weights: number[]): bigint[] {
  if (!weights.length) return [];
  const legs = weights.map((w) => (amount * BigInt(Math.round(w * 1e6))) / 1_000_000n);
  legs[0] += amount - legs.reduce((a, b) => a + b, 0n);
  return legs;
}

export function propose(input: RankInput & { amount: bigint }): Proposal {
  const spec = PROFILES[input.profile];
  const { ranking, excluded } = rank(input);
  const legs = allocate(ranking, spec);
  const amounts = splitByWeight(input.amount, legs.map((l) => l.weight));
  const positions: Position[] = legs.map((l, i) => ({ ...l.candidate, reasons: [...l.candidate.reasons, ...l.reasons], weight: l.weight, amount: amounts[i] }));
  const lendingShare = positions.filter((p) => p.kind === "lending").reduce((a, p) => a + p.weight, 0);
  return { model: ALLOCATOR_MODEL, profile: spec, amount: input.amount, positions, excluded, ranking, lendingShare };
}

export type Holding = { kind: "vault" | "lending"; id: string; symbol: string; href: string; value: number };
export type Drift = { kind: "vault" | "lending"; id: string; symbol: string; href: string; held: number; target: number; move: "add" | "trim" | "exit" | "hold" };
/** Suggest a move when a position sits this many points away from its target weight. */
export const DRIFT_POINTS = 10;

/**
 * Compares what the wallet holds with what the model would propose for the
 * same total today. Nothing here moves funds: it only names the positions
 * that drifted from their target or fell out of the ranking.
 */
export function rebalance(holdings: Holding[], proposal: Proposal): { total: number; drifts: Drift[]; moves: number } {
  const held = holdings.filter((h) => h.value > 0);
  const total = held.reduce((a, h) => a + h.value, 0);
  const drifts: Drift[] = [];
  const seen = new Set<string>();
  for (const h of held) {
    const target = proposal.positions.find((p) => p.id === h.id)?.weight ?? 0;
    const heldW = total > 0 ? h.value / total : 0;
    const gap = (heldW - target) * 100;
    const move: Drift["move"] = target === 0 ? "exit" : gap > DRIFT_POINTS ? "trim" : gap < -DRIFT_POINTS ? "add" : "hold";
    drifts.push({ kind: h.kind, id: h.id, symbol: h.symbol, href: h.href, held: heldW, target, move });
    seen.add(h.id);
  }
  for (const p of proposal.positions) {
    if (seen.has(p.id)) continue;
    drifts.push({ kind: p.kind, id: p.id, symbol: p.symbol, href: p.href, held: 0, target: p.weight, move: p.weight * 100 > DRIFT_POINTS ? "add" : "hold" });
  }
  drifts.sort((a, b) => Math.abs(b.held - b.target) - Math.abs(a.held - a.target));
  return { total, drifts, moves: drifts.filter((d) => d.move !== "hold").length };
}

/** English rendering of a reason, for the API and the command line. The UI translates the same codes. */
export function describeReason(r: Reason): string {
  const p = r.params;
  switch (r.code) {
    case "apr":
      return `Realized fee APR ${p.apr}% over the last 24h`;
    case "aprShort":
      return `Fee APR ${p.apr}%, observed for only ${p.hours}h so far`;
    case "aprStale":
      return `Fee APR ${p.apr}% from a stale sample`;
    case "depth":
      return `$${Number(p.tvl).toLocaleString("en-US")} already in the position`;
    case "inRange":
      return `Price in range, ${p.pct}% of the way up`;
    case "nearEdge":
      return `Price near the edge of the range (${p.pct}%)`;
    case "outOfRange":
      return "Price out of range, not earning fees";
    case "oracleFresh":
      return `Chainlink reference ${p.hours}h old`;
    case "oracleStale":
      return `Chainlink reference ${p.hours}h old, past the 26h limit`;
    case "poolDrift":
      return `Pool price ${p.pct}% from the Chainlink reference`;
    case "rangeWidth":
      return `Range ${p.pct}% wide`;
    case "lendingNoExposure":
      return "USDG in, USDG out: no stock price exposure";
    case "lendingRate":
      return `Supply APR ${p.apr}% at ${p.util}% utilisation`;
    case "capped":
      return `Capped at ${p.pct}% of the total`;
    case "floor":
      return `Lending floor of ${p.pct}% for this profile`;
  }
}

export function describeExclusion(code: ExclusionCode): string {
  switch (code) {
    case "thin":
      return `Less than $${ALLOCATOR_TVL_FLOOR.toLocaleString("en-US")} in the vault`;
    case "closed":
      return "Deposits paused or vault in recovery";
    case "stale":
      return "Waiting for a fresh Chainlink reference; the vault fails closed until the feed updates";
    case "noApr":
      return "No fee APR sample yet";
    case "unreadable":
      return "Snapshot unavailable";
    case "lendingInactive":
      return "Market not active";
    case "lendingOracle":
      return "Lending oracle unavailable";
    case "router":
      return "Router cannot quote a deposit right now";
  }
}
