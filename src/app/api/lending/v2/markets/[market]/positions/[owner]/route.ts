import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { findLendingMarket } from "@/lib/registry";
import { getLendingPosition } from "@/server/lending";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ market: string; owner: string }> }) {
  const { market, owner } = await ctx.params;
  const pin = findLendingMarket(market);
  if (!pin) return NextResponse.json({ error: "unsupported_market" }, { status: 404 });
  if (!isAddress(owner)) return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
  try {
    return NextResponse.json(await getLendingPosition(pin, getAddress(owner)), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "position_unavailable", message: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
