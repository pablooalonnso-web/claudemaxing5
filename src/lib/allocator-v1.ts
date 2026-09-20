"use client";

import { encodeFunctionData, formatUnits, type Abi, type Address, type Hex, type PublicClient } from "viem";
import artifact from "@/data/allocator-v1.artifact.json";
import deployed from "@/data/allocator-v1.json";
import { managedValuationAbi, managedVaultAbi } from "./abis";
import { publicClient, USDG_ADDRESS } from "./chain";
import { buildDepositQuote, readManagedState, swapSqrtLimit, type DepositEntry } from "./managed-vault";
import { MANAGED_VAULTS, type ManagedVaultRegistryEntry, type VaultPin } from "./registry";

export const allocatorV1Abi = artifact.abi as Abi;
export const allocatorV1Bytecode = artifact.bytecode as Hex;
export const allocatorV1Artifact = { compiler: artifact.compiler, settings: artifact.settings, sourceSha256: artifact.sourceSha256, runtime: artifact.deployedBytecode as Hex };

/** Launch parameters: small cap, 0.30% deposit fee, at most 35% in any one vault. */
export const ALLOCATOR_V1_LAUNCH = { depositCap: 2_500_000_000n, depositFeeBps: 30, maxWeightBps: 3500, minTargetAssets: 1_000_000_000n } as const;

export type AllocatorV1Config = { chainId: number; address: string | null; deployedBlock: string | null; deployedTransaction: string | null };
export const ALLOCATOR_V1: AllocatorV1Config = deployed as AllocatorV1Config;

/** The configured address, or a `?allocator=0x…` override so a fresh deployment can be inspected before it is committed. */
export function allocatorV1Address(): Address | null {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("allocator");
    if (q && /^0x[0-9a-fA-F]{40}$/.test(q)) return q as Address;
  }
  return (ALLOCATOR_V1.address as Address | null) ?? null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export type AllocatorTarget = { vault: Address; entry: ManagedVaultRegistryEntry; symbol: string; enabled: boolean; writtenOff: boolean; maxWeightBps: number; shares: bigint; value: bigint | null };

export type AllocatorV1State = {
  address: Address;
  block: bigint;
  owner: Address;
  keeper: Address;
  guardian: Address;
  treasury: Address;
  paused: boolean;
  depositCap: bigint;
  depositFeeBps: number;
  minTargetAssets: bigint;
  maxLossBps: number;
  maxDailyLossBps: number;
  dailyLoss: bigint;
  totalSupply: bigint;
  idle: bigint;
  /** Null while any held target cannot be priced (stale reference): deposits are then refused by the contract. */
  totalAssets: bigint | null;
  pricePerShare: bigint | null;
  targets: AllocatorTarget[];
  codeMatches: boolean;
};

export async function readAllocatorV1(address: Address, pins: VaultPin[], client: PublicClient = publicClient()): Promise<AllocatorV1State> {
  const c = { address, abi: allocatorV1Abi } as const;
  const [block, code, owner, keeper, guardian, treasury, paused, depositCap, depositFeeBps, minTargetAssets, maxLossBps, maxDailyLossBps, dailyLoss, totalSupply, idle, count] = await Promise.all([
    client.getBlockNumber(),
    client.getCode({ address }),
    client.readContract({ ...c, functionName: "owner" }) as Promise<Address>,
    client.readContract({ ...c, functionName: "keeper" }) as Promise<Address>,
    client.readContract({ ...c, functionName: "guardian" }) as Promise<Address>,
    client.readContract({ ...c, functionName: "treasury" }) as Promise<Address>,
    client.readContract({ ...c, functionName: "paused" }) as Promise<boolean>,
    client.readContract({ ...c, functionName: "depositCap" }) as Promise<bigint>,
    client.readContract({ ...c, functionName: "depositFeeBps" }) as Promise<number>,
    client.readContract({ ...c, functionName: "minTargetAssets" }) as Promise<bigint>,
    client.readContract({ ...c, functionName: "maxLossBps" }) as Promise<number>,
    client.readContract({ ...c, functionName: "maxDailyLossBps" }) as Promise<number>,
    client.readContract({ ...c, functionName: "dailyLoss" }) as Promise<bigint>,
    client.readContract({ ...c, functionName: "totalSupply" }) as Promise<bigint>,
    client.readContract({ ...c, functionName: "idleAssets" }) as Promise<bigint>,
    client.readContract({ ...c, functionName: "targetCount" }) as Promise<bigint>,
  ]);
  const vaults = await Promise.all(Array.from({ length: Number(count) }, (_, i) => client.readContract({ ...c, functionName: "targetList", args: [BigInt(i)] }) as Promise<Address>));
  const targets: AllocatorTarget[] = await Promise.all(
    vaults.map(async (vault) => {
      const [cfg, shares] = await Promise.all([
        client.readContract({ ...c, functionName: "targets", args: [vault] }) as Promise<readonly [boolean, boolean, number, Address, Address, Address]>,
        client.readContract({ address: vault, abi: managedVaultAbi, functionName: "balanceOf", args: [address] }),
      ]);
      const value = shares > 0n && !cfg[1] ? await (client.readContract({ ...c, functionName: "valueOf", args: [vault] }) as Promise<bigint>).catch(() => null) : 0n;
      const entry = MANAGED_VAULTS.find((m) => same(m.vault, vault));
      const pin = pins.find((p) => same(p.vault, vault));
      return { vault, entry: entry!, symbol: pin?.symbol ?? entry?.name ?? vault.slice(0, 8), enabled: cfg[0], writtenOff: cfg[1], maxWeightBps: Number(cfg[2]), shares, value };
    }),
  );
  const totalAssets = targets.some((t) => t.value === null) ? null : targets.reduce((a, t) => a + (t.value ?? 0n), idle);
  const pricePerShare = totalAssets === null ? null : ((totalAssets + 1n) * 10n ** 12n) / (totalSupply + 10n ** 6n);
  return { address, block, owner, keeper, guardian, treasury, paused, depositCap, depositFeeBps: Number(depositFeeBps), minTargetAssets, maxLossBps: Number(maxLossBps), maxDailyLossBps: Number(maxDailyLossBps), dailyLoss, totalSupply, idle, totalAssets, pricePerShare, targets, codeMatches: (code ?? "0x").toLowerCase() === allocatorV1Artifact.runtime.toLowerCase() };
}

