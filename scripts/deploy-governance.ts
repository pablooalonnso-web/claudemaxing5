/**
 * Deploys the Phase 3 contracts from a throwaway key: VertexStaking,
 * VertexFeeSplitter, VertexGovernor and VertexLendingModule, wires them to
 * each other and hands the staking contract and the splitter to the
 * governor. The deploying key keeps no role. The allocator's own hand over
 * (treasury to the splitter, ownership to the governor) is two transactions
 * its owner sends through the allocator's timelock, from /governance.
 *
 *   ALLOCATOR_DEPLOYER_KEY=0x… npm run deploy:governance -- --treasury 0x… --guardian 0x… [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createWalletClient, encodeDeployData, encodeFunctionData, formatEther, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ALLOCATOR_V1 } from "@/lib/allocator-v1";
import { publicClient, robinhoodChain, TOKEN_ADDRESS, USDG_ADDRESS } from "@/lib/chain";
import { GOVERNANCE_LAUNCH, governorArt, lendingModuleArt, runtimeMatchesMasked, splitterArt, stakingArt } from "@/lib/governance";
import { LENDING_MARKETS, MANAGED_VAULTS } from "@/lib/registry";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};
const DRY = args.includes("--dry-run");
const isAddress = (a: string | undefined): a is Address => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

async function main() {
  const treasury = opt("--treasury");
  const guardian = opt("--guardian") ?? treasury;
  if (!isAddress(treasury) || !isAddress(guardian)) throw new Error("--treasury 0x… (and optionally --guardian 0x…) are required");
  if (!ALLOCATOR_V1.address) throw new Error("the allocator must be deployed first");
  const allocator = ALLOCATOR_V1.address as Address;
  const keyFile = opt("--key-file");
  const key = (process.env.ALLOCATOR_DEPLOYER_KEY ?? (keyFile ? readFileSync(keyFile, "utf8").trim() : "")) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("ALLOCATOR_DEPLOYER_KEY (or --key-file) must hold a 32 byte hex key");
  const account = privateKeyToAccount(key);
  const client = publicClient();
  const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(robinhoodChain.rpcUrls.default.http[0]) });
  const market = LENDING_MARKETS[0];
  const vault = MANAGED_VAULTS.find((m) => m.vault.toLowerCase() === market.vault.toLowerCase())!;

  const [balance, gasPrice, nonce] = await Promise.all([client.getBalance({ address: account.address }), client.getGasPrice(), client.getTransactionCount({ address: account.address })]);
  console.log(`deployer ${account.address} (nonce ${nonce}) · balance ${formatEther(balance)} ETH · allocator ${allocator} · treasury ${treasury} · guardian ${guardian}`);

  // Deployment order: staking (governor = deployer for now), splitter (owner = deployer), governor, module; then wiring.
  const stakingData = encodeDeployData({ abi: stakingArt.abi, bytecode: stakingArt.bytecode, args: [TOKEN_ADDRESS, USDG_ADDRESS, account.address] });
  const gasStaking = await client.estimateGas({ account: account.address, data: stakingData });
  // Rough total: four deployments plus three wiring calls.
  const roughGas = gasStaking * 5n + 300_000n;
  console.log(`rough gas ${roughGas} × ${formatEther(gasPrice * 10n ** 9n)} gwei ≈ ${formatEther(roughGas * gasPrice)} ETH`);
  if (balance < roughGas * gasPrice) throw new Error(`send at least ${formatEther(roughGas * gasPrice)} ETH to ${account.address}`);
  if (DRY) {
    console.log("dry run: nothing sent");
    return;
  }

  const deploy = async (name: string, art: { abi: Abi; bytecode: Hex }, ctorArgs: unknown[]) => {
    const data = encodeDeployData({ abi: art.abi, bytecode: art.bytecode, args: ctorArgs });
    const gas = await client.estimateGas({ account: account.address, data });
    const hash = await wallet.sendTransaction({ data, gas: (gas * 12n) / 10n });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 300_000, pollingInterval: 1000 });
    if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`${name} deployment reverted`);
    console.log(`${name} at ${receipt.contractAddress} (block ${receipt.blockNumber}, tx ${hash})`);
    return { address: receipt.contractAddress, hash, block: receipt.blockNumber };
  };
  const call = async (label: string, to: Address, data: Hex) => {
    const gas = await client.estimateGas({ account: account.address, to, data });
    const hash = await wallet.sendTransaction({ to, data, gas: (gas * 12n) / 10n });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 300_000, pollingInterval: 1000 });
    if (receipt.status !== "success") throw new Error(`${label} reverted`);
    console.log(`${label}: ${hash}`);
    return hash;
  };

  const staking = await deploy("VertexStaking", stakingArt, [TOKEN_ADDRESS, USDG_ADDRESS, account.address]);
  const splitter = await deploy("VertexFeeSplitter", splitterArt, [USDG_ADDRESS, account.address, GOVERNANCE_LAUNCH.buyback, treasury, staking.address, GOVERNANCE_LAUNCH.buybackBps, GOVERNANCE_LAUNCH.stakersBps, GOVERNANCE_LAUNCH.treasuryBps]);
  const governor = await deploy("VertexGovernor", governorArt, [staking.address, allocator, guardian, [splitter.address]]);
  const module = await deploy("VertexLendingModule", lendingModuleArt, [market.market, USDG_ADDRESS, market.stock, vault.oracle, `Vertex Lending Module ${market.symbol}`, `vlm${market.symbol}`]);
  const txs = [staking.hash, splitter.hash, governor.hash, module.hash];
  txs.push(await call("staking.setRewarder(splitter)", staking.address, encodeFunctionData({ abi: stakingArt.abi, functionName: "setRewarder", args: [splitter.address] })));
  txs.push(await call("staking.setGovernor(governor)", staking.address, encodeFunctionData({ abi: stakingArt.abi, functionName: "setGovernor", args: [governor.address] })));
  txs.push(await call("splitter.transferOwnership(governor)", splitter.address, encodeFunctionData({ abi: splitterArt.abi, functionName: "transferOwnership", args: [governor.address] })));

  // Verify before recording.
  const [stCode, spCode, gvCode, mdCode, stGov, stRew, spOwner, gvAlloc] = await Promise.all([
    client.getCode({ address: staking.address }),
    client.getCode({ address: splitter.address }),
    client.getCode({ address: governor.address }),
    client.getCode({ address: module.address }),
    client.readContract({ address: staking.address, abi: stakingArt.abi, functionName: "governor" }) as Promise<Address>,
    client.readContract({ address: staking.address, abi: stakingArt.abi, functionName: "rewarder" }) as Promise<Address>,
    client.readContract({ address: splitter.address, abi: splitterArt.abi, functionName: "owner" }) as Promise<Address>,
    client.readContract({ address: governor.address, abi: governorArt.abi, functionName: "ALLOCATOR" }) as Promise<Address>,
  ]);
  const ok = runtimeMatchesMasked(stCode, stakingArt) && runtimeMatchesMasked(spCode, splitterArt) && runtimeMatchesMasked(gvCode, governorArt) && runtimeMatchesMasked(mdCode, lendingModuleArt) && stGov.toLowerCase() === governor.address.toLowerCase() && stRew.toLowerCase() === splitter.address.toLowerCase() && spOwner.toLowerCase() === governor.address.toLowerCase() && gvAlloc.toLowerCase() === allocator.toLowerCase();
  console.log(`verification ${ok ? "passed" : "FAILED"}: bytecode of the four contracts and the wiring`);
  if (!ok) throw new Error("not recording a deployment that does not verify");
  writeFileSync("src/data/governance.json", JSON.stringify({ chainId: robinhoodChain.id, staking: staking.address, governor: governor.address, splitter: splitter.address, lendingModule: module.address, deployedBlock: staking.block.toString(), deployedTransactions: txs }, null, 2) + "\n");
  console.log("src/data/governance.json updated. Next: the allocator's owner queues the hand over from /governance.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
