import Anthropic from "@anthropic-ai/sdk";
import { BRAND } from "@/lib/brand";
import { directoryVaults } from "@/lib/registry";
import type { VaultSnapshotRow } from "@/lib/snapshot-types";
import { getLendingMarkets, type LendingMarketRow } from "./lending";
import { getVaultSnapshots } from "./vault-snapshots";

/** Signals are recomputed at most this often; the written brief at most every BRIEF_MS. */
const SIGNALS_MS = 60_000;
const BRIEF_MS = 15 * 60_000;
const STOCK_FEED_FRESH_SECONDS = 26 * 3600;
const EDGE_FRACTION = 0.15;
const MODEL = process.env.INTELLIGENCE_MODEL ?? "claude-opus-5";

export type VaultSignal = {
  id: string;
  symbol: string;
  href: string;
  apr: number | null;
  observedSeconds: number | null;
  tvl: number | null;
  lifetimeFees: number | null;
  unclaimedFees: number | null;
  price: number | null;
  lower: number | null;
  upper: number | null;
  oraclePrice: number | null;
  oracleAgeSeconds: number | null;
  /** 0 at the lower bound, 1 at the upper bound, outside [0,1] when out of range. */
  rangePosition: number | null;
  rangeWidthPct: number | null;
  inRange: boolean | null;
  deposits: "open" | "paused" | "recovery";
  flags: string[];
};

export type Alert = { level: "watch" | "info"; symbol: string | null; text: string };

export type IntelligenceSignals = {
  generatedAt: string;
  block: string | null;
  totals: { tvl: number; lifetimeFees: number; open: number; nearEdge: number; outOfRange: number; staleOracle: number; withApr: number };
  lending: { name: string; state: string; supplied: number; borrowed: number; utilisationPct: number; borrowApr: number; supplyApr: number; oracle: boolean } | null;
  vaults: VaultSignal[];
  alerts: Alert[];
};

export type Brief = { text: string; watch: { symbol: string; note: string }[]; source: "rules" | "model"; model: string | null; generatedAt: string; signalsAt: string };

type Cache = { signals?: { at: number; data: IntelligenceSignals }; brief?: { at: number; data: Brief | null }; inflight?: Promise<Brief | null> };
const g = globalThis as unknown as { __intel?: Cache; __intelAsk?: Map<string, number[]>; __intelDay?: { day: string; n: number } };
const cache = (g.__intel ??= {});

const num = (v: string | null | undefined, decimals = 6) => (v === null || v === undefined ? null : Number(v) / 10 ** decimals);

function vaultSignal(row: VaultSnapshotRow, pin: { id: string; symbol: string; href: string }, now: number): VaultSignal {
  const s = row.snapshot;
  const m = s?.extras?.managedState;
  const pos = s?.holdings?.positions?.[0];
  const flags: string[] = [];
  if (!s || !m) {
    return { id: pin.id, symbol: pin.symbol, href: pin.href, apr: null, observedSeconds: null, tvl: null, lifetimeFees: null, unclaimedFees: null, price: null, lower: null, upper: null, oraclePrice: null, oracleAgeSeconds: null, rangePosition: null, rangeWidthPct: null, inRange: null, deposits: "paused", flags: ["unreadable"] };
  }
  const lower = pos?.lower ?? null;
  const upper = pos?.upper ?? null;
  const price = pos?.current ?? null;
  const rangePosition = lower !== null && upper !== null && price !== null && upper > lower ? (price - lower) / (upper - lower) : null;
  const rangeWidthPct = lower !== null && upper !== null && price ? ((upper - lower) / price) * 100 : null;
  const oraclePrice = m.quote ? Number(m.quote.answer) / 10 ** m.quote.decimals : null;
  const oracleAgeSeconds = m.quote ? Math.max(0, Math.floor(now / 1000) - Number(m.quote.updatedAt)) : null;
  const deposits: VaultSignal["deposits"] = m.recovery ? "recovery" : m.open && !m.stopped && !m.restart ? "open" : "paused";
  const inRange = pos?.inRange ?? null;
  let unclaimed: number | null = null;
  if (pos?.unclaimedFees) unclaimed = num(pos.unclaimedFees);
  const lifetimeFees = s.fees === null ? null : (num(s.fees) ?? 0) + (unclaimed ?? 0);
  if (inRange === false) flags.push("out of range");
  else if (rangePosition !== null && (rangePosition < EDGE_FRACTION || rangePosition > 1 - EDGE_FRACTION)) flags.push(rangePosition < EDGE_FRACTION ? "near lower bound" : "near upper bound");
  if (oracleAgeSeconds !== null && oracleAgeSeconds > STOCK_FEED_FRESH_SECONDS) flags.push("oracle stale");
  if (oraclePrice && price && Math.abs(price / oraclePrice - 1) > 0.01) flags.push(`pool ${((price / oraclePrice - 1) * 100).toFixed(1)}% vs oracle`);
  if (deposits !== "open") flags.push(`deposits ${deposits}`);
  if (m.cases[0] || m.cases[1]) flags.push("recovery case open");
  return {
    id: pin.id,
    symbol: pin.symbol,
    href: pin.href,
    apr: s.extras?.feeApr?.source === "vault-fees-v1" ? s.apr : null,
    observedSeconds: s.extras?.feeApr?.observedSeconds ?? null,
    tvl: num(s.assets),
    lifetimeFees,
    unclaimedFees: unclaimed,
    price,
    lower,
    upper,
    oraclePrice,
    oracleAgeSeconds,
    rangePosition,
    rangeWidthPct,
    inRange,
    deposits,
    flags,
  };
}

