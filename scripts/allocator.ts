/**
 * Runs the Allocator v0 scoring model from the command line, against the
 * same public data the site uses, and prints the proposal.
 *
 *   npm run allocator -- --amount 1000 --risk balanced
 *   npm run allocator -- --amount 250 --risk conservative --site http://localhost:3000
 *   npm run allocator -- --json
 *
 * Nothing is signed or sent. The model lives in src/lib/allocator.ts.
 */
import { parseUnits } from "viem";
import { describeExclusion, describeReason, propose, RISK_PROFILES, type RiskProfile } from "@/lib/allocator";
import { BRAND } from "@/lib/brand";
import { directoryVaults } from "@/lib/registry";
import type { VaultSnapshotsResponse } from "@/lib/snapshot-types";
import type { LendingMarketsResponse } from "@/server/lending";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const site = opt("--site", BRAND.siteUrl).replace(/\/$/, "");
const amountText = opt("--amount", "1000");
const risk = opt("--risk", "balanced") as RiskProfile;
if (!RISK_PROFILES.includes(risk)) {
  console.error(`--risk must be one of ${RISK_PROFILES.join(", ")}`);
  process.exit(1);
}

async function main() {
  const [vaults, lending] = await Promise.all([
    fetch(`${site}/api/public/vaults`, { headers: { "user-agent": "vertex-allocator" } }).then((r) => r.json() as Promise<VaultSnapshotsResponse>),
    fetch(`${site}/api/lending/v2/markets`, { headers: { "user-agent": "vertex-allocator" } }).then((r) => r.json() as Promise<LendingMarketsResponse>),
  ]);
  const p = propose({ rows: vaults.data, pins: directoryVaults(), lending: lending.data ?? [], profile: risk, amount: parseUnits(amountText, 6) });
  if (args.includes("--json")) {
    console.log(JSON.stringify({ ...p, amount: amountText, positions: p.positions.map((x) => ({ ...x, pin: undefined, market: undefined, amount: (Number(x.amount) / 1e6).toString(), reasons: x.reasons.map(describeReason) })), ranking: p.ranking.map((x) => ({ id: x.id, symbol: x.symbol, kind: x.kind, score: x.score, components: x.components })), excluded: p.excluded.map((x) => ({ ...x, reason: describeExclusion(x.code) })) }, null, 2));
    return;
  }
  console.log(`${BRAND.name} allocator ${p.model} · ${amountText} USDG · ${risk} · ${new Date().toISOString()}`);
  console.log(`weights yield ${p.profile.weights.yield} depth ${p.profile.weights.depth} health ${p.profile.weights.health} stability ${p.profile.weights.stability} · max ${p.profile.maxPositions} positions · max weight ${p.profile.maxWeight * 100}% · lending floor ${p.profile.lendingFloor * 100}%\n`);
  for (const [i, x] of p.positions.entries()) {
    const c = x.components;
    console.log(`${String(i + 1).padStart(2, "0")}  ${x.symbol.padEnd(6)} ${x.kind.padEnd(8)} ${(x.weight * 100).toFixed(1).padStart(5)}%  ${(Number(x.amount) / 1e6).toFixed(2).padStart(10)} USDG  score ${x.score.toFixed(1).padStart(5)}  (yield ${c.yield}, depth ${c.depth}, health ${c.health}, stability ${c.stability})`);
    for (const r of x.reasons) console.log(`      · ${describeReason(r)}`);
  }
  console.log(`\nlending share ${(p.lendingShare * 100).toFixed(1)}%`);
  const rest = p.ranking.filter((c) => !p.positions.some((x) => x.id === c.id));
  if (rest.length) console.log(`\nranked but not picked: ${rest.map((c) => `${c.symbol} ${c.score.toFixed(1)}`).join(", ")}`);
  if (p.excluded.length) console.log(`excluded: ${p.excluded.map((x) => `${x.symbol} (${describeExclusion(x.code)})`).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
