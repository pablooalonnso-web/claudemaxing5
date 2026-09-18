import type { Address } from "viem";
import { lendingLimitsAbi, lendingMarketAbi, lendingValuationAbi } from "@/lib/abis";
import { publicClient } from "@/lib/chain";
import { LENDING_MARKETS, type LendingMarketPin } from "@/lib/registry";

export type LendingMarketRow = {
  schemaVersion: 2;
  pinId: string;
  pin: LendingMarketPin;
  chainId: number;
  block: { number: string; timestamp: string };
  tokens: { usdg: { address: string; decimals: number }; stock: { address: string; decimals: number } };
  contractState: { ordinal: number; name: string };
  rates: { borrowApr: string; supplyApr: string; utilizationBps: number };
  config: {
    maxLtvBps: string;
    liquidationThresholdBps: string;
    bonusBps: string;
    closeFactorBps: string;
    reserveFactorBps: string;
    concentrationBps: string;
    supplyCap: string;
    borrowCap: string;
    minDebt: string;
    kink: string;
    baseApr: string;
    slope1Apr: string;
    slope2Apr: string;
    fullLiquidationHf: string;
  };
  limits: { maxLtvBps: string; concentrationBps: string; supplyCap: string; borrowCap: string } | null;
  accounting: { supplied: string; borrowed: string; cash: string; reserve: string; interest: string; totalCollateral: string; totalSupplyShares: string; totalBorrowShares: string };
  oracle: { available: boolean; failureOrdinal: number; selector: string };
  valuation: { price: string; configuration: string } | null;
  lastAccrual: string;
  counts: { collateralAccounts: string; borrowerAccounts: string; unsettledAccounts: string };
  badDebt: string;
  recoveryStarted: boolean;
};

export type LendingMarketsResponse = { schemaVersion: 2; configured: true; data: LendingMarketRow[] };

const STATE_NAMES = ["Active", "Paused", "Closed", "Recovery"];
const WAD = 10n ** 18n;

/** Lender APR = borrow APR × utilisation × (1 − reserve factor). */
export function supplyRate(borrowApr: bigint, borrowed: bigint, cash: bigint, reserveFactorBps: bigint): bigint {
  const total = borrowed + cash;
  if (total === 0n) return 0n;
  return (((borrowed * WAD) / total) * borrowApr) / WAD * (10_000n - reserveFactorBps) / 10_000n;
}

async function readMarket(pin: LendingMarketPin): Promise<LendingMarketRow> {
  const client = publicClient();
  const base = { address: pin.market as Address, abi: lendingMarketAbi } as const;
  const [block, r] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    client.multicall({
      allowFailure: false,
      contracts: [
        { ...base, functionName: "state" },
        { ...base, functionName: "totals" },
        { ...base, functionName: "totalSupplyAssets" },
        { ...base, functionName: "cash" },
        { ...base, functionName: "borrowApr" },
        { ...base, functionName: "config" },
        { ...base, functionName: "totalCollateral" },
        { ...base, functionName: "oracleStatus" },
        { ...base, functionName: "lastAccrual" },
        { ...base, functionName: "totalSupplyShares" },
        { ...base, functionName: "totalBorrowShares" },
        { ...base, functionName: "collateralAccounts" },
        { ...base, functionName: "borrowerAccounts" },
        { ...base, functionName: "unsettledAccounts" },
        { ...base, functionName: "badDebt" },
        { ...base, functionName: "recoveryStarted" },
      ],
    }),
  ]);
  const [state, totals, supplied, cash, borrowApr, cfg, totalCollateral, oracle, lastAccrual, tss, tbs, collateralAccounts, borrowerAccounts, unsettled, badDebt, recoveryStarted] = r;
  const [limits, valuation] = await Promise.all([
    client.readContract({ address: pin.market as Address, abi: lendingLimitsAbi, functionName: "currentLimits" }).catch(() => null),
    client.readContract({ address: pin.adapter as Address, abi: lendingValuationAbi, functionName: "price" }).catch(() => null),
  ]);
  const borrowed = totals[0];
  const utilization = supplied === 0n ? 0 : Number((borrowed * 10_000n) / supplied);
  return {
    schemaVersion: 2,
    pinId: pin.id,
    pin,
    chainId: pin.chainId,
    block: { number: block.number.toString(), timestamp: block.timestamp.toString() },
    tokens: { usdg: { address: pin.usdg, decimals: 6 }, stock: { address: pin.stock, decimals: 18 } },
    contractState: { ordinal: state, name: STATE_NAMES[state] ?? `State ${state}` },
    rates: { borrowApr: borrowApr.toString(), supplyApr: supplyRate(borrowApr, borrowed, cash, cfg[4]).toString(), utilizationBps: utilization },
    config: {
      maxLtvBps: cfg[0].toString(),
      liquidationThresholdBps: cfg[1].toString(),
      bonusBps: cfg[2].toString(),
      closeFactorBps: cfg[3].toString(),
      reserveFactorBps: cfg[4].toString(),
      concentrationBps: cfg[5].toString(),
      supplyCap: cfg[6].toString(),
      borrowCap: cfg[7].toString(),
      minDebt: cfg[8].toString(),
      kink: cfg[9].toString(),
      baseApr: cfg[10].toString(),
      slope1Apr: cfg[11].toString(),
      slope2Apr: cfg[12].toString(),
      fullLiquidationHf: cfg[13].toString(),
    },
    limits: limits ? { maxLtvBps: limits[0].toString(), concentrationBps: limits[1].toString(), supplyCap: limits[2].toString(), borrowCap: limits[3].toString() } : null,
    accounting: {
      supplied: supplied.toString(),
      borrowed: borrowed.toString(),
      cash: cash.toString(),
      reserve: totals[1].toString(),
      interest: totals[2].toString(),
      totalCollateral: totalCollateral.toString(),
      totalSupplyShares: tss.toString(),
      totalBorrowShares: tbs.toString(),
    },
    oracle: { available: oracle[0], failureOrdinal: oracle[1], selector: oracle[2] },
    valuation: valuation ? { price: valuation[0].toString(), configuration: valuation[1].toString() } : null,
    lastAccrual: lastAccrual.toString(),
    counts: { collateralAccounts: collateralAccounts.toString(), borrowerAccounts: borrowerAccounts.toString(), unsettledAccounts: unsettled.toString() },
    badDebt: badDebt.toString(),
    recoveryStarted,
  };
}

