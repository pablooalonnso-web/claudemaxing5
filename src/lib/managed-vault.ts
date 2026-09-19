"use client";

import { encodeFunctionData, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { erc20Abi, managedPositionAbi, managedRouterAbi, managedValuationAbi, managedVaultAbi, uniswapV3PoolAbi } from "./abis";
import { publicClient } from "./chain";
import type { ManagedVaultRegistryEntry } from "./registry";
import { getSqrtRatioAtTick, slippageTick } from "./tick-math";

const lossLimitsAbi = parseAbi(["function lossLimits() view returns(uint16 swapLossBps,uint16 chunkLossBps,uint16 stageLossBps,uint16 slippageBps)"]);
const validatePoolAbi = parseAbi(["function validatePool() view"]);

const Q96 = 1n << 96n;
const MAX_UINT = (1n << 256n) - 1n;

export type LossLimits = { swapLossBps: number; chunkLossBps: number; stageLossBps: number; slippageBps: number };

export type ManagedLiveState = {
  block: bigint;
  updated: number;
  supply: bigint;
  balance: bigint;
  lower: number;
  upper: number;
  open: boolean;
  stopped: boolean;
  recovery: boolean;
  restart: boolean;
  epoch: bigint;
  price: bigint;
  tick: number;
  poolLiquidity: bigint;
  decimals: [number, number];
  symbols: [string, string];
  cases: [boolean, boolean];
  fees: [bigint, bigint];
  pending: [bigint, bigint] | null;
  inventory: [bigint, bigint] | null;
  quote: { answer: bigint; decimals: number; updatedAt: bigint; roundId: bigint } | null;
  value: bigint | null;
  lossLimits?: LossLimits;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Reads the vault's complete live state at one block. */
export async function readManagedState(entry: ManagedVaultRegistryEntry, owner?: Address, client: PublicClient = publicClient()): Promise<ManagedLiveState> {
  const block = await client.getBlock();
  const at = { blockNumber: block.number } as const;
  const vault = entry.vault as Address;
  const v = { address: vault, abi: managedVaultAbi, ...at } as const;
  const [supply, balance, lower, upper, open, stopped, recovery, restart, epoch, slot0, poolLiquidity, dec0, dec1, sym0, sym1, c0, c1, g0, g1] = await Promise.all([
    client.readContract({ ...v, functionName: "totalSupply" }),
    owner ? client.readContract({ ...v, functionName: "balanceOf", args: [owner] }) : Promise.resolve(0n),
    client.readContract({ ...v, functionName: "lower" }),
    client.readContract({ ...v, functionName: "upper" }),
    client.readContract({ ...v, functionName: "entryOpen" }),
    client.readContract({ ...v, functionName: "stopped" }),
    client.readContract({ ...v, functionName: "recovery" }),
    client.readContract({ ...v, functionName: "restartRequired" }),
    client.readContract({ ...v, functionName: "epoch" }),
    client.readContract({ address: entry.pool as Address, abi: uniswapV3PoolAbi, functionName: "slot0", ...at }),
    client.readContract({ address: entry.pool as Address, abi: uniswapV3PoolAbi, functionName: "liquidity", ...at }),
    client.readContract({ address: entry.token0 as Address, abi: erc20Abi, functionName: "decimals", ...at }),
    client.readContract({ address: entry.token1 as Address, abi: erc20Abi, functionName: "decimals", ...at }),
    client.readContract({ address: entry.token0 as Address, abi: erc20Abi, functionName: "symbol", ...at }),
    client.readContract({ address: entry.token1 as Address, abi: erc20Abi, functionName: "symbol", ...at }),
    client.readContract({ ...v, functionName: "caseOpened", args: [0n] }),
    client.readContract({ ...v, functionName: "caseOpened", args: [1n] }),
    client.readContract({ ...v, functionName: "grossFees", args: [0n] }),
    client.readContract({ ...v, functionName: "grossFees", args: [1n] }),
  ]);
  const [pending, inventory, lossLimitsRaw] = await Promise.all([
    client.readContract({ address: entry.position as Address, abi: managedPositionAbi, functionName: "pendingFees", ...at }).catch(() => null),
    client.readContract({ ...v, functionName: "inventory" }).catch(() => null),
    entry.version >= 6 ? client.readContract({ address: vault, abi: lossLimitsAbi, functionName: "lossLimits", ...at }).catch(() => null) : Promise.resolve(null),
  ]);
  const [quote, value] = await Promise.all([
    client.readContract({ address: entry.oracle as Address, abi: managedValuationAbi, functionName: "quote", ...at }).catch(() => null),
    inventory
      ? client
          .readContract({
            address: entry.oracle as Address,
            abi: managedValuationAbi,
            functionName: "value",
            args: [inventory[0] + (pending ? pending[0] - pending[0] / 10n - pending[0] / 5n : 0n), inventory[1] + (pending ? pending[1] - pending[1] / 10n - pending[1] / 5n : 0n)],
            ...at,
          })
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    block: block.number,
    updated: Date.now(),
    supply,
    balance,
    lower,
    upper,
    open,
    stopped,
    recovery,
    restart,
    epoch,
    price: slot0[0],
    tick: slot0[1],
    poolLiquidity,
    decimals: [dec0, dec1],
    symbols: [sym0, sym1],
    cases: [c0, c1],
    fees: [g0, g1],
    pending: pending ? [pending[0], pending[1]] : null,
    inventory: inventory ? [inventory[0], inventory[1]] : null,
    quote: quote ? { answer: quote.answer, decimals: quote.decimals, updatedAt: quote.updatedAt, roundId: quote.roundId } : null,
    value,
    lossLimits: lossLimitsRaw ? { swapLossBps: lossLimitsRaw[0], chunkLossBps: lossLimitsRaw[1], stageLossBps: lossLimitsRaw[2], slippageBps: lossLimitsRaw[3] } : undefined,
  };
}

/** sqrtPriceX96 limit for a swap that buys (or sells) the stock, bounded by the 30-minute TWAP. */
export async function swapSqrtLimit(entry: ManagedVaultRegistryEntry, downward: boolean, blockNumber: bigint, slippageBps: number | undefined, client: PublicClient) {
  const pool = entry.pool as Address;
  const [slot0, observed] = await Promise.all([
    client.readContract({ address: pool, abi: uniswapV3PoolAbi, functionName: "slot0", blockNumber }),
    client.readContract({ address: pool, abi: uniswapV3PoolAbi, functionName: "observe", args: [[1800, 0]], blockNumber }),
  ]);
  const delta = observed[0][1] - observed[0][0];
  let twap = delta / 1800n;
  if (delta < 0n && delta % 1800n !== 0n) twap -= 1n;
  const tick =
    slippageBps === undefined
      ? downward
        ? Math.max(Number(twap) - 100, slot0[1] - 50)
        : Math.min(Number(twap) + 100, slot0[1] + 50)
      : slippageTick(slot0[1], Number(twap), downward, slippageBps);
  return getSqrtRatioAtTick(tick);
}

export type DepositEntry = {
  budget: bigint;
  swap: { amount: bigint; minOut: bigint; sqrtLimit: bigint; route: Hex };
  join: {
    shares: bigint;
    bootstrapLiquidity: bigint;
    maximum0: bigint;
    maximum1: bigint;
    minShares: bigint;
    deadline: bigint;
    configuration: bigint;
    receiver: Address;
    acquire: boolean;
  };
};

export type DepositQuote = { entry: DepositEntry; shares: bigint; expires: number; quotedAt: number; gas?: bigint };

/**
 * Builds a router deposit for `budget` USDG: finds the share amount whose
 * required stock leg can be bought within the budget, then simulates it.
 */
export async function buildDepositQuote(entry: ManagedVaultRegistryEntry, owner: Address, budget: bigint, simulate = true, client: PublicClient = publicClient()): Promise<DepositQuote> {
  const quotedAt = Date.now();
  const state = await readManagedState(entry, owner, client);
  if (!state.open || state.stopped || state.recovery || state.restart) throw new Error("Deposits are paused");
  if (!state.quote || state.tick <= state.lower || state.tick >= state.upper) throw new Error("Waiting for valid prices and an active liquidity range");
  const usdgIsToken0 = same(entry.asset, entry.token0);
  const at = { blockNumber: state.block } as const;
  const v = { address: entry.vault as Address, abi: managedVaultAbi, ...at } as const;
  const oracle = { address: entry.oracle as Address, abi: managedValuationAbi, ...at } as const;
  const reference = state.supply === 0n ? state.poolLiquidity / 1000n : state.supply;
  const [, balance, refQuote, sqrtLimit] = await Promise.all([
    client.readContract({ address: entry.oracle as Address, abi: validatePoolAbi, functionName: "validatePool", ...at }),
    client.readContract({ address: entry.asset as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner], ...at }),
    client.readContract({ ...v, functionName: "quote", args: [state.supply === 0n ? 0n : reference, state.supply === 0n ? reference : 0n] }),
    swapSqrtLimit(entry, usdgIsToken0, state.block, state.lossLimits?.slippageBps, client),
  ]);
  if (balance < budget) throw new Error("Insufficient USDG balance");
  const refValue = await client.readContract({ ...oracle, functionName: "value", args: [refQuote[1], refQuote[2]] });
  if (refValue === 0n) throw new Error("Deposit quote unavailable");
  const safePool = (usdgIsToken0 ? (state.poolLiquidity * Q96) / state.price : (state.poolLiquidity * state.price) / Q96) / 100n;
  let shares = (reference * budget * 97n) / (refValue * 100n);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (shares <= 0n || (state.supply === 0n && (shares < BigInt(entry.minLiquidity) || shares >= 1n << 128n))) throw new Error("Amount is below the minimum for this pool");
    const q = await client.readContract({ ...v, functionName: "quote", args: [state.supply === 0n ? 0n : shares, state.supply === 0n ? shares : 0n] });
    const stockNeeded = usdgIsToken0 ? q[2] : q[1];
    const usdgNeeded = usdgIsToken0 ? q[1] : q[2];
    const stockValue = await client.readContract({ ...oracle, functionName: "value", args: usdgIsToken0 ? [0n, stockNeeded] : [stockNeeded, 0n] });
    const allowance = entry.version >= 6 ? BigInt(10_000 + entry.maxDeviationBps + (state.lossLimits?.slippageBps ?? 0)) : 101n;
    const allowanceBase = entry.version >= 6 ? 10_000n : 100n;
    const swapAmount = (((stockValue * 1_000_000n) / BigInt(1_000_000 - entry.fee) + 1n) * allowance) / allowanceBase + 1n;
    if (swapAmount > safePool) throw new Error("Amount exceeds the safe swap size for this pool");
    if (swapAmount + usdgNeeded > budget) {
      shares = (shares * 95n) / 100n;
      continue;
    }
    const deadline = (await client.getBlock()).timestamp + 180n;
    const depositEntry: DepositEntry = {
      budget,
      swap: { amount: swapAmount, minOut: stockNeeded, sqrtLimit, route: "0x" },
      join: {
        shares: state.supply === 0n ? 0n : shares,
        bootstrapLiquidity: state.supply === 0n ? shares : 0n,
        maximum0: MAX_UINT,
        maximum1: MAX_UINT,
        minShares: shares,
        deadline,
        configuration: state.epoch,
        receiver: owner,
        acquire: true,
      },
    };
    const quote: DepositQuote = { entry: depositEntry, shares, expires: Number(deadline) * 1000, quotedAt };
    if (!simulate) return quote;
    try {
      const gas = await client.estimateContractGas({ address: entry.router as Address, abi: managedRouterAbi, functionName: "deposit", args: [depositEntry], account: owner });
      return { ...quote, gas };
    } catch {
      shares = (shares * 95n) / 100n;
    }
  }
  throw new Error("A safe deposit quote is unavailable. Try a smaller amount.");
}

export type WithdrawQuote =
  | { kind: "tokens"; args: readonly [bigint, Address, Address, bigint, bigint, bigint]; amounts: readonly [bigint, bigint]; expires: number }
  | { kind: "usdg"; args: readonly [bigint, Address, bigint, bigint, bigint, { minOut: bigint; sqrtLimit: bigint; route: Hex }]; amount: bigint; expires: number };

/** Prepares a redemption: either both pool tokens, or USDG via the router's protected swap. */
export async function buildWithdrawQuote(entry: ManagedVaultRegistryEntry, owner: Address, shares: bigint, toUsdg: boolean, client: PublicClient = publicClient()): Promise<WithdrawQuote> {
  const state = await readManagedState(entry, owner, client);
  if (shares <= 0n || shares > state.balance) throw new Error("Enter an amount within your position");
  const deadline = (await client.getBlock()).timestamp + 180n;
  const vault = entry.vault as Address;
  if (!toUsdg) {
    const probe = await client.simulateContract({ address: vault, abi: managedVaultAbi, functionName: "redeem", args: [shares, owner, owner, 0n, 0n, deadline], account: owner });
    const args = [shares, owner, owner, (probe.result[0] * 99n) / 100n, (probe.result[1] * 99n) / 100n, deadline] as const;
    const sim = await client.simulateContract({ address: vault, abi: managedVaultAbi, functionName: "redeem", args, account: owner });
    return { kind: "tokens", args, amounts: sim.result, expires: Number(deadline) * 1000 };
  }
  if (state.value === null || !state.quote) throw new Error("USDG conversion is unavailable. You can still receive tokens.");
  const probe = await client.simulateContract({ address: vault, abi: managedVaultAbi, functionName: "redeem", args: [shares, owner, owner, 0n, 0n, deadline], account: owner, blockNumber: state.block });
  const stockIsToken0 = !same(entry.asset, entry.token0);
  const stockOut = stockIsToken0 ? probe.result[0] : probe.result[1];
  const usdgOut = stockIsToken0 ? probe.result[1] : probe.result[0];
  const stockValue = await client.readContract({ address: entry.oracle as Address, abi: managedValuationAbi, functionName: "value", args: stockIsToken0 ? [stockOut, 0n] : [0n, stockOut], blockNumber: state.block });
  const swapLoss = state.lossLimits?.swapLossBps ?? entry.maxSwapLossBps;
  const minOut = (stockValue * BigInt(10_000 - swapLoss) + 9_999n) / 10_000n;
  const minimum = state.lossLimits ? usdgOut + minOut : (((state.value * shares) / state.supply) * 98n) / 100n;
  const sqrtLimit = await swapSqrtLimit(entry, stockIsToken0, state.block, state.lossLimits?.slippageBps, client);
  const args = [shares, owner, minimum, deadline, state.epoch, { minOut, sqrtLimit, route: "0x" as Hex }] as const;
  try {
    const sim = await client.simulateContract({ address: entry.router as Address, abi: managedRouterAbi, functionName: "withdrawUSDG", args, account: owner, blockNumber: state.block });
    return { kind: "usdg", args, amount: sim.result, expires: Number(deadline) * 1000 };
  } catch {
    throw new Error("USDG conversion cannot safely fill this amount now. Receive tokens instead, or choose a smaller amount.");
  }
}

export const encodeApprove = (spender: Address, amount: bigint) => encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
export const encodeDeposit = (entry: DepositEntry) => encodeFunctionData({ abi: managedRouterAbi, functionName: "deposit", args: [entry] });
export const encodeWithdraw = (quote: WithdrawQuote) =>
  quote.kind === "tokens"
    ? encodeFunctionData({ abi: managedVaultAbi, functionName: "redeem", args: quote.args })
    : encodeFunctionData({ abi: managedRouterAbi, functionName: "withdrawUSDG", args: quote.args });

export type DepositStatusInfo = { label: string; tone: "open" | "paused" | "unknown"; blocked: boolean };

export function depositStatusOf(state: { open: boolean; stopped: boolean; recovery: boolean; restart: boolean; quote?: unknown } | null | undefined): DepositStatusInfo {
  if (!state) return { label: "Checking deposit status", tone: "unknown", blocked: false };
  if (state.recovery) return { label: "Recovery", tone: "paused", blocked: true };
  if (state.stopped) return { label: "Management paused", tone: "paused", blocked: true };
  if (state.restart) return { label: "Restart required", tone: "paused", blocked: true };
  // The vault fails closed without a fresh Chainlink reference (stock feeds stop at the market close).
  if ("quote" in state && state.quote === null) return { label: "Waiting for a fresh price reference", tone: "paused", blocked: true };
  return state.open ? { label: "Deposits open", tone: "open", blocked: false } : { label: "Deposits closed", tone: "paused", blocked: true };
}

export function describeTxError(error: unknown): string {
  const seen = new Set<unknown>();
  let cur: unknown = error;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const e = cur as { code?: number; name?: string; cause?: unknown };
    if (e.code === 4001 || e.name === "UserRejectedRequestError") return "The wallet request was declined. You can try again when ready.";
    cur = e.cause;
  }
  const msg = (error as { shortMessage?: string; message?: string })?.shortMessage || (error as { message?: string })?.message;
  return msg && msg.length < 220 ? msg : "The transaction check failed. Refresh the vault and try again. If your wallet already submitted a transaction, check its status first.";
}
