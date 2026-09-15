import { NextResponse } from "next/server";
import { findLendingMarket } from "@/lib/registry";
import { getLendingMarkets } from "@/server/lending";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ market: string }> }) {
  const { market } = await ctx.params;
  const pin = findLendingMarket(market);
  if (!pin) return NextResponse.json({ error: "unsupported_market" }, { status: 404 });
  const all = await getLendingMarkets();
  const row = all.data.find((r) => r.pinId === pin.id);
  return row ? NextResponse.json(row) : NextResponse.json({ error: "unsupported_market" }, { status: 404 });
}
