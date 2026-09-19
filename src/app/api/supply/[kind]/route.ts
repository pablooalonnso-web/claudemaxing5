import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { erc20Abi } from "@/lib/abis";
import { BURN_ADDRESS, publicClient, TOKEN_ADDRESS } from "@/lib/chain";

export const dynamic = "force-dynamic";

/**
 * Plain-text supply endpoints in the format aggregators such as CoinGecko expect:
 *   /api/supply/total        minted supply minus tokens at the burn address
 *   /api/supply/circulating  same figure today: nothing is vested or locked
 *   /api/supply/max          the fixed 1,000,000,000 minted at deployment
 *   /api/supply/burned       tokens held by the burn address
 * Every value is read from the chain on each request; nothing is cached or hand-typed.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const client = publicClient();
  try {
    const [minted, burned] = await Promise.all([
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "totalSupply" }),
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [BURN_ADDRESS] }),
    ]);
    const values: Record<string, bigint> = {
      max: minted,
      burned,
      total: minted - burned,
      circulating: minted - burned,
    };
    const value = values[kind];
    if (value === undefined) return new NextResponse("Unknown supply kind", { status: 404 });
    const text = formatUnits(value, 18).replace(/\.?0+$/, "");
    return new NextResponse(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60" } });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Supply read failed", { status: 503 });
  }
}
