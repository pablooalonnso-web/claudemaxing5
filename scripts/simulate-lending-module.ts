/**
 * The lending module as an allocator target, in eth_simulateV1 against the
 * real META lending market at a block where its oracle was live: deploy the
 * module and an allocator that whitelists it, deposit, allocate, withdraw in
 * kind, redeem directly, and one cooldown later exit through the allocator.
 *
 *   npm run simulate:lending-module -- --block 66715782
 */
import { readFileSync } from "node:fs";
import { formatUnits, pad, parseUnits, toHex, type Abi, type Address, type Hex } from "viem";
import { publicClient, USDG_ADDRESS } from "@/lib/chain";
import { LENDING_MARKETS, MANAGED_VAULTS } from "@/lib/registry";
import { balanceSlot, compileScenario, decodeStage, describeRevert, simulate, stageCall } from "./simulate-lib";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BLOCK = BigInt(opt("--block", "66715782"));
const SCENARIO = "0x00000000000000000000000000000000005ce4a2" as Address;
const TREASURY = "0x000000000000000000000000000000000000dEaD" as Address;

type Result = { module: Address; allocator: Address; a: bigint; b: bigint; c: bigint; d: bigint; note: string };

async function main() {
  const client = publicClient();
  const art = (n: string) => JSON.parse(readFileSync(`src/data/${n}.artifact.json`, "utf8")) as { abi: Abi; bytecode: Hex };
  const allocator = art("allocator-v1");
  const module = art("vertex-lending-module");
  const scenario = compileScenario("LendingModuleScenario.sol", "LendingModuleScenario");
  const pin = LENDING_MARKETS[0];
  const vault = MANAGED_VAULTS.find((m) => m.vault.toLowerCase() === pin.vault.toLowerCase())!;
  const base = await client.getBlock({ blockNumber: BLOCK });
  const t0 = base.timestamp + 10n;
  const params = { moduleCreation: module.bytecode, allocatorCreation: allocator.bytecode, market: pin.market as Address, usdg: USDG_ADDRESS, stock: pin.stock as Address, stockValuation: vault.oracle as Address, treasury: TREASURY, depositAmount: parseUnits("3000", 6), marketTopUp: parseUnits("500", 6), budget: parseUnits("900", 6) };
  const stages = [
    { name: "stage1 · deploy, allocate, withdraw in kind, redeem", at: t0, data: stageCall(scenario.abi, "stage1", [params]) },
    { name: "stage2 · exit through the allocator after the cooldown", at: t0 + 3_610n, data: stageCall(scenario.abi, "stage2") },
  ];
  console.log(`base block ${BLOCK} (${new Date(Number(base.timestamp) * 1000).toISOString()}) · market ${pin.market} (${pin.symbol}) · deposit 3,000 USDG, market top up 500 USDG, allocate 900 USDG`);
  const results = await simulate(client, {
    base: BLOCK,
    scenario: SCENARIO,
    overrides: { [SCENARIO]: { code: scenario.runtime }, [USDG_ADDRESS]: { stateDiff: { [balanceSlot(SCENARIO, 1)]: pad(toHex(10_000n * 10n ** 6n), { size: 32 }) } } },
    stages,
  });
  const abis = [allocator.abi, module.abi, scenario.abi];
  let failed = false;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "0x1") {
      failed = true;
      console.log(`✗ ${r.name}: reverted ${describeRevert(abis, (r.error?.match(/0x[0-9a-f]+/i)?.[0] as Hex | undefined) ?? r.returnData)} · ${r.error ?? ""}`);
      break;
    }
    const d = decodeStage<Result>(scenario.abi, `stage${i + 1}`, r.returnData);
    const ok = !d.note;
    if (!ok) failed = true;
    const usd = (v: bigint) => `${formatUnits(v, 6)} USDG`;
    const detail = [
      () => `module ${d.module} · allocator ${d.allocator} · ${formatUnits(d.a, 12)} module shares for 900 USDG, position valued ${usd(d.b)}, total assets ${usd(d.c)} · half withdrawn in kind and redeemed directly for ${usd(d.d)}`,
      () => `deallocated the rest: expected ${usd(d.b)}, received ${usd(d.a)} · total assets ${usd(d.c)} · price per share ${usd(d.d)}`,
    ][i]();
    console.log(`${ok ? "✓" : "✗"} ${r.name} (${r.gasUsed} gas)${ok ? "" : ` · CHECK FAILED: ${d.note}`}\n    ${detail}`);
    if (!ok) break;
  }
  if (failed) process.exit(1);
  console.log("\nall lending module stages held");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
