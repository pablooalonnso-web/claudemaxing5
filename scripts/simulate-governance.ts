/**
 * Governance end to end in eth_simulateV1: deploy staking, governor, fee
 * splitter and a fresh allocator; hand the allocator to governance through
 * its own timelock; stake, propose, vote, execute, finalize; watch the fee
 * split reach stakers; unstake through the cooldown. Six simulated blocks,
 * the clock moved forward between them. Nothing is sent.
 *
 *   npm run simulate:governance
 */
import { readFileSync } from "node:fs";
import { formatUnits, pad, toHex, type Abi, type Address, type Hex } from "viem";
import { publicClient, TOKEN_ADDRESS, USDG_ADDRESS } from "@/lib/chain";
import { balanceSlot, compileScenario, decodeStage, describeRevert, simulate, stageCall } from "./simulate-lib";

const SCENARIO = "0x00000000000000000000000000000000005ce4a1" as Address;
const BUYBACK = "0x9b46347B947b0Be2ee450425D0278Fe02BEB2080" as Address;
const DAY = 86_400n;

type Result = { allocator: Address; staking: Address; governor: Address; splitter: Address; a: bigint; b: bigint; c: bigint; d: bigint; note: string };

async function main() {
  const client = publicClient();
  const art = (n: string) => JSON.parse(readFileSync(`src/data/${n}.artifact.json`, "utf8")) as { abi: Abi; bytecode: Hex };
  const allocator = art("allocator-v1");
  const staking = art("vertex-staking");
  const governor = art("vertex-governor");
  const splitter = art("vertex-fee-splitter");
  const scenario = compileScenario("GovernanceScenario.sol", "GovernanceScenario");
  const head = await client.getBlock();
  const t0 = head.timestamp + 10n;
  const params = { allocatorCreation: allocator.bytecode, stakingCreation: staking.bytecode, governorCreation: governor.bytecode, splitterCreation: splitter.bytecode, vertex: TOKEN_ADDRESS, usdg: USDG_ADDRESS, buyback: BUYBACK };
  const stages = [
    { name: "stage1 · deploy, hand over queued, stake", at: t0, data: stageCall(scenario.abi, "stage1", [params]) },
    { name: "stage2 · hand over executed, proposals", at: t0 + DAY + 1n, data: stageCall(scenario.abi, "stage2") },
    { name: "stage3 · vote", at: t0 + 2n * DAY + 2n, data: stageCall(scenario.abi, "stage3") },
    { name: "stage4 · execute, fee split, unstake", at: t0 + 5n * DAY + 3n, data: stageCall(scenario.abi, "stage4") },
    { name: "stage5 · finalize, veto", at: t0 + 6n * DAY + 4n, data: stageCall(scenario.abi, "stage5") },
    { name: "stage6 · cooldown over", at: t0 + 13n * DAY + 5n, data: stageCall(scenario.abi, "stage6") },
  ];
  console.log(`base block ${head.number} (${new Date(Number(head.timestamp) * 1000).toISOString()}) · scenario ${SCENARIO} · 2,000,000 VERTEX and 10,000 USDG injected`);
  const results = await simulate(client, {
    base: "latest",
    scenario: SCENARIO,
    overrides: {
      [SCENARIO]: { code: scenario.runtime },
      [TOKEN_ADDRESS]: { stateDiff: { [balanceSlot(SCENARIO, 0)]: pad(toHex(2_000_000n * 10n ** 18n), { size: 32 }) } },
      [USDG_ADDRESS]: { stateDiff: { [balanceSlot(SCENARIO, 1)]: pad(toHex(10_000n * 10n ** 6n), { size: 32 }) } },
    },
    stages,
  });
  let failed = false;
  const abis = [allocator.abi, staking.abi, governor.abi, splitter.abi, scenario.abi];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "0x1") {
      failed = true;
      console.log(`✗ ${r.name}: reverted ${describeRevert(abis, (r.error?.match(/0x[0-9a-f]+/i)?.[0] as Hex | undefined) ?? r.returnData)} · ${r.error ?? ""}`);
      break;
    }
    const d = decodeStage<Result>(scenario.abi, stages[i].data.slice(0, 10) === stageCall(scenario.abi, "stage1", [params]).slice(0, 10) ? "stage1" : `stage${i + 1}`, r.returnData);
    const ok = !d.note;
    if (!ok) failed = true;
    const usd = (v: bigint) => `${formatUnits(v, 6)} USDG`;
    const vtx = (v: bigint) => `${formatUnits(v, 18)} VERTEX`;
    const detail = [
      () => `allocator ${d.allocator} · staking ${d.staking} · governor ${d.governor} · splitter ${d.splitter} · votes ${vtx(d.a)}`,
      () => `allocator owner is the governor, treasury is the splitter · proposals #${d.a} (cap via timelock) and #${d.b} (split, direct) · ${d.c} total`,
      () => `voted ${vtx(d.a)} for the cap change and ${vtx(d.b)} for the split · quorum ${vtx(d.c)}`,
      () => `cap change queued in the allocator · split now 50/30/20 · 3 USDG fee split: 1.5 buyback, 0.9 stakers, 0.6 treasury · earned ${usd(d.b)} claimed ${usd(d.c)} · 400,000 VERTEX unstaking · allocator assets ${usd(d.d)}`,
      () => `finalized after the review window: cap ${usd(d.a)} · guardian vetoed proposal #${d.b}`,
      () => `withdrew ${vtx(d.a)} after the cooldown · votes now ${vtx(d.b)} of ${vtx(d.c)}`,
    ][i]();
    console.log(`${ok ? "✓" : "✗"} ${r.name} (${r.gasUsed} gas)${ok ? "" : ` · CHECK FAILED: ${d.note}`}\n    ${detail}`);
    if (!ok) break;
  }
  if (failed) process.exit(1);
  console.log("\nall governance stages held");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
