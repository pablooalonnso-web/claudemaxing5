import type { Address } from "viem";
import { uniswapQuoterV2Abi, uniswapV3FactoryAbi, uniswapV3PoolAbi } from "@/lib/abis";
import { publicClient, USDG_ADDRESS } from "@/lib/chain";
import { MANAGED_VAULTS } from "@/lib/registry";
import { NATIVE_ETH, type TradeQuote } from "@/lib/trade-tokens";

const KYBER = "https://aggregator-api.kyberswap.com/robinhood/api/v1";
const CLIENT_ID = "vertex";

export type KyberRoute = { routeSummary: { amountOut: string; gas: string; gasUsd?: string; amountOutUsd?: string; amountInUsd?: string }; routerAddress: string };

export async function kyberRoute(tokenIn: string, tokenOut: string, amountIn: string): Promise<KyberRoute | null> {
  const params = new URLSearchParams({ tokenIn, tokenOut, amountIn, gasInclude: "true" });
  const res = await fetch(`${KYBER}/routes?${params}`, { headers: { "x-client-id": CLIENT_ID }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { code?: number; data?: KyberRoute };
  return json.code === 0 && json.data?.routeSummary ? json.data : null;
}

export async function kyberBuild(route: KyberRoute["routeSummary"], sender: string, recipient: string, slippageBps: number) {
  const res = await fetch(`${KYBER}/route/build`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client-id": CLIENT_ID },
    body: JSON.stringify({ routeSummary: route, sender, recipient, slippageTolerance: slippageBps, deadline: Math.floor(Date.now() / 1000) + 20 * 60, source: CLIENT_ID }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { code?: number; message?: string; data?: { data: string; routerAddress: string; amountOut: string; amountIn: string; gas: string } } | null;
  if (!res.ok || !json || json.code !== 0 || !json.data) throw new Error(json?.message || "The aggregator could not build this swap.");
  return json.data;
}

/** Direct Uniswap V3 quote through the reviewed vault pools (USDG ↔ Stock Token only). */
export async function poolQuote(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<TradeQuote | null> {
  const quoter = process.env.NEXT_PUBLIC_UNISWAP_QUOTER as Address | undefined;
  if (!quoter) return null;
  const pair = [tokenIn.toLowerCase(), tokenOut.toLowerCase()];
  const entry = MANAGED_VAULTS.filter((m) => m.version === 7).find((m) => pair.includes(m.token0.toLowerCase()) && pair.includes(m.token1.toLowerCase()));
  if (!entry || !pair.includes(USDG_ADDRESS.toLowerCase())) return null;
  const client = publicClient();
  try {
    const factory = await client.readContract({ address: entry.pool as Address, abi: uniswapV3PoolAbi, functionName: "factory" });
    const pool = await client.readContract({ address: factory, abi: uniswapV3FactoryAbi, functionName: "getPool", args: [tokenIn as Address, tokenOut as Address, entry.fee] });
    if (pool === "0x0000000000000000000000000000000000000000") return null;
    const { result } = await client.simulateContract({ address: quoter, abi: uniswapQuoterV2Abi, functionName: "quoteExactInputSingle", args: [{ tokenIn: tokenIn as Address, tokenOut: tokenOut as Address, amountIn, fee: entry.fee, sqrtPriceLimitX96: 0n }] });
    return { providerId: "pool", providerName: "Vault pool", amountOutRaw: result[0].toString(), netAmountOutRaw: result[0].toString(), gasEstimate: result[3].toString(), executable: false, note: "Direct pool price for reference" };
  } catch {
    return null;
  }
}

export async function collectQuotes(tokenIn: string, tokenOut: string, amountIn: string) {
  const [kyber, pool] = await Promise.all([
    kyberRoute(tokenIn, tokenOut, amountIn).catch(() => null),
    tokenIn !== NATIVE_ETH && tokenOut !== NATIVE_ETH ? poolQuote(tokenIn, tokenOut, BigInt(amountIn)) : Promise.resolve(null),
  ]);
  const quotes: TradeQuote[] = [];
  if (kyber) {
    quotes.push({
      providerId: "kyber",
      providerName: "KyberSwap",
      amountOutRaw: kyber.routeSummary.amountOut,
      netAmountOutRaw: kyber.routeSummary.amountOut,
      gasEstimate: kyber.routeSummary.gas,
      executable: true,
      routeSummary: kyber.routeSummary,
      routerAddress: kyber.routerAddress,
    });
  }
  if (pool) quotes.push(pool);
  quotes.sort((a, b) => (BigInt(b.netAmountOutRaw) > BigInt(a.netAmountOutRaw) ? 1 : -1));
  return { tokenIn, tokenOut, amountIn, quotes, quotedAt: Date.now() };
}