function lendingSignal(m: LendingMarketRow | undefined): IntelligenceSignals["lending"] {
  if (!m) return null;
  return {
    name: m.pin.name,
    state: m.contractState.name,
    supplied: Number(m.accounting.supplied) / 1e6,
    borrowed: Number(m.accounting.borrowed) / 1e6,
    utilisationPct: m.rates.utilizationBps / 100,
    borrowApr: Number(m.rates.borrowApr) / 1e18,
    supplyApr: Number(m.rates.supplyApr) / 1e18,
    oracle: m.oracle.available,
  };
}

export async function getSignals(): Promise<IntelligenceSignals> {
  if (cache.signals && Date.now() - cache.signals.at < SIGNALS_MS) return cache.signals.data;
  const now = Date.now();
  const [snapshots, lending] = await Promise.all([getVaultSnapshots(), getLendingMarkets().catch(() => null)]);
  const pins = directoryVaults();
  const vaults = pins.map((pin) => {
    const row = snapshots.data.find((r) => r.descriptor.vault.toLowerCase() === pin.vault.toLowerCase());
    return row ? vaultSignal(row, pin, now) : vaultSignal({ descriptor: { id: pin.id, kind: "managed", vault: pin.vault, public: true }, snapshot: null, stale: true }, pin, now);
  });
  const alerts: Alert[] = [];
  for (const v of vaults) {
    if (v.flags.includes("unreadable")) {
      alerts.push({ level: "info", symbol: v.symbol, text: `${v.symbol} could not be read at this block; it retries on the next pass.` });
      continue;
    }
    if (v.flags.includes("out of range")) alerts.push({ level: "watch", symbol: v.symbol, text: `${v.symbol} is out of its liquidity range; the position earns no fees until the keeper rebalances or price returns.` });
    else if (v.flags.some((f) => f.startsWith("near"))) alerts.push({ level: "watch", symbol: v.symbol, text: `${v.symbol} price sits ${(v.rangePosition! < 0.5 ? v.rangePosition! : 1 - v.rangePosition!) < 0.01 ? "under 1%" : `${Math.round((v.rangePosition! < 0.5 ? v.rangePosition! : 1 - v.rangePosition!) * 100)}%`} from the ${v.rangePosition! < 0.5 ? "lower" : "upper"} edge of its range.` });
    if (v.flags.includes("oracle stale")) alerts.push({ level: "watch", symbol: v.symbol, text: `${v.symbol} Chainlink feed is ${Math.round(v.oracleAgeSeconds! / 3600)} h old; price-dependent actions wait for a fresh round.` });
    if (v.deposits !== "open") alerts.push({ level: "info", symbol: v.symbol, text: `${v.symbol} deposits are ${v.deposits}.` });
    const dev = v.flags.find((f) => f.includes("vs oracle"));
    if (dev) alerts.push({ level: "info", symbol: v.symbol, text: `${v.symbol} pool trades ${dev.replace("pool ", "")}; the router's guard may hold deposits until they converge.` });
  }
  const ranked = vaults.filter((v) => v.apr !== null && (v.tvl ?? 0) >= 1000).sort((a, b) => b.apr! - a.apr!);
  if (ranked[0]) alerts.push({ level: "info", symbol: ranked[0].symbol, text: `${ranked[0].symbol} leads the fee ranking at ${(ranked[0].apr! * 100).toFixed(1)}% observed APR on $${Math.round(ranked[0].tvl!).toLocaleString("en-US")}.` });
  const data: IntelligenceSignals = {
    generatedAt: new Date(now).toISOString(),
    block: snapshots.data.find((r) => r.snapshot)?.snapshot?.block ?? null,
    totals: {
      tvl: vaults.reduce((a, v) => a + (v.tvl ?? 0), 0),
      lifetimeFees: vaults.reduce((a, v) => a + (v.lifetimeFees ?? 0), 0),
      open: vaults.filter((v) => v.deposits === "open").length,
      nearEdge: vaults.filter((v) => v.flags.some((f) => f.startsWith("near"))).length,
      outOfRange: vaults.filter((v) => v.inRange === false).length,
      staleOracle: vaults.filter((v) => v.flags.includes("oracle stale")).length,
      withApr: vaults.filter((v) => v.apr !== null).length,
    },
    lending: lendingSignal(lending?.data[0]),
    vaults,
    alerts,
  };
  cache.signals = { at: now, data };
  return data;
}


