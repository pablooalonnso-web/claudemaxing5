/**
 * Runs the VertexAllocatorV1 end-to-end scenario inside one eth_call on
 * Robinhood Chain, at a block where the stock references were fresh. The
 * scenario contract's code and a USDG balance are injected through state
 * overrides; nothing is deployed, signed or sent.
 *
 *   npm run simulate:allocator -- --block 66715782 --vault PLTR --amount 1000
 */
import { readFileSync } from "node:fs";
import { decodeErrorResult, decodeFunctionResult, encodeAbiParameters, encodeDeployData, encodeFunctionData, formatUnits, getContractAddress, keccak256, pad, parseUnits, toHex, type Abi, type Address, type Hex, type PublicClient } from "viem";
import { publicClient, USDG_ADDRESS } from "@/lib/chain";
import { buildDepositQuote, readManagedState, swapSqrtLimit } from "@/lib/managed-vault";
import { MANAGED_VAULTS, VAULT_PINS } from "@/lib/registry";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const solc = require("solc") as { compile: (input: string) => string };

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BLOCK = BigInt(opt("--block", "66715782"));
const SYMBOL = opt("--vault", "PLTR");
const AMOUNT = parseUnits(opt("--amount", "1000"), 6);
const SCENARIO = "0x00000000000000000000000000000000005ce4a0" as Address;
const STOP = Number(opt("--stop", "5"));
const GAS = BigInt(opt("--gas", "30000000"));
const TREASURY = "0x000000000000000000000000000000000000dEaD" as Address;
const USDG_BALANCE_SLOT_BASE = 1; // found by the verification run's storage probe

function compileScenario() {
  const sources = {
    "VertexAllocatorV1.sol": { content: readFileSync("contracts/VertexAllocatorV1.sol", "utf8") },
    "test/AllocatorScenario.sol": { content: readFileSync("contracts/test/AllocatorScenario.sol", "utf8") },
  };
  const input = { language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object"] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input))) as { errors?: { severity: string; formattedMessage: string }[]; contracts: Record<string, Record<string, { abi: unknown[]; evm: { deployedBytecode: { object: string } } }>> };
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    process.exit(1);
  }
  const s = out.contracts["test/AllocatorScenario.sol"].AllocatorScenario;
  return { abi: s.abi as Abi, runtime: ("0x" + s.evm.deployedBytecode.object) as Hex };
}

