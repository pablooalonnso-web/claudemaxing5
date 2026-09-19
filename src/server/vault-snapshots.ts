import { formatUnits, type Address } from "viem";
import { managedPositionAbi, managedValuationAbi, managedVaultAbi, uniswapV3PoolAbi } from "@/lib/abis";
import { publicClient, USDG_ADDRESS } from "@/lib/chain";
import { directoryVaults, type VaultPin } from "@/lib/registry";
import type { ManagedState, VaultSnapshotRow, VaultSnapshotsResponse } from "@/lib/snapshot-types";
import { stockPriceAtTick } from "@/lib/vault-math";
import { recordAndEstimate } from "./fee-sampler";

const REFRESH_SECONDS = 15;
const CACHE_MS = 12_000;

type Cache = { at: number; data: VaultSnapshotsResponse; inflight?: Promise<VaultSnapshotsResponse> };
const g = globalThis as unknown as { __vaultSnapshotCache?: Cache };

/** Reads one managed vault's full state in a single multicall round-trip (plus two dependent ones). */
async function readVault(pin: VaultPin, now: number): Promise<VaultSnapshotRow> {
  const client = publicClient();
  const vault = pin.vault as Address;
  const entry = pin.preview;
  const base = { address: vault, abi: managedVaultAbi } as const;
  const stockIsToken1 = entry.token0.toLowerCase() === USDG_ADDRESS.toLowerCase();

  try {
    const [block, r] = await Promise.all([
      client.getBlock({ blockTag: "latest" }),
      client.multicall({
        allowFailure: false,
        contracts: [
          { ...base, functionName: "totalSupply" },
          { ...base, functionName: "entryOpen" },
          { ...base, functionName: "stopped" },
          { ...base, functionName: "recovery" },
          { ...base, functionName: "restartRequired" },
          { ...base, functionName: "epoch" },
          { ...base, functionName: "lower" },
          { ...base, functionName: "upper" },
          { ...base, functionName: "inventory" },
          { ...base, functionName: "idle" },
          { ...base, functionName: "position" },
          { ...base, functionName: "valuation" },
          { ...base, functionName: "grossFees", args: [0n] },
          { ...base, functionName: "grossFees", args: [1n] },
          { ...base, functionName: "buybackFees", args: [0n] },
          { ...base, functionName: "buybackFees", args: [1n] },
          { ...base, functionName: "caseOpened", args: [0n] },
          { ...base, functionName: "caseOpened", args: [1n] },
          { ...base, functionName: "recoveryEscrow", args: [0n] },
          { ...base, functionName: "recoveryEscrow", args: [1n] },
        ],
      }),
    ]);
    const [supply, open, stopped, recovery, restart, epoch, lower, upper, inventory, idle, position, valuation, g0, g1, b0, b1, c0, c1, e0, e1] = r;

    const [pending, pool, quote, value, feesValue, buybackValue] = await Promise.all([
      client.readContract({ address: position, abi: managedPositionAbi, functionName: "pendingFees" }),
      client.readContract({ address: position, abi: managedPositionAbi, functionName: "pool" }),
      client.readContract({ address: valuation, abi: managedValuationAbi, functionName: "quote" }).catch(() => null),
      client
        .readContract({ address: valuation, abi: managedValuationAbi, functionName: "value", args: [inventory[0], inventory[1]] })
        .then(async (v) => {
          // Pending (unclaimed) LP fees belong to the vault too.
          const p = await client.readContract({ address: position, abi: managedPositionAbi, functionName: "pendingFees" });
          return client.readContract({ address: valuation, abi: managedValuationAbi, functionName: "value", args: [inventory[0] + p[0], inventory[1] + p[1]] }).catch(() => v);
        })
        // The valuation reverts while the Chainlink reference is stale (markets closed). The vault then fails closed; report it as paused, not missing.
        .catch(() => null),
      client.readContract({ address: valuation, abi: managedValuationAbi, functionName: "value", args: [g0, g1] }).catch(() => null),
      client.readContract({ address: valuation, abi: managedValuationAbi, functionName: "value", args: [b0, b1] }).catch(() => null),
    ]);
    const [slot0, poolLiquidity, unclaimedValue] = await Promise.all([
      client.readContract({ address: pool, abi: uniswapV3PoolAbi, functionName: "slot0" }),
      client.readContract({ address: pool, abi: uniswapV3PoolAbi, functionName: "liquidity" }),
      client.readContract({ address: valuation, abi: managedValuationAbi, functionName: "value", args: [pending[0], pending[1]] }).catch(() => null),
    ]);

    const tick = slot0[1];
    const dec: [number, number] = stockIsToken1 ? [6, 18] : [18, 6];
    const symbols: [string, string] = stockIsToken1 ? ["USDG", pin.symbol] : [pin.symbol, "USDG"];
    const priceAt = (t: number) => stockPriceAtTick(t, stockIsToken1, dec[0], dec[1]);
    // When USDG is token0 a higher tick means a *lower* stock price, so the band flips.
    const lowerPrice = stockIsToken1 ? priceAt(upper) : priceAt(lower);
    const upperPrice = stockIsToken1 ? priceAt(lower) : priceAt(upper);
    const current = priceAt(tick);
    const inRange = tick >= lower && tick < upper;
    const hasLiquidity = poolLiquidity > 0n && (inventory[0] > 0n || inventory[1] > 0n);
    const status: "active" | "waiting" | "recovery" = recovery ? "recovery" : hasLiquidity ? "active" : "waiting";
    const observedAt = new Date(Number(block.timestamp) * 1000).toISOString();
    const assetsUsdg = value === null ? null : Number(formatUnits(value, 6));
    const grossFeesUsdg = feesValue === null ? null : Number(formatUnits(feesValue, 6)) + (unclaimedValue === null ? 0 : Number(formatUnits(unclaimedValue, 6)));
    const aprInfo = grossFeesUsdg === null || assetsUsdg === null ? null : await recordAndEstimate(vault, grossFeesUsdg, assetsUsdg, current, now);
    const idleAssets = stockIsToken1 ? idle[0] : idle[1];

    const managedState: ManagedState = {
      block: block.number.toString(),
      updated: Number(block.timestamp) * 1000,
      supply: supply.toString(),
      balance: "0",
      lower,
      upper,
      open,
      stopped,
      recovery,
      restart,
      epoch: epoch.toString(),
      price: slot0[0].toString(),
      tick,
      poolLiquidity: poolLiquidity.toString(),
      decimals: dec,
      symbols,
      cases: [c0, c1],
      fees: [g0.toString(), g1.toString()],
      pending: [pending[0].toString(), pending[1].toString()],
      inventory: [inventory[0].toString(), inventory[1].toString()],
      quote: quote
        ? { answer: quote.answer.toString(), decimals: quote.decimals, updatedAt: quote.updatedAt.toString(), roundId: quote.roundId.toString() }
        : null,
      value: value === null ? null : value.toString(),
      escrows: [e0 === "0x0000000000000000000000000000000000000000" ? null : e0, e1 === "0x0000000000000000000000000000000000000000" ? null : e1],
    };

    return {
      descriptor: { id: pin.id, kind: "managed", vault: pin.vault, managed: entry, public: true },
      snapshot: {
        observedAt,
        block: block.number.toString(),
        assets: value === null ? null : value.toString(),
        fees: feesValue === null ? null : feesValue.toString(),
        buyback: buybackValue === null ? null : buybackValue.toString(),
        holdings: {
          vault: pin.vault,
          block: block.number.toString(),
          observedAt,
          idleAssets: idleAssets.toString(),
          totalAssets: value === null ? null : value.toString(),
          positions: [
            {
              id: pool.toLowerCase(),
              pool: pool.toLowerCase(),
              stockToken: stockIsToken1 ? entry.token1 : entry.token0,
              adapter: position,
              symbol: entry.name,
              status,
              assets: value === null ? null : (value - (idleAssets > value ? value : idleAssets)).toString(),
              unclaimedFees: unclaimedValue === null ? null : unclaimedValue.toString(),
              targetWeightBps: 10_000,
              tokenId: null,
              positionManager: pool,
              lower: lowerPrice,
              upper: upperPrice,
              current,
              inRange,
              nextActionAt: null,
            },
          ],
        },
        rates: [],
        apr: aprInfo?.apr ?? null,
        aprAsOf: aprInfo?.asOf ?? observedAt,
        feeBps: entry.fee,
        vaultData: null,
        extras: {
          displayPriceAsOf: quote ? new Date(Number(quote.updatedAt) * 1000).toISOString() : null,
          totalSupply: supply.toString(),
          shareDecimals: 18,
          ownerShares: null,
          feeApr: aprInfo
            ? { source: "vault-fees-v1", windowHours: 24, observedSeconds: aprInfo.observedSeconds, asOf: aprInfo.asOf, stale: false }
            : null,
          managedState,
          buybackReserveCurrentUsd: buybackValue === null ? null : buybackValue.toString(),
        },
        tokenFees: [
          { token: entry.token0, gross: g0.toString(), buyback: b0.toString() },
          { token: entry.token1, gross: g1.toString(), buyback: b1.toString() },
        ],
        history: [],
        priceHistory: aprInfo?.priceHistory ?? [],
      },
      stale: false,
    };
  } catch (error) {
    console.error(`[snapshots] ${pin.symbol} read failed`, error instanceof Error ? error.message : error);
    return { descriptor: { id: pin.id, kind: "managed", vault: pin.vault, managed: entry, public: true }, snapshot: null, stale: true };
  }
}