const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const readable = (s: IntelligenceSignals) => s.vaults.filter((v) => !v.flags.includes("unreadable"));
const edgeDistance = (v: VaultSignal) => (v.rangePosition === null ? null : Math.min(v.rangePosition, 1 - v.rangePosition));
const edgePct = (v: VaultSignal) => { const d = edgeDistance(v) ?? 0; return d < 0.01 ? "under 1%" : `${Math.round(d * 100)}%`; };

/**
 * The brief written by rules from the signals. No model, no network: every
 * sentence is a template filled with the numbers read a moment ago.
 */
export function composeBrief(s: IntelligenceSignals): Brief {
  const vs = readable(s);
  const unread = s.vaults.filter((v) => v.flags.includes("unreadable"));
  const open = vs.filter((v) => v.deposits === "open");
  const inRange = vs.filter((v) => v.inRange !== false);
  const ranked = vs.filter((v) => v.apr !== null && (v.tvl ?? 0) >= 1000).sort((a, b) => b.apr! - a.apr!);
  const near = vs.filter((v) => v.flags.some((f) => f.startsWith("near")) || v.inRange === false).sort((a, b) => (edgeDistance(a) ?? 1) - (edgeDistance(b) ?? 1));
  const stale = vs.filter((v) => v.flags.includes("oracle stale"));
  const paused = vs.filter((v) => v.deposits !== "open");
  const deviating = vs.filter((v) => v.flags.some((f) => f.includes("vs oracle")));
  const bigTvl = [...vs].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, 3);
  const parts: string[] = [];
  parts.push(`${open.length} of ${s.vaults.length} vaults are open for deposits and ${inRange.length} of the ${vs.length} readable ones are inside their liquidity range, holding ${money(s.totals.tvl)} in total.`);
  if (ranked.length) {
    const lead = ranked[0];
    parts.push(`${lead.symbol} leads the fee ranking at ${pct(lead.apr!)} observed APR on ${money(lead.tvl!)}${ranked[1] ? `, ahead of ${list(ranked.slice(1, 3).map((v) => `${v.symbol} at ${pct(v.apr!)}`))}` : ""}. The window behind each figure is short, so treat the order as a snapshot rather than a track record.`);
  }
  parts.push(`The deepest pools are ${list(bigTvl.map((v) => `${v.symbol} (${money(v.tvl ?? 0)})`))}.`);
  if (near.length) parts.push(`${list(near.map((v) => `${v.symbol}${v.inRange === false ? " is out of range" : ` sits ${edgePct(v)} from the ${v.rangePosition! < 0.5 ? "lower" : "upper"} edge`}`))}; a keeper rebalance follows when price leaves the band.`);
  else parts.push("No vault is within 15% of a range edge right now.");
  if (stale.length) parts.push(`${list(stale.map((v) => v.symbol))} ${stale.length === 1 ? "has" : "have"} a Chainlink feed older than 26 hours, so price-dependent actions there wait for a fresh round.`);
  if (deviating.length) parts.push(`${list(deviating.map((v) => `${v.symbol} (${v.flags.find((f) => f.includes("vs oracle"))!.replace("pool ", "")})`))} trade${deviating.length === 1 ? "s" : ""} away from the oracle price, which can make the router hold deposits until they converge.`);
  if (paused.length) parts.push(`Deposits are ${list([...new Set(paused.map((v) => v.deposits))])} on ${list(paused.map((v) => v.symbol))}.`);
  if (s.lending) parts.push(`Lending: the ${s.lending.name} market is ${s.lending.state.toLowerCase()} with ${money(s.lending.supplied)} supplied and ${money(s.lending.borrowed)} borrowed, ${s.lending.utilisationPct.toFixed(0)}% utilised, borrow ${pct(s.lending.borrowApr)} and supply ${pct(s.lending.supplyApr)}.`);
  if (unread.length) parts.push(`${list(unread.map((v) => v.symbol))} could not be read on this pass and will be retried.`);
  const watch: Brief["watch"] = [];
  for (const v of near.slice(0, 2)) watch.push({ symbol: v.symbol, note: v.inRange === false ? "Out of range: the position earns nothing until price returns or the keeper rebalances." : `${edgePct(v)} from the ${v.rangePosition! < 0.5 ? "lower" : "upper"} bound of its range.` });
  for (const v of stale.slice(0, 1)) if (watch.length < 3) watch.push({ symbol: v.symbol, note: `Feed ${Math.round(v.oracleAgeSeconds! / 3600)} h old; deposits and swaps through the router wait for a fresh round.` });
  for (const v of deviating.slice(0, 1)) if (watch.length < 3 && !watch.some((w) => w.symbol === v.symbol)) watch.push({ symbol: v.symbol, note: `Pool ${v.flags.find((f) => f.includes("vs oracle"))!.replace("pool ", "")}; the guard may hold deposits.` });
  if (watch.length < 3 && ranked[0] && !watch.some((w) => w.symbol === ranked[0].symbol)) watch.push({ symbol: ranked[0].symbol, note: `Top of the ranking at ${pct(ranked[0].apr!)} observed, on a ${(ranked[0].tvl ?? 0) < 5000 ? "small" : "deep"} pool.` });
  return { text: parts.join(" "), watch, source: "rules", model: null, generatedAt: s.generatedAt, signalsAt: s.generatedAt };
}

