/**
 * Deploys VertexAllocatorV1 from a throwaway key, with the owner, keeper,
 * guardian and treasury set to the wallet given. The deploying key keeps no
 * role. Targets are the single stock vaults holding at least the launch floor.
 *
 *   ALLOCATOR_DEPLOYER_KEY=0x… npm run deploy:allocator -- --owner 0x… [--targets PLTR,TSLA] [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { encodeDeployData, formatEther, formatUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { ALLOCATOR_V1_LAUNCH, allocatorRuntimeMatches, allocatorV1Abi, allocatorV1Bytecode } from "@/lib/allocator-v1";
import { publicClient, robinhoodChain, USDG_ADDRESS } from "@/lib/chain";
import { directoryVaults } from "@/lib/registry";
import { getVaultSnapshots } from "@/server/vault-snapshots";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};
const DRY = args.includes("--dry-run");

async function main() {
  const owner = opt("--owner") as Address | undefined;
  if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) throw new Error("--owner 0x… is required");
  const keyFile = opt("--key-file");
  const key = (process.env.ALLOCATOR_DEPLOYER_KEY ?? (keyFile ? readFileSync(keyFile, "utf8").trim() : "")) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("ALLOCATOR_DEPLOYER_KEY (or --key-file) must hold a 32 byte hex key");
  const account = privateKeyToAccount(key);
  const client = publicClient();
  const rpc = robinhoodChain.rpcUrls.default.http[0];
  const wallet = createWalletClient({ account, chain: robinhoodChain, transport: http(rpc) });

  // Launch whitelist: single stock vaults holding at least the floor, by the site's own snapshot (pool valued when the feed is stale).
  const singles = directoryVaults();
  const snapshots = await getVaultSnapshots();
  const wanted = opt("--targets")?.split(",").map((s) => s.trim().toUpperCase());
  const eligible = singles.filter((p) => {
    if (wanted) return wanted.includes(p.symbol.toUpperCase());
    const row = snapshots.data.find((r) => r.descriptor.vault.toLowerCase() === p.vault.toLowerCase());
    return row?.snapshot?.assets ? BigInt(row.snapshot.assets) >= ALLOCATOR_V1_LAUNCH.minTargetAssets : false;
  });
  if (!eligible.length) throw new Error("no vault qualifies for the launch whitelist");
  const ctorArgs = [USDG_ADDRESS, owner, owner, owner, owner, ALLOCATOR_V1_LAUNCH.depositCap, ALLOCATOR_V1_LAUNCH.depositFeeBps, eligible.map((p) => p.vault as Address), eligible.map(() => ALLOCATOR_V1_LAUNCH.maxWeightBps)] as const;
  const data = encodeDeployData({ abi: allocatorV1Abi, bytecode: allocatorV1Bytecode, args: [...ctorArgs] });

  const [balance, gasPrice, gas, nonce] = await Promise.all([
    client.getBalance({ address: account.address }),
    client.getGasPrice(),
    client.estimateGas({ account: account.address, data }),
    client.getTransactionCount({ address: account.address }),
  ]);
  const cost = gas * gasPrice;
  console.log(`deployer ${account.address} (nonce ${nonce}) · balance ${formatEther(balance)} ETH`);
  console.log(`owner/keeper/guardian/treasury ${owner}`);
  console.log(`cap ${formatUnits(ALLOCATOR_V1_LAUNCH.depositCap, 6)} USDG · fee ${ALLOCATOR_V1_LAUNCH.depositFeeBps} bps · max weight ${ALLOCATOR_V1_LAUNCH.maxWeightBps} bps`);
  console.log(`targets (${eligible.length}): ${eligible.map((p) => `${p.symbol} ${p.vault}`).join(", ")}`);
  console.log(`gas ${gas} × ${formatUnits(gasPrice, 9)} gwei ≈ ${formatEther(cost)} ETH`);
  if (balance < cost) throw new Error(`the deployer needs at least ${formatEther(cost)} ETH for gas; send it to ${account.address}`);
  if (DRY) {
    console.log("dry run: nothing sent");
    return;
  }

  const hash = await wallet.sendTransaction({ data, gas: (gas * 12n) / 10n });
  console.log(`sent ${hash}`);
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 300_000, pollingInterval: 1000 });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`deployment reverted in block ${receipt.blockNumber}`);
  const address = receipt.contractAddress;
  const code = (await client.getCode({ address })) ?? "0x";
  const matches = allocatorRuntimeMatches(code as Hex);
  const [onchainOwner, count] = await Promise.all([
    client.readContract({ address, abi: allocatorV1Abi, functionName: "owner" }) as Promise<Address>,
    client.readContract({ address, abi: allocatorV1Abi, functionName: "targetCount" }) as Promise<bigint>,
  ]);
  console.log(`deployed at ${address} in block ${receipt.blockNumber} · runtime ${matches ? "matches" : "DOES NOT MATCH"} the artifact · owner ${onchainOwner} · ${count} target(s)`);
  if (!matches || onchainOwner.toLowerCase() !== owner.toLowerCase()) throw new Error("deployment does not match what was requested; not recording it");
  writeFileSync("src/data/allocator-v1.json", JSON.stringify({ chainId: robinhoodChain.id, address, deployedBlock: receipt.blockNumber.toString(), deployedTransaction: hash }, null, 2) + "\n");
  console.log("src/data/allocator-v1.json updated");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