const CACHE_MS = 10_000;
const g = globalThis as unknown as { __lendingCache?: { at: number; data: LendingMarketsResponse } };

export async function getLendingMarkets(): Promise<LendingMarketsResponse> {
  const c = g.__lendingCache;
  if (c && Date.now() - c.at < CACHE_MS) return c.data;
  const data: LendingMarketsResponse = { schemaVersion: 2, configured: true, data: await Promise.all(LENDING_MARKETS.map(readMarket)) };
  g.__lendingCache = { at: Date.now(), data };
  return data;
}

export type LendingPosition = {
  schemaVersion: 2;
  pinId: string;
  owner: string;
  block: string;
  supplyShares: string;
  suppliedValue: string;
  collateralShares: string;
  collateralValue: string;
  debt: string;
  claim: string;
  healthFactor: number | null;
  maxBorrow: string;
};

export async function getLendingPosition(pin: LendingMarketPin, owner: Address): Promise<LendingPosition> {
  const client = publicClient();
  const base = { address: pin.market as Address, abi: lendingMarketAbi } as const;
  const [block, r, market] = await Promise.all([
    client.getBlockNumber(),
    client.multicall({
      allowFailure: false,
      contracts: [
        { ...base, functionName: "supplyShares", args: [owner] },
        { ...base, functionName: "collateralShares", args: [owner] },
        { ...base, functionName: "debtOf", args: [owner] },
        { ...base, functionName: "claimOf", args: [owner] },
      ],
    }),
    getLendingMarkets().then((m) => m.data.find((x) => x.pinId === pin.id)!),
  ]);
  const [supplyShares, collateralShares, debt, claim] = r;
  const tss = BigInt(market.accounting.totalSupplyShares);
  const suppliedValue = tss === 0n ? 0n : (supplyShares * BigInt(market.accounting.supplied)) / tss;
  const price = market.valuation ? BigInt(market.valuation.price) : 0n; // USDG (6dp) per 1e18 shares, scaled 1e18
  const collateralValue = (collateralShares * price) / WAD;
  const ltv = BigInt(market.config.maxLtvBps);
  const lt = BigInt(market.config.liquidationThresholdBps);
  const maxBorrow = (collateralValue * ltv) / 10_000n;
  const healthFactor = debt === 0n ? null : Number((collateralValue * lt * 1_000_000n) / (10_000n * debt)) / 1e6;
  return {
    schemaVersion: 2,
    pinId: pin.id,
    owner,
    block: block.toString(),
    supplyShares: supplyShares.toString(),
    suppliedValue: suppliedValue.toString(),
    collateralShares: collateralShares.toString(),
    collateralValue: collateralValue.toString(),
    debt: debt.toString(),
    claim: claim.toString(),
    healthFactor,
    maxBorrow: (maxBorrow > debt ? maxBorrow - debt : 0n).toString(),
  };
}
