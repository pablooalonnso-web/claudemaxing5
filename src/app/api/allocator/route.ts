import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { describeExclusion, describeReason, propose, RISK_PROFILES, type RiskProfile } from "@/lib/allocator";
import { directoryVaults } from "@/lib/registry";
import { getLendingMarkets } from "@/server/lending";
import { getVaultSnapshots } from "@/server/vault-snapshots";

export const dynamic = "force-dynamic";

/**
 * GET /api/allocator?amount=1000&risk=balanced
 *
 * The same proposal the /allocator page shows, as JSON, from the same chain
 * reads. Amount is in USDG (up to 6 decimals); risk is conservative, balanced
 * or aggressive. Nothing is signed or sent.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const amountText = url.searchParams.get("amount") ?? "1000";
  const risk = (url.searchParams.get("risk") ?? "balanced") as RiskProfile;
  if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(amountText)) return NextResponse.json({ error: "amount must be a USDG amount with up to 6 decimals" }, { status: 400 });
  if (!RISK_PROFILES.includes(risk)) return NextResponse.json({ error: `risk must be one of ${RISK_PROFILES.join(", ")}` }, { status: 400 });
  const amount = parseUnits(amountText, 6);
  if (amount <= 0n) return NextResponse.json({ error: "amount must be above zero" }, { status: 400 });

  const [snapshots, lending] = await Promise.all([getVaultSnapshots(), getLendingMarkets().catch(() => null)]);
  const p = propose({ rows: snapshots.data, pins: directoryVaults(), lending: lending?.data ?? [], profile: risk, amount });
  const block = snapshots.data.reduce((best, r) => (r.snapshot && BigInt(r.snapshot.block) > best ? BigInt(r.snapshot.block) : best), 0n);
  const body = {
    model: p.model,
    generatedAt: new Date().toISOString(),
    block: block ? block.toString() : null,
    profile: { id: p.profile.id, weights: p.profile.weights, maxPositions: p.profile.maxPositions, maxWeight: p.profile.maxWeight, lendingFloor: p.profile.lendingFloor },
    amount: amountText,
    lendingShare: p.lendingShare,
    positions: p.positions.map((x) => ({
      kind: x.kind,
      id: x.id,
      symbol: x.symbol,
      href: x.href,
      weight: x.weight,
      amount: (Number(x.amount) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, ""),
      apr: x.apr,
      tvl: x.tvl,
      score: x.score,
      components: x.components,
      reasons: x.reasons.map(describeReason),
    })),
    ranking: p.ranking.map((x) => ({ kind: x.kind, id: x.id, symbol: x.symbol, score: x.score, components: x.components })),
    excluded: p.excluded.map((x) => ({ kind: x.kind, id: x.id, symbol: x.symbol, reason: describeExclusion(x.code) })),
    source: "https://github.com/pablooalonnso-web/claudemaxing5/blob/main/src/lib/allocator.ts",
  };
  return NextResponse.json(body, { headers: { "cache-control": "public, max-age=10, stale-while-revalidate=30" } });
}
