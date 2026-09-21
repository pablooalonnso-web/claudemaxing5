"use client";

import { decodeFunctionData, encodeFunctionData, formatUnits, type Abi, type Address, type Hex, type PublicClient } from "viem";
import stakingArtifact from "@/data/vertex-staking.artifact.json";
import governorArtifact from "@/data/vertex-governor.artifact.json";
import splitterArtifact from "@/data/vertex-fee-splitter.artifact.json";
import moduleArtifact from "@/data/vertex-lending-module.artifact.json";
import deployed from "@/data/governance.json";
import { allocatorV1Abi } from "./allocator-v1";
import { erc20Abi } from "./abis";
import { publicClient, TOKEN_ADDRESS, USDG_ADDRESS } from "./chain";
import { LENDING_MARKETS } from "./registry";

export type Artifact = { contract: string; compiler: string; settings: unknown; sourceSha256: string; abi: Abi; bytecode: Hex; deployedBytecode: Hex; immutableReferences: { start: number; length: number }[] };
export const stakingArt = stakingArtifact as Artifact;
export const governorArt = governorArtifact as Artifact;
export const splitterArt = splitterArtifact as Artifact;
export const lendingModuleArt = moduleArtifact as Artifact;
export const stakingAbi = stakingArt.abi;
export const governorAbi = governorArt.abi;
export const splitterAbi = splitterArt.abi;
export const lendingModuleAbi = lendingModuleArt.abi;

export type GovernanceConfig = { chainId: number; staking: string | null; governor: string | null; splitter: string | null; lendingModule: string | null; deployedBlock: string | null; deployedTransactions: string[] };
export const GOVERNANCE: GovernanceConfig = deployed as GovernanceConfig;
export const governanceDeployed = () => !!(GOVERNANCE.staking && GOVERNANCE.governor && GOVERNANCE.splitter);

/** Launch parameters: the fee split governance starts from, and the weight the lending module is proposed at. */
export const GOVERNANCE_LAUNCH = { buybackBps: 3000, stakersBps: 4000, treasuryBps: 3000, moduleWeightBps: 2500, buyback: "0x9b46347B947b0Be2ee450425D0278Fe02BEB2080" as Address } as const;

/**
 * Runtime comparison that ignores the immutable slots (their values are read back through the contract's getters and
 * checked separately): the compiler leaves them blank in the artifact and the deployment fills them in.
 */
export function runtimeMatchesMasked(code: Hex | undefined, art: Artifact): boolean {
  const on = (code ?? "0x").slice(2).toLowerCase();
  const ref = art.deployedBytecode.slice(2).toLowerCase();
  if (on.length !== ref.length) return false;
  const a = on.split("");
  const b = ref.split("");
  for (const r of art.immutableReferences) for (let i = 0; i < r.length * 2; i++) a[r.start * 2 + i] = b[r.start * 2 + i] = "0";
  return a.join("") === b.join("");
}

export const PROPOSAL_STATES = ["Pending", "Active", "Defeated", "Succeeded", "Queued", "Executed", "Canceled", "Expired"] as const;
export type ProposalState = (typeof PROPOSAL_STATES)[number];

export type Proposal = {
  id: number;
  proposer: Address;
  target: Address;
  viaTimelock: boolean;
  snapshot: bigint;
  end: bigint;
  quorumBps: number;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  data: Hex;
  description: string;
  state: ProposalState;
  quorum: bigint;
  voted: boolean;
  /** Decoded call, for example `setDepositCap(4000 USDG)`. */
  call: string;
  targetName: string;
  allocatorReady: boolean;
};

