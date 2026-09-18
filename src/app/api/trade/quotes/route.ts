import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { NATIVE_ETH } from "@/lib/trade-tokens";
import { collectQuotes } from "@/server/trade";

export const dynamic = "force-dynamic";

const ok = (a: string) => a.toLowerCase() === NATIVE_ETH || isAddress(a);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenIn = url.searchParams.get("tokenIn") ?? "";
  const tokenOut = url.searchParams.get("tokenOut") ?? "";
  const amountIn = url.searchParams.get("amountIn") ?? "";
  if (!ok(tokenIn) || !ok(tokenOut) || !/^\d{1,78}$/.test(amountIn) || BigInt(amountIn) <= 0n) {
    return NextResponse.json({ error: "Invalid quote request" }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await collectQuotes(tokenIn, tokenOut, amountIn) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Quotes are temporarily unavailable." }, { status: 503 });
  }
}