/** Questions the server can answer from the signals alone, for free. */
export const GUIDED_QUESTIONS = [
  { id: "edge", label: "Which vaults are closest to a range edge?" },
  { id: "ranking", label: "What is the fee ranking right now?" },
  { id: "fees", label: "Which vaults have earned the most fees so far?" },
  { id: "oracle", label: "Which Chainlink feeds are the oldest?" },
  { id: "paused", label: "Is anything paused or flagged?" },
  { id: "lending", label: "How is the lending market doing?" },
  { id: "size", label: "Where is the most liquidity?" },
] as const;
export type GuidedId = (typeof GUIDED_QUESTIONS)[number]["id"];

export function answerGuided(s: IntelligenceSignals, id: GuidedId): string {
  const vs = readable(s);
  switch (id) {
    case "edge": {
      const xs = vs.filter((v) => edgeDistance(v) !== null).sort((a, b) => edgeDistance(a)! - edgeDistance(b)!).slice(0, 4);
      if (!xs.length) return "No range data is readable right now.";
      return `Closest to an edge: ${list(xs.map((v) => `${v.symbol} at ${edgePct(v)} from its ${v.rangePosition! < 0.5 ? "lower" : "upper"} bound (price ${money(v.price ?? 0)} in a ${money(v.lower ?? 0)} to ${money(v.upper ?? 0)} range)`))}. Below 15% the vault is flagged; outside the range it stops earning until the keeper rebalances.`;
    }
    case "ranking": {
      const xs = vs.filter((v) => v.apr !== null).sort((a, b) => b.apr! - a.apr!).slice(0, 6);
      return `By observed fee APR: ${list(xs.map((v) => `${v.symbol} ${pct(v.apr!)} on ${money(v.tvl ?? 0)}${(v.tvl ?? 0) < 1000 ? " (thin pool)" : ""}`))}. Each rate annualises the fees seen over a window of ${Math.round((xs[0]?.observedSeconds ?? 0) / 60)} minutes or so, so it moves quickly and is not a forecast.`;
    }
    case "fees": {
      const xs = vs.filter((v) => v.lifetimeFees !== null).sort((a, b) => b.lifetimeFees! - a.lifetimeFees!).slice(0, 5);
      return `Gross trading fees since launch: ${list(xs.map((v) => `${v.symbol} $${v.lifetimeFees!.toFixed(2)}`))}. Across all vaults that is ${money(s.totals.lifetimeFees)}; 70% of claimed fees stays with vault participants, 20% funds the buyback and 10% goes to the treasury.`;
    }
    case "oracle": {
      const xs = vs.filter((v) => v.oracleAgeSeconds !== null).sort((a, b) => b.oracleAgeSeconds! - a.oracleAgeSeconds!).slice(0, 4);
      const fresh = vs.filter((v) => v.oracleAgeSeconds !== null).sort((a, b) => a.oracleAgeSeconds! - b.oracleAgeSeconds!)[0];
      return `Oldest feeds: ${list(xs.map((v) => `${v.symbol} ${(v.oracleAgeSeconds! / 3600).toFixed(1)} h`))}. Freshest: ${fresh ? `${fresh.symbol} ${Math.round(fresh.oracleAgeSeconds! / 60)} min` : "none"}. Stock feeds pause when markets are closed; the guard treats anything older than 26 hours as stale and holds price-dependent actions.`;
    }
    case "paused": {
      const flagged = vs.filter((v) => v.flags.length);
      const unread = s.vaults.filter((v) => v.flags.includes("unreadable"));
      if (!flagged.length && !unread.length) return "Nothing is paused or flagged. Every readable vault is open, inside its range, with a fresh feed.";
      return `${flagged.length ? `Flagged: ${list(flagged.map((v) => `${v.symbol} (${v.flags.join(", ")})`))}.` : "Nothing is flagged."}${unread.length ? ` ${list(unread.map((v) => v.symbol))} could not be read on this pass.` : ""}`;
    }
    case "lending": {
      if (!s.lending) return "The lending market could not be read on this pass.";
      const l = s.lending;
      return `${l.name} is ${l.state.toLowerCase()}: ${money(l.supplied)} supplied, ${money(l.borrowed)} borrowed, ${l.utilisationPct.toFixed(1)}% utilised. Borrowers pay ${pct(l.borrowApr)} and suppliers receive ${pct(l.supplyApr)}, both variable with utilisation. The oracle is ${l.oracle ? "available" : "unavailable"}.`;
    }
    case "size": {
      const xs = [...vs].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, 5);
      return `Largest vaults by assets: ${list(xs.map((v) => `${v.symbol} ${money(v.tvl ?? 0)}`))}, out of ${money(s.totals.tvl)} across all 18. Vaults under $1,000 are left out of the basket ranking because their fee rate is too noisy to act on.`;
    }
  }
}