export const encodeAllocatorDeposit = (assets: bigint, receiver: Address) => encodeFunctionData({ abi: allocatorV1Abi, functionName: "deposit", args: [assets, receiver] });
export const encodeAllocatorWithdraw = (shares: bigint, receiver: Address, skip: Address[] = []) => encodeFunctionData({ abi: allocatorV1Abi, functionName: "withdraw", args: [shares, receiver, skip] });

/** Builds the router entry for the allocator (it holds the USDG, so the same quote builder applies) and the `allocate` calldata. */
export async function buildAllocate(allocator: Address, entry: ManagedVaultRegistryEntry, budget: bigint, client: PublicClient = publicClient()) {
  const quote = await buildDepositQuote(entry, allocator, budget, false, client);
  const e: DepositEntry = quote.entry;
  return { quote, data: encodeFunctionData({ abi: allocatorV1Abi, functionName: "allocate", args: [entry.vault as Address, e] }) };
}

/** Exit arguments for `deallocate`, built the way the vault page builds a USDG withdrawal, with the contract's loss floor applied. */
export async function buildDeallocate(allocator: Address, entry: ManagedVaultRegistryEntry, shares: bigint, maxLossBps: number, client: PublicClient = publicClient()) {
  const state = await readManagedState(entry, allocator, client);
  if (!state.quote || state.value === null) throw new Error("USDG exit needs a fresh reference. Wait for the feed to update.");
  const stockIsToken0 = !same(entry.asset, entry.token0);
  const q = await client.readContract({ address: entry.vault as Address, abi: managedVaultAbi, functionName: "quote", args: [shares, 0n], blockNumber: state.block });
  const [a0, a1] = [q[1], q[2]];
  const expected = await client.readContract({ address: entry.oracle as Address, abi: managedValuationAbi, functionName: "value", args: [a0, a1], blockNumber: state.block });
  const stockValue = await client.readContract({ address: entry.oracle as Address, abi: managedValuationAbi, functionName: "value", args: stockIsToken0 ? [a0, 0n] : [0n, a1], blockNumber: state.block });
  const swapLoss = state.lossLimits?.swapLossBps ?? entry.maxSwapLossBps;
  const minOut = (stockValue * BigInt(10_000 - swapLoss) + 9_999n) / 10_000n;
  const usdgOut = stockIsToken0 ? a1 : a0;
  let minimum = usdgOut + minOut;
  const floor = (expected * BigInt(10_000 - maxLossBps) + 9_999n) / 10_000n;
  if (minimum < floor) minimum = floor;
  const sqrtLimit = await swapSqrtLimit(entry, stockIsToken0, state.block, state.lossLimits?.slippageBps, client);
  const deadline = (await client.getBlock()).timestamp + 180n;
  const args = [entry.vault as Address, shares, minimum, deadline, state.epoch, { minOut, sqrtLimit, route: "0x" as Hex }] as const;
  return { expected, minimum, data: encodeFunctionData({ abi: allocatorV1Abi, functionName: "deallocate", args: [...args] }) };
}

export const fmtUsdg6 = (raw: bigint) => Number(formatUnits(raw, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const fmtShares12 = (raw: bigint) => Number(formatUnits(raw, 12)).toLocaleString("en-US", { maximumFractionDigits: 4 });
export { USDG_ADDRESS };