async function fromUpstream(base: string): Promise<VaultSnapshotsResponse | null> {
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/v1/public/vaults`, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: number; data?: VaultSnapshotRow[]; refreshIntervalSeconds?: number };
    if (json.version !== 1 || !Array.isArray(json.data)) return null;
    return { version: 1, data: json.data, refreshIntervalSeconds: json.refreshIntervalSeconds ?? REFRESH_SECONDS, source: "upstream" };
  } catch {
    return null;
  }
}

async function build(): Promise<VaultSnapshotsResponse> {
  const upstream = process.env.UPSTREAM_API_URL;
  if (upstream) {
    const data = await fromUpstream(upstream);
    if (data) return data;
  }
  const now = Date.now();
  const pins = directoryVaults();
  // Read vaults in small groups so the public RPC is not hammered with 18 parallel bursts.
  const rows: VaultSnapshotRow[] = [];
  for (let i = 0; i < pins.length; i += 6) {
    rows.push(...(await Promise.all(pins.slice(i, i + 6).map((p) => readVault(p, now)))));
  }
  return { version: 1, data: rows, refreshIntervalSeconds: REFRESH_SECONDS, source: "onchain" };
}

/** Cached snapshot list (12s TTL, request-coalesced). */
export async function getVaultSnapshots(): Promise<VaultSnapshotsResponse> {
  const cache = g.__vaultSnapshotCache;
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.data;
  if (cache?.inflight) return cache.inflight;
  const inflight = build()
    .then((data) => {
      g.__vaultSnapshotCache = { at: Date.now(), data };
      return data;
    })
    .catch((e) => {
      if (cache) {
        cache.inflight = undefined;
        return { ...cache.data, data: cache.data.data.map((r) => ({ ...r, stale: true })) };
      }
      throw e;
    });
  g.__vaultSnapshotCache = { at: cache?.at ?? 0, data: cache?.data ?? { version: 1, data: [], refreshIntervalSeconds: REFRESH_SECONDS, source: "onchain" }, inflight };
  return inflight;
}

export async function getVaultSnapshot(address: string): Promise<VaultSnapshotRow | null> {
  const all = await getVaultSnapshots();
  return all.data.find((r) => r.descriptor.vault.toLowerCase() === address.toLowerCase()) ?? null;
}