export const analystOnline = () => Boolean(process.env.ANTHROPIC_API_KEY);

const SYSTEM = `You are the ${BRAND.name} analyst. ${BRAND.name} runs 18 managed liquidity vaults for tokenized stocks on Robinhood Chain (one vault per stock, paired with USDG), a USDG lending market backed by META vault shares, and a basket strategy. You receive a JSON snapshot of live signals read from the chain a moment ago.

Rules:
- Use only the numbers in the snapshot. Never invent figures, events, or news. If something is not in the data, say it is not observed.
- Fee APR is an observation of past pool fees over the stated window; call it an observation, never a yield or a forecast.
- Vault shares carry full stock price exposure. Do not recommend deposits, withdrawals, or trades, and do not give financial advice. Describe, compare, and explain.
- Plain English, short sentences, no hype, no emojis, no markdown headers.`;

function compactSignals(s: IntelligenceSignals) {
  return {
    generatedAt: s.generatedAt,
    block: s.block,
    totals: s.totals,
    lending: s.lending,
    vaults: s.vaults.map((v) => ({
      symbol: v.symbol,
      feeAprObserved: v.apr === null ? null : Number((v.apr * 100).toFixed(1)),
      observedWindowMinutes: v.observedSeconds === null ? null : Math.round(v.observedSeconds / 60),
      tvlUsd: v.tvl === null ? null : Math.round(v.tvl),
      lifetimeFeesUsd: v.lifetimeFees === null ? null : Number(v.lifetimeFees.toFixed(2)),
      price: v.price,
      range: v.lower !== null && v.upper !== null ? [v.lower, v.upper] : null,
      rangePosition: v.rangePosition === null ? null : Number(v.rangePosition.toFixed(2)),
      oracleAgeMinutes: v.oracleAgeSeconds === null ? null : Math.round(v.oracleAgeSeconds / 60),
      deposits: v.deposits,
      flags: v.flags,
    })),
  };
}

function extractJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** The written brief, regenerated at most every 15 minutes. Null when the analyst is offline or the call fails. */
export async function getBrief(): Promise<Brief | null> {
  if (!analystOnline()) return null;
  if (cache.brief && Date.now() - cache.brief.at < BRIEF_MS) return cache.brief.data;
  if (cache.inflight) return cache.inflight;
  cache.inflight = (async () => {
    try {
      const signals = await getSignals();
      const client = new Anthropic();
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `Write the ${BRAND.name} brief for right now from this snapshot. Return JSON only, shaped {"summary": string, "watch": [{"symbol": string, "note": string}]}. The summary is 110 to 160 words: state of the vaults as a whole, the fee ranking, anything near a range edge or paused, and the lending market. "watch" holds up to three items worth a look, each note under 25 words.\n\n${JSON.stringify(compactSignals(signals))}`,
          },
        ],
      });
      if (res.stop_reason === "refusal") return null;
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      const parsed = extractJson(text) as { summary?: string; watch?: { symbol?: string; note?: string }[] } | null;
      if (!parsed?.summary) return null;
      const brief: Brief = {
        text: parsed.summary.trim(),
        watch: (parsed.watch ?? []).filter((w) => w?.symbol && w?.note).slice(0, 3).map((w) => ({ symbol: String(w.symbol), note: String(w.note) })),
        source: "model",
        model: res.model,
        generatedAt: new Date().toISOString(),
        signalsAt: signals.generatedAt,
      };
      cache.brief = { at: Date.now(), data: brief };
      return brief;
    } catch (e) {
      console.error("intelligence brief failed", e instanceof Error ? e.message : e);
      cache.brief = { at: Date.now() - BRIEF_MS + 60_000, data: cache.brief?.data ?? null }; // retry in a minute, keep the last one
      return cache.brief.data;
    } finally {
      cache.inflight = undefined;
    }
  })();
  return cache.inflight;
}

const ASK_PER_HOUR = 20;
const ASK_PER_DAY_GLOBAL = 600;

export function askAllowed(ip: string): boolean {
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const daily = (g.__intelDay ??= { day, n: 0 });
  if (daily.day !== day) {
    daily.day = day;
    daily.n = 0;
  }
  if (daily.n >= ASK_PER_DAY_GLOBAL) return false;
  const map: Map<string, number[]> = (g.__intelAsk ??= new Map<string, number[]>());
  const recent = (map.get(ip) ?? []).filter((t: number) => now - t < 3_600_000);
  if (recent.length >= ASK_PER_HOUR) return false;
  recent.push(now);
  map.set(ip, recent);
  daily.n += 1;
  return true;
}

/** One grounded answer, no memory between questions. */
export async function ask(question: string): Promise<{ answer: string; model: string; signalsAt: string }> {
  const signals = await getSignals();
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    output_config: { effort: "low" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Live snapshot:\n${JSON.stringify(compactSignals(signals))}\n\nA visitor asks: "${question.replace(/"/g, "'")}"\n\nAnswer in at most 120 words of plain text. If the question asks what to do with money, explain the relevant mechanics and observed numbers instead of recommending an action. If it is unrelated to ${BRAND.name}, say so briefly.`,
      },
    ],
  });
  if (res.stop_reason === "refusal") return { answer: "I cannot answer that one. Ask about the vaults, the lending market or the strategies.", model: res.model, signalsAt: signals.generatedAt };
  const answer = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return { answer: answer || "No answer came back. Try rephrasing.", model: res.model, signalsAt: signals.generatedAt };
}