export type GovernanceState = {
  block: bigint;
  staking: { address: Address; totalStaked: bigint; totalRewards: bigint; rewarder: Address; governor: Address; cooldown: bigint; codeMatches: boolean };
  governor: { address: Address; votingDelay: bigint; votingPeriod: bigint; quorumBps: number; thresholdBps: number; guardian: Address; allocator: Address; proposalCount: number; codeMatches: boolean };
  splitter: { address: Address; buyback: Address; treasury: Address; staking: Address; buybackBps: number; stakersBps: number; treasuryBps: number; owner: Address; pending: bigint; toBuyback: bigint; toStakers: bigint; toTreasury: bigint; codeMatches: boolean };
  module: { address: Address; market: Address; symbol: string; supplied: bigint | null; open: boolean; allocatorShares: bigint; allocatorValue: bigint | null; whitelisted: boolean; weightBps: number; codeMatches: boolean } | null;
  allocator: { address: Address; owner: Address; treasury: Address; handedOver: boolean; treasuryReady: boolean; ownerReady: boolean; treasuryQueued: boolean; ownerQueued: boolean };
  me: { vertex: bigint; staked: bigint; votes: bigint; pendingAmount: bigint; pendingReadyAt: bigint; earned: bigint; canPropose: boolean } | null;
  proposals: Proposal[];
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function handOverCalls(splitter: Address, governor: Address) {
  return {
    treasury: encodeFunctionData({ abi: allocatorV1Abi, functionName: "setTreasury", args: [splitter] }),
    owner: encodeFunctionData({ abi: allocatorV1Abi, functionName: "transferOwnership", args: [governor] }),
  };
}

/** Human readable version of a proposal's calldata. */
export function describeCall(target: Address, data: Hex, names: { allocator?: Address; splitter?: Address; staking?: Address; governor?: Address }): { call: string; targetName: string } {
  const abis: [string, Abi][] = [
    ["Allocator", allocatorV1Abi],
    ["Fee splitter", splitterAbi],
    ["Staking", stakingAbi],
    ["Governor", governorAbi],
  ];
  let targetName = "Contract";
  if (names.allocator && same(target, names.allocator)) targetName = "Allocator";
  else if (names.splitter && same(target, names.splitter)) targetName = "Fee splitter";
  else if (names.staking && same(target, names.staking)) targetName = "Staking";
  else if (names.governor && same(target, names.governor)) targetName = "Governor";
  for (const [, abi] of abis) {
    try {
      const d = decodeFunctionData({ abi, data });
      const args = (d.args ?? []).map((a) => (typeof a === "bigint" ? (a >= 10n ** 5n && a < 10n ** 15n ? `${formatUnits(a, 6)} USDG` : a.toString()) : String(a)));
      return { call: `${d.functionName}(${args.join(", ")})`, targetName };
    } catch {}
  }
  return { call: data.slice(0, 10), targetName };
}

export async function readGovernance(wallet: Address | null, client: PublicClient = publicClient()): Promise<GovernanceState> {
  if (!governanceDeployed()) throw new Error("governance is not deployed");
  const staking = GOVERNANCE.staking as Address;
  const governor = GOVERNANCE.governor as Address;
  const splitter = GOVERNANCE.splitter as Address;
  const moduleAddr = GOVERNANCE.lendingModule as Address | null;
  const st = { address: staking, abi: stakingAbi } as const;
  const gv = { address: governor, abi: governorAbi } as const;
  const sp = { address: splitter, abi: splitterAbi } as const;
  const r = <T,>(c: { address: Address; abi: Abi }, functionName: string, args: unknown[] = []) => client.readContract({ ...c, functionName, args } as never) as Promise<T>;
  const [block, stCode, gvCode, spCode, totalStaked, totalRewards, rewarder, stGovernor, cooldown, votingDelay, votingPeriod, quorumBps, thresholdBps, guardian, allocator, proposalCount, buyback, treasury, spStaking, buybackBps, stakersBps, treasuryBps, spOwner, pending] = await Promise.all([
    client.getBlockNumber(),
    client.getCode({ address: staking }),
    client.getCode({ address: governor }),
    client.getCode({ address: splitter }),
    r<bigint>(st, "totalStaked"),
    r<bigint>(st, "totalRewards"),
    r<Address>(st, "rewarder"),
    r<Address>(st, "governor"),
    r<bigint>(st, "COOLDOWN"),
    r<bigint>(gv, "votingDelay"),
    r<bigint>(gv, "votingPeriod"),
    r<bigint>(gv, "quorumBps"),
    r<bigint>(gv, "thresholdBps"),
    r<Address>(gv, "guardian"),
    r<Address>(gv, "ALLOCATOR"),
    r<bigint>(gv, "proposalCount"),
    r<Address>(sp, "buyback"),
    r<Address>(sp, "treasury"),
    r<Address>(sp, "staking"),
    r<number>(sp, "buybackBps"),
    r<number>(sp, "stakersBps"),
    r<number>(sp, "treasuryBps"),
    r<Address>(sp, "owner"),
    r<bigint>(sp, "pendingDistribution"),
  ]);
  const al = { address: allocator, abi: allocatorV1Abi } as const;
  const hand = handOverCalls(splitter, governor);
  const hash = (data: Hex) => client.readContract({ address: allocator, abi: allocatorV1Abi, functionName: "eta", args: [keccakOf(data)] } as never) as Promise<bigint>;
  const [alOwner, alTreasury, treasuryReady, ownerReady, treasuryEta, ownerEta, blockInfo] = await Promise.all([
    r<Address>(al, "owner"),
    r<Address>(al, "treasury"),
    r<boolean>(al, "ready", [keccakOf(hand.treasury)]),
    r<boolean>(al, "ready", [keccakOf(hand.owner)]),
    hash(hand.treasury),
    hash(hand.owner),
    client.getBlock(),
  ]);
  const toStakers = totalStaked === 0n ? 0n : (pending * BigInt(stakersBps)) / 10_000n;
  const toBuyback = (pending * BigInt(buybackBps)) / 10_000n;
  const names = { allocator, splitter, staking, governor };
  const ids = Array.from({ length: Number(proposalCount) }, (_, i) => i);
  const proposals: Proposal[] = await Promise.all(
    ids.map(async (id) => {
      const [p, state, quorum, voted] = await Promise.all([
        r<{ proposer: Address; target: Address; viaTimelock: boolean; snapshot: bigint; end: bigint; quorumBps: bigint; forVotes: bigint; againstVotes: bigint; abstainVotes: bigint; data: Hex; description: string }>(gv, "proposal", [BigInt(id)]),
        r<number>(gv, "state", [BigInt(id)]),
        r<bigint>(gv, "quorum", [BigInt(id)]).catch(() => 0n),
        wallet ? r<boolean>(gv, "hasVoted", [BigInt(id), wallet]) : Promise.resolve(false),
      ]);
      const allocatorReady = p.viaTimelock && PROPOSAL_STATES[state] === "Queued" ? await r<boolean>(al, "ready", [keccakOf(p.data)]) : false;
      return { id, proposer: p.proposer, target: p.target, viaTimelock: p.viaTimelock, snapshot: p.snapshot, end: p.end, quorumBps: Number(p.quorumBps), forVotes: p.forVotes, againstVotes: p.againstVotes, abstainVotes: p.abstainVotes, data: p.data, description: p.description, state: PROPOSAL_STATES[state] ?? "Pending", quorum, voted, allocatorReady, ...describeCall(p.target, p.data, names) };
    }),
  );
  let me: GovernanceState["me"] = null;
  if (wallet) {
    const [vertex, staked, pendingMe, earned, pastVotes, pastTotal] = await Promise.all([
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
      r<bigint>(st, "staked", [wallet]),
      r<readonly [bigint, bigint]>(st, "pending", [wallet]),
      r<bigint>(st, "earned", [wallet]),
      r<bigint>(st, "getPastVotes", [wallet, blockInfo.timestamp - 1n]).catch(() => 0n),
      r<bigint>(st, "getPastTotalSupply", [blockInfo.timestamp - 1n]).catch(() => 0n),
    ]);
    me = { vertex, staked, votes: staked, pendingAmount: pendingMe[0], pendingReadyAt: pendingMe[1], earned, canPropose: pastVotes > 0n && pastVotes * 10_000n >= pastTotal * thresholdBps };
  }
  let mod: GovernanceState["module"] = null;
  if (moduleAddr) {
    const md = { address: moduleAddr, abi: lendingModuleAbi } as const;
    const [mdCode, market, symbol, supplied, open, allocatorShares, cfg] = await Promise.all([
      client.getCode({ address: moduleAddr }),
      r<Address>(md, "MARKET"),
      r<string>(md, "symbol"),
      r<bigint>(md, "suppliedAssets").catch(() => null),
      r<boolean>(md, "marketOpen"),
      r<bigint>(md, "balanceOf", [allocator]),
      r<readonly [boolean, boolean, number, Address, Address, Address]>(al, "targets", [moduleAddr]),
    ]);
    const allocatorValue = allocatorShares > 0n ? await r<bigint>(md, "assetsOf", [allocatorShares]).catch(() => null) : 0n;
    mod = { address: moduleAddr, market, symbol, supplied, open, allocatorShares, allocatorValue, whitelisted: cfg[0], weightBps: Number(cfg[2]), codeMatches: runtimeMatchesMasked(mdCode, lendingModuleArt) };
  }
  return {
    block,
    staking: { address: staking, totalStaked, totalRewards, rewarder, governor: stGovernor, cooldown, codeMatches: runtimeMatchesMasked(stCode, stakingArt) },
    governor: { address: governor, votingDelay, votingPeriod, quorumBps: Number(quorumBps), thresholdBps: Number(thresholdBps), guardian, allocator, proposalCount: Number(proposalCount), codeMatches: runtimeMatchesMasked(gvCode, governorArt) },
    splitter: { address: splitter, buyback, treasury, staking: spStaking, buybackBps: Number(buybackBps), stakersBps: Number(stakersBps), treasuryBps: Number(treasuryBps), owner: spOwner, pending, toBuyback, toStakers, toTreasury: pending - toBuyback - toStakers, codeMatches: runtimeMatchesMasked(spCode, splitterArt) },
    module: mod,
    allocator: { address: allocator, owner: alOwner, treasury: alTreasury, handedOver: same(alOwner, governor) && same(alTreasury, splitter), treasuryReady, ownerReady, treasuryQueued: treasuryEta > 0n, ownerQueued: ownerEta > 0n },
    me,
    proposals: proposals.reverse(),
  };
}

// keccak of calldata, the allocator's proposal hash
import { keccak256 } from "viem";
export const keccakOf = (data: Hex) => keccak256(data);

// ------------------------------------------------------------------ calldata builders
export const encodeStake = (amount: bigint) => encodeFunctionData({ abi: stakingAbi, functionName: "stake", args: [amount] });
export const encodeUnstake = (amount: bigint) => encodeFunctionData({ abi: stakingAbi, functionName: "unstake", args: [amount] });
export const encodeWithdrawStake = () => encodeFunctionData({ abi: stakingAbi, functionName: "withdraw" });
export const encodeClaim = () => encodeFunctionData({ abi: stakingAbi, functionName: "claim" });
export const encodeDistribute = () => encodeFunctionData({ abi: splitterAbi, functionName: "distribute" });
export const encodePropose = (target: Address, data: Hex, viaTimelock: boolean, description: string) => encodeFunctionData({ abi: governorAbi, functionName: "propose", args: [target, data, viaTimelock, description] });
export const encodeVote = (id: number, support: 0 | 1 | 2) => encodeFunctionData({ abi: governorAbi, functionName: "castVote", args: [BigInt(id), support] });
export const encodeExecute = (id: number) => encodeFunctionData({ abi: governorAbi, functionName: "execute", args: [BigInt(id)] });
export const encodeFinalize = (id: number) => encodeFunctionData({ abi: governorAbi, functionName: "finalize", args: [BigInt(id)] });
export const encodeCancel = (id: number) => encodeFunctionData({ abi: governorAbi, functionName: "cancel", args: [BigInt(id)] });
export const encodeAllocatorPropose = (data: Hex) => encodeFunctionData({ abi: allocatorV1Abi, functionName: "propose", args: [data] });
export const encodeAllocatorExecute = (data: Hex) => encodeFunctionData({ abi: allocatorV1Abi, functionName: "execute", args: [data] });

/** Proposal templates the page offers. Every allocator change goes through its timelock. */
export type ProposalDraft = { target: Address; data: Hex; viaTimelock: boolean };
export function draftWhitelistModule(allocator: Address, module: Address, stock: Address, weightBps: number): ProposalDraft {
  return { target: allocator, viaTimelock: true, data: encodeFunctionData({ abi: allocatorV1Abi, functionName: "setTarget", args: [module, weightBps, module, module, stock] }) };
}
export function draftSetWeight(allocator: Address, vault: Address, router: Address, valuation: Address, stock: Address, weightBps: number): ProposalDraft {
  return { target: allocator, viaTimelock: true, data: encodeFunctionData({ abi: allocatorV1Abi, functionName: "setTarget", args: [vault, weightBps, router, valuation, stock] }) };
}
export function draftDepositCap(allocator: Address, cap: bigint): ProposalDraft {
  return { target: allocator, viaTimelock: true, data: encodeFunctionData({ abi: allocatorV1Abi, functionName: "setDepositCap", args: [cap] }) };
}
export function draftSplit(splitter: Address, buybackBps: number, stakersBps: number, treasuryBps: number): ProposalDraft {
  return { target: splitter, viaTimelock: false, data: encodeFunctionData({ abi: splitterAbi, functionName: "setSplit", args: [buybackBps, stakersBps, treasuryBps] }) };
}

export const lendingModuleMarket = () => LENDING_MARKETS[0];
export const fmtVertex = (raw: bigint) => Number(formatUnits(raw, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 });
export { USDG_ADDRESS, TOKEN_ADDRESS };
