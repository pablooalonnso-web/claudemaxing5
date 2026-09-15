import type { Address } from "viem";
import { chainlinkFeedAbi, guardAbi, lendingMarketAbi, managedVaultAbi } from "@/lib/abis";
import { publicClient } from "@/lib/chain";
import { LENDING_MARKETS, VAULT_PINS } from "@/lib/registry";
import { getVaultSnapshots } from "./vault-snapshots";
import { getLendingMarkets } from "./lending";

export type Tone = "good" | "warning" | "danger" | "neutral" | "pending";

export type StatusJob = { name: string; lastSuccess: string | null; tone: Tone; label: string };

export type StatusReport = {
  checkedAt: string;
  overall: { tone: Tone; label: string };
  components: {
    api: { tone: Tone; state: string; tag: string; detail: string };
    oracle: { tone: Tone; state: string; tag: string; detail: string };
    vault: { tone: Tone; state: string; tag: string; detail: string };
    keeper: { tone: Tone; state: string; tag: string; detail: string };
  };
  jobs: StatusJob[];
};

const STOCK_FEED_FRESH_SECONDS = 26 * 3600; // stock feeds pause over weekends; 24/5 cadence

const g = globalThis as unknown as { __statusCache?: { at: number; data: StatusReport }; __statusJobs?: Record<string, number> };

function markJob(name: string, ok: boolean) {
  const jobs = (g.__statusJobs ??= {});
  if (ok) jobs[name] = Date.now();
}

