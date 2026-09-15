import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { kyberBuild, type KyberRoute } from "@/server/trade";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { routeSummary?: KyberRoute["routeSummary"]; sender?: string; recipient?: string; slippageBps?: number } | null;
  if (!body?.routeSummary || !body.sender || !isAddress(body.sender) || !body.recipient || !isAddress(body.recipient)) {
    return NextResponse.json({ error: "Invalid build request" }, { status: 400 });
  }
  const slippage = Math.min(5000, Math.max(1, Math.round(Number(body.slippageBps) || 50)));
  try {
    return NextResponse.json({ data: await kyberBuild(body.routeSummary, body.sender, body.recipient, slippage) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The swap could not be prepared." }, { status: 503 });
  }
}