async function main() {
  const client = publicClient();
  const artifact = JSON.parse(readFileSync("src/data/allocator-v1.artifact.json", "utf8")) as { abi: Abi; bytecode: Hex };
  const scenario = compileScenario();
  const pin = VAULT_PINS.find((p) => p.symbol === SYMBOL)!;
  const entry = MANAGED_VAULTS.find((m) => m.id === pin.id)!;
  const allocator = getContractAddress({ from: SCENARIO, nonce: 0n }); // an injected contract has nonce 0
  const block = await client.getBlock({ blockNumber: BLOCK });
  console.log(`block ${BLOCK} (${new Date(Number(block.timestamp) * 1000).toISOString()}) · vault ${SYMBOL} ${entry.vault} · allocator would be ${allocator}`);

  // Client pinned to the block, where the allocator already holds the budget so the quote builder accepts it.
  const balanceSlot = (owner: Address) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [owner, pad(toHex(USDG_BALANCE_SLOT_BASE), { size: 32 })]));
  const usdgOverride = [{ address: USDG_ADDRESS, stateDiff: [{ slot: balanceSlot(allocator), value: pad(toHex(AMOUNT), { size: 32 }) }] }];
  const pinned = {
    ...client,
    getBlock: () => client.getBlock({ blockNumber: BLOCK }),
    readContract: (a: Parameters<PublicClient["readContract"]>[0]) =>
      client.readContract({ ...a, blockNumber: BLOCK, ...(a.address?.toLowerCase() === USDG_ADDRESS.toLowerCase() ? { stateOverride: usdgOverride } : {}) } as never),
  } as PublicClient;

  const state = await readManagedState(entry, allocator, pinned);
  if (!state.quote) throw new Error("No fresh reference at this block; pick a block during market hours");
  const fee = 30;
  const net = AMOUNT - (AMOUNT * BigInt(fee)) / 10_000n;
  const budget = (net * 30n) / 100n; // 30% of the deposit into one vault, under the 35% weight limit
  const quote = await buildDepositQuote(entry, allocator, budget, false, pinned);
  const stockIsToken0 = entry.asset.toLowerCase() !== entry.token0.toLowerCase();
  const exitSqrtLimit = await swapSqrtLimit(entry, stockIsToken0, BLOCK, state.lossLimits?.slippageBps, client);
  const swapLossBps = state.lossLimits?.swapLossBps ?? entry.maxSwapLossBps;
  const creation = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [USDG_ADDRESS, SCENARIO, SCENARIO, SCENARIO, TREASURY, parseUnits("5000", 6), fee, [entry.vault as Address], [3500]] });
  const params = {
    creation,
    usdg: USDG_ADDRESS,
    treasury: TREASURY,
    vault: entry.vault as Address,
    depositAmount: AMOUNT,
    entry: quote.entry,
    bigBudget: (net * 90n) / 100n,
    stockIsToken0,
    swapLossBps,
    exitSqrtLimit,
    deadline: block.timestamp + 180n,
    configuration: state.epoch,
    stopAfter: STOP,
  };
  const data = encodeFunctionData({ abi: scenario.abi, functionName: "run", args: [params] });
  console.log(`deposit ${formatUnits(AMOUNT, 6)} USDG · allocate ${formatUnits(budget, 6)} USDG for ${formatUnits(quote.shares, 18)} shares · fee ${fee} bps`);
  const overrides = [
    { address: SCENARIO, code: scenario.runtime },
    { address: USDG_ADDRESS, stateDiff: [{ slot: balanceSlot(SCENARIO), value: pad(toHex(AMOUNT * 2n), { size: 32 }) }] },
  ];
  const ping = await client.call({ to: SCENARIO, data: encodeFunctionData({ abi: scenario.abi, functionName: "ping" }), blockNumber: BLOCK, stateOverride: [overrides[0]] } as never).catch((e: Error) => ({ data: `ping failed: ${e.message.split("\n")[0]}` }));
  console.log(`code override at block ${BLOCK}: ${ping.data}`);
  let raw: Hex;
  try {
    const res = await client.call({ to: SCENARIO, data, blockNumber: BLOCK, gas: GAS, stateOverride: overrides } as never);
    raw = res.data as Hex;
  } catch (e) {
    const err = e as { cause?: { data?: Hex }; data?: Hex; shortMessage?: string; message?: string };
    const hex = err.cause?.data ?? err.data;
    if (hex) {
      try {
        console.error("reverted:", decodeErrorResult({ abi: [...(artifact.abi as never[]), ...(scenario.abi as never[])], data: hex }));
      } catch {
        console.error("reverted with", hex);
      }
    }
    console.error(err.shortMessage ?? err.message);
    process.exit(1);
  }
  const r = decodeFunctionResult({ abi: scenario.abi, functionName: "run", data: raw }) as unknown as Record<string, bigint | string>;
  const usd = (v: bigint | string) => `${formatUnits(BigInt(v), 6)} USDG`;
  const sel = (name: string) => toHex(keccak256(toHex(name)).slice(0, 10) as Hex);
  const errName = (s: string) => ["WeightExceeded()", "BadReceiver()", "NotKeeper()"].find((n) => keccak256(new TextEncoder().encode(n)).slice(0, 10) === s) ?? s;
  void sel;
  console.log("");
  console.log(`allocator deployed at ${r.allocator}`);
  console.log(`deposit: ${formatUnits(BigInt(r.sharesMinted), 12)} vaUSDG minted, fee ${usd(r.feePaid)} to treasury, idle ${usd(r.idleAfterDeposit)}`);
  console.log(`limits: over-weight budget → ${errName(String(r.weightError))}; foreign receiver → ${errName(String(r.receiverError))}; stranger caller → ${errName(String(r.strangerError))}`);
  console.log(`allocate: ${formatUnits(BigInt(r.vaultSharesAfterAllocate), 18)} ${SYMBOL} vault shares, position valued ${usd(r.valueOfTarget)}, idle ${usd(r.idleAfterAllocate)}, total assets ${usd(r.totalAssetsAfterAllocate)}`);
  console.log(`withdraw half in kind: ${usd(r.withdrawIdleOut)} idle + ${formatUnits(BigInt(r.withdrawVaultSharesOut), 18)} vault shares to the holder`);
  console.log(`deallocate rest: expected ${usd(r.deallocateExpected)}, floor ${usd(r.deallocateMinimum)}, received ${usd(r.deallocatedOut)}`);
  console.log(`end: total assets ${usd(r.totalAssetsEnd)}, supply ${formatUnits(BigInt(r.supplyEnd), 12)} vaUSDG, price per share ${usd(r.pricePerShareEnd)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