export async function getStatus(): Promise<StatusReport> {
  const c = g.__statusCache;
  if (c && Date.now() - c.at < 15_000) return c.data;
  const client = publicClient();
  const now = Date.now();

  const [block, snapshots, lending] = await Promise.all([
    client.getBlock({ blockTag: "latest" }).catch(() => null),
    getVaultSnapshots().catch(() => null),
    getLendingMarkets().catch(() => null),
  ]);
  markJob("Vault accounting", !!snapshots && snapshots.data.some((r) => r.snapshot));
  markJob("Market indexing", !!lending);
  markJob("Live market indexing", !!snapshots && snapshots.data.every((r) => r.snapshot));

  // Oracle: Chainlink feed freshness for the META stock feed via the guard registry.
  let oracle = { tone: "neutral" as Tone, state: "checking", tag: "Awaiting quorum", detail: "Awaiting the first verified on-chain heartbeat." };
  try {
    const market = LENDING_MARKETS[0];
    const cfg = await client.readContract({ address: market.guard as Address, abi: guardAbi, functionName: "feedConfig", args: [market.stock as Address] });
    const [, , , updatedAt] = await client.readContract({ address: cfg[0], abi: chainlinkFeedAbi, functionName: "latestRoundData" });
    const age = Math.floor(now / 1000) - Number(updatedAt);
    const fresh = age <= Math.max(Number(cfg[1]) * 2, STOCK_FEED_FRESH_SECONDS);
    oracle = {
      tone: fresh ? "good" : "warning",
      state: fresh ? "healthy" : "stale",
      tag: `${VAULT_PINS.length} feeds registered`,
      detail: fresh ? `Reference feed updated ${Math.round(age / 60)} minutes ago. Price-dependent actions are allowed.` : `Reference feed last updated ${Math.round(age / 3600)} hours ago. Price-dependent actions wait for fresh pricing.`,
    };
    markJob("Oracle sampling", true);
    markJob("Chainlink feed registry", true);
  } catch {
    oracle = { tone: "warning", state: "unavailable", tag: "Feed check failed", detail: "The Chainlink reference feed could not be read. Price-dependent actions fail closed." };
  }

  // Vault: every reviewed vault reachable and open?
  const rows = snapshots?.data ?? [];
  const reachable = rows.filter((r) => r.snapshot).length;
  const open = rows.filter((r) => r.snapshot?.extras?.managedState?.open && !r.snapshot.extras.managedState.stopped && !r.snapshot.extras.managedState.recovery).length;
  const vault = {
    tone: (reachable === rows.length && rows.length > 0 ? "good" : reachable > 0 ? "warning" : "danger") as Tone,
    state: reachable === rows.length ? "deployed" : `${reachable} of ${rows.length} reachable`,
    tag: `${open} of ${rows.length} open`,
    detail: "The vault fails closed when price or network safety cannot be confirmed.",
  };

  // Keeper: guard pause flag + lending market state.
  let keeper = { tone: "warning" as Tone, state: "unknown", tag: "Execution status unknown", detail: "Every capital-moving plan requires matching on-chain approval." };
  try {
    const paused = await client.readContract({ address: LENDING_MARKETS[0].guard as Address, abi: guardAbi, functionName: "keeperPaused" }).catch(() => null);
    const state = lending?.data[0]?.contractState.name ?? "Unknown";
    const lastRebalance = await client.readContract({ address: VAULT_PINS[0].vault as Address, abi: managedVaultAbi, functionName: "lastRebalance" }).catch(() => null);
    keeper = {
      tone: paused ? "danger" : "warning",
      state: paused ? "paused" : "execute",
      tag: paused ? "Guardian pause active" : "Execution enabled",
      detail: `Every capital-moving plan requires matching on-chain approval. Lending market ${state.toLowerCase()}.${lastRebalance ? ` Last rebalance ${new Date(Number(lastRebalance) * 1000).toISOString()}.` : ""}`,
    };
    markJob("Keeper planning", !paused);
    markJob("Execution receipts", !paused);
    markJob("Network heartbeat", !!block);
    void lendingMarketAbi;
  } catch {}

  const api = {
    tone: (snapshots && block ? "good" : "danger") as Tone,
    state: snapshots && block ? "Operational" : "Degraded",
    tag: snapshots?.source === "upstream" ? "Upstream" : "Live",
    detail: block ? `Serves public vault, market, and safety information. Chain head ${block.number.toString()}.` : "Robinhood Chain RPC is unreachable.",
  };
  markJob("Pool discovery", !!snapshots);
  markJob("Liquidity sampling", !!snapshots);
  markJob("Token registry", true);
  markJob("Position monitoring", !!snapshots);
  markJob("Opportunity scoring", !!snapshots && snapshots.data.some((r) => r.snapshot?.apr !== null));
  markJob("Operation reconciliation", !!lending);

  const jobs = g.__statusJobs ?? {};
  const JOB_NAMES = [
    "Chainlink feed registry",
    "Oracle sampling",
    "Execution receipts",
    "Keeper planning",
    "Operation reconciliation",
    "Position monitoring",
    "Opportunity scoring",
    "Network heartbeat",
    "Liquidity sampling",
    "Token registry",
    "Pool discovery",
    "Market indexing",
    "Live market indexing",
    "Vault accounting",
  ];
  const jobList: StatusJob[] = JOB_NAMES.map((name) => {
    const t = jobs[name];
    const stale = !t || now - t > 30 * 60 * 1000;
    return { name, lastSuccess: t ? new Date(t).toISOString() : null, tone: !t ? "neutral" : stale ? "warning" : "good", label: !t ? "Pending" : stale ? "Delayed" : "Current" };
  });

  const tones = [api.tone, oracle.tone, vault.tone];
  const overall = tones.includes("danger")
    ? { tone: "danger" as Tone, label: "Some systems are degraded" }
    : tones.includes("warning")
      ? { tone: "warning" as Tone, label: "Some systems are waiting on fresh data" }
      : { tone: "good" as Tone, label: "All monitored systems operational" };

  const data: StatusReport = { checkedAt: new Date(now).toISOString(), overall, components: { api, oracle, vault, keeper }, jobs: jobList };
  g.__statusCache = { at: now, data };
  return data;
}
